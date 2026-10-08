// Pixel thresholds and hit-testing for mouse selection on the waveform canvas.

// Within this many px of the clip start/end, a dragged position snaps to exactly 0 / duration.
export const SNAP_PX = 8;
// Within this many px of a selection edge, mouse-down grabs that edge instead of starting anew.
export const GRIP_PX = 6;
// A click becomes a drag-selection only after the pointer moved at least this many px.
export const DRAG_PX = 3;

// If `x` (canvas px) is within GRIP_PX of an edge of the selection [start, end], returns the
// *opposite* edge's time (the anchor that stays fixed while the grabbed edge is dragged);
// otherwise null. `timeToPx` converts a time in seconds to a canvas x coordinate.
export function nearSelectionEdge(x, timeToPx, start, end) {
  if (start == null || end == null || start === end) return null;
  const low = Math.min(start, end);
  const high = Math.max(start, end);
  const distanceToLow = Math.abs(x - timeToPx(low));
  const distanceToHigh = Math.abs(x - timeToPx(high));
  if (Math.min(distanceToLow, distanceToHigh) > GRIP_PX) return null;
  return distanceToLow <= distanceToHigh ? high : low;
}
