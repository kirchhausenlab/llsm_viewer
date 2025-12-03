# Progress

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
- Reordered the track-state hook initialization in `App` so VR entry reset handlers access the track follow setter after it is defined, resolving the type-check failure.
- Refactored channel uploads by introducing dedicated Dropbox and local upload components, reducing ChannelCard drag-drop and configuration state.

## Rendering and interaction foundations
- Established the Vite + React frontend, Three.js volume renderer, and playback pipeline with keyboard/mouse navigation and responsive resource reuse.
- Added brightness/contrast controls (including ImageJ-like windowing for float volumes), playback speed/looping, and robust loading overlays.
- Refined camera clipping, ray-cast coordinates, and normalization to keep rendering stable across multi-channel datasets.
- Provided early webfont bundling and sidebar/control layout refreshes for consistent styling.

## Viewer shell refactor
- Broke the monolithic viewer shell into focused components for top navigation, playback, channels, tracks, and plot settings, with hooks to keep state wiring tidy.
