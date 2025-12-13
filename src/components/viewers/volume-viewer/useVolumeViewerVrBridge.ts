import { useEffect, useMemo, useState } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import type { TrackColorMode, TrackDefinition } from '../../../types/tracks';
import type {
  MovementState,
  TrackLineResource,
  VolumeResources,
  VolumeViewerVrChannelPanel,
  VolumeViewerVrProps,
} from '../VolumeViewer.types';
import type {
  ControllerEntry,
  PlaybackLoopState,
  PlaybackState,
  RaycasterLike,
  VrHoverState,
} from './vr/types';
import type { UseVolumeViewerVrParams, UseVolumeViewerVrResult } from './useVolumeViewerVr';

export type VolumeViewerVrBridgeOptions = {
  vr: VolumeViewerVrProps | undefined;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  currentDimensionsRef: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  volumeRootBaseOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeRootCenterOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeRootCenterUnscaledRef: MutableRefObject<THREE.Vector3>;
  volumeRootHalfExtentsRef: MutableRefObject<THREE.Vector3>;
  volumeNormalizationScaleRef: MutableRefObject<number>;
  volumeUserScaleRef: MutableRefObject<number>;
  volumeRootRotatedCenterTempRef: MutableRefObject<THREE.Vector3>;
  volumeStepScaleRef: MutableRefObject<number>;
  volumeYawRef: MutableRefObject<number>;
  volumePitchRef: MutableRefObject<number>;
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  timeIndexRef: MutableRefObject<number>;
  movementStateRef: MutableRefObject<MovementState>;
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  followTargetOffsetRef: MutableRefObject<THREE.Vector3 | null>;
  hasActive3DLayerRef: MutableRefObject<boolean>;
  playbackState: {
    isPlaying: boolean;
    playbackDisabled: boolean;
    playbackLabel: string;
    fps: number;
    timeIndex: number;
    totalTimepoints: number;
    onTogglePlayback: () => void;
    onTimeIndexChange: (nextIndex: number) => void;
    onFpsChange: (value: number) => void;
  };
  isVrPassthroughSupported: boolean;
  channelPanels: VolumeViewerVrChannelPanel[];
  activeChannelPanelId: string | null;
  trackChannels: Array<{ id: string; name: string }>;
  activeTrackChannelId: string | null;
  tracks: TrackDefinition[];
  trackVisibility: Record<string, boolean>;
  trackOpacityByChannel: Record<string, number>;
  trackLineWidthByChannel: Record<string, number>;
  channelTrackColorModes: Record<string, TrackColorMode>;
  selectedTrackIds: ReadonlySet<string>;
  followedTrackId: string | null;
  updateHoverState: (trackId: string | null, position: { x: number; y: number } | null, source?: 'pointer' | 'controller') => void;
  clearHoverState: (source?: 'pointer' | 'controller') => void;
  onResetVolume: () => void;
  onResetHudPlacement: () => void;
  onTrackFollowRequest: (trackId: string) => void;
  vrLog: (...args: Parameters<typeof console.debug>) => void;
  onAfterSessionEnd: () => void;
};

function createMutableRef<T>(value: T): MutableRefObject<T> {
  return { current: value };
}

