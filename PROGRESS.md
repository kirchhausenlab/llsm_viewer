# Progress

## Latest changes
- Resolved the previously known strict-unused VR blocker:
  - Removed the unused `THREE` import from `src/components/viewers/volume-viewer/vr/controllerConnectionLifecycle.ts`.
- Verification:
  - `npm run -s typecheck:strict-unused` passed.
  - `npm run -s typecheck` passed.
  - `npm run -s typecheck:tests` passed.
  - `node --import tsx --test tests/controllerRayUpdater.test.ts` passed.
- Continued non-VR `VolumeViewer` fan-in reduction by extracting typed argument assembly for heavyweight hooks:
  - Added `src/components/viewers/volume-viewer/volumeViewerVrRuntime.ts` to isolate defaulted VR runtime prop resolution (`isVrPassthroughSupported`, channel/track panel fallbacks, session registration callback extraction).
  - Added `src/components/viewers/volume-viewer/volumeViewerRuntimeArgs.ts` to isolate grouped typed builders for:
    - `useVolumeViewerVrBridge` options (`buildVolumeViewerVrBridgeOptions`)
    - `useVolumeViewerLifecycle` params (`buildVolumeViewerLifecycleParams`)
  - Refactored `src/components/viewers/VolumeViewer.tsx` to use the new grouped builders instead of inlining the largest argument object literals.
- Added targeted tests for the extracted argument/runtime helpers:
  - `tests/volumeViewerVrRuntime.test.ts`
  - `tests/volumeViewerRuntimeArgs.test.ts`
- Verification:
  - `npm run -s typecheck` passed.
  - `npm run -s typecheck:tests` passed.
  - `node --import tsx --test tests/volumeViewerVrRuntime.test.ts tests/volumeViewerRuntimeArgs.test.ts tests/volumeViewerAnisotropy.test.ts tests/volumeHoverSampling.test.ts tests/volumeHoverTargetLayer.test.ts tests/planarTrackCentroid.test.ts tests/planarTrackStyle.test.ts tests/planarPrimaryVolume.test.ts tests/planarViewerCanvasLifecycle.test.ts tests/planarViewerBindings.test.ts` passed.
  - `npm run -s typecheck:strict-unused` still fails on known pre-existing VR blocker:
    `src/components/viewers/volume-viewer/vr/controllerConnectionLifecycle.ts` unused `THREE` import.
- Follow-up TODO: continue reducing `VolumeViewer.tsx` top-level orchestration by extracting remaining non-render business logic around playback-window/tooltip/follow wiring into a dedicated integration hook if further readability gains are needed.
- Caveat/trade-off: this slice is wiring-only; runtime behavior is preserved while option assembly is now modular and type-constrained in a dedicated helper module.
- Continued the non-VR `PlanarViewer` cleanup by extracting remaining integration effects:
  - Added `src/components/viewers/planar-viewer/usePlanarViewerBindings.ts` to isolate capture-target registration and hover-reset behavior when slice data is absent.
  - Refactored `src/components/viewers/PlanarViewer.tsx` to delegate these bindings.
- Continued `useVolumeHover` decomposition with pure sampling/intensity helpers:
  - Added `src/components/viewers/volume-viewer/volumeHoverSampling.ts` for trilinear sample extraction, channel luminance resolution, and windowed intensity adjustment.
  - Refactored `src/components/viewers/volume-viewer/useVolumeHover.ts` to use the extracted helper module while preserving hover behavior.
- Added targeted tests for the new helper seams:
  - `tests/volumeHoverSampling.test.ts`
  - `tests/planarViewerBindings.test.ts`
- Verification:
  - `npm run -s typecheck` passed.
  - `npm run -s typecheck:tests` passed.
  - `node --import tsx --test tests/volumeViewerAnisotropy.test.ts tests/volumeHoverSampling.test.ts tests/volumeHoverTargetLayer.test.ts tests/planarTrackCentroid.test.ts tests/planarTrackStyle.test.ts tests/planarPrimaryVolume.test.ts tests/planarViewerCanvasLifecycle.test.ts tests/planarViewerBindings.test.ts` passed.
  - `npm run -s typecheck:strict-unused` still fails on known pre-existing VR blocker:
    `src/components/viewers/volume-viewer/vr/controllerConnectionLifecycle.ts` unused `THREE` import.
- Follow-up TODO: keep reducing `VolumeViewer.tsx` orchestration fan-in (grouping and extracting large hook argument assembly) now that `PlanarViewer` and `useVolumeHover` seams are further modularized.
- Caveat/trade-off: this slice is behavior-preserving; hover sampling math is now testable and isolated, but still executed on pointer-move cadence as before.
- Continued the non-VR `PlanarViewer` orchestration reduction by extracting lifecycle ownership into focused hooks:
  - Added `src/components/viewers/planar-viewer/usePlanarPrimaryVolume.ts` to isolate primary-volume selection and auto-fit triggering on source volume shape changes.
  - Added `src/components/viewers/planar-viewer/usePlanarViewerCanvasLifecycle.ts` to isolate canvas lifecycle orchestration (animation loop, resize observer, offscreen slice staging, auto-fit reset, draw revision triggers).
  - Refactored `src/components/viewers/PlanarViewer.tsx` to delegate these lifecycle responsibilities while preserving behavior.
- Added targeted helper tests for the new planar lifecycle seams:
  - `tests/planarPrimaryVolume.test.ts`
  - `tests/planarViewerCanvasLifecycle.test.ts`
- Verification:
  - `npm run -s typecheck` passed.
  - `npm run -s typecheck:tests` passed.
  - `node --import tsx --test tests/volumeViewerAnisotropy.test.ts tests/planarTrackCentroid.test.ts tests/planarTrackStyle.test.ts tests/volumeHoverTargetLayer.test.ts tests/planarPrimaryVolume.test.ts tests/planarViewerCanvasLifecycle.test.ts` passed.
  - `npm run -s typecheck:strict-unused` still fails on known pre-existing VR blocker:
    `src/components/viewers/volume-viewer/vr/controllerConnectionLifecycle.ts` unused `THREE` import.
- Follow-up TODO: if we continue non-VR decomposition, next smallest seam is isolating `PlanarViewer` capture-target registration + hover-clearing route callbacks into a small integration hook for parity with the extracted lifecycle hooks.
- Caveat/trade-off: this slice intentionally keeps redraw/resize behavior unchanged; canvas lifecycle work is now modular but still uses the same `requestAnimationFrame` and `ResizeObserver` timing policy as before.
- Continued the non-VR viewer refactor by splitting `VolumeViewer` orchestration seams into focused hooks:
  - Added `src/components/viewers/volume-viewer/useVolumeViewerAnisotropy.ts` for anisotropy-scale normalization and step-ratio synchronization.
  - Added `src/components/viewers/volume-viewer/useVolumeViewerRefSync.ts` for paintbrush/layer/follow-target ref syncing and reset/follow callback wrappers.
  - Added `src/components/viewers/volume-viewer/useVolumeViewerSurfaceBinding.ts` for render-surface binding (`handleContainerRef`) and active-3D-layer handle refresh wiring.
  - Added `src/components/viewers/volume-viewer/useVolumeViewerTransformBindings.ts` for VR HUD placement refresh + volume/track transform ref synchronization.
  - Refactored `src/components/viewers/VolumeViewer.tsx` to delegate to these hooks while preserving runtime behavior.
- Continued the non-VR viewer refactor by reducing `PlanarViewer`’s monolithic canvas/track math surface:
  - Added `src/components/viewers/planar-viewer/planarTrackCentroid.ts` to isolate followed-track centroid computation.
  - Added `src/components/viewers/planar-viewer/planarSliceCanvas.ts` to isolate offscreen slice canvas updates and 2D draw-path/style logic.
  - Refactored `src/components/viewers/PlanarViewer.tsx` to delegate centroid + canvas rendering helpers.
- Completed an optional follow-up split in `useVolumeHover`:
  - Added `src/components/viewers/volume-viewer/volumeHoverTargetLayer.ts` to isolate hover target-layer/resource selection policy.
  - Refactored `src/components/viewers/volume-viewer/useVolumeHover.ts` to delegate layer/resource selection to the new helper.
- Added targeted tests for extracted logic:
  - `tests/volumeViewerAnisotropy.test.ts`
  - `tests/planarTrackCentroid.test.ts`
  - `tests/planarTrackStyle.test.ts`
  - `tests/volumeHoverTargetLayer.test.ts`
