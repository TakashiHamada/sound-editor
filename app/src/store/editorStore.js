// Global editor state (zustand): open files with their per-file view/selection/undo state,
// playback flag, clipboard, export settings, status-bar log and the processing overlay.

import { create } from 'zustand';
import { getAudioContext } from '../audio/audioContext.js';
import { copyOriginalMeta } from '../audio/bufferMeta.js';
import { cloneAudioBuffer } from '../audio/bufferOps.js';

// Zoom limits: 1 = the whole file fits the view.
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 1000;

// The selection of `file` (anything with selectionStart / selectionEnd) as `{ start, end }` with
// start < end, or null when there is no selection or it is empty (zero length).
export function getSelectionRange(file) {
  const start = file?.selectionStart;
  const end = file?.selectionEnd;
  if (start == null || end == null || start === end) return null;
  return { start: Math.min(start, end), end: Math.max(start, end) };
}

// Returns a new Map with `patch` merged into file `id`, or the same Map if the file is missing.
function updateFile(files, id, patch) {
  const file = files.get(id);
  if (!file) return files;
  const nextFiles = new Map(files);
  nextFiles.set(id, { ...file, ...patch });
  return nextFiles;
}

// State for `file` after its audio is replaced by `audioBuffer`: the selection and playhead are
// clamped into the new duration (a selection that falls entirely outside it is dropped).
function withRestoredBuffer(file, audioBuffer, historyIndex) {
  const duration = audioBuffer.duration;
  const clamp = (time) => Math.max(0, Math.min(duration, time));
  let { selectionStart, selectionEnd } = file;
  if (selectionStart !== null && selectionEnd !== null) {
    selectionStart = clamp(selectionStart);
    selectionEnd = clamp(selectionEnd);
    if (selectionStart === selectionEnd) selectionStart = selectionEnd = null;
  }
  return {
    audioBuffer,
    historyIndex,
    selectionStart,
    selectionEnd,
    currentTime: clamp(file.currentTime),
  };
}

