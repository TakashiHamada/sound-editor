// Right-hand panel with collapsible effect sections: Volume (gain slider with live preview while
// dragging, applied to the selection on release), Fade (fade-in / fade-out durations) and Noise
// Reduction (capture a noise profile from the selection, then apply it at a chosen strength).
import { useState, useRef, useCallback } from 'react';
import { colors } from '../theme.js';
import { useEditorStore } from '../store/editorStore.js';
import { dbToGain, formatDb } from '../utils/format.js';

const styles = {
  panel: {
    width: 260,
    minWidth: 260,
    backgroundColor: colors.bgPanel,
    borderLeft: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
  content: { flex: 1, overflowY: 'auto' },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    backgroundColor: colors.bgDark,
    borderBottom: `1px solid ${colors.border}`,
    cursor: 'pointer',
    userSelect: 'none',
    fontSize: 11,
    fontWeight: 600,
    color: colors.text,
  },
  sectionBody: {
    padding: '10px 12px',
    borderBottom: `1px solid ${colors.border}`,
  },
  label: {
    color: colors.textDim,
    fontSize: 11,
    marginBottom: 4,
    display: 'block',
  },
  slider: {
    width: '100%',
    height: 4,
    appearance: 'auto',
    cursor: 'pointer',
    accentColor: colors.accent,
  },
  sliderValue: {
    color: colors.accent,
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'right',
    marginBottom: 8,
  },
  row: { display: 'flex', gap: 6, marginTop: 8 },
  button: {
    flex: 1,
    padding: '5px 8px',
    backgroundColor: colors.border,
    border: `1px solid ${colors.borderLight}`,
    borderRadius: 3,
    color: colors.text,
    fontSize: 11,
    cursor: 'pointer',
    textAlign: 'center',
    transition: 'background-color 0.15s',
  },
  buttonDisabled: {
    flex: 1,
    padding: '5px 8px',
    backgroundColor: colors.bg,
    border: `1px solid ${colors.border}`,
    borderRadius: 3,
    color: colors.textDisabled,
    fontSize: 11,
    cursor: 'not-allowed',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    padding: '4px 8px',
    backgroundColor: colors.bgDark,
    border: `1px solid ${colors.border}`,
    borderRadius: 3,
    color: colors.text,
    fontSize: 11,
    fontFamily: 'monospace',
    outline: 'none',
    boxSizing: 'border-box',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  statusText: {
    fontSize: 10,
    marginTop: 8,
    padding: '4px 6px',
    borderRadius: 3,
  },
  chevron: { fontSize: 10, color: colors.textDim },
};

const buttonStyleFor = (enabled) => (enabled ? styles.button : styles.buttonDisabled);

export function EffectsPanel({
  hasAudio,
  hasSelection,
  hasNoiseProfile,
  onAdjustVolume,
  onFadeIn,
  onFadeOut,
  onCaptureNoiseProfile,
  onApplyNoiseReduction,
}) {
  const [gainDb, setGainDb] = useState(0);
  const [fadeInSeconds, setFadeInSeconds] = useState('1.0');
  const [fadeOutSeconds, setFadeOutSeconds] = useState('1.0');
  const [noiseStrength, setNoiseStrength] = useState(50);
  const [isCapturingNoise, setIsCapturingNoise] = useState(false);
  const [isVolumeOpen, setIsVolumeOpen] = useState(true);
  const [isFadeOpen, setIsFadeOpen] = useState(true);
  const [isNoiseOpen, setIsNoiseOpen] = useState(true);
  // True between pointer-down and pointer-up on the gain slider.
  const isDraggingGainRef = useRef(false);
  // Latest gain (dB) while dragging; applied to the selection on release.
  const pendingGainDbRef = useRef(0);
  const showsCapturedProfile = hasNoiseProfile && !isCapturingNoise;

  // Start previewing the slider gain live (via the store's previewGain) on pointer-down.
  const startGainPreview = useCallback((db) => {
    isDraggingGainRef.current = true;
    pendingGainDbRef.current = db;
    useEditorStore.getState().setPreviewGain(dbToGain(db));
  }, []);

  const updateGainPreview = useCallback((db) => {
    pendingGainDbRef.current = db;
    useEditorStore.getState().setPreviewGain(dbToGain(db));
  }, []);

  // On release: clear the preview, apply a non-zero gain to the selection and reset the slider.
  const commitGainPreview = useCallback(() => {
    const db = pendingGainDbRef.current;
    useEditorStore.getState().setPreviewGain(null);
    isDraggingGainRef.current = false;
    if (db !== 0) {
      onAdjustVolume(dbToGain(db), true);
      setGainDb(0);
      pendingGainDbRef.current = 0;
    }
  }, [onAdjustVolume]);

  return (
    <div style={styles.panel}>
      <div style={styles.content}>
        <div style={styles.sectionHeader} onClick={() => setIsVolumeOpen(!isVolumeOpen)}>
          <span>VOLUME</span>
          <span style={styles.chevron}>{isVolumeOpen ? '▼' : '▶'}</span>
        </div>
        {isVolumeOpen && (
          <div style={styles.sectionBody}>
            <span style={styles.label}>Gain</span>
            <div style={styles.sliderValue}>{formatDb(gainDb)}</div>
            <input
              type="range"
              min={-20}
              max={20}
              step={0.1}
              value={gainDb}
              onMouseDown={(e) => {
                startGainPreview(Number(e.target.value));
              }}
              onTouchStart={(e) => {
                startGainPreview(Number(e.target.value));
              }}
              onChange={(e) => {
                const db = Number(e.target.value);
                setGainDb(db);
                if (isDraggingGainRef.current) updateGainPreview(db);
              }}
              onMouseUp={() => {
                if (isDraggingGainRef.current) commitGainPreview();
              }}
              onTouchEnd={() => {
                if (isDraggingGainRef.current) commitGainPreview();
              }}
              disabled={!hasAudio || !hasSelection}
              style={{
                ...styles.slider,
                opacity: hasAudio && hasSelection ? 1 : 0.4,
                cursor: hasAudio && hasSelection ? 'pointer' : 'not-allowed',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 9,
                color: colors.textDim,
                marginTop: 2,
              }}
            >
              <span>-20 dB</span>
              <span>0</span>
              <span>+20 dB</span>
            </div>
          </div>
        )}
        <div style={styles.sectionHeader} onClick={() => setIsFadeOpen(!isFadeOpen)}>
          <span>FADE</span>
          <span style={styles.chevron}>{isFadeOpen ? '▼' : '▶'}</span>
        </div>
        {isFadeOpen && (
          <div style={styles.sectionBody}>
            <span style={styles.label}>Fade In Duration (seconds)</span>
            <div style={styles.inputRow}>
              <input
                type="number"
                min="0"
                step="0.1"
                value={fadeInSeconds}
                onChange={(e) => setFadeInSeconds(e.target.value)}
                style={{ ...styles.input, flex: 1 }}
              />
              <button
                style={{ ...buttonStyleFor(hasAudio && hasSelection), flex: 'none', width: 60 }}
                disabled={!hasAudio || !hasSelection}
                onClick={() => onFadeIn(parseFloat(fadeInSeconds) || 0)}
              >
                Apply
              </button>
            </div>
            <span style={styles.label}>Fade Out Duration (seconds)</span>
            <div style={styles.inputRow}>
              <input
                type="number"
                min="0"
                step="0.1"
                value={fadeOutSeconds}
                onChange={(e) => setFadeOutSeconds(e.target.value)}
                style={{ ...styles.input, flex: 1 }}
              />
              <button
                style={{ ...buttonStyleFor(hasAudio && hasSelection), flex: 'none', width: 60 }}
                disabled={!hasAudio || !hasSelection}
                onClick={() => onFadeOut(parseFloat(fadeOutSeconds) || 0)}
              >
                Apply
              </button>
            </div>
          </div>
        )}
        <div style={styles.sectionHeader} onClick={() => setIsNoiseOpen(!isNoiseOpen)}>
          <span>NOISE REDUCTION</span>
          <span style={styles.chevron}>{isNoiseOpen ? '▼' : '▶'}</span>
        </div>
        {isNoiseOpen && (
          <div style={styles.sectionBody}>
            <button
              style={{ ...buttonStyleFor(hasAudio && hasSelection), width: '100%' }}
              disabled={!hasAudio || !hasSelection}
              onClick={() => {
                // Hide the "captured" status, then run the capture 100ms later.
                setIsCapturingNoise(true);
                setTimeout(() => {
                  onCaptureNoiseProfile();
                  setIsCapturingNoise(false);
                }, 100);
              }}
            >
              Capture Noise Profile
            </button>
            <div
              style={{
                ...styles.statusText,
                backgroundColor: showsCapturedProfile ? colors.successBg : colors.inactiveBg,
                color: showsCapturedProfile ? colors.success : colors.textDim,
              }}
            >
              {showsCapturedProfile ? '✓ Noise profile captured' : 'No noise profile captured'}
            </div>
            <div style={{ marginTop: 12 }}>
              <span style={styles.label}>Strength</span>
              <div style={styles.sliderValue}>{noiseStrength}%</div>
              <input
                type="range"
                min={0}
                max={100}
                value={noiseStrength}
                onChange={(e) => setNoiseStrength(Number(e.target.value))}
                style={styles.slider}
              />
            </div>
            <div style={{ marginTop: 8 }}>
              <button
                style={{
                  ...buttonStyleFor(hasAudio && hasSelection && hasNoiseProfile),
                  width: '100%',
                }}
                disabled={!hasAudio || !hasSelection || !hasNoiseProfile}
                onClick={() => onApplyNoiseReduction(noiseStrength / 100)}
              >
                Apply Noise Reduction
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
