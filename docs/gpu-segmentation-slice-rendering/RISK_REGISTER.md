# Risk Register

## R-GSSR-001: 2D And 3D Segmentation Label Decode Drift

Impact: High

If the new slice shader copies label decode logic instead of sharing it, 2D and 3D may disagree on labels.

Mitigation:

- extract shared GLSL snippets where practical
- add tests for labels crossing byte boundaries
- compare GPU slice output against CPU reference initially

## R-GSSR-002: Missing-Brick Behavior Changes

Impact: High

Sparse empty space must remain transparent/background. Incorrect page-table handling could render noise or stale atlas data.

Mitigation:

- test missing bricks explicitly
- ensure atlas index `< 0` maps to label `0`
- preserve current background alpha behavior

## R-GSSR-003: Editable Segmentation Edits Do Not Refresh GPU Bindings

Impact: High

Editable atlas objects change after edits. The GPU slice resource must see those changes.

Mitigation:

- include atlas identity/revision in resource update checks
- test brush edit while 2D Slice mode is active
- verify both current slice and z changes after edit

## R-GSSR-004: Texture Limit Failures On Large Atlases

Impact: Medium

The GPU path may require the same atlas texture support as 3D rendering. Some datasets or devices may exceed limits.

Mitigation:

- reuse existing atlas texture sizing checks
- keep CPU fallback until complete confidence
- log or expose diagnostics when falling back

## R-GSSR-005: Blending Or Alpha Regression

Impact: Medium

Segmentation colors may look correct in isolation but composite differently with intensity channels.

Mitigation:

- preserve current `transparent`, `depthTest`, `depthWrite`, render-order, and blending settings
- include multi-channel visual tests

## R-GSSR-006: Performance Moves From CPU Slice Generation To Excessive Resource Rebuilds

Impact: Medium

Even with GPU sampling, performance can remain poor if every z change rebuilds material or atlas textures.

Mitigation:

- assert z changes only update `u_sliceIndex`
- measure material/texture rebuild counts
- add resource lifecycle tests

## R-GSSR-007: Hover Or Annotation Coordinate Mismatch

Impact: Medium

The visual slice must match hover/edit coordinate mapping.

Mitigation:

- reuse existing slice plane geometry and UV mapping
- test labels at corners, edges, and brick boundaries
- keep hover/annotation logic unchanged unless a verified mismatch is found

## R-GSSR-008: CPU Fallback Masks Broken GPU Path

Impact: Medium

If fallback is too broad, tests may pass while production still uses CPU flattening.

Mitigation:

- add explicit tests that GPU source mode is selected for regular and editable segmentation
- add diagnostics or assertions in targeted tests to ensure CPU path is not called

