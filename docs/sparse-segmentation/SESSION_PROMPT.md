# Session Prompt

Use this prompt only if follow-up work is needed on the sparse segmentation GPU atlas refactor.

```text
We are implementing the sparse segmentation GPU atlas refactor documented in
docs/sparse-segmentation/GPU_ATLAS_REFACTOR.md.

Hard requirements:
- Preserve sparse voxel bricks as the canonical segmentation representation.
- Do not convert segmentation to meshes, surfaces, splats, point clouds, or instanced geometry.
- Keep the renderer on WebGL2 for this implementation.
- Do not add dense global segmentation fallback paths.
- Do not add blank fallback rendering for valid sparse data.
- Do not silently downgrade segmentation scale to avoid resource limits.
- Do not present partial segmentation batches as complete frames.
- Scale 0 sparse segmentation must use a limit-safe packed atlas when full residency fits.
- When full residency does not fit, implement exact batched rendering.
- Keep intensity rendering working.
- Remove or isolate legacy dense preprocessed segmentation runtime paths after the sparse render paths are complete.

Before coding:
1. Read docs/sparse-segmentation/README.md.
2. Read docs/sparse-segmentation/GPU_ATLAS_REFACTOR.md completely.
3. Inspect src/core/volumeProvider.ts, src/components/viewers/volume-viewer/useVolumeResources.ts, gpuBrickResidency.ts, gpuBrickResidencyPacking.ts, and src/shaders/volumeRenderShader.ts.
4. Run baseline verification or record why it could not be run.

While working:
- Use apply_patch for manual edits.
- Keep intensity dense paths working.
- Keep segmentation sparse paths explicit.
- Do not treat missing occupied bricks as empty.
- Do not weaken tests to hide sparse segmentation renderer failures.
- Update SESSION_HANDOFF.md before stopping.
```
