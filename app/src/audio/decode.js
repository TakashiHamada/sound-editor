// Robust audio file decoding. Tries a chain of strategies (native decodeAudioData, ID3-stripped
// data, alternate context sample rates, an <audio> element capture, and finally the mpg123 WASM
// decoder) and, if all fail, throws an error carrying a diagnostic report of every attempt.

import { MPEGDecoder } from 'mpg123-decoder';
import { getAudioContext } from './audioContext.js';

const ID3V2_MAGIC = 'ID3'; // at offset 0
const ID3V2_HEADER_SIZE = 10;
const ID3V2_FOOTER_SIZE = 10;
const ID3V2_FOOTER_FLAG = 0x10; // header flags byte, bit 4
const ID3V1_MAGIC = 'TAG';
const ID3V1_SIZE = 128; // fixed block at the very end of the file

// True if `bytes` holds the ASCII string `text` at `offset`.
function hasAscii(bytes, offset, text) {
  for (let i = 0; i < text.length; i++) if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

// Locates the ID3 tags in `bytes`. Returns `{ v2, v1, start, end }`: `v2` is `{ version, size }`
// of a leading ID3v2 tag (size excludes the header) or null, `v1` whether the last 128 bytes are
// an ID3v1 tag, and `start` / `end` bound the audio data between the tags.
function findId3Tags(bytes) {
  let v2 = null;
  let start = 0;
  if (bytes.length > ID3V2_HEADER_SIZE && hasAscii(bytes, 0, ID3V2_MAGIC)) {
    // Tag size: a 28-bit "syncsafe" integer (7 bits per byte) in bytes 6..9.
    const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
    v2 = { version: `${bytes[3]}.${bytes[4]}`, size };
    start = ID3V2_HEADER_SIZE + size;
    if (bytes[5] & ID3V2_FOOTER_FLAG) start += ID3V2_FOOTER_SIZE;
  }
  const v1 = bytes.length > ID3V1_SIZE && hasAscii(bytes, bytes.length - ID3V1_SIZE, ID3V1_MAGIC);
  // The ID3v1 block only counts as strippable when more than 128 bytes follow the ID3v2 tag.
  const end = v1 && bytes.length - start > ID3V1_SIZE ? bytes.length - ID3V1_SIZE : bytes.length;
  return { v2, v1, start, end };
}

// Returns `arrayBuffer` without a leading ID3v2 tag and trailing ID3v1 tag (or the same buffer if
// it has neither).
function stripId3Tags(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const { start, end } = findId3Tags(bytes);
  return start === 0 && end === bytes.length ? arrayBuffer : arrayBuffer.slice(start, end);
}

// MPEG audio frame header tables. Sample rates are indexed by the version bits
// (3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5; 1 is reserved), then by the sample-rate index.
const MPEG_SAMPLE_RATES = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};
const MPEG_VERSION_NAMES = { 0: 'MPEG-2.5', 2: 'MPEG-2', 3: 'MPEG-1' };
const MPEG_LAYER_NAMES = { 1: 'Layer III', 2: 'Layer II', 3: 'Layer I' };
const MPEG_MODE_NAMES = { 0: 'Stereo', 1: 'Joint Stereo', 2: 'Dual Channel', 3: 'Mono' };

// Finds the first MPEG frame sync (11 set bits: 0xFF, then the top 3 bits of the next byte) at an
// offset below `limit` whose decoded header passes `accept`. Returns the header fields plus its
// offset, or null. `sampleRate` is undefined for reserved version / sample-rate values.
function findMpegFrame(bytes, limit, accept = () => true) {
  for (let offset = 0; offset < Math.min(bytes.length - 4, limit); offset++) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) continue;
    const header =
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3];
    const versionBits = (header >> 19) & 3;
    const sampleRateIndex = (header >> 10) & 3;
    const frame = {
      offset,
      versionBits,
      layerBits: (header >> 17) & 3,
      bitrateIndex: (header >> 12) & 15,
      sampleRateIndex,
      channelMode: (header >> 6) & 3,
      sampleRate: MPEG_SAMPLE_RATES[versionBits]?.[sampleRateIndex],
    };
    if (accept(frame)) return frame;
  }
  return null;
}

