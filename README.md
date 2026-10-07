# Sound Editor

Browser-based audio editor built with React 19 + Vite. Single-page application for loading, editing, and exporting audio files (WAV / MP3).

## Deployment

This repository contains **only the built/deployed output** (GitHub Pages). There is no source code (`.ts`, `.tsx`, etc.) in this repo. All application logic resides in the single bundled file:

```
index.html                          # Entry point
assets/index-wGz6QD6f.js           # Bundled app (~504KB, minified)
favicon.svg                         # Waveform icon
```

React component or state logic changes must be made directly to the minified bundle. UI additions that don't touch React internals (CSS overrides, DOM overlays, injected scripts) should be added to `index.html` instead.

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
| (drop zone)|                               |          |          |
| - File info|   Selection highlight         |          |          |
| - Duration |   Playhead cursor             | VOLUME   |          |
| - Rate/Ch  |   Drag & drop zone            |  Gain    |          |
| - Bit depth|                               |  Slider  |          |
| - Samples  |                               |          |          |
| - Size     |                               | FADE     |          |
|            |                               |  In/Out  |          |
| [Export]   |                               |          |          |
| [Settings] |                               | NOISE    |          |
|            |-------------------------------| REDUCTION|          |
|            | Selection bar (__SelBar)      |          |          |
|            | [⏮Start][End⏭] [⇤] In [◆]    |          |          |
|            |   Out [◆][⇥] Length [Clear]  |          |          |
+------------+-------------------------------+----------+----------+
| Status Bar (Ht)                                                 |
| [Log (220px fixed)] | Position | Selection | Zoom | History |Lvl |
+------------------------------------------------------------------+
```

### Geometric Placeholder (injected via `index.html`)

When no audio files are loaded, the waveform display area shows an animated overlay of Islamic geometric motifs (8-pointed stars, hexagonal rosettes, diamond lattices). The animation fades tiles in and out at random intervals for an organic, breathing effect.

**Implementation:** CSS + vanilla JS injected in `index.html` (not in the React bundle).

| Element | Description |
|---------|-------------|
| `#waveform-placeholder` | Absolute-positioned overlay on the waveform container |
| `.geo-grid` | CSS Grid filling the container with `72px` tiles |
| `.geo-tile svg` | SVG motifs animated via `@keyframes geoWave` (8s cycle) |

**Container detection:** Finds the largest `<canvas>` inside `#root` and uses its parent element. This avoids hard-coded color matching and works regardless of theme changes.

**Visibility detection:** A `MutationObserver` on `#root` (`childList` + `subtree`) triggers on every React DOM update. It checks for the `"Ctrl+O or drag & drop"` empty-state `<span>` that React renders when no files are loaded. File load hides the overlay instantly (`transition: none`); closing all files fades it back in (`transition: 0.5s`).

**Resize handling:** A `ResizeObserver` on the waveform container rebuilds the grid when the container size changes, keeping tile coverage consistent.

**Design notes:**
- Three motif types cycle in a checkerboard `(row + col) % 3` pattern
- 10-color cyan palette (`#4fc3f7`–`#0288d1`)
- Grid uses explicit `repeat(cols, 72px)` / `repeat(rows, 72px)` based on container size
- `animation-delay` randomized per tile (`Math.random() * 8s`)
- Initial opacity is 0 (fully transparent) — tiles fade in only via animation
- `pointer-events: none` ensures drag & drop passes through

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
| `Tt` | WaveformCanvas | Canvas inside `Ot`: drawing, click/drag selection, edge snapping, draggable selection edges |
| `__SelBar` | SelectionBar | Row under the waveform: jump-to-start/end, exact In/Out time fields, set-edge-to-clip-start/end/playhead |
| `__TimeField` / `__SBButton` | — | Time input (`mm:ss.mmm` / `ss.sss`, Enter to apply, Esc to cancel) and compact button used by `__SelBar` |

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

