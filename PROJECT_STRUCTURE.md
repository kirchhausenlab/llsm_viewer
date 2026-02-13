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

## High-level overview

This repo is a **Vite + React + TypeScript** single-page app (no backend). Most code lives in `src/`, with heavy work offloaded to **Web Workers** and rendering done with **Three.js + custom shaders**.

The main responsibilities are:

- Load multi-channel volumetric data and tracks.
- Preprocess and normalize data for fast GPU-based visualization.
- Render 2D slices and 3D volumes (including VR).
- Support loading/saving “preprocessed datasets” as folder-based Zarr v3 stores.

---

## Key flows

**1. Dataset ingestion & preprocessing**

- Front-end UI for local/Dropbox uploads and preprocessed dataset import.
- **Preprocessing is mandatory**: raw TIFF decoding happens only during preprocessing.
- Raw TIFF decoding via `src/loaders/volumeLoader.ts` → worker decode → `VolumePayload`.
- Streaming preprocessing via `src/shared/utils/preprocessedDataset/preprocess.ts` writes one timepoint at a time into a Zarr v3 store backed by a `PreprocessedStorage` backend (OPFS by default).
- Preprocessing also writes per-timepoint 256-bin intensity histograms (manifest v4) so the viewer can do auto-windowing and histogram UI without scanning whole volumes at runtime.
- Core processing (`src/core/volumeProcessing.ts`) handles normalization + segmentation colorization; GPU texture packing is cached via `src/core/textureCache.ts`.

**2. Visualization (2D + 3D)**

- 2D planar views: `src/components/viewers/PlanarViewer.tsx` + `src/components/viewers/planar-viewer/*` render slices and handle interactions.
- 3D volume views: `src/components/viewers/VolumeViewer.tsx` + `src/components/viewers/volume-viewer/*` (plus shaders in `src/shaders/*`) handle raymarching, track overlays, and hover sampling.
- Viewer shell (`src/components/viewers/ViewerShell.tsx` + `src/components/viewers/viewer-shell/*`) orchestrates layout, panels, and mode switching (2D/3D).

**3. State & control**

- Central dataset and layer state: `useChannelLayerState` and `state/*`.
- Channel source/validation state: `hooks/dataset/useChannelSources.ts`.
- Dataset load/apply lifecycle for channel sources: `hooks/dataset/useChannelDatasetLoader.ts`.
- Playback and viewer interaction: `hooks/viewer/useViewerPlayback.ts`, `hooks/viewer/useViewerControls.ts`, and app-level
  helpers such as `useViewerModePlayback` (mode + playback wiring).
- Tracks: hooks under `hooks/tracks/*` feed both planar and volume viewers.
- Paintbrush: `src/hooks/paintbrush/usePaintbrush.ts` manages the paint volume + history; `src/shared/utils/tiffWriter.ts` writes RGB TIFF stacks.

**4. Preprocessed dataset load/save (Zarr v3 folders)**

- Format + manifest/types: `src/shared/utils/preprocessedDataset/*` (manifest stored in Zarr root `zarr.json` attributes).
- Storage abstraction shared by preprocessing + viewing: `src/shared/storage/*` (OPFS + in-memory + directory-backed).
- Folder-based import/export uses the File System Access API directory picker; OPFS is used for the in-session preprocessed dataset.

---

## Directory / file reference

### Top-level / tooling

- `package.json`  
  Scripts: `dev` (Vite), `build`, `preview`, `typecheck`, `typecheck:strict-unused` (scoped optional strict-unused gate), local verification/test commands (`test`, `test:coverage`, `test:frontend`, `test:visual`, `test:e2e`, `test:e2e:visual`, `test:perf`, `verify:fast`, `verify:ui`, `verify:full`, `verify:nightly`).
- `tsconfig.tests.json`  
  Narrow test-only TypeScript project used by `typecheck:tests` for local automation checks.
