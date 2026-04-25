# Session Prompt

Use this prompt to resume implementation work on the sparse segmentation hard cutover.

```text
We are implementing the sparse segmentation hard cutover documented in docs/sparse-segmentation/.

Hard requirements:
- Segmentation becomes a sparse categorical voxel field.
- Use sparse voxel bricks as the canonical segmentation representation.
- Do not convert segmentation to meshes, surfaces, splats, point clouds, or instanced geometry.
- Keep the renderer on WebGL2 for this implementation.
- Do not add dense global segmentation fallback paths.
- Old/current preprocessed datasets with no segmentation layers must still load.
- Old/current preprocessed datasets with legacy dense segmentation layers must fail before viewer launch with a clear reprocess-required error.
- New preprocessing must write sparse segmentation data end to end.
- New 3D rendering must traverse sparse bricks and never require a full dense label texture.
- New slice and hover paths must query sparse data exactly.

Before coding:
1. Read docs/sparse-segmentation/README.md.
2. Read DECISIONS.md, CURRENT_STATE.md, IMPLEMENTATION_SPEC.md, SCHEMA_SPARSE_SEGMENTATION.md, BINARY_LAYOUT.md, STORAGE_FORMAT.md, SPARSE_ALGORITHMS.md, WEBGL2_RENDERING.md, WEBGL2_DATA_LAYOUT.md, MIGRATION_MAP.md, ROADMAP.md, BACKLOG.md, TEST_PLAN.md, BENCHMARK_MATRIX.md, and CUTOVER_CHECKLIST.md.
3. Claim one focused BACKLOG.md item by marking it IN_PROGRESS.
4. Run baseline verification or record why it could not be run.

While working:
- Use apply_patch for manual edits.
- Keep intensity dense paths working.
- Keep segmentation sparse paths explicit.
- Do not weaken tests to hide dense segmentation assumptions.
- Do not treat missing occupied bricks as empty.
- Update SESSION_HANDOFF.md before stopping.
```
