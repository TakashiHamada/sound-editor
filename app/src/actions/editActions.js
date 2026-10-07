// Editing actions on the active file: undo/redo, clipboard (copy/cut/paste/delete), select all,
// volume, fades and noise reduction. Every buffer change goes through `commitEdit` so it is
// recorded in the file's undo history.
import { useEditorStore } from '../store/editorStore.js';
import {
  extractRange,
  deleteRange,
  applyGain,
  applyFadeIn,
  applyFadeOut,
  resample,
  toMono,
  insertBuffer,
  monoToStereo,
} from '../audio/bufferOps.js';
import { FFT_SIZE, captureNoiseProfile, applyNoiseReduction } from '../audio/noiseReduction.js';
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

// Copies the selected range of the active file into the store clipboard (no logging).
function copySelectionToClipboard() {
  const state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  if (!activeFile || activeFile.selectionStart === null || activeFile.selectionEnd === null) return;
  const buffer = extractRange(
    activeFile.audioBuffer,
    activeFile.selectionStart,
    activeFile.selectionEnd,
  );
  state.setClipboard({
    buffer,
    sampleRate: buffer.sampleRate,
    numberOfChannels: buffer.numberOfChannels,
  });
}

export function copySelection() {
  const state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  copySelectionToClipboard();
  if (activeFile && activeFile.selectionStart !== null && activeFile.selectionEnd !== null)
    state.log(`Copied ${(activeFile.selectionEnd - activeFile.selectionStart).toFixed(2)}s`);
}

export function cutSelection() {
  const state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  if (!activeFile || activeFile.selectionStart === null || activeFile.selectionEnd === null) return;
  copySelectionToClipboard();
  commitEdit(
    deleteRange(activeFile.audioBuffer, activeFile.selectionStart, activeFile.selectionEnd),
  );
  state.setSelection(null, null);
  state.log(`Cut ${(activeFile.selectionEnd - activeFile.selectionStart).toFixed(2)}s`);
}

// Inserts the clipboard at the selection start (or playhead), converting its sample rate and
// channel layout to match the target file first, then selects the pasted range.
export async function pasteClipboard() {
  const state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  if (!activeFile || !state.clipboard) return;
  await runWithProcessing('Pasting...', async () => {
    let clip = state.clipboard.buffer;
    if (clip.sampleRate !== activeFile.audioBuffer.sampleRate)
      clip = await resample(clip, activeFile.audioBuffer.sampleRate, 'high');
    const targetChannels = activeFile.audioBuffer.numberOfChannels;
    if (clip.numberOfChannels !== targetChannels) {
      if (targetChannels === 1 && clip.numberOfChannels > 1) clip = toMono(clip);
      else if (targetChannels === 2 && clip.numberOfChannels === 1) clip = monoToStereo(clip);
    }
    const insertAt = activeFile.selectionStart ?? activeFile.currentTime;
    commitEdit(insertBuffer(activeFile.audioBuffer, clip, insertAt));
    const pastedDuration = clip.length / activeFile.audioBuffer.sampleRate;
    useEditorStore.getState().setSelection(insertAt, insertAt + pastedDuration);
    useEditorStore
      .getState()
      .log(`Pasted ${pastedDuration.toFixed(2)}s at ${insertAt.toFixed(2)}s`);
  });
}

export function deleteSelection() {
  const state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  if (!activeFile || activeFile.selectionStart === null || activeFile.selectionEnd === null) return;
  state.log(`Deleted ${(activeFile.selectionEnd - activeFile.selectionStart).toFixed(2)}s`);
  commitEdit(
    deleteRange(activeFile.audioBuffer, activeFile.selectionStart, activeFile.selectionEnd),
  );
  state.setSelection(null, null);
}

export function selectAll() {
  const state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  if (activeFile) state.setSelection(0, activeFile.audioBuffer.duration);
}

// Applies a linear gain factor to the selection (when `selectionOnly` and a selection exists)
// or to the whole file.
// NOTE: EffectsPanel passes a linear gain (10 ** (dB / 20)), not dB, yet the log message below
// prints that factor with a " dB" suffix and a sign derived from it (always "+", since the gain
// is positive). Also, " (selection)" is logged whenever `selectionOnly` is set, even when there
// is no selection and the whole file was changed. Kept as in the original bundle.
export function adjustVolume(gain, selectionOnly) {
  const activeFile = useEditorStore.getState().getActiveFile();
  if (activeFile) {
    commitEdit(
      selectionOnly && activeFile.selectionStart !== null && activeFile.selectionEnd !== null
        ? applyGain(
            activeFile.audioBuffer,
            gain,
            activeFile.selectionStart,
            activeFile.selectionEnd,
          )
        : applyGain(activeFile.audioBuffer, gain),
    );
    useEditorStore
      .getState()
      .log(
        `Volume ${gain > 0 ? '+' : '-'}${Math.abs(gain).toFixed(1)} dB${selectionOnly ? ' (selection)' : ''}`,
      );
  }
}

// Fade-in of `duration` seconds starting at the selection start (or the file start).
export function fadeIn(duration) {
  const activeFile = useEditorStore.getState().getActiveFile();
  if (activeFile) {
    commitEdit(
      applyFadeIn(activeFile.audioBuffer, duration, activeFile.selectionStart ?? undefined),
    );
    useEditorStore.getState().log(`Fade in (${duration})`);
  }
}

// Fade-out of `duration` seconds ending at the selection end (or the file end).
export function fadeOut(duration) {
  const activeFile = useEditorStore.getState().getActiveFile();
  if (activeFile) {
    commitEdit(
      applyFadeOut(activeFile.audioBuffer, duration, activeFile.selectionEnd ?? undefined),
    );
    useEditorStore.getState().log(`Fade out (${duration})`);
  }
}

// Stores the spectrum of the selected (noise-only) audio as the file's noise profile. The
// selection must span at least one FFT frame.
export function captureNoiseProfileFromSelection() {
  const state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  if (!activeFile || activeFile.selectionStart === null || activeFile.selectionEnd === null) return;
  if (
    Math.abs(activeFile.selectionEnd - activeFile.selectionStart) *
      activeFile.audioBuffer.sampleRate <
    FFT_SIZE
  ) {
    state.log(
      'Noise selection too short',
      'error',
      `Select at least ${Math.ceil((FFT_SIZE / activeFile.audioBuffer.sampleRate) * 1000)} ms of noise-only audio to capture a profile`,
    );
    return;
  }
  const profile = captureNoiseProfile(
    activeFile.audioBuffer,
    activeFile.selectionStart,
    activeFile.selectionEnd,
  );
  state.setNoiseProfile(profile);
  state.log(
    `Noise profile captured (${(activeFile.selectionEnd - activeFile.selectionStart).toFixed(2)}s)`,
  );
}

// Spectral noise reduction using the captured profile, limited to the selection when present.
export async function applyNoiseReductionWithStrength(strength) {
  await runWithProcessing('Applying noise reduction...', async () => {
    const activeFile = useEditorStore.getState().getActiveFile();
    if (!activeFile || !activeFile.noiseProfile) return;
    commitEdit(
      await applyNoiseReduction(
        activeFile.audioBuffer,
        activeFile.noiseProfile,
        strength,
        activeFile.selectionStart ?? undefined,
        activeFile.selectionEnd ?? undefined,
      ),
    );
    useEditorStore.getState().log(`Noise reduction applied (strength: ${strength})`);
  });
}
