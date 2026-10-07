// Selection / playhead helpers shared by the waveform canvas, the selection bar and the keyboard
// shortcuts: pixel thresholds for edge grabbing, seeking, setting one selection edge, parsing
// typed times, and the "reveal" hook that scrolls the waveform so a time is on screen.

import { useEditorStore } from '../store/editorStore.js';

// Within this many px of the clip start/end, a dragged position snaps to exactly 0 / duration.
export const SNAP_PX = 8;
// Within this many px of a selection edge, mouse-down grabs that edge instead of starting anew.
export const GRIP_PX = 6;
// A click becomes a drag-selection only after the pointer moved at least this many px.
export const DRAG_PX = 3;

// Registered by the mounted WaveformView; scrolls the view so a given time becomes visible.
let revealHandler = null;

export function setRevealHandler(handler) {
  revealHandler = handler;
}

export function revealTime(time) {
  revealHandler?.(time);
}

// If `x` (canvas px) is within GRIP_PX of an edge of the selection [start, end], returns the
// *opposite* edge's time (the anchor that stays fixed while the grabbed edge is dragged);
// otherwise null. `timeToPx` converts a time in seconds to a canvas x coordinate.
export function nearSelectionEdge(x, timeToPx, start, end) {
  if (start == null || end == null || start === end) return null;
  let low = Math.min(start, end),
    high = Math.max(start, end),
    distanceToLow = Math.abs(x - timeToPx(low)),
    distanceToHigh = Math.abs(x - timeToPx(high));
  return Math.min(distanceToLow, distanceToHigh) > GRIP_PX
    ? null
    : distanceToLow <= distanceToHigh
      ? high
      : low;
}

// Moves the active file's playhead to `time` (clamped to the clip) and scrolls it into view.
export function seekTo(time) {
  let state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  if (!activeFile) return;
  time = Math.max(0, Math.min(activeFile.audioBuffer.duration, time));
  state.setCurrentTime(time);
  revealTime(time);
}

// Sets one edge ('start' or anything else = end) of the active file's selection to `time`.
// With no existing selection, the other edge is the playhead if it lies on the far side of
// `time`, otherwise the clip end (for 'start') / clip start (for 'end').
export function setSelectionEdge(edge, time) {
  let state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  if (!activeFile) return;
  let duration = activeFile.audioBuffer.duration,
    selectionStart = activeFile.selectionStart,
    selectionEnd = activeFile.selectionEnd,
    hasSelection =
      selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd;
  time = Math.max(0, Math.min(duration, time));
  if (edge === 'start') {
    let otherEdge = hasSelection
      ? Math.max(selectionStart, selectionEnd)
      : activeFile.currentTime > time
        ? activeFile.currentTime
        : duration;
    state.setSelection(time, otherEdge);
  } else {
    let otherEdge = hasSelection
      ? Math.min(selectionStart, selectionEnd)
      : activeFile.currentTime < time
        ? activeFile.currentTime
        : 0;
    state.setSelection(otherEdge, time);
  }
  revealTime(time);
}

// Parses `ss`, `mm:ss` or `hh:mm:ss` (each part may carry a decimal fraction) into seconds.
// Returns null for anything else.
export function parseTime(text) {
  let parts = String(text).trim().split(':');
  if (parts.length > 3 || parts.some((part) => !/^(\d+\.?\d*|\.\d+)$/.test(part.trim())))
    return null;
  let seconds = 0;
  for (let part of parts) seconds = seconds * 60 + Number(part);
  return Number.isFinite(seconds) ? seconds : null;
}