Note: WAV files get `audioBuffer._originalBitDepth` (8/16/24/32), `_originalSampleRate`, `_originalChannels` and `_originalFileSize` at load time (read from the RIFF `fmt ` chunk by `__wavFmt`, which walks the chunk list instead of assuming a fixed offset). Edits create new `AudioBuffer`s, so `__meta(src, dst)` copies these fields forward in `setAudioBuffer`, `pushHistory` and the history-snapshot copier `T` — otherwise the first edit would silently drop them and the default export would fall back to the AudioContext rate / 24-bit.

`setSelection` and `setCurrentTime` clamp their inputs to `[0, duration]` of the active file.

### ExportConfig Structure

```
{
  format: "wav",               // "wav" or "mp3"
  sampleRate: 44100,           // WAV: 8000-96000 (or the source rate). MP3: snapped to a legal MPEG rate by __mp3Rate()
  srcQuality: "medium",        // "low", "medium", or "high"
  channels: "stereo",          // "mono" or "stereo"
  bitDepth: 24,                // 8, 16, 24, or 32 (WAV only)
  bitrate: 192,                // 32-320 kbps (MP3 CBR); clamped to 8-160 below 32 kHz (MPEG-2/2.5) by __mp3Bitrate(). lamejs build does not ship VBR iteration loops, so CBR only.
  mp3Mode: "joint",            // "joint" (default, MS encoding), "stereo" (independent L/R). Mono channels override to MONO internally.
  lowpass: 18000,              // 0 = auto, or Hz cutoff (MP3 only). Cuts inaudible HF so bits go to audible band; quality control, not size control.
  preset: "music_high"         // "music_high" / "music_small" / "voice" / "custom"
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
| Noise capture (selection < 2048 samples) | `Noise selection too short` (error) |
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

After decoding, WAV files get `_originalBitDepth` / `_originalSampleRate` / `_originalChannels` from the `fmt ` chunk (`__wavFmt`). If the 8-file limit rejects a file, the loader logs `Load failed` instead of a false `Loaded`.

### Export

| Format | Function | Details |
|--------|----------|---------|
| WAV | `ut(audioBuffer, bitDepth)` | Writes RIFF/WAVE header + PCM data. 8-bit=unsigned PCM(1), 16/24-bit=signed PCM(1), 32-bit=Float(3). Unknown depths fall back to 16 (`__wavBits`). Throws a readable error if the file would exceed the 4 GB RIFF limit. |
| MP3 | `ft(audioBuffer, bitrate, opts)` | Lame encoder, CBR only. `opts = { mode, lowpass, quality }` — MPEG mode (0=stereo, 1=joint, 3=mono), lowpass cutoff Hz, encoder quality 0-9. (This lamejs build omits VBR iteration loops, so VBR is not available.) `ft` is `async`: the 1152-sample encode loop yields back to the event loop (via `setTimeout`) roughly every 30ms of wall-clock work and reports progress through `k.getState().setProcessing(...)` (see Processing Overlay Progress below), so callers must `await` it. |

Export flow (`j` callback → `A(config)`):
1. Get active file and resolve config (`exportConfig ?? defaults from file`), then normalize it with `__normCfg` (same helper the Settings modal and the size estimator use): `bitDepth` → 8/16/24/32, and for MP3 `sampleRate` → nearest legal MPEG rate (`__mp3Rate`: 8000/11025/12000/16000/22050/24000/32000/44100/48000) and `bitrate` → the range that MPEG version allows (`__mp3Bitrate`).
2. Resample if needed (`ye` function with quality setting)
3. Convert channels if needed: `be` (→ mono), `__toStereo` (WAV mono → stereo, or >2 channels → first two). A mono source exported as MP3 "stereo" stays mono-mode (identical channels would only waste bits).
4. Encode to WAV (`ut`) or MP3 (`await ft(...)`). For MP3, the export pipeline derives the LAME `mode` from `mp3Mode` (`joint`→1, `stereo`→0) and forces MONO(3) when the buffer is 1-channel.
5. Trigger download via blob URL (`pt` function; the URL is revoked after 60 s so large downloads have time to start)
6. Log the parameters that were actually written (rate, channels, bit depth / bitrate, size).

**History of the "Export failed" bug:** an 8-bit source WAV made the default config `bitDepth: 8`, and the Settings modal had no 8-bit option, so the select *displayed* "16 bit" while the config kept 8. `ut` then fell through to the 32-bit float branch with a 1-byte stride and wrote past the end of the `DataView` (`Offset is outside the bounds of the DataView`). Every WAV export of an unedited 8-bit file failed. Fixed by implementing 8-bit PCM and normalizing the config.

#### Processing Overlay Progress

`qt` (ProcessingModal) shows/hides based on the store's `processing` message (`k.getState().setProcessing(text | null)`), with a 500ms debounce before becoming visible so quick operations don't flash the overlay. That debounce is keyed on **whether a message is present** (`[!!e]`), not on the message text itself — an earlier version keyed it on `[e]`, which meant any operation that updates the message text on every tick (a live percentage) kept resetting the 500ms timer and the overlay never became visible. `ke` (noise reduction) and `ft` (MP3 export) both drive a live progress display through this same mechanism: every ~30ms of wall-clock work they call `setProcessing(`Label... ` + block-bar + ` NN%`)` (`█`/`░` characters, 20 segments) and `await new Promise(r=>setTimeout(r))` to yield. Follow this pattern for any other long-running synchronous loop that should show progress instead of freezing the tab.

#### MP3 Encoding Options

The lamejs `Mp3Encoder` constructor in this build was patched to accept a 4th `options` argument that is applied to `lame_global_flags` before `lame_init_params()`:

| Option | Type | Default | Notes |
|---|---|---|---|
| `mode` | `0`/`1`/`2`/`3` | `STEREO(0)` | MPEG channel mode. `1` = Joint Stereo (MS encoding), `3` = Mono |
| `lowpass` | Hz | unset (LAME auto) | If `>0`, sets `P.lowpassfreq`. Cuts inaudible HF so bits go to the audible band — improves perceived quality at fixed bitrate |
| `quality` | `0`–`9` | `3` | LAME encoder algorithm quality. Pipeline passes `2` (high quality, slower) |

The constructor also sets `P.out_samplerate = samplerate` whenever the input rate is a legal MPEG rate. Without it, LAME's `optimum_samplefreq()` silently re-samples 44.1/48 kHz input down to **32 kHz** whenever the lowpass is ≤ 15.25 kHz (the 12/14/15 kHz lowpass options). Note that this build's `assert` is a no-op, so a failing `lame_init_params()` does not throw — keep feeding it legal rates.

VBR (`P.VBR = vbr_mtrh / vbr_rh / vbr_abr`) is **not** available — this lamejs JS port references `VBRNewIterationLoop` / `VBROldIterationLoop` / `ABRIterationLoop` constructors that were never defined in the bundle. Setting `P.VBR` to any non-zero value reaches `new <UndefinedClass>(C)` inside `lame_init_params` and throws `ReferenceError`. Only the CBR iteration loop (`g`) is implemented. Likewise `bWriteVbrTag` triggers `InitVbrTag` which has untranslated Java syntax (`new int[400]`) — also patched to `new Int32Array(400)` as a safety net but kept disabled.

#### Presets

The Export Settings modal exposes a `preset` selector that bulk-applies fields:

| Preset | bitrate | channels | sampleRate | mp3Mode | lowpass | format |
|---|---|---|---|---|---|---|
| `music_high` | 192 kbps | stereo | unchanged (44.1 kHz if currently < 32 kHz) | joint | 20 kHz | mp3 |
| `music_small` | 128 kbps | stereo | unchanged (44.1 kHz if currently < 32 kHz) | joint | 16 kHz | mp3 |
| `voice` | 64 kbps | mono | 22050 Hz | joint | 15 kHz | mp3 |
| `custom` | — | — | — | — | — | — |

Editing any individual field in the modal automatically switches `preset` to `custom`.

The modal only offers legal MPEG sample rates when the format is MP3, adds the source rate to the WAV list when it is not one of the standard entries (so the select never displays a different value than the one that will be used), offers 8/16/24/32-bit for WAV, and shows a warning under Bitrate when the chosen rate (< 32 kHz) caps it at 160 kbps. **Save** stores the normalized config.

#### Size Estimators

Both the Export Settings modal and the FilesPanel preview row share two helpers (defined right after `Wt`):

- `en(config, duration)` — predicted output bytes, computed on `__normCfg(config)` so it matches what the export writes. WAV uses `duration × sampleRate × channels × bitDepth/8 + 44`; MP3 uses `duration × bitrate × 1000 / 8` (CBR is exact since LAME pads to fixed bitrate).
- `tn(audioBuffer, duration)` — source size as a 16-bit WAV equivalent at the buffer's native rate/channels. Used to display the compression ratio in the modal preview.

Joint Stereo and Lowpass affect _quality_ at a given bitrate, not file size, so they intentionally do not change the estimator output. To shrink the file, reduce `bitrate` (or `channels`/`sampleRate`).

### Effects

| Effect | Implementation |
|--------|---------------|
| **Gain** | Slider -20 to +20 dB, real-time preview via `previewGain` |
| **Fade In** | Apply gain ramp from 0 to 1 over duration |
| **Fade Out** | Apply gain ramp from 1 to 0 over duration |
| **Noise Reduction** | Power-domain Wiener-style spectral subtraction with oversubtraction, spectral floor, and time/frequency gain smoothing. See [Noise Reduction Algorithm](#noise-reduction-algorithm) below. |

#### Noise Reduction Algorithm

Two-stage workflow exposed through the **NOISE REDUCTION** panel:

1. **Capture Noise Profile** (`Oe(buffer, start, end)`) — User selects a noise-only region and clicks _Capture Noise Profile_.
2. **Apply Noise Reduction** (`ke(buffer, profile, strength, start, end)`) — User selects the target region and clicks _Apply Noise Reduction_ with a 0–100 % strength slider.

**STFT setup** (shared by both stages, `Ce` / `we` constants):

| Parameter | Value | Notes |
|---|---|---|
| FFT size | `2048` | ~46 ms @ 44.1 kHz |
| Hop size | `512` | 75 % overlap |
| Window | Hann (`Te(N)`) | Good leakage / main-lobe balance |
| FFT impl | Iterative Cooley–Tukey, in-place (`Ee`); inverse via conjugate trick (`De`) |

**Capture (`Oe`)**: For each STFT frame inside `[start, end)`, compute the power spectrum `|X[k]|² = real² + imag²`. Accumulate per-bin `mean(P)` and `mean(P²)` over all frames; derive `std(P) = √(mean(P²) − mean(P)²)`. The returned `Float32Array` has length `2·(N/2+1)` with layout `[mean₀…mean_{f−1} | std₀…std_{f−1}]`. The store keeps it in `FileData.noiseProfile`.

**Apply (`ke`)**: For each frame and each bin `k`, compute a real-valued gain `g[k]` from the input power `P_x = |X[k]|²` and the per-bin noise-floor estimate `N[k] = mean[k] + K·std[k]` (both already in the power domain). Let `s = strength / 100 ∈ [0, 1]` be the user-facing _Strength_ slider normalized:

```
g[k] = max(β, (P_x − α · N[k] · s) / P_x)        if P_x > 1e-20
g[k] = β                                          otherwise
```

`g[k]` is finally clamped to `[β, 1]`. The `1e-20` guard avoids division by zero on near-silent bins; on those bins the floor `β` is applied directly so a small residual is preserved (rather than producing a hard zero).

The gain is then smoothed in two passes before being multiplied onto the complex spectrum (which preserves phase by construction):

| Stage | Operation | Purpose |
|---|---|---|
| Frequency smoothing | 3-bin centered moving average over `g[k]` | Suppresses isolated bin spikes that cause "musical noise" |
| Temporal smoothing | `g[k] ← γ·g_prev[k] + (1−γ)·g[k]` per frame | Avoids burble during steady noise; controls release tail |

After applying gain, the upper half of the spectrum is rebuilt by Hermitian symmetry, IFFT runs, and the frame is written back via overlap-add weighted by the squared synthesis window. Edges within the selection cross-fade with the original signal over one FFT length to avoid hard boundaries.

**Tuning parameters** (internal defaults, declared as `B`, `F`, `G`, `K` inside `ke`):

| Symbol | Default | Meaning |
|---|---|---|
| `B` (α) | `2.0` | Oversubtraction factor |
| `F` (β) | `0.05` | Spectral floor (≈ −13 dB minimum gain) |
| `G` (γ) | `0.6`  | Temporal smoothing weight (decay rate) |
| `K`     | `1.0` | Std multiplier when forming the noise-floor threshold |

Inspired by Adobe Audition's spectral-subtraction parameter set (Spectral Decay Rate, Smoothing, Transition Width). The user-facing _Strength_ slider drives `s` as defined above; the table values are internal-only.

**Backward compatibility**: If a profile of length `f` (old format, magnitudes only) is encountered, `ke` squares it to recover an approximate power spectrum and treats `std = 0`.

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
| `Home` / `End` | Jump playhead to the very start / end |
| `Shift+Home` / `Shift+End` | Extend selection to the very start / end (from the playhead if nothing is selected) |
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
| Click+Drag | Select range. Within 8 px of the clip start/end it snaps to exactly 0 / duration; dragging past the canvas edge clamps there. Movements under 3 px count as a click. |
| Drag a selection edge | Adjust selection start / end (cursor turns ↔ within 6 px of an edge; yellow grips mark the edges) |
| Drag & Drop | Load audio file (onto waveform view or Files panel) |

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
- FFT helpers / STFT constants: `var Ce=2048,we=512;function Te(e){`
- Noise profile capture: `function Oe(e,t,n){let r=e.sampleRate`
- Noise reduction apply: `function ke(e,t,n,r,i){let a=D()`
- Export/selection helpers (readable, inserted just before the App root): `var __MP3_RATES=` … `function __SelBar(` — `__mp3Rate`, `__mp3Bitrate`, `__wavBits`, `__normCfg`, `__rateOpts`, `__toStereo`, `__meta`, `__wavFmt`, `__nearEdge`, `__seekTo`, `__setSelEdge`, `__parseTime`
- Waveform canvas mouse handling: `__hv=(0,y.useCallback)` (hover cursor) and the `T=(0,y.useCallback)` right after it (click / drag / edge-drag)

### Commit Convention

All deploy commits follow: `deploy: <source-commit-hash>`. Feature/fix commits use conventional format (`feat:`, `fix:`, etc.).

### Version Indicator (MUST UPDATE ON EVERY COMMIT)

The app displays the current **branch name** and **last commit timestamp (JST)** in the top-right corner (left of the `?` button) for version identification.

**This value is hardcoded in the bundle and MUST be updated on every commit.**

Location in `assets/index-wGz6QD6f.js` (format: `<branch>`,` | `,`<YYYY-MM-DD HH:MM JST>`):
```
`claude/<branch>`,` | `,`<YYYY-MM-DD HH:MM JST>`
```

To find the current value:
```bash
grep -aoE '`claude/[^`]+`,` \| `,`[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} JST`' assets/index-wGz6QD6f.js
```

Update procedure:
1. Get the current time in JST: `TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M JST'`
2. Replace the old timestamp with the new one in the bundle
3. Update the branch name too if it has changed
4. Then commit and push

**AI agents: Do not forget this step. Every commit must include an updated timestamp.**