- `tsconfig.strict-unused.json`
  Scoped strict-unused TypeScript gate (`noUnusedLocals` + `noUnusedParameters`) used by `typecheck:strict-unused`; currently covers route orchestration and high-risk viewer/VR shells (`useAppRouteState`, `VolumeViewer`, `useVolumeViewerVr`).
- `playwright.config.ts`
  Local browser automation config for Playwright smoke + screenshot tests (Chromium project, local Vite web server).
- `vite.config.ts`  
  Vite config (GitHub Pages base path logic, `@` alias → `src/`, worker format).
- `environment.d.ts`  
  Typed env vars (`VITE_DROPBOX_APP_KEY`, `VITE_MAX_VOLUME_BYTES`) + Dropbox chooser typings.
- `.github/workflows/deploy.yml`  
  CI (typecheck/test/build) + GitHub Pages deploy.
- `scripts/local-nightly.sh`
  Local automation entrypoint for running the full verification pipeline without remote CI.
- `PROGRESS.md`  
  Running progress log / next tasks.
- `docs/refactor/README.md`, `docs/refactor/ARCHIVE_SUMMARY.md`
  Archived refactor-program record. The refactor plan is completed; the consolidated history and outcomes are stored in `ARCHIVE_SUMMARY.md`.

---

### App entrypoints (start reading here)

- `src/ui/main.tsx`
  Bootstraps React and renders `<App/>`.
- `src/ui/App.tsx`
  Composes global providers, layout chrome, and the app router.
- `src/ui/app/providers.tsx`
  Wraps the tree in shared providers (e.g., `ChannelLayerStateProvider`).
- `src/ui/app/layout.tsx`
  Top-level layout/chrome wrapper that pulls in app-wide styles.
- `src/ui/app/router.tsx`
  High-level navigation and suspense boundary that chooses between dataset setup and viewer routes.
- `src/ui/app/hooks/useAppRouteState.tsx`
  Central app-state wiring for dataset setup + viewer routes; builds typed route contracts for both `DatasetSetupRoute` and `ViewerRoute` while managing shared channel/layer lifecycle.
- `src/ui/app/hooks/routeDatasetSetupProps.ts`
  Pure route-props assembler that composes `FrontPageContainer` setup contracts from focused state/handler sections.
- `src/ui/app/hooks/routeViewerShellProps.ts`
  Pure route-props assembler that composes `ViewerShellContainer` route contracts from viewer/chrome/panel sections.
- `src/ui/app/hooks/useRouteLayerVolumes.ts`
  Isolates launch-time volume bootstrap and timepoint-driven active-layer volume loading from the route orchestrator.
- `src/ui/app/hooks/useRouteVrChannelPanels.ts`
  Isolates VR channels/tracks panel view-model assembly (channel visibility, active layer, histogram + settings payloads).
- `src/ui/app/routes/*`
  Route-level containers: `DatasetSetupRoute` wraps the front page, and `ViewerRoute` wraps the viewer shell/help menu.

---

### UI + rendering (`src/components/`)

**Setup / ingestion UI (`src/components/pages/*`)**

- `FrontPage.tsx`, `ChannelCard.tsx`, `ChannelUploads.tsx`, `ChannelDropboxSection.tsx`
  Channel configuration and dataset ingestion (local + Dropbox) + entry points for loading preprocessed Zarr datasets.

**Viewer shell / panels / windows (`src/components/viewers/*`)**

- `ViewerShell.tsx`
  Main viewer layout; switches between 2D/3D viewer modes and hosts panels/windows.
- `viewer-shell/*`
  Panels (channels, playback, tracks, plot settings) + shell-level hooks.
  Shell orchestration hooks:
  - `hooks/useViewerRecording.ts` isolates capture-target registration and media-recording lifecycle (bitrate controls, frame-pump, mode-switch/unmount teardown).
  - `hooks/useViewerPanelWindows.ts` isolates viewer panel window visibility/reset policies (viewer settings, plot settings, track settings, paintbrush).
  - `hooks/useViewerPaintbrushIntegration.ts` isolates paintbrush overlay composition, viewer prop wiring, and painting export handling.
