// Pure AudioBuffer transformations used by the editor: copy, cut, gain, fades, resampling and
// channel conversions. Every function returns a new buffer; the input is never modified.
// Times are in seconds and are converted to sample indices with the buffer's own sample rate.

import { getAudioContext } from './audioContext.js';
import { copyOriginalMeta } from './bufferMeta.js';

// Deep copy of `buffer` created on `context`, keeping the original-file metadata.
export function cloneAudioBuffer(context, buffer) {
  const copy = context.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++)
    copy.copyToChannel(buffer.getChannelData(channel).slice(), channel);
  return copyOriginalMeta(buffer, copy);
}

// Returns the samples between `startTime` and `endTime` (a 1-sample buffer if the range is empty).
export function extractRange(buffer, startTime, endTime) {
  const context = getAudioContext();
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startTime * sampleRate));
  const endSample = Math.min(buffer.length, Math.floor(endTime * sampleRate));
  const length = endSample - startSample;
  if (length <= 0) return context.createBuffer(buffer.numberOfChannels, 1, sampleRate);
  const result = context.createBuffer(buffer.numberOfChannels, length, sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++)
    result
      .getChannelData(channel)
      .set(buffer.getChannelData(channel).subarray(startSample, endSample));
  return result;
}

// Returns `buffer` with the range `startTime`..`endTime` removed (a 1-sample buffer if nothing
// would remain).
export function deleteRange(buffer, startTime, endTime) {
  const context = getAudioContext();
  const sampleRate = buffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startTime * sampleRate));
  const endSample = Math.min(buffer.length, Math.floor(endTime * sampleRate));
  const remainingLength = buffer.length - (endSample - startSample);
  if (remainingLength <= 0) return context.createBuffer(buffer.numberOfChannels, 1, sampleRate);
  const result = context.createBuffer(buffer.numberOfChannels, remainingLength, sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const target = result.getChannelData(channel);
    target.set(source.subarray(0, startSample));
    target.set(source.subarray(endSample), startSample);
  }
  return result;
}

// Multiplies samples in `startTime`..`endTime` (whole buffer when omitted) by `gain`,
// clamped to 0..3 (i.e. at most about +9.5 dB).
export function applyGain(buffer, gain, startTime, endTime) {
  const context = getAudioContext();
  const sampleRate = buffer.sampleRate;
  // 0..10 covers the volume slider's -20..+20 dB range.
  const clampedGain = Math.max(0, Math.min(10, gain));
  const startSample = startTime === undefined ? 0 : Math.max(0, Math.floor(startTime * sampleRate));
  const endSample =
    endTime === undefined
      ? buffer.length
      : Math.min(buffer.length, Math.floor(endTime * sampleRate));
  const result = context.createBuffer(buffer.numberOfChannels, buffer.length, sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const target = result.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++)
      if (i >= startSample && i < endSample) target[i] = source[i] * clampedGain;
      else target[i] = source[i];
  }
  return result;
}

// Linear fade-in of `duration` seconds starting at `startTime` (buffer start when omitted).
export function applyFadeIn(buffer, duration, startTime) {
  const context = getAudioContext();
  const sampleRate = buffer.sampleRate;
  const startSample = startTime === undefined ? 0 : Math.max(0, Math.floor(startTime * sampleRate));
  const fadeLength = Math.floor(duration * sampleRate);
  const endSample = Math.min(buffer.length, startSample + fadeLength);
  const result = context.createBuffer(buffer.numberOfChannels, buffer.length, sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const target = result.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++)
      if (i >= startSample && i < endSample) {
        const factor = (i - startSample) / fadeLength;
        target[i] = source[i] * factor;
      } else target[i] = source[i];
  }
  return result;
}

// Linear fade-out of `duration` seconds ending at `endTime` (buffer end when omitted).
export function applyFadeOut(buffer, duration, endTime) {
  const context = getAudioContext();
  const sampleRate = buffer.sampleRate;
  const endSample =
    endTime === undefined
      ? buffer.length
      : Math.min(buffer.length, Math.floor(endTime * sampleRate));
  const fadeLength = Math.floor(duration * sampleRate);
  const startSample = Math.max(0, endSample - fadeLength);
  const result = context.createBuffer(buffer.numberOfChannels, buffer.length, sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel);
    const target = result.getChannelData(channel);
    for (let i = 0; i < buffer.length; i++)
      if (i >= startSample && i < endSample) {
        const factor = (endSample - i) / fadeLength;
        target[i] = source[i] * factor;
      } else target[i] = source[i];
  }
  return result;
}

