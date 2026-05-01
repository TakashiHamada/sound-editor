# Claude Code Instructions

## MUST DO: Update Version Indicator on Every Commit

The app displays the current **branch name** and **last commit timestamp (JST)** in the top-right corner of the UI.

This value is hardcoded in `assets/index-wGz6QD6f.js` and **MUST be updated on every commit**.

### How to update

1. Get the current JST time:
   ```bash
   TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M JST'
   ```

2. Find the current value in the bundle (matches whatever branch is hardcoded):
   ```bash
   grep -ao '.\{0,80\}JST.\{0,10\}' assets/index-wGz6QD6f.js | head -1
   ```

3. Update both the **branch name** and **timestamp** using `sed`:
   ```bash
   sed -i 's/OLD_BRANCH_NAME/NEW_BRANCH_NAME/g' assets/index-wGz6QD6f.js
   sed -i 's/OLD_TIMESTAMP/NEW_TIMESTAMP/g' assets/index-wGz6QD6f.js
   ```

4. Verify:
   ```bash
   grep -ao '.\{0,80\}JST.\{0,10\}' assets/index-wGz6QD6f.js | head -1
   ```

**Do this BEFORE creating the commit, not after.**

## Project Structure

- This is a pre-built React app (no source code — `.ts`/`.tsx` files are not in this repo).
- **Runtime app artifacts:** `index.html` (entry point + injected CSS/scripts) and `assets/index-wGz6QD6f.js` (bundled React app, ~504KB minified).
- **Other repo files:** `README.md` (architecture docs), `CLAUDE.md` (AI agent instructions), `favicon.svg`.
- React component or state logic changes must be made directly to the minified bundle.
- UI additions that don't touch React internals (CSS overrides, DOM overlays) should be injected via `index.html`.
- See `README.md` for full architecture documentation (component map, state store, audio pipeline, etc.).

## Gotcha: lamejs VBR is not implemented in this build

The bundled lamejs port references `VBRNewIterationLoop` / `VBROldIterationLoop` / `ABRIterationLoop` constructors that are **never defined**. Setting `P.VBR` to anything other than `vbr_off`, or enabling `P.bWriteVbrTag`, will throw `ReferenceError` from inside `lame_init_params` / `InitVbrTag`. MP3 export is **CBR only**.

Before adding any VBR-style feature, swap the encoder for a build that actually ships the VBR loops (e.g. a WASM libmp3lame, or `@breezystack/lamejs`). Don't try to wire `P.VBR` to the existing constructor — it will look like it works in code review and crash at runtime. See `README.md` § _MP3 Encoding Options_ for full details.

## Gotcha: keep the two output-size estimators in sync

Two places display predicted export size: the Settings modal (`Kt`) preview row and the FilesPanel (`At`) bottom Preview row. Both call the shared helpers `en(config, duration)` (output bytes) and `tn(audioBuffer, duration)` (16-bit WAV-equivalent source size), defined right after `Wt` in the bundle. If you change one site's formula, change the helper instead so both stay consistent.