- Verification:
  - `npm run -s typecheck` passed.
  - `npm run -s typecheck:tests` passed.
  - `node --import tsx --test tests/volumeViewerAnisotropy.test.ts tests/planarTrackCentroid.test.ts tests/planarTrackStyle.test.ts tests/volumeHoverTargetLayer.test.ts` passed.
  - `npm run -s typecheck:strict-unused` still fails on known pre-existing VR blocker:
    `src/components/viewers/volume-viewer/vr/controllerConnectionLifecycle.ts` unused `THREE` import.
- Follow-up TODO: continue reducing orchestration fan-in in `VolumeViewer`/`PlanarViewer` by extracting remaining lifecycle effects (resize/animation wiring) into dedicated hooks if further readability gains are needed.
- Caveat/trade-off: this slice intentionally keeps runtime behavior unchanged and does not alter VR execution paths beyond moving hover layer-selection logic into a pure helper shared by existing code flow.
- Continued the VR hotspot split by extracting HUD candidate resolution out of the controller ray frame loop:
  - Added `src/components/viewers/volume-viewer/vr/controllerRayHudCandidates.ts`.
  - Refactored `src/components/viewers/volume-viewer/vr/controllerRayUpdater.ts` to delegate HUD candidate resolution to the new module while preserving runtime behavior.
  - Reduced `controllerRayUpdater.ts` from 1409 LOC to 610 LOC (candidate logic now isolated in the new module).
- Decomposed monolithic VR HUD rendering into feature modules:
  - Added `src/components/viewers/volume-viewer/vr/hudRenderersTracks.ts` (tracks HUD renderer).
  - Added `src/components/viewers/volume-viewer/vr/hudRenderersChannels.ts` (channels HUD renderer).
  - Converted `src/components/viewers/volume-viewer/vr/hudRenderers.ts` into a thin export surface.
- Standardized rounded swatch path handling and removed the round-rect `any` seam:
  - Added `drawRoundedRectCompat()` to `src/components/viewers/volume-viewer/vr/hudCanvas.ts`.
  - Updated tracks/channels swatch rendering to use the shared compatibility helper.
- Added direct hotspot tests:
  - `tests/controllerRayUpdater.test.ts` for controller-ray updater behavior (non-presenting clear path + playback panel-grab targeting).
  - `tests/hudRenderers.test.ts` for tracks/channels HUD renderer contracts (region emission, stale-hover clearing, dynamic channels-height behavior).
- Removed remaining browser/debug `any` seams in active hotspots:
  - Added `window.showDirectoryPicker` and `window.__LLSM_VOLUME_PROVIDER__` declarations in `environment.d.ts`.
  - Updated `src/hooks/preprocessedExperiment/usePreprocessedImport.ts`, `src/components/pages/FrontPageContainer.tsx`, and `src/ui/app/hooks/useAppRouteState.tsx` to use typed window APIs.
- Verification:
  - `npm run typecheck`
  - `npm run typecheck:strict-unused`
  - `npm run test`
  - `npm run verify:fast`
- Follow-up TODO: continue with top-level orchestration decomposition (`VolumeViewer` lifecycle extraction and `useAppRouteState` route assembly extraction) and reduce the size of `controllerRayHudCandidates.ts` by splitting playback/channels/tracks candidate evaluators.
- Caveat/trade-off: ray/HUD hotspot responsibilities are now separated by module boundary, but the extracted HUD candidate module is still large and should be split by interaction domain in a follow-up slice.
- Replaced the untyped route-prop assembly seam with explicit contracts:
  - `src/ui/app/hooks/useRouteViewerProps.ts` now accepts typed `{ datasetSetup, viewerShell }` inputs instead of `Record<string, any>`.
  - `src/ui/app/hooks/useAppRouteState.tsx` now constructs `RouteDatasetSetupProps` and `ViewerShellRouteProps` explicitly before route wiring.
- Expanded the strict-unused gate surface (`tsconfig.strict-unused.json`) to include high-risk orchestration/viewer files:
  - `src/ui/app/hooks/useAppRouteState.tsx`
  - `src/components/viewers/VolumeViewer.tsx`
  - `src/components/viewers/volume-viewer/useVolumeViewerVr.ts`
- Removed newly surfaced unused-symbol debt across the reachable graph so the expanded gate passes (front-page container, planar/viewer-shell helpers, VR hover/render helpers, loader/preprocess helpers).
- Decomposed additional VR hotspot logic into focused modules:
  - `src/components/viewers/volume-viewer/vr/controllerRayUiFlags.ts` (controller UI hover/active flag transitions and hover-suppression rules)
  - `src/components/viewers/volume-viewer/vr/controllerRayRegionState.ts` (HUD region equality + ray summary change detection)
  - `src/components/viewers/volume-viewer/vr/hudMath.ts` (histogram math/format helpers)
  - `src/components/viewers/volume-viewer/vr/hudCanvas.ts` (shared rounded-rect canvas primitive)
- Refactored large hotspots to delegate to the new helpers while preserving behavior:
  - `src/components/viewers/volume-viewer/vr/controllerRayUpdater.ts`
  - `src/components/viewers/volume-viewer/vr/hudRenderers.ts`
  - `src/components/viewers/volume-viewer/useVolumeViewerVr.ts`
- Added direct unit tests for the extracted VR/math modules:
  - `tests/controllerRayUiFlags.test.ts`
  - `tests/controllerRayRegionState.test.ts`
  - `tests/hudMath.test.ts`
- Verification:
  - `npm run typecheck`
  - `npm run typecheck:strict-unused`
  - `npm test`
  - `npm run verify:fast`
  - `npm run verify:ui`
- Follow-up TODO: continue splitting `controllerRayUpdater.ts` and `hudRenderers.ts` at interaction-category boundaries (playback/channels/tracks) to reduce per-function cognitive load further.
- Caveat/trade-off: strict-unused coverage is now meaningfully broader, but still intentionally scoped (not full-repo) to keep the gate stable while legacy areas are incrementally cleaned.
- Archived the refactor workspace into a compact two-file format under `docs/refactor/`:
  - `docs/refactor/README.md` (minimal completion pointer)
  - `docs/refactor/ARCHIVE_SUMMARY.md` (consolidated full program record)
- Removed now-redundant per-phase refactor tracking files after consolidation:
  - `docs/refactor/BACKLOG.md`
  - `docs/refactor/BASELINE.md`
  - `docs/refactor/ROADMAP.md`
  - `docs/refactor/SESSION_HANDOFF.md`
- Explicitly recorded that the **entire refactor program is completed** in both `docs/refactor/README.md` and `docs/refactor/ARCHIVE_SUMMARY.md`.
- Updated `PROJECT_STRUCTURE.md` to describe `docs/refactor` as an archived completed-program record instead of an active backlog workspace.
- Verification: docs-only archival update (no runtime code changes).
- Completed `RF-010` and marked it `done` in `docs/refactor/BACKLOG.md` by adding a maintained optional strict-unused gate command.
- Added `tsconfig.strict-unused.json` as the scoped strict-unused gate definition with:
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - focused include scope on refactored route-orchestration hooks (`useRouteLaunchSessionState`, `useRoutePlaybackPrefetch`) to keep the gate stable while broader legacy surfaces are still being reduced.
- Added `npm run typecheck:strict-unused` to `package.json` as the new optional gate command.
- Updated refactor source-of-truth docs:
  - `docs/refactor/README.md` verification-gate section now documents `npm run typecheck:strict-unused`.
  - `docs/refactor/BASELINE.md` now records the scoped-gate strategy introduced in RF-010.
- Verification:
  - `npm run typecheck:strict-unused` passed.
  - `npm run verify:fast` passed after RF-010 completion.
- Follow-up TODO: expand `tsconfig.strict-unused.json` scope incrementally as remaining large legacy modules are decomposed and unused surfaces are removed.
- Caveat/trade-off: RF-010 intentionally uses a scoped strict-unused surface for stability; full-repo strict-unused enforcement is still noisy and remains future cleanup work.
- Completed `RF-009` and marked it `done` in `docs/refactor/BACKLOG.md` after adding targeted behavior-preserving tests for recently refactored VR and route orchestration seams.
- Added VR hotspot tests:
  - `tests/useVrHudInteractions.test.ts` covering channels/tracks slider updates and tracks scroll snapping/no-op behavior for unchanged offsets.
  - `tests/controllerRayVolumeDomain.test.ts` covering volume-translate and volume-scale controller-ray domain behavior (handle targeting, transform updates, ray-length clamping, and scale/yaw-pitch apply wiring).
