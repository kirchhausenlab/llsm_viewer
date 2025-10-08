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

Next steps:
- Build the WebGPU ray-marched volume renderer integrated with transfer-function controls.
- Add asynchronous preprocessing hooks for caching multi-resolution volumes when needed.
