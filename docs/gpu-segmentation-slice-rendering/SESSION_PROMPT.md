# Session Prompt

Use this prompt for a future implementation session.

You are implementing `docs/gpu-segmentation-slice-rendering/`.

Goal: make 2D Slice mode fast for regular and editable segmentation channels by replacing CPU atlas flattening with GPU atlas/page-table sampling in a slice shader.

Before coding:

1. Read:
   - `docs/gpu-segmentation-slice-rendering/README.md`
   - `docs/gpu-segmentation-slice-rendering/CURRENT_STATE.md`
   - `docs/gpu-segmentation-slice-rendering/DECISIONS.md`
   - `docs/gpu-segmentation-slice-rendering/IMPLEMENTATION_SPEC.md`
   - `docs/gpu-segmentation-slice-rendering/TEST_PLAN.md`
   - `docs/gpu-segmentation-slice-rendering/BACKLOG.md`
   - `docs/gpu-segmentation-slice-rendering/RISK_REGISTER.md`
2. Inspect:
   - `src/components/viewers/volume-viewer/useVolumeResources.ts`
   - `src/components/viewers/volume-viewer/rendering/renderingUtils.ts`
   - `src/shaders/sliceRenderShader.ts`
   - `src/shaders/volumeRenderShader.ts`
   - `src/hooks/annotation/useAnnotate.ts`
   - `src/shared/utils/annotation/editableSegmentationState.ts`
3. Start with `GSSR-010` and `GSSR-011`: add a source-mode resolver and tests.

Hard constraints:

- Do not change storage, preprocessing, export, annotation state, or 3D behavior.
- Do not expand sparse segmentation into a dense full-volume label texture.
- Do not require WebGPU.
- Keep CPU atlas slice preparation only as fallback/reference until GPU correctness is verified.
- Regular and editable segmentation must use the same GPU slice path once they expose `VolumeBrickAtlas`.

Definition of done for the full program:

- atlas-backed regular segmentation Slice mode avoids `prepareSliceTextureFromBrickAtlas(...)`
- atlas-backed editable segmentation Slice mode avoids `prepareSliceTextureFromBrickAtlas(...)`
- GPU output matches CPU reference
- z slice changes update uniforms rather than rebuilding CPU textures
- editable brush edits appear correctly in 2D
- targeted tests and `npm run verify:fast` pass when feasible