- Added orchestration hotspot tests:
  - `tests/app/hooks/useRouteLaunchSessionState.test.ts` covering launch/session lifecycle transitions (begin/progress/complete/fail/reset/end).
  - `tests/app/hooks/useRoutePlaybackPrefetch.test.ts` covering prefetch readiness gating, queue scheduling/draining, and cache sizing behavior.
- Verification: `npm run verify:fast` passed after RF-009 completion.
- Follow-up TODO: start `RF-010` (optional strict-unused lint/type gate as a maintained check) as the next active refactor item.
- Caveat/trade-off: RF-009 intentionally hardened unit-level refactor seams; immersive runtime behavior in an actual XR session still relies primarily on existing smoke coverage rather than dedicated hardware-backed automated tests.
- Completed `RF-008` and marked it `done` in `docs/refactor/BACKLOG.md` after modularizing the largest viewer CSS surface by feature ownership.
- Split `src/styles/app/viewer-playback-tracks.css` into focused feature files:
  - `src/styles/app/viewer-controls-base.css` (shared `.global-controls` primitives)
  - `src/styles/app/viewer-playback-controls.css` (playback/recording controls)
  - `src/styles/app/viewer-track-panels.css` (tracks + paintbrush panel styling)
  - `src/styles/app/viewer-selected-tracks.css` (selected-tracks chart, legend, and plot settings slider controls)
- Updated `src/styles/app/index.css` imports to reference the new feature-owned styles in stable order and removed the monolithic `viewer-playback-tracks.css`.
- Verification: `npm run verify:fast` passed and `npm run verify:ui` passed after RF-008 completion.
- Follow-up TODO: start `RF-009` (expand tests around refactored hotspots, especially VR/orchestration and newly split CSS ownership boundaries) as the next active refactor item.
- Caveat/trade-off: CSS behavior remains parity-preserving but still relies on import order across `src/styles/app/index.css`; further isolation (e.g., per-component CSS modules) would require broader style-system changes.
- Completed `RF-007` and marked it `done` in `docs/refactor/BACKLOG.md` after simplifying dataset setup/load surfaces between `useChannelSources` and `useChannelLayerState`.
- Added `src/hooks/dataset/useChannelDatasetLoader.ts` to isolate dataset load/apply lifecycle concerns:
  - load/reset/error orchestration for selected dataset launch
  - layer normalization/segmentation mapping and shape validation during load
  - loaded-layer default state application (`channelVisibility`, active layer, layer settings, auto thresholds)
- Refactored `src/hooks/dataset/useChannelSources.ts` into a source/validation-focused hook that delegates load/apply behavior to `useChannelDatasetLoader`.
- Refactored `src/hooks/useChannelLayerState.tsx` to reuse shared dataset loader option contracts (`Omit`-based local load/apply types) and consolidated load binding assembly before delegating to `useChannelSources`.
- Verification: `npm run verify:fast` passed after RF-007 completion.
- Follow-up TODO: start `RF-008` (modularize large CSS files by panel/feature ownership) as the next active refactor item.
- Caveat/trade-off: `LoadSelectedDatasetOptions` still carries `anisotropyScale` for compatibility with existing route call sites, but loader behavior remains unchanged (the parameter is currently not applied in this path).
- Completed `RF-006` and marked it `done` in `docs/refactor/BACKLOG.md` after splitting planar interaction responsibilities into focused modules with no behavior-contract changes.
- Added `src/components/viewers/planar-viewer/hooks/usePlanarInteractions/*` helper modules:
  - `usePlanarTrackHoverState.ts` for hovered-track + tooltip state transitions.
  - `usePlanarTrackHitTest.ts` for XY track hit-testing and threshold/visibility logic.
  - `usePlanarPixelHover.ts` for pixel hover sampling and hover-voxel emission lifecycle.
  - `usePlanarCanvasInputHandlers.ts` for pointer/wheel input (paint, pan, selection, hover updates).
  - `usePlanarKeyboardShortcuts.ts` for planar keyboard bindings (`W/S`, pan, rotation).
