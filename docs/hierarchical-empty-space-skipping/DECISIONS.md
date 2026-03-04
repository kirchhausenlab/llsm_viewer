# Decisions

Status legend: `LOCKED`, `PROVISIONAL`, `SUPERSEDED`

## D-HES-001: Hard cutover format and storage root

- Status: `LOCKED`
- Decision:
  - Change preprocessed dataset format id to a new hard-cutover value.
  - Change preprocessed storage root dir to match the new format lineage.
  - Do not support reading old-format manifests in this program.
- Rationale:
  - User explicitly requested no backward compatibility.
  - The hierarchy contract is foundational; partial compatibility creates ambiguity and bugs.

## D-HES-002: No runtime fallback to no-skip path

- Status: `LOCKED`
- Decision:
  - Do not add feature flags or auto-disable behavior that silently reverts to no-skip.
  - If hierarchy data is invalid, fail fast with explicit runtime error.
- Rationale:
  - User explicitly rejected fallback behavior.
  - Silent fallback hides defects and delays root-cause fixes.

## D-HES-003: Skip decisions must not depend on atlas residency indices

- Status: `LOCKED`
- Decision:
  - Remove atlas-index-driven skip predicates (`atlasIndex < 0` as skip reason).
  - Skip eligibility is determined only by hierarchy occupancy and hierarchical min/max bounds.
- Rationale:
  - Prior artifacts were caused by conflating "not resident" with "empty."

## D-HES-004: One shared hierarchy traversal core for MIP/ISO/BL

- Status: `LOCKED`
- Decision:
  - Implement one traversal engine with per-mode threshold rules.
  - Do not maintain independent skip implementations per mode.
- Rationale:
  - Separate implementations drift and produce mode-specific correctness bugs.

## D-HES-005: Keep user sampling mode authoritative

- Status: `LOCKED`
- Decision:
  - Do not auto-switch user sampling (`linear` <-> `nearest`) as a skip workaround.
- Rationale:
  - User sampling choice is explicit and must be preserved.

## D-HES-006: Keep skip active during camera motion

- Status: `LOCKED`
- Decision:
  - No "disable skip while moving" policy.
- Rationale:
  - Movement-heavy interactions are the primary perf pain point.

## D-HES-007: Hierarchy is precomputed in preprocessing, not built on the fly

- Status: `LOCKED`
- Decision:
  - Build full hierarchy arrays during preprocessing for every `(layer, scale, timepoint)`.
  - Runtime reads hierarchy metadata directly; no runtime hierarchy construction.
- Rationale:
  - Runtime construction would add avoidable CPU overhead and synchronization complexity.

## D-HES-008: Strict schema and invariants over permissive handling

- Status: `LOCKED`
- Decision:
  - Manifest/schema validation must enforce hierarchy completeness and shape consistency.
  - Invalid hierarchy metadata must throw.
- Rationale:
  - Aggressive skip logic requires strict correctness guarantees at load time.

