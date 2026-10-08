// Spectral-subtraction noise reduction: an in-place radix-2 FFT, noise-profile capture from a
// selection, and the STFT overlap-add denoiser that applies the profile to a buffer.
import { getAudioContext } from './audioContext.js';

// STFT frame length (samples) and hop between frames (75% overlap).
export const FFT_SIZE = 2048;
export const HOP_SIZE = 512;

// Symmetric Hann window of `size` samples.
export function hannWindow(size) {
  const hann = new Float32Array(size);
  for (let i = 0; i < size; i++) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  return hann;
}

// In-place iterative radix-2 Cooley-Tukey FFT over separate real/imag arrays (length = power of 2).
export function fft(real, imag) {
  const size = real.length;
  // Bit-reversal permutation.
  let reversed = 0;
  for (let i = 0; i < size - 1; i++) {
    if (i < reversed) {
      let tmp = real[i];
      real[i] = real[reversed];
      real[reversed] = tmp;
      tmp = imag[i];
      imag[i] = imag[reversed];
      imag[reversed] = tmp;
    }
    let bit = size >> 1;
    while (bit <= reversed) {
      reversed -= bit;
      bit >>= 1;
    }
    reversed += bit;
  }
  // Butterfly passes.
  for (let blockSize = 2; blockSize <= size; blockSize *= 2) {
    const halfBlock = blockSize / 2;
    const angleStep = (-2 * Math.PI) / blockSize;
    for (let blockStart = 0; blockStart < size; blockStart += blockSize)
      for (let k = 0; k < halfBlock; k++) {
        const angle = angleStep * k;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const even = blockStart + k;
        const odd = blockStart + k + halfBlock;
        const oddReal = cos * real[odd] - sin * imag[odd];
        const oddImag = cos * imag[odd] + sin * real[odd];
        real[odd] = real[even] - oddReal;
        imag[odd] = imag[even] - oddImag;
        real[even] += oddReal;
        imag[even] += oddImag;
      }
  }
}

// In-place inverse FFT via the conjugate trick: conj -> forward FFT -> conj and scale by 1/N.
export function ifft(real, imag) {
  const size = real.length;
  for (let i = 0; i < size; i++) imag[i] = -imag[i];
  fft(real, imag);
  for (let i = 0; i < size; i++) {
    real[i] /= size;
    imag[i] = -imag[i] / size;
  }
}

// Averages the power spectrum of channel 0 between startTime and endTime (seconds).
// Returns a Float32Array of 2 * bins: [mean power per bin..., power std-dev per bin...].
export function captureNoiseProfile(audioBuffer, startTime, endTime) {
  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startTime * sampleRate));
  const endSample = Math.min(audioBuffer.length, Math.floor(endTime * sampleRate));
  const samples = audioBuffer.getChannelData(0);
  const hann = hannWindow(FFT_SIZE);
  const binCount = FFT_SIZE / 2 + 1;
  const powerSum = new Float32Array(binCount);
  const powerSquaredSum = new Float32Array(binCount);
  let frameCount = 0;
  for (let frameStart = startSample; frameStart + FFT_SIZE <= endSample; frameStart += HOP_SIZE) {
    const real = new Float32Array(FFT_SIZE);
    const imag = new Float32Array(FFT_SIZE);
    for (let i = 0; i < FFT_SIZE; i++) real[i] = samples[frameStart + i] * hann[i];
    fft(real, imag);
    for (let bin = 0; bin < binCount; bin++) {
      const power = real[bin] * real[bin] + imag[bin] * imag[bin];
      powerSum[bin] += power;
      powerSquaredSum[bin] += power * power;
    }
    frameCount++;
  }
  const profile = new Float32Array(binCount * 2);
  if (frameCount > 0)
    for (let bin = 0; bin < binCount; bin++) {
      powerSum[bin] /= frameCount;
      powerSquaredSum[bin] /= frameCount;
      const variance = Math.max(0, powerSquaredSum[bin] - powerSum[bin] * powerSum[bin]);
      profile[bin] = powerSum[bin];
      profile[binCount + bin] = Math.sqrt(variance);
    }
  return profile;
}

