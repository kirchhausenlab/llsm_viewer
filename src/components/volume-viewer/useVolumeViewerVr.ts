import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export * from './vr';
export type { UseVolumeViewerVrParams, UseVolumeViewerVrResult, VolumeHandleCandidate } from './useVolumeViewerVr.types';

import type { UseVolumeViewerVrParams, UseVolumeViewerVrResult } from './useVolumeViewerVr.types';

import type {
  MovementState,
  PointerState,
  TrackLineResource,
  VolumeResources,
  VolumeViewerVrChannelPanel,
  VolumeViewerVrProps,
} from '../VolumeViewer.types';
import type { TrackColorMode, TrackDefinition } from '../../types/tracks';
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
  VrUiTarget,
  VrUiTargetType,
} from './vr';
import { createControllerEntryConfigurator, createControllerRayUpdater } from './vr/input';
import { bindSessionRequests, createSessionLifecycle } from './vr/session';
import { VrSessionManager } from './vr/sessionManager';
import {
  VR_PITCH_HANDLE_FORWARD_OFFSET,
  VR_PLAYBACK_MAX_FPS,
  VR_PLAYBACK_MIN_FPS,
  VR_PLAYBACK_PANEL_HEIGHT,
  VR_PLAYBACK_PANEL_WIDTH,
  VR_ROTATION_HANDLE_OFFSET,
  VR_ROTATION_HANDLE_RADIUS,
  VR_SCALE_HANDLE_OFFSET,
  VR_SCALE_HANDLE_RADIUS,
  VR_TRANSLATION_HANDLE_OFFSET,
  VR_TRANSLATION_HANDLE_RADIUS,
  VR_UI_TOUCH_DISTANCE,
  VR_UI_TOUCH_SURFACE_MARGIN,
  VR_VOLUME_MAX_SCALE,
  VR_VOLUME_MIN_SCALE,
  VR_VOLUME_BASE_OFFSET,
  VR_VOLUME_STEP_SCALE,
  DESKTOP_VOLUME_STEP_SCALE,
  XR_TARGET_FOVEATION,
} from './vr';
import {
  setVrPlaybackFpsFraction,
  setVrPlaybackFpsLabel,
  setVrPlaybackLabel,
  setVrPlaybackProgressFraction,
} from './vr/hudMutators';
import { createHudController, computeHudFrameFromVolume } from './vr/hud';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../../layerColors';
import {
  DEFAULT_TRACK_COLOR,
  getTrackColorHex,
  normalizeTrackColor,
} from '../../trackColors';
import { brightnessContrastModel } from '../../state/layerSettings';
import { DEFAULT_TRACK_LINE_WIDTH, DEFAULT_TRACK_OPACITY } from './constants';

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
  pointerStateRef,
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

  const computeVolumeHudFrame = useCallback(
    () =>
      computeHudFrameFromVolume({
        baseOffset: volumeRootBaseOffsetRef.current,
        volumeRootGroup: volumeRootGroupRef.current,
        halfExtents: volumeRootHalfExtentsRef.current,
      }),
    [volumeRootBaseOffsetRef, volumeRootGroupRef, volumeRootHalfExtentsRef],
  );

  const hudController = useMemo(
    () =>
      createHudController({
        playbackHudRef: vrPlaybackHudRef,
        channelsHudRef: vrChannelsHudRef,
        tracksHudRef: vrTracksHudRef,
        playbackStateRef,
        hoverStateRef: vrHoverStateRef,
        channelsStateRef: vrChannelsStateRef,
        tracksStateRef: vrTracksStateRef,
        playbackHudPlacementRef: vrPlaybackHudPlacementRef,
        channelsHudPlacementRef: vrChannelsHudPlacementRef,
        tracksHudPlacementRef: vrTracksHudPlacementRef,
        playbackHudDragTargetRef: vrPlaybackHudDragTargetRef,
        channelsHudDragTargetRef: vrChannelsHudDragTargetRef,
        tracksHudDragTargetRef: vrTracksHudDragTargetRef,
        hudOffsetTempRef: vrHudOffsetTempRef,
        hudYawEulerRef: vrHudYawEulerRef,
        hudYawQuaternionRef: vrHudYawQuaternionRef,
        computeHudFrame: computeVolumeHudFrame,
        cameraRef,
      }),
    [
      cameraRef,
      computeVolumeHudFrame,
      vrPlaybackHudRef,
      vrChannelsHudRef,
      vrTracksHudRef,
      playbackStateRef,
      vrHoverStateRef,
      vrChannelsStateRef,
      vrTracksStateRef,
      vrPlaybackHudPlacementRef,
      vrChannelsHudPlacementRef,
      vrTracksHudPlacementRef,
      vrPlaybackHudDragTargetRef,
      vrChannelsHudDragTargetRef,
      vrTracksHudDragTargetRef,
      vrHudOffsetTempRef,
      vrHudYawEulerRef,
      vrHudYawQuaternionRef,
    ],
  );

  const {
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
    constrainPlacementPosition: constrainHudPlacementPosition,
    getHudQuaternionFromAngles,
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
  } = hudController;

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

  const refreshControllerVisibility = useCallback<
    UseVolumeViewerVrResult['refreshControllerVisibility']
  >(() => {
    sessionManagerRef.current?.refreshControllerVisibility();
  }, [sessionManagerRef]);

  const setPreferredXrSessionMode = useCallback<
    UseVolumeViewerVrResult['setPreferredXrSessionMode']
  >(
    (mode) => {
      sessionManagerRef.current?.setPreferredSessionMode(mode);
    },
    [sessionManagerRef]
  );

  const toggleXrSessionMode = useCallback(() => {
    sessionManagerRef.current?.togglePreferredSessionMode();
  }, [sessionManagerRef]);

  useEffect(() => {
    const state = playbackStateRef.current;
    state.isPlaying = isPlaying;
    state.playbackDisabled = playbackDisabled;
    state.playbackLabel = playbackLabel;
    state.fps = fps;
    state.timeIndex = timeIndex;
    state.totalTimepoints = totalTimepoints;
    state.onTogglePlayback = onTogglePlayback;
    state.onTimeIndexChange = onTimeIndexChange;
    state.onFpsChange = onFpsChange;
    state.passthroughSupported = isVrPassthroughSupported;
    updateVrPlaybackHud();
  }, [
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
    updateVrPlaybackHud
  ]);

  useEffect(() => {
    xrPassthroughSupportedRef.current = isVrPassthroughSupported;
    playbackStateRef.current.passthroughSupported = isVrPassthroughSupported;
    if (!isVrPassthroughSupported && xrPreferredSessionModeRef.current === 'immersive-ar') {
      setPreferredXrSessionMode('immersive-vr');
    } else {
      updateVrPlaybackHud();
    }
  }, [isVrPassthroughSupported, setPreferredXrSessionMode, updateVrPlaybackHud]);

  const applyPlaybackSliderFromWorldPoint =
    useCallback<UseVolumeViewerVrResult['applyPlaybackSliderFromWorldPoint']>((worldPoint) => {
      const hud = vrPlaybackHudRef.current;
      if (!hud) {
        return;
      }
      const state = playbackStateRef.current;
      if (state.totalTimepoints <= 0 || state.playbackDisabled) {
        return;
      }
      sliderLocalPointRef.current.copy(worldPoint);
      hud.playbackSliderTrack.worldToLocal(sliderLocalPointRef.current);
      const rawRatio =
        (sliderLocalPointRef.current.x + hud.playbackSliderWidth / 2) /
        Math.max(hud.playbackSliderWidth, 1e-5);
      const clampedRatio = Math.min(Math.max(rawRatio, 0), 1);
      const maxIndex = Math.max(0, state.totalTimepoints - 1);
      const tentativeIndex = Math.round(clampedRatio * maxIndex);
      const boundedIndex = Math.min(Math.max(tentativeIndex, 0), maxIndex);
      const fraction = maxIndex > 0 ? boundedIndex / maxIndex : 0;
      if (boundedIndex !== state.timeIndex) {
        state.onTimeIndexChange?.(boundedIndex);
        state.timeIndex = boundedIndex;
      }
      const total = Math.max(0, state.totalTimepoints);
      const labelCurrent = total > 0 ? Math.min(boundedIndex + 1, total) : 0;
      const label = `${labelCurrent} / ${total}`;
      state.playbackLabel = label;
      setVrPlaybackProgressFraction(hud, fraction);
      setVrPlaybackLabel(hud, label);
    }, [playbackStateRef, sliderLocalPointRef, vrPlaybackHudRef]);

  const applyFpsSliderFromWorldPoint =
    useCallback<UseVolumeViewerVrResult['applyFpsSliderFromWorldPoint']>((worldPoint) => {
      const hud = vrPlaybackHudRef.current;
      if (!hud) {
        return;
      }
      const state = playbackStateRef.current;
      if (state.totalTimepoints <= 1) {
        return;
      }
      sliderLocalPointRef.current.copy(worldPoint);
      hud.fpsSliderTrack.worldToLocal(sliderLocalPointRef.current);
      const rawRatio =
        (sliderLocalPointRef.current.x + hud.fpsSliderWidth / 2) /
        Math.max(hud.fpsSliderWidth, 1e-5);
      const clampedRatio = Math.min(Math.max(rawRatio, 0), 1);
      const fpsRange = VR_PLAYBACK_MAX_FPS - VR_PLAYBACK_MIN_FPS;
      const tentativeFps = Math.round(VR_PLAYBACK_MIN_FPS + clampedRatio * fpsRange);
      const boundedFps = Math.min(
        VR_PLAYBACK_MAX_FPS,
        Math.max(VR_PLAYBACK_MIN_FPS, tentativeFps),
      );
      if (boundedFps !== state.fps) {
        state.onFpsChange?.(boundedFps);
        state.fps = boundedFps;
      }
      const fpsFraction =
        fpsRange > 0
          ? (Math.min(Math.max(boundedFps, VR_PLAYBACK_MIN_FPS), VR_PLAYBACK_MAX_FPS) -
              VR_PLAYBACK_MIN_FPS) /
            fpsRange
          : 0;
      setVrPlaybackFpsFraction(hud, fpsFraction);
      const fpsLabelText = `frames per second ${boundedFps}`;
      setVrPlaybackFpsLabel(hud, fpsLabelText);
    }, [playbackStateRef, sliderLocalPointRef, vrPlaybackHudRef]);

  const tracksByChannel = useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();
    for (const track of tracks) {
      const existing = map.get(track.channelId);
      if (existing) {
        existing.push(track);
      } else {
        map.set(track.channelId, [track]);
      }
    }
    return map;
  }, [tracks]);

  useEffect(() => {
    const nextChannels = channelPanels.map((panel) => ({
      id: panel.id,
      name: panel.name,
      visible: panel.visible,
      activeLayerKey: panel.activeLayerKey,
      layers: panel.layers.map((layer) => ({
        key: layer.key,
        label: layer.label,
        hasData: layer.hasData,
        isGrayscale: layer.isGrayscale,
        isSegmentation: layer.isSegmentation,
        defaultWindow: layer.defaultWindow,
        histogram: layer.histogram ?? null,
        settings: {
          sliderRange: layer.settings.sliderRange,
          minSliderIndex: layer.settings.minSliderIndex,
          maxSliderIndex: layer.settings.maxSliderIndex,
          brightnessSliderIndex: layer.settings.brightnessSliderIndex,
          contrastSliderIndex: layer.settings.contrastSliderIndex,
          windowMin: layer.settings.windowMin,
          windowMax: layer.settings.windowMax,
          color: normalizeHexColor(layer.settings.color, DEFAULT_LAYER_COLOR),
          xOffset: layer.settings.xOffset,
          yOffset: layer.settings.yOffset,
          renderStyle: layer.settings.renderStyle,
          invert: layer.settings.invert,
          samplingMode: layer.settings.samplingMode ?? 'linear',
        },
      })),
    }));
    vrChannelsStateRef.current = {
      channels: nextChannels,
      activeChannelId: activeChannelPanelId,
    };
    updateVrChannelsHud();
  }, [activeChannelPanelId, channelPanels, updateVrChannelsHud]);

  useEffect(() => {
    const previousChannels = new Map(
      vrTracksStateRef.current.channels.map((channel) => [channel.id, channel] as const),
    );
    const nextChannels = trackChannels.map((channel) => {
      const tracksForChannel = tracksByChannel.get(channel.id) ?? [];
      const colorMode = channelTrackColorModes[channel.id] ?? { type: 'random' };
      const opacity = trackOpacityByChannel[channel.id] ?? DEFAULT_TRACK_OPACITY;
      const lineWidth = trackLineWidthByChannel[channel.id] ?? DEFAULT_TRACK_LINE_WIDTH;
      let visibleTracks = 0;
      const trackEntries = tracksForChannel.map((track) => {
        const explicitVisible = trackVisibility[track.id] ?? true;
        const isFollowed = followedTrackId === track.id;
        const isSelected = selectedTrackIds.has(track.id);
        if (explicitVisible || isFollowed || isSelected) {
          visibleTracks += 1;
        }
        const color =
          colorMode.type === 'uniform'
            ? normalizeTrackColor(colorMode.color, DEFAULT_TRACK_COLOR)
            : getTrackColorHex(track.id);
        return {
          id: track.id,
          trackNumber: track.trackNumber,
          label: `Track #${track.trackNumber}`,
          color,
          explicitVisible,
          visible: isFollowed || explicitVisible || isSelected,
          isFollowed,
          isSelected,
        };
      });
      const followedEntry = trackEntries.find((entry) => entry.isFollowed) ?? null;
      const previous = previousChannels.get(channel.id);
      return {
        id: channel.id,
        name: channel.name,
        opacity,
        lineWidth,
        colorMode,
        totalTracks: tracksForChannel.length,
        visibleTracks,
        followedTrackId: followedEntry ? followedEntry.id : null,
        scrollOffset: Math.min(Math.max(previous?.scrollOffset ?? 0, 0), 1),
        tracks: trackEntries,
      };
    });
    const nextState: VrTracksState = {
      channels: nextChannels,
      activeChannelId: activeTrackChannelId,
    };
    if (
      !nextState.activeChannelId ||
      !nextChannels.some((channel) => channel.id === nextState.activeChannelId)
    ) {
      nextState.activeChannelId = nextChannels[0]?.id ?? null;
    }
    vrTracksStateRef.current = nextState;
    updateVrTracksHud();
  }, [
    activeTrackChannelId,
    channelTrackColorModes,
    trackChannels,
    trackLineWidthByChannel,
    trackOpacityByChannel,
    trackVisibility,
    tracksByChannel,
    followedTrackId,
    selectedTrackIds,
    updateVrTracksHud,
  ]);

  const applyVrChannelsSliderFromPoint = useCallback<
    UseVolumeViewerVrResult['applyVrChannelsSliderFromPoint']
  >(
    (region, worldPoint) => {
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

  const applyVrTracksSliderFromPoint = useCallback<
    UseVolumeViewerVrResult['applyVrTracksSliderFromPoint']
  >(
    (region, worldPoint) => {
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

  const applyVrTracksScrollFromPoint = useCallback<
    UseVolumeViewerVrResult['applyVrTracksScrollFromPoint']
  >(
    (region, worldPoint) => {
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

  const resolveChannelsRegionFromPoint = useCallback<
    UseVolumeViewerVrResult['resolveChannelsRegionFromPoint']
  >(
    (hud, worldPoint) => {
      if (!hud || hud.regions.length === 0) {
        return null;
      }
      const localPoint = vrChannelsLocalPointRef.current;
      localPoint.copy(worldPoint);
      hud.panel.worldToLocal(localPoint);
      const localX = localPoint.x;
      const localY = localPoint.y;
      for (const region of hud.regions) {
        const { minX, maxX, minY, maxY } = region.bounds;
        const minBoundX = Math.min(minX, maxX);
        const maxBoundX = Math.max(minX, maxX);
        const minBoundY = Math.min(minY, maxY);
        const maxBoundY = Math.max(minY, maxY);
        if (
          localX >= minBoundX &&
          localX <= maxBoundX &&
          localY >= minBoundY &&
          localY <= maxBoundY
        ) {
          return region;
        }
      }
      return null;
    },
    [vrChannelsLocalPointRef],
  );

  const resolveTracksRegionFromPoint = useCallback<
    UseVolumeViewerVrResult['resolveTracksRegionFromPoint']
  >(
    (hud, worldPoint) => {
      if (!hud || hud.regions.length === 0) {
        return null;
      }
      const localPoint = vrTracksLocalPointRef.current;
      localPoint.copy(worldPoint);
      hud.panel.worldToLocal(localPoint);
      const localX = localPoint.x;
      const localY = localPoint.y;
      for (const region of hud.regions) {
        const { minX, maxX, minY, maxY } = region.bounds;
        const minBoundX = Math.min(minX, maxX);
        const maxBoundX = Math.max(minX, maxX);
        const minBoundY = Math.min(minY, maxY);
        const maxBoundY = Math.max(minY, maxY);
        if (
          localX >= minBoundX &&
          localX <= maxBoundX &&
          localY >= minBoundY &&
          localY <= maxBoundY
        ) {
          return region;
        }
      }
      return null;
    },
    [vrTracksLocalPointRef],
  );


  const updateVolumeHandles = useCallback(() => {
    const translationHandle = vrTranslationHandleRef.current;
    const scaleHandle = vrVolumeScaleHandleRef.current;
    const yawHandles = vrVolumeYawHandlesRef.current;
    const pitchHandle = vrVolumePitchHandleRef.current;
    if (!translationHandle && !scaleHandle && yawHandles.length === 0 && !pitchHandle) {
      return;
    }

    const renderer = rendererRef.current;
    const volumeRootGroup = volumeRootGroupRef.current;
    const dimensions = currentDimensionsRef.current;
    const has3D = hasActive3DLayerRef.current;
    const presenting = renderer?.xr?.isPresenting ?? false;

    const hideHandles = () => {
      if (translationHandle) {
        translationHandle.visible = false;
      }
      if (scaleHandle) {
        scaleHandle.visible = false;
      }
      yawHandles.forEach((handle) => {
        handle.visible = false;
      });
      if (pitchHandle) {
        pitchHandle.visible = false;
      }
    };

    if (!presenting || !has3D || !dimensions || !volumeRootGroup || dimensions.depth <= 1) {
      hideHandles();
      return;
    }

    const { width, height, depth } = dimensions;
    const maxDimension = Math.max(width, height, depth);
    if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
      hideHandles();
      return;
    }

    const scale = 1 / maxDimension;
    const userScale = volumeUserScaleRef.current;
    const totalScale = scale * userScale;
    const safeScale = totalScale > 1e-6 ? totalScale : 1e-6;
    const centerUnscaled = volumeRootCenterUnscaledRef.current;
    const halfExtents = volumeRootHalfExtentsRef.current;
    const translationLocal = vrHandleLocalPointRef.current;

    translationLocal.set(
      centerUnscaled.x,
      centerUnscaled.y + (halfExtents.y + VR_TRANSLATION_HANDLE_OFFSET) / scale,
      centerUnscaled.z,
    );
    if (translationHandle) {
      translationHandle.position.copy(translationLocal);
      translationHandle.scale.setScalar(VR_TRANSLATION_HANDLE_RADIUS / safeScale);
      translationHandle.visible = true;
    }

    const lateralOffset = (halfExtents.x + VR_ROTATION_HANDLE_OFFSET) / scale;
    const verticalOffset = -(halfExtents.y + VR_ROTATION_HANDLE_OFFSET) / scale;
    const forwardOffset = (halfExtents.z + VR_PITCH_HANDLE_FORWARD_OFFSET) / scale;
    const handleScale = VR_ROTATION_HANDLE_RADIUS / safeScale;

    yawHandles.forEach((handle, index) => {
      if (!handle) {
        return;
      }
      const direction = index === 0 ? 1 : -1;
      handle.position.set(
        centerUnscaled.x + direction * lateralOffset,
        centerUnscaled.y,
        centerUnscaled.z,
      );
      handle.scale.setScalar(handleScale);
      handle.visible = true;
    });

    if (pitchHandle) {
      pitchHandle.position.set(
        centerUnscaled.x,
        centerUnscaled.y + verticalOffset,
        centerUnscaled.z - forwardOffset,
      );
      pitchHandle.scale.setScalar(handleScale);
      pitchHandle.visible = true;
    }

    if (scaleHandle) {
      scaleHandle.position.set(
        centerUnscaled.x + (halfExtents.x + VR_SCALE_HANDLE_OFFSET) / scale,
        centerUnscaled.y + (halfExtents.y + VR_SCALE_HANDLE_OFFSET) / scale,
        centerUnscaled.z,
      );
      scaleHandle.scale.setScalar(VR_SCALE_HANDLE_RADIUS / safeScale);
      scaleHandle.visible = true;
    }
  }, [
    currentDimensionsRef,
    hasActive3DLayerRef,
    rendererRef,
    volumeRootCenterUnscaledRef,
    volumeRootGroupRef,
    volumeRootHalfExtentsRef,
    volumeUserScaleRef,
    vrHandleLocalPointRef,
    vrTranslationHandleRef,
    vrVolumePitchHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
  ]);

  const applyVrFoveation = useCallback(
    (target: number = XR_TARGET_FOVEATION) => {
      sessionManagerRef.current?.applyFoveation(target);
    },
    [sessionManagerRef],
  );

  const restoreVrFoveation = useCallback(() => {
    sessionManagerRef.current?.restoreFoveation();
  }, [sessionManagerRef]);

  const applyVolumeStepScaleToResources = useCallback(
    (stepScale: number) => {
      volumeStepScaleRef.current = stepScale;
      for (const resource of resourcesRef.current.values()) {
        if (resource.mode !== '3d') {
          continue;
        }
        const material = resource.mesh.material;
        const materialList = Array.isArray(material) ? material : [material];
        for (const entry of materialList) {
          const shaderMaterial = entry as THREE.ShaderMaterial | undefined;
          const uniforms = shaderMaterial?.uniforms as
            | Record<string, { value: unknown }>
            | undefined;
          if (uniforms && 'u_stepScale' in uniforms) {
            const stepUniform = uniforms.u_stepScale as { value: number };
            stepUniform.value = stepScale;
          }
        }
      }
    },
    [resourcesRef, volumeStepScaleRef],
  );

  const applyVolumeYawPitch = useCallback(
    (yaw: number, pitch: number) => {
      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return;
      }
      volumeYawRef.current = yaw;
      volumePitchRef.current = pitch;
      const euler = vrHudYawEulerRef.current;
      const quaternion = vrHandleQuaternionTempRef.current;
      euler.set(pitch, yaw, 0, 'YXZ');
      quaternion.setFromEuler(euler);
      volumeRootGroup.quaternion.copy(quaternion);
      const baseOffset = volumeRootBaseOffsetRef.current;
      const centerOffset = volumeRootCenterOffsetRef.current;
      const rotatedCenter = volumeRootRotatedCenterTempRef.current;
      const userScale = volumeUserScaleRef.current;
      rotatedCenter
        .copy(centerOffset)
        .multiplyScalar(userScale)
        .applyQuaternion(volumeRootGroup.quaternion);
      volumeRootGroup.position.set(
        baseOffset.x - rotatedCenter.x,
        baseOffset.y - rotatedCenter.y,
        baseOffset.z - rotatedCenter.z,
      );
      volumeRootGroup.updateMatrixWorld(true);
      updateVolumeHandles();
    },
    [
      updateVolumeHandles,
      volumePitchRef,
      volumeRootBaseOffsetRef,
      volumeRootCenterOffsetRef,
      volumeRootGroupRef,
      volumeRootRotatedCenterTempRef,
      volumeUserScaleRef,
      volumeYawRef,
      vrHandleQuaternionTempRef,
      vrHudYawEulerRef,
    ],
  );

  const applyVolumeRootTransform = useCallback(
    (dimensions: { width: number; height: number; depth: number } | null) => {
      const volumeRootGroup = volumeRootGroupRef.current;
      if (!volumeRootGroup) {
        return;
      }

      if (!dimensions) {
        volumeRootCenterOffsetRef.current.set(0, 0, 0);
        volumeRootCenterUnscaledRef.current.set(0, 0, 0);
        volumeRootHalfExtentsRef.current.set(0, 0, 0);
        volumeNormalizationScaleRef.current = 1;
        volumeUserScaleRef.current = 1;
        volumeRootGroup.scale.set(1, 1, 1);
        volumeYawRef.current = 0;
        volumePitchRef.current = 0;
        applyVolumeYawPitch(0, 0);
        return;
      }

      const { width, height, depth } = dimensions;
      const maxDimension = Math.max(width, height, depth);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
        volumeRootCenterOffsetRef.current.set(0, 0, 0);
        volumeRootCenterUnscaledRef.current.set(0, 0, 0);
        volumeRootHalfExtentsRef.current.set(0, 0, 0);
        volumeNormalizationScaleRef.current = 1;
        volumeUserScaleRef.current = 1;
        volumeRootGroup.scale.set(1, 1, 1);
        volumeYawRef.current = 0;
        volumePitchRef.current = 0;
        applyVolumeYawPitch(0, 0);
        return;
      }

      const scale = 1 / maxDimension;
      volumeNormalizationScaleRef.current = scale;
      const clampedUserScale = Math.min(
        VR_VOLUME_MAX_SCALE,
        Math.max(VR_VOLUME_MIN_SCALE, volumeUserScaleRef.current),
      );
      volumeUserScaleRef.current = clampedUserScale;
      const centerUnscaled = volumeRootCenterUnscaledRef.current;
      centerUnscaled.set(width / 2 - 0.5, height / 2 - 0.5, depth / 2 - 0.5);
      const centerOffset = volumeRootCenterOffsetRef.current;
      centerOffset.copy(centerUnscaled).multiplyScalar(scale);
      const halfExtents = volumeRootHalfExtentsRef.current;
      halfExtents.set(
        ((width - 1) / 2) * scale,
        ((height - 1) / 2) * scale,
        ((depth - 1) / 2) * scale,
      );

      volumeRootGroup.scale.setScalar(scale * clampedUserScale);
      applyVolumeYawPitch(volumeYawRef.current, volumePitchRef.current);
    },
    [
      applyVolumeYawPitch,
      volumeNormalizationScaleRef,
      volumePitchRef,
      volumeRootCenterOffsetRef,
      volumeRootCenterUnscaledRef,
      volumeRootGroupRef,
      volumeRootHalfExtentsRef,
      volumeUserScaleRef,
      volumeYawRef,
    ],
  );

  const applySessionStartState = useCallback(() => {
    applyVrFoveation();
    applyVolumeStepScaleToResources(VR_VOLUME_STEP_SCALE);
    volumeRootBaseOffsetRef.current.copy(VR_VOLUME_BASE_OFFSET);
    applyVolumeRootTransform(currentDimensionsRef.current);
    refreshControllerVisibility();
    setVrPlaybackHudVisible(true);
    setVrChannelsHudVisible(true);
    setVrTracksHudVisible(true);
    resetVrPlaybackHudPlacement();
    resetVrChannelsHudPlacement();
    resetVrTracksHudPlacement();
    updateVrPlaybackHud();
    updateVrChannelsHud();
    updateVrTracksHud();
    updateControllerRaysRef.current?.();
    updateVolumeHandles();
  }, [
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    applyVrFoveation,
    currentDimensionsRef,
    refreshControllerVisibility,
    resetVrChannelsHudPlacement,
    resetVrPlaybackHudPlacement,
    resetVrTracksHudPlacement,
    setVrChannelsHudVisible,
    setVrPlaybackHudVisible,
    setVrTracksHudVisible,
    updateVolumeHandles,
    updateVrChannelsHud,
    updateVrPlaybackHud,
    updateVrTracksHud,
    volumeRootBaseOffsetRef,
  ]);

  const applySessionEndState = useCallback(() => {
    restoreVrFoveation();
    applyVolumeStepScaleToResources(DESKTOP_VOLUME_STEP_SCALE);
    volumeRootBaseOffsetRef.current.set(0, 0, 0);
    applyVolumeRootTransform(currentDimensionsRef.current);
    refreshControllerVisibility();
    setVrPlaybackHudVisible(false);
    setVrChannelsHudVisible(false);
    setVrTracksHudVisible(false);
    updateVolumeHandles();
  }, [
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    currentDimensionsRef,
    refreshControllerVisibility,
    restoreVrFoveation,
    setVrChannelsHudVisible,
    setVrPlaybackHudVisible,
    setVrTracksHudVisible,
    updateVolumeHandles,
    volumeRootBaseOffsetRef,
  ]);

  const {
    sessionManager,
    callOnVrSessionStarted,
    callOnVrSessionEnded,
    attachSessionManager,
  } = useMemo(
    () =>
      createSessionLifecycle({
        createManager: (handlers) =>
          new VrSessionManager({
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
            onSessionStarted: handlers.onSessionStarted,
            onSessionEnded: handlers.onSessionEnded,
            onAfterSessionEnd,
            vrLogRef,
            disposedRef,
          }),
        sessionManagerRef,
        applySessionStartState,
        applySessionEndState,
        disposedRef,
        vrPropsRef,
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
      applySessionStartState,
      applySessionEndState,
      sessionManagerRef,
      vrPropsRef,
    ],
  );

  useEffect(() => attachSessionManager(), [attachSessionManager, sessionManager]);

  const {
    requestVrSession,
    endVrSession,
    callOnRegisterVrSession,
    attachRequestRef,
    attachEndRef,
  } = useMemo(
    () =>
      bindSessionRequests({
        sessionManagerRef,
        requestSessionRef: requestVrSessionRef,
        endSessionRequestRef: endVrSessionRequestRef,
        vrPropsRef,
      }),
    [sessionManagerRef, requestVrSessionRef, endVrSessionRequestRef, vrPropsRef],
  );

  useEffect(() => attachRequestRef(), [attachRequestRef]);
  useEffect(() => attachEndRef(), [attachEndRef]);

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

  const configureControllerEntry = useMemo(
    () =>
      createControllerEntryConfigurator({
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
    [toggleXrSessionMode],
  );

  const updateControllerRays = useMemo(
    () =>
      createControllerRayUpdater({
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
  const updateControllerRaysRef = useRef<() => void>(() => {});



  updateControllerRaysRef.current = updateControllerRays;

  const onRendererInitialized = useCallback(() => {
    setControllerSetupRevision((revision) => revision + 1);
  }, []);

  useEffect(() => {
    if (controllerSetupRevision === 0) {
      return;
    }
    return sessionManager.installSessionEventListeners({
      onSessionStart: applySessionStartState,
      onSessionEnd: applySessionEndState,
    });
  }, [
    controllerSetupRevision,
    sessionManager,
    applySessionStartState,
    applySessionEndState,
  ]);

  useEffect(() => {
    if (controllerSetupRevision === 0) {
      return;
    }
    return sessionManager.setupControllers(configureControllerEntry);
  }, [controllerSetupRevision, sessionManager, configureControllerEntry]);

  return {
    callOnRegisterVrSession,
    callOnVrSessionStarted,
    callOnVrSessionEnded,
    requestVrSession,
    endVrSession,
    vrPlaybackHudRef,
    vrChannelsHudRef,
    vrTracksHudRef,
    vrPlaybackHudPlacementRef,
    vrChannelsHudPlacementRef,
    vrTracksHudPlacementRef,
    vrHudPlaneRef,
    vrHudPlanePointRef,
    vrPlaybackHudDragTargetRef,
    vrChannelsHudDragTargetRef,
    vrTracksHudDragTargetRef,
    vrHudOffsetTempRef,
    vrHudIntersectionRef,
    vrChannelsLocalPointRef,
    vrTracksLocalPointRef,
    vrHudForwardRef,
    vrHudYawEulerRef,
    vrHudYawQuaternionRef,
    vrHudYawVectorRef,
    vrHudPitchVectorRef,
    vrTranslationHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
    vrVolumePitchHandleRef,
    vrHandleLocalPointRef,
    vrHandleWorldPointRef,
    vrHandleSecondaryPointRef,
    vrHandleDirectionTempRef,
    vrHandleQuaternionTempRef,
    vrHandleQuaternionTemp2Ref,
    sliderLocalPointRef,
    playbackStateRef,
    playbackLoopRef,
    vrHoverStateRef,
    vrChannelsStateRef,
    vrTracksStateRef,
    controllersRef,
    setControllerVisibility,
    refreshControllerVisibility,
    raycasterRef,
    xrSessionRef,
    sessionCleanupRef,
    preVrCameraStateRef,
    xrPreferredSessionModeRef,
    xrCurrentSessionModeRef,
    xrPendingModeSwitchRef,
    xrPassthroughSupportedRef,
    xrFoveationAppliedRef,
    xrPreviousFoveationRef,
    applyVrPlaybackHoverState,
    updateVrPlaybackHud,
    setVrPlaybackHudVisible,
    setVrChannelsHudVisible,
    setVrTracksHudVisible,
    setPreferredXrSessionMode,
    toggleXrSessionMode,
    setVrPlaybackHudPlacementPosition,
    setVrChannelsHudPlacementPosition,
    setVrTracksHudPlacementPosition,
    setVrPlaybackHudPlacementYaw,
    setVrChannelsHudPlacementYaw,
    setVrTracksHudPlacementYaw,
    setVrPlaybackHudPlacementPitch,
    setVrChannelsHudPlacementPitch,
    setVrTracksHudPlacementPitch,
    applyPlaybackSliderFromWorldPoint,
    applyFpsSliderFromWorldPoint,
    createVrPlaybackHud,
    createVrChannelsHud,
    createVrTracksHud,
    renderVrChannelsHud,
    renderVrTracksHud,
    updateVrChannelsHud,
    updateVrTracksHud,
    applyVrChannelsSliderFromPoint,
    applyVrTracksSliderFromPoint,
    applyVrTracksScrollFromPoint,
    resolveChannelsRegionFromPoint,
    resolveTracksRegionFromPoint,
    updateVolumeHandles,
    applyVolumeYawPitch,
    updateHudGroupFromPlacement,
    setHudPlacement,
    computeVolumeHudFrame,
    resetVrPlaybackHudPlacement,
    resetVrChannelsHudPlacement,
    resetVrTracksHudPlacement,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    applyVrFoveation,
    restoreVrFoveation,
    onRendererInitialized,
    endVrSessionRequestRef,
    updateControllerRays,
  };
}
