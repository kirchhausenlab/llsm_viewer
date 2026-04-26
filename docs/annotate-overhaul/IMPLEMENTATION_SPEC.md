# Annotate Overhaul Implementation Spec

This document is the complete implementation specification for replacing the current Paintbrush tool with an editable segmentation annotation workflow named `Annotate`.

The intended reader is a fresh implementation agent with no prior conversation context. All product decisions from the design discussion are recorded here.

## 1) Goals

The implementation must:

- Rename all user-facing and implementation-facing Paintbrush concepts to Annotate.
- Replace the current temporary RGBA painting overlay with editable segmentation channels.
- Let users create editable segmentation channels from an empty channel or by copying an existing segmentation channel.
- Let users paint label IDs into editable segmentation channels in 2D or 3D.
- Give editable segmentation channels normal top-menu channel tabs.
- Add a label manager inside the Annotate window.
- Persist editable segmentation channels into writable local preprocessed datasets.
- Disable Annotate entirely for public HTTP datasets.
- Add a separate `File > Export channel` workflow for exporting any channel to TIFF, with ZIP output for multi-timepoint exports.

## 2) Non-Goals

The implementation must not:

- Keep using RGBA colors as the authoritative annotation data model.
- Write annotation edits to disk during every stroke.
- Add label import/load to the Annotate label manager.
- Let public HTTP datasets use Annotate.
- Add new file formats beyond `.tif` export in this phase.
- Add BigTIFF support in this phase.
- Add editable label names to regular non-editable segmentation channels.

## 3) Current Architecture Summary

Current Paintbrush code is an overlay-only tool.

Important current files:

- `src/components/viewers/viewer-shell/PaintbrushWindow.tsx`
- `src/hooks/paintbrush/usePaintbrush.ts`
- `src/components/viewers/viewer-shell/hooks/useViewerPaintbrushIntegration.ts`
- `src/types/paintbrush.ts`
- `src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts`
- `src/components/viewers/VolumeViewer.types.ts`
- `src/shared/utils/tiffWriter.ts`
- `src/shared/utils/windowLayout.ts`
- `src/components/viewers/viewer-shell/TopMenu.tsx`
- `src/components/viewers/ViewerShell.tsx`
- `src/components/viewers/viewer-shell/NavigationHelpWindow.tsx`
- Paintbrush tests:
  - `tests/usePaintbrush.test.ts`
  - `tests/PaintbrushWindow.test.tsx`
  - references in `tests/runTests.ts`
  - references in viewer shell/top menu/layout tests

Current behavior:

- `usePaintbrush` owns an in-memory RGBA `Uint8Array`.
- The RGBA data is exposed as a synthetic intensity `NormalizedVolume`.
- `useViewerPaintbrushIntegration` appends that synthetic overlay layer with key `paintbrush-overlay`.
- Painting is triggered from pointer lifecycle when `paintbrush.enabled && event.ctrlKey`.
- `Save` exports an RGB TIFF stack using `encodeRgbTiffStack`.
- Paintbrush does not mutate dataset segmentation labels.
- Paintbrush window default placement is offset downward by `PAINTBRUSH_WINDOW_VERTICAL_OFFSET`; its recenter position already uses top-centered placement.

Current segmentation architecture:

- Preprocessed segmentation layers use sparse segmentation manifests and brick data.
- Runtime sparse segmentation rendering uses provider/brick atlas paths.
- Regular segmentation channels use deterministic label-ID colors.
- Label `0` is transparent/background.
- Segmentation layer data is conceptually `uint32` in the sparse manifest, though some dense legacy helpers use `uint16`.

Important segmentation files:

- `src/shared/utils/preprocessedDataset/types.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/sparseSegmentation/*`
- `src/core/volumeProvider.ts`
- `src/components/viewers/volume-viewer/useVolumeResources.ts`
- `src/components/viewers/volume-viewer/layerRenderSource.ts`
- `src/ui/app/hooks/useRouteLayerVolumes.ts`
- `src/ui/app/hooks/useLayerControls.ts`
- `src/hooks/dataset/useDatasetSetup.ts`

## 4) Product Decisions

### 4.1 Tool Name

The tool is named `Annotate`.

Every user-facing mention of `Paintbrush` must become `Annotate`.

Implementation-facing identifiers should also be renamed unless doing so would create high-risk churn. Preferred naming:

- `PaintbrushWindow` -> `AnnotateWindow`
- `usePaintbrush` -> `useAnnotate`
- `PaintbrushController` -> `AnnotateController`
- `PaintbrushMode` -> `AnnotateBrushMode`
- `PaintbrushStrokeHandlers` -> `AnnotationStrokeHandlers`
- `useViewerPaintbrushIntegration` -> `useViewerAnnotateIntegration`
- CSS class prefix `paintbrush-` -> `annotate-`
- Menu/action IDs such as `edit-paintbrush` -> `edit-annotate`

### 4.2 Public Dataset Behavior

Annotate is completely disabled for public datasets.

Public datasets are loaded via HTTP storage using `createHttpPreprocessedStorage`.

Required behavior:

- `Edit > Annotate` should be disabled or hidden for public HTTP datasets.
- If disabled rather than hidden, expose a clear title/tooltip such as `Annotate is unavailable for public datasets.`
- The Annotate window must not open for public HTTP datasets.
- Annotation state must not be created for public HTTP datasets.
- Pointer painting must not be enabled for public HTTP datasets.
- `File > Export channel` remains available for public datasets.

### 4.3 Editable Channel Creation

