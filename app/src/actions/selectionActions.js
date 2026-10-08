// Playhead and selection actions on the active file: seeking, setting / clearing selection edges
// (Home / End shortcuts, the selection bar) and the "reveal" hook that scrolls the waveform so a
// given time is on screen.
import { getSelectionRange, useEditorStore } from '../store/editorStore.js';

// Registered by the mounted WaveformView; scrolls the view so a given time becomes visible.
let revealHandler = null;

export function setRevealHandler(handler) {
  revealHandler = handler;
}

export function revealTime(time) {
  revealHandler?.(time);
}

// Moves the active file's playhead to `time` (clamped to the clip) and scrolls it into view.
export function seekTo(time) {
  const state = useEditorStore.getState();
  const activeFile = state.getActiveFile();
  if (!activeFile) return;
  time = Math.max(0, Math.min(activeFile.audioBuffer.duration, time));
  state.setCurrentTime(time);
  revealTime(time);
}

// Sets one edge ('start' or anything else = end) of the active file's selection to `time`.
// With no existing selection, the other edge is the playhead if it lies on the far side of
// `time`, otherwise the clip end (for 'start') / clip start (for 'end').
export function setSelectionEdge(edge, time) {
  const state = useEditorStore.getState();
  const activeFile = state.getActiveFile();
  if (!activeFile) return;
  const duration = activeFile.audioBuffer.duration;
  const playhead = activeFile.currentTime;
  const range = getSelectionRange(activeFile);
  time = Math.max(0, Math.min(duration, time));
  if (edge === 'start') {
    let otherEdge = duration;
    if (range) otherEdge = range.end;
    else if (playhead > time) otherEdge = playhead;
    state.setSelection(time, otherEdge);
  } else {
    let otherEdge = 0;
    if (range) otherEdge = range.start;
    else if (playhead < time) otherEdge = playhead;
    state.setSelection(otherEdge, time);
  }
  revealTime(time);
}

export function clearSelection() {
  useEditorStore.getState().setSelection(null, null);
}

// Home / End and Shift+Home / Shift+End. The clamp in seekTo / setSelectionEdge turns Infinity
// into the clip duration.
export const jumpToStart = () => seekTo(0);
export const jumpToEnd = () => seekTo(Infinity);
export const selectToStart = () => setSelectionEdge('start', 0);
export const selectToEnd = () => setSelectionEdge('end', Infinity);
