# Performance Plan

This plan defines how orthographic performance impact will be measured and accepted.

## 1) Hypotheses

- Orthographic rays produce more uniform travel distances per pixel than perspective.
- Ray step count variance should decrease in orthographic mode.
- Frame-time may improve or regress depending on volume thickness along view direction and early-exit behavior.
- Largest risk is heuristic mismatch (fit distance, residency priorities, step scaling), not shader branch overhead alone.

## 2) Metrics to collect

Per mode (`perspective`, `orthographic`):

- average frame time (ms)
- p95 frame time (ms)
- average ray steps per pixel (or sampled estimate)
- early-exit ratio
- atlas/page-table residency churn (if available)
- memory usage deltas for camera/resource structures

## 3) Test scenes

Minimum matrix:

- single-channel intensity volume
- multi-channel volume
- segmentation overlay enabled
- dense/high-opacity volume and sparse/low-opacity volume

Camera cases per scene:

- frontal view
- oblique view
- near-volume fit
- zoomed-in region

## 4) Required checks

- Compare perspective-before vs perspective-after (non-regression).
- Compare perspective vs orthographic for expected deltas.
- Repeat runs to reduce single-run noise.

## 5) Acceptance thresholds (initial)

- Perspective regression threshold:
  - avg frame time change <= 5%
  - p95 frame time change <= 8%
- Orthographic stability threshold:
  - no pathological spikes vs perspective baseline under same scene/camera case.

Thresholds can be tightened after first stable implementation.

## 6) Instrumentation notes

Potential instrumentation points:

- shader debug counters (if available)
- render loop timing snapshots
- resource diagnostics already emitted by provider/viewer debug overlays

Record all benchmark snapshots in:

- `EXECUTION_LOG.md`
- optional structured benchmark artifact if added later

## 7) Tuning knobs to revisit

- camera fit distance/frustum sizing
- `volumeStepScaleRef` or equivalent sample spacing control
- early-exit alpha defaults
- residency/scheduling priorities that depend on camera position/distance

## 8) Red flags

- Perspective performance drops after abstraction (unexpected).
- Orthographic mode causes persistent over-sampling in frontal views.
- Frequent cache churn due to unstable camera-priority heuristics.

## 9) Execution snapshot (2026-02-21)

- Executed runtime/perf-oriented verification in standard suite:
  - `npm run -s test` (includes `tests/perf/**/*.test.ts`)
- No automated failures were introduced by the orthographic cutover.
- A dedicated orthographic-vs-perspective frame-time benchmark harness is still recommended if tighter numeric KPI gating is needed later.
