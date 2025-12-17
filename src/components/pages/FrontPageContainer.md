# FrontPage container contract

This file summarizes the pieces of app state that drive `<FrontPage />` and outlines a minimal prop contract for `FrontPageContainer`.

## App state by concern

### Voxel resolution and experiment dimension
- `useVoxelResolution` exposes `voxelResolutionInput` and `experimentDimension`, plus axis/unit/anisotropy change handlers.
- A complete voxel resolution value is required before preprocessing.

### Dataset error handling
- `useDatasetErrors` provides `reportDatasetError`, `clearDatasetError`, and a reset signal used by the front page warnings window.

### Preprocessing and preprocessed dataset loading
- `usePreprocessedExperiment` supplies:
  - staged `preprocessedExperiment` (manifest + summaries + OPFS storage handle)
  - loader state (`isPreprocessedLoaderOpen`, `isPreprocessedImporting`, `preprocessedImportError`)
  - `handlePreprocessedBrowse` to load a preprocessed dataset from a user-selected folder (Zarr v3)
  - `resetPreprocessedState` to discard the staged dataset
- `FrontPageContainer` implements preprocessing:
  - always writes a Zarr v3 store into OPFS
  - optionally “tees” writes to a user-selected folder when “Export to folder while preprocessing” is enabled

## Minimal `FrontPageContainer` prop contract

This contract mirrors the current prop usage without exposing unrelated app state:

```ts
import type { ExperimentDimension } from '../../hooks/useVoxelResolution';
import type { VoxelResolutionInput, VoxelResolutionUnit } from '../../types/voxelResolution';
import type { ChannelSource, ChannelValidation, StagedPreprocessedExperiment } from '../../hooks/dataset';

export type FrontPageContainerProps = {
  channels: ChannelSource[];
  activeChannelId: string | null;
  activeChannel: ChannelSource | null;
  channelValidationMap: Map<string, ChannelValidation>;
  editingChannelId: string | null;
  editingChannelInputRef: React.MutableRefObject<HTMLInputElement | null>;
  editingChannelOriginalNameRef: React.MutableRefObject<string>;

  isExperimentSetupStarted: boolean;
  onStartExperimentSetup: () => void;
  onReturnToStart: () => void;

  experimentDimension: ExperimentDimension;
  onExperimentDimensionChange: (dimension: ExperimentDimension) => void;
  voxelResolution: VoxelResolutionInput;
  onVoxelResolutionAxisChange: (axis: 'x' | 'y' | 'z', value: string) => void;
  onVoxelResolutionUnitChange: (unit: VoxelResolutionUnit) => void;
  onVoxelResolutionAnisotropyToggle: (value: boolean) => void;

  isPreprocessedLoaderOpen: boolean;
  isPreprocessedImporting: boolean;
  onPreprocessedBrowse: () => Promise<void>;
  preprocessedImportError: string | null;

  preprocessedExperiment: StagedPreprocessedExperiment | null;

  onPreprocessExperiment: () => void;
  exportWhilePreprocessing: boolean;
  onExportWhilePreprocessingChange: (value: boolean) => void;

  onLaunchViewer: () => void;
  isLaunchingViewer: boolean;
  canLaunch: boolean;
};
```

