// Encodes an AudioBuffer as a RIFF/WAVE file (8/16/24-bit PCM or 32-bit IEEE float).
import { normalizeWavBitDepth } from './exportConfig.js';

export function encodeWav(buffer, bitDepth) {
  bitDepth = normalizeWavBitDepth(bitDepth);
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = bitDepth / 8;
  const dataSize = length * numChannels * bytesPerSample;
  const fileSize = 44 + dataSize;
  // RIFF sizes are unsigned 32-bit.
  if (fileSize > 4294967295)
    throw new Error(
      'WAV output would exceed the 4 GB format limit. Lower the sample rate / bit depth or export as MP3.',
    );
  const arrayBuffer = new ArrayBuffer(fileSize);
  const view = new DataView(arrayBuffer);
  // 44-byte canonical header.
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, bitDepth === 32 ? 3 : 1, true); // 3 = IEEE float, 1 = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  const channelData = [];
  for (let channel = 0; channel < numChannels; channel++)
    channelData.push(buffer.getChannelData(channel));
  // Interleaved samples.
  let offset = 44;
  for (let i = 0; i < length; i++)
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = channelData[channel][i];
      if (bitDepth === 8) {
        // 8-bit WAV is unsigned with a +128 bias.
        const clamped = Math.max(-1, Math.min(1, sample));
        view.setUint8(offset, Math.floor(clamped < 0 ? clamped * 128 : clamped * 127) + 128);
      } else if (bitDepth === 16) {
        const clamped = Math.max(-1, Math.min(1, sample));
        const value = Math.floor(clamped < 0 ? clamped * 32768 : clamped * 32767);
        view.setInt16(offset, value, true);
      } else if (bitDepth === 24) {
        const clamped = Math.max(-1, Math.min(1, sample));
        const value = Math.floor(clamped < 0 ? clamped * 8388608 : clamped * 8388607);
        // Little-endian 3-byte two's complement.
        view.setUint8(offset, value & 255);
        view.setUint8(offset + 1, (value >> 8) & 255);
        view.setUint8(offset + 2, (value >> 16) & 255);
      } else view.setFloat32(offset, sample, true);
      offset += bytesPerSample;
    }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}
