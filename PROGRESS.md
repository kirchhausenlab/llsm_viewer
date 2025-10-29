# VR performance tuning
- Added a configurable `u_stepScale` ray-march uniform so headset sessions can trade sampling density for performance without
  recompiling shaders.
- Defaulted the step scale to 1.0 on desktop and raised it to 1.4 whenever immersive WebXR sessions start, then restored the
  desktop value on exit to keep monitor rendering untouched.
- Requested the WebGL renderer to prefer the high-performance GPU and clamped its pixel ratio to 2× to avoid unnecessary supersampling spikes.
- Applied fixed foveated rendering when immersive sessions begin and restored the previous setting on exit, trading peripheral detail for noticeably smoother headset frame rates while keeping central fidelity intact.

# Progress Log

## Auto contrast initial threshold adjustment
- Raised the default auto window threshold from 5,000 to 50,000 so the first "Auto" press now keeps a broader histogram range
  before subsequent presses tighten it.

## Float volume default windowing
- Compute per-layer default brightness/contrast windows for float volumes using histogram quantiles, keeping uint8 data on the
  existing 0–1 range.
- Propagate the computed defaults through desktop and VR state so resets restore the histogram-derived window instead of the
  full range.

## ImageJ brightness/contrast model
- Introduced a dedicated windowing model that mirrors ImageJ slider behavior, including the 256-step integer slider range and
  piecewise contrast slope calculations.
- Updated layer settings to track min/max slider indices alongside normalized window bounds so React and VR controls stay
  synchronized.
- Replaced the desktop and VR brightness/contrast handlers with helpers from the new model, clamping to [0,1] and formatting
  labels from normalized window centers.

## Volume streaming guardrails
- Added a configurable `MAX_VOLUME_BYTES` limit so the worker bails out before allocating buffers for oversized datasets.
- Streamed TIFF slices from the worker instead of concatenating them, emitting per-slice messages with transferable buffers.
- Reassembled streamed slices in the main thread via a preallocated (Shared)ArrayBuffer and surfaced structured `VolumeTooLargeError` failures.
- Updated the React consumer to rebuild `VolumePayload` objects from streamed data and to present a friendlier error when a dataset exceeds the current limit.

## Track visibility regression fix
- Removed the artificial timeline offset that pushed parsed track coordinates beyond the dataset's frame range, restoring track visibility for channels with staggered starts.

## Launch warning visibility fix
- Added context-aware dataset error handling so the floating warning only appears after an attempted launch.
- Kept dataset validation feedback available while preventing file picker interactions from triggering the global warning banner.

## Bundled Inter webfont
- Added the `@fontsource/inter` package and imported its stylesheet during app bootstrap so the viewer consistently renders in Inter even on systems without the font installed.

- Adjusted the entrypoint imports to load the bundled Inter files ahead of the existing global stylesheet.

## Track CSV alignment update
- Adjusted track CSV parsing to treat the time column as `initial time + t`, ensuring trajectories align with staggered starts.
- Flipped imported track depths to account for the negative Z convention in source CSVs.
- Summarized CSV load confirmations using unique track IDs so sparse numbering still reports accurate totals.

## VR channels HUD layout expansion
- Added a segmentation layer toggle on the channel loader so instance masks can be marked during dataset setup.
- Precolor segmentation volumes during preprocessing using deterministic random palettes so the renderer keeps leveraging cached textures.
- Introduced automated coverage for the segmentation colorization helper to guarantee consistent colors per label and seed.
- Enlarged the immersive channels HUD panel and backing canvas so the grayscale color buttons have enough vertical room to render without being clipped.

## VR yaw handle direction and HUD opacity
- Inverted the yaw drag delta for volume and HUD rotation handles so spinning the side spheres now turns panels in the expected direction.
- Made the playback, channels, and tracks HUD backgrounds fully opaque by updating the Three.js materials and canvas fills.

## VR volume & HUD handle alignment
- Reworked yaw handle math to project controller positions into the viewer's horizontal basis, keeping yaw adjustments intuitiv
  e whether the volume or HUD panels are grabbed from the front or the back.
- Centered the immersive volume rotation spheres along the dataset's depth axis and matched their radius to the translation han
  dle before shrinking both, keeping the grips consistent while freeing up surrounding space.
