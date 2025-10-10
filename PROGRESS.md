# Progress Log

## Initial scaffolding and data ingestion (current)
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
