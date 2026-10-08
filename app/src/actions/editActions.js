// Editing actions on the active file: undo/redo, clipboard (copy/cut/paste/delete), select all,
// volume, fades and noise reduction. Every buffer change goes through `commitEdit` so it is
// recorded in the file's undo history.
import { getSelectionRange, useEditorStore } from '../store/editorStore.js';
import {
  extractRange,
  deleteRange,
  applyGain,
  applyFadeIn,
  applyFadeOut,
  resample,
  toMono,
  toStereo,
  insertBuffer,
} from '../audio/bufferOps.js';
import { FFT_SIZE, captureNoiseProfile, applyNoiseReduction } from '../audio/noiseReduction.js';
import { formatDb, gainToDb } from '../utils/format.js';
import { createProgressReporter } from './progress.js';
import { runWithProcessing } from './runWithProcessing.js';

// Pushes `buffer` onto the undo history and makes it the active file's audio.
export function commitEdit(buffer) {
  const state = useEditorStore.getState();
  state.pushHistory(buffer);
  state.setAudioBuffer(buffer);
}

export function undo() {
  const state = useEditorStore.getState();
  state.undo();
  state.log('Undo');
}

export function redo() {
  const state = useEditorStore.getState();
  state.redo();
  state.log('Redo');
}

// Copies `range` of the active file's audio into the store clipboard (no logging).
function copyRangeToClipboard(activeFile, range) {
  const buffer = extractRange(activeFile.audioBuffer, range.start, range.end);
  useEditorStore.getState().setClipboard({
    buffer,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
  });
}

export function copySelection() {
  const state = useEditorStore.getState();
  const activeFile = state.getActiveFile();
  const range = getSelectionRange(activeFile);
  if (!range) return;
  copyRangeToClipboard(activeFile, range);
  state.log(`Copied ${(range.end - range.start).toFixed(2)}s`);
}

export function cutSelection() {
  const state = useEditorStore.getState();
  const activeFile = state.getActiveFile();
  const range = getSelectionRange(activeFile);
  if (!range) return;
  copyRangeToClipboard(activeFile, range);
  commitEdit(deleteRange(activeFile.audioBuffer, range.start, range.end));
  state.setSelection(null, null);
  state.log(`Cut ${(range.end - range.start).toFixed(2)}s`);
}

// Inserts the clipboard at the selection start (or playhead), converting its sample rate and
// channel layout to match the target file first, then selects the pasted range.
export async function pasteClipboard() {
  const state = useEditorStore.getState();
  const activeFile = state.getActiveFile();
  if (!activeFile || !state.clipboard) return;
  await runWithProcessing('Pasting...', async () => {
    let clip = state.clipboard.buffer;
    if (clip.sampleRate !== activeFile.audioBuffer.sampleRate)
      clip = await resample(clip, activeFile.audioBuffer.sampleRate, 'high');
    const targetChannels = activeFile.audioBuffer.numberOfChannels;
    if (clip.numberOfChannels !== targetChannels) {
      if (targetChannels === 1 && clip.numberOfChannels > 1) clip = toMono(clip);
      else if (targetChannels === 2 && clip.numberOfChannels === 1) clip = toStereo(clip);
    }
    const insertAt = getSelectionRange(activeFile)?.start ?? activeFile.currentTime;
    commitEdit(insertBuffer(activeFile.audioBuffer, clip, insertAt));
    const pastedDuration = clip.length / activeFile.audioBuffer.sampleRate;
    useEditorStore.getState().setSelection(insertAt, insertAt + pastedDuration);
    useEditorStore
      .getState()
      .log(`Pasted ${pastedDuration.toFixed(2)}s at ${insertAt.toFixed(2)}s`);
  });
}