- `PlanarViewer.tsx` + `planar-viewer/*`
  Canvas-based slice viewing + layout/interaction hooks/utilities.
  Planar rendering boundaries:
  - `planarTrackCentroid.ts` isolates followed-track centroid math used by planar interaction recentering.
  - `planarSliceCanvas.ts` isolates offscreen slice-canvas staging and planar track/slice draw-path styling logic.
  Planar lifecycle boundaries:
  - `usePlanarPrimaryVolume.ts` isolates primary-volume selection and auto-fit trigger rules tied to source volume shape changes.
  - `usePlanarViewerCanvasLifecycle.ts` isolates animation, resize, offscreen canvas staging, auto-fit reset, and draw-revision lifecycle wiring.
  - `usePlanarViewerBindings.ts` isolates planar capture-target registration and hover-reset binding behavior.
  Planar interaction boundaries:
  - `hooks/usePlanarInteractions/usePlanarTrackHoverState.ts` isolates hovered-track and tooltip state transitions.
  - `hooks/usePlanarInteractions/usePlanarTrackHitTest.ts` isolates XY track hit-testing and visibility/threshold logic.
  - `hooks/usePlanarInteractions/usePlanarPixelHover.ts` isolates pixel hover sampling and hover-voxel emission.
  - `hooks/usePlanarInteractions/usePlanarCanvasInputHandlers.ts` isolates pointer/wheel input handlers (paint/pan/selection/hover).
  - `hooks/usePlanarInteractions/usePlanarKeyboardShortcuts.ts` isolates planar keyboard bindings.
