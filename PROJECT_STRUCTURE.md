# Project structure

This document describes the **current project structure** and is intended to be updated by agents and humans as the code evolves.

It is the **single source of truth** for how the repo is organized.  
Agents: you are encouraged to keep this up to date as you refactor.

---

## How to use this document

If you are new to this repo:

1. Read **High-level overview** to understand what kind of app this is.
2. Read **Key flows** to see the main data and rendering pipelines.
3. Skim **Directory / file reference** and then jump into the sections that match what you need to change (e.g. loaders, 3D viewer, preprocessing, tests).

---

## How to update this document (agents + humans)

When you make structural changes (new major components, new directories, large refactors):

- **Keep edits short and factual.**
  - 1–2 lines per file or group of files is usually enough.
- **Update the relevant section instead of adding random notes.**
  - If you add a new viewer, extend the “UI + rendering” section.
  - If you add a new worker, extend “Data pipeline” or “Export/import”.
- **Remove or fix stale descriptions** when they no longer match reality.
- If you introduce a new major flow (e.g. “new ingest pipeline” or “new renderer”), add a short bullet for it in **Key flows**.

Do **not** describe fine-grained implementation details here; put those in comments, docstrings, or in more specific docs if needed.

---

## High-level overview

This repo is a **Vite + React + TypeScript** single-page app (no backend). Most code lives in `src/`, with heavy work offloaded to **Web Workers** and rendering done with **Three.js + custom shaders**.

The main responsibilities are:

- Load multi-channel volumetric data and tracks.
- Preprocess and normalize data for fast GPU-based visualization.
- Render 2D slices and 3D volumes (including VR).
- Support export/import of “preprocessed datasets” as ZIPs.

---

## Key flows

**1. Dataset ingestion & preprocessing**

- Front-end UI for local/Dropbox uploads and preprocessed dataset import.
- Volume loading via `src/loaders/volumeLoader.ts` → worker decoding → normalized volume data.
- Preprocessing (`src/volumeProcessing.ts`) prepares GPU-friendly buffers, applies normalization, segmentation colorization, and anisotropy-related logic.
- Processed volumes are cached in `src/textureCache.ts` for reuse.

**2. Visualization (2D + 3D)**

- 2D planar views: `PlanarViewer.tsx` + `components/planar-viewer/*` render slices and handle interactions.
- 3D volume views: `VolumeViewer.tsx` + `components/volume-viewer/*` (plus shaders in `src/shaders/*`) handle raymarching, track overlays, and hover sampling.
- Viewer shell (`ViewerShell.tsx` + `components/viewer-shell/*`) orchestrates layout, panels, and mode switching (2D/3D).

**3. State & control**

- Central dataset and layer state: `useChannelLayerState` and `state/*`.
- Channel sources and per-layer volume state: `useChannelSources`.
- Playback and viewer interaction: `useViewerPlayback`, `useViewerControls`.
- Tracks: hooks under `hooks/tracks/*` feed both planar and volume viewers.

**4. Preprocessed dataset import/export**

- ZIP format and manifest: `src/utils/preprocessedDataset/*`.
- Export/import workers: `src/workers/exportPreprocessedDataset*.ts` / `importPreprocessedDataset*.ts`.
- Streaming download/export pipeline uses `src/utils/downloads.ts`, `src/utils/exportServiceWorker.ts`, and `public/export-sw.js`.

---

## Directory / file reference

### Top-level / tooling

- `package.json`  
  Scripts: `dev` (Vite), `build`, `preview`, `typecheck`, `test` (runs `tests/runTests.ts` via `tsx`).
- `vite.config.ts`  
  Vite config (GitHub Pages base path logic, `@` alias → `src/`, worker format).
- `environment.d.ts`  
  Typed env vars (`VITE_DROPBOX_APP_KEY`, `VITE_MAX_VOLUME_BYTES`) + Dropbox chooser typings.
- `.github/workflows/deploy.yml`  
  CI (typecheck/test/build) + GitHub Pages deploy.
- `public/export-sw.js`  
  Service worker powering streamed ZIP downloads (export fallback path).
- `PROGRESS.md`  
  Running progress log / next tasks.

---

### App entrypoints (start reading here)

- `src/main.tsx`  
  Bootstraps React, registers the export service worker, mounts `<App/>` inside `<ChannelLayerStateProvider/>`.
- `src/App.tsx`  
  Top-level “state machine”: front-page dataset setup vs viewer; wires together channel/layer state, playback, window layout, and VR lifecycle.

---

### UI + rendering (`src/components/`)

**Setup / ingestion UI**

- `FrontPage.tsx`, `ChannelCard.tsx`, `ChannelUploads.tsx`, `ChannelDropboxSection.tsx`  
  Channel configuration and dataset ingestion (local + Dropbox) + entry points for preprocessed import/export.

**Viewer shell / panels / windows**

