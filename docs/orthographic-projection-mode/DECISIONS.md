# Decisions

This document records the initial architectural decisions for orthographic projection support. If any of these decisions must change later, update this file first and then update the implementation docs that depend on it.

## D-ORTHO-001: Orthographic support is desktop-only in this program

- Decision:
  - Orthographic projection is supported only in the desktop viewer in this program.
- Why:
  - The current VR stack is explicitly perspective-typed and sits on top of Three.js WebXR camera behavior that is perspective-oriented.
  - Mixing orthographic switching into the XR path would increase scope and risk without helping the desktop use case that motivated this program.
- Immediate consequence:
  - Orthographic controls must be disabled or unavailable while VR is active.

## D-ORTHO-002: Projection mode is explicit viewer state

- Decision:
  - Add an explicit `projectionMode: 'perspective' | 'orthographic'` contract in the viewer-shell/app-state layer.
- Why:
  - Future work needs a stable, debuggable, serializable mode boundary.
  - Avoiding implicit camera-type inference makes runtime switching and tests clearer.

## D-ORTHO-003: Perspective and orthographic keep separate saved view state

- Decision:
  - Maintain projection-specific view state rather than forcing one camera state structure onto both modes.
- Why:
  - Perspective depends on camera distance to target.
  - Orthographic depends on zoom/frustum scale.
  - Reusing a single state object without projection-specific fields will create bad resets and unstable mode switching.

## D-ORTHO-004: Perspective must not pay dormant orthographic shader cost

- Decision:
  - The 3D volume renderer must preserve a perspective-specific shader/material path that does not carry dormant orthographic branch cost unless later benchmarks prove a unified path is cost-neutral.
- Why:
  - The perspective path is the existing production path and must remain protected.
  - The user explicitly requested no perspective performance impact.
- Immediate consequence:
  - Prefer projection-specific shader/material variants over a single fragment shader with a hot per-fragment projection branch.

## D-ORTHO-005: Runtime switching must preserve perceived framing

- Decision:
  - Switching projection modes must preserve the active target and approximate on-screen framing instead of resetting to an unrelated default view.
- Why:
  - A mode toggle is a viewing preference, not a destructive navigation reset.

## D-ORTHO-006: Projection-aware quality policy replaces distance-only assumptions

- Decision:
  - Adaptive scale/LOD policy must use a projection-aware screen-coverage metric rather than relying only on camera distance.
- Why:
  - Orthographic zoom changes projected footprint without changing camera distance.
  - Distance-only heuristics will produce incorrect scale selection in orthographic mode.

## D-ORTHO-007: Initial implementation prioritizes behavior parity over control redesign

- Decision:
  - Existing desktop interactions should be preserved where they still make sense:
    - orbit/rotate
    - zoom
    - follow
    - hover
    - picking
    - ROI
    - props
- Why:
  - The main product goal is projection flexibility, not a new navigation model.
- Immediate consequence:
  - Camera-control refactors should adapt current semantics before introducing new gestures.

## D-ORTHO-008: Perspective regressions are blockers, not acceptable tradeoffs

- Decision:
  - Any measurable perspective correctness regression or material perspective performance regression blocks completion of this program.
- Why:
  - The existing perspective path remains the default and most critical viewer mode.

## D-ORTHO-009: Benchmark evidence is mandatory

- Decision:
  - The implementation is not complete without documented pre/post benchmark evidence for both:
    - perspective non-regression
    - orthographic acceptability
- Why:
  - This program changes camera, shader, and policy layers where regressions can hide behind apparently working UI behavior.

## D-ORTHO-010: Projection-only switches must refresh live resource state

- Decision:
  - Changing `projectionMode` must rerun the live volume-resource/material update path even if no layer set, timepoint, or visibility change occurred.
- Why:
  - Orthographic bugs can hide behind unrelated reload triggers.
  - A viewer can switch cameras correctly while the active material/uniform state remains in perspective configuration until some unrelated event forces a refresh.
- Immediate consequence:
  - Projection propagation must be treated as a first-class dependency in the live resource update path, not as an incidental side effect of other changes.
