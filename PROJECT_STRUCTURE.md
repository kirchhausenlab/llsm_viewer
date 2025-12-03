This document describes the current project structure and is intended to be updated by agents and humans as the code evolves.

## Project structure

This repo is a **Vite + React + TypeScript** single-page app (no backend). Most code lives in `src/`, with heavy work offloaded to **Web Workers** and rendering done with **Three.js + custom shaders**.

### Top-level / tooling

* `package.json` – Scripts: `dev` (Vite), `build`, `preview`, `typecheck`, `test` (runs `tests/runTests.ts` via `tsx`).
* `vite.config.ts` – Vite config (GitHub Pages base path logic, `@` alias → `src/`, worker format).
* `environment.d.ts` – Typed env vars (`VITE_DROPBOX_APP_KEY`, `VITE_MAX_VOLUME_BYTES`) + Dropbox chooser typings.
* `.github/workflows/deploy.yml` – CI (typecheck/test/build) + GitHub Pages deploy.
* `public/export-sw.js` – Service worker powering streamed ZIP downloads (export fallback path).
* `PROGRESS.md` – Running progress log / next tasks.

### App entrypoints (start reading here)

* `src/main.tsx` – Bootstraps React, registers the export service worker, mounts `<App/>` inside `<ChannelLayerStateProvider/>`.
* `src/App.tsx` – Top-level “state machine”: front-page dataset setup vs viewer; wires together channel/layer state, playback, window layout, and VR lifecycle.

### UI + rendering (`src/components/`)

* **Setup / ingestion UI**

  * `FrontPage.tsx`, `ChannelCard.tsx`, `ChannelUploads.tsx`, `ChannelDropboxSection.tsx` – Channel configuration and dataset ingestion (local + Dropbox) + entry points for preprocessed import/export.
* **Viewer shell / panels / windows**

  * `ViewerShell.tsx` – Main viewer layout; switches between 2D/3D viewer modes and hosts panels/windows.
  * `components/viewer-shell/*` – Panels (channels, playback, tracks, plot settings) + shell-level hooks.
  * `FloatingWindow.tsx` + window components (`PlotSettingsWindow`, `SelectedTracksWindow`, etc.) – Draggable/positioned tool windows.
* **2D viewer**

  * `PlanarViewer.tsx` + `components/planar-viewer/*` – Canvas-based slice viewing + layout/interaction hooks/utilities.
* **3D viewer**

  * `VolumeViewer.tsx` – Three.js volume renderer (3D textures + raymarch shader), track overlays, hover sampling, playback integration.
  * `components/volume-viewer/*` – VR bridge + VR-facing helpers.
  * `components/volume-viewer/vr/*` – WebXR session manager, input, HUD, placement/render/update utilities.

### State + hooks (`src/hooks/` + `src/state/`)

* `hooks/useChannelLayerState.tsx` – Central **React context/store** for channels, layers, per-layer settings, and dataset lifecycle helpers.
* `hooks/useChannelSources.ts` – Loads/validates sources and constructs per-layer volume state (normalization, auto-windowing, segmentation handling, anisotropy resampling, etc.).
* `hooks/useViewerPlayback.ts`, `hooks/useViewerControls.ts` – Timeline playback + viewer UI/control state.
* `hooks/tracks/*` – Track CSV parsing, selection, styling (feeds both planar + volume viewers).
* `hooks/preprocessedExperiment/*` – Import/export flows for “preprocessed datasets” (including Dropbox helpers).
* `state/*` – Framework-agnostic defaults/models (brightness/contrast/windowing, layer settings, channel track offsets).

### Data pipeline (loading → processing → GPU)

* `src/loaders/volumeLoader.ts` – High-level API to load many TIFF/GeoTIFF volumes; delegates decoding to a worker and streams slices back.
* `src/workers/volumeLoader.worker.ts` + `src/workers/volumeLoaderMessages.ts` – Worker implementation + typed message protocol.
* `src/volumeProcessing.ts` – Normalization into GPU-friendly formats + segmentation colorization/label handling.
* `src/textureCache.ts` – Caches packed 3D texture buffers derived from normalized volumes (avoids repeated repacking).
* `src/shaders/*` – Shader source modules (`volumeRenderShader.ts`, `sliceRenderShader.ts`).

### Export/import (“preprocessed dataset” ZIP)

* `src/utils/preprocessedDataset/*` – ZIP format + manifest/types, hashing, import/export implementations.
* `src/workers/exportPreprocessedDataset*.ts` / `importPreprocessedDataset*.ts` – Worker-backed export/import with main-thread fallbacks.
* `src/utils/downloads.ts` + `src/utils/exportServiceWorker.ts` + `public/export-sw.js` – Streaming export pipeline (File System Access API when available; service-worker download fallback otherwise).

### Shared types, styling, and utilities

* `src/types/*` – Core TS types (volumes, layers, tracks, hover, voxel resolution, etc.).
* `src/utils/*` – Pure helpers (drag/drop FS helpers, anisotropy correction/resampling, hover sampling, intensity formatting, window layout, track smoothing/summary, service-worker helpers).
* `src/constants/*` – App limits/config (notably `volumeLimits.ts` reads `VITE_MAX_VOLUME_BYTES`).
* `src/styles.css` + `src/styles/app/*` + component CSS files – Global + feature-specific styling.

### Tests

* `tests/*.test.ts` – Unit tests for core math/state/utils/hooks.
* `tests/runTests.ts` – Simple test index used by `npm test`.
