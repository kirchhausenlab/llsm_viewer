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
