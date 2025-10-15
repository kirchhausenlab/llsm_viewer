# Progress Log

## VR session stability fixes
- Refresh controller visibility whenever the WebXR manager reports session lifecycle changes so headset controllers reliably
  appear with their rays when entering immersive mode.
- Reset the renderer sizing and animation loop after WebXR sessions end, restoring the desktop viewer instead of leaving a blank
  canvas when exiting VR.

## VR HUD orientation and staging offset
- Locked the VR playback HUD to the camera's yaw so it always stands vertically in-headset while remaining draggable.
- Offset the normalized volume root by 0.8 m upward and 0.3 m forward when immersive sessions start, then restore the original placement after exiting VR.

## VR volume ray-march fix
- Updated the 3D volume meshes to refresh their camera-position uniforms during `onBeforeRender`, giving WebXR eye cameras the
  correct ray origins so immersive mode renders the same ray-marched 3D texture seen on desktop instead of the fallback slice
  planes.

## Immersive VR renderer integration
- Added WebXR session management to the 3D viewer, exposing Enter/Exit VR controls in the playback window once immersive VR support is detected.
- Swapped the render loop to Three.js's `setAnimationLoop`, enabling headset-driven frame timing while keeping the existing keyboard movement and track uniforms in sync.
- Instantiated Quest controller models with forward-pointing ray visuals, wiring them into the scene graph so they appear during VR sessions and tear down cleanly afterwards.
- Routed session lifecycle callbacks to the React shell so the UI reflects active VR status and guards mode toggles while a headset session is live.

## VR playback controls
- Built a camera-anchored playback HUD for immersive mode with a 3D play/pause button, scrubber, and time label that mirror the desktop controls while remaining visible in-headset.
- Wired controller raycasts to the HUD so hovering highlights elements, the trigger toggles playback, and dragging the slider updates the active timepoint in real time.
- Synced session lifecycle hooks to show and hide the HUD as VR sessions start or end, cleaning up textures and materials when the Three.js renderer tears down.

## Normalization fast path
- Added a zero-copy normalization path for uint8 volumes already spanning [0, 255] and introduced regression tests to verify buffer reuse and clamped results for other ranges.

## Client-side data ingestion cleanup (current)
- Removed the Express backend and filesystem-scanning APIs now that datasets and tracks load directly from the client.
- Simplified the npm scripts to run only the Vite dev server and removed the related server build configuration.

## Per-channel track organization
- Added per-channel tabs to the tracks window so each channel exposes independent visibility, opacity, thickness, and follow controls.
- Persisted track color schemes per channel with preset swatches and a "Sorted" option that restores the rainbow palette.
- Threaded channel-specific track color modes, offsets, and line styles into both the 3D and 2D viewers so trajectories shift and recolor alongside their parent channels.

## Initial scaffolding and data ingestion
- Set up a Vite + React front-end with a sidebar workflow to enter dataset paths and browse discovered TIFF stacks.
- Implemented an Express-based backend that lists TIFF files in a directory and streams 3D volumes (as Float32 arrays) decoded with `geotiff`.
- Added a canvas-based central-slice previewer to validate volume ingestion while the full GPU renderer is under construction.
- Established shared styling, project configuration, and scripts for concurrent dev server workflows.
- Configured the dev and preview servers to bind to `0.0.0.0` by default so the app is reachable across the local network.
- Reworked the volume transport path to stream raw binary data with metadata headers, avoiding massive base64 payloads that crashed Chromium during decoding.

## Volume rendering prototype
- Replaced the 2D slice preview with a Three.js-based ray-marched renderer using `VolumeRenderShader1` for 3D exploration.
- Normalized incoming voxel intensities on the CPU and uploaded them into a `Data3DTexture`, reusing a grayscale transfer function texture.
- Wired `OrbitControls` for intuitive drag-to-rotate and scroll-to-zoom interaction inside the viewer.
- Added responsive resizing and resource cleanup so the renderer adapts to layout changes without leaking WebGL resources.
- Tightened the layout so the viewer fits within the viewport without scrollbars and added a "Reset view" control that recenters the orbit camera.