The Annotate window creates editable segmentation channels.

The first two rows of the Annotate window are the creation form:

Row 1:

- `New` button.
- Source dropdown to the right of `New`.
- Source dropdown options:
  - `Empty`
  - names of current existing segmentation channels
  - names of current existing editable segmentation channels, if any

Row 2:

- Text input for the new channel name.

Default source:

- `Empty`

When `New` is clicked:

- Create a new editable segmentation channel.
- Use the current channel name text input value.
- The channel appears as its own tab in the top channel tabs.
- The channel is selected/active after creation.
- The first two rows become locked for that created channel.
- Auto-create label `1` immediately.
- Label `1` starts with an empty label name.
- Painting can begin immediately after creation because label `1` exists.

Channel name validation:

- Channel names should follow existing channel uniqueness rules.
- If the entered name is empty, block creation and show a short message.
- If the name conflicts with an existing channel name, block creation and show a short message.
- Do not silently auto-suffix names.

### 4.4 Source Copy Semantics

If source is `Empty`:

- The editable channel starts with no painted voxels.
- It has exactly one label row:
  - ID `1`
  - empty name

If source is an existing regular segmentation channel:

- Copy all timepoints.
- Source labels are remapped into consecutive editable label IDs at creation time.
- Example: source labels `{7, 12, 99}` become editable labels `{1, 2, 3}`.
- Remapping should preserve voxel group identity but not original numeric label IDs.
- Label names are empty because regular segmentation channels do not carry editable label names.
- The newly created label list has one row per copied source label, in deterministic order sorted by source label ID ascending.

If source is an existing editable segmentation channel:

- Copy all timepoints.
- Label IDs are already consecutive.
- Preserve label names.
- The copied channel is independent from the source after creation.

Copy performance requirement:

- Prefer copy-on-write for large sparse channels.
- Do not eagerly materialize a full dense global volume if avoidable.
- It is acceptable to create editable override structures lazily per timepoint/brick.

### 4.5 Annotation Data Model

Editable annotation data is label IDs, not colors.

Required model:

```ts
type EditableSegmentationChannel = {
  channelId: string;
  layerKey: string;
  name: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  volumeCount: number;
  labels: EditableSegmentationLabel[];
  activeLabelIndex: number;
  mode: '2d' | '3d';
  brushMode: 'brush' | 'eraser';
  radius: number;
  overlayVisible: boolean;
  enabled: boolean;
  dirty: boolean;
  revision: number;
  createdFrom:
    | { kind: 'empty' }
    | { kind: 'copy'; sourceChannelId: string; sourceLayerKey: string; sourceWasEditable: boolean };
  editsByTimepoint: Map<number, EditableSegmentationTimepointEdits>;
};

type EditableSegmentationLabel = {
  name: string;
};
```

`activeLabelIndex` is zero-based internally. The user-facing `label_id` is `activeLabelIndex + 1`.

Label `0` is always background and is never listed in the label manager.

Recommended edit representation:

```ts
type EditableSegmentationTimepointEdits = {
  brickSize: [number, number, number];
  bricks: Map<string, EditableSegmentationBrick>;
};

type EditableSegmentationBrick = {
  labels: Uint32Array;
  dirty: boolean;
};
```

Alternative sparse per-voxel maps are allowed if performance is good, but the implementation must support:

- fast brush writes
- undo/redo
- per-label delete and compaction
- rendering updated data
- save into sparse segmentation storage
- export to TIFF

### 4.6 Label Manager

The label manager appears below a horizontal delimiter line in the Annotate window.

Layout:

- Left: list of current labels.
- Right: buttons.

Buttons, in order:

- `Add`
- `Delete`
- `Rename`
- `Save`
- `Clear`

There are no `Update` or `Load` buttons.

List item display:

```text
label_id - label_name
```

Examples:

```text
1 - nucleus
2 -
3 - membrane
```

Rules:

- `label_id` is defined by list order, starting from `1`.
- Label IDs are always consecutive.
- No gaps are allowed.
- `label_name` can be empty.
- `Rename` changes only `label_name`.
- `Rename` never changes `label_id`.
- The selected label is the active brush label.
- Painting in brush mode writes the selected label ID.
- Painting in eraser mode writes `0`.

Button behavior:

- `Add` appends a new label at the end with an empty name and selects it.
- `Delete` deletes the selected label using the confirmation rules below.
- `Rename` prompts or otherwise edits the selected label name. Empty name is valid.
- `Save` persists the current editable segmentation channel to the writable dataset.
- `Clear` clears the entire editable channel after a confirmation window.

Delete behavior:

- If the selected label has any voxels in any timepoint, confirmation is required before deletion.
- If the selected label has no voxels, deletion can proceed without confirmation.
- If labels are `[1, 2, 3, 4, 5]` and label `3` is deleted:
  - all voxels with value `3` become `0`
  - all voxels with value `4` become `3`
  - all voxels with value `5` become `4`
  - label names for old `4` and `5` move with their rows
  - final labels are `[1, 2, 3, 4]`
- Delete applies across all timepoints in that editable channel.

Clear behavior:

- Confirmation is required.
- Clear removes all painted voxels across all timepoints.
- Clear should leave exactly one label:
  - ID `1`
  - empty name
- Clear applies across all timepoints in that editable channel.

Undo/redo:

- Undo/redo should cover:
  - paint strokes
  - eraser strokes
  - label add
  - label delete and label-ID compaction
  - label rename
  - clear
- If full undo/redo for label operations is too large for the first patch, painting undo/redo must still be preserved and the limitation must be documented in code/tests before merging. The target behavior remains full undo/redo.

