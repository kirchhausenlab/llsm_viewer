# Decisions

This document records the architectural decisions for the projection-aware residency refactor.

If any of these decisions change, update this file first and then update the dependent docs.

## D-RES-001: Projection mode must not hard-force residency mode

- Decision:
  - Remove the rule that desktop orthographic projection automatically forces `volume` residency.
- Why:
  - The current force-volume behavior is an implementation shortcut introduced during orthographic delivery, not a documented rendering requirement.
  - It prevents orthographic mode from using the same fast atlas playback architecture as perspective mode.

## D-RES-002: Orthographic volume-only behavior is treated as a compatibility fallback, not a fundamental constraint

- Decision:
  - The existing orthographic direct-volume path remains available during migration, but it is no longer treated as the target architecture.
- Why:
  - The docs and investigation support “policy gap” as the root cause, not “atlas incompatibility.”

## D-RES-003: The target architecture is a unified residency decision model

- Decision:
  - Residency selection must be computed from shared policy inputs rather than from projection mode alone.
- Why:
  - Some datasets/scales may still be better as direct volumes even in perspective.
  - Some datasets/scales may be atlas-friendly even in orthographic.
  - Projection should influence the decision inputs, not decide the answer alone.

## D-RES-004: Atlas residency in orthographic is a required design goal

- Decision:
  - Orthographic mode must be capable of selecting and using atlas residency when the policy chooses it.
- Why:
  - This is the only way to remove the current second-class architecture split and let orthographic reuse the fast playback path.

## D-RES-005: Direct-volume residency remains a valid policy outcome

- Decision:
  - This program does not mandate “atlas always wins.”
- Why:
  - Direct-volume rendering may still be the correct choice for some scale/dataset/hardware combinations.
  - The proper solution is unified decision-making, not a new hard switch in the other direction.

## D-RES-006: Playback acceleration must become residency-mode-agnostic

- Decision:
  - Buffered-start, warmup reuse, and future-frame caching must operate on prepared residency outputs rather than on “atlas-only” assumptions.
- Why:
  - The current playback improvements mostly help atlas-backed layers.
  - The refactor is incomplete if the fast playback stack remains projection- or residency-specific.

## D-RES-007: Projection-aware prioritization is a first-class requirement for atlas residency

- Decision:
  - If atlas residency is selected, orthographic prioritization must not rely only on camera position.
- Why:
  - The orthographic design docs already identified camera-position-centric priority as insufficient or at least suspect.
  - Close-up orthographic views can change projected importance without perspective-style distance changes.

## D-RES-008: Perspective remains the protected baseline

- Decision:
  - Any material perspective correctness or performance regression blocks completion.
- Why:
  - The current perspective path is production-proven and is still the primary baseline.

## D-RES-009: Migration is staged, but the end state must remain unified

- Decision:
  - Temporary compatibility seams are allowed, but they must converge toward the unified residency model rather than creating a long-term orthographic-specific playback subsystem.
- Why:
  - The user explicitly rejected a workaround architecture as the end state.

## D-RES-010: The program is complete only when the force-volume assumption is removed from policy-critical code

- Decision:
  - Completion requires deleting the projection-based hard-force rule from route residency selection.
- Why:
  - Leaving the old rule in place means the root cause was not actually fixed.

