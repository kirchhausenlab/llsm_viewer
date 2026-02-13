import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { VrSessionManager } from './vr/sessionManager';

export * from './vr';
export type { UseVolumeViewerVrParams, UseVolumeViewerVrResult, VolumeHandleCandidate } from './useVolumeViewerVr.types';

import type { UseVolumeViewerVrParams, UseVolumeViewerVrResult } from './useVolumeViewerVr.types';
import type {
  ControllerEntry,
  RaycasterLike,
  VrChannelsHud,
  VrChannelsState,
  PlaybackLoopState,
  PlaybackState,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksState,
  VrHoverState,
} from './vr';
import { XR_TARGET_FOVEATION } from './vr';
import { createHudHelpers } from './useVolumeViewerVr/helpers/hud';
import { createVolumeHelpers } from './useVolumeViewerVr/helpers/volume';
import { useVrHudBindings } from './useVolumeViewerVr/useVrHudBindings';
import { useVrHudInteractions } from './useVolumeViewerVr/useVrHudInteractions';
import { useVrPlaybackBindings } from './useVolumeViewerVr/useVrPlaybackBindings';
import { useVrSession } from './useVolumeViewerVr/useVrSession';
import { useVrControllers } from './useVolumeViewerVr/useVrControllers';
import type { ControllerRaySummary } from './vr/controllerRayRegionState';

