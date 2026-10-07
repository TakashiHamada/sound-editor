// File-level actions: decoding and opening dropped/picked files, closing one or all files.
import { useEditorStore } from '../store/editorStore.js';
import { decodeAudioFile } from '../audio/decode.js';
import { readWavFormat } from '../audio/wavHeader.js';
import { stopPlayback } from '../audio/playback.js';
import { runWithProcessing } from './runWithProcessing.js';

// Decodes each file and adds it to the store. For WAV sources the original bit depth, sample
// rate and channel count are read from the header and stashed on the AudioBuffer so the export
// defaults can match the source.
export async function loadFiles(files) {
  await runWithProcessing('Loading audio...', async () => {
    const state = useEditorStore.getState();
    for (const file of files)
      try {
        const audioBuffer = await decodeAudioFile(file);
        const fileSize = file.size;
        try {
          const bytes = await file.arrayBuffer();
          const wavFormat = readWavFormat(new DataView(bytes));
          if (wavFormat) {
            const bitDepth = wavFormat.bits;
            if ([8, 16, 24, 32].includes(bitDepth)) audioBuffer._originalBitDepth = bitDepth;
            const sampleRate = wavFormat.rate;
            // Sanity bounds: ignore implausible header values.
            if (sampleRate > 0 && sampleRate <= 384000)
              audioBuffer._originalSampleRate = sampleRate;
            const channelCount = wavFormat.ch;
            if (channelCount > 0 && channelCount <= 64)
              audioBuffer._originalChannels = channelCount;
            audioBuffer._originalFileSize = fileSize;
          }
        } catch {
          // Not a readable WAV header: keep the decoder's values.
        }
        if (state.addFile(audioBuffer, file.name) === null) {
          state.log(
            'Load failed',
            'error',
            `Cannot open "${file.name}": at most ${state.maxFiles} files can be open at once`,
          );
          continue;
        }
        state.log(
          `Loaded "${file.name}"`,
          'info',
          `Loaded "${file.name}" — ${audioBuffer._originalSampleRate ?? audioBuffer.sampleRate} Hz, ${(audioBuffer._originalChannels ?? audioBuffer.numberOfChannels) === 1 ? 'mono' : 'stereo'}, ${audioBuffer.duration.toFixed(1)}s, ${audioBuffer._originalBitDepth ? audioBuffer._originalBitDepth + 'bit' : '32-bit float'}`,
        );
      } catch (error) {
        state.log('Load failed', 'error', `Failed to load "${file.name}": ${error.message}`);
      }
  });
}

export function closeFile(id) {
  stopPlayback();
  const state = useEditorStore.getState();
  const file = state.files.get(id);
  state.setPlaying(false);
  state.removeFile(id);
  state.log(`Closed "${file?.fileName ?? 'file'}"`);
}

export function closeAllFiles() {
  stopPlayback();
  const state = useEditorStore.getState();
  state.setPlaying(false);
  const fileCount = state.files.size;
  state.clearAllFiles();
  state.log(`Closed all files (${fileCount})`);
}
