# Session Prompt

Historical prompt used for the legacy dense preprocessed segmentation runtime cleanup after the sparse segmentation GPU atlas refactor. The cleanup itself is complete as of 2026-04-28; keep this prompt only as provenance for the finished pass.

```text
Implement the legacy dense preprocessed segmentation runtime cleanup documented in
docs/sparse-segmentation/LEGACY_DENSE_SEGMENTATION_CLEANUP.md.

The sparse segmentation hard cutover and GPU atlas refactor are already implemented.
Your job is cleanup only: delete or isolate the remaining code that lets preprocessed
segmentation behave as a dense global runtime volume.

Hard requirements:
- Do not change the sparse on-disk format.
- Do not require reprocessing already-sparse datasets.
- Do not add any dense global segmentation fallback.
- Do not convert segmentation to meshes, surfaces, splats, point clouds, or instanced geometry.
- Keep dense intensity rendering/loading working.
- Keep sparse segmentation full-resident packed rendering working.
- Keep sparse segmentation exact-batched rendering working.
- Keep editable segmentation working unless a change is explicitly preprocessing/runtime-only and does not affect editable state.
- Keep legacy dense segmentation manifest rejection.
- Keep intensity-only legacy manifest compatibility.
- Use apply_patch for manual edits.

Before coding:
1. Read docs/sparse-segmentation/README.md.
2. Read docs/sparse-segmentation/GPU_ATLAS_REFACTOR.md.
3. Read docs/sparse-segmentation/LEGACY_DENSE_SEGMENTATION_CLEANUP.md completely.
4. Run the inventory rg commands from Phase 1.
5. Run baseline verification or record why it was not run.

Implementation order:
1. Tighten the runtime volume type boundary.
2. Remove dense segmentation from provider loading.
3. Remove dense label texture upload/binding.
4. Remove dense CPU slice and hover sampling.
5. Remove dense regular segmentation export fallback.
6. Review schema guards and update tests.
7. Run focused tests, then verify:fast and shader smoke.

Do not stop after analysis. Implement the cleanup, update tests, update docs if behavior changes,
and leave SESSION_HANDOFF.md with exact verification results and any remaining risks.
```