- Refactored `src/components/viewers/planar-viewer/hooks/usePlanarInteractions.ts` into an orchestrator that composes the new hover/input/hit-test/keyboard modules while preserving the existing `canvasHandlers` API consumed by `PlanarViewer`.
- Verification: `npm run verify:fast` passed after RF-006 completion.
- Follow-up TODO: start `RF-007` (dataset setup/load surface simplification in `useChannelSources` + `useChannelLayerState`) as the next active refactor item.
- Caveat/trade-off: `usePlanarInteractions.ts` still owns track-render-data assembly and followed-track recenter logic by design; RF-006 intentionally scoped the split to interaction responsibilities only.
- Completed `RF-005` and marked it `done` in `docs/refactor/BACKLOG.md` after splitting remaining VR responsibilities by domain inside `useVolumeViewerVr` and controller-ray modules.
- Added `src/components/viewers/volume-viewer/useVolumeViewerVr/useVrHudInteractions.ts` to isolate VR HUD interaction state updates (channels sliders, tracks sliders, tracks scroll) away from the main `useVolumeViewerVr` orchestrator.
- Added `src/components/viewers/volume-viewer/vr/controllerRayVolumeDomain.ts` to isolate controller ray volume-transform responsibilities (translate, scale, yaw, pitch handle candidates + active gesture updates) from general HUD/track ray flow.
- Refactored `src/components/viewers/volume-viewer/useVolumeViewerVr.ts` and `src/components/viewers/volume-viewer/vr/controllerRayUpdater.ts` to delegate to these new domain modules while preserving runtime behavior.
- Verification: `npm run verify:fast` passed after RF-005 completion.
- Follow-up TODO: start `RF-006` (`usePlanarInteractions` decomposition) as the next active refactor item.
- Caveat/trade-off: `controllerRayUpdater.ts` remains large and still mixes playback/channels/tracks HUD candidate resolution in one pass; this slice intentionally extracted volume-transform controls first to keep behavior stable.
- Completed `RF-004` and marked it `done` in `docs/refactor/BACKLOG.md` after finishing the `VolumeViewer` runtime boundary split.
- Added `src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts` to isolate pointer + paintbrush event wiring (`pointerdown/move/up/leave`, pointer capture/release, double-click voxel follow).
- Added `src/components/viewers/volume-viewer/volumeViewerRenderLoop.ts` to isolate render-loop lifecycle (camera motion, track appearance updates, hover pulse uniforms, playback advancement, VR ray updates).
- Refactored `src/components/viewers/VolumeViewer.tsx` to delegate pointer lifecycle and render-loop construction to the new modules while preserving centralized resource teardown.
- Verification: `npm run verify:fast` passed after RF-004 completion.
- Follow-up TODO: start `RF-005` (VR decomposition) as the next active slice.
- Caveat/trade-off: `VolumeViewer` cleanup remains intentionally centralized and deterministic, but still large; VR HUD/resource disposal extraction is a potential readability follow-up.
- Completed `RF-003` and marked it `done` in `docs/refactor/BACKLOG.md` after reducing the `ViewerShellContainerProps` top-level surface from a giant flat contract to grouped feature bundles (`viewerPanels`, `vr`, `topMenu`, `layout`, `modeControls`, `playbackControls`, `channelsPanel`, `tracksPanel`, `selectedTracksPanel`, `plotSettings`, `trackSettings`).
- Refactored `src/components/viewers/useViewerShellProps.ts` into feature-oriented mapper units (`mapVolumeViewerProps`, `mapPlanarViewerProps`, layout/top-menu/panel/settings mappers), preserving `ViewerShellProps` output behavior while removing the monolithic mapping block.
- Updated `src/ui/app/hooks/useRouteViewerProps.ts` to emit the new grouped viewer-shell container contract and rewrote `tests/ViewerShellContainer.test.ts` to validate the same VR/panel wiring on the new shape.
- Verification: `npm run verify:fast` passed after RF-003 completion.
- Follow-up TODO: start `RF-004` (`VolumeViewer` decomposition) as the next active slice.
- Caveat/trade-off: `useRouteViewerProps` still intentionally uses a broad `Record<string, any>` options input as a behavior-preserving bridge; tightening that contract is still recommended in a follow-up slice.
- Completed `RF-002` and marked it `done` in `docs/refactor/BACKLOG.md` after finishing the prop-assembly split: added `src/ui/app/hooks/useRouteViewerProps.ts` and moved `datasetSetupProps` + `viewerShellContainerProps` assembly out of `useAppRouteState`.
- `src/ui/app/hooks/useAppRouteState.tsx` now delegates responsibilities across focused helpers: dataset setup actions (`useRouteDatasetSetupState`), dataset reset lifecycle (`useRouteDatasetResetState`), launch/session state (`useRouteLaunchSessionState`), playback prefetch policy (`useRoutePlaybackPrefetch`), and route prop assembly (`useRouteViewerProps`).
- Verification: `npm run verify:fast` passed after the full RF-002 decomposition.
- Follow-up TODO: start `RF-003` (`ViewerShellContainerProps` contract cleanup and feature-oriented shell prop mappers).
- Caveat/trade-off: `useRouteViewerProps` currently accepts a broad options object to keep this slice behavior-preserving while moving assembly logic; tightening that input surface can be done incrementally during RF-003 prop-contract cleanup.
- Continued `RF-002` with discard/reset lifecycle extraction: added `src/ui/app/hooks/useRouteDatasetResetState.ts` to own `handleDiscardPreprocessedExperiment` and `handleReturnToFrontPage`.
- Refactored `src/ui/app/hooks/useAppRouteState.tsx` to consume `useRouteDatasetResetState`, removing inline front-page discard/reset callback definitions while preserving behavior.
- Verification: `npm run verify:fast` passed after the RF-002 discard/reset slice.
- Follow-up TODO: continue RF-002 by extracting the next smallest internal hotspot (recommended: isolate viewer route prop assembly from `useAppRouteState`).
- Caveat/trade-off: dataset setup lifecycle is now split across two helpers (`useRouteDatasetSetupState` and `useRouteDatasetResetState`), but the large viewer prop assembly block still dominates `useAppRouteState` complexity.
- Continued `RF-002` with a small dataset setup decomposition: added `src/ui/app/hooks/useRouteDatasetSetupState.ts` to own front-page setup actions (`handleStartExperimentSetup`, `handleAddChannel`, `handleChannelNameChange`, `handleRemoveChannel`).
- Refactored `src/ui/app/hooks/useAppRouteState.tsx` to consume `useRouteDatasetSetupState`, removing inline dataset setup callback definitions while preserving existing front-page behavior and prop contracts.
- Verification: `npm run verify:fast` passed after the RF-002 dataset-setup action slice.
- Follow-up TODO: continue RF-002 by extracting the remaining dataset setup surface (recommended: discard/return-to-front-page lifecycle reset path and related setup selectors) or start isolating pure viewer-prop assembly.
- Caveat/trade-off: this slice only moved setup callbacks; discard/reset orchestration still lives in `useAppRouteState`, so setup lifecycle remains partially coupled.
- In-progress focus: analyzing `useAppRouteState` and nearby route hooks to outline helper hooks for building `RouteDatasetSetupProps` and `ViewerShellRouteProps` with clearer dependency inputs before any code changes.
- Continued `RF-002` with a behavior-preserving playback-prefetch decomposition: added `src/ui/app/hooks/useRoutePlaybackPrefetch.ts` and moved prefetch lookahead/session queue/drain/cache-sizing/can-advance logic out of `useAppRouteState`.
- Updated `src/ui/app/hooks/useAppRouteState.tsx` to consume `useRoutePlaybackPrefetch`, keeping `playbackLayerKeys` local for current layer-loading behavior while delegating prefetch policy/execution through the new hook.
- Verification: `npm run verify:fast` passed after the RF-002 playback-prefetch slice.
- Follow-up TODO: continue RF-002 by extracting the next smallest route-surface slice (recommended: dataset setup/front-page action wiring into `useRouteDatasetSetupState` or pure viewer prop assembly helper).
- Caveat/trade-off: playback prefetch is now isolated but still depends on parent-owned `playbackLayerKeys` selection, so launch/setup and prefetch concerns are only partially decoupled in this step.
- Started `RF-002` by setting it to `active` in `docs/refactor/BACKLOG.md` and extracting launch/session state transitions from `useAppRouteState` into a dedicated helper hook: `src/ui/app/hooks/useRouteLaunchSessionState.ts`.
- Refactored `src/ui/app/hooks/useAppRouteState.tsx` to use the new launch/session helper for viewer launch start/progress/complete/fail flow, route reset behavior (`resetLaunchState`), and viewer return session teardown (`endViewerSession`) with no contract changes.
- Verification: `npm run verify:fast` passed after the RF-002 slice.
- Follow-up TODO: continue RF-002 with the next smallest decomposition slice (recommended: move playback prefetch policy/queue wiring into a focused helper hook).
- Caveat/trade-off: this slice centralizes launch/session transitions but intentionally keeps launch orchestration inside `useAppRouteState` so behavior and call-site ownership stay stable while refactoring incrementally.
- Completed `RF-001` (dead/stale cleanup): removed test-only hook `src/ui/app/hooks/useDatasetLaunch.ts` and its test `tests/app/hooks/useDatasetLaunch.test.ts`, and removed the stale coverage include for that file from `package.json`.
- Closed the dead-file cleanup by deleting unreferenced modules `src/components/viewers/volume-viewer/vr/controllerRays.ts` and `src/shared/utils/volumeWindow.ts`; backlog status is now `done` for `RF-001`.
- Follow-up TODO: start `RF-002` (`useAppRouteState` decomposition) as the next active slice.
- Caveat/trade-off: deleting `useDatasetLaunch` avoids duplicate abstractions now, but if launch/session state is split from `useAppRouteState` later we may reintroduce a smaller, runtime-owned launch hook.
- Started `RF-001` (dead/stale cleanup) by setting `docs/refactor/BACKLOG.md` status to `active` and removing unused modules `src/components/viewers/volume-viewer/vr/controllerRays.ts` and `src/shared/utils/volumeWindow.ts` after repo-wide reference validation.
- Confirmed `src/ui/app/hooks/useDatasetLaunch.ts` is currently test-only while runtime launch/session wiring lives inline in `src/ui/app/hooks/useAppRouteState.tsx`; kept this as the remaining `RF-001` decision point.
- Follow-up TODO: complete `RF-001` by deciding whether to delete `useDatasetLaunch` (+ test) or reintegrate it intentionally into runtime route wiring.
- Caveat/trade-off: this was an intentionally minimal first implementation slice; `RF-001` remains active until the `useDatasetLaunch` role is resolved.
- Added a persistent refactor-program documentation workspace under `docs/refactor/` with `README.md`, `BASELINE.md`, `ROADMAP.md`, `BACKLOG.md`, and `SESSION_HANDOFF.md` so large cleanup work can continue coherently across sessions.
- Captured the structural baseline (hotspot monolith files, dead/stale-code candidates, and current verification status) in `docs/refactor/BASELINE.md` to avoid re-discovery on each new session.
- Added a phased execution plan and prioritized backlog IDs (`RF-001`..`RF-010`) with acceptance checks, so refactor slices can be tracked explicitly as `todo/active/blocked/done`.
- Updated `PROJECT_STRUCTURE.md` to include the new `docs/refactor/*` area as part of top-level tooling/documentation.
- Follow-up TODO: start `RF-001` (dead/stale surface cleanup) as the first implementation slice and log progress in `docs/refactor/SESSION_HANDOFF.md` at the end of each session.
- Caveat/trade-off: this session introduced documentation and process scaffolding only; no runtime refactor has been applied yet.
- Added Playwright local browser automation (`playwright.config.ts`) and wired it into the local pipeline via `test:e2e`, `test:e2e:visual`, and `verify:ui`, so UI verification now includes a real Chromium run in addition to component-level tests.
- Added a dataset-backed browser smoke test (`tests/e2e/frontpage-smoke.spec.ts`) that exercises the full front-page path: setup, channel creation, TIFF upload from `TEST_DATA_DIR` (`data/test_dataset_0` default), preprocessing, and viewer launch.
- Added browser visual regression tests (`tests/e2e/frontpage-visual.spec.ts`) with committed Playwright screenshot baselines for initial/setup front-page states.
- Added Playwright result directories to `.gitignore` (`playwright-report/`, `test-results/`) and documented Playwright setup/use in `README.md`.
- Replaced the manual test index (`tests/runTests.ts`) with Node's built-in test discovery (`node --test` + `tsx` import support), so new `*.test.ts/tsx` files run automatically without hand-editing an import list.
- Added a local-only verification pipeline in `package.json`: `verify:fast`, `verify:ui`, `verify:full`, and `verify:nightly` (backed by `scripts/local-nightly.sh`), including build/typecheck/test/coverage/perf gates that run entirely on the developer machine.
- Enforced coverage thresholds (lines 80 / branches 70 / functions 80) in `test:coverage` for a critical-module scope (`volumeProcessing`, track parsing/smoothing, dataset error plumbing, and route wiring hooks) to provide hard gates for high-impact logic.
- Added focused local frontend automation under `tests/frontend/*` (front page states, launch actions, header behavior, upload interactions), local structural visual regression checks under `tests/visual/*`, and performance budget tests under `tests/perf/*`.
- Added local dataset fixture coverage (`tests/localDatasetFixture.test.ts`) that validates discoverability/decoding of TIFF data from `TEST_DATA_DIR` (default `data/test_dataset_0`), matching the new local-data workflow.
- Added `tsconfig.tests.json` + `typecheck:tests` to keep frontend/visual/perf/new fixture tests type-checked without requiring full migration of all legacy test files.
- Follow-up TODO: once npm registry access is available in the agent environment, add true browser-level E2E/visual checks (Playwright) to complement the current component/snapshot coverage.
- Caveat/trade-off: coverage thresholds are currently enforced on a curated critical-file set rather than the entire `src/` tree to avoid blocking on legacy low-coverage areas while still protecting the hottest runtime paths.
- Removed legacy `manifest.json` handling from the preprocessed storage/import path: archive import now keys exclusively off Zarr (`zarr.json`) data, and the unused `finalizeManifest` storage API was deleted from all backends and call sites.
- Hardened dataset shape validation across timepoints: raw launch (`useChannelSources`) now validates every loaded timepoint, and preprocessing validates each decoded volume/slice against expected shape+type before writing chunks.
- Fixed archive picker cancellation behavior so `requestArchiveFile()` always resolves (selected file or `null`) instead of potentially hanging after cancel.
- Updated preprocessing/export flow to avoid creating OPFS dataset storage before export destination checks complete, preventing orphan directories on early-return validation/cancel paths.
- Removed the `THREE.RGBFormat` compatibility branch and standardized 3-channel uploads to RGBA packing; this eliminated the previous production build warning while keeping rendering behavior deterministic.
- Adjusted Vite chunking for heavy vendor modules (`three`, `react`, `geotiff`, `zarrita`) and set `chunkSizeWarningLimit` to 800 to match expected decoder/library chunk sizes in this app.
- Caveat/trade-off: always packing 3-channel volumes to RGBA increases texture memory for those layers (4 bytes/voxel vs 3), but avoids runtime format ambiguity and build-time API drift.
- Follow-up TODO: add focused tests around archive-import edge cases (cancel behavior and archive root detection without `manifest.json`) and explicit multi-timepoint shape mismatch fixtures for preprocessing.
- Fixed a dev-only Channels histogram regression caused by a stale `lastVolumeRef` guard in `BrightnessContrastHistogram`: when an async compute was canceled (React StrictMode effect replay or quick playback toggle), the guard could block recomputation for the same volume and leave the histogram empty. The component now tracks which volume the current histogram actually belongs to and retries compute when needed.
- Added `tests/BrightnessContrastHistogram.test.tsx` to cover both normal histogram rendering and the canceled-then-resumed compute sequence that previously left the plot blank.
- Caveat/trade-off: the UI still keeps the previous histogram visible until the next volume histogram is computed, favoring responsiveness over immediately clearing the plot during fast volume switches.
- Restored Node module resolution and stopped TypeScript from typechecking `vite.config.ts` so Three.js example module paths resolve again in CI.
- Upgraded Vite and the React plugin to v7.3.1/5.1.2 to clear the Dependabot dev-server vulnerabilities; Node 20.19+ is now required for the dev server/build.
- Removed tracked npm/temp cache directories (.npm-cache, .tmp) and added gitignore rules so they no longer enter the repo.
- Added drag-and-drop handling for preprocessed dataset archives so dropping a .zip into the loader uses the same extraction path as the upload button, plus Safari guidance for dropping archives when folder picking is unavailable.
- Added a preprocessed dataset archive import path (.zip) with in-browser extraction into temporary storage; note the trade-off that unzip time and extra storage writes can slow import, but runtime visualization stays fast once loaded.
- Made "sorted" track colors deterministic by seeding random track colors from the track number instead of volatile track IDs.
- Implemented the Paintbrush tool end-to-end: Shift+LMB brush/eraser with configurable radius (3D sphere), per-stroke undo/redo, clear (resets history), overlay show/hide, distinct label counting, random unused non-black colors, and RGB multi-page TIFF export.
- Paintbrush caveat: TIFF export is currently uncompressed baseline TIFF (multi-page RGB), so files can get large for big volumes.
- Added Paintbrush UI defaults: window opens disabled + visible with an eraser toggle, color preview swatch, and close/reset actions that force the tool back to Disabled (UI only).
- Experiment setup now supports attaching multiple track CSVs per channel as separate track sets (each with its own viewer label, styling, and visibility state) while remaining spatially tied to the underlying channel transforms.
- Updated preprocessing/export + preprocessed import to store per-track-set CSV payloads and record them in a new manifest v5 `trackSets` list per channel (older preprocessed datasets are no longer supported).
- Track CSV parsing now ignores the `start` column entirely; the `t` column is treated as the absolute (0-based) frame index for each row. This replaces the previous `frame = start + t - 1` interpretation.
- Increased viewer canvas recording quality by setting an explicit default bitrate (20 Mbps) for `MediaRecorder`, exposing a bitrate control (1–100 Mbps) in the viewer settings, and fixing the download extension to match the recorded container (WebM in most browsers). Caveat: the effective bitrate still depends on browser/codec support and may be clamped or ignored on some platforms.
- Added a Tracks settings window with a Full trail toggle and 1–20 trail length slider; when disabled the 3D/2D viewers now
  render only the last L timepoints of each track, with window layout defaults and tests updated accordingly. Fixed 3D trail
  clipping so the visible window actually slides forward (older points drop off as time advances); the initial implementation
  tried to use a non-existent `LineGeometry.instanceStart` offset.
