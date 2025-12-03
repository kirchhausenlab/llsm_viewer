import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { ChannelLayerState } from '../../../hooks/useChannelLayerState';
import type { DatasetErrorContext } from '../../../hooks/useDatasetErrors';
import type { ExperimentDimension } from '../../../hooks/useVoxelResolution';
import type { VoxelResolutionValues } from '../../../types/voxelResolution';

type LoadState = 'idle' | 'loading' | 'loaded' | 'error';

type UseDatasetLaunchParams = {
  voxelResolution: VoxelResolutionValues | null;
  anisotropyScale: { x: number; y: number; z: number } | null;
  experimentDimension: ExperimentDimension;
  loadSelectedDataset: ChannelLayerState['loadSelectedDataset'];
  clearDatasetError: () => void;
  reportDatasetError: (message: string, context: DatasetErrorContext) => void;
  bumpDatasetErrorResetSignal: () => void;
  datasetError: string | null;
  datasetErrorContext: DatasetErrorContext | null;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveChannelTabId: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useDatasetLaunch({
  voxelResolution,
  anisotropyScale,
  experimentDimension,
  loadSelectedDataset,
  clearDatasetError,
  reportDatasetError,
  bumpDatasetErrorResetSignal,
  datasetError,
  datasetErrorContext,
  setSelectedIndex,
  setIsPlaying,
  setActiveChannelTabId
}: UseDatasetLaunchParams) {
  const preprocessingSettingsRef = useRef<VoxelResolutionValues | null>(null);
  const [status, setStatus] = useState<LoadState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedVolumeCount, setExpectedVolumeCount] = useState(0);
  const [isViewerLaunched, setIsViewerLaunched] = useState(false);
  const [isLaunchingViewer, setIsLaunchingViewer] = useState(false);

  const showLaunchError = useCallback(
    (message: string) => reportDatasetError(message, 'launch'),
    [reportDatasetError]
  );

  const loadDataset = useCallback(
    () =>
      loadSelectedDataset({
        voxelResolution,
        anisotropyScale,
        experimentDimension,
        preprocessingSettingsRef,
        setStatus,
        setError,
        clearDatasetError,
        setSelectedIndex,
        setIsPlaying,
        setLoadProgress,
        setLoadedCount,
        setExpectedVolumeCount,
        setActiveChannelTabId,
        showLaunchError
      }),
    [
      anisotropyScale,
      clearDatasetError,
      experimentDimension,
      loadSelectedDataset,
      setActiveChannelTabId,
      setExpectedVolumeCount,
      setIsPlaying,
      setLoadProgress,
      setLoadedCount,
      setStatus,
      setError,
      setSelectedIndex,
      voxelResolution,
      showLaunchError
    ]
  );

  useEffect(() => {
    if (datasetError && datasetErrorContext === 'launch') {
      bumpDatasetErrorResetSignal();
    }
  }, [bumpDatasetErrorResetSignal, datasetError, datasetErrorContext]);

  const resetLaunchState = useCallback(() => {
    setStatus('idle');
    setError(null);
    setLoadProgress(0);
    setLoadedCount(0);
    setExpectedVolumeCount(0);
    setIsPlaying(false);
    setIsViewerLaunched(false);
    setIsLaunchingViewer(false);
  }, [setIsPlaying]);

  return {
    preprocessingSettingsRef,
    status,
    setStatus,
    error,
    setError,
    loadProgress,
    setLoadProgress,
    loadedCount,
    setLoadedCount,
    expectedVolumeCount,
    setExpectedVolumeCount,
    isViewerLaunched,
    setIsViewerLaunched,
    isLaunchingViewer,
    setIsLaunchingViewer,
    showLaunchError,
    loadDataset,
    resetLaunchState
  };
}

export type UseDatasetLaunchResult = ReturnType<typeof useDatasetLaunch>;
