# Progress

## Current status
- Markdown documentation has been centralized under `docs/`.
- The major refactor program is complete and archived in `docs/refactor/ARCHIVE_SUMMARY.md`.
- The app has local verification gates for fast checks, UI/browser checks, and full/nightly runs.
- Viewer, route, VR, and preprocessing hotspots have been decomposed into smaller modules to reduce coupling.

## Most recent high-signal updates
- Moved Markdown files into `docs/`:
  - `docs/README.md`
  - `docs/PROGRESS.md`
  - `docs/PROJECT_STRUCTURE.md`
  - `docs/AGENTS.md`
  - `docs/src/components/pages/FrontPageContainer.md`
- Updated `docs/AGENTS.md` policy:
  - Agents may create/update helpful Markdown files under `docs/`.
  - Backward compatibility is not required while the project is in early development.
- Updated `docs/PROJECT_STRUCTURE.md` to reference the relocated documentation files.

## Major completed milestones (condensed)
- Route orchestration split into focused hooks (`useRoute*` modules) to reduce monolithic app routing state.
- `ViewerShell` orchestration split into recording, panel-window, and paintbrush integration hooks.
- `VolumeViewer` and planar-viewer supporting logic split into lifecycle/rendering/helper modules.
- VR controller/HUD hotspot logic split across focused modules (controller lifecycle/select handlers, HUD sections, ray updater helpers).
- Preprocessing pipeline reorganized into explicit staged helpers for manifest creation, metadata collection, and timepoint writes.
- Local test and verification workflow expanded (frontend tests, visual checks, Playwright smoke/visual/nightly scenarios, perf checks).

## Active follow-up TODOs
- Keep `docs/README.md` and any contributor tooling aligned with the new docs-only Markdown layout.
- Continue expanding strict-unused coverage in controlled scopes as remaining legacy surfaces shrink.
- Continue monitoring large orchestration files and split further when cohesion degrades.
- Add or maintain focused tests for import/export edge cases and high-risk viewer/VR interaction paths.

## Verification commands
- Fast gate: `npm run verify:fast`
- UI/browser gate: `npm run verify:ui`
- Full gate: `npm run verify:full`
- Nightly local gate: `npm run verify:nightly`
- Optional strict-unused gate: `npm run typecheck:strict-unused`

## Open questions
- None currently tracked.

## Historical detail
- The previous line-by-line historical changelog was intentionally removed to keep this file concise.
- For detailed historical refactor context, see:
  - `docs/refactor/ARCHIVE_SUMMARY.md`
  - `git log` / PR history
