// Selection bar under the waveform scrollbar: jump-to-start/end buttons, editable In/Out time
// fields with "set to clip edge" and "set to playhead" buttons, the selection length readout and
// a Clear button.

import { useRef, useState } from 'react';
import {
  clearSelection,
  jumpToEnd,
  jumpToStart,
  selectToEnd,
  selectToStart,
  setSelectionEdge,
} from '../../actions/selectionActions.js';
import { getSelectionRange } from '../../store/editorStore.js';
import { colors } from '../../theme.js';
import { formatTime, parseTime } from '../../utils/format.js';
import { Divider } from '../Divider.jsx';
import { SELECTION_BAR_HEIGHT } from './layout.js';

const buttonStyle = {
  height: 24,
  minWidth: 28,
  padding: '0 7px',
  border: `1px solid ${colors.borderLight}`,
  borderRadius: 3,
  background: colors.bgPanel,
  color: colors.text,
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
        ...(color ? { color } : {}),
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
  const [draft, setDraft] = useState(null);
  const [isInvalid, setIsInvalid] = useState(false);
  // Text shown when the field gained focus; an unchanged draft is not committed.
  const valueOnFocusRef = useRef('');
  // Set when Enter/Escape already handled the edit, so the following blur is ignored.
  const skipNextBlurRef = useRef(false);
  const displayValue = value == null ? '' : formatTime(value);
  const commitDraft = () => {
    if (draft === null || draft === valueOnFocusRef.current) {
      setDraft(null);
      setIsInvalid(false);
      return true;
    }
    const parsedTime = parseTime(draft);
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
        color: colors.textDim,
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
          background: colors.bgInput,
          color: colors.text,
          border: `1px solid ${isInvalid ? colors.danger : colors.border}`,
          borderRadius: 3,
          fontFamily: 'monospace',
          fontSize: 12,
          outline: 'none',
        }}
      />
    </label>
  );
}

// Separator between the bar's control groups.
function BarDivider() {
  return <Divider height={18} colorProperty="background" margin="0 4px" flexShrink={0} />;
}

export function SelectionBar({ selectionStart, selectionEnd, currentTime }) {
  const range = getSelectionRange({ selectionStart, selectionEnd });
  return (
    <div
      style={{
        height: SELECTION_BAR_HEIGHT,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '0 6px',
        borderTop: `1px solid ${colors.border}`,
        background: colors.bgDark,
        overflowX: 'auto',
        overflowY: 'hidden',
        userSelect: 'none',
      }}
    >
      <SelectionBarButton
        label="⏮ Start"
        title="Jump playhead to the very start (Home)"
        onClick={jumpToStart}
      />
      <SelectionBarButton
        label="End ⏭"
        title="Jump playhead to the very end (End)"
        onClick={jumpToEnd}
      />
      <BarDivider />
      <SelectionBarButton
        label="⇤"
        title="Set selection start to the very start of the clip (Shift+Home)"
        onClick={selectToStart}
      />
      <TimeField
        label="In"
        title="Selection start — type a time (e.g. 1:23.456 or 83.456) and press Enter"
        value={range?.start ?? null}
        onCommit={(time) => setSelectionEdge('start', time)}
      />
      <SelectionBarButton
        label="◆"
        title="Set selection start to the playhead"
        color={colors.playhead}
        onClick={() => setSelectionEdge('start', currentTime)}
      />
      <BarDivider />
      <TimeField
        label="Out"
        title="Selection end — type a time (e.g. 1:23.456 or 83.456) and press Enter"
        value={range?.end ?? null}
        onCommit={(time) => setSelectionEdge('end', time)}
      />
      <SelectionBarButton
        label="◆"
        title="Set selection end to the playhead"
        color={colors.playhead}
        onClick={() => setSelectionEdge('end', currentTime)}
      />
      <SelectionBarButton
        label="⇥"
        title="Set selection end to the very end of the clip (Shift+End)"
        onClick={selectToEnd}
      />
      <BarDivider />
      <span
        style={{
          color: colors.textDim,
          fontSize: 11,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        Length{' '}
        <span style={{ color: colors.text, fontFamily: 'monospace' }}>
          {range ? `${(range.end - range.start).toFixed(3)}s` : '--'}
        </span>
      </span>
      <SelectionBarButton
        label="Clear"
        title="Clear selection"
        disabled={!range}
        onClick={clearSelection}
      />
    </div>
  );
}
