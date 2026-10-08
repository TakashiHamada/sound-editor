// Left-hand panel: the list of open files (select, double-click to rename, close, drag & drop to
// open more), plus a "File Info" section for the active file with its export buttons and the
// predicted export size.
import { useState, useRef, useMemo, useEffect } from 'react';
import { colors } from '../theme.js';
import { useEditorStore } from '../store/editorStore.js';
import { useFileDrop } from '../hooks/useFileDrop.js';
import { originalFormat } from '../audio/bufferMeta.js';
import { formatTime, formatBytes, formatBitDepth } from '../utils/format.js';
import { defaultExportConfig, estimateOutputBytes } from '../export/exportConfig.js';

const styles = {
  panel: {
    width: 220,
    minWidth: 220,
    backgroundColor: colors.bgPanel,
    borderRight: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    padding: '8px 12px',
    backgroundColor: colors.bgDark,
    borderBottom: `1px solid ${colors.border}`,
    fontSize: 12,
    fontWeight: 600,
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fileList: { flex: 1, overflowY: 'auto', minHeight: 60 },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: 12,
    borderBottom: `1px solid ${colors.border}`,
    gap: 6,
    transition: 'background-color 0.1s',
  },
  fileName: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  closeBtn: {
    width: 16,
    height: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    color: colors.textDim,
    cursor: 'pointer',
    borderRadius: 3,
    flexShrink: 0,
    border: 'none',
    background: 'none',
    padding: 0,
  },
  infoSection: { borderTop: `1px solid ${colors.border}` },
  content: { padding: '12px' },
  noFile: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
  fileNameInfo: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: 500,
    marginBottom: 12,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    borderBottom: `1px solid ${colors.border}`,
  },
  label: { color: colors.textDim, fontSize: 11 },
  value: { color: colors.text, fontSize: 11, fontFamily: 'monospace' },
  renameInput: {
    flex: 1,
    background: colors.bgDark,
    border: `1px solid ${colors.accent}`,
    borderRadius: 2,
    color: colors.text,
    fontSize: 12,
    padding: '1px 4px',
    outline: 'none',
    fontFamily: 'inherit',
  },
  actionBtnBase: {
    flex: 1,
    height: 26,
    borderRadius: 3,
    fontSize: 11,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  exportBtn: {
    border: 'none',
    backgroundColor: colors.accent,
    color: colors.bgDark,
    fontWeight: 600,
  },
  settingsBtn: {
    border: `1px solid ${colors.border}`,
    backgroundColor: colors.bgDark,
    color: colors.textDim,
  },
  settingsBtnActive: {
    border: `1px solid ${colors.selection}`,
    backgroundColor: colors.selection,
    color: colors.bgDark,
    fontWeight: 600,
  },
};

// Inline file-name editor. Enter and blur commit (`onCommit('enter' | 'blur')`), Escape cancels.
// Double-clicks stay inside so selecting a word does not restart the rename;
// `stopClickPropagation` also keeps single clicks away from a parent that selects on click.
function RenameInput({ value, onChange, onCommit, onCancel, stopClickPropagation = false }) {
  return (
    <input
      style={styles.renameInput}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => onCommit('blur')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit('enter');
        else if (e.key === 'Escape') onCancel();
      }}
      autoFocus
      onClick={stopClickPropagation ? (e) => e.stopPropagation() : undefined}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  );
}

// Bottom "Preview" row: predicted size of `file` exported with the current (or default) settings.
function SizePreview({ file, exportConfig }) {
  const config = exportConfig ?? defaultExportConfig(file.audioBuffer, file.fileName);
  const estimatedBytes = estimateOutputBytes(config, file.audioBuffer.duration);
  return (
    <div style={{ ...styles.row, marginTop: 8 }}>
      <span style={styles.label}>Preview</span>
      <span style={styles.value}>{formatBytes(Math.round(estimatedBytes))}</span>
    </div>
  );
}

