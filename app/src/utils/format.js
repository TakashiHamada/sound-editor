// Human-readable formatting and parsing helpers: time positions, byte sizes, decibels.

// Formats seconds as `MM:SS.mmm`. Negative / non-finite input renders as zero.
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.000';
  // Round once to whole milliseconds so 1.9996 s carries into "00:02.000".
  const totalMillis = Math.round(seconds * 1000);
  const minutes = Math.floor(totalMillis / 60000);
  const wholeSeconds = Math.floor(totalMillis / 1000) % 60;
  const millis = totalMillis % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

// Parses `ss`, `mm:ss` or `hh:mm:ss` (each part may carry a decimal fraction) into seconds.
// Returns null for anything else.
export function parseTime(text) {
  const parts = String(text).trim().split(':');
  if (parts.length > 3 || parts.some((part) => !/^(\d+\.?\d*|\.\d+)$/.test(part.trim())))
    return null;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + Number(part);
  return Number.isFinite(seconds) ? seconds : null;
}

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

// Formats a byte count with binary (1024-based) units.
export function formatBytes(bytes) {
  if (bytes < KB) return `${bytes} bytes`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(2)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}

// Decibels to a linear amplitude factor, and back.
export const dbToGain = (db) => 10 ** (db / 20);
export const gainToDb = (gain) => 20 * Math.log10(gain);

// "0.0 dB", "+6.0 dB", "-3.5 dB".
export function formatDb(db) {
  if (db === 0) return '0.0 dB';
  return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

// "16-bit" for an integer PCM bit depth; "32-bit float" when there is none (decoded audio).
export function formatBitDepth(bitDepth) {
  return bitDepth ? `${bitDepth}-bit` : '32-bit float';
}
