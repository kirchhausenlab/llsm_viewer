import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { clearTextureCache } from '../../../core/textureCache';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { ChannelSource, StagedPreprocessedExperiment, TrackSetSource } from '../../../hooks/dataset';
import type { LayerSettings } from '../../../state/layerSettings';
import type { FollowedVoxelTarget } from '../../../types/follow';
import type { HoveredVoxelInfo } from '../../../types/hover';
import type { ViewerCameraNavigationSample } from '../../../hooks/useVolumeRenderSetup';

type UseRouteDatasetResetStateOptions = {
  resetPreprocessedState: () => void;
  setPreprocessedExperiment: Dispatch<SetStateAction<StagedPreprocessedExperiment | null>>;
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setTracks: Dispatch<SetStateAction<TrackSetSource[]>>;
  setChannelVisibility: Dispatch<SetStateAction<Record<string, boolean>>>;
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
  setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
  setCurrentLayerVolumes: Dispatch<SetStateAction<Record<string, NormalizedVolume | null>>>;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  setZSliderValue: Dispatch<SetStateAction<number>>;
  resetChannelEditingState: () => void;
  setActiveChannelTabId: Dispatch<SetStateAction<string | null>>;
  resetTrackState: () => void;
  resetLaunchState: () => void;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  setHoveredVolumeVoxel: Dispatch<SetStateAction<HoveredVoxelInfo | null>>;
  setLastHoveredVolumeVoxel: Dispatch<SetStateAction<HoveredVoxelInfo | null>>;
  setFollowedVoxel: Dispatch<SetStateAction<FollowedVoxelTarget | null>>;
  setViewerCameraSample: Dispatch<SetStateAction<ViewerCameraNavigationSample | null>>;
  setResetViewHandler: Dispatch<SetStateAction<(() => void) | null>>;
  channelIdRef: MutableRefObject<number>;
  layerIdRef: MutableRefObject<number>;
  trackSetIdRef: MutableRefObject<number>;
  clearDatasetError: () => void;
};

type RouteDatasetResetState = {
  handleDiscardPreprocessedExperiment: () => void;
  handleReturnToFrontPage: () => void;
};

export function useRouteDatasetResetState({
  resetPreprocessedState,
  setPreprocessedExperiment,
  setChannels,
  setTracks,
  setChannelVisibility,
  setLayerSettings,
  setLayerAutoThresholds,
  setCurrentLayerVolumes,
  setSelectedIndex,
  setZSliderValue,
  resetChannelEditingState,
  setActiveChannelTabId,
  resetTrackState,
  resetLaunchState,
  setIsExperimentSetupStarted,
  setHoveredVolumeVoxel,
  setLastHoveredVolumeVoxel,
  setFollowedVoxel,
  setViewerCameraSample,
  setResetViewHandler,
  channelIdRef,
  layerIdRef,
  trackSetIdRef,
  clearDatasetError
}: UseRouteDatasetResetStateOptions): RouteDatasetResetState {
  const handleDiscardPreprocessedExperiment = useCallback(() => {
    resetPreprocessedState();
    setPreprocessedExperiment(null);
    setChannels([]);
    setTracks([]);
    setChannelVisibility({});
    setLayerSettings({});
    setLayerAutoThresholds({});
    setCurrentLayerVolumes({});
    setSelectedIndex(0);
    setZSliderValue(1);
    resetChannelEditingState();
    setActiveChannelTabId(null);
    resetTrackState();
    resetLaunchState();
    setIsExperimentSetupStarted(false);
    setHoveredVolumeVoxel(null);
    setLastHoveredVolumeVoxel(null);
    setFollowedVoxel(null);
    setViewerCameraSample(null);
    setResetViewHandler(null);
    channelIdRef.current = 0;
    layerIdRef.current = 0;
    trackSetIdRef.current = 0;
    clearTextureCache();
    clearDatasetError();
  }, [
    channelIdRef,
    clearDatasetError,
    layerIdRef,
    trackSetIdRef,
    resetChannelEditingState,
    resetLaunchState,
    resetPreprocessedState,
    resetTrackState,
    setActiveChannelTabId,
    setChannelVisibility,
    setChannels,
    setCurrentLayerVolumes,
    setFollowedVoxel,
    setHoveredVolumeVoxel,
    setIsExperimentSetupStarted,
    setLastHoveredVolumeVoxel,
    setLayerAutoThresholds,
    setLayerSettings,
    setPreprocessedExperiment,
    setResetViewHandler,
    setTracks,
    setSelectedIndex,
    setViewerCameraSample,
    setZSliderValue,
  ]);

  const handleReturnToFrontPage = useCallback(() => {
    handleDiscardPreprocessedExperiment();
  }, [handleDiscardPreprocessedExperiment]);

  return {
    handleDiscardPreprocessedExperiment,
    handleReturnToFrontPage
  };
}