- Re-enabled Q/E roll controls while following a track or voxel so users can roll the camera without breaking the follow lock, while keeping translational input disabled.
- Turned the Help control into a dropdown that opens a center-screen navigation controls window with the viewer tips content and standard minimize/close actions.
- Precomputed and persisted per-timepoint 256-bin intensity histograms during preprocessing (manifest v4) and load them with each volume at runtime, eliminating full-volume histogram scans in the viewer for auto-windowing and histogram UI/VR panels. Note: this bumps the preprocessed dataset version to 4 (older preprocessed exports will not open).
- Improved playback smoothness by removing per-timepoint full-volume histogram scans from VR panel state and by avoiding rendering heavy channel-panel UI for inactive tabs; brightness/contrast histograms now compute lazily (idle callback) and use an approximate sampler for large volumes, and they freeze while playback is running.
- Track CSV loading now treats rows with empty `t,x,y,z` as explicit track breaks: it ends the current segment and starts a new subtrack (`36`, `36-1`, `36-2`, …) while preserving a parent-child chain; UI labels/tooltips reflect the suffixes, and per-track length is derived from point count (ignoring the CSV `track_length` column). Added unit tests for the segmentation logic.
- Refactored preprocessing/viewing to be storage-backed and streaming: preprocessing writes directly to `PreprocessedStorage` (OPFS primary) and viewer reads volumes on demand via `VolumeProvider` (bounded cache) instead of materializing full movies in RAM.
- Reduced streaming playback stutter by pacing playback prefetch (FPS-aware lookahead + concurrency-limited queue) and resizing the volume cache based on active layers, while skipping volume loads for hidden channels; added `VolumeProvider` stats instrumentation and optimized texture uploads (RGBA fast path + uint32 segmentation label textures; RGB falls back to RGBA packing on three@0.161).
- Fixed a 3D rendering regression when using integer segmentation label textures by always binding a fallback 1×1×1 uint32 3D texture to `u_segmentationLabels` (including hover-interaction updates) so non-seg volumes don’t hit WebGL sampler/texture-type mismatch errors.
- Fixed 3D rendering for 3-channel volumes: three@0.161 does not export `THREE.RGBFormat` at runtime, so the 3D texture cache now packs RGB into RGBA instead of emitting an invalid format.
- Implemented the locked normalization policy (“representative global”): pass #1 loads only the middle timepoint per non-segmentation layer for stats; pass #2 preprocesses the full movie using those stats for every timepoint.
- Removed anisotropy resampling from the new preprocess pipeline (render-time scaling remains a follow-up task).
- Switched the preprocessed dataset format to Zarr v3: preprocessing writes a folder-based Zarr store into OPFS, with an optional “Export to folder while preprocessing” tee for large datasets.
- Moved preprocessed track CSV rows out of the Zarr root attributes into per-channel payload files under `tracks/` (manifest v3), capping exported floating-point values to 3 decimal places; loader still supports v2 manifests.
- Switched anisotropy correction to render-time transforms (no volume resampling): volumes + tracks share the same anisotropy-scaled `volumeRootGroup` transform, hover sampling stays in voxel space via inverse transforms, and raymarch step scale is multiplied by `max(scale)/min(scale)` to keep sampling density stable in physical space.
- Replaced the preprocessed dataset loader with a folder picker (Zarr v3) and removed the ZIP import/export pipeline (including service worker and worker clients).
- Added playback backpressure + prefetch: autoplay advances only once the next frame’s active volumes are ready, with a small lookahead window.
- TODO: Consider exposing playback lookahead/cache sizing as a UI knob and/or adding a small GPU texture ring buffer for smoother high-FPS playback on large volumes.
- TODO: Apply anisotropy scale at render-time (volume root transform + track alignment) and remove legacy resample paths.
- TODO: Wire preprocess progress/cancel into UI and consider adding a “clear local preprocessed data” option for OPFS.
- Note: Tests run via `node --import tsx` to avoid tsx IPC socket requirements in restricted environments.
- Prevented viewer recording from stopping immediately after start by only reacting to viewer mode changes or lost capture
  targets.
