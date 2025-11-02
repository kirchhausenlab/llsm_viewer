import { MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

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
  VrChannelsSliderDefinition,
  VrChannelsSliderKey,
  VrChannelsState,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksSliderKey,
  VrTracksState,
  VrUiTargetType,
} from './vr';
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
  VR_VOLUME_MAX_SCALE,
  VR_VOLUME_MIN_SCALE,
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
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../../layerColors';
import {
  DEFAULT_TRACK_COLOR,
  getTrackColorHex,
  normalizeTrackColor,
} from '../../trackColors';
import { brightnessContrastModel } from '../../state/layerSettings';
import { DEFAULT_TRACK_LINE_WIDTH, DEFAULT_TRACK_OPACITY } from './constants';

export type PlaybackState = {
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  fps: number;
  timeIndex: number;
  totalTimepoints: number;
  onTogglePlayback: () => void;
  onTimeIndexChange: (nextIndex: number) => void;
  onFpsChange: (value: number) => void;
  passthroughSupported: boolean;
  preferredSessionMode: 'immersive-vr' | 'immersive-ar';
  currentSessionMode: 'immersive-vr' | 'immersive-ar' | null;
};

export type PlaybackLoopState = { lastTimestamp: number | null; accumulator: number };

export type VrHoverState = {
  play: boolean;
  playbackSlider: boolean;
  playbackSliderActive: boolean;
  fpsSlider: boolean;
  fpsSliderActive: boolean;
  resetVolume: boolean;
  resetHud: boolean;
  exit: boolean;
  mode: boolean;
};

export type UseVolumeViewerVrParams = {
  vrProps?: VolumeViewerVrProps | null;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
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
  pointerStateRef: MutableRefObject<PointerState | null>;
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  trackFollowOffsetRef: MutableRefObject<THREE.Vector3 | null>;
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
};

export type UseVolumeViewerVrResult = {
  onRegisterVrSession: (
    handlers: Parameters<NonNullable<VolumeViewerVrProps['onRegisterVrSession']>>[0]
  ) => void;
  onVrSessionStarted: () => void;
  onVrSessionEnded: () => void;
  vrPlaybackHudRef: MutableRefObject<VrPlaybackHud | null>;
  vrChannelsHudRef: MutableRefObject<VrChannelsHud | null>;
  vrTracksHudRef: MutableRefObject<VrTracksHud | null>;
  vrPlaybackHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrChannelsHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrTracksHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrHudPlaneRef: MutableRefObject<THREE.Plane>;
  vrHudPlanePointRef: MutableRefObject<THREE.Vector3>;
  vrPlaybackHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrChannelsHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrTracksHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrHudOffsetTempRef: MutableRefObject<THREE.Vector3>;
  vrHudIntersectionRef: MutableRefObject<THREE.Vector3>;
  vrChannelsLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrTracksLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrHudForwardRef: MutableRefObject<THREE.Vector3>;
  vrHudYawEulerRef: MutableRefObject<THREE.Euler>;
  vrHudYawQuaternionRef: MutableRefObject<THREE.Quaternion>;
  vrHudYawVectorRef: MutableRefObject<THREE.Vector3>;
  vrHudPitchVectorRef: MutableRefObject<THREE.Vector3>;
  vrTranslationHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeScaleHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeYawHandlesRef: MutableRefObject<THREE.Mesh[]>;
  vrVolumePitchHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrHandleLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleWorldPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleSecondaryPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleQuaternionTempRef: MutableRefObject<THREE.Quaternion>;
  vrHandleQuaternionTemp2Ref: MutableRefObject<THREE.Quaternion>;
  sliderLocalPointRef: MutableRefObject<THREE.Vector3>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  playbackLoopRef: MutableRefObject<PlaybackLoopState>;
  vrHoverStateRef: MutableRefObject<VrHoverState>;
  vrChannelsStateRef: MutableRefObject<VrChannelsState>;
  vrTracksStateRef: MutableRefObject<VrTracksState>;
  controllersRef: MutableRefObject<ControllerEntry[]>;
  raycasterRef: MutableRefObject<RaycasterLike | null>;
  xrSessionRef: MutableRefObject<XRSession | null>;
  sessionCleanupRef: MutableRefObject<(() => void) | null>;
  preVrCameraStateRef: MutableRefObject<
    | {
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
        target: THREE.Vector3;
      }
    | null
  >;
  xrPreferredSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar'>;
  xrCurrentSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
  xrPendingModeSwitchRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
  xrPassthroughSupportedRef: MutableRefObject<boolean>;
  xrFoveationAppliedRef: MutableRefObject<boolean>;
  xrPreviousFoveationRef: MutableRefObject<number | undefined>;
  applyVrPlaybackHoverState: (
    playHovered: boolean,
    playbackSliderHovered: boolean,
    playbackSliderActive: boolean,
    fpsSliderHovered: boolean,
    fpsSliderActive: boolean,
    resetVolumeHovered: boolean,
    resetHudHovered: boolean,
    exitHovered: boolean,
    modeHovered: boolean,
  ) => void;
  updateVrPlaybackHud: () => void;
  setVrPlaybackHudVisible: (visible: boolean) => void;
  setVrChannelsHudVisible: (visible: boolean) => void;
  setVrTracksHudVisible: (visible: boolean) => void;
  setPreferredXrSessionMode: (mode: 'immersive-vr' | 'immersive-ar') => void;
  applyPlaybackSliderFromWorldPoint: (worldPoint: THREE.Vector3) => void;
  applyFpsSliderFromWorldPoint: (worldPoint: THREE.Vector3) => void;
  createVrPlaybackHud: () => VrPlaybackHud | null;
  createVrChannelsHud: () => VrChannelsHud | null;
  createVrTracksHud: () => VrTracksHud | null;
  renderVrChannelsHud: (hud: VrChannelsHud, state: VrChannelsState) => void;
  renderVrTracksHud: (hud: VrTracksHud, state: VrTracksState) => void;
  updateVrChannelsHud: () => void;
  updateVrTracksHud: () => void;
  applyVrChannelsSliderFromPoint: (
    region: VrChannelsInteractiveRegion,
    worldPoint: THREE.Vector3,
  ) => void;
  applyVrTracksSliderFromPoint: (region: VrTracksInteractiveRegion, worldPoint: THREE.Vector3) => void;
  applyVrTracksScrollFromPoint: (region: VrTracksInteractiveRegion, worldPoint: THREE.Vector3) => void;
  updateVolumeHandles: () => void;
  applyVolumeYawPitch: (yaw: number, pitch: number) => void;
  updateHudGroupFromPlacement: (
    hud: VrPlaybackHud | VrChannelsHud | VrTracksHud | null,
    placement: VrHudPlacement | null,
  ) => void;
  setHudPlacement: (
    placementRef: MutableRefObject<VrHudPlacement | null>,
    dragTargetRef: MutableRefObject<THREE.Vector3>,
    hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
    position: THREE.Vector3,
    yaw: number,
    pitch: number,
  ) => void;
  computeVolumeHudFrame: () => {
    center: THREE.Vector3;
    forward: THREE.Vector3;
    right: THREE.Vector3;
    up: THREE.Vector3;
    yaw: number;
    pitch: number;
  } | null;
  resetVrPlaybackHudPlacement: () => void;
  resetVrChannelsHudPlacement: () => void;
  resetVrTracksHudPlacement: () => void;
  applyVolumeRootTransform: (
    dimensions: { width: number; height: number; depth: number } | null,
  ) => void;
  applyVolumeStepScaleToResources: (stepScale: number) => void;
};

