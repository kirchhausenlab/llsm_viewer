# Incremental Sparse Annotation Editing Spec

This document is a handoff spec for fixing the Annotate slowdown that appears after painting the first voxel.

It is a follow-up to [IMPLEMENTATION_SPEC.md](./IMPLEMENTATION_SPEC.md). The original Annotate overhaul spec already recommends sparse editable bricks. The dense edit and render path described below was the failure mode this change set fixes.

Status: implemented in the current workspace.

The intended reader is a fresh implementation agent with no prior conversation context.

## 1) Problem Summary

Current symptom:

- Open Annotate.
- Create or select an editable segmentation channel.
- Paint one voxel.
- The viewer becomes much slower immediately afterward.

There are two related causes:

1. The first paint creates dense editable state and triggers full-volume atlas rebuild work.
2. The first nonzero voxel enables an extra segmentation render layer, currently represented as a full-volume proxy. That layer remains active after the stroke, so the render loop keeps paying for an additional segmentation pass even when only one brick contains data.

The long-term fix is not throttling, hiding the layer, deferring all work to mouseup, disabling hover, or reducing annotation fidelity. The fix is to make editable annotations a sparse, dirty-brick data source end to end, then update only the CPU and GPU resources touched by a stroke while preserving the same visible and interactive behavior.

## 2) Original Hot Path

Line numbers are approximate and should be rechecked with `rg` after any surrounding edits.

### 2.1 Stroke Writes

`src/hooks/annotation/useAnnotate.ts`

- `applyStrokeAt` called `getOrCreateEditableTimepointLabels` during the first stroke for a timepoint.
- `getOrCreateEditableTimepointLabels` returned a dense `Uint32Array(width * height * depth)`.
- `applyStrokeAt` then wrote global flat indices and called `markChanged(channel, true)`.
- `endStroke` recorded a history entry and called `markChanged(channel, true)` again.
- `editableLayerBrickAtlases` was a `useMemo` keyed by `channels`, `currentTimepoint`, and `revision`; it called `buildEditableSegmentationBrickAtlas` for every editable channel.

Important current symbols:

- `beginStroke`
- `applyStrokeAt`
- `endStroke`
- `applyHistory`
- `editableLayerBrickAtlases`

### 2.2 Dense Editable State

`src/shared/utils/annotation/editableSegmentationState.ts`

The original state used:

```ts
timepointLabels: Map<number, Uint32Array>
```

The first edit for a timepoint allocated:

```ts
new Uint32Array(width * height * depth)
```

This was already expensive for large volumes, even before rendering.

Other original helpers scanned those dense arrays:

- `hasEditableLabelVoxels`
- `deleteEditableLabelInPlace`
- `getEditableChannelMaxLabel`
- `buildEditableSegmentationBrickAtlas`

### 2.3 Full-Volume Atlas Build

`buildEditableSegmentationBrickAtlas` originally:

- Reads the dense label array for the current timepoint.
- Iterates `z`, `y`, and `x` over the full volume.
- Builds a temporary `Map` of occupied bricks.
- Allocates fresh page-table arrays.
- Allocates a fresh packed atlas.
- Rebuilds skip hierarchy data.
- Returns a fresh `VolumeBrickAtlas` object and a fresh `VolumeBrickPageTable` object.

This means painting one voxel in a `512 x 512 x 128` volume scans 33,554,432 voxels to discover one occupied brick.

### 2.4 Layer Activation

`src/components/viewers/volume-viewer/layerRenderSource.ts`

`resolveLayerRenderSource` ignored an editable annotation layer until:

```ts
brickAtlas?.enabled && pageTable
```

An empty editable atlas was disabled. After the first nonzero voxel, the atlas became enabled, so the viewer started rendering the editable segmentation layer.

This explains the sharp transition: before the first voxel, the annotation layer is effectively absent from rendering; after the first voxel, it is a normal visible segmentation layer.

### 2.5 Resource Churn

`src/components/viewers/volume-viewer/useVolumeResources.ts`