- `VolumeViewer.tsx` + `volume-viewer/*`
  Three.js volume renderer (raymarching, hover sampling, VR bridge, track overlays) and helper modules.
  Volume viewer orchestration boundaries:
  - `useVolumeViewerAnisotropy.ts` isolates anisotropy-scale normalization and step-scale ratio synchronization.
  - `useVolumeViewerRefSync.ts` isolates ref synchronization (paintbrush/layers/follow target) and reset/follow callback wrappers.
  - `useVolumeViewerSurfaceBinding.ts` isolates render-surface container wiring and active-3D-layer handle refresh.
  - `useVolumeViewerTransformBindings.ts` isolates VR HUD placement refresh and transform callback ref synchronization.
  - `volumeViewerVrRuntime.ts` isolates defaulted VR runtime prop resolution from optional `vr` props.
  - `volumeViewerRuntimeArgs.ts` isolates grouped typed argument assembly for `useVolumeViewerVrBridge` and `useVolumeViewerLifecycle`.
  Runtime lifecycle boundaries:
  - `volumeViewerPointerLifecycle.ts` isolates pointer/paint event wiring.
  - `volumeViewerRenderLoop.ts` isolates the per-frame render loop pipeline.
  Track-rendering boundaries:
  - `useTrackRendering.ts` remains the track-overlay orchestrator for resource lifecycle + visibility policy.
  - `trackHoverState.ts` isolates pointer/controller hover-source state resolution and tooltip synchronization.
  - `trackDrawRanges.ts` isolates time-window draw-range updates for line geometry/endcaps.
  - `trackHitTesting.ts` isolates pointer ray-hit testing against visible track line/endcap objects.
  - `trackAppearance.ts` isolates per-frame material/opacity/width/blink appearance updates.
  Hover-sampling boundaries:
  - `volumeHoverTargetLayer.ts` isolates hover target-layer/resource selection policy before ray sampling.
  - `volumeHoverSampling.ts` isolates trilinear sample extraction, luminance resolution, and windowed-intensity adjustment used by hover MIP sampling.
  VR domain boundaries:
  - `useVolumeViewerVr/useVrHudInteractions.ts` isolates channels/tracks HUD slider + scroll interaction state updates.
  - `vr/controllerRayVolumeDomain.ts` isolates controller-based volume transform ray logic (translate/scale/yaw/pitch handles).
  - `vr/controllerConfiguration.ts` is now a thin controller entry orchestrator (wires lifecycle + select handlers).
  - `vr/controllerInputDependencies.ts` centralizes controller input dependency typing shared by configurator and extracted handler modules.
  - `vr/controllerConnectionLifecycle.ts` isolates controller connect/disconnect state transitions.
  - `vr/controllerSelectStart.ts` isolates select-start activation logic (HUD/volume gesture setup and immediate slider/scroll interactions).
  - `vr/controllerSelectEnd.ts` isolates select-end action dispatch (playback/channels/tracks callbacks + follow behavior).
  - `vr/controllerRayHudCandidates.ts` isolates playback/channels/tracks HUD candidate resolution from the outer controller-ray frame loop.
  - `vr/controllerRayHudTransforms.ts` isolates controller-driven HUD panel drag + yaw/pitch transform updates.
  - `vr/controllerRayTrackIntersections.ts` isolates controller raycasting against visible track lines and screen-space hover projection.
  - `vr/controllerRayFrameFinalize.ts` isolates end-of-frame hover synchronization (HUD hover regions, playback flags, summary logging, controller hover state).
  - `vr/controllerRayUiFlags.ts` isolates controller hover/active UI flag transitions from the ray-update loop.
  - `vr/controllerRayRegionState.ts` isolates HUD-region equality + controller-ray summary change detection.
  - `vr/hudRenderersTracks.ts` + `vr/hudRenderersChannels.ts` are thin HUD orchestrators.
  - Tracks HUD modules:
    `vr/hudRenderersTracksBase.ts` + `vr/hudRenderersTracksShared.ts` isolate tracks HUD canvas prep and active-channel resolution.
    `vr/hudRenderersTracksTabs.ts` isolates channel tab rendering/regions.
    `vr/hudRenderersTracksControls.ts` isolates stop-follow/sliders/color/mode/master-toggle controls.
    `vr/hudRenderersTracksRows.ts` isolates track rows + scroll region rendering.
    `vr/hudRenderersTracksSections.ts` remains a thin compatibility re-export.
  - Channels HUD modules:
    `vr/hudRenderersChannelsBase.ts` + `vr/hudRenderersChannelsShared.ts` isolate channels HUD canvas prep and active-layer resolution.
    `vr/hudRenderersChannelsTabs.ts` isolates channel tab rendering/regions.
    `vr/hudRenderersChannelsLayerSections.ts` isolates toggles/histogram/reset/swatches drawing.
    `vr/hudRenderersChannelsLayerSliders.ts` isolates slider definitions + slider interaction regions.
    `vr/hudRenderersChannelsLayerControls.ts` orchestrates layer controls.
    `vr/hudRenderersChannelsSections.ts` remains a thin compatibility re-export.
  - `vr/hudRenderers.ts` remains a thin export surface.
  - `vr/hudMath.ts` + `vr/hudCanvas.ts` isolate reusable HUD math and canvas-shape drawing utilities (including round-rect compatibility) shared by HUD renderers.

**Shared widgets (`src/components/widgets/*`)**

- `FloatingWindow.tsx` and window components (e.g. `PlotSettingsWindow`, `SelectedTracksWindow`, etc.)
  Draggable/positioned tool windows reused across viewer panels and the front page.

---

### State + hooks (`src/hooks/` + `src/state/`)

- `hooks/useChannelLayerState.tsx`  
  Central **React context/store** for channels, layers, per-layer settings, and dataset lifecycle helpers.
- `hooks/dataset/useChannelSources.ts`
  Owns channel/layer source authoring state, IDs, and setup-time validation (timepoints, track attachment, channel readiness).
- `hooks/dataset/channelTimepointValidation.ts`
  Pure helpers for setup-time timepoint-count resolution/pending-state detection and global mismatch computation; used by `useChannelSources` and isolated for focused testing.
- `hooks/dataset/useChannelDatasetLoader.ts`
  Owns dataset load/apply runtime lifecycle for channel sources (volume decode/normalization, shape checks, state reset/apply transitions, and launch error mapping).