export function useVolumeViewerVrBridge(options: VolumeViewerVrBridgeOptions) {
  const {
    vr,
    containerRef,
    rendererRef,
    cameraRef,
    controlsRef,
    sceneRef,
    volumeRootGroupRef,
    currentDimensionsRef,
    volumeRootBaseOffsetRef,
    volumeRootCenterOffsetRef,
    volumeRootCenterUnscaledRef,
    volumeRootHalfExtentsRef,
    volumeNormalizationScaleRef,
    volumeUserScaleRef,
    volumeRootRotatedCenterTempRef,
    volumeStepScaleRef,
    volumeYawRef,
    volumePitchRef,
    trackGroupRef,
    resourcesRef,
    timeIndexRef,
    movementStateRef,
    trackLinesRef,
    followTargetOffsetRef,
    hasActive3DLayerRef,
    playbackState,
    isVrPassthroughSupported,
    channelPanels,
    activeChannelPanelId,
    trackChannels,
    activeTrackChannelId,
    tracks,
    trackVisibility,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    selectedTrackIds,
    followedTrackId,
    updateHoverState,
    clearHoverState,
    onResetVolume,
    onResetHudPlacement,
    onTrackFollowRequest,
    vrLog,
    onAfterSessionEnd,
  } = options;

  const [vrIntegration, setVrIntegration] = useState<UseVolumeViewerVrResult | null>(null);

  useEffect(() => {
    if (!vr) {
      setVrIntegration(null);
    }
  }, [vr]);

  const playbackStateForVr = useMemo(
    () => ({ ...playbackState }),
    [playbackState],
  );

  const vrParams = useMemo<UseVolumeViewerVrParams | null>(
    () =>
      vr
        ? {
            vrProps: vr,
            containerRef,
            rendererRef,
            cameraRef,
            controlsRef,
            sceneRef,
            volumeRootGroupRef,
            currentDimensionsRef,
            volumeRootBaseOffsetRef,
            volumeRootCenterOffsetRef,
            volumeRootCenterUnscaledRef,
            volumeRootHalfExtentsRef,
            volumeNormalizationScaleRef,
            volumeUserScaleRef,
            volumeRootRotatedCenterTempRef,
            volumeStepScaleRef,
            volumeYawRef,
            volumePitchRef,
            trackGroupRef,
            resourcesRef,
            timeIndexRef,
            movementStateRef,
            trackLinesRef,
            followTargetOffsetRef,
            hasActive3DLayerRef,
            playbackState: playbackStateForVr,
            isVrPassthroughSupported,
            channelPanels,
            activeChannelPanelId,
            trackChannels,
            activeTrackChannelId,
            tracks,
            trackVisibility,
            trackOpacityByChannel,
            trackLineWidthByChannel,
            channelTrackColorModes,
            selectedTrackIds,
            followedTrackId,
            updateHoverState,
            clearHoverState,
            onResetVolume,
            onResetHudPlacement,
            onTrackFollowRequest,
            vrLog,
            onAfterSessionEnd,
          }
        : null,
    [
      vr,
      containerRef,
      rendererRef,
      cameraRef,
      controlsRef,
      sceneRef,
      volumeRootGroupRef,
      currentDimensionsRef,
      volumeRootBaseOffsetRef,
      volumeRootCenterOffsetRef,
      volumeRootCenterUnscaledRef,
      volumeRootHalfExtentsRef,
      volumeNormalizationScaleRef,
      volumeUserScaleRef,
      volumeRootRotatedCenterTempRef,
      volumeStepScaleRef,
      volumeYawRef,
      volumePitchRef,
      trackGroupRef,
      resourcesRef,
      timeIndexRef,
      movementStateRef,
      trackLinesRef,
      followTargetOffsetRef,
      hasActive3DLayerRef,
      playbackStateForVr,
      isVrPassthroughSupported,
      channelPanels,
      activeChannelPanelId,
      trackChannels,
      activeTrackChannelId,
      tracks,
      trackVisibility,
      trackOpacityByChannel,
      trackLineWidthByChannel,
      channelTrackColorModes,
      selectedTrackIds,
      followedTrackId,
      updateHoverState,
      clearHoverState,
      onResetVolume,
      onResetHudPlacement,
      onTrackFollowRequest,
      vrLog,
      onAfterSessionEnd,
    ],
  );

  const vrFallback = useMemo<UseVolumeViewerVrResult>(() => {
    const rejectSession = async () => {
      throw new Error('VR session is not available.');
    };
    return {
      callOnRegisterVrSession: () => {},
      requestVrSession: rejectSession,
      endVrSession: async () => {},
      vrPlaybackHudRef: createMutableRef(null),
      vrChannelsHudRef: createMutableRef(null),
      vrTracksHudRef: createMutableRef(null),
      vrPlaybackHudPlacementRef: createMutableRef(null),
      vrChannelsHudPlacementRef: createMutableRef(null),
      vrTracksHudPlacementRef: createMutableRef(null),
      vrTranslationHandleRef: createMutableRef(null),
      vrVolumeScaleHandleRef: createMutableRef(null),
      vrVolumeYawHandlesRef: createMutableRef<THREE.Mesh[]>([]),
      vrVolumePitchHandleRef: createMutableRef(null),
      playbackStateRef: createMutableRef<PlaybackState>({
        isPlaying: false,
        playbackDisabled: false,
        playbackLabel: '',
        fps: 0,
        timeIndex: 0,
        totalTimepoints: 0,
        onTogglePlayback: () => {},
        onTimeIndexChange: () => {},
        onFpsChange: () => {},
        passthroughSupported: false,
        preferredSessionMode: 'immersive-vr',
        currentSessionMode: null,
      }),
      playbackLoopRef: createMutableRef<PlaybackLoopState>({ lastTimestamp: null, accumulator: 0 }),
      vrHoverStateRef: createMutableRef<VrHoverState>({
        play: false,
        playbackSlider: false,
        playbackSliderActive: false,
        fpsSlider: false,
        fpsSliderActive: false,
        resetVolume: false,
        resetHud: false,
        exit: false,
        mode: false,
      }),
      controllersRef: createMutableRef<ControllerEntry[]>([]),
      setControllerVisibility: () => {},
      raycasterRef: createMutableRef<RaycasterLike | null>(null),
      xrSessionRef: createMutableRef<XRSession | null>(null),
      sessionCleanupRef: createMutableRef<(() => void) | null>(null),
      applyVrPlaybackHoverState: () => {},
      updateVrPlaybackHud: () => {},
      createVrPlaybackHud: () => null,
      createVrChannelsHud: () => null,
      createVrTracksHud: () => null,
      updateVrChannelsHud: () => {},
      updateVrTracksHud: () => {},
      updateVolumeHandles: () => {},
      updateHudGroupFromPlacement: () => {},
      resetVrPlaybackHudPlacement: () => {},
      resetVrChannelsHudPlacement: () => {},
      resetVrTracksHudPlacement: () => {},
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      restoreVrFoveation: () => {},
      onRendererInitialized: () => {},
      endVrSessionRequestRef: createMutableRef<(() => Promise<void> | void) | null>(null),
      updateControllerRays: () => {},
    };
  }, []);

  const vrApi = vrIntegration ?? vrFallback;

  return { vrApi, vrParams, vrIntegration, setVrIntegration };
}