The resource path used object identity to decide whether page-table metadata, skip hierarchy, and atlas textures could be reused.

Current reuse checks include comparisons like:

- `resource.brickMetadataSourcePageTable === resolvedPageTable`
- `resource.skipHierarchySourcePageTable === resolvedPageTable`
- `resource.brickAtlasSourcePageTable === resolvedPageTable`
- `resource.brickAtlasSourceToken === atlasSourceToken`

Because the editable atlas builder returned fresh objects, every revision could invalidate resource caches even when only one voxel changed.

### 2.6 Persistent Render Cost

`src/components/viewers/volume-viewer/useVolumeResources.ts`

The 3D path built a proxy geometry from the layer dimensions or background-mask visible box. Editable annotation layers had full-resolution dimensions and no annotation-specific occupied bounds, so one painted voxel could produce an additional full-volume box.

`src/shaders/volumeRenderShader.ts`

Segmentation layers use `cast_segmentation`. Skip hierarchy helps, but this was still an extra segmentation ray-march pass every frame once the layer was visible.

`src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`

The renderer uses `setAnimationLoop`, so the cost was persistent while the viewer was active.

### 2.7 Hover Cost

`src/shared/utils/annotation/editableSegmentationState.ts`

Editable viewer layers were created with:

```ts
isHoverTarget: true
```

`src/components/viewers/volume-viewer/useVolumeHover.ts`

Hover can sample segmentation brick atlases to display label values. With additive blending as the default viewer mode, hover display can sample multiple visible hoverable layers. The annotation layer should continue to support hover, but it must not require full atlas rebuilds or dense state.

### 2.8 Save, Export, and Source Copy

`src/components/viewers/ViewerShell.tsx`

Regular segmentation source copy originally materialized each timepoint into dense label arrays before remapping labels.

`src/shared/utils/preprocessedDataset/editableSegmentation/sparseWriter.ts`

`collectVoxelsForTimepoint` originally read `channel.timepointLabels` and scanned every voxel in the dense array before writing sparse output.

Those paths had to be migrated before dense `timepointLabels` could stop being the authoritative editable state.

## 3) Empirical Evidence

A local one-off benchmark of the original atlas-building behavior showed:

Empty atlas:

- `128 x 128 x 64`: build about `0.44 ms`, enabled `false`, brick count `32`
- `256 x 256 x 128`: build about `0.06 ms`, enabled `false`, brick count `256`
- `512 x 512 x 128`: build about `0.07 ms`, enabled `false`, brick count `1,024`

One labeled voxel:

- `128 x 128 x 64`: `1,048,576` voxels scanned, build about `8.3 ms`, occupied bricks `1`, atlas bytes `131,072`
- `256 x 256 x 128`: `8,388,608` voxels scanned, build about `22.3 ms`, occupied bricks `1`, atlas bytes `131,072`
- `512 x 512 x 128`: `33,554,432` voxels scanned, build about `92.2 ms`, occupied bricks `1`, atlas bytes `131,072`

Interpretation:

- The atlas data for one occupied brick is small.
- The expensive part is dense allocation, full-volume scanning, fresh metadata construction, resource invalidation, and then the persistent render cost of activating a full-volume segmentation layer.
- The fixed path must scale with touched voxels and dirty bricks, not total volume voxels.

## 4) Non-Negotiable Behavior Invariants

The implementation must not change user-visible Annotate behavior.

Preserve:

- Brush and eraser semantics.
- 2D and 3D brush footprints.
- Radius behavior.
- Active label ID behavior.
- Label `0` as transparent background.
- Eraser behavior: erase only voxels currently matching the active label.
- Live feedback during a stroke.
- Undo and redo behavior.
- Label add, delete, rename, and clear behavior.
- Label delete compaction across all timepoints.
- Channel dirty state and saved revision semantics.
- Show/hide overlay behavior.
- Editable channel top-menu tabs.
- Channel creation from `Empty`.
- Channel creation by copying regular segmentation channels.
- Channel creation by copying editable segmentation channels.
- Public HTTP dataset behavior.
- Save behavior for writable preprocessed datasets.
- Export behavior for editable and regular channels.
- Hover label reporting for visible editable annotation layers.
- Existing layer coordinate mapping and offsets.