## Interaction polish
- Restored Shift-drag panning by temporarily enabling the underlying OrbitControls pan mechanics during custom pointer handling, then restoring the prior configuration on release.
- Added global keyboard navigation that lets users strafe with WASD and dolly with Q/E, mirroring the custom drag interactions while preserving text-input usability.

## Temporal playback pipeline
- Loading a dataset now fetches and normalizes every timepoint upfront, with a cancellable request pipeline and a centered progress HUD that reports completion percent and volume count while decoding.
- Added a persistent playback bar with play/pause controls and a scrubber, synchronizing the sidebar selection with smooth looping playback at 12 FPS.
- Reused GPU resources between frames by re-uploading voxel data into a persistent 3D texture so time scrubbing remains responsive while the camera continues to orbit freely.

## Playback UX refinements
- Retired the sidebar filename list in favor of a compact dataset overview so time navigation happens exclusively through the playback controls.
- Preserved orbit camera state while iterating through timepoints by reusing the existing 3D texture and geometry resources instead of rebuilding them on every frame.

## Loading feedback fixes
- Adjusted the loading overlay logic so it remains visible until every discovered timepoint has finished decoding, preventing premature dismissal while frames are still streaming in.

## Rendering regression fix
- Repacked multi-channel volume textures into RGBA slices before uploading to the GPU so WebGL sampling no longer fails, restoring visible rendering while keeping RGB volumes displayed in color.

## Camera clipping improvements
- Reduced the perspective camera's near plane dynamically relative to each dataset and extended the far plane to prevent the volume from being clipped when zooming in, allowing the user to move the camera inside the volume without losing detail.

## Ray casting coordinate fixes
- Corrected the shader camera uniform to use mesh-local coordinates so the new bounding-box intersection logic samples the volume in the proper orientation instead of collapsing the volume along the ray direction.

Next steps:
- Build the WebGPU ray-marched volume renderer integrated with transfer-function controls.
- Add asynchronous preprocessing hooks for caching multi-resolution volumes when needed.

## Sidebar and rendering controls refresh
- Relocated dataset loading controls so the "Load dataset" action sits beneath the path field for clearer call-to-action placement.
- Replaced the dataset overview with a "View controls" panel that exposes the reset-view action and a new global contrast slider.
- Threaded the contrast parameter through the React tree into the shader uniforms so users can interactively tune rendering contrast from the sidebar.
- Introduced brightness and playback-speed sliders in the sidebar, routing the brightness value into the shader tone mapping and using the FPS control to drive the playback loop.

## Loading overlay persistence
- Reworked the progress calculations to rely on the decoded timepoint count when available, keeping the overlay visible until every expected frame has been ingested and preventing the early dismissal seen after the first volume finished loading.

## Camera translation restoration
- Restored strafe and dolly interactions so they once again translate the camera instead of orbiting the volume by keeping the orbit target synchronized with manual movements.
- Increased the manual translation step size slightly so keyboard motion feels more responsive without overshooting the dataset.

## Camera rotation pivot corrections
- Locked the orbit target to the normalized volume center so rotations always pivot around the dataset regardless of how the camera is translated.
- Cached the default camera position/target pair on load and reused it for the reset-view handler to guarantee the button restores the original composition.

## Intensity normalization consistency
- Switched the preprocessing pipeline to compute a single intensity range across every loaded timepoint and channel, ensuring all normalized volumes share consistent brightness.

## Loading throughput improvements
- Parallelized individual TIFF fetches on the client so multiple timepoints stream simultaneously while preserving cancellation safety and progress tracking.
- Copied slice rasters into the volume buffer with `Float32Array#set` on the server and tracked per-volume intensity extrema during ingestion.
- Sent the precomputed min/max values alongside each volume so the client can normalize without re-scanning raw buffers.