### 4.7 Color and Rendering

Remove the color widget from Annotate.

Label color is deterministic by label ID, matching regular segmentation channel rendering.

Rules:

- Label `0` is transparent.
- Label `1`, `2`, `3`, etc. use the existing deterministic segmentation color table logic.
- Users cannot choose per-label colors in this phase.
- Editable segmentation channels should use segmentation-specific tab styling.
- Editable segmentation render controls should match regular segmentation channels.

### 4.8 2D and 3D Brush Modes

The Annotate window includes a segmented control toggle between `2D` and `3D`, visually matching the one in the Draw ROI window.

Use existing Draw ROI segmented control style as the base:

- `src/components/viewers/viewer-shell/DrawRoiWindow.tsx`
- `src/styles/app/viewer-windows.css`

Behavior:

- `3D` mode paints a sphere footprint with the selected radius.
- `2D` mode paints a disk footprint on the current slice or hovered z plane.
- `2D` mode should use the hovered voxel's z coordinate for the stroke plane unless a future explicit slice binding is added.
- The existing radius slider remains.
- Existing enabled/disabled, brush/eraser, undo, redo, clear, and overlay controls remain, with product text changes below.

Overlay button:

- Existing `Hide overlay` / `Show overlay` text becomes `Hide` / `Show`.
- The meaning remains toggling annotation overlay visibility.

Brush trigger:

- Keep current interaction initially: hold `Ctrl` and left-click/drag in the viewer.
- Help text must be updated from Paintbrush to Annotate.
- If the product later wants a different shortcut, that should be a separate change.

### 4.9 Window Placement

Annotate opens at the same top-middle placement as other top-centered windows.

Current Paintbrush default uses:

- `computePaintbrushWindowDefaultPosition`
- `PAINTBRUSH_WINDOW_VERTICAL_OFFSET`

Required change:

- Remove the special downward offset behavior for Annotate.
- Default and recenter positions should use top-centered placement.
- Rename layout helpers to Annotate names.
- Update tests accordingly.

### 4.10 Dirty State and Navigation Guards

Editable channels can have unsaved changes.

Required dirty state behavior:

- Painting marks the channel dirty.
- Label add/delete/rename/clear marks the channel dirty.
- Saving successfully clears dirty.
- Exporting does not clear dirty because export is not persistence into the dataset.

Warn before destructive state loss:

- Closing the Annotate window does not delete the channel and should not warn.
- Exiting the viewer with dirty editable channels should warn.
- Returning to launcher with dirty editable channels should warn.
- Loading/replacing the dataset with dirty editable channels should warn.
- Deleting/removing an editable channel should warn.
- Browser unload warning is optional but recommended if already feasible in local app patterns.

Channel switching:

- Switching top channel tabs should not warn. It does not discard edits.

## 5) Persistence Design

### 5.1 In-Memory First

Editing happens in browser memory.

Do not write to disk during each stroke.

Reasons:

- Sparse segmentation persistence requires writing multiple file sets and manifest descriptors.
- Per-stroke disk writes would be slow.
- Per-stroke manifest updates would make failure recovery hard.
- Users expect Save to define persistence.

### 5.2 Writable Dataset Definition

A current preprocessed dataset is writable only when its storage backend can write files and the app can safely update the manifest.

Backends:

- `http`: not writable. Public datasets use this. `writeFile` throws.
- `opfs`: writable. This is browser private storage.
- `directory`: writable only after read/write permission is confirmed.
- `memory`: technically writable but only used in tests/perf paths and not persistent for real users.

Current app flows:

- Public examples use `createHttpPreprocessedStorage`; not writable.
- Loading an existing preprocessed folder currently uses `showDirectoryPicker({ mode: 'read' })`; treat as read-only until write permission is requested and granted.
- Preprocessing with folder export uses `showDirectoryPicker({ mode: 'readwrite' })`; should be writable in that session.
- Preprocessing/importing into OPFS uses `createOpfsPreprocessedStorage`; writable, but changes are to the OPFS copy.
- Uploading a preprocessed `.zip` unpacks into OPFS; writable, but changes do not mutate the original `.zip`.

### 5.3 Save Permission UX

When Annotate `Save` is clicked:

- If backend is `http`, save is unavailable. Public datasets should not reach this path because Annotate is disabled.
- If backend is `opfs`, save directly.
- If backend is `directory` and write permission is already confirmed, save directly.
- If backend is `directory` but write permission is not confirmed:
  - request write permission from the browser
  - if granted, save
  - if denied, show a short message and suggest `File > Export channel`
- If permission cannot be requested in the current browser, show a short message and suggest `File > Export channel`.

Implementation note:

- `createDirectoryHandlePreprocessedStorage` currently stores only a storage abstraction, not necessarily the original directory handle or permission mode. Add metadata needed to know/request write permission.
- Keep this change scoped and avoid changing public import behavior beyond what Annotate save needs.

### 5.4 Save Format

Editable segmentation channels persist as sparse segmentation layers in the existing preprocessed dataset.

They are real segmentation channels after save, but carry extra editable-only metadata.

Add optional metadata to sparse segmentation layer manifest:

```ts
type EditableSegmentationMetadata = {
  version: 1;
  labelNames: string[];
};
```

Recommended manifest field:

```ts
editableSegmentation?: EditableSegmentationMetadata;
```

Rules:

- `editableSegmentation` appears only on editable segmentation channels.
- Regular segmentation channels do not have this field.
- Schema validation must allow this optional field only for segmentation layers.
- `labelNames[0]` belongs to label ID `1`.
- `labelNames[1]` belongs to label ID `2`.
- Empty label names are stored as empty strings.
- `labelNames.length` should equal the number of listed editable labels.
- If a persisted editable segmentation is loaded later, the Annotate source dropdown can treat it as an editable source and preserve names on copy.

### 5.5 Save Transaction Rules

Saving should be transaction-like.

Required order:

1. Build sparse segmentation output for the editable channel.
2. Write all new sparse files to new revision paths.
3. Validate written descriptors if feasible.
4. Update `zarr.json` manifest last.
5. Reopen/rebuild relevant runtime summaries/provider state.
6. Mark channel clean only after manifest update succeeds.

Do not overwrite live sparse files in place.

Use revisioned paths for saved editable channel data:

```text
annotations/<layerKey>/rev-000001/...
annotations/<layerKey>/rev-000002/...
```

The manifest points at the active revision.

If save fails before manifest update:

- The dataset should still open with the previous manifest.
- Orphaned revision files are acceptable for this phase.

If save fails after manifest update:

- Surface an error.
- Do not mark the channel clean unless the runtime can reopen the saved layer.

### 5.6 Provider Cache Invalidation

After successful save:

- Invalidate or rebuild the volume provider cache for the saved channel.
- Rebuild channel summaries and loaded layer maps.
- Ensure top tabs and renderer use the persisted version.
- Preserve channel visibility and active tab when possible.

Do not leave stale brick atlas/page-table resources for the old unsaved revision.

## 6) Export Channel Feature

### 6.1 Menu

Add `Export channel` to the `File` dropdown in the top menu.

This feature is independent from Annotate.

Rules:

- Available for public datasets.
- Available for local datasets.
- Does not require the dataset to be writable.
- Does not clear Annotate dirty state.

### 6.2 Export Window

Add a new floating window titled `Export channel`.

Controls:

- Channel dropdown:
  - regular intensity channels
  - regular segmentation channels
  - editable segmentation channels
- Format dropdown:
  - only `.tif` for now
- File name text input.
- `Export` button.

Window placement:

- Use top-centered floating window placement.
- Add layout helpers and tests consistent with other windows.

### 6.3 Export Output

For one timepoint:

- Save/download `<fileName>.tif`.
- The TIFF is a 3D stack for that channel at that timepoint.

For more than one timepoint:

- Save/download `<fileName>.zip`.
- ZIP contains one 3D TIFF stack per timepoint:

```text
<fileName>/001.tif
<fileName>/002.tif
<fileName>/003.tif
...
```

Use enough zero padding for the total timepoint count:

- 9 timepoints: `1.tif` is acceptable only if explicitly chosen, but preferred is `001.tif` for stable conventions.
- 100 timepoints: `001.tif` through `100.tif`.
- 1000 timepoints: `0001.tif` through `1000.tif`.

Recommended padding:

```ts
const width = Math.max(3, String(totalTimepoints).length);
```

### 6.4 ZIP Implementation

The repo already depends on `fflate`.

Use `fflate` for ZIP creation.

Do not add a new ZIP dependency.

Large exports:

- Build with attention to memory.
- If the first implementation must assemble the ZIP in memory, document and guard large exports with a clear error or warning.
- Streaming ZIP can be a future optimization.

### 6.5 TIFF Semantics

Export TIFF should preserve voxel values, not display colors, contrast, or palette colors.

Intensity channels:

- Export scalar voxel values.
- Preserve stored/normalized bit depth where possible.
- `uint8` intensity exports as 8-bit grayscale TIFF.
- `uint16` intensity exports as 16-bit grayscale TIFF.
- If runtime only has normalized data for the selected channel, exporting normalized values is acceptable for this phase, but UI/help text must not imply raw source recovery.

Segmentation and editable segmentation channels:

- Export label ID values.
- Prefer 32-bit unsigned grayscale TIFF because sparse segmentation labels are `uint32`.
- If classic TIFF reader compatibility becomes an issue, document supported readers and keep label values exact.

Current `src/shared/utils/tiffWriter.ts` only writes 8-bit RGB TIFF stacks.

Required writer additions:

- grayscale 8-bit stack writer
- grayscale 16-bit stack writer
- grayscale 32-bit unsigned stack writer
- keep classic TIFF byte offsets under 4 GB

Classic TIFF limit:

- If any generated TIFF would exceed classic TIFF's 4 GB offset limit, show an error.
- Do not implement BigTIFF in this phase.

### 6.6 Export Data Loading

Export must be able to load every requested timepoint for the chosen channel.

For regular channels:

- Use the existing preprocessed provider/storage path.
- Do not export only the currently loaded viewer scale if full-resolution data is available.
- Prefer scale level `0`.
- For intensity layers, `volumeProvider.getVolume(layerKey, timepoint, { scaleLevel: 0 })` is the expected starting point.
- For sparse segmentation layers, do not call `getVolume`; it intentionally throws for sparse segmentation. Use sparse provider APIs such as `getSparseSegmentationField`, `getSparseSegmentationBrick`, or the underlying sparse storage descriptors to materialize exact label IDs for export.
- Sparse segmentation export can materialize one timepoint at a time into a `Uint32Array` stack, encode that TIFF, release it, then continue to the next timepoint. This avoids holding all timepoints densely at once.

For editable unsaved channels:

- Export from the in-memory editable state.
- Include unsaved edits.
- Multi-timepoint export includes every timepoint in the editable channel.

