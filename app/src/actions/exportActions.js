// Export actions: one-click export of the active file with the saved settings (or per-file
// defaults), and saving/resetting the saved export settings.
import { useEditorStore } from '../store/editorStore.js';
import { defaultExportConfig } from '../export/exportConfig.js';
import { exportActiveFile } from '../export/exportActiveFile.js';
import { runWithProcessing } from './runWithProcessing.js';

export async function exportWithCurrentSettings() {
  const state = useEditorStore.getState();
  const activeFile = state.getActiveFile();
  if (!activeFile) return;
  const config =
    state.exportConfig ?? defaultExportConfig(activeFile.audioBuffer, activeFile.fileName);
  await runWithProcessing('Exporting...', async () => {
    try {
      await exportActiveFile(config);
    } catch (error) {
      useEditorStore
        .getState()
        .log('Export failed', 'error', `Export failed: ${error.message}\n${error.stack}`);
    }
  });
}

export function saveExportConfig(config) {
  useEditorStore.getState().setExportConfig(config);
  useEditorStore
    .getState()
    .log(`Export settings saved (${config.format}, ${config.sampleRate}Hz, ${config.channels})`);
}

export function resetExportConfig() {
  useEditorStore.getState().setExportConfig(null);
  useEditorStore.getState().log('Export settings reset to default');
}