## Render surface readiness gating
- Prevented zero-sized resize events from propagating to the renderer so the canvas no longer flashes at startup while the container is measuring.
- Latched a `hasMeasured` flag once the observer reports positive dimensions and used it to toggle the render surface visibility.

## Layer-specific rendering controls
- Converted the layer list into a tabbed interface so each layer exposes its own visibility toggle alongside dedicated contrast and brightness sliders.
- Removed the global contrast/brightness controls, wiring the per-layer slider values directly into the volume renderer uniforms for independent adjustments.

## Tracks ingestion groundwork
- Consolidated dataset and track loading so the launcher performs both steps before entering the viewer, wiring the launch butt
on into the existing dataset/track loaders.
- Disabled launching when no dataset folders are selected and surfaced a loading state on the launch button while volumes and t
racks stream in.
- Tweaked the launcher and sidebar layout text to match the latest terminology ("Tracks", "Movie", and "Return to Launcher") an
d centered the front-page card in the viewport.
- Added a dedicated "Load tracks" widget beneath the dataset loader that accepts a CSV path, provides a file picker, and surfaces success/error states.
- Implemented backend CSV browsing/loading endpoints that accept file paths, ensuring each row supplies exactly eight columns before the data is stored client-side for later use.
- Tightened the CSV validator error messaging to spell out the requirement for eight comma-separated fields per row.

## Grayscale tint controls
- Added per-layer tint settings for monochannel volumes, including preset swatches and a custom color picker directly in each layer tab.
- Threaded the selected tint through the viewer so grayscale datasets render with the chosen color-specific colormap while RGB volumes remain unchanged.

## Tracking layout overhaul
- Split the interface into a three-column layout, introducing a dedicated right sidebar that houses every tracking-related control.
- Moved the tracks file picker and overlay toggle into the new panel, added global opacity/thickness sliders, and exposed a scrollable checklist with per-track visibility plus a master checkbox.
- Threaded the aggregate tracking settings into the WebGL renderer so overlay visibility, alpha, and line width respond instantly to the sidebar controls while respecting individual track toggles.

## Track following mode
- Added per-track "Follow" actions that activate an auto-centering mode, keeping the camera target aligned with the selected trajectory's centroid at the current timepoint.
- Surfaced a global "Stop tracking" control above the viewer that exits follow mode and reports which track, if any, is currently locked.
- Disabled keyboard-based WASDQE translations while following so orbital rotation remains the only manual interaction, preventing accidental drifts away from the tracked particle.

## File system access hardening
- Stopped the directory browser endpoint from scanning for TIFF files during navigation so protected Windows folders no longer trigger permission errors while exploring the tree.
- Limited TIFF enumeration to the explicit dataset load step, aligning the backend's filesystem access with the UI workflow and preventing unnecessary volume probing.

## Float and 32-bit volume ingestion
- Extended the TIFF ingestion pipeline to accept every GeoTIFF numeric sample format, including signed/unsigned 32-bit integers and both 32-bit and 64-bit floating-point rasters, while preserving min/max tracking.
- Threaded the expanded data-type metadata through the client normalization utilities so fetched buffers are interpreted with the proper typed-array view before intensity normalization.

## Head-tracked viewing mode
- Integrated MediaPipe's `FaceLandmarker` through a reusable head-tracking controller that streams webcam frames, providing smoothed iris-based head pose updates without blocking the render loop.
- Added a "Head mode" toggle in the viewer header with status telemetry and graceful fallbacks, coordinating camera takeover, permission prompts, and error reporting.
- Implemented an off-axis projection pipeline that reprojects the perspective camera each frame based on the tracked eye position, suspending manual orbit interactions while active and restoring them on exit.

## Concurrent volume ingestion
- Replaced the sequential worker-side queue with a concurrency-limited promise pool keyed to `navigator.hardwareConcurrency`, so multiple TIFF stacks decode in parallel while respecting transfer ownership of the underlying buffers.
- Verified that the main-thread loader already stores payloads by index, making it compatible with the new out-of-order worker messages and ready for follow-up perf experiments.
- Manual stress test with multi-gigabyte stacks remains outstanding in this environment; plan to validate throughput and memory residency with local datasets.