For saved editable channels:

- Export from the current active representation.
- If there are unsaved edits on top of saved data, export the in-memory merged state.

Error handling:

- If a timepoint cannot be loaded, abort export and show which timepoint failed.
- If channel has no volume data, disable `Export`.

## 7) UI Details

### 7.1 Annotate Window Layout

Window title:

```text
Annotate
```

Class:

```text
floating-window--annotate
annotate-window
```

Recommended layout:

1. Creation row:
   - `New`
   - source dropdown
2. Name row:
   - channel name input
3. Tool row:
   - `2D` / `3D` segmented control
   - `Enabled` / `Disabled`
   - brush/eraser toggle
   - `Hide` / `Show`
4. History row:
   - `Undo`
   - `Redo`
   - optional brush-local `Clear` should be removed or merged with manager `Clear` to avoid duplicate meanings
5. Radius row:
   - radius slider
6. Divider line
7. Label manager:
   - list left
   - action buttons right

Avoid two separate `Save` buttons.

The manager `Save` is the authoritative dataset persistence action.

### 7.2 Top Menu Text

Update:

- `Edit > Paintbrush` -> `Edit > Annotate`
- VR wrist menu edit action label -> `Annotate`
- Help text -> `Annotate`
- Tests expecting `Paintbrush` -> `Annotate`

Add:

- `File > Export channel`

### 7.3 Help Text

Update segmentation help text:

- Say `Open Edit > Annotate...`
- Say `Use Annotate to create or refine editable segmentation labels.`
- Keep shortcut text if shortcut remains Ctrl + left-drag.
- Remove references to Paintbrush and painted RGB overlays.

### 7.4 Accessibility

Annotate window:

- Use `role="group"` and `aria-label` for segmented controls.
- Label text input with a visible or accessible label.
- Label manager list should use `role="listbox"`.
- Selected label should use `aria-selected`.
- Buttons should have disabled state when unavailable.

Export window:

- Label both dropdowns and file name input.
- Disable `Export` if selection/name is invalid.
- Announce/export error messages in an accessible area if the app has a pattern for this.

## 8) Runtime Integration

### 8.1 Top Channel Tabs

Current tabs derive from loaded dataset layers, not only from the setup `channels` list.

Editable channels must be added to the runtime layer/channel summary path immediately after creation.

Required behavior:

- New editable channel appears in `loadedChannelIds`.
- `channelNameMap` includes it.
- `channelLayersMap` includes one segmentation layer for it.
- `segmentationChannelIds` includes it.
- It can be selected as active tab.
- Its visibility can be toggled.
- It uses segmentation rendering controls.

Implementation choices:

- Extend the route/app state to include `editableSegmentationChannels`.
- Merge editable layer summaries with `loadedDatasetLayers` before channel maps are derived.
- Or add a dedicated editable layer source path in `useLayerControls`.

Preferred approach:

- Add editable channels to a separate state collection.
- Build derived `LoadedDatasetLayer` summaries for them.
- Merge those summaries into existing route/viewer derived lists.
- Keep original preprocessed manifest summaries separate from unsaved editable state.

### 8.2 Viewer Layers

Editable segmentation layers should render as segmentation layers.

For initial implementation, acceptable rendering options:

1. Create a dense label `NormalizedVolume` for the editable channel only when dimensions are small enough.
2. Create a sparse/editable brick atlas compatible with existing segmentation atlas rendering.
3. Add a local editable overlay layer path that produces packed label textures.

Preferred for correctness and scale:

- Use sparse editable bricks and feed the existing segmentation renderer path.

Temporary dense fallback:

- Allowed only behind size guards.
- Must not be used for large datasets that would exceed memory.
- Must not become the only implementation if it makes annotation unusable for expected data sizes.

### 8.3 Pointer Painting

Current pointer lifecycle invokes:

- `onStrokeStart`
- `onStrokeApply(coords)`
- `onStrokeEnd`

Keep this contract conceptually, but rename it to annotation.

Painting target:

- Active editable segmentation channel.
- Current viewer timepoint.
- Hovered voxel coordinate.

Rules:

- If no editable channel exists, do nothing.
- If Annotate is disabled, do nothing.
- If no active label exists, do nothing; creation always creates label `1`, so this should be rare.
- Brush mode writes selected label ID.
- Eraser mode writes `0`.
- 2D mode writes disk footprint on z plane.
- 3D mode writes sphere footprint.
- Radius clamps to safe min/max.

### 8.4 Timepoints

Editable channels have the same `volumeCount` as the current dataset.

Painting edits the current timepoint.

Source copy copies all timepoints.

Label delete, label compaction, clear, save, and export operate across all timepoints.

### 8.5 Measurements and ROI

ROI measurement logic remains intensity-oriented.

Do not add editable segmentation measurement features in this phase.

Existing ROI behavior should not regress.

## 9) Sparse Save Implementation

Saving editable segmentation channels requires writing the same sparse segmentation representation used by preprocessed segmentation.

Required output pieces:

- sparse brick payload shards
- brick directory per scale
- occupancy hierarchy per scale
- label metadata
- manifest layer entry
- root `zarr.json` manifest update

Reuse existing sparse segmentation utilities where possible:

- codecs
- brick directory encoding
- payload shard writing patterns
- occupancy hierarchy
- downsample
- label metadata

Important existing files:

