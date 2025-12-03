import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { VrSessionManager } from './vr/sessionManager';

export * from './vr';
export type { UseVolumeViewerVrParams, UseVolumeViewerVrResult, VolumeHandleCandidate } from './useVolumeViewerVr.types';

import type { UseVolumeViewerVrParams, UseVolumeViewerVrResult } from './useVolumeViewerVr.types';

import type {
  MovementState,
  TrackLineResource,
  VolumeResources,
  VolumeViewerVrChannelPanel,
  VolumeViewerVrProps,
} from '../VolumeViewer.types';
import type {
  ControllerEntry,
  RaycasterLike,
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrChannelsState,
  PlaybackLoopState,
  PlaybackState,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksState,
  VrHoverState,
} from './vr';
import { XR_TARGET_FOVEATION } from './vr';
import { createHudHelpers } from './useVolumeViewerVr/helpers/hud';
import { createVolumeHelpers } from './useVolumeViewerVr/helpers/volume';
import { useVrHudBindings } from './useVolumeViewerVr/useVrHudBindings';
import { useVrPlaybackBindings } from './useVolumeViewerVr/useVrPlaybackBindings';
import { useVrSession } from './useVolumeViewerVr/useVrSession';
import { useVrControllers } from './useVolumeViewerVr/useVrControllers';
import { brightnessContrastModel } from '../../state/layerSettings';

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
  trackFollowOffsetRef,
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

  const lastControllerRaySummaryRef = useRef<
    | {
        presenting: boolean;
        visibleLines: number;
        hoverTrackIds: Array<string | null>;
      }
    | null
  >(null);
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
  const vrHudIntersectionRef = useRef(new THREE.Vector3());
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
  const vrHandleQuaternionTemp2Ref = useRef(new THREE.Quaternion());
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
    computeVolumeHudFrame,
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
    setHudPlacement,
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
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    activeTrackChannelId,
    followedTrackId,
    selectedTrackIds,
    vrTracksStateRef,
    updateVrTracksHud,
  });

  const applyVrChannelsSliderFromPoint = useCallback(
    (region: VrChannelsInteractiveRegion | null, worldPoint: THREE.Vector3) => {
      if (
        !region ||
        region.disabled ||
        region.targetType !== 'channels-slider' ||
        !region.sliderTrack ||
        !region.layerKey
      ) {
        return;
      }
      const hud = vrChannelsHudRef.current;
      if (!hud) {
        return;
      }
      const layerKey = region.layerKey;
      sliderLocalPointRef.current.copy(worldPoint);
      hud.panel.worldToLocal(sliderLocalPointRef.current);
      const localX = sliderLocalPointRef.current.x;
      const trackMin = region.sliderTrack.minX;
      const trackMax = region.sliderTrack.maxX;
      const ratio = (localX - trackMin) / Math.max(trackMax - trackMin, 1e-5);
      const clampedRatio = Math.min(Math.max(ratio, 0), 1);
      const minValue = region.min ?? 0;
      const maxValue = region.max ?? 1;
      const rawValue = minValue + clampedRatio * (maxValue - minValue);
      const step = region.step ?? 0;
      let snappedValue = rawValue;
      if (step > 0) {
        const steps = Math.round((rawValue - minValue) / step);
        snappedValue = minValue + steps * step;
      }
      snappedValue = Math.min(Math.max(snappedValue, minValue), maxValue);

      const state = vrChannelsStateRef.current;
      const channelState = state.channels.find((entry) => entry.id === region.channelId);
      const layerState = channelState?.layers.find((entry) => entry.key === layerKey);
      if (!layerState) {
        return;
      }

      if (region.sliderKey === 'windowMin') {
        const updated = brightnessContrastModel.applyWindow(
          snappedValue,
          layerState.settings.windowMax,
        );
        layerState.settings.windowMin = updated.windowMin;
        layerState.settings.windowMax = updated.windowMax;
        layerState.settings.sliderRange = updated.sliderRange;
        layerState.settings.minSliderIndex = updated.minSliderIndex;
        layerState.settings.maxSliderIndex = updated.maxSliderIndex;
        layerState.settings.brightnessSliderIndex = updated.brightnessSliderIndex;
        layerState.settings.contrastSliderIndex = updated.contrastSliderIndex;
        onLayerWindowMinChange?.(layerKey, updated.windowMin);
      } else if (region.sliderKey === 'windowMax') {
        const updated = brightnessContrastModel.applyWindow(
          layerState.settings.windowMin,
          snappedValue,
        );
        layerState.settings.windowMin = updated.windowMin;
        layerState.settings.windowMax = updated.windowMax;
        layerState.settings.sliderRange = updated.sliderRange;
        layerState.settings.minSliderIndex = updated.minSliderIndex;
        layerState.settings.maxSliderIndex = updated.maxSliderIndex;
        layerState.settings.brightnessSliderIndex = updated.brightnessSliderIndex;
        layerState.settings.contrastSliderIndex = updated.contrastSliderIndex;
        onLayerWindowMaxChange?.(layerKey, updated.windowMax);
      } else if (region.sliderKey === 'contrast') {
        const sliderIndex = Math.round(snappedValue);
        const updated = brightnessContrastModel.applyContrast(layerState.settings, sliderIndex);
        layerState.settings.windowMin = updated.windowMin;
        layerState.settings.windowMax = updated.windowMax;
        layerState.settings.sliderRange = updated.sliderRange;
        layerState.settings.minSliderIndex = updated.minSliderIndex;
        layerState.settings.maxSliderIndex = updated.maxSliderIndex;
        layerState.settings.brightnessSliderIndex = updated.brightnessSliderIndex;
        layerState.settings.contrastSliderIndex = updated.contrastSliderIndex;
        onLayerContrastChange?.(layerKey, updated.contrastSliderIndex);
      } else if (region.sliderKey === 'brightness') {
        const sliderIndex = Math.round(snappedValue);
        const updated = brightnessContrastModel.applyBrightness(layerState.settings, sliderIndex);
        layerState.settings.windowMin = updated.windowMin;
        layerState.settings.windowMax = updated.windowMax;
        layerState.settings.sliderRange = updated.sliderRange;
        layerState.settings.minSliderIndex = updated.minSliderIndex;
        layerState.settings.maxSliderIndex = updated.maxSliderIndex;
        layerState.settings.brightnessSliderIndex = updated.brightnessSliderIndex;
        layerState.settings.contrastSliderIndex = updated.contrastSliderIndex;
        onLayerBrightnessChange?.(layerKey, updated.brightnessSliderIndex);
      } else if (region.sliderKey === 'xOffset') {
        layerState.settings.xOffset = snappedValue;
        onLayerOffsetChange?.(layerKey, 'x', snappedValue);
      } else if (region.sliderKey === 'yOffset') {
        layerState.settings.yOffset = snappedValue;
        onLayerOffsetChange?.(layerKey, 'y', snappedValue);
      }

      renderVrChannelsHud(hud, state);
    },
    [
      onLayerWindowMinChange,
      onLayerWindowMaxChange,
      onLayerContrastChange,
      onLayerBrightnessChange,
      onLayerOffsetChange,
      renderVrChannelsHud,
    ],
  );

  const applyVrTracksSliderFromPoint = useCallback(
    (region: VrTracksInteractiveRegion | null, worldPoint: THREE.Vector3) => {
      if (!region || region.disabled || region.targetType !== 'tracks-slider' || !region.sliderTrack) {
        return;
      }
      const hud = vrTracksHudRef.current;
      if (!hud) {
        return;
      }
      sliderLocalPointRef.current.copy(worldPoint);
      hud.panel.worldToLocal(sliderLocalPointRef.current);
      const localX = sliderLocalPointRef.current.x;
      const trackMin = region.sliderTrack.minX;
      const trackMax = region.sliderTrack.maxX;
      const ratio = (localX - trackMin) / Math.max(trackMax - trackMin, 1e-5);
      const clampedRatio = Math.min(Math.max(ratio, 0), 1);
      const minValue = region.min ?? 0;
      const maxValue = region.max ?? 1;
      const rawValue = minValue + clampedRatio * (maxValue - minValue);
      const step = region.step ?? 0;
      let snappedValue = rawValue;
      if (step > 0) {
        const steps = Math.round((rawValue - minValue) / step);
        snappedValue = minValue + steps * step;
      }
      snappedValue = Math.min(Math.max(snappedValue, minValue), maxValue);

      const state = vrTracksStateRef.current;
      const channelState = state.channels.find((entry) => entry.id === region.channelId);
      if (!channelState) {
        return;
      }

      if (region.sliderKey === 'opacity') {
        channelState.opacity = snappedValue;
        onTrackOpacityChange?.(region.channelId, snappedValue);
      } else if (region.sliderKey === 'lineWidth') {
        channelState.lineWidth = snappedValue;
        onTrackLineWidthChange?.(region.channelId, snappedValue);
      }

      renderVrTracksHud(hud, state);
    },
    [onTrackLineWidthChange, onTrackOpacityChange, renderVrTracksHud],
  );

  const applyVrTracksScrollFromPoint = useCallback(
    (region: VrTracksInteractiveRegion | null, worldPoint: THREE.Vector3) => {
      if (
        !region ||
        region.disabled ||
        region.targetType !== 'tracks-scroll' ||
        !region.verticalSliderTrack
      ) {
        return;
      }
      const hud = vrTracksHudRef.current;
      if (!hud) {
        return;
      }
      sliderLocalPointRef.current.copy(worldPoint);
      hud.panel.worldToLocal(sliderLocalPointRef.current);
      const localY = sliderLocalPointRef.current.y;
      const track = region.verticalSliderTrack;
      const trackMin = Math.min(track.minY, track.maxY);
      const trackMax = Math.max(track.minY, track.maxY);
      if (trackMax - trackMin <= 1e-5) {
        return;
      }
      const rawRatio = (localY - trackMin) / (trackMax - trackMin);
      let clampedRatio = Math.min(Math.max(rawRatio, 0), 1);
      if (track.inverted) {
        clampedRatio = 1 - clampedRatio;
      }

      const state = vrTracksStateRef.current;
      const channelState = state.channels.find((entry) => entry.id === region.channelId);
      if (!channelState) {
        return;
      }

      const visibleRows = Math.max(track.visibleRows ?? 0, 1);
      const totalRows = Math.max(track.totalRows ?? 0, 0);
      const maxScrollIndex = Math.max(totalRows - visibleRows, 0);
      let snappedRatio = clampedRatio;
      if (maxScrollIndex > 0) {
        const step = 1 / maxScrollIndex;
        snappedRatio = Math.round(clampedRatio / step) * step;
        snappedRatio = Math.min(Math.max(snappedRatio, 0), 1);
      } else {
        snappedRatio = 0;
      }

      if (Math.abs((channelState.scrollOffset ?? 0) - snappedRatio) <= 1e-4) {
        return;
      }
      channelState.scrollOffset = snappedRatio;
      renderVrTracksHud(hud, state);
    },
    [renderVrTracksHud],
  );

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
    callOnVrSessionStarted,
    callOnVrSessionEnded,
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

  const { configureControllerEntry, updateControllerRays, onRendererInitialized } =
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
