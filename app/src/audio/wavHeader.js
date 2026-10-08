// Minimal RIFF/WAVE parser: reads channel count, sample rate and bit depth from the `fmt ` chunk.

const RIFF_ID = 0x52494646; // 'RIFF'
const WAVE_ID = 0x57415645; // 'WAVE'
const FMT_ID = 0x666d7420; // 'fmt '

// Returns `{ ch, rate, bits }` for a WAV file, or null if `view` is not a (readable) WAV.
export function readWavFormat(view) {
  try {
    if (
      view.byteLength < 12 ||
      view.getUint32(0, false) !== RIFF_ID ||
      view.getUint32(8, false) !== WAVE_ID
    )
      return null;
    for (let offset = 12; offset + 8 <= view.byteLength; ) {
      const chunkId = view.getUint32(offset, false);
      const chunkSize = view.getUint32(offset + 4, true);
      if (chunkId === FMT_ID)
        return {
          ch: view.getUint16(offset + 10, true),
          rate: view.getUint32(offset + 12, true),
          bits: view.getUint16(offset + 22, true),
        };
      // Chunks are word-aligned: odd-sized chunks are followed by one pad byte.
      offset += 8 + chunkSize + (chunkSize & 1);
    }
  } catch {
    // Truncated header (DataView RangeError) — treat as unknown format.
  }
  return null;
}
