# Sparse Segmentation Hard Cutover

Status: **Complete**
Created: **2026-04-25**

This folder is the source of truth for replacing dense segmentation channels with a sparse voxel-brick segmentation system.

The implementation is a hard cutover for segmentation data. There is no dense segmentation fallback, no geometry or mesh conversion, and no WebGPU dependency for this program. The renderer must stay on the current WebGL2 + Three.js stack, while keeping the storage and provider contracts clean enough for a future WebGPU backend.

## Objective

Replace the current dense segmentation pipeline with an end-to-end sparse categorical voxel field pipeline that exploits the expected high sparsity of nonzero labels.

The target behavior:

- Intensity channels continue to use the current dense volume pipeline.
- New segmentation preprocessing writes sparse voxel bricks, not dense `uint16` zarr volumes.
- New segmentation loading returns sparse segmentation handles, not dense label arrays.
- New segmentation rendering uses WebGL2 sparse brick traversal and never uploads a full dense label texture.
- Old preprocessed datasets without segmentation remain loadable.
- Old preprocessed datasets with any legacy dense segmentation layer fail during loading with a clear error.

## Non-negotiable constraints

- No backward compatibility for legacy dense segmentation datasets.
- No fallback that expands sparse segmentation into a full dense global volume.
- No meshes, marching cubes, point splats, instanced cubes, or other geometry conversion for segmentation rendering.
- No preliminary storage-only or viewer-only shortcut.
- No WebGPU requirement for this implementation.
- The implementation must be complete across preprocessing, storage, schema, provider, viewer resources, slice rendering, 3D rendering, hover, tests, and benchmarks.

## Why this exists

Current segmentation channels are dense at the important boundaries:

- preprocessing writes dense label volumes
- manifests describe segmentation as dense `uint16` zarr data
- loading creates dense `Uint16Array` label volumes
- GPU upload packs every voxel into texture data
- 3D rendering still reasons from dense label sampling, even with skip hierarchy help

For sparse segmentations where nonzero labels are often below 1 percent of voxels, this wastes disk, memory, upload bandwidth, and shader work.

The new system treats segmentation as a sparse categorical field. Empty space is absent from storage, absent from CPU resident payloads, absent from GPU brick payloads, and skipped explicitly during ray traversal.

## Read order

1. `DECISIONS.md`
2. `CURRENT_STATE.md`
3. `IMPLEMENTATION_SPEC.md`
4. `SCHEMA_SPARSE_SEGMENTATION.md`
5. `BINARY_LAYOUT.md`
6. `STORAGE_FORMAT.md`
7. `SPARSE_ALGORITHMS.md`
8. `WEBGL2_RENDERING.md`
9. `WEBGL2_DATA_LAYOUT.md`
10. `MIGRATION_MAP.md`
11. `ROADMAP.md`
12. `BACKLOG.md`
13. `TEST_PLAN.md`
14. `BENCHMARK_MATRIX.md`
15. `CUTOVER_CHECKLIST.md`
16. `RISK_REGISTER.md`
17. `EXECUTION_LOG.md`
18. `SESSION_HANDOFF.md`
19. `SESSION_PROMPT.md`

## Agent workflow

Before coding:

1. Read this folder in the read order above.
2. Inspect current segmentation touchpoints listed in `CURRENT_STATE.md`.
3. Claim one focused `BACKLOG.md` item by marking it `IN_PROGRESS`.
4. Add a dated note to `SESSION_HANDOFF.md` describing the selected item.

While coding:

- Keep the implementation hard-cutover.
- Do not introduce dense segmentation fallback paths.
- Do not preserve old dense segmentation behavior behind feature flags.
- Keep intensity-only legacy dataset loading working.
- Prefer new segmentation-specific modules over adding more boolean branches to dense volume modules.
- Update tests and docs in the same change as behavior.

Before stopping:

- Mark completed backlog items `DONE` only with concrete evidence.
- Leave unfinished items as `PENDING` or `IN_PROGRESS`.
- Append implementation evidence to `EXECUTION_LOG.md`.
- Update `SESSION_HANDOFF.md` with exact next steps and known blockers.

## Definition of done

This program is done only when:

- new preprocessing writes sparse segmentation datasets end to end
- manifest validation rejects legacy dense segmentation datasets
- intensity-only legacy datasets still load
- sparse segmentation slice mode is correct
- sparse segmentation 3D mode is correct
- sparse segmentation hover reports exact labels
- WebGL2 renderer never requires a dense global segmentation texture
- dense segmentation code paths are deleted or made unreachable by schema
- tests in `TEST_PLAN.md` pass
- performance benchmarks in `BENCHMARK_MATRIX.md` show expected storage, memory, and rendering behavior