## Head-tracking dependency resolution
- Reworked the MediaPipe integration to lazy-load the face landmarker bundle directly from the jsDelivr CDN, eliminating Vite's module resolution failures when the npm package is unavailable locally.
- Added lightweight TypeScript shims for the MediaPipe APIs so the head-tracking controller retains type safety while relying on the CDN-sourced module.

## Head mode orientation fix
- Derived the default head-mode screen basis from the active camera orientation so enabling the feature after orbiting still computes a stable off-axis projection.

## Head mode deprecation
- Removed the head-tracking subsystem, including the MediaPipe integration and associated UI toggles, to streamline the viewer and eliminate dormant permissions prompts.
- Simplified the rendering loop and camera reset logic now that the off-axis projection path is gone, keeping keyboard navigation and track following unchanged.

## 2D slice renderer rewrite
- Replaced the 2D viewer's slice renderer with a DataTexture pipeline that extracts per-slice textures on the CPU, bypassing the failing sampler3D shader path.
- Added reusable helpers for packing slice data so grayscale and multi-channel volumes share the same upload logic.
- Updated the slice shader to sample 2D textures, enforce a minimum opacity, and honor layer tint/contrast uniforms for visible cross-sections.

## 2D slice index refresh
- Updated the slice rendering pipeline to derive the active depth index directly from the component props so keyboard and slider changes immediately refresh the displayed plane.
- Reused the prop-derived index both for resource creation and per-frame slice updates, keeping the mesh translation and CPU buffer packing in sync with the latest UI state.

## Slice renderer stability fixes
- Added guarded resource management so the 3D and 2D rendering paths rebuild their materials only when their configuration changes, preventing Vite from failing with stray `else` blocks.
- Introduced reusable helpers for slice buffer preparation and safe camera-uniform updates, allowing the volume viewer to build successfully when the slice shader is active.

## Standalone 2D slice viewer
- Added a dedicated mode toggle that swaps between the existing 3D renderer and a brand-new 2D slice viewer without sharing rendering code.
- Implemented a pixel-accurate XY slice renderer with brightness/contrast-aware compositing and configurable grayscale tinting while avoiding interpolation entirely.
- Introduced keyboard, mouse, and slider controls for navigating Z planes, rotating within the slice plane, and panning/zooming in a manner consistent with the 3D controls.
- Updated the layout and styling so both viewer modes share playback widgets and reset-view integration, while keeping tracking functionality as a no-op in 2D mode.

## Track overlay restoration after mode toggles
- Latched a revision counter when the 3D viewer boots so the tracking overlay rebuilds once its scene graph is ready instead of relying on incidental prop changes.
- Re-ran the track creation and visibility effects whenever the overlay is reinitialized, ensuring trajectories retain the correct translation and scale after returning from 2D mode.

## Volume root transform regression fix
- Restored the missing volume-root transform helper so the Three.js scene initializes even before a dataset is loaded, preventing the viewer from crashing on startup.
- Reapplied the transform whenever dataset dimensions change or resources are torn down, keeping the volume and tracking overlays consistently centered.

## Planar viewer track projection
- Projected loaded trajectories into the 2D canvas so the XY slices render flattened paths that respect the current time scrubber while ignoring per-plane depth differences.
- Matched the overlay styling and opacity controls from the 3D scene, including highlight cues for the actively followed track and persistent endpoint markers.
- Synced track following with the 2D navigation stack by recentering on the current trajectory point and snapping the Z slider to the track's plane, mimicking the 3D follow behavior without disturbing existing controls.

## Track overlay boot fix & planar control revert
- Latched the render-surface ref through a stateful callback so the 3D viewer only initializes once the container is mounted, ensuring track overlays build immediately after loading trajectories.
- Returned the 2D viewer to left-drag panning while restoring Q/E keyboard rotation, mirroring the earlier navigation scheme without disturbing slice shortcuts.