- `src/shared/utils/preprocessedDataset/sparseSegmentation/codecs.ts`
- `src/shared/utils/preprocessedDataset/sparseSegmentation/brickDirectory.ts`
- `src/shared/utils/preprocessedDataset/sparseSegmentation/payloadShard.ts`
- `src/shared/utils/preprocessedDataset/sparseSegmentation/occupancyHierarchy.ts`
- `src/shared/utils/preprocessedDataset/sparseSegmentation/downsample.ts`
- `src/shared/utils/preprocessedDataset/sparseSegmentation/labelMetadata.ts`
- `src/shared/utils/preprocessedDataset/preprocess.ts`

Implementation should avoid copying large sections from preprocessing if a small writer abstraction can be extracted.

Recommended new module:

```text
src/shared/utils/preprocessedDataset/editableSegmentation/
```

Possible files:

- `types.ts`
- `editableState.ts`
- `sparseWriter.ts`
- `manifest.ts`
- `export.ts`
- `labelOperations.ts`

Keep UI hooks separate from storage utilities.

## 10) Export Implementation Details

Recommended new module:

```text
src/shared/utils/channelExport.ts
```

Responsibilities:

- validate export request
- resolve channel/layer
- load timepoint data
- convert data to TIFF stack payload
- create single TIFF or ZIP
- return `Blob` or `Uint8Array`

Recommended UI component:

```text
src/components/viewers/viewer-shell/ExportChannelWindow.tsx
```

Recommended hook:

```text
src/components/viewers/viewer-shell/hooks/useViewerChannelExport.ts
```

Do not put heavy export logic inside `ViewerShell.tsx`.

## 11) File-by-File Implementation Map

This section lists likely files to edit or create. The exact final file list may differ, but all behavior must be covered.

### 11.1 Rename Paintbrush to Annotate

Likely rename/edit:

- `src/components/viewers/viewer-shell/PaintbrushWindow.tsx`
- `src/hooks/paintbrush/usePaintbrush.ts`
- `src/components/viewers/viewer-shell/hooks/useViewerPaintbrushIntegration.ts`
- `src/types/paintbrush.ts`
- `tests/usePaintbrush.test.ts`
- `tests/PaintbrushWindow.test.tsx`

Likely update references:

- `src/components/viewers/ViewerShell.tsx`
- `src/components/viewers/viewer-shell/TopMenu.tsx`
- `src/components/viewers/viewer-shell/types.ts`
- `src/components/viewers/VolumeViewer.tsx`
- `src/components/viewers/VolumeViewer.types.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerRefSync.ts`
- `src/components/viewers/volume-viewer/volumeViewerRuntimeArgs.ts`
- `src/components/viewers/volume-viewer/useVolumeViewerLifecycle.ts`
- `src/components/viewers/volume-viewer/volumeViewerPointerLifecycle.ts`
- `src/ui/app/hooks/useWindowLayout.ts`
- `src/ui/app/hooks/useAppRouteState.tsx`
- `src/shared/utils/windowLayout.ts`
- `src/components/viewers/viewer-shell/NavigationHelpWindow.tsx`
- `tests/runTests.ts`
- `tests/app/hooks/useWindowLayout.test.ts`
- `tests/ViewerShellContainer.test.ts`
- `tests/volumeViewerRuntimeArgs.test.ts`
- `tests/volumeViewerPointerLifecycle.test.ts`
- `tests/e2e/top-menu-smoke.spec.ts`
- `tests/viewer-shell/TopMenu.test.tsx`
- `tests/viewer-shell/useViewerPanelWindows.test.ts`
- `tests/viewer-shell/NavigationHelpWindow.test.tsx`

CSS:

- `src/styles/app/theme.css`
- `src/styles/app/viewer-track-panels.css`
- optionally move Annotate-specific styles to `src/styles/app/viewer-windows.css` if that better matches current window styling.

### 11.2 Editable Segmentation State

Create or edit:

- `src/types/annotation.ts`
- `src/hooks/annotation/useAnnotate.ts`
- `src/shared/utils/annotation/labelOperations.ts`
- `src/shared/utils/annotation/brushFootprints.ts`
- `src/shared/utils/annotation/editableSegmentationState.ts`
- tests for each utility/hook.

### 11.3 Runtime Channel Integration

Edit:

- `src/ui/app/hooks/useAppRouteState.tsx`
- `src/hooks/dataset/useDatasetSetup.ts`
- `src/ui/app/hooks/useLayerControls.ts`
- `src/components/viewers/viewer-shell/VolumeChannelTabs.tsx`
- `src/components/viewers/viewer-shell/ChannelsPanel.tsx`
- `src/ui/contracts/viewerLayer.ts`
- `src/components/viewers/VolumeViewer.types.ts`

Goal:

- Unsaved editable channels are visible/renderable like segmentation channels.

### 11.4 Persistence

Edit/create:

- `src/shared/storage/preprocessedStorage.ts`
- `src/shared/utils/preprocessedDataset/types.ts`
- `src/shared/utils/preprocessedDataset/schema.ts`
- `src/shared/utils/preprocessedDataset/manifest.ts`
- `src/shared/utils/preprocessedDataset/editableSegmentation/*`
- `src/core/volumeProvider.ts` if cache invalidation or editable metadata loading needs provider support.

### 11.5 Export

Create/edit:

- `src/components/viewers/viewer-shell/ExportChannelWindow.tsx`
- `src/components/viewers/viewer-shell/hooks/useViewerChannelExport.ts`
- `src/shared/utils/channelExport.ts`
- `src/shared/utils/tiffWriter.ts`
- `src/components/viewers/viewer-shell/TopMenu.tsx`
- `src/components/viewers/ViewerShell.tsx`
- `src/shared/utils/windowLayout.ts`
- tests for TIFF writer and export behavior.

