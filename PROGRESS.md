# Progress

## Latest changes
- Unrolled clipmap sampler access in the volume fragment shader so WebGL2 sees only constant-index texture lookups for clipmap levels and the fallback path.
- Updated streaming Zarr ingestion and clipmap rendering to preserve the time dimension, promote shapes/chunks to 5D tuples, and thread the viewer time index through streaming slice/clipmap reads so timepoints align correctly.
- Tightened volume streaming detection to require a `streamingSource`, keeping TIFF/offline Zarr volumes on cached textures and ensuring streaming metadata includes explicit sources in both 3D and slice modes.
- Documented the streaming Zarr pipeline, clipmap renderer, and store options in `PROJECT_STRUCTURE.md` and `README.md` so new contributors can trace the data flow.
- Added dataset metadata/store types to centralize Zarr store descriptors and expose streaming hints on viewer resources.
- Expanded test coverage for `ZarrVolumeSource` region reads and the clipmap renderer to exercise chunk copying, cache reuse, and shader uniform wiring.
- Added a `src/data/zarr.ts` module that wraps zarrita stores for remote fetches, directory-picked files, and OPFS/IndexedDB
  preprocessing outputs with helpers for opening arrays/groups and range slicing utilities backed by new tests.
- Removed the track channel label above the Min length slider in the Tracks window to avoid duplicating the active tab name.
- Simplified channel tab editing by removing the rename button, enabling double-click rename on the tab header, keeping a single close control, and capping names at 9 characters.
- Removed the per-channel track count header line from the Tracks window and now show the Min length slider value as the raw input number instead of a micrometer-formatted length.
- Restyled the viewer top menu dropdown items to remove outlines/background fill so they blend with the top bar styling while keeping hover/focus cues.
- Added a Shift-modifier sprint that doubles W/A/S/D/Space/Ctrl camera movement speed in the 3D viewer.
- Reduced the default vertical offset for the Viewer controls and Tracks floating windows so they sit closer to the top menu wi
  thout overlapping it.
- Simplified the viewer top menu by removing dropdown headers/descriptions, aligning dropdowns to stay on-screen, and blending
  the menu buttons into the bar styling.
- Added dropdown menus for File/View/Channels/Tracks in the viewer top bar with keyboard-friendly popovers and moved layout/exit
  actions into the File menu.
- Swapped Space and Ctrl slice-view pan bindings so Space pans down and Ctrl pans up in the 2D view.
- Extended the viewer top menu to span the full width with left-aligned controls and squared edges.
- Made selected track blink intensity much more pronounced so the highlight is easy to notice.
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

## Follow pointer/OrbitControls overlap
- Gated pointer-look handlers while a track/voxel is being followed so OrbitControls rotation owns the drag gestures and the camera no longer receives conflicting updates that caused stutter.

## Track follow rotation enablement
- Re-run OrbitControls rotation enabling when the controls instance appears so track follow mode always allows orbit dragging without impacting voxel follow behaviour.

## Viewer top menu layout alignment
- Split the top menu bar into left and right flex regions so dropdown triggers, help, and follow controls stay grouped while the intensity readout aligns to the opposite edge alongside newer main-branch layout updates.

## Viewer dropdown alignment
- Anchored top menu dropdowns to the left edge of their triggers so the menus open to the right without covering the buttons themselves.

## Arrow key camera rotation
- Added arrow-key yaw/pitch controls that mirror pointer-look behaviour in both free-roam and follow/orbit camera modes.
## Planar track endpoint rendering
- Limited planar endpoint markers to the last visible point per track while retaining full line segments, keeping selection/follow styling on the singular marker.

## Planar overlay pixel widths
- Normalized planar overlay strokes and endpoints to screen-space widths so zooming no longer inflates or shrinks track lines.
- Kept hover outlines and thin-stroke fallback outlines anchored to pixel widths after reversing the view scale during rendering.

## Volume renderer teardown
- Added a destroy helper for the volume render context that disposes the WebGL renderer, XR state, render lists, controls, and DOM nodes while clearing the scene.
- Wired the volume viewer cleanup to use the new helper so unmounting releases WebGL contexts and associated listeners cleanly.

## Zarr layout metadata helpers
- Defined `src/data/zarrLayout.ts` with canonical volume array paths, chunk/shard sizing helpers, root attribute typing, and backward-compatible metadata validation.
- Added read/write utilities to normalize voxel sizing, axes, channel labels, and per-volume statistics for zarr roots.
- Covered the new layout helpers with unit tests and wired them into the test suite.

## Volume loader Zarr writes
- Refactored the volume loader worker to stream TIFF slices straight into per-slice Zarr chunks via the shared async store while still emitting slice progress metadata.
- Added per-slice min/max reporting to loader messages so downstream consumers retain range visibility during incremental writes.

## Zarr context access for build compatibility
- Replaced the deep import of the Zarrita array context helper in the volume loader worker with a local symbol lookup so Vite can resolve worker builds without missing export errors.

- Added streaming preprocessing hooks that build sharded Zarr arrays during volume loading and expose reopened arrays for visualization reuse.

## Zarr mipmap builder and analytics
- Added an incremental mipmap builder that reads level-0 chunks, max-pools them into additional Zarr arrays, and streams per-channel histograms/quantiles into root and analytics metadata without materializing entire volumes.

## Preprocessed loader milestones
- Threaded new preprocessing milestone messages (scan → level0 → mips → finalize) through the import worker client and loader state.
- Surfaced the milestones in the preprocessed loader UI alongside byte/volume progress while keeping drag-and-drop and Dropbox controls responsive.

