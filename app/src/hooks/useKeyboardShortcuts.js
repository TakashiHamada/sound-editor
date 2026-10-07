// Global keyboard shortcuts (window keydown). Ignored while typing in form fields, while a modal
// dialog is open (`enabled` false) and while a long task shows the processing overlay. Only the
// first matching shortcut fires; matched keys have their default action prevented.
import { useEffect } from 'react';
import { seekTo, setSelectionEdge } from '../selection/selectionActions.js';
import { useEditorStore } from '../store/editorStore.js';

export function useKeyboardShortcuts(handlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const handleKeyDown = (event) => {
      // A running task (export, noise reduction, paste) would overwrite edits made meanwhile.
      if (useEditorStore.getState().processing !== null) return;
      const target = event.target;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      )
        return;
      const modifier = event.ctrlKey || event.metaKey;
      // Letter keys arrive upper-case with Shift or Caps Lock; compare case-insensitively and use
      // shiftKey to tell undo from redo.
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (modifier && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) handlers.onRedo();
        else handlers.onUndo();
      } else if (modifier && key === 'c') {
        event.preventDefault();
        handlers.onCopy();
      } else if (modifier && key === 'x') {
        event.preventDefault();
        handlers.onCut();
      } else if (modifier && key === 'v') {
        event.preventDefault();
        handlers.onPaste();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        handlers.onDelete();
      } else if (modifier && key === 'a') {
        event.preventDefault();
        handlers.onSelectAll();
      } else if (event.key === ' ') {
        event.preventDefault();
        handlers.onPlay();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        handlers.onStop();
      } else if (modifier && event.key === '=') {
        event.preventDefault();
        handlers.onZoomIn();
      } else if (modifier && event.key === '-') {
        event.preventDefault();
        handlers.onZoomOut();
      } else if (modifier && key === 'o') {
        event.preventDefault();
        handlers.onOpen();
      } else if (modifier && event.shiftKey && key === 'e') {
        event.preventDefault();
        handlers.onExport();
      } else if (event.key === 'Home') {
        // Home: jump to start; Shift+Home: extend the selection to the start.
        event.preventDefault();
        if (event.shiftKey) setSelectionEdge('start', 0);
        else seekTo(0);
      } else if (event.key === 'End') {
        // End: jump to end; Shift+End: extend the selection to the end (clamped to duration).
        event.preventDefault();
        if (event.shiftKey) setSelectionEdge('end', Infinity);
        else seekTo(Infinity);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handlers.onMoveLeft();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        handlers.onMoveRight();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers, enabled]);
}