## 12) Phased Implementation Plan

### Phase 1: Rename and Shell UI

Tasks:

- Rename Paintbrush user-facing text to Annotate.
- Rename files/types/hooks where practical.
- Update top menu label.
- Update help text.
- Fix window placement to top-centered.
- Update tests for renamed UI.
- Keep old overlay behavior temporarily if needed to keep tests passing.

Acceptance:

- No user-facing `Paintbrush` remains except historical docs if intentionally left.
- `Edit > Annotate` opens top-centered.
- Existing paint overlay behavior still works or is intentionally gated behind upcoming phases.

### Phase 2: Annotate Window UI

Tasks:

- Add creation rows.
- Add source dropdown.
- Add channel name input.
- Add 2D/3D segmented control.
- Remove color widget.
- Change overlay button text to `Hide`/`Show`.
- Add divider.
- Add label manager UI with buttons.
- Remove label-manager `Update` and `Load`.
- Remove duplicate save/clear ambiguity.

Acceptance:

- Component tests cover all controls.
- Label manager displays `label_id - label_name`.
- UI state disables creation rows after `New`.

### Phase 3: Editable Segmentation State

Tasks:

- Add editable segmentation channel state model.
- Implement `New` from Empty.
- Auto-create label `1`.
- Implement label add/delete/rename/clear/compaction.
- Implement dirty state.
- Implement undo/redo target behavior.

Acceptance:

- Unit tests cover label ID compaction across timepoints.
- Unit tests cover empty label names.
- Unit tests cover clear confirmation and reset to label `1`.

### Phase 4: Painting Into Labels

Tasks:

- Replace RGBA writes with label ID writes.
- Implement 2D disk and 3D sphere brush footprints.
- Implement eraser as label `0`.
- Apply edits to current timepoint.
- Keep undo/redo for strokes.

Acceptance:

- Unit tests cover brush/eraser writes.
- Unit tests cover 2D vs 3D footprints.
- Existing pointer lifecycle tests pass after rename.

### Phase 5: Runtime Channel Rendering

Tasks:

- Add editable channels to loaded channel maps.
- Add top tabs for editable channels.
- Render editable segmentation channels with deterministic label colors.
- Toggle visibility and active tab normally.
- Ensure hover either works or explicitly excludes unsaved editable channels until implemented.

Acceptance:

- New editable channel appears in top tabs.
- It uses segmentation tab styling.
- Painting updates visible rendered voxels.
- No dense fallback is used for large datasets without guardrails.

### Phase 6: Source Copy

Tasks:

- Implement copy from regular segmentation channel across all timepoints.
- Implement copy from editable segmentation channel across all timepoints.
- Remap regular source labels to consecutive editable IDs.
- Preserve editable source label names.

Acceptance:

- Tests cover sparse source labels `{7, 12, 99}` -> `{1, 2, 3}`.
- Tests cover all-timepoint copy.
- Tests cover editable source names preserved.

### Phase 7: Save

Tasks:

- Add writable backend detection.
- Add directory write permission request UX.
- Implement sparse writer for editable channels.
- Add `editableSegmentation.labelNames` schema support.
- Save to revisioned paths.
- Update root manifest last.
- Invalidate/rebuild caches.

Acceptance:

- OPFS save works.
- Directory save requests permission when needed.
- HTTP/public Annotate remains disabled.
- Saved dataset reloads with editable label names.
- Failed pre-manifest save does not corrupt current manifest.

### Phase 8: Export Channel

Tasks:

- Add `File > Export channel`.
- Add export window.
- Add grayscale TIFF writers.
- Add ZIP export via `fflate`.
- Export regular intensity, regular segmentation, unsaved editable segmentation, and saved editable segmentation.

Acceptance:

- Single-timepoint export saves `.tif`.
- Multi-timepoint export saves `.zip`.
- Public dataset export works.
- Exported segmentation TIFF contains label IDs, not colors.
- Large classic TIFF overflow shows a clear error.

### Phase 9: Cleanup and Verification

Tasks:

- Remove obsolete RGBA paint overlay paths.
- Remove obsolete RGB painting export.
- Update docs/project structure if needed.
- Run verification.

Acceptance:

- `npm run typecheck`
- `npm run typecheck:tests`
- relevant unit/component tests
- relevant e2e smoke tests
- `npm run build`
- ideally `npm run verify:fast`

## 13) Testing Plan

### 13.1 Unit Tests

Add tests for:

- label add/delete/rename
- empty label names
- label ID compaction
- compaction across all timepoints
- clear reset behavior
- brush footprint generation
- stroke undo/redo
- source label remapping
- dirty state
- save permission decisions
- TIFF writer scalar 8/16/32-bit output structure
- ZIP file naming

### 13.2 Component Tests

Update/add tests for:

- `AnnotateWindow`
- `ExportChannelWindow`
- `TopMenu`
- `NavigationHelpWindow`
- `useWindowLayout`
- `useViewerPanelWindows`
- channel tabs include editable segmentation channels

### 13.3 Integration Tests

Add tests for:

- creating an editable channel and seeing a top tab
- painting changes channel data
- deleting a label compacts voxels
- copying segmentation channel remaps labels
- saving editable metadata into manifest
- reloading saved editable metadata
- exporting an unsaved editable channel

### 13.4 E2E Tests

Add or update Playwright smoke tests:

