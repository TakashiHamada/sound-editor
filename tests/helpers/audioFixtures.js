// Test-only helpers: synthesize audio fixtures and inspect exported files.
// Fixtures are generated on the fly so the repo carries no binary test data.

/**
 * Build a PCM WAV file containing a sine tone.
 * @param {{bits?: 8|16|24|32, channels?: number, sampleRate?: number, seconds?: number, float?: boolean, extraChunk?: boolean}} opts
 * @returns {Buffer}
 */
export function makeWav({
  bits = 16,
  channels = 2,
  sampleRate = 44100,
  seconds = 1,
  float = false,
  extraChunk = false,
} = {}) {
  const frames = Math.round(sampleRate * seconds);
  const bytesPerSample = bits / 8;
  const dataSize = frames * channels * bytesPerSample;
  // Optional LIST chunk before `fmt ` — real-world files do this and the loader must cope.
  const extra = extraChunk
    ? Buffer.concat([Buffer.from('LIST'), u32(4), Buffer.from('INFO')])
    : Buffer.alloc(0);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + extra.length + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(float ? 3 : 1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  header.writeUInt16LE(channels * bytesPerSample, 32);
  header.writeUInt16LE(bits, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  const data = Buffer.alloc(dataSize);
  let offset = 0;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const v = 0.5 * Math.sin((2 * Math.PI * (440 + 110 * c) * i) / sampleRate);
      if (bits === 8) data.writeUInt8(Math.round(128 + v * 127), offset);
      else if (bits === 16) data.writeInt16LE(Math.round(v * 32767), offset);
      else if (bits === 24) data.writeIntLE(Math.round(v * 8388607), offset, 3);
      else if (float) data.writeFloatLE(v, offset);
      else data.writeInt32LE(Math.round(v * 2147483647), offset);
      offset += bytesPerSample;
    }
  }
  const fmtAndData = header.subarray(12);
  return Buffer.concat([header.subarray(0, 12), extra, fmtAndData, data]);
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
}

/** Parse the canonical 44-byte header the app writes. */
export function parseWavHeader(buf) {
  return {
    riff: buf.toString('ascii', 0, 4),
    wave: buf.toString('ascii', 8, 12),
    format: buf.readUInt16LE(20),
    channels: buf.readUInt16LE(22),
    sampleRate: buf.readUInt32LE(24),
    bitsPerSample: buf.readUInt16LE(34),
    dataSize: buf.readUInt32LE(40),
    fileSize: buf.length,
  };
}

/** Read the first MPEG audio frame header of an MP3 file. */
export function parseMp3Header(buf) {
  for (let i = 0; i < buf.length - 4; i++) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) continue;
    const version = (buf[i + 1] >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
    const rateIndex = (buf[i + 2] >> 2) & 3;
    const bitrateIndex = buf[i + 2] >> 4;
    const channelMode = buf[i + 3] >> 6; // 3 = mono
    const rates = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] }[
      version
    ];
    const kbps =
      version === 3
        ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][bitrateIndex]
        : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160][bitrateIndex];
    if (!rates || rateIndex === 3) continue;
    return { sampleRate: rates[rateIndex], kbps, mono: channelMode === 3 };
  }
  return null;
}
