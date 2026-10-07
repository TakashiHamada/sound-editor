// Export Settings modal: edits a draft copy of the export config (preset, format, sample rate,
// SRC quality, channels, WAV bit depth / MP3 bitrate, stereo mode, lowpass), shows a predicted
// output size versus the 16-bit WAV-equivalent source, and saves the normalised config.
import { useState, useEffect } from 'react';
import { colors } from '../theme.js';
import { formatBytes } from '../utils/format.js';
import {
  defaultExportConfig,
  estimateOutputBytes,
  estimateSourceBytes,
  nearestMp3SampleRate,
  normalizeWavBitDepth,
  normalizeExportConfig,
  sampleRateOptions,
} from '../export/exportConfig.js';

// Small down-pointing triangle used as the custom <select> arrow.
const SELECT_ARROW_IMAGE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238888aa'/%3E%3C/svg%3E")`;

export function ExportSettingsModal({
  isOpen,
  onClose,
  audioBuffer,
  fileName,
  exportConfig,
  onSaveConfig,
}) {
  const [draft, setDraft] = useState({
    ...(exportConfig ?? defaultExportConfig(audioBuffer, fileName)),
  });
  const [isSaveHovered, setIsSaveHovered] = useState(false);
  const [isCancelHovered, setIsCancelHovered] = useState(false);
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  // Reset the draft from the saved config (or the file's defaults) whenever the modal opens.
  useEffect(() => {
    if (isOpen) setDraft({ ...(exportConfig ?? defaultExportConfig(audioBuffer, fileName)) });
    // The buffer cannot change while the modal is open (it blocks the editor), so it is not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, fileName, exportConfig]);

  const sourceSampleRate = audioBuffer?.sampleRate ?? 44100;
  // SRC quality only matters when the export rate differs from the decoded buffer's rate.
  const needsResample = normalizeExportConfig(draft).sampleRate !== sourceSampleRate;
  const duration = audioBuffer?.duration ?? 0;
  const sourceBytes = estimateSourceBytes(audioBuffer, duration);
  const outputBytes = estimateOutputBytes(draft, duration);

  if (!isOpen) return null;

  // Editing any individual field switches the preset selector to "Custom".
  const updateField = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value, preset: 'custom' }));
  };

  const applyPreset = (preset) => {
    setDraft((previous) => {
      const next = { ...previous, preset };
      if (preset === 'music_high') {
        Object.assign(next, {
          mp3Mode: 'joint',
          lowpass: 20000,
          channels: 'stereo',
          bitrate: 192,
          format: 'mp3',
          // MPEG-2 rates (< 32 kHz) would cap the bitrate at 160 kbps, so jump to 44.1 kHz.
          sampleRate: next.sampleRate < 32000 ? 44100 : nearestMp3SampleRate(next.sampleRate),
        });
      } else if (preset === 'music_small') {
        Object.assign(next, {
          mp3Mode: 'joint',
          lowpass: 16000,
          channels: 'stereo',
          bitrate: 128,
          format: 'mp3',
          sampleRate: next.sampleRate < 32000 ? 44100 : nearestMp3SampleRate(next.sampleRate),
        });
      } else if (preset === 'voice') {
        Object.assign(next, {
          mp3Mode: 'joint',
          lowpass: 15000,
          channels: 'mono',
          sampleRate: 22050,
          bitrate: 64,
          format: 'mp3',
        });
      }
      return next;
    });
  };

  const inputStyle = (field) => ({
    width: '100%',
    padding: '8px 10px',
    backgroundColor: colors.bgInput,
    color: colors.text,
    border: `1px solid ${focusedField === field ? colors.accent : colors.border}`,
    borderRadius: 4,
    fontSize: 13,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  });

  const selectStyle = (field, disabled = false) => ({
    ...inputStyle(field),
    appearance: 'none',
    backgroundImage: SELECT_ARROW_IMAGE,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 28,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  });

  const labelStyle = {
    display: 'block',
    marginBottom: 4,
    fontSize: 12,
    color: colors.textDim,
    textAlign: 'left',
  };

  const fieldStyle = { marginBottom: 14 };

  const sectionHeadingStyle = {
    fontSize: 13,
    fontWeight: 600,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 4,
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        zIndex: 9999,
      }}
      onMouseDown={(event) => {
        // Close only when the backdrop itself (not the dialog) is clicked.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 500,
          backgroundColor: colors.bg,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
          boxShadow: '0 16px 48px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflow: 'hidden',
        }}
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
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: colors.textBright,
            }}
          >
            Export Settings
          </h2>
          <button
            onClick={onClose}
            onMouseEnter={() => setIsCloseHovered(true)}
            onMouseLeave={() => setIsCloseHovered(false)}
            style={{
              background: 'none',
              border: 'none',
              color: isCloseHovered ? colors.textBright : colors.textDim,
              fontSize: 20,
              cursor: 'pointer',
              padding: '2px 6px',
              lineHeight: 1,
              borderRadius: 4,
              transition: 'color 0.15s',
            }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Preset</label>
            <select
              value={draft.preset || 'custom'}
              onChange={(event) => applyPreset(event.target.value)}
              onFocus={() => setFocusedField('preset')}
              onBlur={() => setFocusedField(null)}
              style={selectStyle('preset')}
            >
              <option value="music_high">Music — High Quality (192 kbps, 20 kHz)</option>
              <option value="music_small">Music — Small Size (128 kbps, 16 kHz)</option>
              <option value="voice">Voice / Podcast (mono 22 kHz, 64 kbps)</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Format</label>
            <select
              value={draft.format}
              onChange={(event) => updateField('format', event.target.value)}
              onFocus={() => setFocusedField('format')}
              onBlur={() => setFocusedField(null)}
              style={selectStyle('format')}
            >
              <option value="wav">WAV</option>
              <option value="mp3">MP3</option>
            </select>
          </div>
          <div style={sectionHeadingStyle}>Audio Settings</div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Sample Rate</label>
            <select
              value={normalizeExportConfig(draft).sampleRate}
              onChange={(event) => updateField('sampleRate', Number(event.target.value))}
              onFocus={() => setFocusedField('sampleRate')}
              onBlur={() => setFocusedField(null)}
              style={selectStyle('sampleRate')}
            >
              {sampleRateOptions(draft).map((rate) => (
                <option key={rate} value={rate}>
                  {rate.toLocaleString()}
                  {' Hz'}
                </option>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>SRC Quality</label>
            <select
              value={draft.srcQuality}
              onChange={(event) => updateField('srcQuality', event.target.value)}
              onFocus={() => setFocusedField('srcQuality')}
              onBlur={() => setFocusedField(null)}
              disabled={!needsResample}
              style={selectStyle('srcQuality', !needsResample)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Channels</label>
            <select
              value={draft.channels}
              onChange={(event) => updateField('channels', event.target.value)}
              onFocus={() => setFocusedField('channels')}
              onBlur={() => setFocusedField(null)}
              style={selectStyle('channels')}
            >
              <option value="mono">Mono</option>
              <option value="stereo">Stereo</option>
            </select>
          </div>
          {draft.format === 'wav' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Bit Depth</label>
              <select
                value={normalizeWavBitDepth(draft.bitDepth)}
                onChange={(event) => updateField('bitDepth', Number(event.target.value))}
                onFocus={() => setFocusedField('bitDepth')}
                onBlur={() => setFocusedField(null)}
                style={selectStyle('bitDepth')}
              >
                <option value={8}>8 bit</option>
                <option value={16}>16 bit</option>
                <option value={24}>24 bit</option>
                <option value={32}>32 bit</option>
              </select>
            </div>
          )}
          {draft.format === 'mp3' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Bitrate (CBR)</label>
              <select
                value={draft.bitrate}
                onChange={(event) => updateField('bitrate', Number(event.target.value))}
                onFocus={() => setFocusedField('bitrate')}
                onBlur={() => setFocusedField(null)}
                style={selectStyle('bitrate')}
              >
                <option value={32}>32 kbps (very small)</option>
                <option value={48}>48 kbps</option>
                <option value={64}>64 kbps (voice)</option>
                <option value={80}>80 kbps</option>
                <option value={96}>96 kbps</option>
                <option value={112}>112 kbps</option>
                <option value={128}>128 kbps (small music)</option>
                <option value={160}>160 kbps</option>
                <option value={192}>192 kbps (standard)</option>
                <option value={224}>224 kbps</option>
                <option value={256}>256 kbps</option>
                <option value={320}>320 kbps (max)</option>
              </select>
              {normalizeExportConfig(draft).bitrate !== draft.bitrate && (
                <div
                  style={{
                    fontSize: 11,
                    color: colors.warning,
                    marginTop: 4,
                    textAlign: 'left',
                  }}
                >
                  {`${normalizeExportConfig(draft).sampleRate.toLocaleString()} Hz (MPEG-2) supports at most 160 kbps — ${normalizeExportConfig(draft).bitrate} kbps will be used.`}
                </div>
              )}
            </div>
          )}
          {draft.format === 'mp3' && draft.channels === 'stereo' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Stereo Mode</label>
              <select
                value={draft.mp3Mode || 'joint'}
                onChange={(event) => updateField('mp3Mode', event.target.value)}
                onFocus={() => setFocusedField('mp3mode')}
                onBlur={() => setFocusedField(null)}
                style={selectStyle('mp3mode')}
              >
                <option value="joint">Joint Stereo (recommended)</option>
                <option value="stereo">Stereo (independent L/R)</option>
              </select>
            </div>
          )}
          {draft.format === 'mp3' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Lowpass Filter</label>
              <select
                value={draft.lowpass ?? 0}
                onChange={(event) => updateField('lowpass', Number(event.target.value))}
                onFocus={() => setFocusedField('lowpass')}
                onBlur={() => setFocusedField(null)}
                style={selectStyle('lowpass')}
              >
                <option value={0}>Off (auto)</option>
                <option value={22000}>22 kHz</option>
                <option value={20000}>20 kHz</option>
                <option value={18000}>18 kHz (good for music)</option>
                <option value={16000}>16 kHz</option>
                <option value={15000}>15 kHz (good for voice)</option>
                <option value={14000}>14 kHz</option>
                <option value={12000}>12 kHz (aggressive)</option>
              </select>
            </div>
          )}
          <div style={sectionHeadingStyle}>Output Preview</div>
          <div
            style={{
              backgroundColor: colors.bgPanel,
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 20,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: colors.textDim,
                  marginBottom: 4,
                }}
              >
                Estimated Size
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: colors.textBright,
                  fontWeight: 500,
                }}
              >
                {formatBytes(Math.round(outputBytes))}
              </div>
              <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2 }}>
                {'from '}
                {formatBytes(Math.round(sourceBytes))}
                {' (16-bit WAV eq.)'}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: colors.textDim,
                  marginBottom: 4,
                }}
              >
                Compression
              </div>
              <div
                style={{
                  fontSize: 14,
                  color:
                    outputBytes / sourceBytes < 0.5
                      ? colors.success
                      : outputBytes / sourceBytes < 0.85
                        ? colors.textBright
                        : colors.warning,
                  fontWeight: 500,
                }}
              >
                {sourceBytes > 0 ? ((outputBytes / sourceBytes) * 100).toFixed(1) : '—'}
                {'%'}
              </div>
              <div style={{ fontSize: 10, color: colors.textDim, marginTop: 2 }}>
                {'saves '}
                {sourceBytes > 0 ? (100 - (outputBytes / sourceBytes) * 100).toFixed(0) : '—'}
                {'%'}
              </div>
            </div>
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: colors.textDim,
                  marginBottom: 4,
                }}
              >
                Duration
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: colors.textBright,
                  fontWeight: 500,
                }}
              >
                {duration.toFixed(2)}
                {'s'}
              </div>
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '16px 20px',
            borderTop: `1px solid ${colors.border}`,
          }}
        >
          <button
            onClick={onClose}
            onMouseEnter={() => setIsCancelHovered(true)}
            onMouseLeave={() => setIsCancelHovered(false)}
            style={{
              padding: '8px 20px',
              backgroundColor: isCancelHovered ? colors.borderLight : 'transparent',
              color: colors.text,
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSaveConfig(normalizeExportConfig(draft));
              onClose();
            }}
            onMouseEnter={() => setIsSaveHovered(true)}
            onMouseLeave={() => setIsSaveHovered(false)}
            style={{
              padding: '8px 24px',
              backgroundColor: isSaveHovered ? colors.accentHover : colors.accent,
              color: colors.bgDark,
              border: 'none',
              borderRadius: 4,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.15s',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