- Added recording controls to the viewer settings window with Record/Stop buttons wired through shell props and styled alongside existing playback controls.
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

## Pointer listener cleanup
- Removed volume viewer pointer listeners and resize observer subscriptions during teardown to avoid leaking DOM references after unmount.

## Export service worker (removed)
- Removed the ZIP export pipeline and its service worker; no `export-sw.js` routing is needed now that preprocessed datasets are saved as folder-based Zarr v3 stores.

## Preprocessed export folder naming
- Updated preprocessed dataset roots to be created with a `.zarr` suffix (still a directory-based Zarr v3 store) to match common Zarr naming conventions.
- Changed export UX to pick a parent folder, then create a named `<exportName>.zarr/` subfolder for the Zarr v3 store to avoid manual “new folder” steps.

## Viewer recording
- Wired planar and volume viewers to register their canvas elements for recording.
- Added ViewerShell-managed recording that captures the active canvas stream at the playback FPS, downloads recordings with timestamps, and stops cleanly on mode changes or unmount.
- Stabilized the recording stop effect so recordings only stop on viewer mode changes or missing capture targets rather than immediately after starting.
- Added a `requestFrame()` pump (when supported) and FPS sanitization to avoid intermittent "frozen first frame" recordings; caveat: background tabs may still throttle rendering and yield static frames.

## Track-follow playback window lock
- When a track is followed, time changes (slider, buttons, playback) snap to the track's `[ti, tf]` time index bounds and playback loops within that window.
- Implemented the windowing logic in shared utilities and applied it to both desktop playback (2D mode RAF loop) and VR playback advancement.

## Orthogonal view removal
- Removed the 2D orthogonal view toggle and supporting XZ/ZY rendering paths so planar viewing always uses the standard XY slice layout.
- Simplified viewer controls and shell wiring to drop orthogonal availability state and related tests.

## Track settings regressions
- Fixed the Tracks panel layout wiring to include the settings window initial position so layouts reset cleanly with type safety.
- Typed instanced line geometry fields and re-exported trail length defaults to restore TypeScript coverage after the trail controls were added.

## Track CSV NaN breaks
- Treated rows where `t/x/y/z` parse to `NaN` (including missing `z` in 2D) as track break markers, matching the existing “empty fields” break behavior.

## Preprocessed dataset manifest versions (dev mode)
- Dropped the manifest `version` field entirely (writer no longer emits it; reader no longer checks it).

## Keyboard navigation safety
- Swapped the downward translation key from Ctrl to `C` in both volume and planar viewers to avoid accidental browser shortcuts.

## Paintbrush persistence across channel toggles
- Fixed `usePaintbrush` so transient `primaryVolume === null` (e.g., when toggling channel/layer visibility) no longer clears the paint volume and undo/redo history.
- Added a regression test covering a `primaryVolume -> null -> primaryVolume` transition without losing painted voxels.

## Paintbrush clear confirmation
- Added a confirmation prompt before executing the paintbrush "Clear" action to prevent accidental loss of painting work.

## Playwright track smoke coverage
- Added `tests/e2e/tracks-smoke.spec.ts` to cover end-to-end track CSV upload from setup, preprocessing + viewer launch, and core Tracks panel interactions (select, legend presence, deselect).
- Kept assertions focused on stable user-visible behavior to avoid flaky overlap/actionability issues from movable floating windows.
- Verified locally with:
  - `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/tracks-smoke.spec.ts`
  - `npm run verify:ui` (frontend + visual + Playwright smoke + Playwright visual).

## Expanded local webapp smoke coverage
- Added reusable e2e launch workflow helper at `tests/e2e/helpers/workflows.ts` to standardize setup + preprocess + launch steps for dataset-backed browser tests.
- Added new browser smoke specs:
  - `tests/e2e/channels-smoke.spec.ts` (channel panel: invert, auto, brightness, tint, reset behavior)
  - `tests/e2e/viewer-playback-smoke.spec.ts` (time navigation, play/pause toggle, 3D/2D mode switch)
  - `tests/e2e/viewer-settings-smoke.spec.ts` (viewer settings toggles + FPS control + close flow)
  - `tests/e2e/top-menu-smoke.spec.ts` (help window + File->Exit confirm flow back to setup screen)
- Refactored existing smoke specs (`frontpage-smoke`, `tracks-smoke`) to use the shared workflow helper for consistency and easier maintenance.
- Stabilized flaky interactions by preferring deterministic checks and direct DOM-triggered clicks where floating window overlap can intercept pointer events.
- Verified locally:
  - `npx playwright test --config=playwright.config.ts --project=chromium --grep "@smoke"` (6 passed)
  - `npm run verify:ui` (all frontend/visual/e2e/e2e-visual passing)
  - `npm run verify:fast` (typecheck + targeted coverage + build passing)
  - `npm run test:perf` (performance guard passing)

## Nightly multi-channel + segmentation browser coverage
- Extended e2e workflow utilities with `launchViewerFromChannelFixtures(...)` so tests can configure multiple channels (including segmentation toggles and optional track CSV attachments) before preprocessing.
- Added `tests/e2e/multi-channel-segmentation-nightly.spec.ts` (`@nightly`) covering:
  - two-channel setup (raw + segmentation),
  - successful preprocess/launch,
  - per-channel tab switching in viewer,
  - segmentation-specific control behavior (Invert disabled with expected tooltip),
  - persistence of controls after 3D/2D mode toggling.
- Tuned nightly fixture usage to one timepoint per channel to avoid browser storage quota failures during local multi-channel preprocessing while still exercising the multi-channel path.
- Added local script entrypoint `test:e2e:nightly` and updated `scripts/local-nightly.sh` so `verify:nightly` now runs:
  - `verify:full`
  - then nightly-only Playwright scenarios (`@nightly`).
- Verified locally:
  - `npx playwright test --config=playwright.config.ts --project=chromium --grep "@nightly"` (passed)
  - `bash scripts/local-nightly.sh` (passed end-to-end).

## Route orchestration split (launch + VR panel assembly)
- Extracted viewer launch + timepoint volume-loading mechanics from `useAppRouteState.tsx` into `src/ui/app/hooks/useRouteLayerVolumes.ts`.
- Extracted VR channel/track panel payload shaping from `useAppRouteState.tsx` into `src/ui/app/hooks/useRouteVrChannelPanels.ts`.
- Reduced `src/ui/app/hooks/useAppRouteState.tsx` from 1138 LOC to 983 LOC while keeping existing behavior and route contracts.
- Validation run (post-extraction):
  - `npm run -s typecheck`
  - `npm run -s typecheck:strict-unused`
  - `npm test -- --runInBand`
  - `npm run -s build`
