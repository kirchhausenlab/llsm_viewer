# FrontPage container contract

This file summarizes the pieces of `AppContent` state that currently drive the `<FrontPage />` presentation and outlines a minimal prop contract for a future `FrontPageContainer` wrapper.

## AppContent props/state by concern

### Voxel resolution and experiment dimension
- `useVoxelResolution` exposes `voxelResolutionInput` (passed to `FrontPage` as `voxelResolution`), along with `experimentDimension` and the axis/unit/anisotropy change handlers that let the front page edit those values.
- The computed `voxelResolution` value is required for `canLaunch` and is written to `preprocessingSettingsRef` before launching a preprocessed experiment.
- `handleExperimentDimensionChange`, `setExperimentDimension`, and `setVoxelResolutionInput` are triggered by front-page interactions.

### Dataset error handling
- `useDatasetErrors` provides `datasetError`, `datasetErrorContext`, `datasetErrorResetSignal`, `reportDatasetError`, `clearDatasetError`, and `bumpDatasetErrorResetSignal`.
- `launchErrorMessage` and `interactionErrorMessage` are derived from `datasetErrorContext` and are displayed/dismissed via `handleDatasetErrorDismiss` on the front page.

### Preprocessing settings and Dropbox import
- `usePreprocessedExperiment` supplies the staged `preprocessedExperiment`, loader visibility (`isPreprocessedLoaderOpen`, `isPreprocessedDragActive`), import states (`isPreprocessedImporting`, `preprocessedDropboxImporting`), errors/info (`preprocessedImportError`, `preprocessedDropboxError`, `preprocessedDropboxInfo`), import progress counters, and Dropbox config fields (`isPreprocessedDropboxConfigOpen`, `preprocessedDropboxAppKeyInput`, `preprocessedDropboxAppKeySource`).
- File selection and Dropbox handlers (`handlePreprocessedBrowse`, drag/drop callbacks, `handlePreprocessedDropboxImport`, and config submit/change/clear/cancel callbacks) are forwarded directly to `FrontPage`.
- `handleExportPreprocessedExperiment`, `resetPreprocessedState`, and `handleDiscardPreprocessedExperiment` clear or export the staged preprocessing results.

### Upload and load progress
- The viewer load workflow tracks `status`, `loadProgress`, `loadedCount`, and `expectedVolumeCount` to report volume import progress back to the front page and viewer.
- Preprocessed import progress counters (`preprocessedImportBytesProcessed`, `preprocessedImportTotalBytes`, `preprocessedImportVolumesDecoded`, `preprocessedImportTotalVolumeCount`) surface drop/Dropbox ingestion status on the front page.

## Minimal `FrontPageContainer` prop contract

A container that wraps `<FrontPage />` should only receive and forward the data/callbacks the presentational component consumes. The contract below mirrors the current prop usage without leaking extra `AppContent` state:

```ts
import type { ExperimentDimension } from '../hooks/useVoxelResolution';
import type { VoxelResolutionInput, VoxelResolutionUnit } from '../types/voxelResolution';
import type { DropboxAppKeySource } from '../integrations/dropbox';
import type { ChannelSource, ChannelValidation, StagedPreprocessedExperiment } from '../hooks/useChannelSources';

export type FrontPageContainerProps = {
  isFrontPageLocked: boolean;
  frontPageMode: 'initial' | 'configuring' | 'preprocessed';
  channels: ChannelSource[];
  activeChannelId: string | null;
  activeChannel: ChannelSource | null;
  channelValidationMap: Map<string, ChannelValidation>;
  editingChannelId: string | null;
  editingChannelInputRef: React.MutableRefObject<HTMLInputElement | null>;
  editingChannelOriginalNameRef: React.MutableRefObject<string>;
  onStartExperimentSetup: () => void;
  onAddChannel: () => void;
  onOpenPreprocessedLoader: () => void;
  onReturnToStart: () => void;
  experimentDimension: ExperimentDimension;
  onExperimentDimensionChange: (dimension: ExperimentDimension) => void;
  voxelResolution: VoxelResolutionInput;
  onVoxelResolutionAxisChange: (axis: 'x' | 'y' | 'z', value: string) => void;
  onVoxelResolutionUnitChange: (unit: VoxelResolutionUnit) => void;
  onVoxelResolutionAnisotropyToggle: (value: boolean) => void;
  isPreprocessedLoaderOpen: boolean;
  isPreprocessedDragActive: boolean;
  onPreprocessedDragEnter: React.DragEventHandler<HTMLDivElement>;
  onPreprocessedDragLeave: React.DragEventHandler<HTMLDivElement>;
  onPreprocessedDragOver: React.DragEventHandler<HTMLDivElement>;
  onPreprocessedDrop: React.DragEventHandler<HTMLDivElement>;
  preprocessedFileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onPreprocessedFileInputChange: React.ChangeEventHandler<HTMLInputElement>;
  isPreprocessedImporting: boolean;
  preprocessedImportBytesProcessed: number;
  preprocessedImportTotalBytes: number | null;
  preprocessedImportVolumesDecoded: number;
  preprocessedImportTotalVolumeCount: number | null;
  preprocessedDropboxImporting: boolean;
  onPreprocessedBrowse: () => void;
  onPreprocessedDropboxImport: () => void;
  preprocessedImportError: string | null;
  preprocessedDropboxError: string | null;
  preprocessedDropboxInfo: string | null;
  isPreprocessedDropboxConfigOpen: boolean;
  onPreprocessedDropboxConfigSubmit: React.FormEventHandler<HTMLFormElement>;
  preprocessedDropboxAppKeyInput: string;
  onPreprocessedDropboxConfigInputChange: React.ChangeEventHandler<HTMLInputElement>;
  preprocessedDropboxAppKeySource: DropboxAppKeySource | null;
  onPreprocessedDropboxConfigCancel: () => void;
  onPreprocessedDropboxConfigClear: () => void;
  onChannelNameChange: (channelId: string, name: string) => void;
  onRemoveChannel: (channelId: string) => void;
  onChannelLayerFilesAdded: (channelId: string, files: File[]) => void | Promise<void>;
  onChannelLayerDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelLayerSegmentationToggle: (channelId: string, layerId: string, value: boolean) => void;
  onChannelLayerRemove: (channelId: string, layerId: string) => void;
  onChannelTrackFileSelected: (channelId: string, file: File | null) => void;
  onChannelTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelTrackClear: (channelId: string) => void;
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  hasGlobalTimepointMismatch: boolean;
  interactionErrorMessage: string | null;
  launchErrorMessage: string | null;
  onLaunchViewer: () => void;
  isLaunchingViewer: boolean;
  launchButtonEnabled: boolean;
  launchButtonLaunchable: 'true' | 'false';
  onExportPreprocessedExperiment: () => void;
  isExportingPreprocessed: boolean;
  canLaunch: boolean;
  warningWindowInitialPosition: { x: number; y: number };
  warningWindowWidth: number;
  datasetErrorResetSignal: number;
  onDatasetErrorDismiss: () => void;
};
```

Use this contract as the handoff between `AppContent` and a future container so that the presentation component can stay stateless and easy to test.
