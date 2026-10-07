// Left-hand panel: the list of open files (select, double-click to rename, close, drag & drop to
// open more), plus a "File Info" section for the active file with its export buttons and the
// predicted export size.
import { useState, useRef, useMemo, useEffect } from 'react';
import { colors } from '../theme.js';
import { formatTime, formatBytes } from '../utils/format.js';
import { defaultExportConfig, estimateOutputBytes } from '../export/exportConfig.js';

const panelColors = { ...colors, accentDim: '#2a6a8a' };

const styles = {
  panel: {
    width: 220,
    minWidth: 220,
    backgroundColor: panelColors.bgPanel,
    borderRight: `1px solid ${panelColors.border}`,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    padding: '8px 12px',
    backgroundColor: panelColors.bgDark,
    borderBottom: `1px solid ${panelColors.border}`,
    fontSize: 12,
    fontWeight: 600,
    color: panelColors.text,
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
    borderBottom: `1px solid ${panelColors.border}`,
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
    color: panelColors.textDim,
    cursor: 'pointer',
    borderRadius: 3,
    flexShrink: 0,
    border: 'none',
    background: 'none',
    padding: 0,
  },
  infoSection: { borderTop: `1px solid ${panelColors.border}` },
  content: { padding: '12px' },
  noFile: {
    color: panelColors.textDim,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
  fileNameInfo: {
    color: panelColors.accent,
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
    borderBottom: `1px solid ${panelColors.border}`,
  },
  label: { color: panelColors.textDim, fontSize: 11 },
  value: { color: panelColors.text, fontSize: 11, fontFamily: 'monospace' },
  renameInput: {
    flex: 1,
    background: panelColors.bgDark,
    border: `1px solid ${panelColors.accent}`,
    borderRadius: 2,
    color: panelColors.text,
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
    backgroundColor: panelColors.accent,
    color: '#0f0f1a',
    fontWeight: 600,
  },
  settingsBtn: {
    border: `1px solid ${panelColors.border}`,
    backgroundColor: panelColors.bgDark,
    color: panelColors.textDim,
  },
  settingsBtnActive: {
    border: '1px solid #ffd54f',
    backgroundColor: '#ffd54f',
    color: '#0f0f1a',
    fontWeight: 600,
  },
};

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
  const [renamingId, setRenamingId] = useState(null);
  // Which rename input is open: 'list' (file list row) or 'info' (File Info header).
  const [renameSource, setRenameSource] = useState('list');
  const renameSourceRef = useRef(renameSource);
  renameSourceRef.current = renameSource;
  const [renameText, setRenameText] = useState('');
  const [hoveredCloseId, setHoveredCloseId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  // Pending single-click selection; cancelled when the click turns out to be a double-click.
  const clickTimerRef = useRef(null);
  // When the list rename input was opened; a blur within 200ms of that is ignored.
  const renameStartedAtRef = useRef(0);
  const fileEntries = useMemo(() => Array.from(files.entries()), [files]);
  const activeFile = activeFileId ? (files.get(activeFileId) ?? null) : null;

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

  const handlePanelDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handlePanelDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  };

  const handlePanelDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0 && onFilesDrop)
      onFilesDrop(Array.from(droppedFiles));
  };

  // Bottom "Preview" row: predicted size of the exported file with the current (or default)
  // export settings. Called inline at its position in the tree, like the original IIFE.
  const renderSizePreview = () => {
    const config = exportConfig ?? defaultExportConfig(activeFile.audioBuffer, activeFile.fileName);
    const estimatedBytes = estimateOutputBytes(config, activeFile.audioBuffer.duration);
    return (
      <div style={{ ...styles.row, marginTop: 8 }}>
        <span style={styles.label}>Preview</span>
        <span style={styles.value}>{formatBytes(Math.round(estimatedBytes))}</span>
      </div>
    );
  };

  return (
    <div
      style={{
        ...styles.panel,
        outline: dragOver ? '2px dashed #4fc3f7' : 'none',
        outlineOffset: '-2px',
      }}
      onDragOver={handlePanelDragOver}
      onDragLeave={handlePanelDragLeave}
      onDrop={handlePanelDrop}
    >
      <div style={styles.header}>
        <span>Files</span>
        <span style={{ fontSize: 10, color: panelColors.textDim }}>
          {files.size}
          {'/8'}
        </span>
      </div>
      <div style={styles.fileList}>
        {fileEntries.length === 0 ? (
          <div style={styles.noFile}>
            {'No file loaded'}
            <br />
            <span style={{ fontSize: 11, color: panelColors.textDim }}>
              {'Ctrl+O or drag & drop'}
            </span>
          </div>
        ) : (
          fileEntries.map(([id, file]) => {
            const isActive = id === activeFileId;
            return (
              <div
                key={id}
                style={{
                  ...styles.fileItem,
                  backgroundColor: isActive ? panelColors.accentDim : 'transparent',
                  color: isActive ? panelColors.text : panelColors.textDim,
                }}
                onClick={() => handleItemClick(id)}
                onDoubleClick={() => handleItemDoubleClick(id, file.fileName)}
              >
                {renamingId === id && renameSource === 'list' ? (
                  <input
                    style={styles.renameInput}
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => commitRename('blur')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename('enter');
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    autoFocus={true}
                    onClick={(e) => e.stopPropagation()}
                    // Double-click selects a word; it must not restart the rename.
                    onDoubleClick={(e) => e.stopPropagation()}
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
                    color: hoveredCloseId === id ? panelColors.text : panelColors.textDim,
                    backgroundColor: hoveredCloseId === id ? panelColors.border : 'transparent',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseFile(id);
                  }}
                  onMouseEnter={() => setHoveredCloseId(id)}
                  onMouseLeave={() => setHoveredCloseId(null)}
                  title="Close file"
                >
                  {'×'}
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
                  <input
                    autoFocus={true}
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => commitRename('blur')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename('enter');
                      else if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onDoubleClick={(e) => e.stopPropagation()}
                    style={styles.renameInput}
                  />
                ) : (
                  activeFile.fileName
                )}
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Duration</span>
                <span style={styles.value}>{formatTime(activeFile.audioBuffer.duration)}</span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Sample Rate</span>
                <span style={styles.value}>
                  {activeFile.audioBuffer._originalSampleRate ?? activeFile.audioBuffer.sampleRate}
                  {' Hz'}
                </span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Channels</span>
                <span style={styles.value}>
                  {(activeFile.audioBuffer._originalChannels ??
                    activeFile.audioBuffer.numberOfChannels) === 1
                    ? 'Mono'
                    : 'Stereo'}
                </span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Bit Depth</span>
                <span style={styles.value}>
                  {activeFile.audioBuffer._originalBitDepth
                    ? activeFile.audioBuffer._originalBitDepth + '-bit'
                    : '32-bit float'}
                </span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Samples</span>
                <span style={styles.value}>
                  {(activeFile.audioBuffer._originalSampleRate
                    ? Math.round(
                        activeFile.audioBuffer.duration *
                          activeFile.audioBuffer._originalSampleRate,
                      )
                    : activeFile.audioBuffer.length
                  ).toLocaleString()}
                </span>
              </div>
              <div style={styles.row}>
                <span style={styles.label}>Size</span>
                <span style={styles.value}>
                  {activeFile.audioBuffer._originalFileSize
                    ? formatBytes(activeFile.audioBuffer._originalFileSize)
                    : // Fallback: in-memory size of the decoded 32-bit float samples.
                      formatBytes(
                        activeFile.audioBuffer.length * activeFile.audioBuffer.numberOfChannels * 4,
                      )}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 12 }}>
                <button
                  onClick={onExport}
                  style={{ ...styles.actionBtnBase, ...styles.exportBtn }}
                  title="Export (Ctrl+Shift+E)"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#81d4fa';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = panelColors.accent;
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
                  {'Settings'}
                  {hasCustomExportSettings ? '*' : ''}
                </button>
                {hasCustomExportSettings && (
                  <button
                    onClick={onResetExportSettings}
                    style={{
                      ...styles.closeBtn,
                      color: panelColors.textDim,
                      backgroundColor: 'transparent',
                    }}
                    title="Reset settings"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = panelColors.text;
                      e.currentTarget.style.backgroundColor = panelColors.border;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = panelColors.textDim;
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {'×'}
                  </button>
                )}
              </div>
              {renderSizePreview()}
            </>
          ) : (
            <div style={{ ...styles.noFile, marginTop: 8 }}>No file selected</div>
          )}
        </div>
      </div>
    </div>
  );
}
