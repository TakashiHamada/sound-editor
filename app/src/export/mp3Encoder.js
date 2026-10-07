// Encodes an AudioBuffer to CBR MP3 with lamejs, yielding to the UI and reporting progress
// through the store's processing message.
import { Mp3Encoder } from '../vendor/lamejs.js';
import { useEditorStore } from '../store/editorStore.js';

export async function encodeMp3(buffer, kbps, options) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const encoder = new Mp3Encoder(Math.min(numChannels, 2), sampleRate, kbps, options);
  const chunks = [];
  const FRAME_SAMPLES = 1152; // input chunk size: one MPEG-1 Layer III frame
  const toInt16 = (samples) => {
    const pcm = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      pcm[i] = Math.floor(clamped < 0 ? clamped * 32768 : clamped * 32767);
    }
    return pcm;
  };
  const left = toInt16(buffer.getChannelData(0));
  const right = numChannels > 1 ? toInt16(buffer.getChannelData(1)) : null;
  const totalFrames = Math.max(1, Math.ceil(length / FRAME_SAMPLES));
  let doneFrames = 0;
  let lastYield = performance.now();
  for (let start = 0; start < length; start += FRAME_SAMPLES) {
    const end = Math.min(start + FRAME_SAMPLES, length);
    const leftChunk = left.subarray(start, end);
    let encoded;
    if (right) {
      const rightChunk = right.subarray(start, end);
      encoded = encoder.encodeBuffer(leftChunk, rightChunk);
    } else encoded = encoder.encodeBuffer(leftChunk);
    if (encoded.length > 0) chunks.push(encoded);
    doneFrames++;
    if (performance.now() - lastYield > 30) {
      const percent = Math.round((doneFrames / totalFrames) * 100);
      const filledBlocks = Math.round(percent / 5);
      useEditorStore
        .getState()
        .setProcessing(
          'Encoding MP3... ' +
            '█'.repeat(filledBlocks) +
            '░'.repeat(20 - filledBlocks) +
            ' ' +
            percent +
            '%',
        );
      await new Promise((resolve) => setTimeout(resolve));
      lastYield = performance.now();
    }
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(tail);
  // Copy each chunk's exact byte range (encoder output may be a view into a larger buffer).
  return new Blob(
    chunks.map((chunk) => new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength).slice()),
    { type: 'audio/mp3' },
  );
}