- Follow-up: split the remaining large viewer-shell props assembly in `useAppRouteState.tsx` into smaller feature-focused route hooks.

## 3D viewer regression fix (blank render + context churn)
- Addressed a 3D-mode regression where repeated lifecycle teardown/re-init could exhaust WebGL contexts (`Too many active WebGL contexts`) and leave the viewer blank.
- Stabilized `useVolumeViewerLifecycle` by pinning volatile callbacks behind refs and preventing renderer lifecycle churn from callback identity changes.
- Added hover tooltip state de-duplication in `useTrackRendering` to avoid unnecessary state churn from equivalent pointer/controller hover positions.
- Hardened active-layer resolution in `useRouteLayerVolumes` so stale channel-layer selections fall back to a valid layer key before volume fetch.
- Validation run (post-fix):
  - `npm run -s typecheck`
  - `npm test -- --runInBand`
  - `npm run -s build`
  - `npm run -s verify:fast`
  - `npx playwright test --config=playwright.config.ts --project=chromium tests/e2e/viewer-playback-smoke.spec.ts`

## VR HUD renderer modular split (channels + tracks)
- Split monolithic HUD renderers into section modules while preserving public entrypoints:
  - `src/components/viewers/volume-viewer/vr/hudRenderersChannels.ts` now orchestrates only.
  - `src/components/viewers/volume-viewer/vr/hudRenderersChannelsBase.ts` + `hudRenderersChannelsShared.ts` own channels HUD prep + active-layer resolution.
  - `src/components/viewers/volume-viewer/vr/hudRenderersChannelsTabs.ts` isolates channel-tab layout/region emission.
  - `src/components/viewers/volume-viewer/vr/hudRenderersChannelsLayerSections.ts` isolates layer toggles/histogram/reset/color swatch drawing.
  - `src/components/viewers/volume-viewer/vr/hudRenderersChannelsLayerSliders.ts` isolates slider definitions + slider interaction region wiring.
  - `src/components/viewers/volume-viewer/vr/hudRenderersChannelsLayerControls.ts` coordinates channel-layer controls from focused helpers.
  - `src/components/viewers/volume-viewer/vr/hudRenderersChannelsSections.ts` is now a compatibility re-export surface.
  - `src/components/viewers/volume-viewer/vr/hudRenderersTracks.ts` now orchestrates only.
  - `src/components/viewers/volume-viewer/vr/hudRenderersTracksBase.ts` + `hudRenderersTracksShared.ts` own tracks HUD prep + active-channel resolution.
  - `src/components/viewers/volume-viewer/vr/hudRenderersTracksTabs.ts` isolates channel-tab layout/region emission.
  - `src/components/viewers/volume-viewer/vr/hudRenderersTracksControls.ts` isolates stop-follow/sliders/color controls/master toggle rows.
  - `src/components/viewers/volume-viewer/vr/hudRenderersTracksRows.ts` isolates track rows + scrollbar rendering/regions.
  - `src/components/viewers/volume-viewer/vr/hudRenderersTracksSections.ts` is now a compatibility re-export surface.
- LOC impact:
  - channels orchestrator reduced to ~95 LOC (`hudRenderersChannels.ts`)
  - tracks orchestrator reduced to ~92 LOC (`hudRenderersTracks.ts`)
  - former channels sections hotspot (`hudRenderersChannelsSections.ts`) reduced to 2 LOC re-export; channels controls now split across 129/181/194/411 LOC modules.
  - former tracks sections hotspot (`hudRenderersTracksSections.ts`) reduced to 7 LOC re-export; tracks controls now split across 102/374/200 LOC modules.
- Validation run (post-split):
  - `npm run -s typecheck`
  - `node --import tsx --test tests/hudRenderers.test.ts`
  - `npm test -- --runInBand`
  - `npm run -s build`
  - `npm run -s test:coverage:hotspots`

## Controller ray updater extraction (loop decomposition)
- Reduced `src/components/viewers/volume-viewer/vr/controllerRayUpdater.ts` from 616 LOC to 466 LOC by extracting focused controller-ray responsibilities:
  - `src/components/viewers/volume-viewer/vr/controllerRayHudTransforms.ts` for selected HUD panel drag + yaw/pitch manipulation updates.
  - `src/components/viewers/volume-viewer/vr/controllerRayTrackIntersections.ts` for visible-track ray intersections and container-space hover projection.
  - `src/components/viewers/volume-viewer/vr/controllerRayFrameFinalize.ts` for frame-final hover synchronization, summary logging, and playback-hover flag fanout.
- Updated hotspot coverage gate in `package.json` to include the new controller-ray helper modules.
- Validation run (post-extraction):
  - `npm run -s typecheck`
  - `node --import tsx --test tests/controllerRayUpdater.test.ts`
  - `node --import tsx --test tests/controllerRayHudCandidates.test.ts tests/controllerRayRegionState.test.ts tests/controllerRayUiFlags.test.ts tests/controllerRayVolumeDomain.test.ts`
  - `npm run -s test:coverage:hotspots`

## Controller configuration decomposition (entry lifecycle + select handlers)
- Reduced `src/components/viewers/volume-viewer/vr/controllerConfiguration.ts` from 606 LOC to 195 LOC by extracting event-handler responsibilities:
  - `src/components/viewers/volume-viewer/vr/controllerConnectionLifecycle.ts` for connect/disconnect state reset + visibility refresh behavior.
  - `src/components/viewers/volume-viewer/vr/controllerSelectStart.ts` for select-start activation, HUD/volume gesture state setup, and immediate slider/scroll application.
  - `src/components/viewers/volume-viewer/vr/controllerSelectEnd.ts` for select-end action routing across playback/channels/tracks + follow interactions.
- Preserved configurator API (`createControllerEntryConfigurator`) while making it a thin wiring/orchestration layer.
- Moved shared dependency typing into `src/components/viewers/volume-viewer/vr/controllerInputDependencies.ts` so extracted handler modules no longer import types from the configurator module.
- Added targeted handler tests in `tests/controllerSelectHandlers.test.ts` covering:
  - controller connect/disconnect lifecycle resets,
  - select-start suppression for disabled playback toggle,
  - select-start slider invocation on tracks regions,
  - select-end channel tab selection + track follow + playback toggle actions.
- Expanded hotspot coverage includes to track the new handler modules:
  - `controllerConnectionLifecycle.ts`
  - `controllerSelectStart.ts`
  - `controllerSelectEnd.ts`
- Validation run (post-extraction):
  - `npm run -s typecheck`
  - `node --import tsx --test tests/controllerSelectHandlers.test.ts`
  - `node --import tsx --test tests/controllerRayUpdater.test.ts tests/controllerRayHudCandidates.test.ts tests/controllerRayRegionState.test.ts tests/controllerRayUiFlags.test.ts tests/controllerRayVolumeDomain.test.ts`
  - `npm run -s test:coverage:hotspots`
  - `npm run -s build`

## App route props decomposition (non-VR route orchestration)
- Extracted route-prop assembly from `useAppRouteState.tsx` into focused pure composers:
  - `src/ui/app/hooks/routeDatasetSetupProps.ts` now builds `RouteDatasetSetupProps` from grouped sections (`state`, `handlers`, `tracks`, `launch`, `preprocess`).
  - `src/ui/app/hooks/routeViewerShellProps.ts` now builds `ViewerShellRouteProps` from grouped sections (`viewer`, `chrome`, `panels`).
- Updated `src/ui/app/hooks/useAppRouteState.tsx` to delegate both large object constructions through these composers, reducing monolithic wiring in the route hook while keeping behavior and route contracts unchanged.
- Added targeted unit coverage:
  - `tests/app/hooks/routeDatasetSetupProps.test.ts`
  - `tests/app/hooks/routeViewerShellProps.test.ts`
- Validation run:
  - `npm run -s typecheck`
  - `npm run -s typecheck:tests`
  - `node --import tsx --test tests/app/hooks/routeDatasetSetupProps.test.ts tests/app/hooks/routeViewerShellProps.test.ts`
- Caveat:
  - `npm run -s typecheck:strict-unused` currently fails on an existing unrelated VR file (`src/components/viewers/volume-viewer/vr/controllerConnectionLifecycle.ts`) due an unused `THREE` import. This change set intentionally avoided VR edits.
