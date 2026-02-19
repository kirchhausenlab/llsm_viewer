# LLSM Viewer (Work in progress)

A high-performance web viewer for 4D (3D + time) lattice light-sheet microscopy datasets. The application loads TIFF volumes and track data directly from the client, decodes them on demand, and presents interactive previews in the browser while a full GPU-powered renderer is developed.

Try it [here](https://kirchhausenlab.github.io/llsm_viewer/)! Recommended on Chromium browsers (Chrome, Edge, Brave).

## Refactor documentation

- Active next-gen volume/rendering refactor:
  - `docs/refactor-nextgen-volume/README.md`
- Active per-layer render-style + Beer-Lambert implementation program:
  - `docs/renderstyle-bl-mode/README.md`
- Active preprocessing acceleration plan:
  - `docs/preprocessing-performance-playbook.md`
- Playback/runtime invariants (must-hold behavior + regression checks):
  - `docs/playback-invariants.md`
- Archived prior refactor program:
  - `docs/refactor/ARCHIVE_SUMMARY.md`

## Running locally

```bash
npm install
npm run dev
```

The development setup runs the Vite front-end (http://localhost:5173).

### Production build

```bash
npm run build
npm run preview
```

## Local automated verification

This repository supports a fully local test/verification workflow (no GitHub dependency required).

### Fast gate

```bash
npm run verify:fast
```

Runs:
- app typecheck (`src/`)
- targeted test typecheck (`tests/frontend`, `tests/visual`, `tests/perf`, dataset fixture helper tests)
- full test suite with coverage thresholds (lines: 80, branches: 70, functions: 80) for critical modules
- production build

### UI gate

```bash
npm run verify:ui
```

Runs:
- frontend component tests
- structural visual snapshot tests
- Playwright browser smoke tests (Chromium)
- Playwright screenshot regression tests (Chromium)

### Full gate

```bash
npm run verify:full
```

Runs fast + UI gates, plus performance budget tests.

### Snapshot workflow

If visual snapshots change intentionally:

```bash
npm run test:visual:update
```

Then validate:

```bash
npm run test:visual
```

### Playwright workflow

Playwright runtime values are defined in:

```text
.env.playwright
```

`playwright.config.ts` reads this file directly and requires all keys to be present.

Install browser binaries once:

```bash
npx playwright install chromium
```

Run browser smoke coverage:

```bash
npm run test:e2e
```

Run nightly-only browser scenarios (multi-channel + segmentation):

```bash
npm run test:e2e:nightly
```

Run browser screenshot regression:

```bash
npm run test:e2e:visual
```

If browser screenshots intentionally change:

```bash
npm run test:e2e:visual:update
```

### Local dataset fixture

Dataset-backed local fixture tests use `TEST_DATA_DIR` when set. If it is unset, fixture-only tests are skipped.

Example:

```bash
TEST_DATA_DIR=data/test_dataset_0 npm test
```

### Local nightly run

```bash
npm run verify:nightly
```

This calls `scripts/local-nightly.sh`, runs `verify:full`, then runs `test:e2e:nightly` (nightly-only browser scenarios), and is suitable for local cron scheduling.
