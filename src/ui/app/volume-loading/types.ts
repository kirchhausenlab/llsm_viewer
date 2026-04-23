import type { Dispatch, SetStateAction } from 'react';

import type { LODPolicyDiagnosticsSnapshot } from '../../../core/lodPolicyDiagnostics';
import type {
  VolumeBackgroundMask,
  VolumeBrickAtlas,
  VolumeBrickPageTable,
  VolumeProvider,
  VolumeProviderDiagnostics
} from '../../../core/volumeProvider';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { LoadedDatasetLayer, StagedPreprocessedExperiment } from '../../../hooks/dataset';
import type { PlaybackIndexWindow } from '../../../shared/utils';
import type { ViewerCameraNavigationSample } from '../../../hooks/useVolumeRenderSetup';
import type { ViewerProjectionMode } from '../../../hooks/useVolumeRenderSetup';
import type { ResidencyDecision } from './residencyPolicy';

export type SetLaunchProgressOptions = {
  loadedCount: number;
  totalCount: number;
};

export type LaunchResourceLoadStrategy = 'default' | 'http-initial';

export type LaunchViewerOptions = {
  performanceMode?: boolean;
};

export type PlaybackWarmupFrameState = {
  slotIndex: number;
  timeIndex: number;
  scaleSignature: string;
  layerResidencyDecisions: Record<string, ResidencyDecision | null>;
  layerVolumes: Record<string, NormalizedVolume | null>;
  layerPageTables: Record<string, VolumeBrickPageTable | null>;
  layerBrickAtlases: Record<string, VolumeBrickAtlas | null>;
  backgroundMasksByScale: Record<number, VolumeBackgroundMask | null>;
};

export type UseRouteLayerVolumesOptions = {
  isViewerLaunched: boolean;
  isLaunchingViewer: boolean;
  isPerformanceMode?: boolean;
  isPlaying?: boolean;
  isPlaybackStartPending?: boolean;
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  volumeProvider: VolumeProvider | null;
  loadedChannelIds: string[];
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  channelVisibility: Record<string, boolean>;
  layerChannelMap: Map<string, string>;
  preferBrickResidency: boolean;
  projectionMode?: ViewerProjectionMode;
  viewerCameraSample?: ViewerCameraNavigationSample | null;
  volumeTimepointCount: number;
  playbackBufferFrameCount?: number;
  selectedIndex: number;
  playbackWindow?: PlaybackIndexWindow | null;
  clearDatasetError: () => void;
  beginLaunchSession: (options?: LaunchViewerOptions) => void;
  setLaunchExpectedVolumeCount: (count: number) => void;
  setLaunchProgress: (options: SetLaunchProgressOptions) => void;
  completeLaunchSession: (totalCount: number) => void;
  failLaunchSession: (message: string) => void;
  finishLaunchSessionAttempt: () => void;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  showLaunchError: (message: string) => void;
  onLaunchLayerVolumesResolved?: (layerVolumes: Record<string, NormalizedVolume | null>) => void;
};

export type RouteLayerVolumesState = {
  currentLayerResidencyDecisions: Record<string, ResidencyDecision | null>;
  currentLayerVolumes: Record<string, NormalizedVolume | null>;
  currentLayerPageTables: Record<string, VolumeBrickPageTable | null>;
  currentLayerBrickAtlases: Record<string, VolumeBrickAtlas | null>;
  currentBackgroundMasksByScale: Record<number, VolumeBackgroundMask | null>;
  playbackWarmupFrames: PlaybackWarmupFrameState[];
  playbackWarmupTimeIndex: number | null;
  playbackWarmupLayerVolumes: Record<string, NormalizedVolume | null>;
  playbackWarmupLayerPageTables: Record<string, VolumeBrickPageTable | null>;
  playbackWarmupLayerBrickAtlases: Record<string, VolumeBrickAtlas | null>;
  playbackWarmupBackgroundMasksByScale: Record<number, VolumeBackgroundMask | null>;
  volumeProviderDiagnostics: VolumeProviderDiagnostics | null;
  lodPolicyDiagnostics: LODPolicyDiagnosticsSnapshot | null;
  setCurrentLayerVolumes: Dispatch<SetStateAction<Record<string, NormalizedVolume | null>>>;
  playbackLayerKeys: string[];
  playbackResidencyDecisionByLayerKey: Record<string, ResidencyDecision>;
  playbackAtlasScaleLevelByLayerKey: Record<string, number>;
  handleLaunchViewer: (options?: LaunchViewerOptions) => Promise<void>;
};
