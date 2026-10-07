// Root component: lays out toolbar, files panel, waveform, effects panel, status bar and modals,
// wires them to the store and the module-level actions, and installs the keyboard shortcuts.
import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useEditorStore } from './store/editorStore.js';
import { loadFiles, closeFile, closeAllFiles } from './actions/fileActions.js';
import { togglePlayback, stopAndRewind, stopIfPlaying } from './actions/playbackActions.js';
import {
  undo,
  redo,
  copySelection,
  cutSelection,
  pasteClipboard,
  deleteSelection,
  selectAll,
  adjustVolume,
  fadeIn,
  fadeOut,
  captureNoiseProfileFromSelection,
  applyNoiseReductionWithStrength,
} from './actions/editActions.js';
import {
  zoomIn,
  zoomOut,
  zoomToFit,
  movePlayheadLeft,
  movePlayheadRight,
} from './actions/viewActions.js';
import {
  exportWithCurrentSettings,
  saveExportConfig,
  resetExportConfig,
} from './actions/exportActions.js';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts.js';
import { Toolbar } from './components/Toolbar.jsx';
import { WaveformView } from './components/waveform/WaveformView.jsx';
import { FilesPanel } from './components/FilesPanel.jsx';
import { EffectsPanel } from './components/EffectsPanel.jsx';
import { StatusBar } from './components/StatusBar.jsx';
import { ExportSettingsModal } from './components/ExportSettingsModal.jsx';
import { ProcessingModal } from './components/ProcessingModal.jsx';
import { HelpDialog } from './components/HelpDialog.jsx';

export function App() {
  const state = useEditorStore();
  const fileInputRef = useRef(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const activeFile = state.getActiveFile();
  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);
  const handleFileInputChange = useCallback(async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await loadFiles(Array.from(files));
    // Reset so picking the same file again still fires `change`.
    event.target.value = '';
  }, []);
  const handleFilesDrop = useCallback(async (files) => {
    await loadFiles(files);
  }, []);
  useKeyboardShortcuts(
    useMemo(
      () => ({
        onUndo: undo,
        onRedo: redo,
        onCopy: copySelection,
        onCut: cutSelection,
        onPaste: pasteClipboard,
        onDelete: deleteSelection,
        onSelectAll: selectAll,
        onPlay: togglePlayback,
        onStop: stopAndRewind,
        onZoomIn: zoomIn,
        onZoomOut: zoomOut,
        onOpen: openFilePicker,
        onExport: exportWithCurrentSettings,
        onMoveLeft: movePlayheadLeft,
        onMoveRight: movePlayheadRight,
      }),
      // The actions are module-level functions; only the file-picker callback is component state.
      [openFilePicker],
    ),
    // Modal dialogs own the keyboard while open.
    !isSettingsOpen,
  );
  // Playback belongs to the file that started it: switching, loading or closing files stops it.
  const activeFileId = state.activeFileId;
  useEffect(() => {
    stopIfPlaying();
  }, [activeFileId]);
  const hasAudio = !!activeFile;
  const hasSelection = activeFile
    ? activeFile.selectionStart !== null && activeFile.selectionEnd !== null
    : false;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple={true}
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />
      <HelpDialog />
      <Toolbar
        isPlaying={state.isPlaying}
        onPlay={togglePlayback}
        onStop={stopAndRewind}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomToFit={zoomToFit}
        onSelectAll={selectAll}
        onOpenFile={openFilePicker}
        onCloseAll={closeAllFiles}
        hasAudio={hasAudio}
        hasAnyFiles={state.files.size > 0}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <FilesPanel
          files={state.files}
          activeFileId={state.activeFileId}
          onSelectFile={state.setActiveFile}
          onCloseFile={closeFile}
          onRenameFile={state.renameFile}
          onExport={exportWithCurrentSettings}
          onOpenExportSettings={() => setIsSettingsOpen(true)}
          onResetExportSettings={resetExportConfig}
          hasCustomExportSettings={state.exportConfig !== null}
          exportConfig={state.exportConfig}
          onFilesDrop={handleFilesDrop}
        />
        <WaveformView
          audioBuffer={activeFile?.audioBuffer ?? null}
          zoom={activeFile?.zoom ?? 1}
          scrollX={activeFile?.scrollX ?? 0}
          selectionStart={activeFile?.selectionStart ?? null}
          selectionEnd={activeFile?.selectionEnd ?? null}
          currentTime={activeFile?.currentTime ?? 0}
          previewGain={state.previewGain}
          onSelectionChange={state.setSelection}
          onSeek={state.setCurrentTime}
          onZoomChange={state.setZoom}
          onScrollXChange={state.setScrollX}
          onFilesDrop={handleFilesDrop}
        />
        <EffectsPanel
          hasAudio={hasAudio}
          hasSelection={hasSelection}
          hasNoiseProfile={!!activeFile?.noiseProfile}
          onAdjustVolume={adjustVolume}
          onFadeIn={fadeIn}
          onFadeOut={fadeOut}
          onCaptureNoiseProfile={captureNoiseProfileFromSelection}
          onApplyNoiseReduction={applyNoiseReductionWithStrength}
        />
      </div>
      <StatusBar
        audioBuffer={activeFile?.audioBuffer ?? null}
        currentTime={activeFile?.currentTime ?? 0}
        selectionStart={activeFile?.selectionStart ?? null}
        selectionEnd={activeFile?.selectionEnd ?? null}
        zoom={activeFile?.zoom ?? 1}
        historyIndex={activeFile?.historyIndex ?? 0}
        historyLength={activeFile?.history.length ?? 0}
        clipboard={state.clipboard}
        isPlaying={state.isPlaying}
        logMessage={state.logMessage}
      />
      <ExportSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        audioBuffer={activeFile?.audioBuffer ?? null}
        fileName={activeFile?.fileName ?? ''}
        exportConfig={state.exportConfig}
        onSaveConfig={saveExportConfig}
      />
      <ProcessingModal message={state.processing} />
    </div>
  );
}