Live feedback is required. A solution that only rebuilds on `mouseup` is not sufficient as the final design.

## 5) Goals

The fix must:

- Make editable annotation storage sparse by timepoint and brick.
- Avoid dense `Uint32Array(width * height * depth)` allocation on first edit.
- Avoid full-volume scans during painting.
- Track dirty bricks precisely.
- Rebuild only touched brick atlas bytes and affected page-table metadata.
- Keep render payloads stable enough that mesh, material, and unchanged textures are reused.
- Update GPU resources incrementally or with bounded uploads.
- Preserve save/export output exactly.
- Preserve hover and visible overlay behavior.
- Add tests and benchmarks that fail if one-voxel edits scale with total volume size.

## 6) Non-Goals

Do not:

- Change the Annotate UI contract.
- Hide or disable the overlay after edits.
- Disable hover to improve performance.
- Reduce annotation resolution.
- Change label ID assignment or compaction rules.
- Change file format semantics.
- Rewrite unrelated viewer rendering paths.
- Introduce a temporary dense fallback as the only large-dataset implementation.

## 7) Target Architecture

Editable annotations should become sparse mutable segmentation sources.

The authoritative state should change from:

```ts
timepointLabels: Map<number, Uint32Array>
```

to a sparse per-timepoint state:

```ts
type EditableSegmentationTimepointState = {
  brickSize: [number, number, number];
  bricks: Map<string, EditableSegmentationBrick>;
  pageTable: MutableEditablePageTable;
  atlas: EditableSegmentationAtlasState;
  revision: number;
  dirtyBrickKeys: Set<string>;
  deletedBrickKeys: Set<string>;
  hierarchyDirty: boolean;
};

type EditableSegmentationBrick = {
  coord: { z: number; y: number; x: number };
  labels: Uint32Array;
  nonzeroCount: number;
  minLabel: number;
  maxLabel: number;
  revision: number;
  dirty: boolean;
};
```

Suggested channel shape:

```ts
type EditableSegmentationChannel = {
  // existing channel metadata remains
  timepoints: Map<number, EditableSegmentationTimepointState>;
};
```

These type names are suggestions. Match local naming conventions when implementing.

### 7.1 Brick Size

Use the same brick size convention already used for annotation atlases:

```ts
DEFAULT_ANNOTATION_BRICK_SIZE
```

As of this spec, the editable render path uses `32 x 32 x 32` bricks. A full local brick label array costs:

```txt
32 * 32 * 32 * 4 bytes = 131,072 bytes
```

This is acceptable for touched bricks and avoids slow per-voxel map writes inside brush strokes.

### 7.2 Brick Keys

Use deterministic brick coordinate keys. The current code already has local helpers for coordinate keys in `editableSegmentationState.ts`. Keep ordering deterministic for rendering, saving, and tests.

Recommended key format:

```txt
z:y:x
```

### 7.3 Dense Materialization

Dense materialization may remain as an explicit helper for bounded compatibility cases, tests, or export encoders that require a full plane/stack. It must not be the authoritative in-memory edit model and must not run implicitly on first paint.

Name such helpers clearly, for example:

```ts
materializeEditableTimepointLabels(...)
```

Call sites should make the cost obvious.

## 8) Editing Algorithm

### 8.1 Begin Stroke

At stroke start:

- Resolve the active channel and current timepoint.
- Capture mode, radius, brush mode, and active label ID.
- Initialize a stroke-local touched map.
- Initialize a stroke-local visited center set.
- Do not allocate a dense timepoint array.

Stroke-local touched data should be keyed by global voxel index or by brick/local offset. Grouping by brick is preferred because undo/redo and dirty marking will operate by brick.

### 8.2 Apply Stroke

For each pointer sample:

1. Clamp center voxel coordinates.
2. Skip duplicate centers using the existing visited-center behavior.
3. Compute brush offsets with the existing brush footprint logic.
4. For each in-bounds voxel:
   - Compute brick coordinate.
   - Compute local voxel offset inside the brick.
   - Resolve the existing brick, if any.
   - Read previous label, defaulting to `0` when the brick is absent.
   - If erasing and previous label does not equal the active label, skip.
   - If previous label equals next label, skip.
   - Record previous label in the stroke history map only once.
   - Create the brick only if the next label is nonzero or if an existing brick must be modified.
   - Write the local label.
   - Update `nonzeroCount`, `minLabel`, and `maxLabel`.
   - Mark the brick dirty.
5. Mark the timepoint dirty.
6. Mark the channel dirty.
7. Schedule a render update.

Important: render update means "dirty bricks changed", not "rebuild every atlas from every voxel".

### 8.3 End Stroke

At stroke end:

- If no voxels changed, do nothing.
- Build a compact history entry from recorded deltas.
- Keep existing undo/redo semantics.
- Clear the stroke state.

The dirty bricks should already have been made visible during the stroke. `endStroke` should not be the only place where render state is updated.

### 8.4 Undo and Redo

History entries should be representable as per-voxel deltas grouped by brick:

```ts
type EditableStrokeHistoryEntry = {
  kind: 'stroke';
  channelId: string;
  timepoint: number;
  bricks: Array<{
    key: string;
    indices: Uint32Array;
    before: Uint32Array;
    after: Uint32Array;
  }>;
};
```

Undo and redo should:

- Resolve or create affected bricks only when needed.
- Apply local offsets.
- Recompute each changed brick's `nonzeroCount`, `minLabel`, and `maxLabel`.
- Delete bricks that become empty.
- Mark only affected bricks and ancestors dirty.
- Preserve existing UI update behavior.

Snapshot history for label operations must not clone dense timepoint arrays. If snapshot entries remain temporarily, they must clone sparse timepoint maps and brick arrays only.

### 8.5 Label Delete and Compaction

Current label delete scans every dense timepoint array. The sparse version should:

- Iterate only existing nonempty bricks across all timepoints.
- Set deleted label IDs to `0`.
- Decrement labels greater than the deleted label ID.
- Recompute brick stats.
- Drop bricks that become empty.
- Mark changed bricks dirty.
- Preserve label list and active label index behavior.

### 8.6 Clear

Clear should:

- Drop all sparse timepoint states or clear their brick maps.
- Reset page-table metadata to empty.
- Reset atlas occupancy.
- Reset labels to one empty label row.
- Preserve current clear confirmation and dirty-state behavior.

## 9) Atlas and Page-Table Strategy

Each editable timepoint should maintain mutable render metadata:

- `brickAtlasIndices`
- `chunkMin`
- `chunkMax`
- `chunkOccupancy`
- `leafOccupancy`
- `skipHierarchy`
- optional subcell metadata, if needed by the active render path
- atlas slot allocation

### 9.1 Empty State

An empty editable timepoint should still have valid metadata, but its render payload may remain disabled:

```ts
enabled: false
occupiedBrickCount: 0
```

This preserves current behavior where empty annotation layers do not render.

### 9.2 First Voxel

When the first voxel is painted:

- Create one brick.
- Allocate one atlas slot.
- Update one page-table entry.
- Update only the ancestors of that brick in the skip hierarchy.
- Upload or mark dirty only the affected atlas region and metadata region.
- Enable the render payload.

It must not scan the full volume.

### 9.3 Occupied Brick Update

When an already occupied brick changes:

- Rewrite only that brick's atlas bytes.
- Recompute that brick's min/max/occupancy.
- Update the page-table entry for that brick.
- Update affected skip-hierarchy ancestors.

### 9.4 Empty to Occupied

When a brick transitions from empty to occupied:

- Allocate an atlas slot.
- Set `brickAtlasIndices[pageIndex]` to the slot.
- Set chunk min/max/occupancy.
- Increment occupied brick count.
- Mark metadata and atlas slot dirty.