// Builds a human-readable report about the file's tags and the first MPEG frame header found in
// `audioData` (the file without its ID3 tags).
function describeFile(arrayBuffer, fileName, audioData) {
  const lines = [`File: ${fileName}, Size: ${arrayBuffer.byteLength} bytes`];
  const tags = findId3Tags(new Uint8Array(arrayBuffer));
  lines.push(tags.v2 ? `ID3v2.${tags.v2.version} tag: ${tags.v2.size} bytes` : 'No ID3v2 tag');
  if (tags.v1) lines.push('ID3v1 tag: present');
  const audioBytes = new Uint8Array(audioData);
  // Any sync in the first 8 KB, valid or not.
  const frame = findMpegFrame(audioBytes, 8192);
  if (frame) {
    const version = MPEG_VERSION_NAMES[frame.versionBits] ?? `ver=${frame.versionBits}`;
    const layer = MPEG_LAYER_NAMES[frame.layerBits] ?? `layer=${frame.layerBits}`;
    const sampleRate = frame.sampleRate ?? `idx=${frame.sampleRateIndex}`;
    const mode = MPEG_MODE_NAMES[frame.channelMode] ?? frame.channelMode;
    lines.push(`Frame at offset ${frame.offset}: ${version}, ${layer}`);
    lines.push(
      `  Sample rate: ${sampleRate} Hz, Mode: ${mode}, Bitrate idx: ${frame.bitrateIndex}`,
    );
  } else {
    const firstBytes = Array.from(audioBytes.slice(0, 16))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ');
    lines.push(`No MP3 sync frame found in first 8KB. First bytes: ${firstBytes}`);
  }
  return lines.join('\n');
}

// Decodes by letting an <audio> element play the file (muted) in real time and capturing the
// output with a ScriptProcessor. Always produces a 2-channel buffer at the context's sample rate.
function decodeWithMediaElement(file) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    const objectUrl = URL.createObjectURL(file);
    audio.src = objectUrl;
    audio.preload = 'auto';
    const handleError = () => {
      clearTimeout(timeoutId);
      const code = audio.error?.code;
      const message = audio.error?.message ?? 'unknown';
      cleanup();
      reject(new Error(`<audio> error: code=${code}, ${message}`));
    };
    // Detach the element from the file. The error listener goes first: releasing the source
    // makes the element fire another 'error', which would otherwise re-enter cleanup forever.
    const cleanup = () => {
      audio.removeEventListener('error', handleError);
      URL.revokeObjectURL(objectUrl);
      audio.removeAttribute('src');
      audio.load();
    };
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Media element decode timed out after 30s'));
    }, 30000);
    audio.addEventListener('error', handleError);
    audio.addEventListener(
      'canplaythrough',
      () => {
        try {
          const duration = audio.duration;
          if (!isFinite(duration) || duration <= 0) {
            clearTimeout(timeoutId);
            cleanup();
            reject(new Error(`Invalid duration: ${duration}`));
            return;
          }
          const context = getAudioContext();
          const mediaSource = context.createMediaElementSource(audio);
          const sampleRate = context.sampleRate;
          const expectedLength = Math.ceil(duration * sampleRate);
          const recorder = context.createScriptProcessor(4096, 2, 2);
          const leftChunks = [];
          const rightChunks = [];
          recorder.onaudioprocess = (event) => {
            leftChunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
            rightChunks.push(new Float32Array(event.inputBuffer.getChannelData(1)));
          };
          // A zero-gain path to the destination keeps the element's output flowing silently.
          const mute = context.createGain();
          mute.gain.value = 0;
          mediaSource.connect(recorder);
          mediaSource.connect(mute);
          mute.connect(context.destination);
          recorder.connect(context.destination);
          audio.currentTime = 0;
          audio.play();
          audio.addEventListener(
            'ended',
            () => {
              clearTimeout(timeoutId);
              try {
                recorder.disconnect();
                mediaSource.disconnect();
                mute.disconnect();
                cleanup();
                let capturedLength = 0;
                for (const chunk of leftChunks) capturedLength += chunk.length;
                const length = Math.min(capturedLength, expectedLength);
                const result = context.createBuffer(2, length, sampleRate);
                const left = result.getChannelData(0);
                const right = result.getChannelData(1);
                let writeOffset = 0;
                for (let i = 0; i < leftChunks.length && writeOffset < length; i++) {
                  const count = Math.min(leftChunks[i].length, length - writeOffset);
                  left.set(leftChunks[i].subarray(0, count), writeOffset);
                  right.set(rightChunks[i].subarray(0, count), writeOffset);
                  writeOffset += count;
                }
                resolve(result);
              } catch (error) {
                // e.g. nothing was captured (createBuffer with length 0).
                reject(error);
              }
            },
            { once: true },
          );
        } catch (error) {
          clearTimeout(timeoutId);
          cleanup();
          reject(error);
        }
      },
      { once: true },
    );
  });
}