## 3D track overlay alignment fix
- Removed the redundant scaling/translation applied to the Three.js track overlay group so its coordinates match the normalized volume root, restoring visible trajectories in 3D mode across datasets.

## Track overlay timestep latch
- Latched the 3D viewer's internal time index ref to the latest scrubber value on every render so the overlay rebuild always receives the correct timestep when returning from 2D mode, keeping trajectories lined up without requiring a manual follow action.

## Track overlay transform sync
- Applied the stored volume normalization transform to the tracking overlay as soon as the Three.js group is recreated so toggling back from 2D mode no longer leaves trajectories in raw voxel space until another interaction forces a refresh.
## Front page launcher
- Introduced a dedicated landing screen with dataset and track loading widgets centered in a modal-style card.
- Added a launch button that transitions into the viewer layout while leaving load controls exclusively on the front page.
- Provided an "Open launcher" shortcut inside the viewer so datasets or track files can be reloaded without refreshing.

## Playback control layout updates
- Moved the planar Z-plane slider into the shared playback window so slice navigation lives alongside the other temporal controls.
- Updated button labels and layout to use standard play/pause icons, clarify mode switching copy, and align reset actions horizontally for quicker access.
- Expanded the viewer canvas to span the entire screen and layered the floating control panels above it, giving both the 2D and 3D renderers maximum space while keeping the overlays draggable.

## Canvas chrome removal
- Stripped the residual padding, borders, and drop shadows from both the 3D and 2D viewer containers so their canvases now stretch edge-to-edge without visible framing.


## Client-side dataset ingestion overhaul
- Removed the server-side directory browser and volume APIs in favor of pure client-side loading.
- Added drag-and-drop upload panels for TIFF stacks and track CSVs, grouping dropped files into layers automatically.
- Introduced a web worker–powered TIFF decoder that reads local files with `geotiff` and streams progress updates without blocking the UI.
- Replaced path-based configuration with on-page status messaging so launching validates timepoint counts and surfaces CSV parsing errors instantly.

## Channel-centric launcher redesign
- Replaced the flat dataset/track dropzones with channel cards that collect named layers and an optional tracks CSV per channel.
- Added inline validation summaries for missing layers, mismatched timepoint counts, and track parsing status so issues surface before launch.
- Enabled drag-and-drop creation of new channels, including auto-naming based on folder drops and a quick-add button for manual setup.
- Summarized the pending configuration with total channel/layer/track counts and reused the viewer loader to flatten channel layers while ignoring secondary track files.
- Verified the production build with `npm run build`, which succeeds while surfacing the existing CSS minifier warning for translucent backgrounds.

## Front page background video overlay
- Reworked the launcher background styling so the landing screen sits atop the looping video rather than the legacy gradient fill.
- Moved the gradient tint into a pseudo-element overlay, letting the new video remain visible while preserving the subtle color wash.
- After review feedback, removed the overlay entirely so the video renders without any additional gradient tint.

## GitHub Pages deployment
- Added a GitHub Actions workflow that installs dependencies, builds the Vite project, and deploys the `dist/` output to GitHub Pages.
- Updated the Vite configuration to emit builds into `dist/` and automatically derive the correct base path when running inside GitHub Actions.
- Documented the deployment workflow and required GitHub Pages settings in the README.

## Layer alignment slider
- Added a per-layer X displacement slider in the layers window that only affects the active layer, allowing subpixel alignment checks against other layers in both 3D and planar viewers.
- Expanded the alignment controls to include matching ±10 px ranges on side-by-side X and Y displacement sliders without growing the panel footprint, updating both planar resampling and 3D mesh offsets to respect the new axis.

## VR playback HUD relocation
- Raised the VR volume anchor height to 1.2 meters so datasets sit closer to eye level when a session begins.
- Repositioned the VR playback controls so they snap to the volume's left edge (with sensible fallbacks before data loads) instead of floating in front of the viewer.
- Switched the playback panel materials to double-sided rendering so the controls remain visible when viewed from behind.
