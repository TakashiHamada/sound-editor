// Transport actions: play/pause toggle and stop (which also rewinds to the start).
import { useEditorStore } from '../store/editorStore.js';
import { startPlayback, stopPlayback } from '../audio/playback.js';

// Pauses if playing. Otherwise plays the selection (if any) or from the playhead; a playhead
// parked at the very end (within 1 ms) restarts from 0.
export function togglePlayback() {
  const state = useEditorStore.getState(),
    activeFile = state.getActiveFile();
  if (!activeFile) return;
  if (state.isPlaying) {
    stopPlayback();
    state.setPlaying(false);
    return;
  }
  const offset =
      activeFile.selectionStart ??
      (activeFile.currentTime >= activeFile.audioBuffer.duration - 0.001
        ? 0
        : activeFile.currentTime),
    duration =
      activeFile.selectionStart !== null && activeFile.selectionEnd !== null
        ? activeFile.selectionEnd - activeFile.selectionStart
        : undefined;
  startPlayback(
    activeFile.audioBuffer,
    offset,
    duration,
    (time) => useEditorStore.getState().setCurrentTime(time),
    () => {
      const endedState = useEditorStore.getState();
      endedState.setPlaying(false);
      const file = endedState.getActiveFile();
      if (file) endedState.setCurrentTime(file.selectionStart ?? 0);
    },
  );
  state.setPlaying(true);
}

export function stopAndRewind() {
  stopPlayback();
  const state = useEditorStore.getState();
  state.setPlaying(false);
  state.setCurrentTime(0);
}
