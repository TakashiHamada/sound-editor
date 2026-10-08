// Progress reporting for long synchronous loops (MP3 encoding, noise reduction): updates the
// processing overlay with a 20-segment bar and yields to the event loop so the UI can repaint.
import { useEditorStore } from '../store/editorStore.js';

// Minimum time (ms) between two reports; each report also yields one macrotask.
const REPORT_INTERVAL_MS = 30;
const BAR_SEGMENTS = 20;

// Returns `async (done, total) => …` for a loop to await after each unit of work. When more than
// REPORT_INTERVAL_MS passed since the previous yield (or since creation), it shows
// `${label} ${bar} ${percent}%` and yields; otherwise it returns immediately.
export function createProgressReporter(label) {
  let lastYield = performance.now();
  return async (done, total) => {
    if (performance.now() - lastYield <= REPORT_INTERVAL_MS) return;
    const percent = Math.round((done / total) * 100);
    const filled = Math.round(percent / (100 / BAR_SEGMENTS));
    const bar = '█'.repeat(filled) + '░'.repeat(BAR_SEGMENTS - filled);
    useEditorStore.getState().setProcessing(`${label} ${bar} ${percent}%`);
    await new Promise((resolve) => setTimeout(resolve));
    lastYield = performance.now();
  };
}