### 9.5 Occupied to Empty

When a brick transitions from occupied to empty:

- Remove it from the sparse brick map.
- Set `brickAtlasIndices[pageIndex]` to `-1`.
- Set chunk min/max/occupancy to empty values.
- Decrement occupied brick count.
- Mark the old atlas slot reusable.
- Mark metadata and skip hierarchy dirty.

A free list is preferred. Full atlas compaction should happen only at safe points and must preserve visual output.

### 9.6 Atlas Slot Management

Use one of these strategies:

1. Free-list slots and reuse them.
2. Append slots and compact only after a stroke, save, or explicit maintenance step.

Do not compact on every voxel if compaction would force full atlas rewrites.

If slot compaction is implemented, update all affected `brickAtlasIndices` atomically before exposing the payload to rendering.

### 9.7 Skip Hierarchy

Do not rebuild the full skip hierarchy for every stroke.

Maintain hierarchy levels and update only ancestors of changed leaf bricks:

1. Convert dirty leaf page indices to level-0 dirty nodes.
2. Recompute each dirty node from its children.
3. Promote parent coordinates to the next level.
4. Repeat until root.

Add an oracle test that compares incremental hierarchy results to a full rebuild for randomized edit sequences.

## 10) GPU and Resource Integration

The render-resource path currently uses object identity for reuse. A robust implementation needs explicit mutation signals.

### 10.1 Stable Payloads

Prefer stable `VolumeBrickAtlas` and `VolumeBrickPageTable` wrapper objects per editable channel/timepoint.

Add explicit revision signals rather than relying only on object identity:

```ts
type EditableRenderRevision = {
  pageTableRevision: number;
  atlasRevision: number;
  metadataRevision: number;
  hierarchyRevision: number;
  dirtyAtlasSlots: number[];
  dirtyPageIndices: number[];
};
```

The actual shape can differ, but `useVolumeResources` must be able to tell the difference between:

- same object and no data changes
- same object with changed atlas bytes
- same object with changed metadata
- same object with changed skip hierarchy
- full replacement

### 10.2 Avoid Mesh and Material Recreation

Painting one voxel must not recreate the volume mesh or shader material for the annotation layer.

The resource path should update:

- atlas data texture
- atlas index texture
- min/max/occupancy textures
- skip hierarchy texture or dirty regions
- uniforms that depend on atlas size or occupancy

It should not recreate geometry/material unless dimensions, render style, projection-relevant source mode, or texture shape actually changed.

### 10.3 Texture Upload Strategy

Three.js `Data3DTexture` exposes full texture updates easily, but sub-region updates may require renderer-level WebGL calls.

Acceptable migration stages:

1. First eliminate dense volume allocation and full-volume scans.
2. Keep full atlas texture upload temporarily if the uploaded data is bounded by occupied bricks, not total volume.
3. Add an internal subimage upload helper for dirty atlas slots and metadata textures.

The long-term target is dirty-region upload:

- atlas brick slot subimage for changed bricks
- atlas-index metadata for changed page entries
- min/max/occupancy metadata for changed page entries
- skip hierarchy regions for changed ancestors

If full texture upload remains after the first migration, document it as an intermediate limitation and add benchmark coverage so it does not regress back to full-volume behavior.

### 10.4 Object Identity and Revisions

If stable objects are used, existing identity checks in `useVolumeResources` will otherwise suppress required updates. Add revision-aware checks wherever resources currently compare:

- `brickMetadataSourcePageTable`
- `skipHierarchySourcePageTable`
- `brickAtlasSourcePageTable`
- `brickAtlasSourceToken`

If fresh objects are used, resource churn can remain high. Stable objects plus revision signals are the preferred long-term design.

## 11) Persistent Render-Pass Optimization

After the first voxel, the annotation layer is visible and participates in every render frame. Even after CPU-side sparse updates are fixed, a single occupied brick should not require a full-volume segmentation proxy if that remains a measurable frame-time cost.