// Applies spectral subtraction with the given noise profile to [startTime, endTime) (seconds;
// whole buffer when undefined) and returns a new AudioBuffer. Awaits the optional
// `onProgress(doneFrames, totalFrames)` after every STFT frame.
export async function applyNoiseReduction(
  audioBuffer,
  noiseProfile,
  strength,
  startTime,
  endTime,
  onProgress,
) {
  const context = getAudioContext();
  const sampleRate = audioBuffer.sampleRate;
  const amount = Math.max(0, Math.min(1, strength));
  const startSample = startTime === undefined ? 0 : Math.max(0, Math.floor(startTime * sampleRate));
  const endSample =
    endTime === undefined
      ? audioBuffer.length
      : Math.min(audioBuffer.length, Math.floor(endTime * sampleRate));
  const output = context.createBuffer(audioBuffer.numberOfChannels, audioBuffer.length, sampleRate);
  const hann = hannWindow(FFT_SIZE);
  const binCount = FFT_SIZE / 2 + 1;
  const OVER_SUBTRACTION = 2; // noise power multiplier subtracted at full strength
  const GAIN_FLOOR = 0.05; // minimum per-bin gain (limits "musical noise")
  const TEMPORAL_SMOOTHING = 0.6; // weight of the previous frame's gain
  const STD_DEV_WEIGHT = 1; // how many std-devs above the mean the noise floor sits
  // The profile (from captureNoiseProfile) holds [mean power per bin | std-dev per bin].
  const noiseFloor = new Float32Array(binCount);
  const real = new Float32Array(FFT_SIZE);
  const imag = new Float32Array(FFT_SIZE);
  const gains = new Float32Array(binCount);
  const smoothedGains = new Float32Array(binCount);
  for (let bin = 0; bin < binCount; bin++) {
    noiseFloor[bin] = noiseProfile[bin] + STD_DEV_WEIGHT * noiseProfile[binCount + bin];
  }
  const regionLength = endSample - startSample;
  if (regionLength <= 0) {
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++)
      output.getChannelData(channel).set(audioBuffer.getChannelData(channel));
    return output;
  }
  // Frames start one window (minus a hop) before the region and run past its end, reading real
  // neighbouring audio (zeros beyond the buffer). Every sample of the region is then covered by
  // the full overlap, so the window-sum normalisation never divides by a near-zero value.
  const firstFrameStart = startSample - FFT_SIZE + HOP_SIZE;
  let framesPerChannel = 0;
  for (let frameStart = firstFrameStart; frameStart < endSample; frameStart += HOP_SIZE)
    framesPerChannel++;
  const totalFrames = Math.max(1, framesPerChannel * audioBuffer.numberOfChannels);
  let doneFrames = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const input = audioBuffer.getChannelData(channel);
    const outputData = output.getChannelData(channel);
    outputData.set(input);
    const overlapSum = new Float32Array(regionLength);
    const windowSum = new Float32Array(regionLength);
    const previousGains = new Float32Array(binCount);
    for (let bin = 0; bin < binCount; bin++) previousGains[bin] = 1;
    for (let frameStart = firstFrameStart; frameStart < endSample; frameStart += HOP_SIZE) {
      const regionOffset = frameStart - startSample;
      for (let i = 0; i < FFT_SIZE; i++) {
        const source = frameStart + i;
        real[i] = source >= 0 && source < input.length ? input[source] * hann[i] : 0;
        imag[i] = 0;
      }
      fft(real, imag);
      for (let bin = 0; bin < binCount; bin++) {
        const power = real[bin] * real[bin] + imag[bin] * imag[bin];
        let gain =
          power > 1e-20 ? (power - OVER_SUBTRACTION * noiseFloor[bin] * amount) / power : 0;
        if (gain < GAIN_FLOOR) gain = GAIN_FLOOR;
        if (gain > 1) gain = 1;
        gains[bin] = gain;
      }
      // 3-tap smoothing across neighbouring bins.
      for (let bin = 0; bin < binCount; bin++)
        smoothedGains[bin] =
          (gains[Math.max(0, bin - 1)] + gains[bin] + gains[Math.min(binCount - 1, bin + 1)]) / 3;
      // Smoothing across time, then apply the gain to the spectrum.
      for (let bin = 0; bin < binCount; bin++) {
        smoothedGains[bin] =
          TEMPORAL_SMOOTHING * previousGains[bin] + (1 - TEMPORAL_SMOOTHING) * smoothedGains[bin];
        previousGains[bin] = smoothedGains[bin];
        real[bin] *= smoothedGains[bin];
        imag[bin] *= smoothedGains[bin];
      }
      // Rebuild the upper half as the complex conjugate mirror so the IFFT output is real.
      for (let bin = binCount; bin < FFT_SIZE; bin++) {
        const mirror = FFT_SIZE - bin;
        real[bin] = real[mirror];
        imag[bin] = -imag[mirror];
      }
      ifft(real, imag);
      // Windowed overlap-add.
      for (let i = 0; i < FFT_SIZE; i++) {
        const target = regionOffset + i;
        if (target >= 0 && target < regionLength) {
          overlapSum[target] += real[i] * hann[i];
          windowSum[target] += hann[i] * hann[i];
        }
      }
      doneFrames++;
      await onProgress?.(doneFrames, totalFrames);
    }
    // Normalise by the summed window energy and crossfade one frame at each region edge.
    const crossfadeLength = FFT_SIZE;
    for (let i = 0; i < regionLength; i++)
      if (windowSum[i] > 1e-8) {
        const processed = overlapSum[i] / windowSum[i];
        const original = input[startSample + i];
        // Ramps in from the region start and out towards its end (independently, so short
        // regions fade both ways).
        const mix = Math.max(
          0,
          Math.min(1, i / crossfadeLength, (regionLength - 1 - i) / crossfadeLength),
        );
        outputData[startSample + i] = original * (1 - mix) + processed * mix;
      }
  }
  return output;
}
