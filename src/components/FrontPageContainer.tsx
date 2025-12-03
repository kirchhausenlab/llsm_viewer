import { useCallback, useEffect, useMemo } from 'react';
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  ChangeEvent,
  DragEvent,
  FormEvent
} from 'react';
import FrontPage from './FrontPage';
import usePreprocessedExperiment from '../hooks/usePreprocessedExperiment';
import {
  useVoxelResolution,
  type ExperimentDimension,
  type VoxelResolutionHook
} from '../hooks/useVoxelResolution';
import { useDatasetErrors, type DatasetErrorHook } from '../hooks/useDatasetErrors';
import type { DropboxAppKeySource } from '../integrations/dropbox';
import type { ChannelTrackState, FollowedTrackState } from '../types/channelTracks';
import type { LoadedLayer } from '../types/layers';
import type { ChannelSource, ChannelValidation, StagedPreprocessedExperiment } from '../hooks/useChannelSources';

type TrackSummary = { totalRows: number; uniqueTracks: number };

export type FrontPageContainerProps = {
  isExperimentSetupStarted: boolean;
  channels: ChannelSource[];
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  activeChannelId: string | null;
  activeChannel: ChannelSource | null;
  channelValidationMap: Map<string, ChannelValidation>;
  editingChannelId: string | null;
  editingChannelInputRef: MutableRefObject<HTMLInputElement | null>;
  editingChannelOriginalNameRef: MutableRefObject<string>;
  setActiveChannelId: Dispatch<SetStateAction<string | null>>;
  setEditingChannelId: Dispatch<SetStateAction<string | null>>;
  onStartExperimentSetup: () => void;
  onAddChannel: () => void;
  onReturnToStart: () => void;
  onChannelNameChange: (channelId: string, name: string) => void;
  onRemoveChannel: (channelId: string) => void;
  onChannelLayerFilesAdded: (channelId: string, files: File[]) => void | Promise<void>;
  onChannelLayerDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelLayerSegmentationToggle: (channelId: string, layerId: string, value: boolean) => void;
  onChannelLayerRemove: (channelId: string, layerId: string) => void;
  onChannelTrackFileSelected: (channelId: string, file: File | null) => void;
  onChannelTrackDrop: (channelId: string, dataTransfer: DataTransfer) => void;
  onChannelTrackClear: (channelId: string) => void;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setViewerMode: Dispatch<SetStateAction<'3d' | '2d'>>;
  updateChannelIdCounter: (sources: ChannelSource[]) => void;
  loadSelectedDataset: () => Promise<LoadedLayer[] | null>;
  showInteractionWarning: (message: string) => void;
  isLaunchingViewer: boolean;
  setChannelTrackStates: Dispatch<SetStateAction<Record<string, ChannelTrackState>>>;
  setTrackOrderModeByChannel: Dispatch<SetStateAction<Record<string, 'id' | 'length'>>>;
  setSelectedTrackOrder: Dispatch<SetStateAction<string[]>>;
  setFollowedTrack: Dispatch<SetStateAction<FollowedTrackState>>;
  computeTrackSummary: (entries: string[][]) => TrackSummary;
  hasGlobalTimepointMismatch: boolean;
  interactionErrorMessage: string | null;
  launchErrorMessage: string | null;
  onLaunchViewer: () => void;
  canLaunch: boolean;
  warningWindowInitialPosition: { x: number; y: number };
  warningWindowWidth: number;
  onPreprocessedStateChange?: (state: {
    preprocessedExperiment: StagedPreprocessedExperiment | null;
    resetPreprocessedState: () => void;
  }) => void;
  onDatasetErrorsChange?: (state: DatasetErrorHook) => void;
  onVoxelResolutionChange?: (state: VoxelResolutionHook) => void;
};

