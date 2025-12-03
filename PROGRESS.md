# Progress

## Latest changes
- Centralized dataset launch state into `useDatasetLaunch` and viewer mode playback wiring into `useViewerModePlayback`,
  refactoring `router.tsx` and adding focused hook tests for launch progression and playback toggles.
- Extracted channel selection/editing state into `useChannelEditing`, refactoring `router.tsx` wiring and adding focused hook
  tests for activation, focus, and channel removal interactions.
- Split the top-level app into dedicated provider/layout/router modules under `src/app/`, leaving `App.tsx` as a lightweight composer.
- Added focused hook tests for volume resource rebuilds, hover source resolution, and playback clamping, and documented the volume viewer hook roles.
- Extracted `VolumeViewer` camera concerns into `useCameraControls`, centralizing renderer/controls refs, resize handling, keyboard navigation, and pointer-look wiring.
- Extracted viewer shell prop assembly into `ViewerShellContainer`/`useViewerShellProps`, keeping `App` focused on state orchestration and adding targeted wiring tests to cover VR layout defaults and panel callbacks.

## Recent UI and hover improvements
- Consolidated track follow controls into the viewer top bar and hid them when inactive.
- Simplified hover readouts by removing debug banners/labels, reporting per-channel intensities (including segmentation IDs), and adding a 3D MIP tooltip with inline highlight.
- Introduced segmentation-aware hover uniforms so label picks can pulse distinctly from standard volume samples.
- Removed the shader grid overlay and added an additive blending toggle for channel overlays with helper text on visual trade-offs.
- Tweaked the landing page header/actions and aligned loader layouts for preprocessed datasets.

## Viewer and VR stability
- Allowed hover targeting across all 3D render modes and added optional ray-march step scaling for VR performance.
- Standardized renderer GPU preferences, pixel ratio limits, and foveated rendering defaults for smoother headset sessions.
- Refined VR HUD ergonomics (touch interaction, handle alignment/redesign, orientation defaults) and split volume vs. HUD reset controls.
- Added passthrough detection/toggle, reliable controller visibility/raycasting, and scrollable immersive track lists.
- Ensured VR tracks/HUD wiring is resilient to ref churn, session lifecycle changes, and stale refs from lazy imports.

## Data handling and preprocessing
- Added voxel anisotropy correction with metadata propagation through preprocessing, export, and import.
- Captured voxel resolution inputs on the front page, threading them through preprocessing and validation.
- Implemented volume streaming guardrails with configurable size limits and slice-by-slice reassembly using shared buffers.
- Added a zero-copy normalization fast path for uint8 volumes already in range.

## Import/export and Dropbox workflow
- Built a preprocessed dataset export/import pipeline with manifest hashing, ZIP streaming (including service worker fallback), and guarded launcher states.
- Captured segmentation label buffers in the preprocessed manifest, exporting/importing per-volume label digests to keep segmentation rendering consistent after archive round-trips.
- Fixed GitHub Pages artifact inputs and activation handling for the file save picker.
- Added Dropbox chooser support for TIFF stacks and per-channel track CSVs, with inline configuration, progress/error messaging, and folder-aware file construction.
- Ensured preprocessed dataset launches push imported layers into the viewer state so the volumes appear immediately after opening.

## Track visualization
- Respected CSV `track_id` ordering and staggered starts, with optional sorting by trajectory length.
- Added per-channel track tabs with independent visibility/opacity/thickness settings and preserved color schemes, plus blinking/thickened highlights for selected tracks.
- Introduced a "Selected Tracks" overlay plotting per-track amplitude over time with a color-coded legend.
- Consolidated Gaussian smoothing into a shared utility with guards for non-finite inputs and coverage for edge cases via unit tests.
- Extracted shared track filtering/smoothing selectors into a reusable hook to simplify testing and reduce memo boilerplate.

