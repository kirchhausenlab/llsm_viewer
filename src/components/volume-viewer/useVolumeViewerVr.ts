import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export * from './vr';
export type { UseVolumeViewerVrParams, UseVolumeViewerVrResult, VolumeHandleCandidate } from './useVolumeViewerVr.types';

import type {
  UseVolumeViewerVrParams,
  UseVolumeViewerVrResult,
  VolumeHandleCandidate,
} from './useVolumeViewerVr.types';

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
  VolumeHudFrame,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksState,
  VrHoverState,
  VrUiTarget,
  VrUiTargetType,
} from './vr';
import { computeViewerYawBasis, computeYawAngleForBasis } from './vr/viewerYaw';
import { getHudCategoryFromTarget } from './vr/hudTargets';
import { VrSessionManager } from './vr/sessionManager';
import {
  VR_CHANNELS_CAMERA_ANCHOR_OFFSET,
  VR_CHANNELS_CANVAS_MIN_HEIGHT,
  VR_CHANNELS_CANVAS_WIDTH,
  VR_CHANNELS_PANEL_WIDTH,
  VR_CHANNELS_PANEL_HEIGHT,
  VR_CHANNELS_VERTICAL_OFFSET,
  VR_HUD_FRONT_MARGIN,
  VR_HUD_LATERAL_MARGIN,
  VR_HUD_MIN_HEIGHT,
  VR_HUD_PLACEMENT_EPSILON,
  VR_HUD_SURFACE_OFFSET,
  VR_HUD_TRANSLATE_HANDLE_COLOR,
  VR_HUD_TRANSLATE_HANDLE_OFFSET,
  VR_HUD_TRANSLATE_HANDLE_RADIUS,
  VR_HUD_YAW_HANDLE_COLOR,
  VR_HUD_YAW_HANDLE_OFFSET,
  VR_HUD_YAW_HANDLE_RADIUS,
  VR_PITCH_HANDLE_FORWARD_OFFSET,
  VR_PLAYBACK_CAMERA_ANCHOR_OFFSET,
  VR_PLAYBACK_MAX_FPS,
  VR_PLAYBACK_MIN_FPS,
  VR_PLAYBACK_PANEL_HEIGHT,
  VR_PLAYBACK_PANEL_WIDTH,
  VR_PLAYBACK_VERTICAL_OFFSET,
  VR_ROTATION_HANDLE_OFFSET,
  VR_ROTATION_HANDLE_RADIUS,
  VR_SCALE_HANDLE_OFFSET,
  VR_SCALE_HANDLE_RADIUS,
  VR_TRACKS_CAMERA_ANCHOR_OFFSET,
  VR_TRACKS_CANVAS_HEIGHT,
  VR_TRACKS_CANVAS_WIDTH,
  VR_TRACKS_PANEL_WIDTH,
  VR_TRACKS_PANEL_HEIGHT,
  VR_TRACKS_VERTICAL_OFFSET,
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
  renderVrChannelsHud as renderVrChannelsHudContent,
  renderVrTracksHud as renderVrTracksHudContent,
} from './vr/hudRenderers';
import {
  setVrPlaybackFpsFraction,
  setVrPlaybackFpsLabel,
  setVrPlaybackLabel,
  setVrPlaybackProgressFraction,
} from './vr/hudMutators';
import {
  createVrPlaybackHud as buildPlaybackHud,
  createVrChannelsHud as buildChannelsHud,
  createVrTracksHud as buildTracksHud,
} from './vr/hudFactory';
import { applyPlaybackHoverState as updatePlaybackHoverVisuals } from './vr/hudInteractions';
import {
  updateVrPlaybackHud as applyPlaybackHudState,
  updateVrChannelsHud as applyChannelsHudState,
  updateVrTracksHud as applyTracksHudState,
} from './vr/hudUpdaters';
import {
  constrainHudPlacementPosition as clampHudPlacementPosition,
  getHudQuaternionFromAngles as deriveHudQuaternion,
  resetHudPlacement as resetHudPlacementTransform,
  setHudPlacement as applyHudPlacement,
  updateHudGroupFromPlacement as syncHudGroupPlacement,
} from './vr/hudPlacement';
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

  const callOnRegisterVrSession = useCallback(
    (
      handlers:
        | {
            requestSession: () => Promise<XRSession | null>;
            endSession: () => Promise<void> | void;
          }
        | null,
    ) => {
      if (handlers) {
        endVrSessionRequestRef.current = handlers.endSession;
      } else {
        endVrSessionRequestRef.current = null;
      }
      vrPropsRef.current?.onRegisterVrSession?.(handlers);
    },
    [endVrSessionRequestRef],
  );

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

  const controllerTempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const controllerProjectedPoint = useMemo(() => new THREE.Vector3(), []);
  const playbackTouchPoint = useMemo(() => new THREE.Vector3(), []);
  const playbackLocalPoint = useMemo(() => new THREE.Vector3(), []);
  const playbackPlaneNormal = useMemo(() => new THREE.Vector3(), []);
  const playbackSliderPoint = useMemo(() => new THREE.Vector3(), []);
  const fpsSliderPoint = useMemo(() => new THREE.Vector3(), []);
  const channelsTouchPoint = useMemo(() => new THREE.Vector3(), []);
  const tracksTouchPoint = useMemo(() => new THREE.Vector3(), []);
  const translationHandleWorldPoint = useMemo(() => new THREE.Vector3(), []);
  const rotationCenterWorldPoint = useMemo(() => new THREE.Vector3(), []);
  const rotationDirectionTemp = useMemo(() => new THREE.Vector3(), []);
  const rotationHandleWorldPoint = useMemo(() => new THREE.Vector3(), []);
  const scaleHandleWorldPoint = useMemo(() => new THREE.Vector3(), []);
  const scaleDirectionTemp = useMemo(() => new THREE.Vector3(), []);
  const scaleTargetWorldPoint = useMemo(() => new THREE.Vector3(), []);
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

  const onLayerWindowMinChange = vrProps?.onLayerWindowMinChange;
  const onLayerWindowMaxChange = vrProps?.onLayerWindowMaxChange;
  const onLayerContrastChange = vrProps?.onLayerContrastChange;
  const onLayerBrightnessChange = vrProps?.onLayerBrightnessChange;
  const onLayerOffsetChange = vrProps?.onLayerOffsetChange;
  const onTrackOpacityChange = vrProps?.onTrackOpacityChange;
  const onTrackLineWidthChange = vrProps?.onTrackLineWidthChange;

  const applyVrPlaybackHoverState = useCallback<
    UseVolumeViewerVrResult['applyVrPlaybackHoverState']
  >(
    (
      playHovered,
      playbackSliderHovered,
      playbackSliderActive,
      fpsSliderHovered,
      fpsSliderActive,
      resetVolumeHovered,
      resetHudHovered,
      exitHovered,
      modeHovered,
    ) => {
      const nextHoverState: VrHoverState = {
        play: playHovered,
        playbackSlider: playbackSliderHovered,
        playbackSliderActive,
        fpsSlider: fpsSliderHovered,
        fpsSliderActive,
        resetVolume: resetVolumeHovered,
        resetHud: resetHudHovered,
        exit: exitHovered,
        mode: modeHovered,
      };
      vrHoverStateRef.current = nextHoverState;
      const hud = vrPlaybackHudRef.current;
      if (!hud) {
        return;
      }
      const state = playbackStateRef.current;
      updatePlaybackHoverVisuals(hud, state, nextHoverState);
    },
    [playbackStateRef, vrPlaybackHudRef],
  );

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

  const updateVrPlaybackHud = useCallback<UseVolumeViewerVrResult['updateVrPlaybackHud']>(() => {
    const hud = vrPlaybackHudRef.current;
    if (!hud) {
      return;
    }
    applyPlaybackHudState(hud, playbackStateRef.current, vrHoverStateRef.current);
  }, [playbackStateRef, vrHoverStateRef, vrPlaybackHudRef]);

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

  const setVrPlaybackHudVisible = useCallback<UseVolumeViewerVrResult['setVrPlaybackHudVisible']>(
    (visible) => {
      const hud = vrPlaybackHudRef.current;
      if (!hud) {
        return;
      }
      hud.group.visible = visible;
      if (!visible) {
        applyVrPlaybackHoverState(false, false, false, false, false, false, false, false, false);
      }
    },
    [applyVrPlaybackHoverState, vrPlaybackHudRef],
  );

  const setVrChannelsHudVisible = useCallback<UseVolumeViewerVrResult['setVrChannelsHudVisible']>(
    (visible) => {
      const hud = vrChannelsHudRef.current;
      if (!hud) {
        return;
      }
      hud.group.visible = visible;
      if (!visible) {
        hud.hoverRegion = null;
      }
    },
    [vrChannelsHudRef],
  );

  const setVrTracksHudVisible = useCallback<UseVolumeViewerVrResult['setVrTracksHudVisible']>(
    (visible) => {
      const hud = vrTracksHudRef.current;
      if (!hud) {
        return;
      }
      hud.group.visible = visible;
      if (!visible) {
        hud.hoverRegion = null;
      }
    },
    [vrTracksHudRef],
  );

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

  const createVrPlaybackHud = useCallback<UseVolumeViewerVrResult['createVrPlaybackHud']>(
    () => buildPlaybackHud(playbackStateRef.current),
    [],
  );

  const createVrChannelsHud = useCallback<UseVolumeViewerVrResult['createVrChannelsHud']>(
    () => buildChannelsHud(),
    [],
  );

  const resizeVrChannelsHud = useCallback(
    (hud: VrChannelsHud, displayHeight: number) => {
      if (!hud || !hud.panelCanvas) {
        return;
      }
      const pixelRatio = hud.pixelRatio || 1;
      hud.panelDisplayHeight = displayHeight;
      hud.panelCanvas.width = Math.round(hud.panelDisplayWidth * pixelRatio);
      hud.panelCanvas.height = Math.round(displayHeight * pixelRatio);

      const newPanelHeight = (hud.width / hud.panelDisplayWidth) * displayHeight;
      hud.height = newPanelHeight;

      const panelGeometry = new THREE.PlaneGeometry(hud.width, newPanelHeight);
      hud.panel.geometry.dispose();
      hud.panel.geometry = panelGeometry;

      const backgroundGeometry = new THREE.PlaneGeometry(hud.width, newPanelHeight);
      hud.background.geometry.dispose();
      hud.background.geometry = backgroundGeometry;

      const halfHeight = newPanelHeight / 2;
      hud.panelTranslateHandle.position.setY(halfHeight + VR_HUD_TRANSLATE_HANDLE_OFFSET);
      hud.panelPitchHandle.position.setY(-(halfHeight + VR_HUD_YAW_HANDLE_OFFSET));
      hud.panelTranslateHandle.updateMatrixWorld();
      hud.panelPitchHandle.updateMatrixWorld();

      hud.cacheDirty = true;
    },
    [],
  );

  const renderVrChannelsHud = useCallback<UseVolumeViewerVrResult['renderVrChannelsHud']>(
    (hud, state) => {
      const desiredDisplayHeight = renderVrChannelsHudContent(hud, state);
      if (desiredDisplayHeight != null) {
        resizeVrChannelsHud(hud, desiredDisplayHeight);
        renderVrChannelsHudContent(hud, state);
      }
    },
    [resizeVrChannelsHud],
  );

  const createVrTracksHud = useCallback<UseVolumeViewerVrResult['createVrTracksHud']>(
    () => buildTracksHud(),
    [],
  );

  const renderVrTracksHud = useCallback<UseVolumeViewerVrResult['renderVrTracksHud']>((hud, state) => {
    renderVrTracksHudContent(hud, state);
  }, []);

  const updateVrChannelsHud = useCallback<UseVolumeViewerVrResult['updateVrChannelsHud']>(() => {
    const hud = vrChannelsHudRef.current;
    if (!hud) {
      return;
    }
    applyChannelsHudState(hud, vrChannelsStateRef.current, resizeVrChannelsHud);
  }, [resizeVrChannelsHud, vrChannelsHudRef, vrChannelsStateRef]);

  const updateVrTracksHud = useCallback<UseVolumeViewerVrResult['updateVrTracksHud']>(() => {
    const hud = vrTracksHudRef.current;
    if (!hud) {
      return;
    }
    applyTracksHudState(hud, vrTracksStateRef.current);
  }, [vrTracksHudRef, vrTracksStateRef]);

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


  const endVrSession = useCallback(() => {
    const manager = sessionManagerRef.current;
    if (!manager) {
      return Promise.resolve();
    }
    return manager.endSession();
  }, [sessionManagerRef]);

  useEffect(() => {
    endVrSessionRequestRef.current = endVrSession;
    return () => {
      if (endVrSessionRequestRef.current === endVrSession) {
        endVrSessionRequestRef.current = null;
      }
    };
  }, [endVrSession]);

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

  const constrainHudPlacementPosition = useCallback((target: THREE.Vector3) => {
    clampHudPlacementPosition(target);
  }, []);

  const getHudQuaternionFromAngles = useCallback((yaw: number, pitch: number) => {
    return deriveHudQuaternion(yaw, pitch, vrHudYawEulerRef.current, vrHudYawQuaternionRef.current);
  }, []);

  const updateHudGroupFromPlacement = useCallback(
    (hud: VrPlaybackHud | VrChannelsHud | VrTracksHud | null, placement: VrHudPlacement | null) => {
      syncHudGroupPlacement(hud, placement, vrHudYawEulerRef.current, vrHudYawQuaternionRef.current);
    },
    [],
  );

  const setHudPlacement = useCallback(
    (
      placementRef: MutableRefObject<VrHudPlacement | null>,
      dragTargetRef: MutableRefObject<THREE.Vector3>,
      hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
      position: THREE.Vector3,
      yaw: number,
      pitch: number,
    ) => {
      applyHudPlacement(
        placementRef,
        dragTargetRef,
        hudRef,
        position,
        yaw,
        pitch,
        vrHudYawEulerRef.current,
        vrHudYawQuaternionRef.current,
      );
    },
    [vrHudYawEulerRef, vrHudYawQuaternionRef],
  );

  const setVrPlaybackHudPlacementPosition = useCallback<
    UseVolumeViewerVrResult['setVrPlaybackHudPlacementPosition']
  >(
    (nextPosition) => {
      const placement = vrPlaybackHudPlacementRef.current;
      const target = vrHudOffsetTempRef.current;
      target.copy(nextPosition);
      const yaw = placement?.yaw ?? 0;
      const pitch = placement?.pitch ?? 0;
      setHudPlacement(
        vrPlaybackHudPlacementRef,
        vrPlaybackHudDragTargetRef,
        vrPlaybackHudRef,
        target,
        yaw,
        pitch,
      );
    },
    [
      setHudPlacement,
      vrHudOffsetTempRef,
      vrPlaybackHudDragTargetRef,
      vrPlaybackHudPlacementRef,
      vrPlaybackHudRef,
    ],
  );

  const setVrChannelsHudPlacementPosition = useCallback<
    UseVolumeViewerVrResult['setVrChannelsHudPlacementPosition']
  >(
    (nextPosition) => {
      const placement = vrChannelsHudPlacementRef.current;
      const target = vrHudOffsetTempRef.current;
      target.copy(nextPosition);
      const yaw = placement?.yaw ?? 0;
      const pitch = placement?.pitch ?? 0;
      setHudPlacement(
        vrChannelsHudPlacementRef,
        vrChannelsHudDragTargetRef,
        vrChannelsHudRef,
        target,
        yaw,
        pitch,
      );
    },
    [
      setHudPlacement,
      vrChannelsHudDragTargetRef,
      vrChannelsHudPlacementRef,
      vrChannelsHudRef,
      vrHudOffsetTempRef,
    ],
  );

  const setVrTracksHudPlacementPosition = useCallback<
    UseVolumeViewerVrResult['setVrTracksHudPlacementPosition']
  >(
    (nextPosition) => {
      const placement = vrTracksHudPlacementRef.current;
      const target = vrHudOffsetTempRef.current;
      target.copy(nextPosition);
      const yaw = placement?.yaw ?? 0;
      const pitch = placement?.pitch ?? 0;
      setHudPlacement(
        vrTracksHudPlacementRef,
        vrTracksHudDragTargetRef,
        vrTracksHudRef,
        target,
        yaw,
        pitch,
      );
    },
    [
      setHudPlacement,
      vrHudOffsetTempRef,
      vrTracksHudDragTargetRef,
      vrTracksHudPlacementRef,
      vrTracksHudRef,
    ],
  );

  const setVrPlaybackHudPlacementYaw = useCallback<
    UseVolumeViewerVrResult['setVrPlaybackHudPlacementYaw']
  >(
    (nextYaw) => {
      const placement = vrPlaybackHudPlacementRef.current;
      const target = vrHudOffsetTempRef.current;
      if (placement) {
        target.copy(placement.position);
      } else {
        target.set(0, 0, 0);
      }
      const pitch = placement?.pitch ?? 0;
      setHudPlacement(
        vrPlaybackHudPlacementRef,
        vrPlaybackHudDragTargetRef,
        vrPlaybackHudRef,
        target,
        nextYaw,
        pitch,
      );
    },
    [
      setHudPlacement,
      vrHudOffsetTempRef,
      vrPlaybackHudDragTargetRef,
      vrPlaybackHudPlacementRef,
      vrPlaybackHudRef,
    ],
  );

  const setVrChannelsHudPlacementYaw = useCallback<
    UseVolumeViewerVrResult['setVrChannelsHudPlacementYaw']
  >(
    (nextYaw) => {
      const placement = vrChannelsHudPlacementRef.current;
      const target = vrHudOffsetTempRef.current;
      if (placement) {
        target.copy(placement.position);
      } else {
        target.set(0, 0, 0);
      }
      const pitch = placement?.pitch ?? 0;
      setHudPlacement(
        vrChannelsHudPlacementRef,
        vrChannelsHudDragTargetRef,
        vrChannelsHudRef,
        target,
        nextYaw,
        pitch,
      );
    },
    [
      setHudPlacement,
      vrChannelsHudDragTargetRef,
      vrChannelsHudPlacementRef,
      vrChannelsHudRef,
      vrHudOffsetTempRef,
    ],
  );

  const setVrTracksHudPlacementYaw = useCallback<
    UseVolumeViewerVrResult['setVrTracksHudPlacementYaw']
  >(
    (nextYaw) => {
      const placement = vrTracksHudPlacementRef.current;
      const target = vrHudOffsetTempRef.current;
      if (placement) {
        target.copy(placement.position);
      } else {
        target.set(0, 0, 0);
      }
      const pitch = placement?.pitch ?? 0;
      setHudPlacement(
        vrTracksHudPlacementRef,
        vrTracksHudDragTargetRef,
        vrTracksHudRef,
        target,
        nextYaw,
        pitch,
      );
    },
    [
      setHudPlacement,
      vrHudOffsetTempRef,
      vrTracksHudDragTargetRef,
      vrTracksHudPlacementRef,
      vrTracksHudRef,
    ],
  );

  const setVrPlaybackHudPlacementPitch = useCallback<
    UseVolumeViewerVrResult['setVrPlaybackHudPlacementPitch']
  >(
    (nextPitch) => {
      const placement = vrPlaybackHudPlacementRef.current;
      const target = vrHudOffsetTempRef.current;
      if (placement) {
        target.copy(placement.position);
      } else {
        target.set(0, 0, 0);
      }
      const yaw = placement?.yaw ?? 0;
      setHudPlacement(
        vrPlaybackHudPlacementRef,
        vrPlaybackHudDragTargetRef,
        vrPlaybackHudRef,
        target,
        yaw,
        nextPitch,
      );
    },
    [
      setHudPlacement,
      vrHudOffsetTempRef,
      vrPlaybackHudDragTargetRef,
      vrPlaybackHudPlacementRef,
      vrPlaybackHudRef,
    ],
  );

  const setVrChannelsHudPlacementPitch = useCallback<
    UseVolumeViewerVrResult['setVrChannelsHudPlacementPitch']
  >(
    (nextPitch) => {
      const placement = vrChannelsHudPlacementRef.current;
      const target = vrHudOffsetTempRef.current;
      if (placement) {
        target.copy(placement.position);
      } else {
        target.set(0, 0, 0);
      }
      const yaw = placement?.yaw ?? 0;
      setHudPlacement(
        vrChannelsHudPlacementRef,
        vrChannelsHudDragTargetRef,
        vrChannelsHudRef,
        target,
        yaw,
        nextPitch,
      );
    },
    [
      setHudPlacement,
      vrChannelsHudDragTargetRef,
      vrChannelsHudPlacementRef,
      vrChannelsHudRef,
      vrHudOffsetTempRef,
    ],
  );

  const setVrTracksHudPlacementPitch = useCallback<
    UseVolumeViewerVrResult['setVrTracksHudPlacementPitch']
  >(
    (nextPitch) => {
      const placement =
        vrTracksHudPlacementRef.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevPitch = placement.pitch;
      placement.pitch = nextPitch;
      const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      vrTracksHudPlacementRef.current = placement;
      if (pitchChanged && vrTracksHudRef.current) {
        vrTracksHudRef.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(vrTracksHudRef.current, placement);
    },
    [updateHudGroupFromPlacement, vrTracksHudRef],
  );

  const computeVolumeHudFrame = useCallback(() => {
    const baseOffset = volumeRootBaseOffsetRef.current;
    const volumeRootGroup = volumeRootGroupRef.current;
    const halfExtents = volumeRootHalfExtentsRef.current;
    if (!volumeRootGroup || baseOffset.lengthSq() <= 1e-6) {
      return null;
    }
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(volumeRootGroup.quaternion);
    if (forward.lengthSq() <= 1e-8) {
      forward.set(0, 0, -1);
    } else {
      forward.normalize();
    }
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(volumeRootGroup.quaternion);
    if (right.lengthSq() <= 1e-8) {
      right.set(1, 0, 0);
    } else {
      right.normalize();
    }
    const up = new THREE.Vector3(0, 1, 0);
    const frontDistance = (halfExtents ? halfExtents.z : 0) + VR_HUD_FRONT_MARGIN;
    const center = new THREE.Vector3().copy(baseOffset).addScaledVector(forward, -frontDistance);
    const horizontalForward = new THREE.Vector3(forward.x, 0, forward.z);
    if (horizontalForward.lengthSq() <= 1e-8) {
      horizontalForward.set(0, 0, -1);
    } else {
      horizontalForward.normalize();
    }
    const yaw = Math.atan2(horizontalForward.x, horizontalForward.z);
    const pitch = 0;
    return { center, forward, right, up, yaw, pitch };
  }, [volumeRootBaseOffsetRef, volumeRootGroupRef, volumeRootHalfExtentsRef]);

  const resetHudPlacement = useCallback(
    (
      placementRef: MutableRefObject<VrHudPlacement | null>,
      dragTargetRef: MutableRefObject<THREE.Vector3>,
      hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
      fallbackOffset: THREE.Vector3,
      verticalOffset: number,
      lateralOffset: number,
    ) => {
      resetHudPlacementTransform({
        placementRef,
        dragTargetRef,
        hudRef,
        fallbackOffset,
        verticalOffset,
        lateralOffset,
        computeHudFrame: computeVolumeHudFrame,
        camera: cameraRef.current,
        target: vrHudOffsetTempRef.current,
        yawEuler: vrHudYawEulerRef.current,
        yawQuaternion: vrHudYawQuaternionRef.current,
      });
    },
    [
      cameraRef,
      computeVolumeHudFrame,
      vrHudOffsetTempRef,
      vrHudYawEulerRef,
      vrHudYawQuaternionRef,
    ],
  );

  const resetVrPlaybackHudPlacement = useCallback(() => {
    const playbackVerticalOffset = VR_PLAYBACK_VERTICAL_OFFSET;
    resetHudPlacement(
      vrPlaybackHudPlacementRef,
      vrPlaybackHudDragTargetRef,
      vrPlaybackHudRef,
      VR_PLAYBACK_CAMERA_ANCHOR_OFFSET,
      playbackVerticalOffset,
      0,
    );
  }, [resetHudPlacement, vrPlaybackHudDragTargetRef, vrPlaybackHudPlacementRef, vrPlaybackHudRef]);

  const resetVrChannelsHudPlacement = useCallback(() => {
    const lateralDistance =
      VR_PLAYBACK_PANEL_WIDTH / 2 + VR_HUD_LATERAL_MARGIN + VR_CHANNELS_PANEL_WIDTH / 2;
    resetHudPlacement(
      vrChannelsHudPlacementRef,
      vrChannelsHudDragTargetRef,
      vrChannelsHudRef,
      VR_CHANNELS_CAMERA_ANCHOR_OFFSET,
      VR_CHANNELS_VERTICAL_OFFSET,
      lateralDistance,
    );
  }, [resetHudPlacement, vrChannelsHudDragTargetRef, vrChannelsHudPlacementRef, vrChannelsHudRef]);

  const resetVrTracksHudPlacement = useCallback(() => {
    const lateralDistance =
      -(VR_PLAYBACK_PANEL_WIDTH / 2 + VR_HUD_LATERAL_MARGIN + VR_TRACKS_PANEL_WIDTH / 2);
    resetHudPlacement(
      vrTracksHudPlacementRef,
      vrTracksHudDragTargetRef,
      vrTracksHudRef,
      VR_TRACKS_CAMERA_ANCHOR_OFFSET,
      VR_TRACKS_VERTICAL_OFFSET,
      lateralDistance,
    );
  }, [resetHudPlacement, vrTracksHudDragTargetRef, vrTracksHudPlacementRef, vrTracksHudRef]);

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

  const callOnVrSessionStarted = useCallback(() => {
    applySessionStartState();
    if (!disposedRef.current) {
      vrPropsRef.current?.onVrSessionStarted?.();
    }
  }, [applySessionStartState, disposedRef, vrPropsRef]);

  const callOnVrSessionEnded = useCallback(() => {
    applySessionEndState();
    if (!disposedRef.current) {
      vrPropsRef.current?.onVrSessionEnded?.();
    }
  }, [applySessionEndState, disposedRef, vrPropsRef]);

  const sessionManager = useMemo(
    () =>
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
        onSessionStarted: callOnVrSessionStarted,
        onSessionEnded: callOnVrSessionEnded,
        onAfterSessionEnd,
        vrLogRef,
        disposedRef,
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
      callOnVrSessionStarted,
      callOnVrSessionEnded,
      onAfterSessionEnd,
      vrLogRef,
      disposedRef,
    ],
  );

  useEffect(() => {
    sessionManagerRef.current = sessionManager;
    return () => {
      if (sessionManagerRef.current === sessionManager) {
        sessionManagerRef.current = null;
      }
      sessionManager.dispose();
    };
  }, [sessionManager]);

  const requestVrSession = useCallback(() => {
    const manager = sessionManagerRef.current;
    if (!manager) {
      return Promise.reject(new Error('VR session manager not initialized'));
    }
    return manager.requestSession();
  }, [sessionManagerRef]);

  useEffect(() => {
    requestVrSessionRef.current = requestVrSession;
    return () => {
      if (requestVrSessionRef.current === requestVrSession) {
        requestVrSessionRef.current = null;
      }
    };
  }, [requestVrSession]);

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
  const updateControllerRaysRef = useRef<() => void>(() => {});

  const configureControllerEntry = useCallback(
    (entry: ControllerEntry, index: number) => {
      const log = (...args: Parameters<typeof console.debug>) => {
        vrLogRef.current?.(...args);
      };
      const refreshControllers = () => {
        refreshControllerVisibilityRef.current?.();
      };

      entry.onConnected = (event) => {
        entry.isConnected = true;
        entry.targetRayMode = event?.data?.targetRayMode ?? null;
        entry.gamepad = event?.data?.gamepad ?? null;
        entry.hoverTrackId = null;
        entry.hoverUiTarget = null;
        entry.activeUiTarget = null;
        entry.hasHoverUiPoint = false;
        entry.hudGrabOffsets.playback = null;
        entry.hudGrabOffsets.channels = null;
        entry.hudGrabOffsets.tracks = null;
        entry.translateGrabOffset = null;
        entry.scaleGrabOffset = null;
        entry.volumeScaleState = null;
        entry.volumeRotationState = null;
        entry.hudRotationState = null;
        entry.rayLength = 3;
        log('[VR] controller connected', index, {
          targetRayMode: entry.targetRayMode,
          hasGamepad: Boolean(entry.gamepad),
        });
        refreshControllers();
      };

      entry.onDisconnected = () => {
        entry.isConnected = false;
        entry.targetRayMode = null;
        entry.gamepad = null;
        entry.hoverTrackId = null;
        entry.hoverUiTarget = null;
        entry.activeUiTarget = null;
        entry.hasHoverUiPoint = false;
        entry.rayLength = 3;
        entry.isSelecting = false;
        entry.ray.scale.set(1, 1, entry.rayLength);
        entry.hudGrabOffsets.playback = null;
        entry.hudGrabOffsets.channels = null;
        entry.hudGrabOffsets.tracks = null;
        entry.translateGrabOffset = null;
        entry.scaleGrabOffset = null;
        entry.volumeScaleState = null;
        entry.volumeRotationState = null;
        entry.hudRotationState = null;
        entry.touchIndicator.visible = false;
        log('[VR] controller disconnected', index);
        refreshControllers();
        vrClearHoverStateRef.current?.('controller');
      };

      entry.onSelectStart = () => {
        entry.isSelecting = true;
        entry.activeUiTarget = entry.hoverUiTarget;
        entry.hudRotationState = null;
        entry.volumeRotationState = null;
        const activeType = entry.activeUiTarget?.type ?? null;
        const hudCategory = getHudCategoryFromTarget(activeType);
        const rendererInstance = rendererRef.current;
        const camera = cameraRef.current;
        if (
          activeType === 'playback-panel-yaw' ||
          activeType === 'channels-panel-yaw' ||
          activeType === 'tracks-panel-yaw' ||
          activeType === 'playback-panel-pitch' ||
          activeType === 'channels-panel-pitch' ||
          activeType === 'tracks-panel-pitch'
        ) {
          let placement: VrHudPlacement | null = null;
          if (activeType === 'playback-panel-yaw' || activeType === 'playback-panel-pitch') {
            placement = vrPlaybackHudPlacementRef.current;
          } else if (activeType === 'channels-panel-yaw' || activeType === 'channels-panel-pitch') {
            placement = vrChannelsHudPlacementRef.current;
          } else if (activeType === 'tracks-panel-yaw' || activeType === 'tracks-panel-pitch') {
            placement = vrTracksHudPlacementRef.current;
          }
          if (placement && hudCategory) {
            if (
              activeType === 'playback-panel-yaw' ||
              activeType === 'channels-panel-yaw' ||
              activeType === 'tracks-panel-yaw'
            ) {
              const yawVector = vrHudYawVectorRef.current;
              yawVector.copy(entry.rayOrigin).sub(placement.position);
              yawVector.y = 0;
              let initialAngle = placement.yaw;
              const yawBasisForward = new THREE.Vector3();
              const yawBasisRight = new THREE.Vector3();
              computeViewerYawBasis(rendererInstance, camera, yawBasisForward, yawBasisRight);
              if (yawVector.lengthSq() > 1e-6) {
                initialAngle = computeYawAngleForBasis(yawVector, yawBasisForward, yawBasisRight);
              }
              entry.hudRotationState = {
                hud: hudCategory,
                mode: 'yaw',
                initialYaw: placement.yaw,
                initialAngle,
                basisForward: yawBasisForward,
                basisRight: yawBasisRight,
              };
            } else {
              const pitchVector = vrHudPitchVectorRef.current;
              pitchVector.copy(entry.rayOrigin).sub(placement.position);
              pitchVector.x = 0;
              let initialAngle = placement.pitch ?? 0;
              const pitchBasisForward = new THREE.Vector3();
              const pitchBasisRight = new THREE.Vector3();
              computeViewerYawBasis(rendererInstance, camera, pitchBasisForward, pitchBasisRight);
              if (pitchVector.lengthSq() > 1e-6) {
                const forwardComponent = pitchVector.dot(pitchBasisForward);
                initialAngle = Math.atan2(pitchVector.y, forwardComponent);
              }
              entry.hudRotationState = {
                hud: hudCategory,
                mode: 'pitch',
                initialPitch: placement.pitch ?? 0,
                initialAngle,
                basisForward: pitchBasisForward,
              };
            }
          } else {
            entry.activeUiTarget = null;
          }
        }
        const playbackState = playbackStateRef.current;
        if (entry.activeUiTarget?.type === 'playback-play-toggle' && playbackState.playbackDisabled) {
          entry.activeUiTarget = null;
        }
        if (
          entry.activeUiTarget?.type === 'playback-slider' &&
          entry.hasHoverUiPoint &&
          !playbackState.playbackDisabled
        ) {
          applyPlaybackSliderFromWorldPointRef.current?.(entry.hoverUiPoint);
        }
        if (
          entry.activeUiTarget?.type === 'playback-fps-slider' &&
          entry.hasHoverUiPoint &&
          playbackState.totalTimepoints > 1
        ) {
          applyFpsSliderFromWorldPointRef.current?.(entry.hoverUiPoint);
        }
        if (entry.activeUiTarget?.type === 'playback-panel-grab') {
          const hud = vrPlaybackHudRef.current;
          if (hud) {
            const placement = vrPlaybackHudPlacementRef.current;
            const referencePosition = vrPlaybackHudDragTargetRef.current;
            referencePosition.copy(placement?.position ?? hud.group.position);
            if (!entry.hasHoverUiPoint) {
              entry.hoverUiPoint.copy(referencePosition);
              entry.hasHoverUiPoint = true;
            }
            if (!entry.hudGrabOffsets.playback) {
              entry.hudGrabOffsets.playback = new THREE.Vector3();
            }
            entry.hudGrabOffsets.playback.copy(referencePosition).sub(entry.rayOrigin);
          }
        }
        if (
          entry.activeUiTarget?.type === 'channels-slider' &&
          entry.hasHoverUiPoint &&
          entry.activeUiTarget.data &&
          !(entry.activeUiTarget.data as VrChannelsInteractiveRegion).disabled
        ) {
          applyVrChannelsSliderFromPointRef.current?.(
            entry.activeUiTarget.data as VrChannelsInteractiveRegion,
            entry.hoverUiPoint,
          );
        }
        if (entry.activeUiTarget?.type === 'channels-panel-grab') {
          const hud = vrChannelsHudRef.current;
          if (hud) {
            const placement = vrChannelsHudPlacementRef.current;
            const referencePosition = vrChannelsHudDragTargetRef.current;
            referencePosition.copy(placement?.position ?? hud.group.position);
            if (!entry.hasHoverUiPoint) {
              entry.hoverUiPoint.copy(referencePosition);
              entry.hasHoverUiPoint = true;
            }
            if (!entry.hudGrabOffsets.channels) {
              entry.hudGrabOffsets.channels = new THREE.Vector3();
            }
            entry.hudGrabOffsets.channels.copy(referencePosition).sub(entry.rayOrigin);
          }
        }
        if (
          entry.activeUiTarget &&
          (entry.activeUiTarget.type === 'tracks-slider' || entry.activeUiTarget.type === 'tracks-scroll') &&
          entry.hasHoverUiPoint &&
          entry.activeUiTarget.data &&
          !(entry.activeUiTarget.data as VrTracksInteractiveRegion).disabled
        ) {
          const region = entry.activeUiTarget.data as VrTracksInteractiveRegion;
          if (entry.activeUiTarget.type === 'tracks-slider') {
            applyVrTracksSliderFromPointRef.current?.(region, entry.hoverUiPoint);
          } else {
            applyVrTracksScrollFromPointRef.current?.(region, entry.hoverUiPoint);
          }
        }
        if (entry.activeUiTarget?.type === 'tracks-panel-grab') {
          const hud = vrTracksHudRef.current;
          if (hud) {
            const placement = vrTracksHudPlacementRef.current;
            const referencePosition = vrTracksHudDragTargetRef.current;
            referencePosition.copy(placement?.position ?? hud.group.position);
            if (!entry.hasHoverUiPoint) {
              entry.hoverUiPoint.copy(referencePosition);
              entry.hasHoverUiPoint = true;
            }
            if (!entry.hudGrabOffsets.tracks) {
              entry.hudGrabOffsets.tracks = new THREE.Vector3();
            }
            entry.hudGrabOffsets.tracks.copy(referencePosition).sub(entry.rayOrigin);
          }
        }
        if (entry.activeUiTarget?.type === 'volume-translate-handle') {
          const handle = vrTranslationHandleRef.current;
          if (handle) {
            handle.getWorldPosition(vrHandleWorldPointRef.current);
            if (!entry.translateGrabOffset) {
              entry.translateGrabOffset = new THREE.Vector3();
            }
            entry.translateGrabOffset.copy(vrHandleWorldPointRef.current).sub(entry.rayOrigin);
          }
        } else if (entry.activeUiTarget?.type === 'volume-scale-handle') {
          const handle = vrVolumeScaleHandleRef.current;
          const volumeRootGroup = volumeRootGroupRef.current;
          if (handle && volumeRootGroup) {
            handle.getWorldPosition(vrHandleWorldPointRef.current);
            if (!entry.scaleGrabOffset) {
              entry.scaleGrabOffset = new THREE.Vector3();
            }
            entry.scaleGrabOffset.copy(vrHandleWorldPointRef.current).sub(entry.rayOrigin);
            vrHandleSecondaryPointRef.current.copy(volumeRootCenterUnscaledRef.current);
            volumeRootGroup.localToWorld(vrHandleSecondaryPointRef.current);
            vrHandleDirectionTempRef.current
              .copy(vrHandleWorldPointRef.current)
              .sub(vrHandleSecondaryPointRef.current);
            const directionLength = vrHandleDirectionTempRef.current.length();
            if (directionLength > 1e-6) {
              vrHandleDirectionTempRef.current.divideScalar(directionLength);
              const userScale = Math.max(volumeUserScaleRef.current, 1e-6);
              const baseLength = directionLength / userScale;
              entry.volumeScaleState = {
                direction: vrHandleDirectionTempRef.current.clone(),
                baseLength,
              };
            } else {
              entry.volumeScaleState = null;
              entry.activeUiTarget = null;
            }
          } else {
            entry.volumeScaleState = null;
            entry.activeUiTarget = null;
          }
        }
        if (
          entry.activeUiTarget?.type === 'volume-yaw-handle' ||
          entry.activeUiTarget?.type === 'volume-pitch-handle'
        ) {
          const volumeRootGroup = volumeRootGroupRef.current;
          if (volumeRootGroup) {
            vrHandleSecondaryPointRef.current.copy(volumeRootCenterUnscaledRef.current);
            volumeRootGroup.localToWorld(vrHandleSecondaryPointRef.current);
            vrHandleDirectionTempRef.current.copy(entry.rayOrigin).sub(vrHandleSecondaryPointRef.current);
            if (entry.activeUiTarget.type === 'volume-yaw-handle') {
              vrHandleDirectionTempRef.current.y = 0;
              let initialAngle = volumeYawRef.current;
              const yawBasisForward = new THREE.Vector3();
              const yawBasisRight = new THREE.Vector3();
              computeViewerYawBasis(rendererInstance, camera, yawBasisForward, yawBasisRight);
              if (vrHandleDirectionTempRef.current.lengthSq() > 1e-6) {
                initialAngle = computeYawAngleForBasis(
                  vrHandleDirectionTempRef.current,
                  yawBasisForward,
                  yawBasisRight,
                );
              }
              entry.volumeRotationState = {
                mode: 'yaw',
                initialYaw: volumeYawRef.current,
                initialAngle,
                basisForward: yawBasisForward,
                basisRight: yawBasisRight,
              };
            } else {
              vrHandleDirectionTempRef.current.x = 0;
              let initialAngle = volumePitchRef.current;
              const pitchBasisForward = new THREE.Vector3();
              const pitchBasisRight = new THREE.Vector3();
              computeViewerYawBasis(rendererInstance, camera, pitchBasisForward, pitchBasisRight);
              if (vrHandleDirectionTempRef.current.lengthSq() > 1e-6) {
                const forwardComponent = vrHandleDirectionTempRef.current.dot(pitchBasisForward);
                initialAngle = Math.atan2(vrHandleDirectionTempRef.current.y, forwardComponent);
              }
              entry.volumeRotationState = {
                mode: 'pitch',
                initialPitch: volumePitchRef.current,
                initialAngle,
                basisForward: pitchBasisForward,
              };
            }
          } else {
            entry.activeUiTarget = null;
          }
        }
        log('[VR] selectstart', index, {
          hoverTrackId: entry.hoverTrackId,
          uiTarget: entry.activeUiTarget?.type ?? null,
        });
      };

      entry.onSelectEnd = () => {
        entry.isSelecting = false;
        const activeTarget = entry.activeUiTarget;
        entry.activeUiTarget = null;
        const playbackState = playbackStateRef.current;
        const vrCallbacks = vrPropsRef.current;
        if (activeTarget?.type === 'playback-play-toggle') {
          if (!playbackState.playbackDisabled) {
            playbackState.onTogglePlayback?.();
          }
        } else if (activeTarget?.type === 'playback-reset-volume') {
          onResetVolumeRef.current?.();
        } else if (activeTarget?.type === 'playback-reset-hud') {
          onResetHudPlacementRef.current?.();
        } else if (activeTarget?.type === 'playback-exit-vr') {
          void endVrSessionRequestRef.current?.();
        } else if (activeTarget?.type === 'playback-toggle-mode') {
          toggleXrSessionMode();
        } else if (activeTarget?.type === 'playback-slider') {
          if (entry.hasHoverUiPoint && !playbackState.playbackDisabled) {
            applyPlaybackSliderFromWorldPointRef.current?.(entry.hoverUiPoint);
          }
        } else if (activeTarget?.type === 'playback-fps-slider') {
          if (entry.hasHoverUiPoint && playbackState.totalTimepoints > 1) {
            applyFpsSliderFromWorldPointRef.current?.(entry.hoverUiPoint);
          }
        } else if (activeTarget?.type === 'playback-panel-grab') {
          entry.hudGrabOffsets.playback = null;
          entry.hudRotationState = null;
        } else if (
          activeTarget?.type === 'playback-panel-yaw' ||
          activeTarget?.type === 'playback-panel-pitch'
        ) {
          entry.hudRotationState = null;
        } else if (activeTarget?.type === 'channels-panel-grab') {
          entry.hudGrabOffsets.channels = null;
          entry.hudRotationState = null;
        } else if (
          activeTarget?.type === 'channels-panel-yaw' ||
          activeTarget?.type === 'channels-panel-pitch'
        ) {
          entry.hudRotationState = null;
        } else if (activeTarget?.type === 'channels-reset' && activeTarget.data) {
          const region = activeTarget.data as VrChannelsInteractiveRegion;
          vrCallbacks?.onChannelReset?.(region.channelId);
        } else if (
          activeTarget?.type === 'channels-slider' &&
          activeTarget.data &&
          !(activeTarget.data as VrChannelsInteractiveRegion).disabled &&
          entry.hasHoverUiPoint
        ) {
          applyVrChannelsSliderFromPointRef.current?.(
            activeTarget.data as VrChannelsInteractiveRegion,
            entry.hoverUiPoint,
          );
        } else if (activeTarget?.type === 'channels-tab' && activeTarget.data) {
          const region = activeTarget.data as VrChannelsInteractiveRegion;
          vrCallbacks?.onChannelPanelSelect?.(region.channelId);
          const state = vrChannelsStateRef.current;
          if (state.activeChannelId !== region.channelId) {
            state.activeChannelId = region.channelId;
            updateVrChannelsHudRef.current?.();
          }
        } else if (activeTarget?.type === 'channels-visibility' && activeTarget.data) {
          const region = activeTarget.data as VrChannelsInteractiveRegion;
          if (!region.disabled) {
            vrCallbacks?.onChannelVisibilityToggle?.(region.channelId);
          }
        } else if (activeTarget?.type === 'channels-layer' && activeTarget.data) {
          const region = activeTarget.data as VrChannelsInteractiveRegion;
          if (region.layerKey) {
            vrCallbacks?.onLayerSelect?.(region.layerKey);
          }
        } else if (activeTarget?.type === 'channels-solo' && activeTarget.data) {
          const region = activeTarget.data as VrChannelsInteractiveRegion;
          if (!region.disabled && region.layerKey) {
            vrCallbacks?.onLayerSoloToggle?.(region.layerKey);
          }
        } else if (activeTarget?.type === 'channels-invert' && activeTarget.data) {
          const region = activeTarget.data as VrChannelsInteractiveRegion;
          if (!region.disabled && region.layerKey) {
            vrCallbacks?.onLayerInvertToggle?.(region.layerKey);
          }
        } else if (activeTarget?.type === 'channels-auto-contrast' && activeTarget.data) {
          const region = activeTarget.data as VrChannelsInteractiveRegion;
          if (!region.disabled && region.layerKey) {
            vrCallbacks?.onLayerAutoContrast?.(region.layerKey);
          }
        } else if (activeTarget?.type === 'tracks-panel-grab') {
          entry.hudGrabOffsets.tracks = null;
          entry.hudRotationState = null;
        } else if (
          activeTarget?.type === 'tracks-panel-yaw' ||
          activeTarget?.type === 'tracks-panel-pitch'
        ) {
          entry.hudRotationState = null;
        } else if (activeTarget?.type === 'tracks-tab' && activeTarget.data) {
          const region = activeTarget.data as VrTracksInteractiveRegion;
          vrCallbacks?.onTrackChannelSelect?.(region.channelId);
        } else if (activeTarget?.type === 'tracks-stop-follow' && activeTarget.data) {
          const region = activeTarget.data as VrTracksInteractiveRegion;
          if (!region.disabled) {
            vrCallbacks?.onStopTrackFollow?.(region.channelId);
          }
        } else if (activeTarget?.type === 'tracks-color' && activeTarget.data) {
          const region = activeTarget.data as VrTracksInteractiveRegion;
          if (!region.disabled && region.color) {
            vrCallbacks?.onTrackColorSelect?.(region.channelId, region.color);
          }
        } else if (activeTarget?.type === 'tracks-color-mode' && activeTarget.data) {
          const region = activeTarget.data as VrTracksInteractiveRegion;
          if (!region.disabled) {
            vrCallbacks?.onTrackColorReset?.(region.channelId);
          }
        } else if (activeTarget?.type === 'tracks-master-toggle' && activeTarget.data) {
          const region = activeTarget.data as VrTracksInteractiveRegion;
          if (!region.disabled) {
            const channelState = vrTracksStateRef.current.channels.find(
              (channel) => channel.id === region.channelId,
            );
            if (channelState) {
              const trackCount = channelState.tracks.length;
              const enableAll = trackCount > 0 && channelState.visibleTracks < trackCount;
              vrCallbacks?.onTrackVisibilityAllChange?.(region.channelId, enableAll);
            }
          }
        } else if (activeTarget?.type === 'tracks-toggle' && activeTarget.data) {
          const region = activeTarget.data as VrTracksInteractiveRegion;
          if (region.trackId) {
            vrCallbacks?.onTrackVisibilityToggle?.(region.trackId);
          }
        } else if (activeTarget?.type === 'tracks-follow' && activeTarget.data) {
          const region = activeTarget.data as VrTracksInteractiveRegion;
          if (region.trackId) {
            onTrackFollowRequestRef.current?.(region.trackId);
          }
        } else if (entry.hoverTrackId) {
          onTrackFollowRequestRef.current?.(entry.hoverTrackId);
        }
        log('[VR] selectend', index, {
          hoverTrackId: entry.hoverTrackId,
          uiTarget: activeTarget?.type ?? null,
        });
      };
    }, [
      applyFpsSliderFromWorldPointRef,
      applyPlaybackSliderFromWorldPointRef,
      applyVrChannelsSliderFromPointRef,
      applyVrTracksScrollFromPointRef,
      applyVrTracksSliderFromPointRef,
      cameraRef,
      endVrSessionRequestRef,
      onResetHudPlacementRef,
      onResetVolumeRef,
      onTrackFollowRequestRef,
      playbackStateRef,
      rendererRef,
      toggleXrSessionMode,
      vrChannelsHudDragTargetRef,
      vrChannelsHudPlacementRef,
      vrChannelsHudRef,
      vrChannelsStateRef,
      vrClearHoverStateRef,
      vrHandleDirectionTempRef,
      vrHandleSecondaryPointRef,
      vrHandleWorldPointRef,
      vrHudPitchVectorRef,
      vrHudYawVectorRef,
      vrLogRef,
      vrPlaybackHudDragTargetRef,
      vrPlaybackHudPlacementRef,
      vrPlaybackHudRef,
      vrTracksHudDragTargetRef,
      vrTracksHudPlacementRef,
      vrTracksHudRef,
      vrTracksStateRef,
      vrTranslationHandleRef,
      vrVolumePitchHandleRef,
      vrVolumeScaleHandleRef,
      vrVolumeYawHandlesRef,
      volumePitchRef,
      volumeRootCenterUnscaledRef,
      volumeRootGroupRef,
      volumeUserScaleRef,
      volumeYawRef,
      refreshControllerVisibilityRef,
      vrPropsRef,
    ]);


  const updateControllerRays = useCallback(() => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }
    const log = vrLogRef.current;
    let lastControllerRaySummary = lastControllerRaySummaryRef.current;
    if (!renderer.xr.isPresenting) {
      if (!lastControllerRaySummary || lastControllerRaySummary.presenting !== false) {
        log?.('[VR] skipping controller rays – not presenting');
      }
      lastControllerRaySummary = {
        presenting: false,
        visibleLines: 0,
        hoverTrackIds: controllersRef.current.map((entry) => entry.hoverTrackId),
      };
      lastControllerRaySummaryRef.current = lastControllerRaySummary;
      vrClearHoverStateRef.current?.('controller');
      applyVrPlaybackHoverState(false, false, false, false, false, false, false, false, false);
      return;
    }

    const cameraInstance = cameraRef.current;
    const trackGroupInstance = trackGroupRef.current;
    const containerInstance = containerRef.current;

    const visibleLines: Line2[] = [];
    if (trackGroupInstance && trackGroupInstance.visible) {
      for (const resource of trackLinesRef.current.values()) {
        if (resource.line.visible) {
          visibleLines.push(resource.line);
        }
      }
    }

    let hoveredByController: { trackId: string; position: { x: number; y: number } | null } | null = null;
    let playHoveredAny = false;
    let playbackSliderHoveredAny = false;
    let playbackSliderActiveAny = false;
    let fpsSliderHoveredAny = false;
    let fpsSliderActiveAny = false;
    let resetVolumeHoveredAny = false;
    let resetHudHoveredAny = false;
    let exitHoveredAny = false;
    let modeHoveredAny = false;
    let nextChannelsHoverRegion: VrChannelsInteractiveRegion | null = null;
    let nextTracksHoverRegion: VrTracksInteractiveRegion | null = null;
    let rotationHandleHovered = false;
    let rotationHandleActive = false;

    for (let index = 0; index < controllersRef.current.length; index++) {
      const entry = controllersRef.current[index];
      const previousHoverTrackId = entry.hoverTrackId;
      const previousUiType = entry.hoverUiTarget ? entry.hoverUiTarget.type : null;
      if (!entry.controller.visible) {
        entry.hoverTrackId = null;
        entry.hoverUiTarget = null;
        entry.activeUiTarget = null;
        entry.hasHoverUiPoint = false;
        entry.rayLength = 3;
        entry.ray.scale.set(1, 1, entry.rayLength);
        if (previousHoverTrackId !== entry.hoverTrackId || previousUiType !== null) {
          log?.('[VR] controller hover cleared', index);
        }
        continue;
      }

      controllerTempMatrix.identity().extractRotation(entry.controller.matrixWorld);
      entry.rayOrigin.setFromMatrixPosition(entry.controller.matrixWorld);
      entry.rayDirection.set(0, 0, -1).applyMatrix4(controllerTempMatrix).normalize();
      entry.raycaster.ray.origin.copy(entry.rayOrigin);
      entry.raycaster.ray.direction.copy(entry.rayDirection);

      let rayLength = 3;
      let hoverTrackId: string | null = null;
      let hoverPosition: { x: number; y: number } | null = null;
      entry.hoverUiTarget = null;
      entry.hasHoverUiPoint = false;

      let uiRayLength: number | null = null;
      const playbackHudInstance = vrPlaybackHudRef.current;
      const channelsHudInstance = vrChannelsHudRef.current;
      const tracksHudInstance = vrTracksHudRef.current;
      const translationHandleInstance = vrTranslationHandleRef.current;
      const scaleHandleInstance = vrVolumeScaleHandleRef.current;
      const yawHandleInstances = vrVolumeYawHandlesRef.current;
      const pitchHandleInstance = vrVolumePitchHandleRef.current;

      const isActiveTranslate = entry.activeUiTarget?.type === 'volume-translate-handle';
      const isActiveScale = entry.activeUiTarget?.type === 'volume-scale-handle';
      const isActiveYaw = entry.activeUiTarget?.type === 'volume-yaw-handle';
      const isActivePitch = entry.activeUiTarget?.type === 'volume-pitch-handle';
      if (isActiveYaw || isActivePitch) {
        rotationHandleActive = true;
      }

      let handleCandidateTarget: VrUiTarget | null = null;
      let handleCandidatePoint: THREE.Vector3 | null = null;
      let handleCandidateDistance = Infinity;

      const considerHandleCandidate = (candidate: VolumeHandleCandidate) => {
        if (handleCandidateTarget === null || candidate.distance < handleCandidateDistance) {
          handleCandidateTarget = candidate.target;
          handleCandidatePoint = candidate.point;
          handleCandidateDistance = candidate.distance;
        }
      };

      if (translationHandleInstance && translationHandleInstance.visible) {
        translationHandleInstance.getWorldPosition(translationHandleWorldPoint);
        const distance = translationHandleWorldPoint.distanceTo(entry.rayOrigin);
        if (isActiveTranslate || distance <= VR_UI_TOUCH_DISTANCE) {
          considerHandleCandidate({
            target: { type: 'volume-translate-handle', object: translationHandleInstance },
            point: translationHandleWorldPoint.clone(),
            distance,
          });
        }
      }

      if (scaleHandleInstance && scaleHandleInstance.visible) {
        scaleHandleInstance.getWorldPosition(scaleHandleWorldPoint);
        const distance = scaleHandleWorldPoint.distanceTo(entry.rayOrigin);
        if (isActiveScale || distance <= VR_UI_TOUCH_DISTANCE) {
          considerHandleCandidate({
            target: { type: 'volume-scale-handle', object: scaleHandleInstance },
            point: scaleHandleWorldPoint.clone(),
            distance,
          });
        }
      }

      if (yawHandleInstances.length > 0) {
        const activeYawObject = isActiveYaw ? (entry.activeUiTarget?.object as THREE.Object3D | null) : null;
        for (const yawHandle of yawHandleInstances) {
          if (!yawHandle.visible) {
            continue;
          }
          const isActiveHandle = activeYawObject === yawHandle;
          if (!isActiveHandle && activeYawObject) {
            continue;
          }
          yawHandle.getWorldPosition(rotationHandleWorldPoint);
          const distance = rotationHandleWorldPoint.distanceTo(entry.rayOrigin);
          if (distance <= VR_UI_TOUCH_DISTANCE) {
            rotationHandleHovered = true;
          }
          if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
            considerHandleCandidate({
              target: { type: 'volume-yaw-handle', object: yawHandle },
              point: rotationHandleWorldPoint.clone(),
              distance,
            });
          }
        }
      }

      if (pitchHandleInstance && pitchHandleInstance.visible) {
        pitchHandleInstance.getWorldPosition(rotationHandleWorldPoint);
        const distance = rotationHandleWorldPoint.distanceTo(entry.rayOrigin);
        if (distance <= VR_UI_TOUCH_DISTANCE) {
          rotationHandleHovered = true;
        }
        const isActiveHandle = isActivePitch && entry.activeUiTarget?.object === pitchHandleInstance;
        if (isActiveHandle || (!isActivePitch && distance <= VR_UI_TOUCH_DISTANCE)) {
          considerHandleCandidate({
            target: { type: 'volume-pitch-handle', object: pitchHandleInstance },
            point: rotationHandleWorldPoint.clone(),
            distance,
          });
        }
      }

      if (entry.isSelecting && isActiveTranslate) {
        const handle = vrTranslationHandleRef.current;
        const volumeRootGroup = volumeRootGroupRef.current;
        if (handle && volumeRootGroup) {
          const desiredPosition = rotationHandleWorldPoint;
          desiredPosition.copy(entry.rayOrigin);
          if (entry.translateGrabOffset) {
            desiredPosition.add(entry.translateGrabOffset);
          }
          handle.getWorldPosition(translationHandleWorldPoint);
          rotationDirectionTemp.copy(desiredPosition).sub(translationHandleWorldPoint);
          if (rotationDirectionTemp.lengthSq() > 1e-10) {
            volumeRootGroup.position.add(rotationDirectionTemp);
            volumeRootBaseOffsetRef.current.add(rotationDirectionTemp);
            volumeRootGroup.updateMatrixWorld(true);
          }
          handle.getWorldPosition(translationHandleWorldPoint);
          entry.hoverUiPoint.copy(translationHandleWorldPoint);
          entry.hasHoverUiPoint = true;
          const distance = entry.rayOrigin.distanceTo(translationHandleWorldPoint);
          rayLength = Math.min(rayLength, Math.max(0.12, Math.min(distance, 8)));
          const candidateTarget = handleCandidateTarget as VrUiTarget | null;
          if (candidateTarget && candidateTarget.type === 'volume-translate-handle') {
            handleCandidatePoint = translationHandleWorldPoint.clone();
            handleCandidateDistance = distance;
          }
        }
      }

      if (entry.isSelecting && isActiveScale) {
        const handle = vrVolumeScaleHandleRef.current;
        const volumeRootGroup = volumeRootGroupRef.current;
        const scaleState = entry.volumeScaleState;
        if (!handle || !volumeRootGroup || !scaleState) {
          entry.volumeScaleState = null;
        } else {
          const desiredPosition = scaleTargetWorldPoint;
          desiredPosition.copy(entry.rayOrigin);
          if (entry.scaleGrabOffset) {
            desiredPosition.add(entry.scaleGrabOffset);
          }
          rotationCenterWorldPoint.copy(volumeRootCenterUnscaledRef.current);
          volumeRootGroup.localToWorld(rotationCenterWorldPoint);
          scaleDirectionTemp.copy(desiredPosition).sub(rotationCenterWorldPoint);
          const projection = scaleDirectionTemp.dot(scaleState.direction);
          const minLength = scaleState.baseLength * VR_VOLUME_MIN_SCALE;
          const maxLength = scaleState.baseLength * VR_VOLUME_MAX_SCALE;
          const clampedLength = Math.min(Math.max(projection, minLength), maxLength);
          const safeBaseLength = Math.max(scaleState.baseLength, 1e-6);
          const unclampedScale = clampedLength / safeBaseLength;
          const nextUserScale = Math.min(
            VR_VOLUME_MAX_SCALE,
            Math.max(VR_VOLUME_MIN_SCALE, unclampedScale),
          );
          volumeUserScaleRef.current = nextUserScale;
          const baseScale = volumeNormalizationScaleRef.current;
          volumeRootGroup.scale.setScalar(baseScale * nextUserScale);
          applyVolumeYawPitch(volumeYawRef.current, volumePitchRef.current);
          handle.getWorldPosition(scaleHandleWorldPoint);
          entry.hoverUiPoint.copy(scaleHandleWorldPoint);
          entry.hasHoverUiPoint = true;
          const distance = entry.rayOrigin.distanceTo(scaleHandleWorldPoint);
          rayLength = Math.min(rayLength, Math.max(0.12, Math.min(distance, 8)));
          const scaleTarget = handleCandidateTarget as VrUiTarget | null;
          if (scaleTarget && scaleTarget.type === 'volume-scale-handle') {
            handleCandidatePoint = scaleHandleWorldPoint.clone();
            handleCandidateDistance = distance;
          }
        }
      }

      if (entry.isSelecting && (isActiveYaw || isActivePitch)) {
        const volumeRootGroup = volumeRootGroupRef.current;
        const rotationState = entry.volumeRotationState;
        if (!volumeRootGroup || !rotationState) {
          entry.volumeRotationState = null;
        } else {
          rotationCenterWorldPoint.copy(volumeRootCenterUnscaledRef.current);
          volumeRootGroup.localToWorld(rotationCenterWorldPoint);
          rotationDirectionTemp.copy(entry.rayOrigin).sub(rotationCenterWorldPoint);
          const tau = Math.PI * 2;
          if (rotationState.mode === 'yaw') {
            rotationDirectionTemp.y = 0;
            if (rotationDirectionTemp.lengthSq() > 1e-8) {
              const currentAngle = computeYawAngleForBasis(
                rotationDirectionTemp,
                rotationState.basisForward,
                rotationState.basisRight,
              );
              let delta = currentAngle - rotationState.initialAngle;
              if (delta > Math.PI) {
                delta -= tau;
              } else if (delta < -Math.PI) {
                delta += tau;
              }
              const nextYaw = rotationState.initialYaw - delta;
              applyVolumeYawPitch(nextYaw, volumePitchRef.current);
            }
          } else if (rotationState.mode === 'pitch') {
            rotationDirectionTemp.x = 0;
            if (rotationDirectionTemp.lengthSq() > 1e-8) {
              const forwardComponent = rotationDirectionTemp.dot(rotationState.basisForward);
              const currentAngle = Math.atan2(rotationDirectionTemp.y, forwardComponent);
              let delta = currentAngle - rotationState.initialAngle;
              if (delta > Math.PI) {
                delta -= tau;
              } else if (delta < -Math.PI) {
                delta += tau;
              }
              const pitchLimit = Math.PI / 2 - 0.05;
              const nextPitch = Math.max(
                -pitchLimit,
                Math.min(pitchLimit, rotationState.initialPitch + delta),
              );
              applyVolumeYawPitch(volumeYawRef.current, nextPitch);
            }
          }
          const activeHandle = entry.activeUiTarget?.object as THREE.Object3D | null;
          if (activeHandle) {
            activeHandle.getWorldPosition(rotationHandleWorldPoint);
            entry.hoverUiPoint.copy(rotationHandleWorldPoint);
            entry.hasHoverUiPoint = true;
            const distance = entry.rayOrigin.distanceTo(rotationHandleWorldPoint);
            rayLength = Math.min(rayLength, Math.max(0.12, Math.min(distance, 8)));
            const rotationTarget = handleCandidateTarget as VrUiTarget | null;
            if (
              rotationTarget &&
              (rotationTarget.type === 'volume-yaw-handle' ||
                rotationTarget.type === 'volume-pitch-handle')
            ) {
              handleCandidatePoint = rotationHandleWorldPoint.clone();
              handleCandidateDistance = distance;
            }
          }
        }
      }

      if (handleCandidateTarget && handleCandidatePoint) {
        const target = handleCandidateTarget as VrUiTarget;
        entry.hoverUiTarget = target;
        entry.hasHoverUiPoint = true;
        entry.hoverUiPoint.copy(handleCandidatePoint);
        const candidateDistance = Math.max(0.12, Math.min(handleCandidateDistance, 8));
        rayLength = Math.min(rayLength, candidateDistance);
        hoverTrackId = null;
        if (target.type === 'volume-yaw-handle' || target.type === 'volume-pitch-handle') {
          rotationHandleHovered = true;
        }
        nextChannelsHoverRegion = null;
      } else {
        type PlaybackCandidate = {
          category: 'playback';
          target: VrUiTarget;
          point: THREE.Vector3;
          distance: number;
          region: null;
        };
        type ChannelsCandidate = {
          category: 'channels';
          target: VrUiTarget;
          point: THREE.Vector3;
          distance: number;
          region: VrChannelsInteractiveRegion | null;
        };
        type TracksCandidate = {
          category: 'tracks';
          target: VrUiTarget;
          point: THREE.Vector3;
          distance: number;
          region: VrTracksInteractiveRegion | null;
        };
        type AnyCandidate = PlaybackCandidate | ChannelsCandidate | TracksCandidate;

        let playbackCandidate: PlaybackCandidate | null = null;
        let channelsCandidate: ChannelsCandidate | null = null;
        let tracksCandidate: TracksCandidate | null = null;

        const considerPlaybackCandidate = (
          candidate: PlaybackCandidate,
          rayDistance: number,
        ) => {
          const clampedDistance = Math.max(0.12, Math.min(rayDistance, 8));
          const shouldReplace = !playbackCandidate || candidate.distance < playbackCandidate.distance;
          if (shouldReplace) {
            playbackCandidate = candidate;
            uiRayLength =
              uiRayLength === null ? clampedDistance : Math.min(uiRayLength, clampedDistance);
          }
          return shouldReplace;
        };

        const considerChannelsCandidate = (
          candidate: ChannelsCandidate,
          rayDistance: number,
        ) => {
          const clampedDistance = Math.max(0.12, Math.min(rayDistance, 8));
          const shouldReplace = !channelsCandidate || candidate.distance < channelsCandidate.distance;
          if (shouldReplace) {
            channelsCandidate = candidate;
            uiRayLength =
              uiRayLength === null ? clampedDistance : Math.min(uiRayLength, clampedDistance);
          }
          return shouldReplace;
        };

        const considerTracksCandidate = (
          candidate: TracksCandidate,
          rayDistance: number,
        ) => {
          const clampedDistance = Math.max(0.12, Math.min(rayDistance, 8));
          const shouldReplace = !tracksCandidate || candidate.distance < tracksCandidate.distance;
          if (shouldReplace) {
            tracksCandidate = candidate;
            uiRayLength =
              uiRayLength === null ? clampedDistance : Math.min(uiRayLength, clampedDistance);
          }
          return shouldReplace;
        };

        if (playbackHudInstance && playbackHudInstance.group.visible) {
          const plane = vrHudPlaneRef.current;
          const planePoint = vrHudPlanePointRef.current;
          playbackHudInstance.panel.getWorldPosition(planePoint);
          const planeNormal = vrHudForwardRef.current;
          planeNormal.set(0, 0, 1).applyQuaternion(playbackHudInstance.group.quaternion).normalize();
          plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
          const activeType = entry.activeUiTarget?.type ?? null;
          const activePlayback = activeType ? activeType.startsWith('playback-') : false;
          const playbackSliderActive = activeType === 'playback-slider';
          const fpsSliderActive = activeType === 'playback-fps-slider';
          const playbackSliderLocked = playbackSliderActive && entry.isSelecting;
          const fpsSliderLocked = fpsSliderActive && entry.isSelecting;
          const translateHandle = playbackHudInstance.panelTranslateHandle;
          const yawHandles = playbackHudInstance.panelYawHandles;
          const pitchHandle = playbackHudInstance.panelPitchHandle;
          const handleWorldPoint = vrHandleWorldPointRef.current;
          const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

          if (translateHandle && !playbackSliderLocked && !fpsSliderLocked) {
            translateHandle.getWorldPosition(handleWorldPoint);
            const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
            if (activeType === 'playback-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
              considerPlaybackCandidate(
                {
                  category: 'playback',
                  target: { type: 'playback-panel-grab', object: translateHandle },
                  point: handleWorldPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
            }
          }

          if (yawHandles.length > 0 && !playbackSliderLocked && !fpsSliderLocked) {
            const activeYawObject =
              activeType === 'playback-panel-yaw'
                ? (entry.activeUiTarget?.object as THREE.Object3D | null)
                : null;
            for (const yawHandle of yawHandles) {
              const isActiveHandle = activeYawObject === yawHandle;
              if (!isActiveHandle && activeYawObject && activeType === 'playback-panel-yaw') {
                continue;
              }
              yawHandle.getWorldPosition(handleSecondaryPoint);
              const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
              if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
                considerPlaybackCandidate(
                  {
                    category: 'playback',
                    target: { type: 'playback-panel-yaw', object: yawHandle },
                    point: handleSecondaryPoint.clone(),
                    distance,
                    region: null,
                  },
                  distance,
                );
              }
            }
          }

          if (pitchHandle && !playbackSliderLocked && !fpsSliderLocked) {
            pitchHandle.getWorldPosition(handleSecondaryPoint);
            const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
            if (
              (activeType === 'playback-panel-pitch' && entry.activeUiTarget?.object === pitchHandle) ||
              (activeType !== 'playback-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)
            ) {
              considerPlaybackCandidate(
                {
                  category: 'playback',
                  target: { type: 'playback-panel-pitch', object: pitchHandle },
                  point: handleSecondaryPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
            }
          }

          const denominator = planeNormal.dot(entry.rayDirection);
          if (Math.abs(denominator) > 1e-5) {
            const signedDistance = plane.distanceToPoint(entry.rayOrigin);
            const distanceAlongRay = -signedDistance / denominator;
            if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
              playbackTouchPoint
                .copy(entry.rayDirection)
                .multiplyScalar(distanceAlongRay)
                .add(entry.rayOrigin);
              playbackPlaneNormal.copy(planeNormal);
              playbackLocalPoint.copy(playbackTouchPoint);
              playbackHudInstance.group.worldToLocal(playbackLocalPoint);
              const surfaceMargin = activePlayback
                ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                : VR_UI_TOUCH_SURFACE_MARGIN;
              const halfWidth = VR_PLAYBACK_PANEL_WIDTH / 2 + surfaceMargin;
              const halfHeight = VR_PLAYBACK_PANEL_HEIGHT / 2 + surfaceMargin;
              if (
                playbackLocalPoint.x >= -halfWidth &&
                playbackLocalPoint.x <= halfWidth &&
                playbackLocalPoint.y >= -halfHeight &&
                playbackLocalPoint.y <= halfHeight
              ) {
                const rawDistance = distanceAlongRay;
                const playbackSliderActive = activeType === 'playback-slider';
                const fpsSliderActive = activeType === 'playback-fps-slider';
                const playbackSliderLocked = playbackSliderActive && entry.isSelecting;
                const fpsSliderLocked = fpsSliderActive && entry.isSelecting;
                const playbackSliderMargin = playbackSliderActive
                  ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                  : VR_UI_TOUCH_SURFACE_MARGIN;
                const fpsSliderMargin = fpsSliderActive
                  ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                  : VR_UI_TOUCH_SURFACE_MARGIN;
                const playbackSliderHalfWidth =
                  (playbackHudInstance.playbackSliderWidth + 0.04) / 2 + playbackSliderMargin;
                const playbackSliderHalfHeight = 0.08 / 2 + playbackSliderMargin;
                const playbackSliderLocalX =
                  playbackLocalPoint.x - playbackHudInstance.playbackSliderGroup.position.x;
                const playbackSliderLocalY =
                  playbackLocalPoint.y - playbackHudInstance.playbackSliderGroup.position.y;
                const inPlaybackSliderArea =
                  playbackSliderLocalX >= -playbackSliderHalfWidth &&
                  playbackSliderLocalX <= playbackSliderHalfWidth &&
                  playbackSliderLocalY >= -playbackSliderHalfHeight &&
                  playbackSliderLocalY <= playbackSliderHalfHeight;

                const fpsSliderHalfWidth =
                  (playbackHudInstance.fpsSliderWidth + 0.04) / 2 + fpsSliderMargin;
                const fpsSliderHalfHeight = 0.08 / 2 + fpsSliderMargin;
                const fpsSliderLocalX = playbackLocalPoint.x - playbackHudInstance.fpsSliderGroup.position.x;
                const fpsSliderLocalY = playbackLocalPoint.y - playbackHudInstance.fpsSliderGroup.position.y;
                const inFpsSliderArea =
                  fpsSliderLocalX >= -fpsSliderHalfWidth &&
                  fpsSliderLocalX <= fpsSliderHalfWidth &&
                  fpsSliderLocalY >= -fpsSliderHalfHeight &&
                  fpsSliderLocalY <= fpsSliderHalfHeight;
                const fpsSliderEnabled = playbackStateRef.current.totalTimepoints > 1;

                const playCenter = playbackHudInstance.playButton.position;
                const playRadius = 0.045 + surfaceMargin;
                const playDeltaX = playbackLocalPoint.x - playCenter.x;
                const playDeltaY = playbackLocalPoint.y - playCenter.y;
                const inPlayButton =
                  playDeltaX * playDeltaX + playDeltaY * playDeltaY <= playRadius * playRadius;

                const resetVolumeCenter = playbackHudInstance.resetVolumeButton.position;
                const resetVolumeRadius = playbackHudInstance.resetVolumeButtonRadius + surfaceMargin;
                const resetVolumeDeltaX = playbackLocalPoint.x - resetVolumeCenter.x;
                const resetVolumeDeltaY = playbackLocalPoint.y - resetVolumeCenter.y;
                const inResetVolumeButton =
                  resetVolumeDeltaX * resetVolumeDeltaX +
                    resetVolumeDeltaY * resetVolumeDeltaY <=
                  resetVolumeRadius * resetVolumeRadius;

                const resetHudCenter = playbackHudInstance.resetHudButton.position;
                const resetHudRadius = playbackHudInstance.resetHudButtonRadius + surfaceMargin;
                const resetHudDeltaX = playbackLocalPoint.x - resetHudCenter.x;
                const resetHudDeltaY = playbackLocalPoint.y - resetHudCenter.y;
                const inResetHudButton =
                  resetHudDeltaX * resetHudDeltaX + resetHudDeltaY * resetHudDeltaY <=
                  resetHudRadius * resetHudRadius;

                const exitCenter = playbackHudInstance.exitButton.position;
                const exitRadius = playbackHudInstance.exitButtonRadius + surfaceMargin;
                const exitDeltaX = playbackLocalPoint.x - exitCenter.x;
                const exitDeltaY = playbackLocalPoint.y - exitCenter.y;
                const inExitButton =
                  exitDeltaX * exitDeltaX + exitDeltaY * exitDeltaY <= exitRadius * exitRadius;

                const modeCenter = playbackHudInstance.modeButton.position;
                const modeRadius = playbackHudInstance.modeButtonRadius + surfaceMargin;
                const modeDeltaX = playbackLocalPoint.x - modeCenter.x;
                const modeDeltaY = playbackLocalPoint.y - modeCenter.y;
                const inModeButton =
                  playbackHudInstance.modeButton.visible &&
                  modeDeltaX * modeDeltaX + modeDeltaY * modeDeltaY <= modeRadius * modeRadius;

                if (!playbackSliderLocked && !fpsSliderLocked && inResetVolumeButton) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-reset-volume', object: playbackHudInstance.resetVolumeButton },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                } else if (!playbackSliderLocked && !fpsSliderLocked && inResetHudButton) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-reset-hud', object: playbackHudInstance.resetHudButton },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                } else if (!playbackSliderLocked && !fpsSliderLocked && inExitButton) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-exit-vr', object: playbackHudInstance.exitButton },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                } else if (!playbackSliderLocked && !fpsSliderLocked && inModeButton) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-toggle-mode', object: playbackHudInstance.modeButton },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                } else if (!playbackSliderLocked && !fpsSliderLocked && inPlayButton) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-play-toggle', object: playbackHudInstance.playButton },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                }

                if (playbackSliderLocked || inPlaybackSliderArea) {
                  const sliderDepth =
                    playbackHudInstance.playbackSliderGroup.position.z +
                    playbackHudInstance.playbackSliderHitArea.position.z;
                  playbackSliderPoint
                    .copy(playbackTouchPoint)
                    .addScaledVector(playbackPlaneNormal, sliderDepth);
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: {
                        type: 'playback-slider',
                        object: playbackHudInstance.playbackSliderHitArea,
                      },
                      point: playbackSliderPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                  if (playbackSliderActive && !playbackStateRef.current.playbackDisabled) {
                    applyPlaybackSliderFromWorldPointRef.current?.(playbackSliderPoint);
                  }
                }

                if (fpsSliderEnabled && (fpsSliderLocked || inFpsSliderArea)) {
                  const fpsDepth =
                    playbackHudInstance.fpsSliderGroup.position.z +
                    playbackHudInstance.fpsSliderHitArea.position.z;
                  fpsSliderPoint
                    .copy(playbackTouchPoint)
                    .addScaledVector(playbackPlaneNormal, fpsDepth);
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-fps-slider', object: playbackHudInstance.fpsSliderHitArea },
                      point: fpsSliderPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                  if (fpsSliderActive) {
                    applyFpsSliderFromWorldPointRef.current?.(fpsSliderPoint);
                  }
                }

                if (!playbackSliderLocked) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-panel', object: playbackHudInstance.panel },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                }
              }
            }
          }
        }

        if (channelsHudInstance && channelsHudInstance.group.visible) {
          nextChannelsHoverRegion = null;
          const plane = vrHudPlaneRef.current;
          const planePoint = vrHudPlanePointRef.current;
          channelsHudInstance.panel.getWorldPosition(planePoint);
          const planeNormal = vrHudForwardRef.current;
          planeNormal.set(0, 0, 1).applyQuaternion(channelsHudInstance.group.quaternion).normalize();
          plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
          const activeType = entry.activeUiTarget?.type ?? null;
          const activeChannels = activeType ? activeType.startsWith('channels-') : false;
          const channelsSliderActive = activeType === 'channels-slider';
          const activeChannelsSliderRegion =
            channelsSliderActive &&
            entry.isSelecting &&
            entry.activeUiTarget?.data &&
            !(entry.activeUiTarget.data as VrChannelsInteractiveRegion).disabled
              ? (entry.activeUiTarget.data as VrChannelsInteractiveRegion)
              : null;
          const channelsSliderLocked = Boolean(activeChannelsSliderRegion);
          const translateHandle = channelsHudInstance.panelTranslateHandle;
          const yawHandles = channelsHudInstance.panelYawHandles;
          const pitchHandle = channelsHudInstance.panelPitchHandle;
          const handleWorldPoint = vrHandleWorldPointRef.current;
          const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

          if (translateHandle && !channelsSliderLocked) {
            translateHandle.getWorldPosition(handleWorldPoint);
            const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
            if (activeType === 'channels-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
              const replaced = considerChannelsCandidate(
                {
                  category: 'channels',
                  target: { type: 'channels-panel-grab', object: translateHandle },
                  point: handleWorldPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
              if (replaced) {
                nextChannelsHoverRegion = null;
              }
            }
          }

          if (yawHandles.length > 0 && !channelsSliderLocked) {
            const activeYawObject =
              activeType === 'channels-panel-yaw'
                ? (entry.activeUiTarget?.object as THREE.Object3D | null)
                : null;
            for (const yawHandle of yawHandles) {
              const isActiveHandle = activeYawObject === yawHandle;
              if (!isActiveHandle && activeYawObject && activeType === 'channels-panel-yaw') {
                continue;
              }
              yawHandle.getWorldPosition(handleSecondaryPoint);
              const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
              if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
                const replaced = considerChannelsCandidate(
                  {
                    category: 'channels',
                    target: { type: 'channels-panel-yaw', object: yawHandle },
                    point: handleSecondaryPoint.clone(),
                    distance,
                    region: null,
                  },
                  distance,
                );
                if (replaced) {
                  nextChannelsHoverRegion = null;
                }
              }
            }
          }

          if (pitchHandle && !channelsSliderLocked) {
            pitchHandle.getWorldPosition(handleSecondaryPoint);
            const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
            const isActivePitch =
              activeType === 'channels-panel-pitch' && entry.activeUiTarget?.object === pitchHandle;
            if (isActivePitch || (activeType !== 'channels-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)) {
              const replaced = considerChannelsCandidate(
                {
                  category: 'channels',
                  target: { type: 'channels-panel-pitch', object: pitchHandle },
                  point: handleSecondaryPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
              if (replaced) {
                nextChannelsHoverRegion = null;
              }
            }
          }

          const denominator = planeNormal.dot(entry.rayDirection);
          if (Math.abs(denominator) > 1e-5) {
            const signedDistance = plane.distanceToPoint(entry.rayOrigin);
            const distanceAlongRay = -signedDistance / denominator;
            if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
              channelsTouchPoint
                .copy(entry.rayDirection)
                .multiplyScalar(distanceAlongRay)
                .add(entry.rayOrigin);
              vrChannelsLocalPointRef.current.copy(channelsTouchPoint);
              channelsHudInstance.group.worldToLocal(vrChannelsLocalPointRef.current);
              const surfaceMargin = activeChannels
                ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                : VR_UI_TOUCH_SURFACE_MARGIN;
              const halfWidth = channelsHudInstance.width / 2 + surfaceMargin;
              const halfHeight = channelsHudInstance.height / 2 + surfaceMargin;
              if (
                vrChannelsLocalPointRef.current.x >= -halfWidth &&
                vrChannelsLocalPointRef.current.x <= halfWidth &&
                vrChannelsLocalPointRef.current.y >= -halfHeight &&
                vrChannelsLocalPointRef.current.y <= halfHeight
              ) {
                const rawDistance = distanceAlongRay;
                let region = resolveChannelsRegionFromPoint(channelsHudInstance, channelsTouchPoint);
                if (region?.disabled) {
                  region = null;
                }
                const isActiveSliderRegion =
                  region &&
                  activeChannelsSliderRegion &&
                  region.targetType === 'channels-slider' &&
                  region === activeChannelsSliderRegion;
                if (region && (!channelsSliderLocked || isActiveSliderRegion)) {
                  const replaced = considerChannelsCandidate(
                    {
                      category: 'channels',
                      target: { type: region.targetType, object: channelsHudInstance.panel, data: region },
                      point: channelsTouchPoint.clone(),
                      distance: rawDistance,
                      region,
                    },
                    rawDistance,
                  );
                  if (replaced) {
                    nextChannelsHoverRegion = region;
                  }
                  if (channelsSliderActive && region.targetType === 'channels-slider' && isActiveSliderRegion) {
                    applyVrChannelsSliderFromPointRef.current?.(region, channelsTouchPoint);
                  }
                }

                if (channelsSliderLocked && activeChannelsSliderRegion) {
                  const replaced = considerChannelsCandidate(
                    {
                      category: 'channels',
                      target: {
                        type: 'channels-slider',
                        object: channelsHudInstance.panel,
                        data: activeChannelsSliderRegion,
                      },
                      point: channelsTouchPoint.clone(),
                      distance: rawDistance,
                      region: activeChannelsSliderRegion,
                    },
                    rawDistance,
                  );
                  if (replaced) {
                    nextChannelsHoverRegion = activeChannelsSliderRegion;
                  }
                  applyVrChannelsSliderFromPointRef.current?.(activeChannelsSliderRegion, channelsTouchPoint);
                }

                if (!channelsSliderLocked) {
                  const replacedPanel = considerChannelsCandidate(
                    {
                      category: 'channels',
                      target: { type: 'channels-panel', object: channelsHudInstance.panel },
                      point: channelsTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                  if (replacedPanel) {
                    nextChannelsHoverRegion = null;
                  }
                }
              }
            }
          }
        }

        if (tracksHudInstance && tracksHudInstance.group.visible) {
          nextTracksHoverRegion = null;
          const plane = vrHudPlaneRef.current;
          const planePoint = vrHudPlanePointRef.current;
          tracksHudInstance.panel.getWorldPosition(planePoint);
          const planeNormal = vrHudForwardRef.current;
          planeNormal.set(0, 0, 1).applyQuaternion(tracksHudInstance.group.quaternion).normalize();
          plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
          const activeType = entry.activeUiTarget?.type ?? null;
          const activeTracks = activeType ? activeType.startsWith('tracks-') : false;
          const tracksSliderActive = activeType === 'tracks-slider';
          const activeTracksSliderRegion =
            tracksSliderActive &&
            entry.isSelecting &&
            entry.activeUiTarget?.data &&
            !(entry.activeUiTarget.data as VrTracksInteractiveRegion).disabled
              ? (entry.activeUiTarget.data as VrTracksInteractiveRegion)
              : null;
          const tracksSliderLocked = Boolean(activeTracksSliderRegion);
          const translateHandle = tracksHudInstance.panelTranslateHandle;
          const yawHandles = tracksHudInstance.panelYawHandles;
          const pitchHandle = tracksHudInstance.panelPitchHandle;
          const handleWorldPoint = vrHandleWorldPointRef.current;
          const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

          if (translateHandle && !tracksSliderLocked) {
            translateHandle.getWorldPosition(handleWorldPoint);
            const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
            if (activeType === 'tracks-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
              const replaced = considerTracksCandidate(
                {
                  category: 'tracks',
                  target: { type: 'tracks-panel-grab', object: translateHandle },
                  point: handleWorldPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
              if (replaced) {
                nextTracksHoverRegion = null;
              }
            }
          }

          if (yawHandles.length > 0 && !tracksSliderLocked) {
            const activeYawObject =
              activeType === 'tracks-panel-yaw'
                ? (entry.activeUiTarget?.object as THREE.Object3D | null)
                : null;
            for (const yawHandle of yawHandles) {
              const isActiveHandle = activeYawObject === yawHandle;
              if (!isActiveHandle && activeYawObject && activeType === 'tracks-panel-yaw') {
                continue;
              }
              yawHandle.getWorldPosition(handleSecondaryPoint);
              const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
              if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
                const replaced = considerTracksCandidate(
                  {
                    category: 'tracks',
                    target: { type: 'tracks-panel-yaw', object: yawHandle },
                    point: handleSecondaryPoint.clone(),
                    distance,
                    region: null,
                  },
                  distance,
                );
                if (replaced) {
                  nextTracksHoverRegion = null;
                }
              }
            }
          }

          if (pitchHandle && !tracksSliderLocked) {
            pitchHandle.getWorldPosition(handleSecondaryPoint);
            const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
            const isActivePitch =
              activeType === 'tracks-panel-pitch' && entry.activeUiTarget?.object === pitchHandle;
            if (isActivePitch || (activeType !== 'tracks-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)) {
              const replaced = considerTracksCandidate(
                {
                  category: 'tracks',
                  target: { type: 'tracks-panel-pitch', object: pitchHandle },
                  point: handleSecondaryPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
              if (replaced) {
                nextTracksHoverRegion = null;
              }
            }
          }

          const denominator = planeNormal.dot(entry.rayDirection);
          if (Math.abs(denominator) > 1e-5) {
            const signedDistance = plane.distanceToPoint(entry.rayOrigin);
            const distanceAlongRay = -signedDistance / denominator;
            if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
              tracksTouchPoint
                .copy(entry.rayDirection)
                .multiplyScalar(distanceAlongRay)
                .add(entry.rayOrigin);
              vrTracksLocalPointRef.current.copy(tracksTouchPoint);
              tracksHudInstance.group.worldToLocal(vrTracksLocalPointRef.current);
              const surfaceMargin = activeTracks
                ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                : VR_UI_TOUCH_SURFACE_MARGIN;
              const halfWidth = tracksHudInstance.width / 2 + surfaceMargin;
              const halfHeight = tracksHudInstance.height / 2 + surfaceMargin;
              if (
                vrTracksLocalPointRef.current.x >= -halfWidth &&
                vrTracksLocalPointRef.current.x <= halfWidth &&
                vrTracksLocalPointRef.current.y >= -halfHeight &&
                vrTracksLocalPointRef.current.y <= halfHeight
              ) {
                const rawDistance = distanceAlongRay;
                const region = resolveTracksRegionFromPoint(tracksHudInstance, tracksTouchPoint);
                const isActiveSliderRegion =
                  region &&
                  activeTracksSliderRegion &&
                  region.targetType === 'tracks-slider' &&
                  region === activeTracksSliderRegion;
                if (region && (!tracksSliderLocked || isActiveSliderRegion)) {
                  const replaced = considerTracksCandidate(
                    {
                      category: 'tracks',
                      target: { type: region.targetType, object: tracksHudInstance.panel, data: region },
                      point: tracksTouchPoint.clone(),
                      distance: rawDistance,
                      region,
                    },
                    rawDistance,
                  );
                  if (replaced) {
                    nextTracksHoverRegion = region;
                  }
                  if (entry.isSelecting && entry.activeUiTarget) {
                    if (
                      entry.activeUiTarget.type === 'tracks-slider' &&
                      region.targetType === 'tracks-slider' &&
                      isActiveSliderRegion
                    ) {
                      applyVrTracksSliderFromPointRef.current?.(region, tracksTouchPoint);
                    } else if (
                      entry.activeUiTarget.type === 'tracks-scroll' &&
                      region.targetType === 'tracks-scroll'
                    ) {
                      applyVrTracksScrollFromPointRef.current?.(region, tracksTouchPoint);
                    }
                  }
                }

                if (tracksSliderLocked && activeTracksSliderRegion) {
                  const replaced = considerTracksCandidate(
                    {
                      category: 'tracks',
                      target: {
                        type: 'tracks-slider',
                        object: tracksHudInstance.panel,
                        data: activeTracksSliderRegion,
                      },
                      point: tracksTouchPoint.clone(),
                      distance: rawDistance,
                      region: activeTracksSliderRegion,
                    },
                    rawDistance,
                  );
                  if (replaced) {
                    nextTracksHoverRegion = activeTracksSliderRegion;
                  }
                  applyVrTracksSliderFromPointRef.current?.(activeTracksSliderRegion, tracksTouchPoint);
                } else if (
                  entry.isSelecting &&
                  entry.activeUiTarget?.type === 'tracks-scroll' &&
                  entry.activeUiTarget.data &&
                  !(entry.activeUiTarget.data as VrTracksInteractiveRegion).disabled
                ) {
                  const activeRegion = entry.activeUiTarget.data as VrTracksInteractiveRegion;
                  const replaced = considerTracksCandidate(
                    {
                      category: 'tracks',
                      target: {
                        type: 'tracks-scroll',
                        object: tracksHudInstance.panel,
                        data: activeRegion,
                      },
                      point: tracksTouchPoint.clone(),
                      distance: rawDistance,
                      region: activeRegion,
                    },
                    rawDistance,
                  );
                  if (replaced) {
                    nextTracksHoverRegion = activeRegion;
                  }
                  applyVrTracksScrollFromPointRef.current?.(activeRegion, tracksTouchPoint);
                }

                if (!tracksSliderLocked) {
                  const replacedPanel = considerTracksCandidate(
                    {
                      category: 'tracks',
                      target: { type: 'tracks-panel', object: tracksHudInstance.panel },
                      point: tracksTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                  if (replacedPanel) {
                    nextTracksHoverRegion = null;
                  }
                }
              }
            }
          }
        }

        let chosenCandidate: AnyCandidate | null = null;
        const candidateList: AnyCandidate[] = [];
        if (playbackCandidate) {
          candidateList.push(playbackCandidate);
        }
        if (channelsCandidate) {
          candidateList.push(channelsCandidate);
        }
        if (tracksCandidate) {
          candidateList.push(tracksCandidate);
        }
        if (candidateList.length > 0) {
          chosenCandidate = candidateList.reduce(
            (best, current) => (current.distance < best.distance ? current : best),
            candidateList[0],
          );
        }

        if (chosenCandidate) {
          entry.hoverUiTarget = chosenCandidate.target;
          entry.hasHoverUiPoint = true;
          entry.hoverUiPoint.copy(chosenCandidate.point);
          const candidateDistance = Math.max(0.12, Math.min(chosenCandidate.distance, 8));
          uiRayLength =
            uiRayLength === null ? candidateDistance : Math.min(uiRayLength, candidateDistance);
          if (
            chosenCandidate.category === 'channels' &&
            chosenCandidate.region
          ) {
            nextChannelsHoverRegion = chosenCandidate.region;
          } else if (
            chosenCandidate.category === 'tracks' &&
            chosenCandidate.region
          ) {
            nextTracksHoverRegion = chosenCandidate.region;
          }
        }
      }

      const uiType = entry.hoverUiTarget ? entry.hoverUiTarget.type : null;
      if (uiType === 'playback-play-toggle') {
        playHoveredAny = true;
        hoverTrackId = null;
      } else if (uiType === 'playback-slider') {
        playbackSliderHoveredAny = true;
      } else if (uiType === 'playback-fps-slider') {
        fpsSliderHoveredAny = true;
      } else if (
        uiType === 'playback-panel-grab' ||
        uiType === 'playback-panel' ||
        uiType === 'playback-panel-yaw' ||
        uiType === 'playback-panel-pitch'
      ) {
        hoverTrackId = null;
      } else if (uiType === 'playback-reset-volume') {
        resetVolumeHoveredAny = true;
        hoverTrackId = null;
      } else if (uiType === 'playback-reset-hud') {
        resetHudHoveredAny = true;
        hoverTrackId = null;
      } else if (uiType === 'playback-exit-vr') {
        exitHoveredAny = true;
        hoverTrackId = null;
      } else if (uiType === 'playback-toggle-mode') {
        modeHoveredAny = true;
        hoverTrackId = null;
      } else if (
        uiType === 'volume-translate-handle' ||
        uiType === 'volume-scale-handle' ||
        uiType === 'volume-yaw-handle' ||
        uiType === 'volume-pitch-handle'
      ) {
        hoverTrackId = null;
      } else if (uiType && uiType.startsWith('tracks-')) {
        hoverTrackId = null;
      }
      if (entry.activeUiTarget?.type === 'playback-slider') {
        playbackSliderActiveAny = true;
        hoverTrackId = null;
      } else if (entry.activeUiTarget?.type === 'playback-fps-slider') {
        fpsSliderActiveAny = true;
        hoverTrackId = null;
      } else if (entry.activeUiTarget?.type === 'playback-reset-volume') {
        resetVolumeHoveredAny = true;
        hoverTrackId = null;
      } else if (entry.activeUiTarget?.type === 'playback-reset-hud') {
        resetHudHoveredAny = true;
        hoverTrackId = null;
      } else if (entry.activeUiTarget?.type === 'playback-exit-vr') {
        exitHoveredAny = true;
        hoverTrackId = null;
      } else if (entry.activeUiTarget?.type === 'playback-toggle-mode') {
        modeHoveredAny = true;
        hoverTrackId = null;
      }
      if (
        entry.activeUiTarget?.type === 'playback-panel-grab' ||
        entry.activeUiTarget?.type === 'playback-panel-yaw' ||
        entry.activeUiTarget?.type === 'playback-panel-pitch' ||
        entry.activeUiTarget?.type === 'channels-panel-grab' ||
        entry.activeUiTarget?.type === 'channels-panel-yaw' ||
        entry.activeUiTarget?.type === 'channels-panel-pitch' ||
        entry.activeUiTarget?.type === 'tracks-panel-grab' ||
        entry.activeUiTarget?.type === 'tracks-panel-yaw' ||
        entry.activeUiTarget?.type === 'tracks-panel-pitch'
      ) {
        hoverTrackId = null;
      }

      if (uiRayLength !== null && Number.isFinite(uiRayLength)) {
        rayLength = Math.min(rayLength, uiRayLength);
      }

      if (
        entry.isSelecting &&
        entry.activeUiTarget?.type === 'playback-panel-grab' &&
        playbackHudInstance &&
        entry.hasHoverUiPoint
      ) {
        const newPosition = vrPlaybackHudDragTargetRef.current;
        newPosition.copy(entry.rayOrigin);
        if (entry.hudGrabOffsets.playback) {
          newPosition.add(entry.hudGrabOffsets.playback);
        }
        setVrPlaybackHudPlacementPosition(newPosition);
      }

      if (
        entry.isSelecting &&
        entry.activeUiTarget?.type === 'channels-panel-grab' &&
        channelsHudInstance &&
        entry.hasHoverUiPoint
      ) {
        const newPosition = vrChannelsHudDragTargetRef.current;
        newPosition.copy(entry.rayOrigin);
        if (entry.hudGrabOffsets.channels) {
          newPosition.add(entry.hudGrabOffsets.channels);
        }
        setVrChannelsHudPlacementPosition(newPosition);
      }

      if (
        entry.isSelecting &&
        entry.activeUiTarget?.type === 'tracks-panel-grab' &&
        tracksHudInstance &&
        entry.hasHoverUiPoint
      ) {
        const newPosition = vrTracksHudDragTargetRef.current;
        newPosition.copy(entry.rayOrigin);
        if (entry.hudGrabOffsets.tracks) {
          newPosition.add(entry.hudGrabOffsets.tracks);
        }
        setVrTracksHudPlacementPosition(newPosition);
      }

      if (entry.isSelecting && entry.hudRotationState) {
        const rotationState = entry.hudRotationState;
        const expectedTargetType = `${rotationState.hud}-panel-${rotationState.mode}` as VrUiTargetType;
        if (entry.activeUiTarget?.type !== expectedTargetType) {
          entry.hudRotationState = null;
        } else {
          let placement: VrHudPlacement | null = null;
          let applyYaw: ((nextYaw: number) => void) | null = null;
          let applyPitch: ((nextPitch: number) => void) | null = null;
          if (rotationState.hud === 'playback') {
            placement = vrPlaybackHudPlacementRef.current;
            if (rotationState.mode === 'yaw') {
              applyYaw = setVrPlaybackHudPlacementYaw;
            } else {
              applyPitch = setVrPlaybackHudPlacementPitch;
            }
          } else if (rotationState.hud === 'channels') {
            placement = vrChannelsHudPlacementRef.current;
            if (rotationState.mode === 'yaw') {
              applyYaw = setVrChannelsHudPlacementYaw;
            } else {
              applyPitch = setVrChannelsHudPlacementPitch;
            }
          } else if (rotationState.hud === 'tracks') {
            placement = vrTracksHudPlacementRef.current;
            if (rotationState.mode === 'yaw') {
              applyYaw = setVrTracksHudPlacementYaw;
            } else {
              applyPitch = setVrTracksHudPlacementPitch;
            }
          }
          if (placement && (applyYaw || applyPitch)) {
            if (rotationState.mode === 'yaw' && applyYaw) {
              const yawVector = vrHudYawVectorRef.current;
              yawVector.copy(entry.rayOrigin).sub(placement.position);
              yawVector.y = 0;
              if (yawVector.lengthSq() > 1e-6) {
                const currentAngle = computeYawAngleForBasis(
                  yawVector,
                  rotationState.basisForward,
                  rotationState.basisRight,
                );
                let delta = currentAngle - rotationState.initialAngle;
                const tau = Math.PI * 2;
                if (delta > Math.PI) {
                  delta -= tau;
                } else if (delta < -Math.PI) {
                  delta += tau;
                }
                const nextYaw = rotationState.initialYaw - delta;
                applyYaw(nextYaw);
              }
            } else if (rotationState.mode === 'pitch' && applyPitch) {
              const pitchVector = vrHudPitchVectorRef.current;
              pitchVector.copy(entry.rayOrigin).sub(placement.position);
              pitchVector.x = 0;
              if (pitchVector.lengthSq() > 1e-6) {
                const forwardComponent = pitchVector.dot(rotationState.basisForward);
                const currentAngle = Math.atan2(pitchVector.y, forwardComponent);
                let delta = currentAngle - rotationState.initialAngle;
                const tau = Math.PI * 2;
                if (delta > Math.PI) {
                  delta -= tau;
                } else if (delta < -Math.PI) {
                  delta += tau;
                }
                const pitchLimit = Math.PI / 2 - 0.05;
                const nextPitch = Math.max(
                  -pitchLimit,
                  Math.min(pitchLimit, rotationState.initialPitch + delta),
                );
                applyPitch(nextPitch);
              }
            }
          } else {
            entry.hudRotationState = null;
          }
        }
      }

      if (visibleLines.length > 0 && cameraInstance) {
        const raycastCamera = renderer.xr.isPresenting
          ? ((renderer.xr.getCamera() as THREE.Camera) ?? cameraInstance)
          : cameraInstance;
        entry.raycaster.camera = raycastCamera as unknown as THREE.Camera;
        const intersections = entry.raycaster.intersectObjects(visibleLines, false) as Array<{
          object: THREE.Object3D & { userData?: Record<string, unknown> };
          distance: number;
          point: THREE.Vector3;
        }>;

        if (intersections.length > 0) {
          const intersection = intersections[0];
          const trackId =
            intersection.object.userData && typeof intersection.object.userData.trackId === 'string'
              ? (intersection.object.userData.trackId as string)
              : null;

          if (trackId) {
            hoverTrackId = entry.hoverUiTarget ? null : trackId;
            entry.hoverPoint.copy(intersection.point);
            const distance = Math.max(0.15, Math.min(intersection.distance, 8));
            rayLength = Math.min(rayLength, distance);
            if (containerInstance) {
              const width = containerInstance.clientWidth;
              const height = containerInstance.clientHeight;
              if (width > 0 && height > 0) {
                controllerProjectedPoint.copy(intersection.point).project(cameraInstance);
                if (
                  Number.isFinite(controllerProjectedPoint.x) &&
                  Number.isFinite(controllerProjectedPoint.y)
                ) {
                  hoverPosition = {
                    x: (controllerProjectedPoint.x * 0.5 + 0.5) * width,
                    y: (-controllerProjectedPoint.y * 0.5 + 0.5) * height,
                  };
                }
              }
            }
          }
        }
      }

      entry.hoverTrackId = hoverTrackId;
      const currentUiType = entry.hoverUiTarget ? entry.hoverUiTarget.type : null;
      if (previousHoverTrackId !== hoverTrackId || previousUiType !== currentUiType) {
        log?.('[VR] controller hover update', index, {
          hoverTrackId,
          hoverPosition,
          uiTarget: currentUiType,
        });
      }
      entry.rayLength = rayLength;
      entry.ray.scale.set(1, 1, rayLength);

      if (!hoveredByController && hoverTrackId) {
        hoveredByController = { trackId: hoverTrackId, position: hoverPosition };
      }
    }

    applyVrPlaybackHoverState(
      playHoveredAny,
      playbackSliderHoveredAny,
      playbackSliderActiveAny,
      fpsSliderHoveredAny,
      fpsSliderActiveAny,
      resetVolumeHoveredAny,
      resetHudHoveredAny,
      exitHoveredAny,
      modeHoveredAny,
    );

    const channelsHudInstance = vrChannelsHudRef.current;
    const isSameRegion = (
      a: VrChannelsInteractiveRegion | null,
      b: VrChannelsInteractiveRegion | null,
    ) => {
      if (a === b) {
        return true;
      }
      if (!a || !b) {
        return false;
      }
      return (
        a.targetType === b.targetType &&
        a.channelId === b.channelId &&
        a.layerKey === b.layerKey &&
        a.sliderKey === b.sliderKey &&
        a.color === b.color
      );
    };
    if (channelsHudInstance && !isSameRegion(channelsHudInstance.hoverRegion, nextChannelsHoverRegion)) {
      channelsHudInstance.hoverRegion = nextChannelsHoverRegion;
      renderVrChannelsHudRef.current?.(channelsHudInstance, vrChannelsStateRef.current);
    }

    const tracksHudInstance = vrTracksHudRef.current;
    const isSameTracksRegion = (
      a: VrTracksInteractiveRegion | null,
      b: VrTracksInteractiveRegion | null,
    ) => {
      if (a === b) {
        return true;
      }
      if (!a || !b) {
        return false;
      }
      return (
        a.targetType === b.targetType &&
        a.channelId === b.channelId &&
        a.trackId === b.trackId &&
        a.sliderKey === b.sliderKey &&
        a.color === b.color
      );
    };
    if (tracksHudInstance && !isSameTracksRegion(tracksHudInstance.hoverRegion, nextTracksHoverRegion)) {
      tracksHudInstance.hoverRegion = nextTracksHoverRegion;
      renderVrTracksHudRef.current?.(tracksHudInstance, vrTracksStateRef.current);
    }

    const summary = {
      presenting: true,
      visibleLines: visibleLines.length,
      hoverTrackIds: controllersRef.current.map((entry) => entry.hoverTrackId),
    };
    if (
      !lastControllerRaySummary ||
      summary.visibleLines !== lastControllerRaySummary.visibleLines ||
      summary.hoverTrackIds.length !== lastControllerRaySummary.hoverTrackIds.length ||
      summary.hoverTrackIds.some((id, hoverIndex) => id !== lastControllerRaySummary?.hoverTrackIds[hoverIndex])
    ) {
      log?.('[VR] ray pass', summary);
    }
    lastControllerRaySummary = summary;
    lastControllerRaySummaryRef.current = summary;

    if (hoveredByController) {
      vrUpdateHoverStateRef.current?.(
        hoveredByController.trackId,
        hoveredByController.position,
        'controller',
      );
    } else {
      vrClearHoverStateRef.current?.('controller');
    }
  }, [
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
  ]);
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
