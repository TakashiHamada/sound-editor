# Sound Editor

Browser-based audio editor built with React 19 + Vite. Single-page application for loading, editing, and exporting audio files (WAV / MP3).

## Deployment

This repository contains **only the built/deployed output** (GitHub Pages). There is no source code (`.ts`, `.tsx`, etc.) in this repo. All application logic resides in the single bundled file:

```
index.html                          # Entry point
assets/index-wGz6QD6f.js           # Bundled app (~504KB, minified)
favicon.svg                         # Waveform icon
```

All modifications must be made directly to the minified bundle.

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 19.2.4 (Hooks, functional components) |
| Build Tool | Vite (module preloading) |
| State Management | Zustand-like custom store (`k`) |
| Audio Engine | Web Audio API (AudioContext, OfflineAudioContext) |
| MP3 Decode | mpg123 WASM decoder |
| MP3 Encode | Lame encoder (JS port) |
| Styling | Inline styles, dark theme |

## UI Layout

```
+------------------------------------------------------------------+
| Toolbar (bt)                                                     |
| [Play][Stop] [Zoom+][Zoom-][Fit][SelectAll] [Open][CloseAll]    |
+------------+-------------------------------+----------+----------+
| Files (At) | Waveform Display (Ot)         | Effects  | [?]      |
| - File list|   Canvas rendering            | (Nt)     | Help     |
| - File info|   Selection highlight         |          |          |
| - Duration |   Playhead cursor             | VOLUME   |          |
| - Rate/Ch  |   Drag & drop zone            |  Gain    |          |
| - Bit depth|                               |  Slider  |          |
| - Samples  |                               |          |          |
| - Size     |                               | FADE     |          |
|            |                               |  In/Out  |          |
| [Export]   |                               |          |          |
| [Settings] |                               | NOISE    |          |
|            |                               | REDUCTION|          |
+------------+-------------------------------+----------+----------+
| Status Bar (Ht)                                                 |
| [Log (220px fixed)] | Position | Selection | Zoom | History |Lvl |
+------------------------------------------------------------------+
```

### Component Map (minified names)

| Symbol | Component | Role |
|--------|-----------|------|
| `$t` | App | Root component, composes all panels |
| `bt` | Toolbar | Top bar with playback/zoom/file controls |
| `At` | FilesPanel | Left sidebar: file list, info, export |
| `Ot` | WaveformDisplay | Center: canvas waveform, selection, playhead |
| `Nt` | EffectsPanel | Right sidebar: volume, fade, noise reduction |
| `Ht` | StatusBar | Bottom: persistent log + time, selection, zoom, level meter |
| `Kt` | ExportSettingsModal | Export config dialog (format, rate, depth) |
| `Yt` | HelpDialog | Keyboard shortcuts overlay (F1) |
| `qt` | ProcessingModal | Loading/processing indicator overlay |

### Style/Color Constants (minified names)

| Symbol | Usage |
|--------|-------|
| `q` / `G` | `ht.colors` - Global color theme |
| `K` | FilesPanel styles |
| `Mt` | EffectsPanel styles |
| `Rt` | StatusBar styles |
| `Ut` | ExportSettingsModal styles |

Key colors:
- Background: `#1a1a2e` (body), `#0f0f1a` (panels)
- Border: `#2a2a4a`
- Accent: `#4fc3f7` (cyan), `#81d4fa` (hover)
- Text: `#e0e0e0` (normal), `#8888aa` (dim)

## State Store (`k`)

Zustand-like store created via `C()`. Access with `k()` (hook) or `k.getState()`.

### State Fields

```
{
  files: Map,                   // Map<string, FileData> - All loaded files
  activeFileId: null,           // Currently selected file ID (string or null)
  maxFiles: 8,                  // Max simultaneous files
  maxHistory: 10,               // Max undo history per file
  isPlaying: false,
  clipboard: null,              // { buffer, sampleRate, numberOfChannels } or null
  exportConfig: null,           // ExportConfig object or null (null = use original file props)
  previewGain: null,            // number or null
  logMessage: null,             // { text, detail, level, timestamp } or null
  processing: null              // string or null - Non-null shows processing modal
}
```

### FileData Structure

