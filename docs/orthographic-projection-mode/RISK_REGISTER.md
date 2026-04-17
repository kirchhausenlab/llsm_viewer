# Risk Register

Status legend: `OPEN`, `MONITORING`, `MITIGATED`, `CLOSED`

## R-ORTHO-001: Perspective shader regression from shared projection branching

- Status: `MITIGATED`
- Trigger:
  - orthographic support is implemented by inserting hot projection branches into the existing perspective fragment path
- Impact:
  - perspective render performance regresses
  - subtle perspective correctness bugs slip in
- Mitigation:
  - projection-specific shader/material variants
  - benchmark perspective before and after

## R-ORTHO-002: Bad mode-switch framing

- Status: `MITIGATED`
- Trigger:
  - switching projection modes preserves only target or only position
- Impact:
  - the camera appears to jump unpredictably
  - feature feels broken even if technically functional
- Mitigation:
  - explicit framing-preservation math
  - projection-specific saved view state

## R-ORTHO-003: Distance-only LOD policy breaks orthographic zoom

- Status: `MITIGATED`
- Trigger:
  - adaptive scale selector keeps using camera distance as the main projected-footprint proxy
- Impact:
  - orthographic zoom can show the wrong scale level
  - visual quality and performance become inconsistent
- Mitigation:
  - introduce projection-aware screen-coverage metric
  - add orthographic policy tests and benchmarks

## R-ORTHO-004: Follow mode preserves the wrong state in orthographic

- Status: `MITIGATED`
- Trigger:
  - follow mode preserves only camera-target offset
- Impact:
  - orthographic follow unexpectedly changes magnification
  - user loses the desired framing during playback
- Mitigation:
  - preserve orthographic zoom explicitly
  - add follow tests in both modes

## R-ORTHO-005: Orthographic control speeds feel wrong

- Status: `MONITORING`
- Trigger:
  - custom movement/look speed continues to scale only from camera-target distance
- Impact:
  - orthographic navigation becomes too slow or too fast
- Mitigation:
  - projection-aware control-speed rules
  - manual interaction validation

## R-ORTHO-006: Resource teardown on projection switch causes visible hitching

- Status: `MITIGATED`
- Trigger:
  - mode switching destroys and rebuilds the full render context and resources
- Impact:
  - large toggle latency
  - transient flicker or reload behavior
- Mitigation:
  - prefer camera/controls swap without volume-resource destruction
  - benchmark toggle latency

## R-ORTHO-007: GPU residency prioritization remains suboptimal in orthographic close-up views

- Status: `MONITORING`
- Trigger:
  - brick prioritization stays camera-position-only
- Impact:
  - orthographic mode may feel blurrier or churnier than necessary
- Mitigation:
  - benchmark sparse and close-up scenarios
  - tune priority function only if evidence demands it

## R-ORTHO-008: VR path accidentally exposes unsupported orthographic state

- Status: `MITIGATED`
- Trigger:
  - UI/state allows orthographic mode during XR session setup or presentation
- Impact:
  - broken VR behavior or undefined camera state
- Mitigation:
  - hard disable orthographic in VR-active path
  - add UI/state guard tests

## R-ORTHO-009: Scalebar and billboard props become misleading in orthographic mode

- Status: `MONITORING`
- Trigger:
  - prop rendering stays technically valid but semantically wrong under orthographic magnification
- Impact:
  - user-facing overlays become confusing
- Mitigation:
  - validate scalebar semantics explicitly
  - add focused manual and automated checks
