// Runs a (possibly long) async task behind the "processing" overlay: shows `message`, yields one
// macrotask so the overlay can paint, runs the task and always clears the overlay afterwards.
import { useEditorStore } from '../store/editorStore.js';

export async function runWithProcessing(message, task) {
  useEditorStore.getState().setProcessing(message);
  // Let React render the ProcessingModal before the (synchronous-heavy) task starts.
  await new Promise((resolve) => setTimeout(resolve, 0));
  try {
    return await task();
  } finally {
    useEditorStore.getState().setProcessing(null);
  }
}
