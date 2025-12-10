# Progress

## Latest changes
- Swapped channel/track tab visibility toggles from Ctrl+click to middle-click to avoid conflicts with translation shortcuts.
- Ensured selecting a track from the viewer promotes it to the top of the Tracks list and refreshes selection state so the rend
  ered line visibly blinks and the selection order drives list sorting.
- Fixed planar track rendering so XY slices only draw points near the current slice, added projected overlays in XZ/ZY views,
  and updated hit testing/drawing to use per-view coordinates.
- Ensured 2D slices render pixel-perfect with a visible hover indicator, fixed viewer setting labels/visibility (orthogonal
  toggle in 2D, renamed rendering controls, widened trilinear quality range), and prevented the additive/alpha toggle from
  resetting the 3D camera view.
- Centralized loading overlay normalization into a shared hook for Planar and Volume viewers, removing duplicate calculations
  and keeping overlay displays consistent.
- Extracted shared viewer styles (layout, headers, overlays, tooltips, loading panels) into `viewerCommon.css` so Planar and
  Volume viewers only keep their unique rules.
- Added a shared layer settings updater to centralize brightness/contrast/window change handling and reduce duplication in the
  app router callbacks.
- Reorganized hooks under `src/hooks` into `dataset/`, `viewer/`, and `tracks/` subfolders, moving related hooks and adding
  barrel exports to keep imports stable across the app and tests.
- Fixed broken import paths after the core/shared/ui split (Dropbox/components, workers, shared utils) and addressed implicit
  any warnings so `npm run typecheck` passes again.
- Pointed the UI layout to the relocated `styles/app/index.css` asset so the Vite production build can resolve global styles.
- Updated the texture cache to pack 3-channel volumes into RGBA textures so Three.js builds without missing format exports.
- Restructured the app into `src/core`, `src/shared`, and `src/ui`, moving processing/cache modules, shared helpers, and UI
  components accordingly while updating imports/tests.
- Moved UI components into a new `src/components` tree split into `pages`, `viewers`, and `widgets`, updating imports, router
  wiring, and documentation references.
- Centralized window layout defaults and reset handling into a dedicated `useWindowLayout` hook with coverage for layout
  resets.
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

## Test maintenance
- Updated volume viewer unit test imports to the relocated `components/viewers` paths after the UI restructuring.
- Broke out hover sampling into `useVolumeHover`, added a renderless `TrackCameraPresenter` for follow-mode camera updates, and introduced `VolumeViewerVrAdapter` so `VolumeViewer` now orchestrates hover, camera, and VR pieces instead of inlining them.

## Router refactor
- Added `useAppRouteState` to centralize dataset setup and viewer state wiring, exposing route-specific props for reuse.
- Introduced `DatasetSetupRoute` and `ViewerRoute` wrappers so `AppRouter` now only handles navigation and suspense boundaries.

## Front page modularization
- Split the landing screen into focused components for the header, experiment configuration, preprocessed loader, channel tabs, launch actions, and warning window, passing grouped props to reduce the monolithic prop list.
## useAppRouteState cleanup
- Extracted layer interaction and viewer-layer memoization into a dedicated `useLayerControls` hook to slim down the route wiring and group related handlers.
- Removed unused imports from `useAppRouteState` after the extraction to keep the hook surface focused on the state it owns.

## Front page typing fixes
- Added the missing `experimentDimension` and launch visibility props to the channel list and launch actions wiring so the front page passes the full contract expected by `ChannelCard` and `LaunchActions` without type errors.

## Hover sampling fixes
- Adjusted planar hover handling to rely on the active canvas element from the pointer event, preventing stale refs from blocking pixel sampling.
- Limited volume hover listeners to the WebGL canvas so pointer coordinates match the sampled surface, restoring voxel intensity readouts.

## Hover readout persistence
- Added persistent hover tracking in `useAppRouteState` so the last sampled voxel remains visible in the top menu instead of being cleared immediately.
- Reset the stored hover value alongside viewer mode switches to avoid stale readouts when changing contexts.

## Additive blending fix
- Guarded volume resource materials that may be arrays when applying additive blending so shader uniforms and blending modes update without type errors.

## Planar track hit testing
- Updated planar track hit testing to use per-view projected points across XY, XZ, and ZY layouts, aligning selection distances with the rendered overlays.
## Viewer settings blending toggle
- Preserved the current camera position and target across render context teardowns so toggling additive/alpha blending no longer resets the 3D view.

## Planar track rendering regression
- Restored the XY overlay to render full track projections instead of slice-clipped fragments, recovering the smoother, continuous appearance from the previous implementation while keeping orthogonal overlays slice-aware.
- Updated orthogonal planar overlays to render full max projections rather than slice-aware fragments so XZ and ZY tracks match the restored XY behaviour.

## Camera control remapping
- Remapped vertical fly controls to Space (up) and Ctrl (down), freed Q/E from movement, and added keyboard-driven camera roll for 3D navigation.

## Channel opacity interactivity guards
- Hid planar hit-test targets and volume track line/end-cap meshes when their channel opacity is zero unless the track is explicitly followed/selected, preventing invisible overlays from capturing pointer/VR hover.
- Added regression coverage to ensure opacity-zero tracks are neither rendered nor hovered in pointer/VR contexts.
## Reset view roll correction
- Ensured the volume viewer reset action also restores the camera up vector and forward alignment so any roll input is cleared when resetting the view.

## Planar viewer key remapping
- Swapped A/D horizontal panning directions and added Space/Ctrl bindings for vertical panning in the 2D viewer.
## Track follow state propagation
- Synced the followed track ID prop into the shared ref and refreshed per-frame follow offsets so track-centered orbits stay aligned while playback advances.

## Voxel follow mode
- Added a voxel-follow state that centers the camera on the last double-clicked voxel, mirrors track-follow orbit locking, and surfaces a stop-follow control alongside the existing track follow UI.
- Blocked voxel following while a track is actively followed and clear voxel follow state whenever track following engages or viewer mode switches.

## Voxel follow type fixes
- Exported the voxel follow target type from the viewer types module and broadened hover handlers to accept double-click mouse events so type checking succeeds for the new follow entrypoint.

## Pointer look while following
- Allowed pointer-driven camera rotation even when following a track by keeping pointer look handlers active and aligning the rotation target with the current follow target.

## Follow orbit center preservation
- Updated pointer-look orbiting to keep the rotation target anchored to the followed subject, moving the camera around the current controls target instead of shifting the target during drags.