```
{
  id: "...",                   // crypto.randomUUID()
  audioBuffer: AudioBuffer,    // Decoded audio (Web Audio API)
  fileName: "example.wav",
  selectionStart: null,        // Seconds (number or null)
  selectionEnd: null,          // Seconds (number or null)
  zoom: 1,                     // 1 = default
  scrollX: 0,
  currentTime: 0,
  noiseProfile: null,          // Float32Array or null
  history: [],                 // Array of AudioBuffer snapshots
  historyIndex: 0,
  modified: false
}
```

Note: `audioBuffer._originalBitDepth` is set on WAV files at load time (8/16/24/32).

### ExportConfig Structure

```
{
  format: "wav",               // "wav" or "mp3"
  sampleRate: 44100,           // 8000-96000
  srcQuality: "medium",        // "low", "medium", or "high"
  channels: "stereo",          // "mono" or "stereo"
  bitDepth: 24,                // 8, 16, 24, or 32 (WAV only)
  bitrate: 192                 // 128, 192, 256, or 320 kbps (MP3 only)
}
```

**Important behavior**: When `exportConfig` is `null` (Settings never saved), export uses the original file's properties (sampleRate, channels, bitDepth from `_originalBitDepth`). Once the user opens Settings and clicks Save, `exportConfig` is set and those values take precedence. Reset (`setExportConfig(null)`) reverts to original-file behavior.

### Store Actions

| Action | Description |
|--------|-------------|
| `addFile(audioBuffer, fileName)` | Add file to store, returns ID |
| `removeFile(id)` | Close file |
| `setActiveFile(id)` | Switch active file |
| `renameFile(id, newName)` | Rename file |
| `setSelection(start, end)` | Set selection range (seconds) |
| `setZoom(zoom)` / `setScrollX(x)` | View control |
| `setCurrentTime(time)` | Move playhead |
| `setPlaying(bool)` | Playback state |
| `setClipboard(data)` | Copy buffer to clipboard |
| `setExportConfig(config|null)` | Set/reset export settings |
| `setPreviewGain(value|null)` | Live gain preview |
| `setNoiseProfile(profile)` | Store captured noise profile |
| `pushHistory(buffer)` | Push to undo stack |
| `undo()` / `redo()` | History navigation |
| `log(text, level, detail)` | Show status bar message |
| `setProcessing(message|null)` | Show/hide processing modal |

## Logging

The StatusBar has a persistent log area (220px, left side) that always shows the latest log message. Status info (Position, Selection, Zoom, etc.) is displayed alongside to the right.

- Log persists until the next log message arrives (no auto-fade)
- Shows "No log" in dim text when empty
- Click to copy detailed log text to clipboard
- Error level shown in red with `✘` icon; info level in green with `✔`

### Logged Operations

| Operation | Log Message Example |
|-----------|-------------------|
| File load | `Loaded "file.wav"` |
| File close | `Closed "file.wav"` |
| Close all | `Closed all files (3)` |
| Export | `Exported "file.mp3"` |
| Export fail | `Export failed` (error) |
| Undo / Redo | `Undo` / `Redo` |
| Copy | `Copied 2.50s` |
| Cut | `Cut 1.30s` |
| Paste | `Pasted 2.50s at 1.00s` |
| Delete | `Deleted 0.80s` |
| Volume | `Volume +3.0 dB` / `Volume -6.0 dB (selection)` |
| Fade In/Out | `Fade in (linear)` / `Fade out (exponential)` |
| Noise capture | `Noise profile captured (0.50s)` |
| Noise reduction | `Noise reduction applied (strength: 0.8)` |
| Export settings | `Export settings saved (wav, 44100Hz, stereo)` |
| Reset settings | `Export settings reset to default` |

### Adding New Logs

Use `k.getState().log(text, level, detail)`:
- `text`: Short message for StatusBar (keep under ~40 chars)
- `level`: `"info"` (default, green) or `"error"` (red)
- `detail`: Longer text copied to clipboard on click (defaults to `text`)

## Audio Processing Pipeline

### File Loading (`se` function)

Decoding fallback chain:
1. `decodeAudioData()` — native Web Audio API
2. Strip ID3 tags, retry `decodeAudioData()`
3. Try alternate sample rates (44100, 48000, 22050, 16000)
4. HTML Media Element fallback
5. mpg123 WASM decoder (MP3)

After decoding, WAV files get `_originalBitDepth` from header byte offset 34.

### Export

| Format | Function | Details |
|--------|----------|---------|
| WAV | `ut(audioBuffer, bitDepth)` | Writes RIFF/WAVE header + PCM data. 16-bit=PCM(1), 32-bit=Float(3) |
| MP3 | `ft(audioBuffer, bitrate)` | Lame encoder with VBR support, quality levels 1-9 |

