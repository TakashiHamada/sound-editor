// View/navigation actions: zoom in/out/fit and nudging the playhead with the arrow keys.
import { useEditorStore } from '../store/editorStore.js';

export function zoomIn() {
  const state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  if (activeFile) state.setZoom(activeFile.zoom * 1.5);
}

export function zoomOut() {
  const state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  if (activeFile) state.setZoom(activeFile.zoom / 1.5);
}

export function zoomToFit() {
  const state = useEditorStore.getState();
  state.setZoom(1);
  state.setScrollX(0);
}

// Playhead nudge per ArrowLeft/ArrowRight press, in seconds.
export const PLAYHEAD_STEP_SECONDS = 0.05;

export function movePlayheadLeft() {
  const activeFile = useEditorStore.getState().getActiveFile();
  if (!activeFile) return;
  const time = Math.max(0, activeFile.currentTime - PLAYHEAD_STEP_SECONDS);
  useEditorStore.getState().setCurrentTime(time);
}

export function movePlayheadRight() {
  const activeFile = useEditorStore.getState().getActiveFile();
  if (!activeFile) return;
  const time = Math.min(
    activeFile.audioBuffer.duration,
    activeFile.currentTime + PLAYHEAD_STEP_SECONDS,
  );
  useEditorStore.getState().setCurrentTime(time);
}
