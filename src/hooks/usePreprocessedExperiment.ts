import { useRef } from 'react';
import type {
  ChangeEvent,
  Dispatch,
  DragEvent,
  FormEvent,
  MutableRefObject,
  SetStateAction
} from 'react';
import type { DropboxAppKeySource } from '../integrations/dropbox';
import type { LoadedLayer } from '../types/layers';
import type {
  ChannelSource,
  ChannelTrackState,
  FollowedTrackState,
  StagedPreprocessedExperiment
} from '../App';
import type { PreprocessedDropboxCallbacks } from './preprocessedExperiment/shared';
import { usePreprocessedImport } from './preprocessedExperiment/usePreprocessedImport';
import { useDropboxPreprocessed } from './preprocessedExperiment/useDropboxPreprocessed';
import { usePreprocessedExport } from './preprocessedExperiment/usePreprocessedExport';
import type { VoxelResolutionValues } from '../types/voxelResolution';

export type UsePreprocessedExperimentOptions = {
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  setChannelTrackStates: Dispatch<SetStateAction<Record<string, ChannelTrackState>>>;
  setTrackOrderModeByChannel: Dispatch<SetStateAction<Record<string, 'id' | 'length'>>>;
  setSelectedTrackIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
  setFollowedTrack: Dispatch<SetStateAction<FollowedTrackState>>;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setExperimentDimension: Dispatch<SetStateAction<ExperimentDimension>>;
  setViewerMode: Dispatch<SetStateAction<'3d' | '2d'>>;
  clearDatasetError: () => void;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
  loadSelectedDataset: () => Promise<LoadedLayer[] | null>;
  showInteractionWarning: (message: string) => void;
  isLaunchingViewer: boolean;
  voxelResolution: VoxelResolutionValues | null;
  experimentDimension: ExperimentDimension;
};

export type UsePreprocessedExperimentResult = {
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  isPreprocessedLoaderOpen: boolean;
  isPreprocessedImporting: boolean;
  isPreprocessedDragActive: boolean;
  isExportingPreprocessed: boolean;
  preprocessedDropboxImporting: boolean;
  preprocessedImportError: string | null;
  preprocessedDropboxError: string | null;
  preprocessedDropboxInfo: string | null;
  preprocessedImportBytesProcessed: number;
  preprocessedImportTotalBytes: number | null;
  preprocessedImportVolumesDecoded: number;
  preprocessedImportTotalVolumeCount: number | null;
  isPreprocessedDropboxConfigOpen: boolean;
  preprocessedDropboxAppKeyInput: string;
  preprocessedDropboxAppKeySource: DropboxAppKeySource | null;
  preprocessedFileInputRef: MutableRefObject<HTMLInputElement | null>;
  handlePreprocessedLoaderOpen: () => void;
  handlePreprocessedLoaderClose: () => void;
  handlePreprocessedFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handlePreprocessedBrowse: () => void;
  handlePreprocessedDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  handlePreprocessedDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  handlePreprocessedDragOver: (event: DragEvent<HTMLDivElement>) => void;
  handlePreprocessedDrop: (event: DragEvent<HTMLDivElement>) => Promise<void>;
  handlePreprocessedDropboxImport: () => Promise<void>;
  handlePreprocessedDropboxConfigSubmit: (event: FormEvent<HTMLFormElement>) => void;
  handlePreprocessedDropboxConfigInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handlePreprocessedDropboxConfigClear: () => void;
  handlePreprocessedDropboxConfigCancel: () => void;
  handleExportPreprocessedExperiment: () => Promise<void>;
  resetPreprocessedState: () => void;
};

