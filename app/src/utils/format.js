// Human-readable formatting helpers for time positions and byte sizes.

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

// Formats a byte count with binary (1024-based) units.
export function formatBytes(bytes) {
  return bytes < 1024
    ? `${bytes} bytes`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} KB`
      : bytes < 1024 * 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
        : `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