## Recent fixes
- Moved help menu state and dismissal logic into a dedicated component/hook with escape and click-away tests, removing direct DOM listeners from the app router.
- Reordered the track-state hook initialization in `App` so VR entry reset handlers access the track follow setter after it is defined, resolving the type-check failure.
- Refactored channel uploads by introducing dedicated Dropbox and local upload components, reducing ChannelCard drag-drop and configuration state.
- Sorted track tabs by numeric ID rather than lexicographic strings so the Tracks panel lists Track #1, #2, #3, etc., when ordering by ID.
- Extracted dataset setup concerns into a dedicated hook that manages voxel resolution snapshots, dataset errors, and channel layer uploads/removals, with focused unit tests covering layer replacement and ignored TIFF groups.

## Rendering and interaction foundations
- Established the Vite + React frontend, Three.js volume renderer, and playback pipeline with keyboard/mouse navigation and responsive resource reuse.
- Added brightness/contrast controls (including ImageJ-like windowing for float volumes), playback speed/looping, and robust loading overlays.
- Refined camera clipping, ray-cast coordinates, and normalization to keep rendering stable across multi-channel datasets.
- Provided early webfont bundling and sidebar/control layout refreshes for consistent styling.

## Viewer shell refactor
- Broke the monolithic viewer shell into focused components for top navigation, playback, channels, tracks, and plot settings, with hooks to keep state wiring tidy.

## Volume viewer cleanup
- Moved renderer/camera/scene initialization into a reusable helper to simplify viewer setup effects.
- Extracted hover sampling math into a shared utility and isolated VR bridge wiring into its own component.
- Split VR input handling into focused controller configuration, HUD interaction, and volume gesture modules, adding unit
  coverage for yaw/pitch math and UI ray clamping helpers.
- Restored VR controller select handling to call the existing channel/layer and track callbacks without stray targets so
  typechecking passes and interactions match the pre-refactor behavior.

## Volume viewer modularization
- Moved slice texture preparation and material disposal helpers into `volume-viewer/renderingUtils` to share rendering cleanup logic.
- Added a dedicated `useVolumeViewerVrBridge` hook beside the VR bridge to centralize param/fallback wiring away from the React surface component.
- Split the loading overlay, hover debug banner, and track tooltip into focused presentational components within `volume-viewer/`.
- Extracted rendering math (raycast temps, colormap helpers, track geometry) into `volume-viewer/rendering/*` and tucked VR target helpers under `volume-viewer/vr/`, leaving `VolumeViewer` as an orchestrator.
- Extracted VR responsibilities into reusable hooks for session lifecycle, controller handling, playback bindings, and HUD data wiring so `useVolumeViewerVr` now coordinates modular helpers instead of owning all logic directly.
- Pulled volume and layer resource lifecycle, dimension reset logic, and colormap caching into `useVolumeResources`, keeping `VolumeViewer` focused on orchestration and prop wiring while VR and desktop rendering share the same refs.
- Introduced `useTrackRendering` to encapsulate track overlay lifecycle, hover/tooltips, and per-frame material updates, letting `VolumeViewer` reuse the same hover/ref state across desktop and VR pointer handling.
- Added `usePlaybackControls` to own time-index refs, playback state syncing, and per-frame advancement so the render loop and VR playback HUD rely on a single shared controller.
- Corrected the hook wiring and import paths after the playback refactor so typechecking passes, ensuring shared refs are provided once, track hover handlers are defined before VR setup, and rendering utilities resolve correctly.
- Wired `VolumeViewer` to the new loading overlay and track tooltip hooks so the JSX consumes shared hook state instead of duplicating inline calculations, and passed the hook-managed hover handlers through the VR bridge.
- Extracted `VolumeViewer` responsibilities into new `useVolumeViewerState`, `useVolumeViewerDataState`, `useVolumeViewerResources`, and `useVolumeViewerInteractions` hooks so state, data loading, hover handling, and resource management live in dedicated modules.
- Tightened the new viewer hook signatures to use mutable refs and nullable dimension callbacks expected by `useVolumeResources`, clearing the typecheck regressions after the modularization refactor.

## Front page contract review
- Documented the AppContent props and state that feed voxel resolution inputs, dataset error handling, preprocessing/import flows, and upload progress.
- Added a draft `FrontPageContainer` prop contract so the landing screen can be wrapped without leaking unrelated AppContent state.