export default function usePreprocessedExperiment({
  channels,
  setChannels,
  setActiveChannelId,
  setEditingChannelId,
  setChannelTrackStates,
  setTrackOrderModeByChannel,
  setSelectedTrackIds,
  setFollowedTrack,
  setIsExperimentSetupStarted,
  setExperimentDimension,
  setViewerMode,
  clearDatasetError,
  updateChannelIdCounter,
  loadSelectedDataset,
  showInteractionWarning,
  isLaunchingViewer,
  voxelResolution,
  experimentDimension
}: UsePreprocessedExperimentOptions): UsePreprocessedExperimentResult {
  const preprocessedFileInputRef = useRef<HTMLInputElement | null>(null);
  const preprocessedDropCounterRef = useRef(0);
  const preprocessedDropboxImportingRef = useRef(false);
  const dropboxCallbacksRef = useRef<PreprocessedDropboxCallbacks>({
    onResetLoader: () => {},
    onImportStart: () => {}
  });

  const importState = usePreprocessedImport({
    setChannels,
    setActiveChannelId,
    setEditingChannelId,
    setChannelTrackStates,
    setTrackOrderModeByChannel,
    setSelectedTrackIds,
    setFollowedTrack,
    setIsExperimentSetupStarted,
    setExperimentDimension,
    setViewerMode,
    clearDatasetError,
    updateChannelIdCounter,
    dropboxImportingRef: preprocessedDropboxImportingRef,
    dropboxCallbacksRef,
    preprocessedFileInputRef,
    preprocessedDropCounterRef
  });

  const dropboxState = useDropboxPreprocessed({
    importPreprocessedFile: importState.importPreprocessedFile,
    isPreprocessedImporting: importState.isPreprocessedImporting,
    isPreprocessedLoaderOpen: importState.isPreprocessedLoaderOpen,
    dropboxImportingRef: preprocessedDropboxImportingRef,
    dropboxCallbacksRef
  });

  const exportState = usePreprocessedExport({
    channels,
    preprocessedExperiment: importState.preprocessedExperiment,
    loadSelectedDataset,
    clearDatasetError,
    showInteractionWarning,
    isLaunchingViewer,
    voxelResolution,
    experimentDimension
  });

  return {
    preprocessedExperiment: importState.preprocessedExperiment,
    isPreprocessedLoaderOpen: importState.isPreprocessedLoaderOpen,
    isPreprocessedImporting: importState.isPreprocessedImporting,
    isPreprocessedDragActive: importState.isPreprocessedDragActive,
    isExportingPreprocessed: exportState.isExportingPreprocessed,
    preprocessedDropboxImporting: dropboxState.preprocessedDropboxImporting,
    preprocessedImportError: importState.preprocessedImportError,
    preprocessedImportBytesProcessed: importState.preprocessedImportBytesProcessed,
    preprocessedImportTotalBytes: importState.preprocessedImportTotalBytes,
    preprocessedImportVolumesDecoded: importState.preprocessedImportVolumesDecoded,
    preprocessedImportTotalVolumeCount: importState.preprocessedImportTotalVolumeCount,
    preprocessedDropboxError: dropboxState.preprocessedDropboxError,
    preprocessedDropboxInfo: dropboxState.preprocessedDropboxInfo,
    isPreprocessedDropboxConfigOpen: dropboxState.isPreprocessedDropboxConfigOpen,
    preprocessedDropboxAppKeyInput: dropboxState.preprocessedDropboxAppKeyInput,
    preprocessedDropboxAppKeySource: dropboxState.preprocessedDropboxAppKeySource,
    preprocessedFileInputRef,
    handlePreprocessedLoaderOpen: importState.handlePreprocessedLoaderOpen,
    handlePreprocessedLoaderClose: importState.handlePreprocessedLoaderClose,
    handlePreprocessedFileInputChange: importState.handlePreprocessedFileInputChange,
    handlePreprocessedBrowse: importState.handlePreprocessedBrowse,
    handlePreprocessedDragEnter: importState.handlePreprocessedDragEnter,
    handlePreprocessedDragLeave: importState.handlePreprocessedDragLeave,
    handlePreprocessedDragOver: importState.handlePreprocessedDragOver,
    handlePreprocessedDrop: importState.handlePreprocessedDrop,
    handlePreprocessedDropboxImport: dropboxState.handlePreprocessedDropboxImport,
    handlePreprocessedDropboxConfigSubmit: dropboxState.handlePreprocessedDropboxConfigSubmit,
    handlePreprocessedDropboxConfigInputChange: dropboxState.handlePreprocessedDropboxConfigInputChange,
    handlePreprocessedDropboxConfigClear: dropboxState.handlePreprocessedDropboxConfigClear,
    handlePreprocessedDropboxConfigCancel: dropboxState.handlePreprocessedDropboxConfigCancel,
    handleExportPreprocessedExperiment: exportState.handleExportPreprocessedExperiment,
    resetPreprocessedState: importState.resetPreprocessedState
  };
}