Implement this only after the sparse edit path is in place and measured.

Allowed strategies, in order of preference:

1. Occupied-bounds proxy for editable segmentation layers.
2. Per-brick or per-brick-bounds proxy geometry.
3. A dedicated editable segmentation draw path that renders only occupied bricks.

Requirements:

- Output must be visually equivalent to the full-volume transparent segmentation layer.
- Coordinate mapping must remain identical.
- Hover must still report labels at the same voxel positions.
- Layer offsets and transforms must be preserved.
- Additive and alpha blending must be tested.
- Empty space must remain transparent.

An occupied-bounds proxy is likely sufficient for sparse annotations with localized edits. Per-brick geometry may be needed if annotations are extremely sparse and far apart.

Do not implement render culling by hiding annotation data outside the current camera view or by changing label sampling semantics.

## 12) Source Copy and Import

### 12.1 Empty Source

Creating from `Empty` should allocate no bricks until painting begins.

### 12.2 Editable Source Copy

Copying an editable segmentation channel should:

- Preserve label names.
- Preserve label IDs.
- Copy sparse timepoint state.
- Prefer copy-on-write brick arrays so copying large channels is cheap.
- Ensure subsequent edits to either channel are independent.

### 12.3 Regular Segmentation Source Copy

Current code materializes dense labels for every timepoint. Replace that with sparse iteration where possible.

The copy path should:

- Iterate source sparse bricks.
- Gather unique nonzero source labels.
- Build deterministic source-label to editable-label remap.
- Write remapped labels into editable sparse bricks.
- Avoid materializing full dense timepoints.

If current provider APIs do not expose sparse iteration cleanly, add a helper at the provider or sparse-segmentation utility layer rather than forcing dense materialization in `ViewerShell.tsx`.

## 13) Save and Export

### 13.1 Save

`writeEditableSegmentationChannel` should iterate sparse editable bricks directly.

Replace dense scanning in `collectVoxelsForTimepoint` with sparse brick iteration:

- For each timepoint state.
- For each occupied brick.
- For each nonzero local label.
- Convert local brick coordinates to global voxel coordinates.
- Update label stats.
- Append to sparse writer.

Preserve all existing save transaction rules from the original Annotate implementation spec:

- revisioned paths
- no in-place overwrite of live sparse files
- manifest update last
- clean dirty state only after successful save and runtime refresh

### 13.2 Export

Export may materialize output planes or stacks as required by TIFF encoding, but materialization should be explicit and scoped:

- Single timepoint export can materialize one stack for that timepoint.
- Multi-timepoint export should materialize one timepoint at a time.
- Do not keep all timepoints densely in memory when avoidable.

Export output must match the current label volume exactly.

## 14) Hover

Editable annotation layers should remain hover targets unless a product decision says otherwise.

The sparse implementation must ensure:

- Hover sampling can read current annotation labels.
- Hover sees live stroke updates.
- Additive blending hover display still handles multiple visible layers.
- Missing bricks sample as label `0`.
- Deleted labels and compacted labels are reflected immediately.

Hover must not trigger dense materialization or full atlas rebuilds.

## 15) Compatibility During Migration

A safe migration can keep compatibility shims temporarily:

- Keep `timepointLabels` only as a deprecated, explicit materialization cache.
- Add sparse state as the authoritative edit source.
- Convert existing dense tests to sparse expectations incrementally.
- Make dense access helpers throw or log in development when called from paint hot paths.

Do not leave two authoritative states that can diverge.

Recommended transition:

1. Add sparse state and helpers.
2. Make paint write sparse state.
3. Make render atlas read sparse state.
4. Make save/export read sparse state.
5. Remove or quarantine dense state.

## 16) Migration Plan

### Phase 0: Guardrails and Baselines

- Add a benchmark or performance test that paints one voxel in a large logical volume.
- Assert the operation does not scan every voxel.
- Add a test that `buildEditableSegmentationBrickAtlas` or its replacement is not called as a full rebuild on every paint.
- Capture current brush behavior in tests before changing data structures.

