// Top toolbar: open / close-all, play-pause / stop, zoom controls and select-all buttons.

import { useState } from 'react';
import { colors } from '../theme.js';

// Flat toolbar button. `active` and `accent` render a filled accent background; `accent` buttons
// also use slightly smaller bold text. Hover is tracked in local state.
function ToolbarButton({
  label,
  onClick,
  disabled = false,
  active = false,
  accent = false,
  title,
  minWidth,
}) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: minWidth ?? 32,
        height: 28,
        padding: '0 8px',
        border: 'none',
        borderRadius: 3,
        backgroundColor: active
          ? colors.accent
          : accent && !disabled
            ? isHovered
              ? colors.accentHover
              : colors.accent
            : isHovered && !disabled
              ? colors.borderLight
              : 'transparent',
        color: disabled
          ? colors.textDim
          : active || accent
            ? colors.bgDark
            : isHovered
              ? colors.textBright
              : colors.text,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: accent ? 13 : 14,
        fontWeight: accent ? 600 : 'normal',
        fontFamily: 'Segoe UI, Arial, sans-serif',
        outline: 'none',
        opacity: disabled ? 0.4 : 1,
        transition: 'background-color 0.1s, color 0.1s',
      }}
    >
      {label}
    </button>
  );
}

// Thin vertical separator between button groups.
function ToolbarDivider() {
  return (
    <div
      style={{
        width: 1,
        height: 20,
        backgroundColor: colors.border,
        margin: '0 8px',
      }}
    />
  );
}

export function Toolbar({
  isPlaying,
  onPlay,
  onStop,
  onZoomIn,
  onZoomOut,
  onZoomToFit,
  onSelectAll,
  onOpenFile,
  onCloseAll,
  hasAudio,
  hasAnyFiles,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 40,
        backgroundColor: colors.bgPanel,
        borderBottom: `1px solid ${colors.border}`,
        padding: '0 8px',
        gap: 4,
        fontFamily: 'Segoe UI, Arial, sans-serif',
        userSelect: 'none',
      }}
    >
      <ToolbarButton
        label="Open"
        onClick={onOpenFile}
        title="Open File (Ctrl+O)"
        minWidth={44}
        accent={true}
      />
      <ToolbarButton
        label="Close All"
        onClick={onCloseAll}
        disabled={!hasAnyFiles}
        title="Close All Files"
        minWidth={64}
      />
      <ToolbarDivider />
      <ToolbarButton
        label={isPlaying ? '⏸' : '▶'}
        onClick={onPlay}
        disabled={!hasAudio}
        title={isPlaying ? 'Pause' : 'Play'}
      />
      <ToolbarButton label="⏹" onClick={onStop} disabled={!hasAudio} title="Stop" />
      <ToolbarDivider />
      <ToolbarButton label="+" onClick={onZoomIn} disabled={!hasAudio} title="Zoom In" />
      <ToolbarButton label="-" onClick={onZoomOut} disabled={!hasAudio} title="Zoom Out" />
      <ToolbarButton
        label="Fit"
        onClick={onZoomToFit}
        disabled={!hasAudio}
        title="Fit to Window"
        minWidth={40}
      />
      <ToolbarButton
        label="Select All"
        onClick={onSelectAll}
        disabled={!hasAudio}
        title="Select All (Ctrl+A)"
        minWidth={64}
      />
    </div>
  );
}
