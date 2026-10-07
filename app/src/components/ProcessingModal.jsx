// Full-screen blocking overlay shown while a long operation runs. It swallows clicks/keys
// immediately, but only dims the screen and shows the message + indeterminate progress bar after
// the operation has lasted 500 ms (so quick operations don't flash a dialog).

import { useState, useEffect } from 'react';

// Keyframes for the indeterminate progress bar (rendered inside a <style> element; the exact
// whitespace is part of the rendered DOM).
const PROCESSING_BAR_KEYFRAMES = `
            @keyframes processing-bar {
              0% { transform: translateX(-100%); }
              50% { transform: translateX(250%); }
              100% { transform: translateX(-100%); }
            }
          `;

export function ProcessingModal({ message }) {
  const [isDialogVisible, setIsDialogVisible] = useState(false);
  // Only re-run when the overlay switches between active and inactive, not on message changes.
  useEffect(() => {
    if (!message) {
      setIsDialogVisible(false);
      return;
    }
    const timer = setTimeout(() => setIsDialogVisible(true), 500);
    return () => clearTimeout(timer);
  }, [!!message]);
  return message ? (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDialogVisible ? 'rgba(0, 0, 0, 0.5)' : 'transparent',
        cursor: 'wait',
        transition: 'background-color 0.2s',
      }}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {isDialogVisible && (
        <div
          style={{
            backgroundColor: '#1a1a2e',
            border: '1px solid #2a2a4a',
            borderRadius: 8,
            padding: '24px 40px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            minWidth: 260,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6)',
          }}
        >
          <div style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 500 }}>{message}</div>
          <div
            style={{
              width: 200,
              height: 4,
              backgroundColor: '#2a2a4a',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: '40%',
                backgroundColor: '#4fc3f7',
                borderRadius: 2,
                animation: 'processing-bar 1.2s ease-in-out infinite',
              }}
            />
          </div>
          <style>{PROCESSING_BAR_KEYFRAMES}</style>
        </div>
      )}
    </div>
  ) : null;
}
