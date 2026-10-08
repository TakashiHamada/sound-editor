// Export pipeline: converts the active file's buffer to the configured sample rate / channel
// layout, encodes it as WAV or MP3, downloads it and logs the result.
import { useEditorStore } from '../store/editorStore.js';
import { resample, toMono, toStereo } from '../audio/bufferOps.js';
import { normalizeExportConfig } from './exportConfig.js';
import { encodeWav } from './wavEncoder.js';
import { encodeMp3 } from './mp3Encoder.js';
import { downloadBlob } from './download.js';
import { createProgressReporter } from '../actions/progress.js';

// lame MPEG channel modes.
const MPEG_MODE_STEREO = 0;
const MPEG_MODE_JOINT_STEREO = 1;
const MPEG_MODE_MONO = 3;

function mpegMode(channelCount, mp3Mode) {
  if (channelCount === 1) return MPEG_MODE_MONO;
  return mp3Mode === 'stereo' ? MPEG_MODE_STEREO : MPEG_MODE_JOINT_STEREO;
}

// "song.wav" -> "song"; names without an extension (or starting with ".") stay as they are.
function stripExtension(fileName) {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.substring(0, dot) : fileName;
}

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
  const baseName = stripExtension(activeFile.fileName);
  let blob;
  let extension;
  if (isMp3) {
    blob = await encodeMp3(
      buffer,
      config.bitrate,
      {
        mode: mpegMode(buffer.numberOfChannels, config.mp3Mode),
        lowpass: config.lowpass > 0 ? config.lowpass : 0,
        quality: 2,
      },
      createProgressReporter('Encoding MP3...'),
    );
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
      `Exported "${outputName}" — ${extension.toUpperCase()}, ${buffer.sampleRate} Hz, ${buffer.numberOfChannels === 1 ? 'mono' : 'stereo'}, ${isMp3 ? `${config.bitrate} kbps` : `${config.bitDepth}-bit`}, ${(blob.size / 1024).toFixed(0)} KB`,
    );
}