// Sample rate of the first valid MPEG frame header in the first 64 KB of `bytes`, or null.
// Layer bits 0 and reserved version / sample-rate values mark a false sync.
function detectMpegSampleRate(bytes) {
  const frame = findMpegFrame(
    bytes,
    65536,
    ({ layerBits, sampleRate }) => layerBits !== 0 && sampleRate !== undefined,
  );
  return frame ? frame.sampleRate : null;
}

// Decodes a File into an AudioBuffer, trying each strategy in turn.
export async function decodeAudioFile(file) {
  const context = getAudioContext();
  if (context.state === 'suspended') await context.resume();
  const arrayBuffer = await file.arrayBuffer();
  const diagnostics = [];

  // [1] Native decode of the raw file.
  try {
    return await context.decodeAudioData(arrayBuffer.slice(0));
  } catch (error) {
    diagnostics.push(`[1] decodeAudioData: ${error.message}`);
  }

  // [2] Native decode with ID3 tags removed.
  const stripped = stripId3Tags(arrayBuffer);
  const strippedBytes = arrayBuffer.byteLength - stripped.byteLength;
  if (strippedBytes > 0) {
    diagnostics.push(`[2] Stripped ${strippedBytes} bytes of ID3 tags`);
    try {
      return await context.decodeAudioData(stripped.slice(0));
    } catch (error) {
      diagnostics.push(`[2] decodeAudioData (stripped): ${error.message}`);
    }
  } else diagnostics.push('[2] No ID3 tags to strip, skipped');

  // [3] Native decode in temporary contexts running at common sample rates.
  for (const sampleRate of [44100, 48000, 22050, 16000])
    try {
      const tempContext = new AudioContext({ sampleRate });
      try {
        return await tempContext.decodeAudioData(stripped.slice(0));
      } finally {
        await tempContext.close();
      }
    } catch (error) {
      diagnostics.push(`[3] decodeAudioData @${sampleRate}Hz: ${error.message}`);
    }

  // [4] Real-time capture through an <audio> element.
  try {
    return await decodeWithMediaElement(file);
  } catch (error) {
    diagnostics.push(`[4] Media element: ${error.message}`);
  }

  // [5] mpg123 WASM decoder on the original bytes.
  try {
    const decoder = new MPEGDecoder();
    await decoder.ready;
    const bytes = new Uint8Array(arrayBuffer);
    let decoded;
    try {
      decoded = decoder.decode(bytes);
    } finally {
      decoder.free();
    }
    if (decoded.samplesDecoded === 0) diagnostics.push('[5] mpg123: decoded 0 samples');
    else {
      // Prefer the sample rate from the first valid frame header when it disagrees with mpg123's.
      const headerSampleRate = detectMpegSampleRate(bytes);
      const channelCount = decoded.channelData.length;
      const sampleRate =
        headerSampleRate && headerSampleRate !== decoded.sampleRate
          ? headerSampleRate
          : decoded.sampleRate;
      const buffer = getAudioContext().createBuffer(
        channelCount,
        decoded.samplesDecoded,
        sampleRate,
      );
      for (let channel = 0; channel < channelCount; channel++)
        buffer.copyToChannel(new Float32Array(decoded.channelData[channel]), channel);
      return buffer;
    }
  } catch (error) {
    diagnostics.push(`[5] mpg123 WASM: ${error.message}`);
  }

  const analysis = describeFile(arrayBuffer, file.name, stripped);
  const report = [`[File Analysis]\n${analysis}`, ...diagnostics].join('\n');
  throw new Error(`Unable to decode "${file.name}".\n\n${report}`);
}
