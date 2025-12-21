import type { MutableRefObject } from 'react';
import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import type {
  MovementState,
  TrackLineResource,
  VolumeResources,
  VolumeViewerVrChannelPanel,
  VolumeViewerVrProps,
} from '../VolumeViewer.types';
import type { TrackColorMode, TrackDefinition } from '../../../types/tracks';
import type {
  ControllerEntry,
  RaycasterLike,
  VrChannelsHud,
  PlaybackLoopState,
  PlaybackState,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
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
  volumeAnisotropyScaleRef: MutableRefObject<{ x: number; y: number; z: number }>;
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
  trackOpacityByTrackSet: Record<string, number>;
  trackLineWidthByTrackSet: Record<string, number>;
  trackColorModesByTrackSet: Record<string, TrackColorMode>;
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
  requestVrSession: () => Promise<XRSession>;
  endVrSession: () => Promise<void>;
  vrPlaybackHudRef: MutableRefObject<VrPlaybackHud | null>;
  vrChannelsHudRef: MutableRefObject<VrChannelsHud | null>;
  vrTracksHudRef: MutableRefObject<VrTracksHud | null>;
  vrPlaybackHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrChannelsHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrTracksHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrTranslationHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeScaleHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeYawHandlesRef: MutableRefObject<THREE.Mesh[]>;
  vrVolumePitchHandleRef: MutableRefObject<THREE.Mesh | null>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  playbackLoopRef: MutableRefObject<PlaybackLoopState>;
  vrHoverStateRef: MutableRefObject<VrHoverState>;
  controllersRef: MutableRefObject<ControllerEntry[]>;
  setControllerVisibility: (shouldShow: boolean) => void;
  raycasterRef: MutableRefObject<RaycasterLike | null>;
  xrSessionRef: MutableRefObject<XRSession | null>;
  sessionCleanupRef: MutableRefObject<(() => void) | null>;
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
  createVrPlaybackHud: () => VrPlaybackHud | null;
  createVrChannelsHud: () => VrChannelsHud | null;
  createVrTracksHud: () => VrTracksHud | null;
  updateVrChannelsHud: () => void;
  updateVrTracksHud: () => void;
  updateVolumeHandles: () => void;
  updateHudGroupFromPlacement: (
    hud: VrPlaybackHud | VrChannelsHud | VrTracksHud | null,
    placement: VrHudPlacement | null,
  ) => void;
  resetVrPlaybackHudPlacement: () => void;
  resetVrChannelsHudPlacement: () => void;
  resetVrTracksHudPlacement: () => void;
  applyVolumeRootTransform: (
    dimensions: { width: number; height: number; depth: number } | null,
  ) => void;
  applyVolumeStepScaleToResources: (stepScale: number) => void;
  restoreVrFoveation: () => void;
  onRendererInitialized: () => void;
  endVrSessionRequestRef: MutableRefObject<(() => Promise<void> | void) | null>;
  updateControllerRays: () => void;
};

export type VolumeHandleCandidate = { target: VrUiTarget; point: THREE.Vector3; distance: number };
