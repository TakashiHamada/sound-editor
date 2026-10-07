// Top-right version banner, the "?" help button, and the keyboard-shortcut / operations dialog it
// opens (also toggled with F1, closed with Escape or a click on the backdrop).

import { useState, useEffect } from 'react';
import { colors } from '../theme.js';
import { BUILD_BRANCH, BUILD_TIME } from '../version.js';

const SHORTCUT_SECTIONS = [
  {
    title: 'File',
    items: [
      { keys: 'Ctrl + O', desc: 'Open audio file' },
      { keys: 'Ctrl + Shift + E', desc: 'Quick export' },
      {
        keys: 'Drag & Drop',
        desc: 'Drop audio file onto waveform or file list',
      },
    ],
  },
  {
    title: 'Playback',
    items: [
      { keys: 'Space', desc: 'Play / Pause' },
      { keys: 'Escape', desc: 'Stop' },
      { keys: 'Home / End', desc: 'Jump to start / end' },
    ],
  },
  {
    title: 'Edit',
    items: [
      { keys: 'Ctrl + Z', desc: 'Undo' },
      { keys: 'Ctrl + Shift + Z', desc: 'Redo' },
      { keys: 'Ctrl + C', desc: 'Copy selection' },
      { keys: 'Ctrl + X', desc: 'Cut selection' },
      { keys: 'Ctrl + V', desc: 'Paste at cursor' },
      { keys: 'Ctrl + A', desc: 'Select all' },
      { keys: 'Delete / Backspace', desc: 'Delete selection' },
      { keys: 'Shift + Home / End', desc: 'Extend selection to start / end' },
    ],
  },
  {
    title: 'View',
    items: [
      { keys: 'Arrow Left / Right', desc: 'Move playhead' },
      { keys: 'Scroll wheel', desc: 'Zoom in / out (at cursor)' },
      { keys: 'Ctrl + =', desc: 'Zoom in' },
      { keys: 'Ctrl + -', desc: 'Zoom out' },
    ],
  },
  {
    title: 'Mouse Operations',
    items: [
      { keys: 'Click', desc: 'Set playhead position' },
      {
        keys: 'Click + Drag',
        desc: 'Select range (snaps to clip start / end)',
      },
      { keys: 'Drag selection edge', desc: 'Adjust selection start / end' },
    ],
  },
  {
    title: 'Noise Reduction',
    items: [
      { keys: '1. Select noise', desc: 'Select a noise-only section' },
      {
        keys: '2. Capture profile',
        desc: 'Effects > Noise Reduction > Capture',
      },
      { keys: '3. Select target', desc: 'Select range to clean (or all)' },
      { keys: '4. Apply', desc: 'Adjust strength & apply' },
    ],
  },
];

export function HelpDialog() {
  const [isOpen, setIsOpen] = useState(false);
  // F1 toggles the dialog; Escape closes it while open. Re-bound whenever `isOpen` changes.
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'F1') {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
      if (event.key === 'Escape' && isOpen) setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 50,
          fontSize: 10,
          fontFamily: 'monospace',
          color: colors.textDim,
          zIndex: 100,
          textAlign: 'right',
          lineHeight: 1.4,
          opacity: 0.7,
        }}
      >
        <span>
          {BUILD_BRANCH}
          {' | '}
          {BUILD_TIME}
        </span>
      </div>
      <div
        onClick={() => setIsOpen(true)}
        style={{
          position: 'absolute',
          top: 6,
          right: 12,
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          borderRadius: '50%',
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.bgDark,
          color: colors.textDim,
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'Georgia, serif',
          transition: 'all 0.15s',
          zIndex: 100,
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.color = colors.accent;
          event.currentTarget.style.borderColor = colors.accent;
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.color = colors.textDim;
          event.currentTarget.style.borderColor = colors.border;
        }}
        title="Keyboard Shortcuts (F1)"
      >
        ?
      </div>
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              backgroundColor: colors.bgDark,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
              width: 560,
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <span
                style={{
                  color: colors.textBright,
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                {'Keyboard Shortcuts & Operations'}
              </span>
              <div
                style={{
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: colors.textDim,
                  borderRadius: 4,
                  fontSize: 16,
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.color = colors.textBright;
                  event.currentTarget.style.backgroundColor = colors.border;
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.color = colors.textDim;
                  event.currentTarget.style.backgroundColor = 'transparent';
                }}
                onClick={() => setIsOpen(false)}
              >
                ×
              </div>
            </div>
            <div style={{ padding: '12px 20px 20px' }}>
              {SHORTCUT_SECTIONS.map((section) => (
                <div key={section.title} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      color: colors.accent,
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: 8,
                      paddingBottom: 4,
                      borderBottom: `1px solid ${colors.border}`,
                    }}
                  >
                    {section.title}
                  </div>
                  {section.items.map((item) => (
                    <div
                      key={item.keys}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '5px 0',
                        fontSize: 13,
                      }}
                    >
                      <span
                        style={{
                          color: colors.textBright,
                          fontFamily: 'monospace',
                          fontSize: 12,
                          backgroundColor: colors.bg,
                          padding: '2px 8px',
                          borderRadius: 3,
                          border: `1px solid ${colors.border}`,
                        }}
                      >
                        {item.keys}
                      </span>
                      <span style={{ color: colors.text, fontSize: 12 }}>{item.desc}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div
                style={{
                  textAlign: 'center',
                  color: colors.textDim,
                  fontSize: 11,
                  marginTop: 8,
                  paddingTop: 12,
                  borderTop: `1px solid ${colors.border}`,
                }}
              >
                {'Press '}
                <span style={{ fontFamily: 'monospace', color: colors.text }}>F1</span>
                {' or '}
                <span style={{ fontFamily: 'monospace', color: colors.text }}>Esc</span>
                {' to close'}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
