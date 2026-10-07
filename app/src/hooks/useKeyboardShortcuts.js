// Global keyboard shortcuts (window keydown). Ignored while typing in form fields. Only the
// first matching shortcut fires; matched keys have their default action prevented.
import { useEffect } from 'react';
import { seekTo, setSelectionEdge } from '../selection/selectionActions.js';

export function useKeyboardShortcuts(handlers) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      )
        return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        handlers.onUndo();
      } else if (
        (modifier && event.key === 'z' && event.shiftKey) ||
        (modifier && event.key === 'Z')
      ) {
        event.preventDefault();
        handlers.onRedo();
      } else if (modifier && event.key === 'c') {
        event.preventDefault();
        handlers.onCopy();
      } else if (modifier && event.key === 'x') {
        event.preventDefault();
        handlers.onCut();
      } else if (modifier && event.key === 'v') {
        event.preventDefault();
        handlers.onPaste();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        handlers.onDelete();
      } else if (modifier && event.key === 'a') {
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
      } else if (modifier && event.key === 'o') {
        event.preventDefault();
        handlers.onOpen();
      } else if (modifier && event.shiftKey && event.key === 'E') {
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
  }, [handlers]);
}
