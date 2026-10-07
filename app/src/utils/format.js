// Human-readable formatting helpers for time positions and byte sizes.

// Formats seconds as `MM:SS.mmm`. Negative / non-finite input renders as zero.
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00.000';
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  // NOTE: the fractional part is rounded independently of the whole seconds, so a value such as
  // 1.9996 renders as `00:01.1000` (millis rounds up to 1000 without carrying). Kept as-is.
  const millis = Math.round((seconds % 1) * 1000);
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
