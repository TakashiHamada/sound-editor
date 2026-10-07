// Export pipeline: converts the active file's buffer to the configured sample rate / channel
// layout, encodes it as WAV or MP3, downloads it and logs the result.
import { useEditorStore } from '../store/editorStore.js';
import { resample, toMono, toStereo } from '../audio/bufferOps.js';
import { normalizeExportConfig } from './exportConfig.js';
import { encodeWav } from './wavEncoder.js';
import { encodeMp3 } from './mp3Encoder.js';
import { downloadBlob } from './download.js';

export async function exportActiveFile(config) {
  const activeFile = useEditorStore.getState().getActiveFile();
  if (!activeFile) return;
  config = normalizeExportConfig(config);
  let buffer = activeFile.audioBuffer;
  const isMp3 = config.format === 'mp3';
  if (config.sampleRate !== buffer.sampleRate)
    buffer = await resample(buffer, config.sampleRate, config.srcQuality);
  // MP3 keeps a mono source mono even when "stereo" is selected; WAV upmixes it.
  if (config.channels === 'mono' && buffer.numberOfChannels > 1) buffer = toMono(buffer);
  else if (
    config.channels === 'stereo' &&
    (buffer.numberOfChannels > 2 || (!isMp3 && buffer.numberOfChannels === 1))
  )
    buffer = toStereo(buffer);
  const baseName =
    activeFile.fileName.lastIndexOf('.') > 0
      ? activeFile.fileName.substring(0, activeFile.fileName.lastIndexOf('.'))
      : activeFile.fileName;
  let blob;
  let extension;
  if (isMp3) {
    blob = await encodeMp3(buffer, config.bitrate, {
      // lame MPEG modes: 0 = stereo, 1 = joint stereo, 3 = mono
      mode: buffer.numberOfChannels === 1 ? 3 : config.mp3Mode === 'stereo' ? 0 : 1,
      lowpass: config.lowpass > 0 ? config.lowpass : 0,
      quality: 2,
    });
    extension = 'mp3';
  } else {
    blob = encodeWav(buffer, config.bitDepth);
    extension = 'wav';
  }
  const outputName = `${baseName}.${extension}`;
  downloadBlob(blob, outputName);
  useEditorStore
    .getState()
    .log(
      `Exported "${outputName}"`,
      'info',
      `Exported "${outputName}" — ${extension.toUpperCase()}, ${buffer.sampleRate} Hz, ${buffer.numberOfChannels === 1 ? 'mono' : 'stereo'}, ${isMp3 ? config.bitrate + ' kbps' : config.bitDepth + '-bit'}, ${(blob.size / 1024).toFixed(0)} KB`,
    );
}