export default function FrontPageContainer({
  isExperimentSetupStarted,
  channels,
  setChannels,
  activeChannelId,
  activeChannel,
  channelValidationMap,
  editingChannelId,
  editingChannelInputRef,
  editingChannelOriginalNameRef,
  setActiveChannelId,
  setEditingChannelId,
  onStartExperimentSetup,
  onAddChannel,
  onReturnToStart,
  onChannelNameChange,
  onRemoveChannel,
  onChannelLayerFilesAdded,
  onChannelLayerDrop,
  onChannelLayerSegmentationToggle,
  onChannelLayerRemove,
  onChannelTrackFileSelected,
  onChannelTrackDrop,
  onChannelTrackClear,
  setIsExperimentSetupStarted,
  setViewerMode,
  updateChannelIdCounter,
  loadSelectedDataset,
  showInteractionWarning,
  isLaunchingViewer,
  setChannelTrackStates,
  setTrackOrderModeByChannel,
  setSelectedTrackOrder,
  setFollowedTrack,
  computeTrackSummary,
  hasGlobalTimepointMismatch,
  interactionErrorMessage,
  launchErrorMessage,
  onLaunchViewer,
  canLaunch,
  warningWindowInitialPosition,
  warningWindowWidth,
  onPreprocessedStateChange,
  onDatasetErrorsChange,
  onVoxelResolutionChange
}: FrontPageContainerProps) {
  const {
    voxelResolutionInput,
    voxelResolution,
    anisotropyScale,
    experimentDimension,
    trackScale,
    handleVoxelResolutionAxisChange,
    handleVoxelResolutionUnitChange,
    handleVoxelResolutionAnisotropyToggle,
    handleExperimentDimensionChange,
    setExperimentDimension,
    setVoxelResolutionInput
  } = useVoxelResolution();
  const datasetErrors = useDatasetErrors();
  const {
    datasetError,
    datasetErrorContext,
    datasetErrorResetSignal,
    reportDatasetError,
    clearDatasetError,
    bumpDatasetErrorResetSignal
  } = datasetErrors;

  useEffect(() => {
    onVoxelResolutionChange?.({
      voxelResolutionInput,
      voxelResolution,
      anisotropyScale,
      experimentDimension,
      trackScale,
      handleVoxelResolutionAxisChange,
      handleVoxelResolutionUnitChange,
      handleVoxelResolutionAnisotropyToggle,
      handleExperimentDimensionChange,
      setExperimentDimension,
      setVoxelResolutionInput
    });
  }, [
    anisotropyScale,
    experimentDimension,
    handleExperimentDimensionChange,
    handleVoxelResolutionAnisotropyToggle,
    handleVoxelResolutionAxisChange,
    handleVoxelResolutionUnitChange,
    onVoxelResolutionChange,
    setExperimentDimension,
    setVoxelResolutionInput,
    trackScale,
    voxelResolution,
    voxelResolutionInput
  ]);

  useEffect(() => {
    onDatasetErrorsChange?.({
      datasetError,
      datasetErrorContext,
      datasetErrorResetSignal,
      reportDatasetError,
      clearDatasetError,
      bumpDatasetErrorResetSignal
    });
  }, [
    bumpDatasetErrorResetSignal,
    clearDatasetError,
    datasetError,
    datasetErrorContext,
    datasetErrorResetSignal,
    onDatasetErrorsChange,
    reportDatasetError
  ]);

  useEffect(() => {
    return () => {
      onDatasetErrorsChange?.({
        datasetError: null,
        datasetErrorContext: null,
        datasetErrorResetSignal: 0,
        reportDatasetError: () => {},
        clearDatasetError: () => {},
        bumpDatasetErrorResetSignal: () => {}
      });
    };
  }, [onDatasetErrorsChange]);

  const handleLoadSelectedDataset = useCallback(() => {
    setIsExperimentSetupStarted(true);
    setExperimentDimension(experimentDimension);
    return loadSelectedDataset();
  }, [experimentDimension, loadSelectedDataset, setExperimentDimension, setIsExperimentSetupStarted]);

  const preprocessedState = usePreprocessedExperiment({
    channels,
    setChannels,
    setActiveChannelId,
    setEditingChannelId,
    setChannelTrackStates,
    setTrackOrderModeByChannel,
    setSelectedTrackOrder,
    setFollowedTrack,
    setIsExperimentSetupStarted,
    setExperimentDimension,
    setViewerMode,
    clearDatasetError,
    updateChannelIdCounter,
    loadSelectedDataset: handleLoadSelectedDataset,
    showInteractionWarning,
    isLaunchingViewer,
    voxelResolution,
    experimentDimension
  });

  useEffect(() => {
    onPreprocessedStateChange?.({
      preprocessedExperiment: preprocessedState.preprocessedExperiment,
      resetPreprocessedState: preprocessedState.resetPreprocessedState
    });
  }, [onPreprocessedStateChange, preprocessedState.preprocessedExperiment, preprocessedState.resetPreprocessedState]);

  const frontPageMode = useMemo<'initial' | 'configuring' | 'preprocessed'>(() => {
    if (preprocessedState.preprocessedExperiment) {
      return 'preprocessed';
    }
    if (channels.length > 0 || isExperimentSetupStarted) {
      return 'configuring';
    }
    return 'initial';
  }, [channels.length, isExperimentSetupStarted, preprocessedState.preprocessedExperiment]);

  const isFrontPageLocked =
    isLaunchingViewer ||
    preprocessedState.isExportingPreprocessed ||
    preprocessedState.isPreprocessedImporting ||
    preprocessedState.preprocessedDropboxImporting;

  const launchButtonEnabled =
    frontPageMode === 'preprocessed' ? preprocessedState.preprocessedExperiment !== null : canLaunch;
  const launchButtonLaunchable = launchButtonEnabled ? 'true' : 'false';

  return (
    <FrontPage
      isFrontPageLocked={isFrontPageLocked}
      frontPageMode={frontPageMode}
      channels={channels}
      activeChannelId={activeChannelId}
      activeChannel={activeChannel}
      channelValidationMap={channelValidationMap}
      editingChannelId={editingChannelId}
      editingChannelInputRef={editingChannelInputRef}
      editingChannelOriginalNameRef={editingChannelOriginalNameRef}
      setActiveChannelId={setActiveChannelId}
      setEditingChannelId={setEditingChannelId}
      onStartExperimentSetup={onStartExperimentSetup}
      onAddChannel={onAddChannel}
      onOpenPreprocessedLoader={preprocessedState.handlePreprocessedLoaderOpen}
      onReturnToStart={onReturnToStart}
      experimentDimension={experimentDimension}
      onExperimentDimensionChange={handleExperimentDimensionChange}
      voxelResolution={voxelResolutionInput}
      onVoxelResolutionAxisChange={handleVoxelResolutionAxisChange}
      onVoxelResolutionUnitChange={handleVoxelResolutionUnitChange}
      onVoxelResolutionAnisotropyToggle={handleVoxelResolutionAnisotropyToggle}
      isPreprocessedLoaderOpen={preprocessedState.isPreprocessedLoaderOpen}
      isPreprocessedDragActive={preprocessedState.isPreprocessedDragActive}
      onPreprocessedDragEnter={preprocessedState.handlePreprocessedDragEnter}
      onPreprocessedDragLeave={preprocessedState.handlePreprocessedDragLeave}
      onPreprocessedDragOver={preprocessedState.handlePreprocessedDragOver}
      onPreprocessedDrop={preprocessedState.handlePreprocessedDrop}
      preprocessedFileInputRef={preprocessedState.preprocessedFileInputRef}
      onPreprocessedFileInputChange={preprocessedState.handlePreprocessedFileInputChange}
      isPreprocessedImporting={preprocessedState.isPreprocessedImporting}
      preprocessedImportBytesProcessed={preprocessedState.preprocessedImportBytesProcessed}
      preprocessedImportTotalBytes={preprocessedState.preprocessedImportTotalBytes}
      preprocessedImportVolumesDecoded={preprocessedState.preprocessedImportVolumesDecoded}
      preprocessedImportTotalVolumeCount={preprocessedState.preprocessedImportTotalVolumeCount}
      preprocessedDropboxImporting={preprocessedState.preprocessedDropboxImporting}
      onPreprocessedBrowse={preprocessedState.handlePreprocessedBrowse}
      onPreprocessedDropboxImport={preprocessedState.handlePreprocessedDropboxImport}
      preprocessedImportError={preprocessedState.preprocessedImportError}
      preprocessedDropboxError={preprocessedState.preprocessedDropboxError}
      preprocessedDropboxInfo={preprocessedState.preprocessedDropboxInfo}
      isPreprocessedDropboxConfigOpen={preprocessedState.isPreprocessedDropboxConfigOpen}
      onPreprocessedDropboxConfigSubmit={preprocessedState.handlePreprocessedDropboxConfigSubmit}
      preprocessedDropboxAppKeyInput={preprocessedState.preprocessedDropboxAppKeyInput}
      onPreprocessedDropboxConfigInputChange={preprocessedState.handlePreprocessedDropboxConfigInputChange}
      preprocessedDropboxAppKeySource={preprocessedState.preprocessedDropboxAppKeySource as DropboxAppKeySource | null}
      onPreprocessedDropboxConfigCancel={preprocessedState.handlePreprocessedDropboxConfigCancel}
      onPreprocessedDropboxConfigClear={preprocessedState.handlePreprocessedDropboxConfigClear}
      onChannelNameChange={onChannelNameChange}
      onRemoveChannel={onRemoveChannel}
      onChannelLayerFilesAdded={onChannelLayerFilesAdded}
      onChannelLayerDrop={onChannelLayerDrop}
      onChannelLayerSegmentationToggle={onChannelLayerSegmentationToggle}
      onChannelLayerRemove={onChannelLayerRemove}
      onChannelTrackFileSelected={onChannelTrackFileSelected}
      onChannelTrackDrop={onChannelTrackDrop}
      onChannelTrackClear={onChannelTrackClear}
      preprocessedExperiment={preprocessedState.preprocessedExperiment}
      computeTrackSummary={computeTrackSummary}
      hasGlobalTimepointMismatch={hasGlobalTimepointMismatch}
      interactionErrorMessage={interactionErrorMessage}
      launchErrorMessage={launchErrorMessage}
      onLaunchViewer={onLaunchViewer}
      isLaunchingViewer={isLaunchingViewer}
      launchButtonEnabled={launchButtonEnabled}
      launchButtonLaunchable={launchButtonLaunchable}
      onExportPreprocessedExperiment={preprocessedState.handleExportPreprocessedExperiment}
      isExportingPreprocessed={preprocessedState.isExportingPreprocessed}
      canLaunch={canLaunch}
      warningWindowInitialPosition={warningWindowInitialPosition}
      warningWindowWidth={warningWindowWidth}
      datasetErrorResetSignal={datasetErrorResetSignal}
      onDatasetErrorDismiss={clearDatasetError}
    />
  );
}