- Tightened the HUD translation handle offset so the grab spheres now rest directly against their panels without leaving a visib
  le gap.

## VR reset view behavior
- Updated the immersive playback "Reset view" control to restore the normalized volume pose, recentering the dataset and VR HUD
  panels instead of only touching the orbit camera.

## VR tracks HUD scrollbar
- Added a vertical scrollbar to the immersive tracks list so every trajectory remains accessible when channels contain dozens of tracks.
- Snapped scroll interactions to row increments and highlighted the grab handle on hover to mirror the existing VR HUD affordances.

## VR HUD handle redesign
- Replaced the flat grab bands on the playback, channels, and tracks HUDs with sphere handles that mirror the volume translation
  grip, simplifying panel dragging to the proven mechanism.
- Attached dedicated yaw handles to each HUD, enabling one-handed rotation via a side sphere without relying on a second
  controller.

## VR playback reset split
- Split the immersive playback reset control into dedicated volume and HUD buttons so users can re-center panels without moving
  the 3D volume, or vice versa.

## VR HUD ergonomics refinement
- Thickened the VR HUD grab handles and widened controller hover margins so panels are easier to seize while moving.
- Flipped the default HUD orientation to face the viewer when sessions start, keeping user-driven yaw adjustments intact.
- Repositioned the playback HUD layout with a taller panel, surface-flush controls, and a dedicated top row for reset/mode/exit buttons.

## WebXR passthrough toggle
- Detected `immersive-ar` support alongside `immersive-vr` so the viewer can expose passthrough capabilities when available while
  retaining an optimistic fallback when WebXR probing is incomplete.
- Added a passthrough toggle button to the immersive playback HUD that restarts the session in-place, highlights the active mode,
  and hides itself when passthrough is unavailable.
- Switched the Three.js renderer to transparent clears so approved passthrough sessions show the real-world feed instead of an
  opaque background.

## VR tracks window regression fix
- Passed the channel catalog and track control callbacks down to the 3D viewer so the immersive tracks HUD no longer dereference
  undefined handlers and blank the canvas when initialized.

## Floating window scrollbar cleanup
- Removed horizontal overflow from floating window sidebars in the desktop viewer so overlay panels no longer show an unnecessary bottom scrollbar.

## VR track raycast crash fix
- Ensured controller raycasters provide the active XR camera to fat-line intersections so turning on tracks in immersive mode no
  longer dereferences a missing camera and freezes the viewer.

## VR session stability fixes
- Refresh controller visibility whenever the WebXR manager reports session lifecycle changes so headset controllers reliably
  appear with their rays when entering immersive mode.
- Reset the renderer sizing and animation loop after WebXR sessions end, restoring the desktop viewer instead of leaving a blank
  canvas when exiting VR.

## VR HUD tactile interaction
- Replaced ray-only HUD hit tests with controller-origin proximity checks so playback and channel controls require physically
  touching the panels before activating.
- Adjusted the immersive HUD cylinder radius to 0.9 m to keep both panels within comfortable reach while emphasizing the new
  touch interaction.

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

## Dropbox chooser integration
- Added a lazy-loaded Dropbox Dropins helper that injects the SDK with the configured app key and converts selections into `File` instances while preserving folder structure metadata.
- Hooked the channel layer picker into the Dropbox chooser with loading/error states, letting users import multi-file TIFF stacks directly from their Dropbox account.

## Dropbox chooser UX improvements
- Added an inline Dropbox configuration panel that stores app keys in the browser, guiding users toward the Dropbox App Console when no build-time key is present.
- Upgraded the Dropbox import flow with clearer messaging so missing keys prompt configuration instead of surfacing a generic error.

## Dropbox track imports
- Wired the per-channel track dropzone into the Dropbox chooser with its own import button, mirroring the TIFF workflow for CSV uploads.
- Shared the Dropbox status, error messaging, and configuration entry points between layers and tracks so progress and missing-key prompts surface where the user interacts.

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

## VR playback HUD cylindrical constraint
- Constrained the draggable VR playback HUD to a 1.5 m radius cylinder spanning floor to 2 m, clamping controller drags onto that surface.
- Reoriented the HUD so it always faces the world origin irrespective of head movement while preserving upright alignment.
- Updated default placement logic to project the initial HUD position onto the cylinder when entering immersive mode.

