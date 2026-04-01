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
| Status Bar (Ht) - Time | Selection | Zoom | History | Level     |
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
| `Ht` | StatusBar | Bottom: time, selection, zoom, level meter |
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

```javascript
{
  files: Map<id, FileData>,   // All loaded files
  activeFileId: string|null,  // Currently selected file
  maxFiles: 8,                // Max simultaneous files
  maxHistory: 10,             // Max undo history per file
  isPlaying: boolean,
  clipboard: { buffer, sampleRate, numberOfChannels } | null,
  exportConfig: ExportConfig | null,  // null = use original file props
  previewGain: number | null,
  logMessage: { text, detail, level, timestamp } | null,
  processing: string | null   // Non-null shows processing modal
}
```

### FileData Structure

```javascript
{
  id: string,                  // crypto.randomUUID()
  audioBuffer: AudioBuffer,    // Decoded audio (Web Audio API)
  fileName: string,
  selectionStart: number|null, // Seconds
  selectionEnd: number|null,
  zoom: number,                // 1 = default
  scrollX: number,
  currentTime: number,
  noiseProfile: Float32Array|null,
  history: AudioBuffer[],
  historyIndex: number,
  modified: boolean
}
```

Note: `audioBuffer._originalBitDepth` is set on WAV files at load time (8/16/24/32).

### ExportConfig Structure

```javascript
{
  format: "wav" | "mp3",
  sampleRate: number,          // 8000-96000
  srcQuality: "low"|"medium"|"high",
  channels: "mono" | "stereo",
  bitDepth: 8|16|24|32,       // WAV only
  bitrate: 128|192|256|320    // MP3 only (kbps)
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

### Version Indicator

The app displays the current branch name and last commit timestamp in the top-right corner (left of the `?` button) for version identification.