## Streaming Zarr volume source
- Added a `ZarrVolumeSource` abstraction with per-mip chunk scheduling, LRU caching, and abort-aware request handling to keep streaming responsive during viewport changes.
- Covered cache eviction and request cancellation behaviours with dedicated unit tests and wired them into the shared test runner.
- Corrected chunk byte accounting to handle Zarrita's `{ data, shape, stride }` chunk responses so caching works under strict type-checking.
- Hardened abort error creation with a DOMException fallback so cancellation works in runtimes without the DOM lib on the global scope.
- Fixed the cancellation unit test to resolve in-flight work before asserting the aborted request, eliminating the dangling pending promise that caused the runner to exit with code 13.
- Updated preprocessed export/import to embed a Zarr store alongside the legacy binaries, validate the new manifest `zarrStore` descriptor, and read arrays directly from archive or URL-backed stores when present.

## Volume viewer clipmap rendering
- Added a clipmap manager that keeps per-mip 3D textures aligned to the chunk grid, updates origins around the camera target, and uploads refreshed regions.
- Updated the volume shader to select clipmap levels per sample, scale raymarching steps by LOD, and preserve multi-channel blending.
- Wired interaction-aware LOD throttling into the render loop so movement temporarily biases sampling toward coarser levels while keeping the coarsest mip resident.

## Clipmap initialization fix
- Seeded clipmap level origins with an invalid sentinel so the first update populates textures instead of leaving them empty and producing black renders.

## Planar hover color typing
- Defaulted planar layer colors to white when unset so hover formatting and slice compositing avoid undefined hex strings and continue to pass strict type checks.
## Planar streaming slices
- Added view-aware planar slice streaming that selects mip levels based on zoom, requests only the visible region, and reuses cached tiles with abortable fetches.
- Reused the planar loading overlay for slice streaming progress and wired hover/intensity sampling to the streamed slice buffers.
- Guarded planar slice cache eviction against undefined keys to satisfy strict type checks while preserving the LRU behaviour.

## 3D clipmap streaming refactor
- Swapped the volume viewer's clipmap path to stream chunked data from `ZarrVolumeSource`, keeping the coarsest mip resident for early visibility and honoring abort/priority cues around the camera.
- Updated `useVolumeResources` to treat volumes as streamable objects, seed placeholder textures when data isn't preloaded, and drive clipmap fetches for the active bounds before shader uploads.
- Added a streaming clipmap unit test that exercises async fills and confirms coarse-level visibility without cached volume buffers.

## Preprocessed streaming context
- Initialized `ZarrVolumeSource` instances for Zarr-backed preprocessed imports, deriving base and mip chunk metadata from the store when available.
- Threaded streaming base shapes and sources into the normalized volumes returned to callers while keeping non-Zarr archives on the previous non-streaming path.
- Added streaming source reconstruction for external Zarr stores during preprocessed import worker results.

## Clipmap base-shape validation
- Ensured GPU clipmaps only initialize when both Zarr streaming sources and base shapes are present, passing the real streaming metadata into the manager so mip sizes align with the loader output.
- Added a streaming volume resource test that instantiates a clipmap-backed layer and confirms the first mip uploads streamed data instead of placeholder textures.
- Cleaned up the clipmap streaming inputs to use `undefined`-backed optionals so the stricter type-checker accepts the gating logic without null fallbacks.

## Time-aware planar streaming fixes
- Corrected planar slice mip selection to treat Zarr shapes as 5D tuples and propagate the viewer's time index through streaming requests without type errors.
- Restored `useVolumeViewerResources` time-index threading so streaming hooks receive the selected frame during volume rendering.
2025-12-12T21:34:34+00:00: Updated clipmap mip selection to use logical shapes and added streaming region coverage test/assertions.


## Zarr volume chunk validation
- Normalized Zarr chunk requests to honor five-dimensional coordinates when present and fallback to the array's dimensionality for 4D data.
- Added shape-aware byte length validation when loading Zarr-backed preprocessed volumes to catch mismatched payloads while preserving streaming context setup.
## Clipmap dtype support
- Taught `VolumeClipmapManager` to mirror the Zarr source dtype when allocating clipmap buffers and textures so float and uint16 volumes upload without truncation.
- Normalized clipmap uploads to use matching typed arrays instead of `Uint8Array`, wiring UnsignedShort and Float textures through to the shader path.
- Added a streaming clipmap regression test covering uint16 data to guard future dtype regressions and wired it into the shared test runner.

- Fixed preprocessed viewer launch by passing all layer state setters into applyLoadedLayers so preprocessed imports initialize viewer state correctly (2025-03-01).
- Extended ApplyLoadedLayersOptions to include layer state setters and global defaults so preprocessed experiment launches type-check and correctly seed viewer state (2025-03-01).
- Synced viewer and experiment dimensions to the preprocessed manifest before applying loaded layers to keep the viewer from launching into a blank state. (2025-03-01)

## Export service worker base path
- Updated export service worker registration and route prefix derivation to honor the deployed base path (e.g., GitHub Pages subdirectories) so `export-sw.js` no longer 404s when served from a repository scope.
- The service worker now calculates its base path from its own URL, ensuring fetch handling and registrations align with the hosted location.
2025-03-08T00:00:00+00:00: Fixed export service worker registration on subpath deployments.
- Ensured preprocessed imports rebuild streaming contexts when worker-transferred streaming sources lose methods, avoiding viewer crashes and adding targeted regression tests (2025-12-14).
