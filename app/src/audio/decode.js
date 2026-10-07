// Robust audio file decoding. Tries a chain of strategies (native decodeAudioData, ID3-stripped
// data, alternate context sample rates, an <audio> element capture, and finally the mpg123 WASM
// decoder) and, if all fail, throws an error carrying a diagnostic report of every attempt.

import { MPEGDecoder } from 'mpg123-decoder';
import { getAudioContext } from './audioContext.js';

// Returns `arrayBuffer` without a leading ID3v2 tag and trailing ID3v1 tag (or the same buffer if
// it has neither).
function stripId3Tags(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let start = 0;
  let end = bytes.length;
  // 'ID3' header: tag size is a 28-bit "syncsafe" integer (7 bits per byte) in bytes 6..9.
  if (bytes.length > 10 && bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) {
    start = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
    // Flags bit 4: a 10-byte footer follows the tag.
    if (bytes[5] & 16) start += 10;
  }
  if (end - start > 128) {
    // ID3v1: a fixed 128-byte block starting with 'TAG' at the end of the file.
    const tagOffset = end - 128;
    if (bytes[tagOffset] === 84 && bytes[tagOffset + 1] === 65 && bytes[tagOffset + 2] === 71)
      end = tagOffset;
  }
  return start === 0 && end === bytes.length ? arrayBuffer : arrayBuffer.slice(start, end);
}

// Builds a human-readable report about the file's tags and first MPEG frame header.
function describeFile(arrayBuffer, fileName) {
  const bytes = new Uint8Array(arrayBuffer);
  const lines = [];
  lines.push(`File: ${fileName}, Size: ${arrayBuffer.byteLength} bytes`);
  if (bytes.length > 10 && bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) {
    const version = `${bytes[3]}.${bytes[4]}`;
    const tagSize = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
    lines.push(`ID3v2.${version} tag: ${tagSize} bytes`);
  } else lines.push('No ID3v2 tag');
  if (bytes.length > 128) {
    const tagOffset = bytes.length - 128;
    if (bytes[tagOffset] === 84 && bytes[tagOffset + 1] === 65 && bytes[tagOffset + 2] === 71)
      lines.push('ID3v1 tag: present');
  }
  const audioData = stripId3Tags(arrayBuffer);
  const audioBytes = new Uint8Array(audioData);
  let foundFrame = false;
  // Look for an MPEG frame sync (11 set bits: 0xFF then the top 3 bits of the next byte) in the
  // first 8 KB and decode the fields of the 32-bit frame header found there.
  for (let offset = 0; offset < Math.min(audioBytes.length - 4, 8192); offset++)
    if (audioBytes[offset] === 255 && (audioBytes[offset + 1] & 224) === 224) {
      const header =
        (audioBytes[offset] << 24) |
        (audioBytes[offset + 1] << 16) |
        (audioBytes[offset + 2] << 8) |
        audioBytes[offset + 3];
      const versionBits = (header >> 19) & 3;
      const layerBits = (header >> 17) & 3;
      const bitrateIndex = (header >> 12) & 15;
      const sampleRateIndex = (header >> 10) & 3;
      const channelMode = (header >> 6) & 3;
      const versionNames = { 0: 'MPEG-2.5', 2: 'MPEG-2', 3: 'MPEG-1' };
      const layerNames = { 1: 'Layer III', 2: 'Layer II', 3: 'Layer I' };
      const modeNames = { 0: 'Stereo', 1: 'Joint Stereo', 2: 'Dual Channel', 3: 'Mono' };
      // Sample rates by version bits (3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5), by sample-rate index.
      const sampleRate = {
        3: [44100, 48000, 32000],
        2: [22050, 24000, 16000],
        0: [11025, 12000, 8000],
      }[versionBits]?.[sampleRateIndex];
      lines.push(
        `Frame at offset ${offset}: ${versionNames[versionBits] ?? `ver=${versionBits}`}, ${layerNames[layerBits] ?? `layer=${layerBits}`}`,
      );
      lines.push(
        `  Sample rate: ${sampleRate ?? `idx=${sampleRateIndex}`} Hz, Mode: ${modeNames[channelMode] ?? channelMode}, Bitrate idx: ${bitrateIndex}`,
      );
      foundFrame = true;
      break;
    }
  if (!foundFrame) {
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
    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      audio.src = '';
    };
    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Media element decode timed out after 30s'));
    }, 30000);
    audio.addEventListener('error', () => {
      clearTimeout(timeoutId);
      cleanup();
      const code = audio.error?.code;
      const message = audio.error?.message ?? 'unknown';
      reject(new Error(`<audio> error: code=${code}, ${message}`));
    });
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
          // NOTE: this 'ended' handler runs outside the try/catch; if it throws (e.g. createBuffer
          // with length 0 when no audio was captured) the promise never settles, because the
          // timeout has already been cleared.
          audio.addEventListener(
            'ended',
            () => {
              clearTimeout(timeoutId);
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

// Scans for the first valid MPEG frame header and returns its sample rate, or null.
function detectMpegSampleRate(bytes) {
  for (let offset = 0; offset < Math.min(bytes.length - 4, 65536); offset++) {
    if (bytes[offset] === 255 && (bytes[offset + 1] & 224) === 224) {
      const header =
        (bytes[offset] << 24) |
        (bytes[offset + 1] << 16) |
        (bytes[offset + 2] << 8) |
        bytes[offset + 3];
      const versionBits = (header >> 19) & 3;
      const layerBits = (header >> 17) & 3;
      const sampleRateIndex = (header >> 10) & 3;
      const rates = {
        3: [44100, 48000, 32000],
        2: [22050, 24000, 16000],
        0: [11025, 12000, 8000],
      }[versionBits];
      // Version 1, layer 0 and sample-rate index 3 are reserved values (false sync).
      if (versionBits !== 1 && layerBits !== 0 && sampleRateIndex !== 3 && rates)
        return rates[sampleRateIndex];
    }
  }
  return null;
}

// Decodes a File into an AudioBuffer, trying each strategy in turn.
export async function decodeAudioFile(file) {
  const context = getAudioContext();
  if (context.state === 'suspended') await context.resume();
  const arrayBuffer = await file.arrayBuffer();
  const diagnostics = [];
  const analysis = describeFile(arrayBuffer, file.name);
  diagnostics.push('[File Analysis]\n' + analysis);

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
      // NOTE: the temporary context is only closed on success; a failed decode leaks it.
      const tempContext = new AudioContext({ sampleRate });
      const decoded = await tempContext.decodeAudioData(stripped.slice(0));
      await tempContext.close();
      return decoded;
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
    // NOTE: if `decode()` throws, `free()` is skipped and the WASM decoder instance leaks.
    const decoder = new MPEGDecoder();
    await decoder.ready;
    const bytes = new Uint8Array(arrayBuffer);
    const decoded = decoder.decode(bytes);
    decoder.free();
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

  const report = diagnostics.join('\n');
  throw new Error(`Unable to decode "${file.name}".\n\n${report}`);
}
