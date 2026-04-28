import type { Dispatch, SetStateAction } from 'react';

import type { ChannelLayerState } from '../../../hooks/useChannelLayerState';
import type { DatasetSetupHook, LoadedDatasetLayer, StagedPreprocessedExperiment } from '../../../hooks/dataset';
import type { useTrackState } from '../../../hooks/tracks';
import type { DatasetSetupRouteProps } from '../../contracts/routes';
import type { RouteLaunchSessionState } from './useRouteLaunchSessionState';

export type ViewerLaunchRequest = {
  id: number;
  performanceMode: boolean;
};

export type ViewerRouteStateInput = {
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  setPreprocessedExperiment: Dispatch<SetStateAction<StagedPreprocessedExperiment | null>>;
  loadedDatasetLayers: LoadedDatasetLayer[];
  channels: ChannelLayerState['channels'];
  channelVisibility: ChannelLayerState['channelVisibility'];
  setChannelVisibility: ChannelLayerState['setChannelVisibility'];
  layerSettings: ChannelLayerState['layerSettings'];
  setLayerSettings: ChannelLayerState['setLayerSettings'];
  layerAutoThresholds: ChannelLayerState['layerAutoThresholds'];
  setLayerAutoThresholds: ChannelLayerState['setLayerAutoThresholds'];
  getChannelDefaultColor: ChannelLayerState['getChannelDefaultColor'];
  globalSamplingMode: ChannelLayerState['globalSamplingMode'];
  setGlobalSamplingMode: ChannelLayerState['setGlobalSamplingMode'];
  globalBlDensityScale: ChannelLayerState['globalBlDensityScale'];
  setGlobalBlDensityScale: ChannelLayerState['setGlobalBlDensityScale'];
  globalBlBackgroundCutoff: ChannelLayerState['globalBlBackgroundCutoff'];
  setGlobalBlBackgroundCutoff: ChannelLayerState['setGlobalBlBackgroundCutoff'];
  globalBlOpacityScale: ChannelLayerState['globalBlOpacityScale'];
  setGlobalBlOpacityScale: ChannelLayerState['setGlobalBlOpacityScale'];
  globalBlEarlyExitAlpha: ChannelLayerState['globalBlEarlyExitAlpha'];
  setGlobalBlEarlyExitAlpha: ChannelLayerState['setGlobalBlEarlyExitAlpha'];
  globalMipEarlyExitThreshold: ChannelLayerState['globalMipEarlyExitThreshold'];
  setGlobalMipEarlyExitThreshold: ChannelLayerState['setGlobalMipEarlyExitThreshold'];
  createLayerDefaultBrightnessState: ChannelLayerState['createLayerDefaultBrightnessState'];
  datasetSetup: Pick<
    DatasetSetupHook,
    | 'voxelResolution'
    | 'datasetErrors'
    | 'channelNameMap'
    | 'channelLayersMap'
    | 'layerChannelMap'
    | 'channelTintMap'
    | 'loadedChannelIds'
    | 'volumeTimepointCount'
    | 'showInteractionWarning'
  >;
  trackState: ReturnType<typeof useTrackState>;
  launchState: RouteLaunchSessionState;
  onReturnToFrontPage: () => void;
};

export type ViewerRouteProps = {
  visible: boolean;
  launchRequest: ViewerLaunchRequest | null;
  onLaunchRequestSettled: (requestId: number, launched: boolean) => void;
  state: ViewerRouteStateInput;
};

export type AppRouteState = {
  isViewerLaunched: boolean;
  datasetSetupProps: DatasetSetupRouteProps;
  viewerRouteProps: ViewerRouteProps | null;
};
