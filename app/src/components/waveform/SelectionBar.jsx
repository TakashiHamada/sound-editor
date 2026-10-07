// Selection bar under the waveform scrollbar: jump-to-start/end buttons, editable In/Out time
// fields with "set to clip edge" and "set to playhead" buttons, the selection length readout and
// a Clear button.

import { useRef, useState } from 'react';
import { parseTime, seekTo, setSelectionEdge } from '../../selection/selectionActions.js';
import { useEditorStore } from '../../store/editorStore.js';
import { formatTime } from '../../utils/format.js';

export const SELECTION_BAR_HEIGHT = 32;

const buttonStyle = {
  height: 24,
  minWidth: 28,
  padding: '0 7px',
  border: '1px solid #3a3a5a',
  borderRadius: 3,
  background: '#16213e',
  color: '#e0e0e0',
  fontSize: 12,
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

// Small bar button. Mouse-down is prevented so clicking it does not steal focus (e.g. from a
// time field being edited).
function SelectionBarButton({ label, title, onClick, disabled, color }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      style={{
        ...buttonStyle,
        ...(color ? { color: color } : {}),
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {label}
    </button>
  );
}

// Labelled time input. Shows `value` formatted until focused; while editing keeps a local draft.
// Enter / blur commits a parseable changed draft via `onCommit` (an unparseable draft is flagged
// red on Enter, discarded on blur); Escape discards the draft.
function TimeField({ label, title, value, onCommit, disabled }) {
  let [draft, setDraft] = useState(null),
    [isInvalid, setIsInvalid] = useState(false),
    // Text shown when the field gained focus; an unchanged draft is not committed.
    valueOnFocusRef = useRef(''),
    // Set when Enter/Escape already handled the edit, so the following blur is ignored.
    skipNextBlurRef = useRef(false),
    displayValue = value == null ? '' : formatTime(value),
    commitDraft = () => {
      if (draft === null || draft === valueOnFocusRef.current) {
        setDraft(null);
        setIsInvalid(false);
        return true;
      }
      let parsedTime = parseTime(draft);
      if (parsedTime === null) {
        setIsInvalid(true);
        return false;
      }
      setDraft(null);
      setIsInvalid(false);
      onCommit(parsedTime);
      return true;
    };
  return (
    <label
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        color: '#8888aa',
        fontSize: 11,
        flexShrink: 0,
      }}
    >
      {label}
      <input
        type="text"
        disabled={disabled}
        value={draft ?? displayValue}
        placeholder="mm:ss.mmm"
        spellCheck={false}
        onFocus={(event) => {
          valueOnFocusRef.current = displayValue;
          setDraft(displayValue);
          setIsInvalid(false);
          event.target.select();
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          setIsInvalid(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            if (commitDraft()) {
              skipNextBlurRef.current = true;
              event.currentTarget.blur();
            }
          } else if (event.key === 'Escape') {
            event.preventDefault();
            setDraft(null);
            setIsInvalid(false);
            skipNextBlurRef.current = true;
            event.currentTarget.blur();
          }
        }}
        onBlur={() => {
          if (skipNextBlurRef.current) {
            skipNextBlurRef.current = false;
            return;
          }
          if (!commitDraft()) {
            setDraft(null);
            setIsInvalid(false);
          }
        }}
        style={{
          width: 86,
          height: 24,
          padding: '0 6px',
          background: '#0f0f1a',
          color: '#e0e0e0',
          border: `1px solid ${isInvalid ? '#ef5350' : '#2a2a4a'}`,
          borderRadius: 3,
          fontFamily: 'monospace',
          fontSize: 12,
          outline: 'none',
        }}
      />
    </label>
  );
}

export function SelectionBar({ audioBuffer, selectionStart, selectionEnd, currentTime }) {
  let duration = audioBuffer ? audioBuffer.duration : 0,
    hasSelection =
      selectionStart != null && selectionEnd != null && selectionStart !== selectionEnd,
    selectionLow = hasSelection ? Math.min(selectionStart, selectionEnd) : null,
    selectionHigh = hasSelection ? Math.max(selectionStart, selectionEnd) : null,
    // Called as a plain function (not rendered as a component), as in the original.
    renderDivider = () => (
      <div
        style={{
          width: 1,
          height: 18,
          background: '#2a2a4a',
          margin: '0 4px',
          flexShrink: 0,
        }}
      />
    );
  return (
    <div
      data-selbar=""
      style={{
        height: SELECTION_BAR_HEIGHT,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 6px',
        borderTop: '1px solid #2a2a4a',
        background: '#0f0f1a',
        overflowX: 'auto',
        overflowY: 'hidden',
        userSelect: 'none',
      }}
    >
      <SelectionBarButton
        label="⏮ Start"
        title="Jump playhead to the very start (Home)"
        onClick={() => seekTo(0)}
      />
      <SelectionBarButton
        label="End ⏭"
        title="Jump playhead to the very end (End)"
        onClick={() => seekTo(duration)}
      />
      {renderDivider()}
      <SelectionBarButton
        label="⇤"
        title="Set selection start to the very start of the clip (Shift+Home)"
        onClick={() => setSelectionEdge('start', 0)}
      />
      <TimeField
        label="In"
        title="Selection start — type a time (e.g. 1:23.456 or 83.456) and press Enter"
        value={selectionLow}
        onCommit={(time) => setSelectionEdge('start', time)}
      />
      <SelectionBarButton
        label="◆"
        title="Set selection start to the playhead"
        color="#ff5722"
        onClick={() => setSelectionEdge('start', currentTime)}
      />
      {renderDivider()}
      <TimeField
        label="Out"
        title="Selection end — type a time (e.g. 1:23.456 or 83.456) and press Enter"
        value={selectionHigh}
        onCommit={(time) => setSelectionEdge('end', time)}
      />
      <SelectionBarButton
        label="◆"
        title="Set selection end to the playhead"
        color="#ff5722"
        onClick={() => setSelectionEdge('end', currentTime)}
      />
      <SelectionBarButton
        label="⇥"
        title="Set selection end to the very end of the clip (Shift+End)"
        onClick={() => setSelectionEdge('end', duration)}
      />
      {renderDivider()}
      <span
        style={{
          color: '#8888aa',
          fontSize: 11,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {'Length '}
        <span style={{ color: '#e0e0e0', fontFamily: 'monospace' }}>
          {hasSelection ? `${(selectionHigh - selectionLow).toFixed(3)}s` : '--'}
        </span>
      </span>
      <SelectionBarButton
        label="Clear"
        title="Clear selection"
        disabled={!hasSelection}
        onClick={() => useEditorStore.getState().setSelection(null, null)}
      />
    </div>
  );
}