export function FilesPanel({
  files,
  activeFileId,
  onSelectFile,
  onCloseFile,
  onRenameFile,
  onExport,
  onOpenExportSettings,
  onResetExportSettings,
  hasCustomExportSettings,
  exportConfig,
  onFilesDrop,
}) {
  const maxFiles = useEditorStore((state) => state.maxFiles);
  const [renamingId, setRenamingId] = useState(null);
  // Which rename input is open: 'list' (file list row) or 'info' (File Info header).
  const [renameSource, setRenameSource] = useState('list');
  const renameSourceRef = useRef(renameSource);
  renameSourceRef.current = renameSource;
  const [renameText, setRenameText] = useState('');
  const [hoveredCloseId, setHoveredCloseId] = useState(null);
  const { isDragOver, dropHandlers } = useFileDrop(onFilesDrop, { ignoreLeaveIntoChildren: true });
  // Pending single-click selection; cancelled when the click turns out to be a double-click.
  const clickTimerRef = useRef(null);
  // When the list rename input was opened; a blur within 200ms of that is ignored.
  const renameStartedAtRef = useRef(0);
  const fileEntries = useMemo(() => Array.from(files.entries()), [files]);
  const activeFile = activeFileId ? (files.get(activeFileId) ?? null) : null;
  const activeBuffer = activeFile?.audioBuffer;
  const activeFormat = activeBuffer ? originalFormat(activeBuffer) : null;

  // Select after 250ms so that a double-click (rename) can cancel the pending selection.
  const handleItemClick = (id) => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      onSelectFile(id);
      clickTimerRef.current = null;
    }, 250);
  };

  const handleItemDoubleClick = (id, fileName) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    onSelectFile(id);
    setRenameText(fileName);
    setTimeout(() => {
      renameStartedAtRef.current = Date.now();
      setRenameSource('list');
      setRenamingId(id);
    }, 50);
  };

  // The File Info rename edits the active file; if another file becomes active (e.g. a dropped
  // file finishes loading) the rename is abandoned rather than left hidden with stale text.
  useEffect(() => {
    setRenamingId((id) => (id !== null && renameSourceRef.current === 'info' ? null : id));
  }, [activeFileId]);

  const commitRename = (reason) => {
    if (reason === 'blur' && Date.now() - renameStartedAtRef.current < 200) return;
    if (renamingId && renameText.trim()) onRenameFile(renamingId, renameText.trim());
    setRenamingId(null);
  };

  const cancelRename = () => setRenamingId(null);

  return (
    <div
      style={{
        ...styles.panel,
        outline: isDragOver ? `2px dashed ${colors.accent}` : 'none',
        outlineOffset: '-2px',
      }}
      {...dropHandlers}
    >
      <div style={styles.header}>
        <span>Files</span>
        <span style={{ fontSize: 10, color: colors.textDim }}>
          {files.size}/{maxFiles}
        </span>
      </div>
      <div style={styles.fileList}>
        {fileEntries.length === 0 ? (
          <div style={styles.noFile}>
            No file loaded
            <br />
            <span style={{ fontSize: 11, color: colors.textDim }}>Ctrl+O or drag & drop</span>
          </div>
        ) : (
          fileEntries.map(([id, file]) => {
            const isActive = id === activeFileId;
            return (
              <div
                key={id}
                style={{
                  ...styles.fileItem,
                  backgroundColor: isActive ? colors.accentDim : 'transparent',
                  color: isActive ? colors.text : colors.textDim,
                }}
                onClick={() => handleItemClick(id)}
                onDoubleClick={() => handleItemDoubleClick(id, file.fileName)}
              >
                {renamingId === id && renameSource === 'list' ? (
                  <RenameInput
                    value={renameText}
                    onChange={setRenameText}
                    onCommit={commitRename}
                    onCancel={cancelRename}
                    stopClickPropagation
                  />
                ) : (
                  <span style={styles.fileName} title={file.fileName}>
                    {file.fileName}
                    {file.modified ? '*' : ''}
                  </span>
                )}
                <button
                  style={{
                    ...styles.closeBtn,
                    color: hoveredCloseId === id ? colors.text : colors.textDim,
                    backgroundColor: hoveredCloseId === id ? colors.border : 'transparent',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseFile(id);
                  }}
                  onMouseEnter={() => setHoveredCloseId(id)}
                  onMouseLeave={() => setHoveredCloseId(null)}
                  title="Close file"
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>
      <div style={styles.infoSection}>
        <div style={styles.header}>File Info</div>
        <div style={styles.content}>
          {activeFile ? (
            <>
              <div
                style={{ ...styles.fileNameInfo, cursor: 'pointer' }}
                title="Double-click to rename"
                onDoubleClick={() => {
                  setRenameSource('info');
                  setRenamingId(activeFile.id);
                  setRenameText(activeFile.fileName);
                }}
              >
                {renamingId === activeFile.id && renameSource === 'info' ? (
                  <RenameInput
                    value={renameText}
                    onChange={setRenameText}
                    onCommit={commitRename}
                    onCancel={cancelRename}
                  />
                ) : (
                  activeFile.fileName
                )}
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Duration</span>
                <span style={styles.value}>{formatTime(activeBuffer.duration)}</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Sample Rate</span>
                <span style={styles.value}>{activeFormat.sampleRate} Hz</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Channels</span>
                <span style={styles.value}>{activeFormat.channels === 1 ? 'Mono' : 'Stereo'}</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Bit Depth</span>
                <span style={styles.value}>{formatBitDepth(activeFormat.bitDepth)}</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Samples</span>
                <span style={styles.value}>
                  {/* Counted at the source rate: the decoder may have resampled the file. */}
                  {Math.round(activeBuffer.duration * activeFormat.sampleRate).toLocaleString()}
                </span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Size</span>
                <span style={styles.value}>
                  {/* Fallback: in-memory size of the decoded 32-bit float samples. */}
                  {formatBytes(
                    activeBuffer._originalFileSize ||
                      activeBuffer.length * activeBuffer.numberOfChannels * 4,
                  )}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
                <button
                  onClick={onExport}
                  style={{ ...styles.actionBtnBase, ...styles.exportBtn }}
                  title="Export (Ctrl+Shift+E)"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = colors.accentHover;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = colors.accent;
                  }}
                >
                  Export
                </button>
                <button
                  onClick={onOpenExportSettings}
                  style={{
                    ...styles.actionBtnBase,
                    ...(hasCustomExportSettings ? styles.settingsBtnActive : styles.settingsBtn),
                  }}
                  title="Export settings"
                >
                  Settings{hasCustomExportSettings ? '*' : ''}
                </button>
                {hasCustomExportSettings && (
                  <button
                    onClick={onResetExportSettings}
                    style={{
                      ...styles.closeBtn,
                      color: colors.textDim,
                      backgroundColor: 'transparent',
                    }}
                    title="Reset settings"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = colors.text;
                      e.currentTarget.style.backgroundColor = colors.border;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = colors.textDim;
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              <SizePreview file={activeFile} exportConfig={exportConfig} />
            </>
          ) : (
            <div style={{ ...styles.noFile, marginTop: 8 }}>No file selected</div>
          )}
        </div>
      </div>
    </div>
  );
}
