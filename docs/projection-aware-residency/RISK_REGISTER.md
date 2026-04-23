# Risk Register

Status legend: `OPEN`, `MONITORING`, `MITIGATED`, `CLOSED`

## R-RES-001: Perspective regressions from shared residency refactor

- Status: `OPEN`
- Trigger:
  - residency selection is generalized and accidentally changes perspective outcomes
- Impact:
  - perspective performance or correctness regresses
- Mitigation:
  - keep perspective benchmarks mandatory
  - add explicit perspective-policy regression tests

## R-RES-002: Orthographic atlas residency becomes enabled but visually incorrect

- Status: `OPEN`
- Trigger:
  - atlas path is allowed in orthographic without correct prioritization or validation
- Impact:
  - missing detail
  - unstable close-up rendering
  - playback artifacts
- Mitigation:
  - projection-aware prioritization
  - atlas-specific orthographic benchmarks

## R-RES-003: Unified policy silently degrades into a new hidden hard switch

- Status: `OPEN`
- Trigger:
  - policy inputs remain technically unified but implementation keeps a concealed projection-specific early exit
- Impact:
  - architecture remains split despite apparent refactor
- Mitigation:
  - require explicit audits for hidden projection gates
  - make residency rationale observable in diagnostics/tests

## R-RES-004: Playback cache bifurcates into two permanent subsystems

- Status: `OPEN`
- Trigger:
  - atlas-backed and volume-backed playback caching are implemented as unrelated long-term stacks
- Impact:
  - maintenance burden rises
  - behavior diverges by projection or residency mode
- Mitigation:
  - force the cache abstraction to model prepared outputs generically

## R-RES-005: Memory usage grows unbounded during migration

- Status: `OPEN`
- Trigger:
  - atlas and volume prepared-frame caches coexist without unified budgeting/eviction
- Impact:
  - high RAM / GPU memory pressure
  - unstable buffering behavior
- Mitigation:
  - explicit cache ownership and eviction rules
  - benchmark memory-sensitive scenarios

## R-RES-006: Orthographic prioritization signals are too expensive

- Status: `OPEN`
- Trigger:
  - projected-overlap or slab-based prioritization adds large CPU overhead
- Impact:
  - residency quality improves but frame time worsens
- Mitigation:
  - benchmark priority computation cost separately
  - keep fallback heuristics available during tuning

## R-RES-007: Buffered-start becomes inconsistent across residency modes

- Status: `OPEN`
- Trigger:
  - readiness is computed differently for atlas-backed versus volume-backed frames
- Impact:
  - play button behavior becomes confusing or flaky
- Mitigation:
  - unify prepared-frame readiness semantics

## R-RES-008: Orthographic shader-Lod follow-up is incorrectly deferred

- Status: `MONITORING`
- Trigger:
  - residency fixes land, but orthographic render cost remains dominated by shader behavior
- Impact:
  - orthographic still underperforms after the main refactor
- Mitigation:
  - explicitly benchmark after residency work before declaring completion