- top menu has `Annotate`, not `Paintbrush`
- public dataset disables Annotate
- local/preprocessed dataset opens Annotate
- create editable channel
- label manager basic interactions
- export window opens from File menu

Browser file save tests can mock/stub:

- `showSaveFilePicker`
- `showDirectoryPicker`
- file handle `createWritable`

### 13.5 Regression Tests

Ensure no regressions in:

- normal channel rendering
- regular segmentation rendering
- ROI manager
- Draw ROI
- hover
- playback
- public dataset loading
- preprocessed folder loading

## 14) Migration and Compatibility

Existing datasets:

- Regular segmentation channels continue to load as before.
- They do not have `editableSegmentation`.
- They can be copied into a new editable channel.

Saved editable datasets:

- The same app should load saved editable channels and expose label names.
- If an older app sees `editableSegmentation`, schema compatibility depends on old schema strictness. This is acceptable unless backward compatibility is explicitly required.

Manifest format:

- Do not create a new root dataset format solely for editable label names unless schema constraints force it.
- Prefer optional metadata on segmentation layers.
- If schema validation requires a format bump, document and update all fixtures/tests.

## 15) Error Handling

Required user-facing errors:

- Empty channel name.
- Duplicate channel name.
- No writable permission for Annotate save.
- Save failed with reason.
- Export failed with channel/timepoint reason.
- TIFF too large for classic TIFF.
- Not enough memory or dataset too large for temporary dense fallback.

Do not swallow errors silently.

Prefer concise messages. Examples:

- `Channel name is required.`
- `Channel name must be unique.`
- `Write access was denied. Use File > Export channel to save a copy.`
- `Export failed at timepoint 12: <reason>`
- `This channel is too large for classic TIFF export. BigTIFF is not supported yet.`

## 16) Performance Constraints

Annotation should remain interactive.

Guidelines:

- Batch UI updates with animation frames during strokes.
- Avoid React state updates for every voxel.
- Store mutable edit data in refs or external state containers and expose revisions.
- Recompute label counts incrementally when possible.
- Avoid full-dataset scans during every stroke.
- Avoid full materialization when copying source segmentation channels.
- Save/export can be async and show progress if existing app patterns support it.

For large multi-timepoint copy:

- Prefer lazy source references plus edit overrides.
- Materialize during save/export.

For label delete/compaction:

- This is inherently global across the editable channel.
- It can be slower and should be treated as a command operation, not per-frame work.

## 17) Security and Browser API Notes

Browser filesystem behavior:

- `showSaveFilePicker` writes individual files.
- `showDirectoryPicker({ mode: 'readwrite' })` can write folders in supported Chromium-like browsers.
- Folder write support is not universal.
- ZIP export is the cross-browser default for multi-timepoint exports.

Directory-backed preprocessed datasets:

- Read permission does not imply write permission.
- Store enough handle metadata to request write permission when the user clicks Annotate `Save`.

Public HTTP datasets:

- HTTP storage is read-only.
- Do not attempt writes.

## 18) Acceptance Checklist

The overhaul is complete when:

- No user-facing Paintbrush references remain.
- `Edit > Annotate` exists.
- Annotate is disabled for public HTTP datasets.
- Annotate opens top-centered.
- Annotate can create an empty editable segmentation channel.
- New editable channel appears as a top channel tab.
- Label `1` is auto-created on `New`.
- Label manager displays consecutive `label_id - label_name`.
- Empty label names work.
- Deleting a label compacts IDs and voxels across all timepoints.
- Clear confirms and clears the whole editable channel.
- Color widget is gone.
- Label colors are deterministic by label ID.
- 2D and 3D painting work.
- Painting writes label IDs into editable segmentation data.
- Source copy works for regular and editable segmentation channels across all timepoints.
- Annotate Save persists to writable OPFS/directory datasets.
- Directory save requests write permission when needed.
- Saved editable label names reload.
- Save updates manifest last.
- Provider/render caches refresh after save.
- Dirty state is tracked and guarded.
- `File > Export channel` exists.
- Export window can export any channel.
- Single timepoint export creates `.tif`.
- Multi-timepoint export creates `.zip`.
- Public datasets can export channels.
- Tests and build pass.

## 19) Known Implementation Risks

Sparse editable rendering:

- Existing segmentation rendering is optimized around preprocessed sparse brick atlases.
- Unsaved editable channels may require new runtime resource plumbing.

Sparse save extraction:

- Preprocessing has sparse writing logic, but it may not be packaged as a reusable writer.
- Extract carefully rather than duplicating large logic.

Classic TIFF size:

- Large 3D/timepoint exports may exceed classic TIFF limits.
- Guard clearly and defer BigTIFF.

Permission state:

- Directory handle permissions can be browser-specific.
- Test with mocks and real Chromium.

Memory:

- ZIP export and TIFF generation can be memory-heavy.
- Add guards before attempting very large exports.

## 20) Glossary

Annotate:

- The new editable segmentation workflow replacing Paintbrush.

Editable segmentation channel:

- A segmentation channel created or copied inside Annotate and editable by the user.

Regular segmentation channel:

- A preprocessed segmentation channel without editable label-name metadata.

Label ID:

- Numeric voxel value. User-facing IDs start at `1` and are consecutive. `0` is background.

Label name:

- Editable string stored only for editable segmentation labels. May be empty.

Dirty:

- Editable channel has unsaved changes relative to the current persisted dataset state.

Export:

- File export workflow that writes TIFF or ZIP. It does not persist changes back into the current dataset.

Save:

- Annotate manager action that persists an editable segmentation channel into the current writable preprocessed dataset.
