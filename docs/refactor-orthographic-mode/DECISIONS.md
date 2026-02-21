# Decisions

This file records locked decisions for orthographic projection work.

Status legend: `LOCKED`, `PROVISIONAL`, `SUPERSEDED`

## D-ORTHO-001: Projection mode is viewer-level

- Status: `LOCKED`
- Decision:
  - Introduce a viewer-level projection mode with two values: `perspective` and `orthographic`.
  - Perspective remains default.
- Rationale:
  - Matches current camera/context architecture.
  - Keeps scope manageable versus per-layer projection.

## D-ORTHO-002: VR is perspective-only

- Status: `LOCKED`
- Decision:
  - Orthographic mode is unavailable during VR.
  - Entering VR while orthographic is active must force or require perspective mode.
- Rationale:
  - XR rendering pipeline is perspective-based in existing implementation.
  - Explicit user requirement and lowest-risk behavior.

## D-ORTHO-003: Use a projection abstraction in render context

- Status: `LOCKED`
- Decision:
  - Replace direct `PerspectiveCamera` assumptions in render context with a projection-aware abstraction (or camera union).
  - Keep call sites projection-agnostic where possible.
- Rationale:
  - Perspective assumptions are currently spread through lifecycle, controls, hover, and shaders.
  - Central abstraction lowers total migration churn.

## D-ORTHO-004: Shader supports dual ray-generation paths

- Status: `LOCKED`
- Decision:
  - Keep one renderer path but support explicit perspective and orthographic ray setup in shader/uniform plumbing.
  - Preserve current perspective path as-is whenever possible.
- Rationale:
  - Existing shader already has near/far varyings that can support orthographic ray derivation.
  - Minimizes risk of accidental perspective regressions.

## D-ORTHO-005: Interaction rays become projection-agnostic

- Status: `LOCKED`
- Decision:
  - Consolidate pointer/hover/picking ray setup behind projection-agnostic helper APIs.
- Rationale:
  - Current interaction paths repeatedly call camera-specific ray logic.
  - Shared helper reduces duplicated bugs.

## D-ORTHO-006: Perspective behavior is release-blocking baseline

- Status: `LOCKED`
- Decision:
  - Any orthographic rollout must preserve perspective visual behavior and avoid meaningful performance regressions.
- Rationale:
  - Perspective is production behavior and must remain stable.

## D-ORTHO-007: Rollout behind feature flag

- Status: `PROVISIONAL`
- Decision:
  - Initial orthographic mode ships behind a runtime/dev flag until parity checks pass.
- Rationale:
  - Limits blast radius during staged migration.

## D-ORTHO-008: Initial orthographic control model

- Status: `LOCKED`
- Decision:
  - Orthographic zoom maps to camera zoom/frustum sizing, not FOV mutation.
  - Camera reset behavior must preserve current target-centric semantics.
- Rationale:
  - Orthographic cameras do not use FOV perspective math.