export const useEditorStore = create((set, get) => ({
  files: new Map(),
  activeFileId: null,
  maxFiles: 8,
  maxHistory: 10,
  isPlaying: false,
  clipboard: null,
  exportConfig: null,
  previewGain: null,
  logMessage: null,
  processing: null,

  // Adds a file and makes it active. Returns its id, or null when `maxFiles` is reached.
  addFile: (audioBuffer, fileName) => {
    const state = get();
    if (state.files.size >= state.maxFiles) return null;
    const id = crypto.randomUUID();
    const file = {
      id,
      audioBuffer,
      fileName,
      selectionStart: null,
      selectionEnd: null,
      zoom: MIN_ZOOM,
      scrollX: 0,
      currentTime: 0,
      noiseProfile: null,
      history: [cloneAudioBuffer(getAudioContext(), audioBuffer)],
      historyIndex: 0,
      modified: false,
    };
    const files = new Map(state.files);
    files.set(id, file);
    set({ files, activeFileId: id });
    return id;
  },

  // Removes a file; if it was active, the first remaining file becomes active.
  removeFile: (id) => {
    const state = get();
    if (!state.files.has(id)) return;
    const files = new Map(state.files);
    files.delete(id);
    let activeFileId = state.activeFileId;
    if (activeFileId === id) {
      const first = files.keys().next();
      activeFileId = first.done ? null : first.value;
    }
    set({ files, activeFileId });
  },

  setActiveFile: (id) => {
    if (get().files.has(id)) set({ activeFileId: id });
  },

  renameFile: (id, fileName) => {
    set({ files: updateFile(get().files, id, { fileName }) });
  },

  clearAllFiles: () => {
    set({ files: new Map(), activeFileId: null });
  },

  // Replaces the active file's buffer (inheriting original-file metadata) and keeps the playhead
  // within the new duration.
  setAudioBuffer: (audioBuffer) => {
    const { activeFileId, files } = get();
    if (activeFileId) {
      copyOriginalMeta(files.get(activeFileId)?.audioBuffer, audioBuffer);
      set({
        files: updateFile(files, activeFileId, {
          audioBuffer,
          currentTime: Math.min(files.get(activeFileId)?.currentTime ?? 0, audioBuffer.duration),
        }),
      });
    }
  },

  // Sets the active file's selection, clamping both ends to the duration and ordering them.
  setSelection: (start, end) => {
    const { activeFileId, files } = get();
    const duration = files.get(activeFileId)?.audioBuffer?.duration;
    if (duration != null) {
      if (start !== null) start = Math.max(0, Math.min(duration, start));
      if (end !== null) end = Math.max(0, Math.min(duration, end));
    }
    if (start !== null && end !== null && start > end) [start, end] = [end, start];
    if (activeFileId)
      set({ files: updateFile(files, activeFileId, { selectionStart: start, selectionEnd: end }) });
  },

  setZoom: (zoom) => {
    const { activeFileId, files } = get();
    if (activeFileId)
      set({
        files: updateFile(files, activeFileId, {
          zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)),
        }),
      });
  },

  setScrollX: (scrollX) => {
    const { activeFileId, files } = get();
    if (activeFileId)
      set({
        files: updateFile(files, activeFileId, {
          scrollX: Number.isFinite(scrollX) ? Math.max(0, scrollX) : 0,
        }),
      });
  },

  setCurrentTime: (time) => {
    const { activeFileId, files } = get();
    const duration = files.get(activeFileId)?.audioBuffer?.duration;
    if (duration != null) time = Math.max(0, Math.min(duration, time));
    if (activeFileId) set({ files: updateFile(files, activeFileId, { currentTime: time }) });
  },

  setNoiseProfile: (noiseProfile) => {
    const { activeFileId, files } = get();
    if (activeFileId) set({ files: updateFile(files, activeFileId, { noiseProfile }) });
  },

  setPlaying: (isPlaying) => set({ isPlaying }),
  setClipboard: (clipboard) => set({ clipboard }),
  setExportConfig: (exportConfig) => set({ exportConfig }),
  setPreviewGain: (previewGain) => set({ previewGain }),

  // Status-bar message. `detail` (shown on demand) defaults to the text itself.
  log: (text, level = 'info', detail) =>
    set({
      logMessage: {
        text,
        detail: detail ?? text,
        level,
        timestamp: Date.now(),
      },
    }),

  setProcessing: (processing) => set({ processing }),

  // Records `audioBuffer` as a new undo step for the active file, dropping any redo steps and
  // the oldest step beyond `maxHistory`. Does not change the file's current buffer.
  pushHistory: (audioBuffer) => {
    const { activeFileId, files, maxHistory } = get();
    if (!activeFileId) return;
    const file = files.get(activeFileId);
    if (!file) return;
    copyOriginalMeta(file.audioBuffer, audioBuffer);
    const snapshot = cloneAudioBuffer(getAudioContext(), audioBuffer);
    const history = file.history.slice(0, file.historyIndex + 1);
    history.push(snapshot);
    if (history.length > maxHistory) history.shift();
    set({
      files: updateFile(files, activeFileId, {
        history,
        historyIndex: Math.min(history.length - 1, file.historyIndex + 1),
        modified: true,
      }),
    });
  },

  undo: () => {
    const { activeFileId, files } = get();
    if (!activeFileId) return;
    const file = files.get(activeFileId);
    if (!file || file.historyIndex <= 0) return;
    const restored = cloneAudioBuffer(getAudioContext(), file.history[file.historyIndex - 1]);
    set({
      files: updateFile(
        files,
        activeFileId,
        withRestoredBuffer(file, restored, file.historyIndex - 1),
      ),
    });
  },

  redo: () => {
    const { activeFileId, files } = get();
    if (!activeFileId) return;
    const file = files.get(activeFileId);
    if (!file || file.historyIndex >= file.history.length - 1) return;
    const restored = cloneAudioBuffer(getAudioContext(), file.history[file.historyIndex + 1]);
    set({
      files: updateFile(
        files,
        activeFileId,
        withRestoredBuffer(file, restored, file.historyIndex + 1),
      ),
    });
  },

  getActiveFile: () => {
    const { activeFileId, files } = get();
    return activeFileId ? (files.get(activeFileId) ?? null) : null;
  },
}));