Export flow (`j` callback):
1. Get active file and resolve config (`exportConfig ?? defaults from file`)
2. Resample if needed (`ye` function with quality setting)
3. Convert channels if needed (`be` function: stereo to mono)
4. Encode to WAV (`ut`) or MP3 (`ft`)
5. Trigger download via blob URL (`pt` function)

### Effects

| Effect | Implementation |
|--------|---------------|
| **Gain** | Slider -20 to +20 dB, real-time preview via `previewGain` |
| **Fade In** | Apply gain ramp from 0 to 1 over duration |
| **Fade Out** | Apply gain ramp from 1 to 0 over duration |
| **Noise Reduction** | 1) Capture noise profile from selection 2) Apply with strength 0-100% |

### Playback Engine

- `le(buffer, startTime, duration)` — Start playback
- `de()` — Stop and cleanup all audio nodes
- `ce()` — Animation frame loop for playhead position updates
- `pe()` — Real-time level metering (left/right peak detection)

Audio graph:
```
BufferSource → [ChannelSplitter → AnalyserL/R → ChannelMerger] → GainNode → Destination
```

### Clipboard Operations

| Operation | Function | Description |
|-----------|----------|-------------|
| Copy | `me(buffer, start, end)` | Extract selection to clipboard |
| Cut | `me()` + `he()` | Copy then delete selection |
| Paste | insert at cursor | Splice clipboard buffer at playhead |
| Delete | `he(buffer, start, end)` | Remove selection, join head+tail |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open audio file |
| `Ctrl+Shift+E` | Quick export |
| `Space` | Play / Pause |
| `Escape` | Stop |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+C` / `X` / `V` | Copy / Cut / Paste |
| `Ctrl+A` | Select all |
| `Delete` / `Backspace` | Delete selection |
| `Ctrl+=` / `Ctrl+-` | Zoom in / out |
| `Arrow Left/Right` | Move playhead |
| `Scroll wheel` | Zoom at cursor |
| `F1` | Toggle help dialog |
| Click | Set playhead |
| Click+Drag | Select range |
| Drag & Drop | Load audio file |

## Development Notes for AI Agents

### Working with the Minified Bundle

Since this repo has no source code, all changes are made to `assets/index-wGz6QD6f.js` directly.

**Searching for code:**
```bash
# grep -ao for context around a pattern (avoids binary file issues)
grep -ao '.\{0,200\}PATTERN.\{0,200\}' assets/index-wGz6QD6f.js

# Find byte offset of a pattern
grep -bao 'PATTERN' assets/index-wGz6QD6f.js

# Read N bytes from offset
dd if=assets/index-wGz6QD6f.js bs=1 skip=OFFSET count=LENGTH 2>/dev/null
```

**Key patterns for locating code:**
- Store definition: `var k=C((e,t)=>({files:new Map`
- Export function: `let j=(0,y.useCallback)(async()=>{let e=k.getState()`
- Settings modal: `function Kt({isOpen:e,onClose:t,audioBuffer:n`
- File loading: `async function Zt(e){await Xt(`
- WAV encoder: `function ut(e,t){let n=e.numberOfChannels`
- Help dialog: `Yt=()=>{let[e,t]=(0,y.useState)(!1)`
- App root: `function $t(){`

### Commit Convention

All deploy commits follow: `deploy: <source-commit-hash>`. Feature/fix commits use conventional format (`feat:`, `fix:`, etc.).

### Version Indicator (MUST UPDATE ON EVERY COMMIT)

The app displays the current **branch name** and **last commit timestamp (JST)** in the top-right corner (left of the `?` button) for version identification.

**This value is hardcoded in the bundle and MUST be updated on every commit.**

Location in `assets/index-wGz6QD6f.js` (format: `<branch>`,` | `,`<YYYY-MM-DD HH:MM JST>`):
```
`claude/understand-sound-editor-UM3z1`,` | `,`<YYYY-MM-DD HH:MM JST>`
```

To find the current value:
```bash
grep -ao 'understand-sound-editor.\{0,50\}JST' assets/index-wGz6QD6f.js
```

Update procedure:
1. Get the current time in JST: `TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M JST'`
2. Replace the old timestamp with the new one in the bundle
3. Update the branch name too if it has changed
4. Then commit and push

**AI agents: Do not forget this step. Every commit must include an updated timestamp.**