export function useVolumeViewerVr({
  vrProps,
  rendererRef,
  cameraRef,
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
      vrHoverStateRef.current = {
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
      const hud = vrPlaybackHudRef.current;
      if (!hud) {
        return;
      }
      const state = playbackStateRef.current;
      const playMaterial = hud.playButton.material as THREE.MeshBasicMaterial;
      playMaterial.color.copy(hud.playButtonBaseColor);
      if (playHovered && !state.playbackDisabled) {
        playMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      const playbackSliderTrackMaterial = hud.playbackSliderTrack.material as THREE.MeshBasicMaterial;
      playbackSliderTrackMaterial.color.copy(hud.playbackSliderTrackBaseColor);
      if ((playbackSliderHovered || playbackSliderActive) && !state.playbackDisabled) {
        playbackSliderTrackMaterial.color.lerp(hud.hoverHighlightColor, 0.22);
      }
      const playbackKnobMaterial = hud.playbackSliderKnob.material as THREE.MeshBasicMaterial;
      playbackKnobMaterial.color.copy(hud.playbackSliderKnobBaseColor);
      if ((playbackSliderHovered || playbackSliderActive) && !state.playbackDisabled) {
        playbackKnobMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      const fpsDisabled = state.totalTimepoints <= 1;
      const fpsSliderTrackMaterial = hud.fpsSliderTrack.material as THREE.MeshBasicMaterial;
      fpsSliderTrackMaterial.color.copy(hud.fpsSliderTrackBaseColor);
      if ((fpsSliderHovered || fpsSliderActive) && !fpsDisabled) {
        fpsSliderTrackMaterial.color.lerp(hud.hoverHighlightColor, 0.22);
      }
      const fpsKnobMaterial = hud.fpsSliderKnob.material as THREE.MeshBasicMaterial;
      fpsKnobMaterial.color.copy(hud.fpsSliderKnobBaseColor);
      if ((fpsSliderHovered || fpsSliderActive) && !fpsDisabled) {
        fpsKnobMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      const resetVolumeMaterial = hud.resetVolumeButton.material as THREE.MeshBasicMaterial;
      resetVolumeMaterial.color.copy(hud.resetVolumeButtonBaseColor);
      if (resetVolumeHovered) {
        resetVolumeMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      const resetHudMaterial = hud.resetHudButton.material as THREE.MeshBasicMaterial;
      resetHudMaterial.color.copy(hud.resetHudButtonBaseColor);
      if (resetHudHovered) {
        resetHudMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      const exitMaterial = hud.exitButton.material as THREE.MeshBasicMaterial;
      exitMaterial.color.copy(hud.exitButtonBaseColor);
      if (exitHovered) {
        exitMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
      }
      if (hud.modeButton.visible) {
        const modeMaterial = hud.modeButton.material as THREE.MeshBasicMaterial;
        modeMaterial.color.copy(hud.modeButtonBaseColor);
        if (modeHovered) {
          modeMaterial.color.lerp(hud.hoverHighlightColor, 0.35);
        }
      }
    },
    [playbackStateRef, vrPlaybackHudRef],
  );

  const updateVrPlaybackHud = useCallback<UseVolumeViewerVrResult['updateVrPlaybackHud']>(() => {
    const hud = vrPlaybackHudRef.current;
    if (!hud) {
      return;
    }
    const state = playbackStateRef.current;
    const playMaterial = hud.playButton.material as THREE.MeshBasicMaterial;
    const playbackSliderTrackMaterial = hud.playbackSliderTrack.material as THREE.MeshBasicMaterial;
    const playbackSliderFillMaterial = hud.playbackSliderFill.material as THREE.MeshBasicMaterial;
    const playbackKnobMaterial = hud.playbackSliderKnob.material as THREE.MeshBasicMaterial;
    const fpsSliderTrackMaterial = hud.fpsSliderTrack.material as THREE.MeshBasicMaterial;
    const fpsSliderFillMaterial = hud.fpsSliderFill.material as THREE.MeshBasicMaterial;
    const fpsKnobMaterial = hud.fpsSliderKnob.material as THREE.MeshBasicMaterial;
    const modeMaterial = hud.modeButton.material as THREE.MeshBasicMaterial;

    if (state.playbackDisabled) {
      hud.playButtonBaseColor.set(0x3a414d);
      hud.playbackSliderTrackBaseColor.set(0x2f333b);
      hud.playbackSliderKnobBaseColor.set(0xcad0da);
      playbackSliderFillMaterial.color.set(0x5a6473);
      playbackSliderFillMaterial.opacity = 0.35;
    } else if (state.isPlaying) {
      hud.playButtonBaseColor.set(0x1f6f3f);
      hud.playbackSliderTrackBaseColor.set(0x3b414d);
      hud.playbackSliderKnobBaseColor.set(0xffffff);
      playbackSliderFillMaterial.color.set(0x45c16b);
      playbackSliderFillMaterial.opacity = 0.85;
    } else {
      hud.playButtonBaseColor.set(0x2b5fa6);
      hud.playbackSliderTrackBaseColor.set(0x3b414d);
      hud.playbackSliderKnobBaseColor.set(0xffffff);
      playbackSliderFillMaterial.color.set(0x68a7ff);
      playbackSliderFillMaterial.opacity = 0.85;
    }

    playMaterial.color.copy(hud.playButtonBaseColor);
    playbackSliderTrackMaterial.color.copy(hud.playbackSliderTrackBaseColor);
    playbackKnobMaterial.color.copy(hud.playbackSliderKnobBaseColor);

    const fpsDisabled = state.totalTimepoints <= 1;
    if (fpsDisabled) {
      hud.fpsSliderTrackBaseColor.set(0x2f333b);
      hud.fpsSliderKnobBaseColor.set(0xcad0da);
      fpsSliderFillMaterial.color.set(0x5a6473);
      fpsSliderFillMaterial.opacity = 0.35;
    } else {
      hud.fpsSliderTrackBaseColor.set(0x3b414d);
      hud.fpsSliderKnobBaseColor.set(0xffffff);
      fpsSliderFillMaterial.color.set(0x68a7ff);
      fpsSliderFillMaterial.opacity = 0.85;
    }

    fpsSliderTrackMaterial.color.copy(hud.fpsSliderTrackBaseColor);
    fpsKnobMaterial.color.copy(hud.fpsSliderKnobBaseColor);

    const passthroughSupported = Boolean(state.passthroughSupported);
    if (!passthroughSupported) {
      hud.modeButton.visible = false;
      hud.modeVrIcon.visible = false;
      hud.modeArIcon.visible = false;
      hud.modeButtonBaseColor.copy(hud.modeButtonDisabledColor);
      modeMaterial.color.copy(hud.modeButtonBaseColor);
    } else {
      hud.modeButton.visible = true;
      const preferredMode =
        state.preferredSessionMode === 'immersive-ar' ? 'immersive-ar' : 'immersive-vr';
      if (preferredMode === 'immersive-ar') {
        hud.modeButtonBaseColor.copy(hud.modeButtonActiveColor);
        hud.modeVrIcon.visible = false;
        hud.modeArIcon.visible = true;
      } else {
        hud.modeButtonBaseColor.set(0x2b3340);
        hud.modeVrIcon.visible = true;
        hud.modeArIcon.visible = false;
      }
      modeMaterial.color.copy(hud.modeButtonBaseColor);
    }

    hud.playIcon.visible = !state.isPlaying;
    hud.pauseGroup.visible = state.isPlaying;

    const maxIndex = Math.max(0, state.totalTimepoints - 1);
    const fraction = maxIndex > 0 ? Math.min(Math.max(state.timeIndex / maxIndex, 0), 1) : 0;
    setVrPlaybackProgressFraction(hud, fraction);
    setVrPlaybackLabel(hud, state.playbackLabel ?? '');
    const fpsRange = VR_PLAYBACK_MAX_FPS - VR_PLAYBACK_MIN_FPS;
    const fpsValue = Math.min(
      VR_PLAYBACK_MAX_FPS,
      Math.max(VR_PLAYBACK_MIN_FPS, state.fps ?? VR_PLAYBACK_MIN_FPS),
    );
    const fpsFraction =
      fpsRange > 0
        ? (Math.min(Math.max(fpsValue, VR_PLAYBACK_MIN_FPS), VR_PLAYBACK_MAX_FPS) -
            VR_PLAYBACK_MIN_FPS) /
          fpsRange
        : 0;
    setVrPlaybackFpsFraction(hud, fpsFraction);
    const fpsLabelText = fpsDisabled ? 'frames per second —' : `frames per second ${fpsValue}`;
    setVrPlaybackFpsLabel(hud, fpsLabelText);
    applyVrPlaybackHoverState(
      vrHoverStateRef.current.play,
      vrHoverStateRef.current.playbackSlider,
      vrHoverStateRef.current.playbackSliderActive,
      vrHoverStateRef.current.fpsSlider,
      vrHoverStateRef.current.fpsSliderActive,
      vrHoverStateRef.current.resetVolume,
      vrHoverStateRef.current.resetHud,
      vrHoverStateRef.current.exit,
      vrHoverStateRef.current.mode,
    );
  }, [applyVrPlaybackHoverState, playbackStateRef, vrHoverStateRef, vrPlaybackHudRef]);

  const setPreferredXrSessionMode = useCallback<
    UseVolumeViewerVrResult['setPreferredXrSessionMode']
  >(
    (mode) => {
      xrPreferredSessionModeRef.current = mode;
      playbackStateRef.current.preferredSessionMode = mode;
      updateVrPlaybackHud();
    },
    [updateVrPlaybackHud]
  );

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

  const createVrPlaybackHud = useCallback<UseVolumeViewerVrResult['createVrPlaybackHud']>(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const group = new THREE.Group();
    group.name = 'VrPlaybackHud';

    const panelMaterial = new THREE.MeshBasicMaterial({
      color: 0x10161d,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_PLAYBACK_PANEL_WIDTH, VR_PLAYBACK_PANEL_HEIGHT),
      panelMaterial,
    );
    panel.position.set(0, 0, 0);
    panel.userData.vrUiTarget = { type: 'playback-panel' } satisfies { type: VrUiTargetType };
    group.add(panel);

    const buttonRowY = 0.11;
    const fpsLabelRowY = 0.07;
    const fpsSliderRowY = 0.025;
    const playbackLabelRowY = -0.03;
    const playbackSliderRowY = -0.075;
    const playButtonRowY = -0.14;
    const topButtons: THREE.Mesh[] = [];

    const translateHandleMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_TRANSLATE_HANDLE_COLOR,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    translateHandleMaterial.depthTest = false;
    const panelTranslateHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_TRANSLATE_HANDLE_RADIUS, 32, 32),
      translateHandleMaterial,
    );
    panelTranslateHandle.position.set(
      0,
      VR_PLAYBACK_PANEL_HEIGHT / 2 + VR_HUD_TRANSLATE_HANDLE_OFFSET,
      0,
    );
    panelTranslateHandle.userData.vrUiTarget = { type: 'playback-panel-grab' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelTranslateHandle);

    const yawHandleMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_YAW_HANDLE_COLOR,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    yawHandleMaterial.depthTest = false;
    const panelYawHandles: THREE.Mesh[] = [];
    const yawOffsets = [1, -1] as const;
    for (const direction of yawOffsets) {
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
        yawHandleMaterial.clone(),
      );
      handle.position.set(
        direction * (VR_PLAYBACK_PANEL_WIDTH / 2 + VR_HUD_YAW_HANDLE_OFFSET),
        0,
        0,
      );
      handle.userData.vrUiTarget = { type: 'playback-panel-yaw' } satisfies {
        type: VrUiTargetType;
      };
      group.add(handle);
      panelYawHandles.push(handle);
    }

    const panelPitchHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
      yawHandleMaterial.clone(),
    );
    panelPitchHandle.position.set(
      0,
      -(VR_PLAYBACK_PANEL_HEIGHT / 2 + VR_HUD_YAW_HANDLE_OFFSET),
      0,
    );
    panelPitchHandle.userData.vrUiTarget = { type: 'playback-panel-pitch' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelPitchHandle);

    const sideButtonRadius = 0.032;
    const sideButtonMargin = 0.02;

    const resetVolumeButtonMaterial = new THREE.MeshBasicMaterial({
      color: 0x2b3340,
      side: THREE.DoubleSide,
    });
    const resetVolumeButton = new THREE.Mesh(
      new THREE.CircleGeometry(sideButtonRadius, 48),
      resetVolumeButtonMaterial,
    );
    resetVolumeButton.userData.vrUiTarget = { type: 'playback-reset-volume' } satisfies {
      type: VrUiTargetType;
    };
    topButtons.push(resetVolumeButton);
    const resetVolumeIconMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const resetVolumeIconGroup = new THREE.Group();
    const resetArc = new THREE.Mesh(
      new THREE.RingGeometry(0.012, 0.02, 24, 1, Math.PI * 0.25, Math.PI * 1.4),
      resetVolumeIconMaterial,
    );
    resetArc.position.set(0, 0, 0.0006);
    const resetArrowShape = new THREE.Shape();
    resetArrowShape.moveTo(0.014, 0.01);
    resetArrowShape.lineTo(0.028, 0.002);
    resetArrowShape.lineTo(0.014, -0.006);
    resetArrowShape.lineTo(0.014, 0.01);
    const resetArrow = new THREE.Mesh(
      new THREE.ShapeGeometry(resetArrowShape),
      resetVolumeIconMaterial.clone(),
    );
    resetArrow.position.set(0, 0, 0.001);
    resetVolumeIconGroup.add(resetArc);
    resetVolumeIconGroup.add(resetArrow);
    resetVolumeButton.add(resetVolumeIconGroup);
    group.add(resetVolumeButton);

    const resetHudButtonMaterial = new THREE.MeshBasicMaterial({
      color: 0x2b3340,
      side: THREE.DoubleSide,
    });
    const resetHudButton = new THREE.Mesh(
      new THREE.CircleGeometry(sideButtonRadius, 48),
      resetHudButtonMaterial,
    );
    resetHudButton.userData.vrUiTarget = { type: 'playback-reset-hud' } satisfies {
      type: VrUiTargetType;
    };
    topButtons.push(resetHudButton);
    const resetHudIconMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const resetHudIconGroup = new THREE.Group();
    const windowPrimaryOuter = new THREE.Mesh(
      new THREE.PlaneGeometry(0.048, 0.034),
      resetHudIconMaterial.clone(),
    );
    windowPrimaryOuter.position.set(-0.01, 0.008, 0.0006);
    const windowPrimaryInner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.036, 0.024),
      new THREE.MeshBasicMaterial({ color: 0x10161d, side: THREE.DoubleSide }),
    );
    windowPrimaryInner.position.set(-0.01, 0.008, 0.0008);
    const windowSecondaryOuter = new THREE.Mesh(
      new THREE.PlaneGeometry(0.034, 0.026),
      resetHudIconMaterial.clone(),
    );
    windowSecondaryOuter.position.set(0.015, -0.012, 0.0006);
    const windowSecondaryInner = new THREE.Mesh(
      new THREE.PlaneGeometry(0.024, 0.018),
      new THREE.MeshBasicMaterial({ color: 0x10161d, side: THREE.DoubleSide }),
    );
    windowSecondaryInner.position.set(0.015, -0.012, 0.0008);
    resetHudIconGroup.add(windowPrimaryOuter);
    resetHudIconGroup.add(windowPrimaryInner);
    resetHudIconGroup.add(windowSecondaryOuter);
    resetHudIconGroup.add(windowSecondaryInner);
    resetHudButton.add(resetHudIconGroup);
    group.add(resetHudButton);

    const playButtonMaterial = new THREE.MeshBasicMaterial({
      color: 0x2b3340,
      side: THREE.DoubleSide,
    });
    const playButton = new THREE.Mesh(new THREE.CircleGeometry(0.045, 48), playButtonMaterial);
    playButton.position.set(0, playButtonRowY, VR_HUD_SURFACE_OFFSET);
    playButton.userData.vrUiTarget = { type: 'playback-play-toggle' } satisfies {
      type: VrUiTargetType;
    };
    group.add(playButton);

    const playShape = new THREE.Shape();
    playShape.moveTo(-0.018, -0.022);
    playShape.lineTo(0.026, 0);
    playShape.lineTo(-0.018, 0.022);
    playShape.lineTo(-0.018, -0.022);
    const playIcon = new THREE.Mesh(
      new THREE.ShapeGeometry(playShape),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    );
    playIcon.position.set(0, 0, 0.0008);
    playButton.add(playIcon);

    const pauseGroup = new THREE.Group();
    const pauseBarMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const pauseLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.035), pauseBarMaterial);
    pauseLeft.position.set(-0.01, 0, 0.0008);
    const pauseRight = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.035), pauseBarMaterial);
    pauseRight.position.set(0.01, 0, 0.0008);
    pauseGroup.add(pauseLeft);
    pauseGroup.add(pauseRight);
    playButton.add(pauseGroup);

    const exitButtonMaterial = new THREE.MeshBasicMaterial({
      color: 0x512b2b,
      side: THREE.DoubleSide,
    });
    const exitButton = new THREE.Mesh(new THREE.CircleGeometry(sideButtonRadius, 48), exitButtonMaterial);
    exitButton.userData.vrUiTarget = { type: 'playback-exit-vr' } satisfies { type: VrUiTargetType };
    topButtons.push(exitButton);
    const exitIconGroup = new THREE.Group();
    const exitArrowMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const exitArrow = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.04), exitArrowMaterial);
    exitArrow.position.set(-0.01, 0, 0.0008);
    const exitDoor = new THREE.Mesh(new THREE.PlaneGeometry(0.014, 0.035), exitArrowMaterial.clone());
    exitDoor.position.set(0.012, 0, 0.0008);
    exitIconGroup.add(exitArrow);
    exitIconGroup.add(exitDoor);
    exitButton.add(exitIconGroup);
    group.add(exitButton);

    const modeButtonMaterial = new THREE.MeshBasicMaterial({
      color: 0x2b3340,
      side: THREE.DoubleSide,
    });
    const modeButton = new THREE.Mesh(new THREE.CircleGeometry(sideButtonRadius, 48), modeButtonMaterial);
    modeButton.userData.vrUiTarget = { type: 'playback-toggle-mode' } satisfies {
      type: VrUiTargetType;
    };
    topButtons.push(modeButton);
    const modeVrIcon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.026, 0.02),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    );
    modeVrIcon.position.set(0, 0.006, 0.0008);
    const modeVrBand = new THREE.Mesh(
      new THREE.PlaneGeometry(0.024, 0.008),
      new THREE.MeshBasicMaterial({ color: 0x1f6f3f, side: THREE.DoubleSide }),
    );
    modeVrBand.position.set(0, -0.01, 0.0008);
    modeButton.add(modeVrIcon);
    modeButton.add(modeVrBand);

    const modeArIcon = new THREE.Group();
    const modeArFrame = new THREE.Mesh(
      new THREE.RingGeometry(0.016, 0.022, 32, 1, 0, Math.PI * 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    );
    modeArFrame.position.set(0, 0.006, 0.0008);
    const modeArBand = new THREE.Mesh(
      new THREE.PlaneGeometry(0.022, 0.008),
      new THREE.MeshBasicMaterial({ color: 0x1f6f3f, side: THREE.DoubleSide }),
    );
    modeArBand.position.set(0, -0.01, 0.0008);
    modeArIcon.add(modeArFrame);
    modeArIcon.add(modeArBand);
    modeButton.add(modeArIcon);

    const firstButtonX = -0.16;
    const buttonSpacing = 0.11;
    for (const [index, button] of topButtons.entries()) {
      button.position.set(firstButtonX + index * buttonSpacing, buttonRowY, VR_HUD_SURFACE_OFFSET);
      group.add(button);
    }

    const fpsSliderGroup = new THREE.Group();
    fpsSliderGroup.position.set(0, fpsSliderRowY, VR_HUD_SURFACE_OFFSET);
    group.add(fpsSliderGroup);

    const fpsSliderWidth = 0.22;
    const fpsSliderTrackMaterial = new THREE.MeshBasicMaterial({
      color: 0x3b414d,
      side: THREE.DoubleSide,
    });
    const fpsSliderTrack = new THREE.Mesh(
      new THREE.PlaneGeometry(fpsSliderWidth, 0.012),
      fpsSliderTrackMaterial,
    );
    fpsSliderTrack.position.set(0, 0, 0);
    fpsSliderGroup.add(fpsSliderTrack);

    const fpsSliderFillMaterial = new THREE.MeshBasicMaterial({
      color: 0x68a7ff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const fpsSliderFill = new THREE.Mesh(new THREE.PlaneGeometry(fpsSliderWidth, 0.012), fpsSliderFillMaterial);
    fpsSliderFill.position.set(0, 0, 0.0005);
    fpsSliderGroup.add(fpsSliderFill);

    const fpsSliderKnobMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const fpsSliderKnob = new THREE.Mesh(new THREE.CircleGeometry(0.017, 32), fpsSliderKnobMaterial);
    fpsSliderKnob.position.set(-fpsSliderWidth / 2, 0, 0.001);
    fpsSliderKnob.userData.vrUiTarget = { type: 'playback-fps-slider' } satisfies {
      type: VrUiTargetType;
    };
    fpsSliderGroup.add(fpsSliderKnob);

    const fpsSliderHitMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.01,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fpsSliderHitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(fpsSliderWidth + 0.04, 0.08),
      fpsSliderHitMaterial,
    );
    fpsSliderHitArea.position.set(0, 0, 0.0002);
    fpsSliderHitArea.userData.vrUiTarget = { type: 'playback-fps-slider' } satisfies {
      type: VrUiTargetType;
    };
    fpsSliderGroup.add(fpsSliderHitArea);

    const fpsLabelCanvas = document.createElement('canvas');
    fpsLabelCanvas.width = 256;
    fpsLabelCanvas.height = 64;
    const fpsLabelContext = fpsLabelCanvas.getContext('2d');
    const fpsLabelTexture = new THREE.CanvasTexture(fpsLabelCanvas);
    fpsLabelTexture.colorSpace = THREE.SRGBColorSpace;
    fpsLabelTexture.minFilter = THREE.LinearFilter;
    fpsLabelTexture.magFilter = THREE.LinearFilter;
    const fpsLabelMaterial = new THREE.MeshBasicMaterial({
      map: fpsLabelTexture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const fpsLabelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.05), fpsLabelMaterial);
    fpsLabelMesh.position.set(0, fpsLabelRowY, VR_HUD_SURFACE_OFFSET + 0.0005);
    group.add(fpsLabelMesh);

    const playbackSliderGroup = new THREE.Group();
    playbackSliderGroup.position.set(0, playbackSliderRowY, VR_HUD_SURFACE_OFFSET);
    group.add(playbackSliderGroup);

    const playbackSliderWidth = 0.32;
    const playbackSliderTrackMaterial = new THREE.MeshBasicMaterial({
      color: 0x3b414d,
      side: THREE.DoubleSide,
    });
    const playbackSliderTrack = new THREE.Mesh(
      new THREE.PlaneGeometry(playbackSliderWidth, 0.012),
      playbackSliderTrackMaterial,
    );
    playbackSliderTrack.position.set(0, 0, 0);
    playbackSliderGroup.add(playbackSliderTrack);

    const playbackSliderFillMaterial = new THREE.MeshBasicMaterial({
      color: 0x68a7ff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
    const playbackSliderFill = new THREE.Mesh(
      new THREE.PlaneGeometry(playbackSliderWidth, 0.012),
      playbackSliderFillMaterial,
    );
    playbackSliderFill.position.set(0, 0, 0.0005);
    playbackSliderGroup.add(playbackSliderFill);

    const playbackSliderKnobMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
    });
    const playbackSliderKnob = new THREE.Mesh(
      new THREE.CircleGeometry(0.017, 32),
      playbackSliderKnobMaterial,
    );
    playbackSliderKnob.position.set(-playbackSliderWidth / 2, 0, 0.001);
    playbackSliderKnob.userData.vrUiTarget = { type: 'playback-slider' } satisfies {
      type: VrUiTargetType;
    };
    playbackSliderGroup.add(playbackSliderKnob);

    const playbackSliderHitMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.01,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const playbackSliderHitArea = new THREE.Mesh(
      new THREE.PlaneGeometry(playbackSliderWidth + 0.04, 0.08),
      playbackSliderHitMaterial,
    );
    playbackSliderHitArea.position.set(0, 0, 0.0002);
    playbackSliderHitArea.userData.vrUiTarget = { type: 'playback-slider' } satisfies {
      type: VrUiTargetType;
    };
    playbackSliderGroup.add(playbackSliderHitArea);

    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 256;
    labelCanvas.height = 64;
    const labelContext = labelCanvas.getContext('2d');
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    labelTexture.minFilter = THREE.LinearFilter;
    labelTexture.magFilter = THREE.LinearFilter;
    const labelMaterial = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.06), labelMaterial);
    labelMesh.position.set(0, playbackLabelRowY, VR_HUD_SURFACE_OFFSET + 0.0005);
    group.add(labelMesh);

    const hud: VrPlaybackHud = {
      group,
      panel,
      panelTranslateHandle,
      panelYawHandles,
      panelPitchHandle,
      resetVolumeButton,
      resetHudButton,
      playButton,
      playIcon,
      pauseGroup,
      exitButton,
      exitIcon: exitIconGroup,
      playbackSliderGroup,
      playbackSliderTrack,
      playbackSliderFill,
      playbackSliderKnob,
      playbackSliderHitArea,
      playbackSliderWidth,
      fpsSliderGroup,
      fpsSliderTrack,
      fpsSliderFill,
      fpsSliderKnob,
      fpsSliderHitArea,
      fpsSliderWidth,
      labelMesh,
      labelTexture,
      labelCanvas,
      labelContext,
      labelText: '',
      fpsLabelMesh,
      fpsLabelTexture,
      fpsLabelCanvas,
      fpsLabelContext,
      fpsLabelText: '',
      interactables: [
        panelTranslateHandle,
        ...panelYawHandles,
        panelPitchHandle,
        resetVolumeButton,
        resetHudButton,
        playButton,
        modeButton,
        exitButton,
        playbackSliderHitArea,
        playbackSliderKnob,
        fpsSliderHitArea,
        fpsSliderKnob,
      ],
      resetVolumeButtonBaseColor: new THREE.Color(0x2b3340),
      resetHudButtonBaseColor: new THREE.Color(0x2b3340),
      playButtonBaseColor: new THREE.Color(0x2b3340),
      playbackSliderTrackBaseColor: new THREE.Color(0x3b414d),
      playbackSliderKnobBaseColor: new THREE.Color(0xffffff),
      fpsSliderTrackBaseColor: new THREE.Color(0x3b414d),
      fpsSliderKnobBaseColor: new THREE.Color(0xffffff),
      exitButtonBaseColor: new THREE.Color(0x512b2b),
      modeButtonBaseColor: new THREE.Color(0x2b3340),
      modeButtonActiveColor: new THREE.Color(0x1f6f3f),
      modeButtonDisabledColor: new THREE.Color(0x3a414d),
      hoverHighlightColor: new THREE.Color(0xffffff),
      resetVolumeButtonRadius: sideButtonRadius,
      resetHudButtonRadius: sideButtonRadius,
      exitButtonRadius: sideButtonRadius,
      modeButtonRadius: sideButtonRadius,
      modeButton,
      modeVrIcon,
      modeArIcon,
      cachedPosition: new THREE.Vector3(NaN, NaN, NaN),
      cachedYaw: NaN,
      cachedPitch: NaN,
      cacheDirty: true,
    };

    const state = playbackStateRef.current;
    const maxIndex = Math.max(0, state.totalTimepoints - 1);
    const fraction = maxIndex > 0 ? Math.min(Math.max(state.timeIndex / maxIndex, 0), 1) : 0;
    setVrPlaybackProgressFraction(hud, fraction);
    setVrPlaybackLabel(hud, state.playbackLabel ?? '');

    return hud;
  }, []);

  const createVrChannelsHud = useCallback<UseVolumeViewerVrResult['createVrChannelsHud']>(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const group = new THREE.Group();
    group.name = 'VrChannelsHud';

    const backgroundMaterial = new THREE.MeshBasicMaterial({
      color: 0x10161d,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const background = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_CHANNELS_PANEL_WIDTH, VR_CHANNELS_PANEL_HEIGHT),
      backgroundMaterial,
    );
    background.position.set(0, 0, 0);
    group.add(background);

    const panelCanvas = document.createElement('canvas');
    const panelDisplayWidth = VR_CHANNELS_CANVAS_WIDTH;
    const panelDisplayHeight = VR_CHANNELS_CANVAS_MIN_HEIGHT;
    const pixelRatio = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    panelCanvas.width = Math.round(panelDisplayWidth * pixelRatio);
    panelCanvas.height = Math.round(panelDisplayHeight * pixelRatio);
    const panelContext = panelCanvas.getContext('2d');
    if (!panelContext) {
      return null;
    }
    panelContext.imageSmoothingEnabled = true;
    panelContext.imageSmoothingQuality = 'high';
    const panelTexture = new THREE.CanvasTexture(panelCanvas);
    panelTexture.colorSpace = THREE.SRGBColorSpace;
    panelTexture.minFilter = THREE.LinearFilter;
    panelTexture.magFilter = THREE.LinearFilter;
    const panelMaterial = new THREE.MeshBasicMaterial({
      map: panelTexture,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_CHANNELS_PANEL_WIDTH, VR_CHANNELS_PANEL_HEIGHT),
      panelMaterial,
    );
    panel.position.set(0, 0, 0.001);
    panel.userData.vrUiTarget = { type: 'channels-panel' } satisfies { type: VrUiTargetType };
    group.add(panel);

    const channelsTranslateMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_TRANSLATE_HANDLE_COLOR,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    channelsTranslateMaterial.depthTest = false;
    const panelTranslateHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_TRANSLATE_HANDLE_RADIUS, 32, 32),
      channelsTranslateMaterial,
    );
    panelTranslateHandle.position.set(
      0,
      VR_CHANNELS_PANEL_HEIGHT / 2 + VR_HUD_TRANSLATE_HANDLE_OFFSET,
      0,
    );
    panelTranslateHandle.userData.vrUiTarget = { type: 'channels-panel-grab' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelTranslateHandle);

    const channelsYawMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_YAW_HANDLE_COLOR,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    channelsYawMaterial.depthTest = false;
    const panelYawHandles: THREE.Mesh[] = [];
    for (const direction of [1, -1] as const) {
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
        channelsYawMaterial.clone(),
      );
      handle.position.set(
        direction * (VR_CHANNELS_PANEL_WIDTH / 2 + VR_HUD_YAW_HANDLE_OFFSET),
        0,
        0,
      );
      handle.userData.vrUiTarget = { type: 'channels-panel-yaw' } satisfies {
        type: VrUiTargetType;
      };
      group.add(handle);
      panelYawHandles.push(handle);
    }

    const panelPitchHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
      channelsYawMaterial.clone(),
    );
    panelPitchHandle.position.set(
      0,
      -(VR_CHANNELS_PANEL_HEIGHT / 2 + VR_HUD_YAW_HANDLE_OFFSET),
      0,
    );
    panelPitchHandle.userData.vrUiTarget = { type: 'channels-panel-pitch' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelPitchHandle);

    const hud: VrChannelsHud = {
      group,
      background,
      panel,
      panelTranslateHandle,
      panelYawHandles,
      panelPitchHandle,
      panelTexture,
      panelCanvas,
      panelContext,
      panelDisplayWidth,
      panelDisplayHeight,
      pixelRatio,
      interactables: [panelTranslateHandle, ...panelYawHandles, panelPitchHandle, panel],
      regions: [],
      width: VR_CHANNELS_PANEL_WIDTH,
      height: VR_CHANNELS_PANEL_HEIGHT,
      hoverRegion: null,
      cachedPosition: new THREE.Vector3(NaN, NaN, NaN),
      cachedYaw: NaN,
      cachedPitch: NaN,
      cacheDirty: true,
    };

    return hud;
  }, []);

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

  const createVrTracksHud = useCallback<UseVolumeViewerVrResult['createVrTracksHud']>(() => {
    if (typeof document === 'undefined') {
      return null;
    }
    const group = new THREE.Group();
    group.name = 'VrTracksHud';

    const backgroundMaterial = new THREE.MeshBasicMaterial({
      color: 0x10161d,
      transparent: false,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const background = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_TRACKS_PANEL_WIDTH, VR_TRACKS_PANEL_HEIGHT),
      backgroundMaterial,
    );
    background.position.set(0, 0, 0);
    group.add(background);

    const panelCanvas = document.createElement('canvas');
    const panelDisplayWidth = VR_TRACKS_CANVAS_WIDTH;
    const panelDisplayHeight = VR_TRACKS_CANVAS_HEIGHT;
    const pixelRatio = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
    panelCanvas.width = Math.round(panelDisplayWidth * pixelRatio);
    panelCanvas.height = Math.round(panelDisplayHeight * pixelRatio);
    const panelContext = panelCanvas.getContext('2d');
    if (!panelContext) {
      return null;
    }
    panelContext.imageSmoothingEnabled = true;
    panelContext.imageSmoothingQuality = 'high';
    const panelTexture = new THREE.CanvasTexture(panelCanvas);
    panelTexture.colorSpace = THREE.SRGBColorSpace;
    panelTexture.minFilter = THREE.LinearFilter;
    panelTexture.magFilter = THREE.LinearFilter;
    const panelMaterial = new THREE.MeshBasicMaterial({
      map: panelTexture,
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide,
    });
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(VR_TRACKS_PANEL_WIDTH, VR_TRACKS_PANEL_HEIGHT),
      panelMaterial,
    );
    panel.position.set(0, 0, 0.001);
    panel.userData.vrUiTarget = { type: 'tracks-panel' } satisfies { type: VrUiTargetType };
    group.add(panel);

    const tracksTranslateMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_TRANSLATE_HANDLE_COLOR,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    tracksTranslateMaterial.depthTest = false;
    const panelTranslateHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_TRANSLATE_HANDLE_RADIUS, 32, 32),
      tracksTranslateMaterial,
    );
    panelTranslateHandle.position.set(
      0,
      VR_TRACKS_PANEL_HEIGHT / 2 + VR_HUD_TRANSLATE_HANDLE_OFFSET,
      0,
    );
    panelTranslateHandle.userData.vrUiTarget = { type: 'tracks-panel-grab' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelTranslateHandle);

    const tracksYawMaterial = new THREE.MeshBasicMaterial({
      color: VR_HUD_YAW_HANDLE_COLOR,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    tracksYawMaterial.depthTest = false;
    const panelYawHandles: THREE.Mesh[] = [];
    for (const direction of [1, -1] as const) {
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
        tracksYawMaterial.clone(),
      );
      handle.position.set(
        direction * (VR_TRACKS_PANEL_WIDTH / 2 + VR_HUD_YAW_HANDLE_OFFSET),
        0,
        0,
      );
      handle.userData.vrUiTarget = { type: 'tracks-panel-yaw' } satisfies {
        type: VrUiTargetType;
      };
      group.add(handle);
      panelYawHandles.push(handle);
    }

    const panelPitchHandle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
      tracksYawMaterial.clone(),
    );
    panelPitchHandle.position.set(
      0,
      -(VR_TRACKS_PANEL_HEIGHT / 2 + VR_HUD_YAW_HANDLE_OFFSET),
      0,
    );
    panelPitchHandle.userData.vrUiTarget = { type: 'tracks-panel-pitch' } satisfies {
      type: VrUiTargetType;
    };
    group.add(panelPitchHandle);

    const hud: VrTracksHud = {
      group,
      panel,
      panelTranslateHandle,
      panelYawHandles,
      panelPitchHandle,
      panelTexture,
      panelCanvas,
      panelContext,
      panelDisplayWidth,
      panelDisplayHeight,
      pixelRatio,
      interactables: [panelTranslateHandle, ...panelYawHandles, panelPitchHandle, panel],
      regions: [],
      width: VR_TRACKS_PANEL_WIDTH,
      height: VR_TRACKS_PANEL_HEIGHT,
      hoverRegion: null,
      cachedPosition: new THREE.Vector3(NaN, NaN, NaN),
      cachedYaw: NaN,
      cachedPitch: NaN,
      cacheDirty: true,
    };

    return hud;
  }, []);

  const renderVrTracksHud = useCallback<UseVolumeViewerVrResult['renderVrTracksHud']>((hud, state) => {
    renderVrTracksHudContent(hud, state);
  }, []);

  const updateVrChannelsHud = useCallback<UseVolumeViewerVrResult['updateVrChannelsHud']>(() => {
    const hud = vrChannelsHudRef.current;
    if (!hud) {
      return;
    }
    const state = vrChannelsStateRef.current;
    renderVrChannelsHud(hud, state);
  }, [renderVrChannelsHud]);

  const updateVrTracksHud = useCallback<UseVolumeViewerVrResult['updateVrTracksHud']>(() => {
    const hud = vrTracksHudRef.current;
    if (!hud) {
      return;
    }
    const state = vrTracksStateRef.current;
    renderVrTracksHud(hud, state);
  }, [renderVrTracksHud]);

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

  const onRegisterVrSession = useCallback<UseVolumeViewerVrResult['onRegisterVrSession']>(
    (handlers) => {
      vrProps?.onRegisterVrSession?.(handlers ?? null);
    },
    [vrProps]
  );

  const onVrSessionStarted = useCallback(() => {
    vrProps?.onVrSessionStarted?.();
  }, [vrProps]);

  const onVrSessionEnded = useCallback(() => {
    vrProps?.onVrSessionEnded?.();
  }, [vrProps]);

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
    target.y = Math.max(target.y, VR_HUD_MIN_HEIGHT);
  }, []);

  const getHudQuaternionFromAngles = useCallback((yaw: number, pitch: number) => {
    const yawQuaternion = vrHudYawQuaternionRef.current;
    const yawEuler = vrHudYawEulerRef.current;
    yawEuler.set(pitch, yaw, 0, 'YXZ');
    yawQuaternion.setFromEuler(yawEuler);
    return yawQuaternion;
  }, []);

  const updateHudGroupFromPlacement = useCallback(
    (
      hud: VrPlaybackHud | VrChannelsHud | VrTracksHud | null,
      placement: VrHudPlacement | null,
    ) => {
      if (!hud || !placement) {
        return;
      }
      const positionChanged =
        hud.cacheDirty ||
        Math.abs(hud.cachedPosition.x - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(hud.cachedPosition.y - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(hud.cachedPosition.z - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      const yawChanged =
        hud.cacheDirty || Math.abs(hud.cachedYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      const pitchChanged =
        hud.cacheDirty || Math.abs(hud.cachedPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      if (!positionChanged && !yawChanged && !pitchChanged) {
        return;
      }
      hud.group.position.copy(placement.position);
      if (yawChanged || pitchChanged || hud.cacheDirty) {
        const quaternion = getHudQuaternionFromAngles(placement.yaw + Math.PI, placement.pitch);
        hud.group.quaternion.copy(quaternion);
      }
      hud.group.updateMatrixWorld(true);
      hud.cachedPosition.copy(placement.position);
      hud.cachedYaw = placement.yaw;
      hud.cachedPitch = placement.pitch;
      hud.cacheDirty = false;
    },
    [getHudQuaternionFromAngles],
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
      const placement =
        placementRef.current ?? ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevX = placement.position.x;
      const prevY = placement.position.y;
      const prevZ = placement.position.z;
      const prevYaw = placement.yaw;
      const prevPitch = placement.pitch;
      placement.position.copy(position);
      constrainHudPlacementPosition(placement.position);
      placement.yaw = yaw;
      placement.pitch = pitch;
      const positionChanged =
        Math.abs(prevX - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevY - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevZ - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      const yawChanged = Math.abs(prevYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      placementRef.current = placement;
      dragTargetRef.current.copy(placement.position);
      const hud = hudRef.current;
      if (hud && (positionChanged || yawChanged || pitchChanged)) {
        hud.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hud, placement);
    },
    [constrainHudPlacementPosition, updateHudGroupFromPlacement],
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
      const camera = cameraRef.current;
      const hud = hudRef.current;
      if (!camera || !hud) {
        return;
      }
      const frame = computeVolumeHudFrame();
      const target = vrHudOffsetTempRef.current;
      if (frame) {
        target
          .copy(frame.center)
          .addScaledVector(frame.right, lateralOffset)
          .addScaledVector(frame.up, verticalOffset);
        setHudPlacement(placementRef, dragTargetRef, hudRef, target, frame.yaw, frame.pitch);
        return;
      }
      target.copy(fallbackOffset);
      const q = camera.quaternion;
      const sinYaw = 2 * (q.w * q.y + q.x * q.z);
      const cosYaw = 1 - 2 * (q.y * q.y + q.z * q.z);
      const yaw = Math.atan2(sinYaw, cosYaw);
      const cosValue = Math.cos(yaw);
      const sinValue = Math.sin(yaw);
      const rotatedX = target.x * cosValue - target.z * sinValue;
      const rotatedZ = target.x * sinValue + target.z * cosValue;
      target.set(rotatedX, target.y, rotatedZ);
      target.add(camera.position);
      setHudPlacement(placementRef, dragTargetRef, hudRef, target, yaw, 0);
    },
    [cameraRef, computeVolumeHudFrame, setHudPlacement],
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

  return {
    onRegisterVrSession,
    onVrSessionStarted,
    onVrSessionEnded,
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
    vrHandleQuaternionTempRef,
    vrHandleQuaternionTemp2Ref,
    sliderLocalPointRef,
    playbackStateRef,
    playbackLoopRef,
    vrHoverStateRef,
    vrChannelsStateRef,
    vrTracksStateRef,
    controllersRef,
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
  };
}
