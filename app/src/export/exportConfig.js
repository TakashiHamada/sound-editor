// Export-config helpers: the default config for a file, normalisation of bit depth / MP3 sample
// rate / MP3 bitrate to legal values, sample-rate option lists, and output-size estimators.
// Every consumer (settings modal, size previews, export pipeline) goes through
// normalizeExportConfig so they all agree on what will actually be written.

// Sample rates offered for WAV export.
export const EXPORT_SAMPLE_RATES = [8000, 11025, 16000, 22050, 32000, 44100, 48000, 96000];

// Sample rates lamejs can encode (MPEG-1, MPEG-2 and MPEG-2.5).
export const MP3_SAMPLE_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];

// Closest legal MP3 sample rate; 44100 for missing/invalid input.
export function nearestMp3SampleRate(sampleRate) {
  let best = 44100;
  if (!(sampleRate > 0)) return best;
  best = MP3_SAMPLE_RATES[0];
  for (const candidate of MP3_SAMPLE_RATES)
    if (Math.abs(candidate - sampleRate) < Math.abs(best - sampleRate)) best = candidate;
  return best;
}

// Clamps an MP3 bitrate (kbps) to the range allowed at the given sample rate:
// MPEG-2/2.5 rates (< 32 kHz) allow 8-160 kbps, MPEG-1 rates allow 32-320 kbps.
export function clampMp3Bitrate(bitrate, sampleRate) {
  bitrate = Number(bitrate) || 128;
  return nearestMp3SampleRate(sampleRate) < 32000
    ? Math.max(8, Math.min(160, bitrate))
    : Math.max(32, Math.min(320, bitrate));
}

// WAV bit depth limited to 8/16/24/32, defaulting to 16.
export function normalizeWavBitDepth(bitDepth) {
  return [8, 16, 24, 32].includes(bitDepth) ? bitDepth : 16;
}

export function normalizeExportConfig(config) {
  const normalized = { ...config, bitDepth: normalizeWavBitDepth(config.bitDepth) };
  if (normalized.format === 'mp3') {
    normalized.sampleRate = nearestMp3SampleRate(normalized.sampleRate);
    normalized.bitrate = clampMp3Bitrate(normalized.bitrate, normalized.sampleRate);
  }
  return normalized;
}

// Sample rates to list in the settings modal; for WAV, a non-standard current rate is merged in.
export function sampleRateOptions(config) {
  return config.format === 'mp3'
    ? MP3_SAMPLE_RATES
    : EXPORT_SAMPLE_RATES.includes(config.sampleRate)
      ? EXPORT_SAMPLE_RATES
      : [...EXPORT_SAMPLE_RATES, config.sampleRate].sort((a, b) => a - b);
}

// Default export settings for a file: keep its original format, rate, channels and bit depth.
// Tolerates a null audioBuffer.
export function defaultExportConfig(audioBuffer, fileName) {
  return {
    format: fileName.split('.').pop()?.toLowerCase() === 'mp3' ? 'mp3' : 'wav',
    sampleRate: audioBuffer?._originalSampleRate ?? audioBuffer?.sampleRate ?? 44100,
    srcQuality: 'medium',
    channels:
      (audioBuffer?._originalChannels ?? audioBuffer?.numberOfChannels ?? 2) === 1
        ? 'mono'
        : 'stereo',
    bitDepth: audioBuffer?._originalBitDepth ?? 24,
    bitrate: 192,
    mp3Mode: 'joint',
    lowpass: 18000,
    preset: 'custom',
  };
}

// Predicted size in bytes of the exported file (44-byte header for WAV; CBR for MP3).
export function estimateOutputBytes(config, duration) {
  config = normalizeExportConfig(config);
  const channelCount = config.channels === 'stereo' ? 2 : 1;
  return config.format === 'wav'
    ? duration * config.sampleRate * channelCount * (config.bitDepth / 8) + 44
    : (duration * config.bitrate * 1000) / 8;
}

// Size of the source audio as a 16-bit WAV, for comparison with the output estimate.
export function estimateSourceBytes(audioBuffer, duration) {
  return (
    duration * (audioBuffer?.sampleRate ?? 44100) * (audioBuffer?.numberOfChannels ?? 2) * 2 + 44
  );
}
