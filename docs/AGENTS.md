# AGENTS

This file defines how agents should work on this repository.

---

## Project structure

For the up-to-date project layout and architectural overview:

- **Do not** add structure descriptions here.
- Instead, read and update: `docs/PROJECT_STRUCTURE.md`.

Agents: You may freely modify `docs/PROJECT_STRUCTURE.md` to reflect code changes.

---

## Performance model

- **Primary goal:** Data visualization must be as fast and responsive as possible, making full use of GPUs where appropriate.
- The data-loading pipeline is split into:
  1. **Preprocessing stage** - May take as long as needed. Its job is to precompute/format everything it reasonably can so that...
  2. **Visualization stage** - Is as fast as possible at runtime (this stage has top priority).
- When optimizing, you may:
  - Make preprocessing slower if it clearly makes visualization faster.
  - Refactor or re-run preprocessing logic, as long as you do **not** regress visualization performance.
- For playback/streaming changes, follow invariants in:
  - `docs/playback-invariants.md`

---

## Critical runtime invariants

Agents: read this section before changing playback, projection, residency, storage, or viewer-loop code.

- Orthographic projection changes must refresh the live resource state immediately.
  - If `projectionMode` changes and the active `VolumeResources` tree does not rerun, the viewer can stay in perspective-era shader/uniform state until some unrelated visibility/load event happens.
  - First file to inspect: `src/components/viewers/volume-viewer/useVolumeResources.ts`
- Playback progress must be authoritative.
  - Do not treat a local mutable playback ref, VR HUD state, or top-menu counter as proof that the underlying route-selected frame and loaded resources advanced.
  - If the UI appears to move but the volume does not, debug route/provider/resource state first.
- Directory/OPFS range-read performance is part of the playback architecture.
  - Rebuilding file snapshots repeatedly in `readFileRange` can destroy playback throughput and make frame loads appear hung.
  - First file to inspect: `src/shared/storage/preprocessedStorage.ts`
- If playback regresses, debug from the provider/storage path upward.
  - Order:
    1. `src/shared/storage/preprocessedStorage.ts`
    2. `src/core/volumeProvider.ts`
    3. `src/ui/app/hooks/useRouteLayerVolumes.ts`
    4. `src/components/viewers/volume-viewer/useVolumeResources.ts`
    5. `src/components/viewers/VolumeViewer.tsx`
    6. `src/components/viewers/viewer-shell/TopMenu.tsx`
- Do not add "fail-open" playback progress hacks unless they preserve authoritative loaded-state semantics.
  - A workaround that makes the play button or counter move while the route/provider state is still stalled is a regression, not a fix.
- Regression tests are mandatory for these paths.
  - Relevant test anchors:
    - `tests/useVolumeResources.test.ts`
    - `tests/playbackWarmupGate.test.ts`
    - `tests/preprocessedStorage.test.ts`
    - `tests/app/hooks/useRouteLayerVolumes.test.ts`

---

## Workflow & progress

- Record your progress, status, and open questions in `docs/PROGRESS.md`.
- When you make non-trivial changes, add:
  - A short summary of what changed.
  - Any follow-up work or TODOs.
  - Any caveats or trade-offs you made.

---

## Documentation autonomy

- Agents may create or update any Markdown files under `docs/` when they help current work or future contributors.
- Keep new docs focused and practical, and update existing docs instead of duplicating content when possible.

---

## Compatibility policy

- This project is in early development: prioritize clean forward progress over backward compatibility.
- Do not retain legacy interfaces solely for compatibility if they slow down development.

---

## Code quality and organization

- Do all necessary testing to ensure the code is working correctly before considering a task "done".
- Make your code understandable to humans:
  - Prefer clear names, small focused functions, and comments where intent is non-obvious.
  - Avoid surprising behaviours or hidden side effects.
- Keep the codebase well organized and modular:
  - Components or modules that are conceptually independent should be **actually** independent (minimal coupling, clean interfaces).
  - Avoid monolithic files with thousands of lines. Split them into smaller, cohesive modules when they start to grow too large.
- When changing existing code:
  - Consider all call sites and dependent modules.
  - Update or add tests as needed.
  - Verify that intended behaviours remain correct after the change.

---

## Working expectations for agents

- If the user asks you to do something, implement it fully and properly. Do not leave half-finished work or obvious TODOs without clearly documenting them.
- Prefer robust, maintainable solutions over quick hacks.
- When you introduce complexity, pay extra attention to:
  - Documentation (comments, `docs/PROJECT_STRUCTURE.md`, `docs/PROGRESS.md`).
  - Tests that pin down key behaviour.

---

## Truthfulness Contract (Hard Requirement)

- Never claim "implemented", "fixed", "complete", or "done" unless all evidence requirements below are satisfied.
- If evidence is missing, explicitly say: "UNVERIFIED: not yet proven."

## Evidence requirements for any completion claim

- Provide exact code references for each claimed behavior change (`/abs/path/file:line`).
- Provide exact verification commands that were run.
- Provide the observed result of each command (pass/fail + key output).
- For behavior bugs, provide reproduction mapping:
  - Before: expected vs observed.
  - After: expected vs observed.
- If real user dataset/scenario was not run, explicitly state that limitation and do not claim full fix.

## Claim labels (mandatory)

- Prefix each technical claim with one of:
  - `PROVEN:` directly verified by code + command output.
  - `INFERRED:` reasoned from code but not runtime-verified.
  - `UNKNOWN:` cannot be verified from available evidence.

## Forbidden behavior

- Do not present `INFERRED` or `UNKNOWN` claims as `PROVEN`.
- Do not say "should be fixed" as if it is fixed.
- Do not close a task with unresolved `UNKNOWN` items.

## If an inaccurate claim is detected

- Stop immediately.
- List incorrect prior claims explicitly.
- Replace each with corrected `PROVEN/INFERRED/UNKNOWN` status.
- Provide updated plan before any further code changes.
