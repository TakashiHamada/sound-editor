// Shared visual theme: color palette, font stacks and fixed layout sizes used by every component.

export const theme = {
  colors: {
    bg: '#1a1a2e',
    bgDark: '#0f0f1a',
    bgPanel: '#16213e',
    bgHeader: '#1a1a2e',
    bgInput: '#0f0f1a',
    bgHover: '#1f3460',
    bgActive: '#253d6b',
    border: '#2a2a4a',
    borderLight: '#3a3a5a',
    text: '#e0e0e0',
    textDim: '#8888aa',
    textBright: '#ffffff',
    accent: '#4fc3f7',
    accentDark: '#0288d1',
    accentHover: '#81d4fa',
    waveform: '#4fc3f7',
    waveformBg: '#0a0a18',
    selection: 'rgba(79, 195, 247, 0.25)',
    selectionBorder: '#4fc3f7',
    playhead: '#ff5722',
    danger: '#ef5350',
    success: '#66bb6a',
    warning: '#ffa726',
    scrollbar: '#2a2a4a',
    scrollbarHover: '#3a3a5a',
  },
  fonts: {
    main: `'Segoe UI', 'Roboto', 'Helvetica Neue', sans-serif`,
    mono: `'Consolas', 'Monaco', 'Courier New', monospace`,
  },
  sizes: {
    menuBarHeight: 30,
    toolbarHeight: 40,
    statusBarHeight: 24,
    panelMinWidth: 200,
  },
};

export const colors = theme.colors;
