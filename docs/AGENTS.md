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