### Phase 1: Sparse Data Structures

- Add sparse editable timepoint state.
- Add brick coordinate helpers.
- Add local offset helpers.
- Add brick stats helpers.
- Add sparse iteration helpers.
- Keep dense materialization as an explicit compatibility helper only.

### Phase 2: Sparse Painting and History

- Change `applyStrokeAt` to write sparse bricks.
- Change `endStroke` to store sparse grouped deltas.
- Change undo/redo to mutate sparse bricks.
- Change label delete, max-label detection, clear, and label-voxel checks to iterate sparse bricks.

### Phase 3: Incremental Atlas Metadata

- Replace full `buildEditableSegmentationBrickAtlas` rebuilds with persistent per-timepoint atlas state.
- Track dirty bricks and deleted bricks.
- Update only changed page-table entries.
- Update only affected skip-hierarchy ancestors.
- Keep an oracle full rebuild helper for tests only.

### Phase 4: Resource Reuse and Uploads

- Add revision-aware resource checks in `useVolumeResources`.
- Reuse mesh and material across edits.
- Reuse page-table and atlas wrapper objects where safe.
- Upload dirty atlas and metadata regions.
- If subimage upload is delayed, ensure full uploads are bounded by occupied atlas size and covered by benchmarks.

### Phase 5: Save, Export, and Source Copy

- Change sparse writer to iterate sparse editable bricks.
- Change export to use sparse iteration and explicit per-timepoint materialization.
- Change regular segmentation copy to avoid dense all-timepoint materialization.
- Change editable copy to sparse copy-on-write or sparse clone.

### Phase 6: Remove Dense Authoritative Path

- Remove `timepointLabels` from the authoritative channel type.
- Update tests and call sites.
- Keep only explicit materialization helpers where truly needed.

### Phase 7: Persistent Render Optimization

- Measure frame time after phases 1 through 6.
- If one occupied brick still slows the viewer, add occupied-bounds or per-brick proxy rendering for editable segmentation layers.
- Prove visual and hover equivalence with tests.

## 17) Test Plan

### 17.1 Brush Behavior

Tests should verify:

- 2D brush footprint is unchanged.
- 3D brush footprint is unchanged.
- Radius handling is unchanged.
- Boundary clamping is unchanged.
- Duplicate center suppression is unchanged.
- Brush mode writes active label ID.
- Eraser mode removes only the active label.

### 17.2 Sparse State

Tests should verify:

- Empty channel has no bricks.
- First voxel creates exactly one brick.
- Painting multiple voxels in one brick does not create duplicate bricks.
- Painting across a brick boundary creates the expected bricks.
- Erasing the final nonzero voxel deletes or empties the brick.
- Label delete scans only existing bricks.
- Label compaction preserves expected labels.
- Clear removes all bricks.
- Multi-timepoint edits remain isolated.

### 17.3 History

Tests should verify:

- Stroke history records previous values only once per voxel.
- Undo restores previous labels.
- Redo restores painted labels.
- Undo of a stroke that created a brick removes the brick if it becomes empty.
- Redo recreates the brick.
- Undo/redo marks only affected bricks dirty.

### 17.4 Atlas and Page Table

Tests should verify:

- Empty timepoint is disabled.
- First nonzero voxel enables the atlas.
- One nonzero voxel creates one occupied page-table entry.
- Brick atlas bytes encode `uint32` labels correctly.
- Incremental metadata matches a full rebuild oracle.
- Incremental skip hierarchy matches a full rebuild oracle.
- Emptying a brick clears `brickAtlasIndices`.
- Slot reuse does not corrupt labels.

### 17.5 Resource Reuse

Tests should verify:

- Painting one voxel does not recreate the layer mesh.
- Painting one voxel does not recreate the shader material.
- Unchanged page-table and atlas objects are reused when intended.
- Revision changes trigger required texture updates.
- No update is suppressed because object identity stayed stable.

### 17.6 Hover

Tests should verify:

