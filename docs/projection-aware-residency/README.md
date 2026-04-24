# Projection-Aware Residency Refactor

Status: **Implemented**  
Start date: **2026-04-22**

This folder is the source of truth for refactoring viewer residency selection so that:

- projection mode no longer hard-forces `atlas` vs `volume`
- orthographic mode is allowed to use atlas residency when the policy says it should
- playback acceleration works across residency outcomes instead of only on atlas-backed layers

Implementation status:

- unified residency selection has been implemented
- orthographic can now select atlas residency
- playback caching/readiness/promotion now work for prepared atlas and prepared direct-volume frames
- projection-aware orthographic atlas prioritization has been implemented in the brick scheduler
- targeted typechecks and regression tests are passing
- remaining follow-up is benchmark/e2e evidence capture, because the local Playwright smoke run started but did not complete with a result

## Program objective

Replace the current projection-based residency split:

- `perspective -> atlas allowed`
- `orthographic -> volume forced`

with a unified, projection-aware residency policy that can choose either:

- `atlas`
- `volume`

for either desktop projection mode based on correctness and performance criteria.

## Definitive finding from investigation

The current orthographic volume-only path is:

- **intentional**
- **enforced by tests**
- **introduced in commit `686cfa8`**

but it is **not documented as a fundamental requirement**.

The strongest supported interpretation is:

1. orthographic volume-only residency was a conservative delivery choice
2. the real unresolved issue was projection-aware atlas residency policy and prioritization
3. therefore the proper fix is architectural, not just a localized performance workaround

## Non-negotiable invariants

1. Perspective mode remains the protected baseline.
2. Orthographic mode must become a first-class residency client, not a permanent fallback path.
3. Projection mode must not hard-force residency mode in steady state.
4. Direct-volume residency remains valid as a policy outcome when warranted.
5. Playback buffering, buffered-start, and warmup reuse must operate on residency results rather than on projection-specific assumptions.
6. VR remains perspective-only unless a separate approved program changes that contract.

## Scope

- remove the hard projection-to-residency mapping
- define and implement a unified residency decision model
- make atlas residency viable in orthographic mode
- make playback buffering / readiness projection-agnostic
- add benchmark and regression coverage for perspective non-regression and orthographic improvement

## Locked out of scope

- WebGPU migration as part of this program
- replacing the current volume renderer wholesale
- VR orthographic support
- unrelated viewer-shell redesign

## Definition of done

This program is complete only when all of the following are true:

1. Projection mode no longer hard-forces residency mode.
2. Orthographic mode can take the atlas path when the unified policy selects it.
3. Playback acceleration works for the selected residency mode in both perspective and orthographic desktop views.
4. Perspective performance remains explicitly non-regressed.
5. Orthographic playback and close-up performance are explicitly improved relative to the current force-volume baseline on atlas-friendly datasets.
6. All roadmap phases are `COMPLETE`.
7. All required checks in `TEST_PLAN.md` pass.
8. `SESSION_HANDOFF.md` and `EXECUTION_LOG.md` are synchronized with the latest implementation state.

## Relationship to Existing Orthographic Program

This packet does **not** replace `docs/orthographic-projection-mode/`.

Instead:

- the orthographic packet remains the historical record of the shipped feature
- this packet is the follow-on architecture program to remove the conservative force-volume fallback introduced there

Read the orthographic packet first if you need background on:

- projection state
- camera behavior
- orthographic shader variants
- projection-aware LOD sampling

## Read order

1. `DECISIONS.md`
2. `IMPLEMENTATION_SPEC.md`
3. `ROADMAP.md`
4. `BACKLOG.md`
5. `TEST_PLAN.md`
6. `BENCHMARK_MATRIX.md`
7. `RISK_REGISTER.md`
8. `SESSION_HANDOFF.md`
9. `EXECUTION_LOG.md`
10. `SESSION_PROMPT.md`

## Multi-session workflow rules

1. Update `DECISIONS.md` before changing architectural direction.
2. Claim work in `BACKLOG.md` by marking items `IN_PROGRESS`.
3. Do not remove the current direct-volume fallback until the replacement path is verified.
4. Treat any perspective regression as a blocker.
5. After each implementation session:
   - update `SESSION_HANDOFF.md`
   - append to `EXECUTION_LOG.md`
   - keep `ROADMAP.md` accurate