export function deleteSelection() {
  const state = useEditorStore.getState();
  const activeFile = state.getActiveFile();
  const range = getSelectionRange(activeFile);
  if (!range) return;
  state.log(`Deleted ${(range.end - range.start).toFixed(2)}s`);
  commitEdit(deleteRange(activeFile.audioBuffer, range.start, range.end));
  state.setSelection(null, null);
}

export function selectAll() {
  const state = useEditorStore.getState();
  const activeFile = state.getActiveFile();
  if (activeFile) state.setSelection(0, activeFile.audioBuffer.duration);
}

// Applies a linear gain factor to the selection (when `selectionOnly` and a selection exists)
// or to the whole file.
export function adjustVolume(gain, selectionOnly) {
  const activeFile = useEditorStore.getState().getActiveFile();
  if (!activeFile) return;
  const range = selectionOnly ? getSelectionRange(activeFile) : null;
  commitEdit(applyGain(activeFile.audioBuffer, gain, range?.start, range?.end));
  useEditorStore.getState().log(`Volume ${formatDb(gainToDb(gain))}${range ? ' (selection)' : ''}`);
}

// Fade-in of `duration` seconds starting at the selection start (or the file start).
export function fadeIn(duration) {
  const activeFile = useEditorStore.getState().getActiveFile();
  if (!activeFile) return;
  const range = getSelectionRange(activeFile);
  commitEdit(applyFadeIn(activeFile.audioBuffer, duration, range?.start));
  useEditorStore.getState().log(`Fade in (${duration})`);
}

// Fade-out of `duration` seconds ending at the selection end (or the file end).
export function fadeOut(duration) {
  const activeFile = useEditorStore.getState().getActiveFile();
  if (!activeFile) return;
  const range = getSelectionRange(activeFile);
  commitEdit(applyFadeOut(activeFile.audioBuffer, duration, range?.end));
  useEditorStore.getState().log(`Fade out (${duration})`);
}

// Stores the spectrum of the selected (noise-only) audio as the file's noise profile. The
// selection must span at least one FFT frame.
export function captureNoiseProfileFromSelection() {
  const state = useEditorStore.getState();
  const activeFile = state.getActiveFile();
  const range = getSelectionRange(activeFile);
  if (!range) return;
  const sampleRate = activeFile.audioBuffer.sampleRate;
  if ((range.end - range.start) * sampleRate < FFT_SIZE) {
    state.log(
      'Noise selection too short',
      'error',
      `Select at least ${Math.ceil((FFT_SIZE / sampleRate) * 1000)} ms of noise-only audio to capture a profile`,
    );
    return;
  }
  state.setNoiseProfile(captureNoiseProfile(activeFile.audioBuffer, range.start, range.end));
  state.log(`Noise profile captured (${(range.end - range.start).toFixed(2)}s)`);
}

// Spectral noise reduction using the captured profile, limited to the selection when present.
export async function applyNoiseReductionWithStrength(strength) {
  await runWithProcessing('Applying noise reduction...', async () => {
    const activeFile = useEditorStore.getState().getActiveFile();
    if (!activeFile || !activeFile.noiseProfile) return;
    const range = getSelectionRange(activeFile);
    let result;
    try {
      result = await applyNoiseReduction(
        activeFile.audioBuffer,
        activeFile.noiseProfile,
        strength,
        range?.start,
        range?.end,
        createProgressReporter('Applying noise reduction...'),
      );
    } catch (error) {
      useEditorStore
        .getState()
        .log('Noise reduction failed', 'error', `Noise reduction failed: ${error.message}`);
      return;
    }
    // The task yields while it runs; only commit if the same audio is still being edited.
    const current = useEditorStore.getState().getActiveFile();
    if (current?.id !== activeFile.id || current.audioBuffer !== activeFile.audioBuffer) {
      useEditorStore
        .getState()
        .log('Noise reduction discarded', 'error', 'The audio changed while noise reduction ran');
      return;
    }
    commitEdit(result);
    useEditorStore.getState().log(`Noise reduction applied (strength: ${strength})`);
  });
}