- `ViewerShell.tsx`  
  Main viewer layout; switches between 2D/3D viewer modes and hosts panels/windows.
- `components/viewer-shell/*`  
  Panels (channels, playback, tracks, plot settings) + shell-level hooks.
- `FloatingWindow.tsx` and window components (e.g. `PlotSettingsWindow`, `SelectedTracksWindow`, etc.)  
  Draggable/positioned tool windows.

**2D viewer**

- `PlanarViewer.tsx` + `components/planar-viewer/*`  
  Canvas-based slice viewing + layout/interaction hooks/utilities.

**3D viewer + VR**

- `VolumeViewer.tsx`
  Three.js volume renderer (3D textures + raymarch shader), track overlays, hover sampling, playback integration.
- `components/volume-viewer/rendering/*`
  Rendering/math helpers for the 3D viewer (shader prep, hover/raycast utilities, track geometry/appearance).
- `components/volume-viewer/*`
  3D viewer helpers and bridges (loading overlays, tooltips, VR bridge wiring).
- `components/volume-viewer/vr/*`
  WebXR session manager, input, HUD, placement/render/update utilities.
- `components/volume-viewer/useVolumeResources.ts`
  Builds/updates Three.js meshes/textures for volume layers, handles rebuild/cleanup when datasets or render contexts change.
- `components/volume-viewer/useTrackRendering.ts`
  Maintains track overlays for the 3D view (geometry/material lifecycle, hover state resolution, appearance updates).
- `components/volume-viewer/usePlaybackControls.ts`
  Playback state bridge for desktop/VR timelines (time index clamping, FPS clamping, HUD wiring helpers).

---

### State + hooks (`src/hooks/` + `src/state/`)

- `hooks/useChannelLayerState.tsx`  
  Central **React context/store** for channels, layers, per-layer settings, and dataset lifecycle helpers.
- `hooks/useChannelSources.ts`  
  Loads/validates sources and constructs per-layer volume state (normalization, auto-windowing, segmentation handling, anisotropy resampling, etc.).
- `hooks/useViewerPlayback.ts`, `hooks/useViewerControls.ts`  
  Timeline playback + viewer UI/control state.
- `hooks/tracks/*`  
  Track CSV parsing, selection, styling (feeds both planar + volume viewers).
- `hooks/preprocessedExperiment/*`  
  Import/export flows for “preprocessed datasets” (including Dropbox helpers).
- `state/*`  
  Framework-agnostic defaults/models (brightness/contrast/windowing, layer settings, channel track offsets).

---

### Data pipeline (loading → processing → GPU)

- `src/loaders/volumeLoader.ts`  
  High-level API to load many TIFF/GeoTIFF volumes; delegates decoding to a worker and streams slices back.
- `src/workers/volumeLoader.worker.ts` + `src/workers/volumeLoaderMessages.ts`  
  Worker implementation + typed message protocol.
- `src/volumeProcessing.ts`  
  Normalization into GPU-friendly formats + segmentation colorization/label handling.
- `src/textureCache.ts`  
  Caches packed 3D texture buffers derived from normalized volumes (avoids repeated repacking).
- `src/shaders/*`  
  Shader source modules (`volumeRenderShader.ts`, `sliceRenderShader.ts`).

---

### Export/import (“preprocessed dataset” ZIP)

- `src/utils/preprocessedDataset/*`  
  ZIP format + manifest/types, hashing, import/export implementations.
- `src/workers/exportPreprocessedDataset*.ts` / `importPreprocessedDataset*.ts`  
  Worker-backed export/import with main-thread fallbacks.
- `src/utils/downloads.ts` + `src/utils/exportServiceWorker.ts` + `public/export-sw.js`  
  Streaming export pipeline (File System Access API when available; service-worker download fallback otherwise).

---

### Shared types, styling, and utilities

- `src/types/*`  
  Core TS types (volumes, layers, tracks, hover, voxel resolution, etc.).
- `src/utils/*`  
  Pure helpers (drag/drop FS helpers, anisotropy correction/resampling, hover sampling, intensity formatting, window layout, track smoothing/summary, service-worker helpers).
- `src/constants/*`  
  App limits/config (notably `volumeLimits.ts` reads `VITE_MAX_VOLUME_BYTES`).
- `src/styles.css` + `src/styles/app/*` + component CSS files  
  Global + feature-specific styling.

---

### Tests

- `tests/*.test.ts`  
  Unit tests for core math/state/utils/hooks.
- `tests/runTests.ts`  
  Simple test index used by `npm test`.

---

## Notes for future changes

When you introduce a **new major feature** (e.g. different volume backend, new viewer type, new export format):

- Add it to **Key flows** with 1–3 bullets.
- Add or update the relevant section under **Directory / file reference**.
- Remove any now-obsolete references or clearly mark them as legacy (e.g. “(legacy, kept for backward compatibility)”).