// Renders `buffer` at `targetSampleRate` through an OfflineAudioContext. For 'high' / 'medium'
// quality an anti-aliasing low-pass is inserted just below the lower of the two Nyquist rates.
export async function resample(buffer, targetSampleRate, quality) {
  if (buffer.sampleRate === targetSampleRate) {
    const copy = getAudioContext().createBuffer(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate,
    );
    for (let channel = 0; channel < buffer.numberOfChannels; channel++)
      copy.copyToChannel(buffer.getChannelData(channel).slice(), channel);
    return copy;
  }
  const duration = buffer.duration;
  const length = Math.ceil(duration * targetSampleRate);
  const offlineContext = new OfflineAudioContext(buffer.numberOfChannels, length, targetSampleRate);
  const source = offlineContext.createBufferSource();
  source.buffer = buffer;
  if (quality === 'high' || quality === 'medium') {
    const lowpass = offlineContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    const nyquist = Math.min(buffer.sampleRate, targetSampleRate) / 2;
    lowpass.frequency.value = quality === 'high' ? nyquist * 0.95 : nyquist * 0.85;
    // 0.7071 = 1/sqrt(2), a Butterworth (maximally flat) response.
    lowpass.Q.value = quality === 'high' ? 0.7071 : 0.5;
    source.connect(lowpass);
    lowpass.connect(offlineContext.destination);
  } else source.connect(offlineContext.destination);
  source.start(0);
  return offlineContext.startRendering();
}

// Averages all channels into a single mono channel.
export function toMono(buffer) {
  const result = getAudioContext().createBuffer(1, buffer.length, buffer.sampleRate);
  const output = result.getChannelData(0);
  const channelCount = buffer.numberOfChannels;
  const channels = [];
  for (let channel = 0; channel < channelCount; channel++)
    channels.push(buffer.getChannelData(channel));
  for (let i = 0; i < buffer.length; i++) {
    let sum = 0;
    for (let channel = 0; channel < channelCount; channel++) sum += channels[channel][i];
    output[i] = sum / channelCount;
  }
  return result;
}

// Inserts `inserted` into `buffer` at `time` seconds (clamped to the buffer bounds).
// If `inserted` has fewer channels than `buffer`, its last channel fills the remaining ones.
export function insertBuffer(buffer, inserted, time) {
  const context = getAudioContext();
  const sampleRate = buffer.sampleRate;
  const channelCount = buffer.numberOfChannels;
  let insertAt = Math.round(time * sampleRate);
  insertAt = Math.max(0, Math.min(buffer.length, insertAt));
  const length = buffer.length + inserted.length;
  const result = context.createBuffer(channelCount, length, sampleRate);
  for (let channel = 0; channel < channelCount; channel++) {
    const source = buffer.getChannelData(channel);
    const target = result.getChannelData(channel);
    target.set(source.subarray(0, insertAt));
    target.set(inserted.getChannelData(Math.min(channel, inserted.numberOfChannels - 1)), insertAt);
    target.set(source.subarray(insertAt), insertAt + inserted.length);
  }
  return result;
}

// Duplicates channel 0 of a mono buffer into a 2-channel buffer.
export function monoToStereo(buffer) {
  const result = getAudioContext().createBuffer(2, buffer.length, buffer.sampleRate);
  const mono = buffer.getChannelData(0);
  result.copyToChannel(mono, 0);
  result.copyToChannel(mono, 1);
  return result;
}

// Converts any buffer to 2 channels: mono is duplicated, stereo is copied, and for more than two
// channels only the first two are kept (no downmix). Keeps the original-file metadata.
export function toStereo(buffer) {
  const result = getAudioContext().createBuffer(2, buffer.length, buffer.sampleRate);
  result.copyToChannel(buffer.getChannelData(0), 0);
  result.copyToChannel(buffer.getChannelData(buffer.numberOfChannels > 1 ? 1 : 0), 1);
  return copyOriginalMeta(buffer, result);
}
