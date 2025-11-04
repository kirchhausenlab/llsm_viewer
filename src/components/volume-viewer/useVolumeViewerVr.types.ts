import type { MutableRefObject } from 'react';
import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

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
} from './vr';

export type UseVolumeViewerVrParams = {
  vrProps?: VolumeViewerVrProps | null;
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
  updateHoverState: (
    trackId: string | null,
    position: { x: number; y: number } | null,
    source?: 'pointer' | 'controller'
  ) => void;
  clearHoverState: (source?: 'pointer' | 'controller') => void;
  onResetVolume: () => void;
  onResetHudPlacement: () => void;
  onTrackFollowRequest: (trackId: string) => void;
  vrLog: (...args: Parameters<typeof console.debug>) => void;
  onAfterSessionEnd?: () => void;
};

export type UseVolumeViewerVrResult = {
  callOnRegisterVrSession: (
    handlers:
      | {
          requestSession: () => Promise<XRSession | null>;
          endSession: () => Promise<void> | void;
        }
      | null,
  ) => void;
  callOnVrSessionStarted: () => void;
  callOnVrSessionEnded: () => void;
  requestVrSession: () => Promise<XRSession>;
  endVrSession: () => Promise<void>;
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
  vrHandleDirectionTempRef: MutableRefObject<THREE.Vector3>;
  vrHandleQuaternionTempRef: MutableRefObject<THREE.Quaternion>;
  vrHandleQuaternionTemp2Ref: MutableRefObject<THREE.Quaternion>;
  sliderLocalPointRef: MutableRefObject<THREE.Vector3>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  playbackLoopRef: MutableRefObject<PlaybackLoopState>;
  vrHoverStateRef: MutableRefObject<VrHoverState>;
  vrChannelsStateRef: MutableRefObject<VrChannelsState>;
  vrTracksStateRef: MutableRefObject<VrTracksState>;
  controllersRef: MutableRefObject<ControllerEntry[]>;
  setControllerVisibility: (shouldShow: boolean) => void;
  refreshControllerVisibility: () => void;
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
  toggleXrSessionMode: () => void;
  setVrPlaybackHudPlacementPosition: (nextPosition: THREE.Vector3) => void;
  setVrChannelsHudPlacementPosition: (nextPosition: THREE.Vector3) => void;
  setVrTracksHudPlacementPosition: (nextPosition: THREE.Vector3) => void;
  setVrPlaybackHudPlacementYaw: (nextYaw: number) => void;
  setVrChannelsHudPlacementYaw: (nextYaw: number) => void;
  setVrTracksHudPlacementYaw: (nextYaw: number) => void;
  setVrPlaybackHudPlacementPitch: (nextPitch: number) => void;
  setVrChannelsHudPlacementPitch: (nextPitch: number) => void;
  setVrTracksHudPlacementPitch: (nextPitch: number) => void;
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
  resolveChannelsRegionFromPoint: (
    hud: VrChannelsHud,
    worldPoint: THREE.Vector3,
  ) => VrChannelsInteractiveRegion | null;
  resolveTracksRegionFromPoint: (
    hud: VrTracksHud,
    worldPoint: THREE.Vector3,
  ) => VrTracksInteractiveRegion | null;
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
  computeVolumeHudFrame: () => VolumeHudFrame | null;
  resetVrPlaybackHudPlacement: () => void;
  resetVrChannelsHudPlacement: () => void;
  resetVrTracksHudPlacement: () => void;
  applyVolumeRootTransform: (
    dimensions: { width: number; height: number; depth: number } | null,
  ) => void;
  applyVolumeStepScaleToResources: (stepScale: number) => void;
  applyVrFoveation: (target?: number) => void;
  restoreVrFoveation: () => void;
  onRendererInitialized: () => void;
  endVrSessionRequestRef: MutableRefObject<(() => Promise<void> | void) | null>;
  updateControllerRays: () => void;
};

export type VolumeHandleCandidate = { target: VrUiTarget; point: THREE.Vector3; distance: number };