export function useVolumeViewerVr({
  vrProps,
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
  volumeAnisotropyScaleRef,
  volumeUserScaleRef,
  volumeRootRotatedCenterTempRef,
  volumeStepScaleRef,
  volumeYawRef,
  volumePitchRef,
  trackGroupRef,
  resourcesRef,
  trackLinesRef,
  hasActive3DLayerRef,
  playbackState,
  isVrPassthroughSupported,
  channelPanels,
  activeChannelPanelId,
  trackChannels,
  activeTrackChannelId,
  tracks,
  trackVisibility,
  trackOpacityByTrackSet,
  trackLineWidthByTrackSet,
  trackColorModesByTrackSet,
  selectedTrackIds,
  followedTrackId,
  updateHoverState,
  clearHoverState,
  onResetVolume,
  onResetHudPlacement,
  onTrackFollowRequest,
  vrLog,
  onAfterSessionEnd,
}: UseVolumeViewerVrParams): UseVolumeViewerVrResult {
  const {
    isPlaying,
    playbackDisabled,
    playbackLabel,
    fps,
    timeIndex,
    totalTimepoints,
    onTogglePlayback,
    onTimeIndexChange,
    onFpsChange,
  } = playbackState;
  const controllersRef = useRef<ControllerEntry[]>([]);
  const sessionManagerRef = useRef<VrSessionManager | null>(null);
  const raycasterRef = useRef<RaycasterLike | null>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  const sessionCleanupRef = useRef<(() => void) | null>(null);
  const preVrCameraStateRef = useRef<{
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    target: THREE.Vector3;
  } | null>(null);
  const xrPreferredSessionModeRef = useRef<'immersive-vr' | 'immersive-ar'>('immersive-vr');
  const xrCurrentSessionModeRef = useRef<'immersive-vr' | 'immersive-ar' | null>(null);
  const xrPendingModeSwitchRef = useRef<'immersive-vr' | 'immersive-ar' | null>(null);
  const xrPassthroughSupportedRef = useRef(isVrPassthroughSupported);
  const xrFoveationAppliedRef = useRef(false);
  const xrPreviousFoveationRef = useRef<number | undefined>(undefined);
  const endVrSessionRequestRef = useRef<(() => Promise<void> | void) | null>(null);
  const disposedRef = useRef(false);
  const requestVrSessionRef = useRef<(() => Promise<XRSession>) | null>(null);
  const vrPropsRef = useRef(vrProps ?? null);
  vrPropsRef.current = vrProps ?? null;

  const vrLogRef = useRef(vrLog);
  vrLogRef.current = vrLog;
  const onResetVolumeRef = useRef(onResetVolume);
  onResetVolumeRef.current = onResetVolume;
  const onResetHudPlacementRef = useRef(onResetHudPlacement);
  onResetHudPlacementRef.current = onResetHudPlacement;
  const onTrackFollowRequestRef = useRef(onTrackFollowRequest);
  onTrackFollowRequestRef.current = onTrackFollowRequest;

  const [controllerSetupRevision, setControllerSetupRevision] = useState(0);

  useEffect(() => {
    return () => {
      disposedRef.current = true;
    };
  }, []);

  const vrContainerRef = useRef(containerRef);
  vrContainerRef.current = containerRef;
  const vrUpdateHoverStateRef = useRef(updateHoverState);
  vrUpdateHoverStateRef.current = updateHoverState;
  const vrClearHoverStateRef = useRef(clearHoverState);
  vrClearHoverStateRef.current = clearHoverState;

  const lastControllerRaySummaryRef = useRef<ControllerRaySummary | null>(null);
  const updateControllerRaysRef = useRef<() => void>(() => {});

  const vrPlaybackHudRef = useRef<VrPlaybackHud | null>(null);
  const vrChannelsHudRef = useRef<VrChannelsHud | null>(null);
  const vrTracksHudRef = useRef<VrTracksHud | null>(null);
  const vrPlaybackHudPlacementRef = useRef<VrHudPlacement | null>(null);
  const vrChannelsHudPlacementRef = useRef<VrHudPlacement | null>(null);
  const vrTracksHudPlacementRef = useRef<VrHudPlacement | null>(null);
  const vrHudPlaneRef = useRef(new THREE.Plane());
  const vrHudPlanePointRef = useRef(new THREE.Vector3());
  const vrPlaybackHudDragTargetRef = useRef(new THREE.Vector3());
  const vrChannelsHudDragTargetRef = useRef(new THREE.Vector3());
  const vrTracksHudDragTargetRef = useRef(new THREE.Vector3());
  const vrHudOffsetTempRef = useRef(new THREE.Vector3());
  const vrChannelsLocalPointRef = useRef(new THREE.Vector3());
  const vrTracksLocalPointRef = useRef(new THREE.Vector3());
  const vrHudForwardRef = useRef(new THREE.Vector3(0, 0, 1));
  const vrHudYawEulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const vrHudYawQuaternionRef = useRef(new THREE.Quaternion());
  const vrHudYawVectorRef = useRef(new THREE.Vector3());
  const vrHudPitchVectorRef = useRef(new THREE.Vector3());
  const vrTranslationHandleRef = useRef<THREE.Mesh | null>(null);
  const vrVolumeScaleHandleRef = useRef<THREE.Mesh | null>(null);
  const vrVolumeYawHandlesRef = useRef<THREE.Mesh[]>([]);
  const vrVolumePitchHandleRef = useRef<THREE.Mesh | null>(null);
  const vrHandleLocalPointRef = useRef(new THREE.Vector3());
  const vrHandleWorldPointRef = useRef(new THREE.Vector3());
  const vrHandleSecondaryPointRef = useRef(new THREE.Vector3());
  const vrHandleDirectionTempRef = useRef(new THREE.Vector3());
  const vrHandleQuaternionTempRef = useRef(new THREE.Quaternion());
  const sliderLocalPointRef = useRef(new THREE.Vector3());
  const playbackStateRef = useRef<PlaybackState>({
    isPlaying,
    playbackDisabled,
    playbackLabel,
    fps,
    timeIndex,
    totalTimepoints,
    onTogglePlayback,
    onTimeIndexChange,
    onFpsChange,
    passthroughSupported: isVrPassthroughSupported,
    preferredSessionMode: 'immersive-vr',
    currentSessionMode: null,
  });
  const playbackLoopRef = useRef<PlaybackLoopState>({ lastTimestamp: null, accumulator: 0 });
  const vrHoverStateRef = useRef<VrHoverState>({
    play: false,
    playbackSlider: false,
    playbackSliderActive: false,
    fpsSlider: false,
    fpsSliderActive: false,
    resetVolume: false,
    resetHud: false,
    exit: false,
    mode: false,
  });
  const vrChannelsStateRef = useRef<VrChannelsState>({ channels: [], activeChannelId: null });
  const vrTracksStateRef = useRef<VrTracksState>({ channels: [], activeChannelId: null });

  const hudHelpers = useMemo(
    () =>
      createHudHelpers({
        cameraRef,
        volumeRootGroupRef,
        volumeRootBaseOffsetRef,
        volumeRootHalfExtentsRef,
        playbackStateRef,
        vrHoverStateRef,
        vrChannelsStateRef,
        vrTracksStateRef,
        vrPlaybackHudRef,
        vrChannelsHudRef,
        vrTracksHudRef,
        vrPlaybackHudPlacementRef,
        vrChannelsHudPlacementRef,
        vrTracksHudPlacementRef,
        vrPlaybackHudDragTargetRef,
        vrChannelsHudDragTargetRef,
        vrTracksHudDragTargetRef,
        vrHudOffsetTempRef,
        vrHudYawEulerRef,
        vrHudYawQuaternionRef,
        sliderLocalPointRef,
        vrChannelsLocalPointRef,
        vrTracksLocalPointRef,
      }),
    [
      cameraRef,
      volumeRootGroupRef,
      volumeRootBaseOffsetRef,
      volumeRootHalfExtentsRef,
      playbackStateRef,
      vrHoverStateRef,
      vrChannelsStateRef,
      vrTracksStateRef,
      vrPlaybackHudRef,
      vrChannelsHudRef,
      vrTracksHudRef,
      vrPlaybackHudPlacementRef,
      vrChannelsHudPlacementRef,
      vrTracksHudPlacementRef,
      vrPlaybackHudDragTargetRef,
      vrChannelsHudDragTargetRef,
      vrTracksHudDragTargetRef,
      vrHudOffsetTempRef,
      vrHudYawEulerRef,
      vrHudYawQuaternionRef,
      sliderLocalPointRef,
      vrChannelsLocalPointRef,
      vrTracksLocalPointRef,
    ],
  );

  const {
    applyPlaybackSliderFromWorldPoint,
    applyFpsSliderFromWorldPoint,
    resolveChannelsRegionFromPoint,
    resolveTracksRegionFromPoint,
    applyPlaybackHoverState: applyVrPlaybackHoverState,
    setPlaybackHudVisible: setVrPlaybackHudVisible,
    setChannelsHudVisible: setVrChannelsHudVisible,
    setTracksHudVisible: setVrTracksHudVisible,
    createPlaybackHud: createVrPlaybackHud,
    createChannelsHud: createVrChannelsHud,
    createTracksHud: createVrTracksHud,
    renderChannelsHud: renderVrChannelsHud,
    renderTracksHud: renderVrTracksHud,
    updatePlaybackHud: updateVrPlaybackHud,
    updateChannelsHud: updateVrChannelsHud,
    updateTracksHud: updateVrTracksHud,
    setPlaybackPlacementPosition: setVrPlaybackHudPlacementPosition,
    setChannelsPlacementPosition: setVrChannelsHudPlacementPosition,
    setTracksPlacementPosition: setVrTracksHudPlacementPosition,
    setPlaybackPlacementYaw: setVrPlaybackHudPlacementYaw,
    setChannelsPlacementYaw: setVrChannelsHudPlacementYaw,
    setTracksPlacementYaw: setVrTracksHudPlacementYaw,
    setPlaybackPlacementPitch: setVrPlaybackHudPlacementPitch,
    setChannelsPlacementPitch: setVrChannelsHudPlacementPitch,
    setTracksPlacementPitch: setVrTracksHudPlacementPitch,
    resetPlaybackPlacement: resetVrPlaybackHudPlacement,
    resetChannelsPlacement: resetVrChannelsHudPlacement,
    resetTracksPlacement: resetVrTracksHudPlacement,
    updateHudGroupFromPlacement,
  } = hudHelpers;

  const onLayerWindowMinChange = vrProps?.onLayerWindowMinChange;
  const onLayerWindowMaxChange = vrProps?.onLayerWindowMaxChange;
  const onLayerContrastChange = vrProps?.onLayerContrastChange;
  const onLayerBrightnessChange = vrProps?.onLayerBrightnessChange;
  const onLayerOffsetChange = vrProps?.onLayerOffsetChange;
  const onTrackOpacityChange = vrProps?.onTrackOpacityChange;
  const onTrackLineWidthChange = vrProps?.onTrackLineWidthChange;

  const setControllerVisibility = useCallback<
    UseVolumeViewerVrResult['setControllerVisibility']
  >(
    (shouldShow) => {
      let anyVisible = false;
      const visibilitySnapshot: Array<{
        index: number;
        visible: boolean;
        isConnected: boolean;
        targetRayMode: string | null;
      }> = [];
      controllersRef.current.forEach((entry, index) => {
        const visible = shouldShow && entry.isConnected && entry.targetRayMode !== 'tracked-hand';
        entry.controller.visible = visible;
        entry.grip.visible = visible;
        entry.ray.visible = visible;
        entry.touchIndicator.visible = visible;
        visibilitySnapshot.push({
          index,
          visible,
          isConnected: entry.isConnected,
          targetRayMode: entry.targetRayMode,
        });
        if (!visible) {
          entry.hoverTrackId = null;
          entry.hoverUiTarget = null;
          entry.activeUiTarget = null;
          entry.hasHoverUiPoint = false;
          entry.hudGrabOffsets.playback = null;
          entry.hudGrabOffsets.channels = null;
          entry.hudGrabOffsets.tracks = null;
          entry.translateGrabOffset = null;
          entry.volumeRotationState = null;
          entry.hudRotationState = null;
        } else {
          anyVisible = true;
        }
      });
      if (import.meta.env?.DEV) {
        console.debug('[VR] controller visibility', { shouldShow, visibilitySnapshot });
      }
      if (!anyVisible) {
        vrClearHoverStateRef.current?.('controller');
        applyVrPlaybackHoverState(false, false, false, false, false, false, false, false, false);
      }
    },
    [applyVrPlaybackHoverState, controllersRef, vrClearHoverStateRef],
  );

  const refreshControllerVisibility = useCallback(() => {
    sessionManagerRef.current?.refreshControllerVisibility();
  }, [sessionManagerRef]);

  const setPreferredXrSessionMode = useCallback(
    (mode: 'immersive-vr' | 'immersive-ar') => {
      sessionManagerRef.current?.setPreferredSessionMode(mode);
    },
    [sessionManagerRef],
  );

  const toggleXrSessionMode = useCallback(() => {
    sessionManagerRef.current?.togglePreferredSessionMode();
  }, [sessionManagerRef]);
  useVrPlaybackBindings({
    playbackStateRef,
    xrPassthroughSupportedRef,
    isPlaying,
    playbackDisabled,
    playbackLabel,
    fps,
    timeIndex,
    totalTimepoints,
    onTogglePlayback,
    onTimeIndexChange,
    onFpsChange,
    isVrPassthroughSupported,
    setPreferredXrSessionMode,
    updateVrPlaybackHud,
  });

  useVrHudBindings({
    channelPanels,
    activeChannelPanelId,
    vrChannelsStateRef,
    updateVrChannelsHud,
    trackChannels,
    tracks,
    trackVisibility,
    trackOpacityByTrackSet,
    trackLineWidthByTrackSet,
    trackColorModesByTrackSet,
    activeTrackChannelId,
    followedTrackId,
    selectedTrackIds,
    vrTracksStateRef,
    updateVrTracksHud,
  });

  const {
    applyVrChannelsSliderFromPoint,
    applyVrTracksSliderFromPoint,
    applyVrTracksScrollFromPoint,
  } = useVrHudInteractions({
    vrChannelsHudRef,
    vrTracksHudRef,
    sliderLocalPointRef,
    vrChannelsStateRef,
    vrTracksStateRef,
    renderVrChannelsHud,
    renderVrTracksHud,
    onLayerWindowMinChange,
    onLayerWindowMaxChange,
    onLayerContrastChange,
    onLayerBrightnessChange,
    onLayerOffsetChange,
    onTrackOpacityChange,
    onTrackLineWidthChange,
  });

  const volumeHelpers = useMemo(
    () =>
      createVolumeHelpers({
        rendererRef,
        volumeRootGroupRef,
        currentDimensionsRef,
        hasActive3DLayerRef,
        volumeUserScaleRef,
        volumeRootCenterUnscaledRef,
        volumeRootHalfExtentsRef,
        vrHandleLocalPointRef,
        vrTranslationHandleRef,
        vrVolumeScaleHandleRef,
        vrVolumeYawHandlesRef,
        vrVolumePitchHandleRef,
        volumeRootBaseOffsetRef,
        volumeRootCenterOffsetRef,
        volumeRootRotatedCenterTempRef,
        volumeYawRef,
        volumePitchRef,
        vrHudYawEulerRef,
        vrHandleQuaternionTempRef,
        volumeNormalizationScaleRef,
        volumeAnisotropyScaleRef,
        volumeStepScaleRef,
        resourcesRef,
      }),
    [
      rendererRef,
      volumeRootGroupRef,
      currentDimensionsRef,
      hasActive3DLayerRef,
      volumeUserScaleRef,
      volumeRootCenterUnscaledRef,
      volumeRootHalfExtentsRef,
      vrHandleLocalPointRef,
      vrTranslationHandleRef,
      vrVolumeScaleHandleRef,
      vrVolumeYawHandlesRef,
      vrVolumePitchHandleRef,
      volumeRootBaseOffsetRef,
      volumeRootCenterOffsetRef,
      volumeRootRotatedCenterTempRef,
      volumeYawRef,
      volumePitchRef,
      vrHudYawEulerRef,
      vrHandleQuaternionTempRef,
      volumeNormalizationScaleRef,
      volumeAnisotropyScaleRef,
      volumeStepScaleRef,
      resourcesRef,
    ],
  );

  const {
    updateVolumeHandles,
    applyVolumeYawPitch,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
  } = volumeHelpers;

  const applyVrFoveation = useCallback(
    (target: number = XR_TARGET_FOVEATION) => {
      sessionManagerRef.current?.applyFoveation(target);
    },
    [sessionManagerRef],
  );

  const restoreVrFoveation = useCallback(() => {
    sessionManagerRef.current?.restoreFoveation();
  }, [sessionManagerRef]);
  const sessionParams = useMemo(
    () => ({
      rendererRef,
      cameraRef,
      controlsRef,
      sceneRef,
      controllersRef,
      playbackStateRef,
      xrSessionRef,
      sessionCleanupRef,
      preVrCameraStateRef,
      xrPreferredSessionModeRef,
      xrCurrentSessionModeRef,
      xrPendingModeSwitchRef,
      xrPassthroughSupportedRef,
      xrFoveationAppliedRef,
      xrPreviousFoveationRef,
      setControllerVisibility,
      applyVrPlaybackHoverState,
      updateVrPlaybackHud,
      onAfterSessionEnd,
      vrLogRef,
      disposedRef,
      applyVrFoveation,
      restoreVrFoveation,
      volumeStepScaleRef,
      applyVolumeStepScaleToResources,
      volumeRootBaseOffsetRef,
      applyVolumeRootTransform,
      currentDimensionsRef,
      refreshControllerVisibility,
      setVrPlaybackHudVisible,
      setVrChannelsHudVisible,
      setVrTracksHudVisible,
      resetVrPlaybackHudPlacement,
      resetVrChannelsHudPlacement,
      resetVrTracksHudPlacement,
      updateVrChannelsHud,
      updateVrTracksHud,
      updateControllerRaysRef,
      updateVolumeHandles,
      sessionManagerRef,
      vrPropsRef,
      requestVrSessionRef,
      endVrSessionRequestRef,
    }),
    [
      rendererRef,
      cameraRef,
      controlsRef,
      sceneRef,
      controllersRef,
      playbackStateRef,
      xrSessionRef,
      sessionCleanupRef,
      preVrCameraStateRef,
      xrPreferredSessionModeRef,
      xrCurrentSessionModeRef,
      xrPendingModeSwitchRef,
      xrPassthroughSupportedRef,
      xrFoveationAppliedRef,
      xrPreviousFoveationRef,
      setControllerVisibility,
      applyVrPlaybackHoverState,
      updateVrPlaybackHud,
      onAfterSessionEnd,
      vrLogRef,
      disposedRef,
      applyVrFoveation,
      restoreVrFoveation,
      volumeStepScaleRef,
      applyVolumeStepScaleToResources,
      volumeRootBaseOffsetRef,
      applyVolumeRootTransform,
      currentDimensionsRef,
      refreshControllerVisibility,
      setVrPlaybackHudVisible,
      setVrChannelsHudVisible,
      setVrTracksHudVisible,
      resetVrPlaybackHudPlacement,
      resetVrChannelsHudPlacement,
      resetVrTracksHudPlacement,
      updateVrPlaybackHud,
      updateVrChannelsHud,
      updateVrTracksHud,
      updateControllerRaysRef,
      updateVolumeHandles,
      sessionManagerRef,
      vrPropsRef,
      requestVrSessionRef,
      endVrSessionRequestRef,
    ],
  );
  const sessionHelpers = useVrSession(sessionParams);

  const {
    applySessionStartState,
    applySessionEndState,
    sessionManager,
    requestVrSession,
    endVrSession,
    callOnRegisterVrSession,
  } = sessionHelpers;

  const refreshControllerVisibilityRef = useRef(refreshControllerVisibility);
  refreshControllerVisibilityRef.current = refreshControllerVisibility;
  const applyPlaybackSliderFromWorldPointRef = useRef(applyPlaybackSliderFromWorldPoint);
  applyPlaybackSliderFromWorldPointRef.current = applyPlaybackSliderFromWorldPoint;
  const applyFpsSliderFromWorldPointRef = useRef(applyFpsSliderFromWorldPoint);
  applyFpsSliderFromWorldPointRef.current = applyFpsSliderFromWorldPoint;
  const applyVrChannelsSliderFromPointRef = useRef(applyVrChannelsSliderFromPoint);
  applyVrChannelsSliderFromPointRef.current = applyVrChannelsSliderFromPoint;
  const applyVrTracksSliderFromPointRef = useRef(applyVrTracksSliderFromPoint);
  applyVrTracksSliderFromPointRef.current = applyVrTracksSliderFromPoint;
  const applyVrTracksScrollFromPointRef = useRef(applyVrTracksScrollFromPoint);
  applyVrTracksScrollFromPointRef.current = applyVrTracksScrollFromPoint;
  const renderVrChannelsHudRef = useRef(renderVrChannelsHud);
  renderVrChannelsHudRef.current = renderVrChannelsHud;
  const renderVrTracksHudRef = useRef(renderVrTracksHud);
  renderVrTracksHudRef.current = renderVrTracksHud;
  const updateVrChannelsHudRef = useRef(updateVrChannelsHud);
  updateVrChannelsHudRef.current = updateVrChannelsHud;
  const updateVrTracksHudRef = useRef(updateVrTracksHud);
  updateVrTracksHudRef.current = updateVrTracksHud;
  const controllerDeps = useMemo(
    () => ({
      vrLogRef,
      refreshControllerVisibilityRef,
      rendererRef,
      cameraRef,
      playbackStateRef,
      applyPlaybackSliderFromWorldPointRef,
      applyFpsSliderFromWorldPointRef,
      vrPlaybackHudRef,
      vrPlaybackHudPlacementRef,
      vrPlaybackHudDragTargetRef,
      vrChannelsHudRef,
      vrChannelsHudPlacementRef,
      vrChannelsHudDragTargetRef,
      vrTracksHudRef,
      vrTracksHudPlacementRef,
      vrTracksHudDragTargetRef,
      applyVrChannelsSliderFromPointRef,
      applyVrTracksSliderFromPointRef,
      applyVrTracksScrollFromPointRef,
      vrTranslationHandleRef,
      vrVolumeScaleHandleRef,
      vrHandleWorldPointRef,
      vrHandleSecondaryPointRef,
      vrHandleDirectionTempRef,
      volumeRootGroupRef,
      volumeRootCenterUnscaledRef,
      volumeUserScaleRef,
      volumeYawRef,
      volumePitchRef,
      vrHudYawVectorRef,
      vrHudPitchVectorRef,
      onResetVolumeRef,
      onResetHudPlacementRef,
      endVrSessionRequestRef,
      toggleXrSessionMode,
      vrChannelsStateRef,
      vrTracksStateRef,
      updateVrChannelsHudRef,
      onTrackFollowRequestRef,
      vrPropsRef,
      vrClearHoverStateRef,
    }),
    [
      toggleXrSessionMode,
      applyVrChannelsSliderFromPoint,
      applyVrTracksSliderFromPoint,
      applyVrTracksScrollFromPoint,
      onResetVolume,
      onResetHudPlacement,
      onTrackFollowRequest,
    ],
  );

  const rayDeps = useMemo(
    () => ({
      rendererRef,
      cameraRef,
      containerRef,
      controllersRef,
      trackGroupRef,
      trackLinesRef,
      playbackStateRef,
      vrLogRef,
      lastControllerRaySummaryRef,
      applyVrPlaybackHoverState,
      applyVolumeYawPitch,
      resolveChannelsRegionFromPoint,
      resolveTracksRegionFromPoint,
      setVrPlaybackHudPlacementPosition,
      setVrChannelsHudPlacementPosition,
      setVrTracksHudPlacementPosition,
      setVrPlaybackHudPlacementYaw,
      setVrChannelsHudPlacementYaw,
      setVrTracksHudPlacementYaw,
      setVrPlaybackHudPlacementPitch,
      setVrChannelsHudPlacementPitch,
      setVrTracksHudPlacementPitch,
      applyPlaybackSliderFromWorldPointRef,
      applyFpsSliderFromWorldPointRef,
      vrPlaybackHudRef,
      vrPlaybackHudPlacementRef,
      vrPlaybackHudDragTargetRef,
      vrChannelsHudRef,
      vrChannelsHudPlacementRef,
      vrChannelsHudDragTargetRef,
      vrTracksHudRef,
      vrTracksHudPlacementRef,
      vrTracksHudDragTargetRef,
      applyVrChannelsSliderFromPointRef,
      applyVrTracksSliderFromPointRef,
      applyVrTracksScrollFromPointRef,
      vrTranslationHandleRef,
      vrVolumeScaleHandleRef,
      vrVolumeYawHandlesRef,
      vrVolumePitchHandleRef,
      vrHandleWorldPointRef,
      vrHandleSecondaryPointRef,
      vrHudYawVectorRef,
      vrHudPitchVectorRef,
      vrHudForwardRef,
      vrHudPlaneRef,
      vrHudPlanePointRef,
      vrChannelsLocalPointRef,
      vrTracksLocalPointRef,
      renderVrChannelsHudRef,
      renderVrTracksHudRef,
      vrChannelsStateRef,
      vrTracksStateRef,
      volumeRootGroupRef,
      volumeRootCenterUnscaledRef,
      volumeRootBaseOffsetRef,
      volumeNormalizationScaleRef,
      volumeAnisotropyScaleRef,
      volumeUserScaleRef,
      volumeYawRef,
      volumePitchRef,
      vrUpdateHoverStateRef,
      vrClearHoverStateRef,
    }),
    [
      applyVrPlaybackHoverState,
      applyVolumeYawPitch,
      resolveChannelsRegionFromPoint,
      resolveTracksRegionFromPoint,
      setVrPlaybackHudPlacementPosition,
      setVrChannelsHudPlacementPosition,
      setVrTracksHudPlacementPosition,
      setVrPlaybackHudPlacementYaw,
      setVrChannelsHudPlacementYaw,
      setVrTracksHudPlacementYaw,
      setVrPlaybackHudPlacementPitch,
      setVrChannelsHudPlacementPitch,
      setVrTracksHudPlacementPitch,
    ],
  );

  const { updateControllerRays, onRendererInitialized } =
    useVrControllers({
      controllerDeps,
      rayDeps,
      updateControllerRaysRef,
      sessionHelpers: { sessionManager, applySessionStartState, applySessionEndState },
      controllerSetupRevision,
      setControllerSetupRevision,
    });

  return {
    callOnRegisterVrSession,
    requestVrSession,
    endVrSession,
    vrPlaybackHudRef,
    vrChannelsHudRef,
    vrTracksHudRef,
    vrPlaybackHudPlacementRef,
    vrChannelsHudPlacementRef,
    vrTracksHudPlacementRef,
    vrTranslationHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
    vrVolumePitchHandleRef,
    playbackStateRef,
    playbackLoopRef,
    vrHoverStateRef,
    controllersRef,
    setControllerVisibility,
    raycasterRef,
    xrSessionRef,
    sessionCleanupRef,
    applyVrPlaybackHoverState,
    updateVrPlaybackHud,
    createVrPlaybackHud,
    createVrChannelsHud,
    createVrTracksHud,
    updateVrChannelsHud,
    updateVrTracksHud,
    updateVolumeHandles,
    updateHudGroupFromPlacement,
    resetVrPlaybackHudPlacement,
    resetVrChannelsHudPlacement,
    resetVrTracksHudPlacement,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    restoreVrFoveation,
    onRendererInitialized,
    endVrSessionRequestRef,
    updateControllerRays,
  };
}
