import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { clearTextureCache } from '../../../core/textureCache';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { ChannelSource, StagedPreprocessedExperiment } from '../../../hooks/dataset';
import type { LayerSettings } from '../../../state/layerSettings';

type UseRouteDatasetResetStateOptions = {
  resetPreprocessedState: () => void;
  setPreprocessedExperiment: Dispatch<SetStateAction<StagedPreprocessedExperiment | null>>;
  setChannels: Dispatch<SetStateAction<ChannelSource[]>>;
  setChannelVisibility: Dispatch<SetStateAction<Record<string, boolean>>>;
  setChannelActiveLayer: Dispatch<SetStateAction<Record<string, string>>>;
  setLayerSettings: Dispatch<SetStateAction<Record<string, LayerSettings>>>;
  setLayerAutoThresholds: Dispatch<SetStateAction<Record<string, number>>>;
  setCurrentLayerVolumes: Dispatch<SetStateAction<Record<string, NormalizedVolume | null>>>;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  resetChannelEditingState: () => void;
  setActiveChannelTabId: Dispatch<SetStateAction<string | null>>;
  resetTrackState: () => void;
  resetLaunchState: () => void;
  setIsExperimentSetupStarted: Dispatch<SetStateAction<boolean>>;
  channelIdRef: MutableRefObject<number>;
  layerIdRef: MutableRefObject<number>;
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
  setChannelVisibility,
  setChannelActiveLayer,
  setLayerSettings,
  setLayerAutoThresholds,
  setCurrentLayerVolumes,
  setSelectedIndex,
  resetChannelEditingState,
  setActiveChannelTabId,
  resetTrackState,
  resetLaunchState,
  setIsExperimentSetupStarted,
  channelIdRef,
  layerIdRef,
  clearDatasetError
}: UseRouteDatasetResetStateOptions): RouteDatasetResetState {
  const handleDiscardPreprocessedExperiment = useCallback(() => {
    resetPreprocessedState();
    setPreprocessedExperiment(null);
    setChannels([]);
    setChannelVisibility({});
    setChannelActiveLayer({});
    setLayerSettings({});
    setLayerAutoThresholds({});
    setCurrentLayerVolumes({});
    setSelectedIndex(0);
    resetChannelEditingState();
    setActiveChannelTabId(null);
    resetTrackState();
    resetLaunchState();
    setIsExperimentSetupStarted(false);
    channelIdRef.current = 0;
    layerIdRef.current = 0;
    clearTextureCache();
    clearDatasetError();
  }, [
    channelIdRef,
    clearDatasetError,
    layerIdRef,
    resetChannelEditingState,
    resetLaunchState,
    resetPreprocessedState,
    resetTrackState,
    setActiveChannelTabId,
    setChannelActiveLayer,
    setChannelVisibility,
    setChannels,
    setCurrentLayerVolumes,
    setIsExperimentSetupStarted,
    setLayerAutoThresholds,
    setLayerSettings,
    setPreprocessedExperiment,
    setSelectedIndex
  ]);

  const handleReturnToFrontPage = useCallback(() => {
    handleDiscardPreprocessedExperiment();
  }, [handleDiscardPreprocessedExperiment]);

  return {
    handleDiscardPreprocessedExperiment,
    handleReturnToFrontPage
  };
}