- `hooks/viewer/useViewerPlayback.ts`, `hooks/viewer/useViewerControls.ts`
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
- `src/core/volumeProcessing.ts`
  Normalization into GPU-friendly formats + segmentation colorization/label handling.
- `src/core/textureCache.ts`
  Caches packed 3D texture buffers derived from normalized volumes (avoids repeated repacking).
- `src/core/volumeProvider.ts`
  Random-access volume loader for preprocessed datasets (reads from `PreprocessedStorage` with a small bounded cache).
- `src/shaders/*`  
  Shader source modules (`volumeRenderShader.ts`, `sliceRenderShader.ts`).

---

### Load/save preprocessed datasets (Zarr v3 folders)

- `src/shared/utils/preprocessedDataset/*`
  Zarr-backed preprocessed dataset format + manifest/types + open/preprocess helpers.
  Preprocess pipeline boundaries inside `preprocess.ts`:
  - layer timepoint indexing + validation
  - representative normalization sampling
  - source/layer metadata validation
  - manifest + Zarr descriptor shaping
  - array/trackset materialization
  - mode-specific volume writing (2d stack slicing vs 3d per-file loads)
- `src/shared/storage/*`
  Storage backends used by preprocessing + viewing: OPFS + in-memory + directory-backed storage.

---

### Shared types, styling, and utilities

- `src/types/*`  
  Core TS types (volumes, layers, tracks, hover, voxel resolution, etc.).
- `src/shared/utils/*`
  Pure helpers (drag/drop FS helpers, anisotropy correction/resampling, hover sampling, intensity formatting, window layout, track smoothing/summary, service-worker helpers).
- `src/shared/constants/*`
  App limits/config (notably `volumeLimits.ts` reads `VITE_MAX_VOLUME_BYTES`).
- `src/shared/colorMaps/*`
  Shared color palettes and normalization helpers for layers/tracks.
- `src/styles.css` + `src/styles/app/*` + component CSS files
  Global + feature-specific styling.
  Viewer style ownership is split by feature under `src/styles/app/`:
  - `viewer-controls-base.css` (shared control primitives)
  - `viewer-playback-controls.css` (playback/recording controls)
  - `viewer-track-panels.css` (tracks + paintbrush panels)
  - `viewer-selected-tracks.css` (selected-track chart and plot settings controls)

---

### Tests

- `tests/*.test.ts` + `tests/*.test.tsx`  
  Broad unit/integration coverage for core math/state/utils/hooks/components, run through Node's built-in test runner (`node --test` with `tsx` import support).
- `tests/frontend/*`  
  Frontend component tests (setup/launcher UI and upload interactions).
- `tests/visual/*` + `tests/visual/snapshots/*`  
  Local structural visual regression tests (React tree snapshots) plus committed snapshot baselines.
- `tests/perf/*`  
  Local performance budget guards for critical hot paths.
- `tests/e2e/*` + `tests/e2e/**/*.spec.ts`  
  Browser-driven end-to-end smoke and screenshot tests via Playwright; includes dataset-backed launch/preprocess flow, channels/playback/viewer-settings/top-menu smoke coverage, track CSV upload + track-panel interactions, nightly multi-channel/segmentation scenarios, and front-page screenshots.
- `tests/e2e/*-snapshots/*`
  Playwright screenshot baseline images used by browser visual regression checks.
- `tests/helpers/*` + `tests/types/*` + `tests/e2e/helpers/*`  
  Shared test fixtures/utilities (dataset discovery, reusable e2e setup workflows, snapshot assertions, ambient test typings).

---

## Notes for future changes

When you introduce a **new major feature** (e.g. different volume backend, new viewer type, new export format):

- Add it to **Key flows** with 1–3 bullets.
- Add or update the relevant section under **Directory / file reference**.
- Remove any now-obsolete references or clearly mark them as legacy (e.g. “(legacy, kept for backward compatibility)”).