- Hover reads painted labels.
- Hover reads updates during a stroke.
- Hover reads label `0` for missing bricks.
- Additive blending hover display still includes editable annotation labels.
- Label delete and compaction are reflected in hover.

### 17.7 Save and Export

Tests should verify:

- Saved sparse output matches painted labels exactly.
- Exported TIFF labels match painted labels exactly.
- Multi-timepoint export includes sparse edits from each timepoint.
- Copying regular segmentation channels preserves voxel groups after remap.
- Copying editable channels preserves labels and names.
- Save does not require dense all-timepoint materialization.

### 17.8 Performance

Add tests or benchmarks that verify one-voxel edit cost scales with touched bricks.

Suggested benchmark assertions:

- First voxel in a large logical volume creates one brick and does not allocate `width * height * depth` labels.
- First voxel does not iterate over every global voxel.
- Subsequent strokes touching one brick update one dirty brick.
- A `512 x 512 x 128` one-voxel state update completes in time proportional to one brick, not 33,554,432 voxels.

Avoid fragile wall-clock-only tests in CI. Prefer operation counters, spies on full rebuild helpers, and allocation-size assertions. Wall-clock benchmarks can be local diagnostics.

## 18) Acceptance Criteria

The change is complete when:

- Annotate behavior is unchanged from the user's perspective.
- Painting the first voxel does not allocate a dense full-timepoint label array.
- Painting the first voxel does not scan the full volume.
- Painting during a stroke updates the visible overlay live.
- Repeated stroke samples update only touched bricks.
- Undo/redo, label delete, label compaction, clear, save, export, copy, and hover all work from sparse state.
- `useVolumeResources` reuses mesh/material and updates only necessary texture resources.
- Resource updates are revision-aware and cannot be skipped accidentally because object identity is stable.
- Existing tests pass.
- New sparse state, atlas, resource, hover, save/export, and performance tests pass.
- If persistent frame time remains high after sparse CPU/resource fixes, editable segmentation render culling is implemented with visual and hover equivalence tests.

## 19) Unacceptable Fixes

Do not solve this by:

- Rebuilding only on mouseup as the final implementation.
- Temporarily hiding the annotation layer while painting.
- Disabling annotation hover.
- Disabling additive hover display.
- Reducing annotation resolution.
- Dropping 3D brush mode.
- Capping large datasets to avoid the issue.
- Keeping dense full-timepoint arrays and only throttling rebuild frequency.
- Recreating the mesh/material on every edit.

These approaches either change functionality or leave the core scalability problem in place.

## 20) File Map for the Implementation Agent

Start with:

- `src/types/annotation.ts`
- `src/hooks/annotation/useAnnotate.ts`
- `src/shared/utils/annotation/editableSegmentationState.ts`
- `src/shared/utils/preprocessedDataset/editableSegmentation/sparseWriter.ts`
- `src/components/viewers/ViewerShell.tsx`
- `src/components/viewers/volume-viewer/layerRenderSource.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/useVolumeHover.ts`
- `src/shaders/volumeRenderShader.ts`

Likely tests to update or add near:

- `tests/AnnotateWindow.test.tsx`
- existing annotate hook/state tests, if present
- existing volume resource tests, if present
- sparse writer tests
- channel export tests
- pointer lifecycle tests

Use `rg "timepointLabels"` as the migration checklist. Every remaining use should be either removed or justified as explicit dense materialization.

## 21) Suggested Implementation Order

For the next agent, the safest order is:

1. Add tests around current brush semantics and sparse performance expectations.
2. Introduce sparse editable timepoint state without changing UI.
3. Switch painting and undo/redo to sparse bricks.
4. Add incremental atlas/page-table state with a full-rebuild oracle test.
5. Add revision-aware resource updates.
6. Switch save/export/source copy to sparse iteration.
7. Remove dense authoritative state.
8. Measure frame time and add occupied render bounds only if still needed.

Do not start in shader code. The first-order regression is in the editable data and resource lifecycle. Shader or proxy optimization should be driven by measurements after the sparse pipeline is in place.