## VR channels HUD
- Added a VR-native channels control window that mirrors the desktop channels panel, including tabs, layer selection, visibility, per-layer sliders, and grayscale tint swatches.
- Reused the playback HUD's cylindrical positioning and drag constraints so both windows can be grabbed and moved independently in immersive mode.
- Wired controller interactions to the existing React state pipeline so VR adjustments immediately sync with the desktop UI and underlying rendering state.
- Raised the VR channels canvas fidelity by rendering at headset pixel ratios, enlarging typography, and brightening hover cues so controls remain legible inside WebXR headsets.
## Embedded Dropbox configuration
- Embedded the Dropbox app key `1abfsrk62dy855r` directly into the front-end integration so every deployment loads the chooser without manual setup.
- Documented the bundled key in the README and noted how to override it via `VITE_DROPBOX_APP_KEY` if needed.

## VR HUD grab handle tuning
- Restored the playback, channels, and tracks HUD grab handle height to its pre-regression size while retaining the deeper grab tolerance.

## Per-channel render style toggle
- Added a per-channel "Render style" toggle to the desktop channels window that flips 3D layers between maximum-intensity projection and iso-surface shading.
- Mirrored the control inside the VR channels HUD with a dedicated canvas button and hooked it into the existing state pipeline.
- Propagated the new setting into the Three.js volume materials so the shader's `u_renderstyle` uniform updates immediately without rebuilding textures.

## Layer file picker flexibility
- Updated the channel layer file picker so the "from Files" button opens a standard multi-file dialog instead of forcing directory selection.
- Kept drag-and-drop and Dropbox imports intact, ensuring folders and TIFF sequences can still be added without altering any existing UI messaging.

## Single-volume channels and unlimited channel count
- Replaced the multi-layer channel model with a single-volume workflow, updating launcher messaging, validation, and viewer prompts to talk about channel volumes instead of layers.
- Added safeguards so a new drop replaces the existing volume while clearing any prior display settings, preventing stale configuration from lingering across swaps.
- Removed the three-channel cap so datasets can define as many channels as needed without surfacing the old limit warning.

## Tab layout consistency across desktop and VR
- Wrapped the desktop track window tabs after every three channels so large projects no longer overflow the available width.
- Mirrored the three-per-row layout in the VR channels and tracks HUDs, centering partial rows and preserving hover interactions.
- Ensured narrow layouts gracefully collapse to two and one column variants to maintain readability on smaller displays.

## GitHub Pages artifact reliability
- Updated the `Deploy static site` workflow to configure Pages before uploading, explicitly name the artifact, and fail fast when the build output is missing so deployments always provide the `github-pages` package required by `actions/deploy-pages@v4`.

## Launch warning visibility follow-up
- Kept the launch button clickable while dataset validation fails so users can surface actionable warnings instead of seeing nothing.
- Dimmed the launch button when a dataset is incomplete but avoided disabling it outright, reserving the hard-disable for the actual launch cycle.

## Channel action button layout tweaks
- Reworked the desktop channel action area so reset/invert share the first row and render/sampling share the second, matching requested ordering.
- Gave all four buttons the wider styling from the invert control, reducing the label text and clamping widths so they fit cleanly in the sidebar.
- Mirrored the same two-row, equal-width layout in the VR HUD so both viewing modes present consistent controls and hover regions.

## Auto window histogram caching
- Added an auto-contrast module that builds Fiji-style histograms for normalized volumes and computes automatic window ranges.
- Hooked histogram cache invalidation into the texture cache reset so cleared textures also drop stale intensity data.
- Guarded cached histograms against shape changes to ensure volume updates trigger a fresh computation.

## Auto window threshold scaling
- Switched the auto-contrast default threshold to use 1% of the volume's voxel count so larger datasets no longer start overly strict.
- Kept the halving behavior by treating the stored threshold as a denominator applied to the total voxels for each subsequent auto pass.

## Brightness and contrast control overhaul
- Flipped the brightness slider polarity so increasing the control lowers the window center and brightens the rendered volume, matching user expectations.
- Swapped the contrast slider to a logarithmic scale with better formatting, keeping fine control near 1× while retaining access to higher contrast boosts.
- Replaced the auto-contrast heuristic with percentile-based histogram bounds that add a safety margin, producing balanced windows that remain compatible with LUT inversion.