- Follow-up:
  - Continue the same decomposition pattern for `ViewerShell.tsx` and `VolumeViewer.tsx` non-VR orchestration surfaces.

## Viewer shell orchestration split (non-VR UI/runtime seams)
- Reduced `src/components/viewers/ViewerShell.tsx` by extracting three dense orchestration concerns into focused shell hooks:
  - `src/components/viewers/viewer-shell/hooks/useViewerRecording.ts`
    - owns capture-target registration (`3d`/`2d`), media-recorder setup/teardown, frame-pump lifecycle, bitrate clamping, and playback recording glue.
    - exports tested pure helpers (`clampRecordingBitrateMbps`, `resolveCaptureFps`, `createRecordingFileName`).
  - `src/components/viewers/viewer-shell/hooks/useViewerPanelWindows.ts`
    - owns viewer-settings / plot-settings / track-settings / paintbrush window open-close-reset policies.
  - `src/components/viewers/viewer-shell/hooks/useViewerPaintbrushIntegration.ts`
    - owns paintbrush primary-volume binding, overlay layer composition for 3d/2d viewers, stroke handler wiring, and paint TIFF export callback.
- Rewrote `src/components/viewers/ViewerShell.tsx` to a thin composition shell that delegates recording, window state, and paintbrush integration to the extracted hooks while preserving panel/viewer contracts.
- Added targeted test coverage:
  - `tests/viewer-shell/useViewerRecording.test.ts` for recording helper behavior (bitrate clamp, FPS resolution, file-name shaping).
- Validation run:
  - `npm run -s typecheck`
  - `npm run -s typecheck:tests`
  - `node --import tsx --test tests/ViewerShellContainer.test.ts tests/PaintbrushWindow.test.tsx tests/viewer-shell/useViewerRecording.test.ts`
- Caveat:
  - `npm run -s typecheck:strict-unused` still fails due a pre-existing VR-file unused import (`src/components/viewers/volume-viewer/vr/controllerConnectionLifecycle.ts`), unchanged in this non-VR slice.
- Follow-up:
  - Continue with the next non-VR high-priority hotspot: `src/components/viewers/volume-viewer/useTrackRendering.ts`.

## Track rendering decomposition (non-VR overlay pipeline)
- Reduced coupling in `src/components/viewers/volume-viewer/useTrackRendering.ts` by extracting dense responsibilities into focused helper modules:
  - `src/components/viewers/volume-viewer/trackHoverState.ts`
    - isolates hover-source arbitration (`pointer` vs `controller`), hovered-track state, and tooltip position synchronization.
  - `src/components/viewers/volume-viewer/trackDrawRanges.ts`
    - isolates draw-range updates for full-trail vs windowed-trail modes, including end-cap position/visibility updates and geometry slice reuse.
  - `src/components/viewers/volume-viewer/trackHitTesting.ts`
    - isolates pointer raycast hit testing against visible line/end-cap objects and hover fallback clearing behavior.
  - `src/components/viewers/volume-viewer/trackAppearance.ts`
    - isolates per-frame appearance updates (color/highlight/blink, opacity, line widths, outline widths/opacities, end-cap scale updates).
- Updated `useTrackRendering.ts` to delegate the extracted concerns while preserving public hook API and resource lifecycle behavior.
- Validation run:
  - `npm run -s typecheck`
  - `npm run -s typecheck:tests`
  - `node --import tsx --test tests/useTrackRendering.test.ts`
- Caveat:
  - `npm run -s typecheck:strict-unused` remains blocked by an unchanged pre-existing VR file (`src/components/viewers/volume-viewer/vr/controllerConnectionLifecycle.ts`) with an unused import.
- Follow-up:
  - Continue with the next non-VR high-priority hotspot: `src/shared/utils/preprocessedDataset/preprocess.ts` (pipeline orchestration split).

## Preprocess pipeline decomposition (non-VR data pipeline)
- Refactored `src/shared/utils/preprocessedDataset/preprocess.ts` to split the large `preprocessDatasetToStorage(...)` orchestration into explicit staged helpers:
  - `computeLayerTimepointMetadata(...)`
  - `computeLayerRepresentativeNormalization(...)`
  - `collectLayerMetadata(...)`
  - `groupLayersByChannel(...)`
  - `buildManifestFromLayerMetadata(...)`
  - `writeTrackSetCsvFiles(...)`
  - `createManifestZarrArrays(...)`
  - `writeNormalizedLayerTimepoint(...)`
  - `writeLayerVolumesFor2d(...)`
  - `writeLayerVolumesFor3d(...)`
- Updated `preprocessDatasetToStorage(...)` to read as a linear pipeline (prepare -> normalize -> validate metadata -> build manifest -> materialize arrays/tracks -> write per-timepoint volumes).
- Kept behavior and error messages stable while reducing coupling between orchestration, I/O, normalization, and manifest shaping.
- Validation run:
  - `npm run -s typecheck`
  - `npm run -s typecheck:tests`
  - `node --import tsx --test tests/preprocessedDataset.test.ts`
  - `node --import tsx --test tests/useTrackRendering.test.ts tests/viewer-shell/useViewerRecording.test.ts tests/ViewerShellContainer.test.ts tests/preprocessedDataset.test.ts`
- Caveat:
  - `createManifestZarrArrays(...)` uses a permissive `root` type boundary (`any`) to keep Zarrita store typing flexible across current call sites; behavior is unchanged.
  - `npm run -s typecheck:strict-unused` remains blocked by an unchanged pre-existing VR file (`src/components/viewers/volume-viewer/vr/controllerConnectionLifecycle.ts`) with an unused import.
- Follow-up:
  - Continue with non-VR viewer orchestration cleanup in `src/components/viewers/VolumeViewer.tsx` and `src/components/viewers/PlanarViewer.tsx`.

## Refactor stabilization pass (route hooks, VR bridge, planar auto-fit)
- Addressed post-refactor correctness risks in route/VR/planar wiring:
  - `src/components/viewers/volume-viewer/VolumeViewerVrBridge.tsx`
    - Replaced narrow `playbackLoopRef` equality gating with field-level integration diffing (`hasChangedVrIntegration`) so parent VR integration updates when any API surface changes.
  - `src/components/viewers/planar-viewer/usePlanarViewerCanvasLifecycle.ts`
  - `src/components/viewers/planar-viewer/usePlanarPrimaryVolume.ts`
  - `src/components/viewers/PlanarViewer.tsx`
    - Replaced ref-only planar auto-fit signaling with an explicit request revision state (`requestAutoFit` + `autoFitRequestRevision`) so reset effects run deterministically when auto-fit is requested.
  - `src/hooks/dataset/useChannelSources.ts`
  - `src/hooks/dataset/channelTimepointValidation.ts`
    - Global timepoint mismatch now uses only known computed counts (ignores pending/unknown layers), and channels report a pending warning while counts are still being computed.
  - `src/ui/app/hooks/useRouteDatasetSetupState.ts`
    - Fixed `handleAddChannel` callback sequencing so pending-focus/edit handlers always receive the created channel (removed fragile state-updater side-channel capture).
- Added dedicated coverage for newly extracted route/refactor seams:
  - `tests/app/hooks/useRouteLayerVolumes.test.ts`
  - `tests/app/hooks/useRouteDatasetResetState.test.ts`
  - `tests/app/hooks/useRouteDatasetSetupState.test.ts`
  - `tests/app/hooks/useRouteVrChannelPanels.test.ts`
  - `tests/volumeViewerVrBridge.test.ts`
  - `tests/channelTimepointValidation.test.ts`
- Validation run:
  - `npm run -s typecheck`
  - `npm run -s typecheck:tests`
  - `npm test`
  - `npm run -s verify:fast`
  - `npm run -s verify:ui`
  - `npm run -s typecheck:strict-unused`
  - `npm run -s test:perf`
- Caveats / trade-offs:
  - VR integration diffing now compares all enumerable API fields; this prioritizes correctness over minimal update frequency and can propagate updates whenever any returned handler/ref identity changes.
  - Planar auto-fit now intentionally triggers a small additional rerender per auto-fit request, trading minimal state churn for deterministic reset behavior.
- Follow-up:
  - If VR integration update frequency ever becomes a measurable hotspot, consider introducing an explicit revision token from `useVolumeViewerVr` for cheaper publication gating.
