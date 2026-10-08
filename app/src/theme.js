// Shared colour palette of the dark UI (inline styles and canvas drawing). Modal backdrops and
// drop shadows (translucent black) stay with the component that draws them.

export const colors = {
  // Surfaces
  bg: '#1a1a2e',
  bgDark: '#0f0f1a',
  bgInput: '#0f0f1a',
  bgPanel: '#16213e',
  waveformBg: '#0a0a18',
  border: '#2a2a4a',
  borderLight: '#3a3a5a',

  // Text
  text: '#e0e0e0',
  textDim: '#8888aa',
  textBright: '#ffffff',
  textDisabled: '#555566',
  textEmpty: '#555', // status-bar log before the first message

  // Accents
  accent: '#4fc3f7',
  accentHover: '#81d4fa',
  accentDim: '#2a6a8a', // active file row
  waveform: '#4fc3f7',
  selection: '#ffd54f', // selection edges, grips and tinted peaks; "custom settings" highlight
  selectionOverlay: 'rgba(255, 213, 79, 0.08)',
  playhead: '#ff5722',
  centerLine: '#1a1a30', // zero-amplitude line of each waveform lane
  clipGuide: 'rgba(255, 68, 68, 0.25)', // dashed amplitude-0.9 guides on the waveform
  rulerMinorTick: '#444466',

  // Status
  danger: '#ef5350',
  success: '#66bb6a',
  successBg: '#1a3a2a',
  inactiveBg: '#2a1a1a', // "No noise profile captured"
  warning: '#ffa726',
  logInfo: '#4caf50',
  logError: '#f44336',

  // Level meter
  meterBg: '#1a1a30',
  meterLevel: '#4caf50',
  meterClip: '#f44336',
  meterPeak: '#81c784',
  meterClipLine: 'rgba(255, 68, 68, 0.4)',
};
