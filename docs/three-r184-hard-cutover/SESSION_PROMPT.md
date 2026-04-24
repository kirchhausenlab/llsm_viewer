# Session Prompt

Use this prompt to resume implementation work on the Three.js r184 hard cutover.

```text
We are executing the Three.js r184 hard cutover documented in docs/three-r184-hard-cutover/.

Hard requirements:
- Upgrade to exact three@0.184.0 and @types/three@0.184.0.
- Preserve every existing webapp behavior.
- No backward compatibility with Three.js 0.161.0.
- No fallbacks, no old/new branches, no feature disablement.
- Fix r184 incompatibilities directly.
- VR remains in scope and requires verification.

Before coding:
1. Read docs/three-r184-hard-cutover/README.md.
2. Read DECISIONS.md, IMPLEMENTATION_SPEC.md, IMPLEMENTATION_NOTES.md, CUTOVER_CHECKLIST.md, TEST_PLAN.md, and BACKLOG.md.
3. Claim one focused backlog item by marking it IN_PROGRESS.
4. Run or record baseline verification if it has not been done.

While working:
- Use apply_patch for manual edits.
- Keep changes scoped.
- Do not weaken tests to hide regressions.
- Do not introduce fallbacks.
- Record command evidence in EXECUTION_LOG.md.
- Update SESSION_HANDOFF.md before stopping.
```
