# Roadmap

Status legend: `PLANNED`, `IN_PROGRESS`, `COMPLETE`, `BLOCKED`

## Phase 0 - Baseline and regression guardrails

Status: `COMPLETE`

Delivered:

- perspective non-regression acceptance criteria documented
- projection benchmark matrix finalized
- completion verification captured with explicit perspective protection language

## Phase 1 - Projection state and UI plumbing

Status: `COMPLETE`

Delivered:

- explicit `projectionMode` route and viewer-shell state
- `Perspective` / `Orthographic` controls in render settings
- VR guard that forces unsupported orthographic state back to perspective

## Phase 2 - Desktop camera/control abstraction

Status: `COMPLETE`

Delivered:

- shared desktop camera/view-state contract
- projection-aware resize, reset, and preserved state
- runtime camera/controls switching without full volume-resource teardown
- framing-preserving projection conversion helpers

## Phase 3 - Projection-aware volume rendering

Status: `COMPLETE`

Delivered:

- projection-specific 3D shader/material variants
- orthographic ray construction for the 3D volume shader
- protected perspective path retained as a separate compile-time variant
- projection-aware fit-to-view/default framing

## Phase 4 - Interaction and overlay parity

Status: `COMPLETE`

Delivered:

- hover, picking, ROI, world props, and follow-target flow generalized to desktop projection-aware camera typing
- pointer lifecycle updated to follow live controls after runtime camera swaps
- user-facing help text remains consistent with the updated viewer settings surface

## Phase 5 - Projection-aware quality policy and performance

Status: `COMPLETE`

Delivered:

- projection-aware camera navigation samples
- adaptive LOD policy updated to consume projected pixels per voxel rather than pure distance fallback
- orthographic residency/quality behavior verified in the completion test and benchmark pass

## Phase 6 - Hardening and closure

Status: `COMPLETE`

Delivered:

- targeted renderer/camera tests added
- end-to-end smoke coverage for projection switching added
- full unit/integration suite passed
- fast verification bundle passed
- smoke Playwright suite passed against a synthetic multi-timepoint TIFF fixture
- docs synchronized to completion state
