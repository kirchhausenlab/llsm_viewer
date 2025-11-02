import { MutableRefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';

import type {
  MovementState,
  PointerState,
  TrackLineResource,
  VolumeResources,
  VolumeViewerVrProps,
} from '../VolumeViewer.types';
import type {
  ControllerEntry,
  RaycasterLike,
  VrChannelsHud,
  VrChannelsState,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksState,
} from './vr';

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
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  timeIndexRef: MutableRefObject<number>;
  controllersRef: MutableRefObject<ControllerEntry[]>;
  movementStateRef: MutableRefObject<MovementState>;
  pointerStateRef: MutableRefObject<PointerState | null>;
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  trackFollowOffsetRef: MutableRefObject<THREE.Vector3 | null>;
  raycasterRef: MutableRefObject<RaycasterLike | null>;
  xrSessionRef: MutableRefObject<XRSession | null>;
  sessionCleanupRef: MutableRefObject<(() => void) | null>;
  xrPreferredSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar'>;
  xrCurrentSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
  xrPendingModeSwitchRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
  hasActive3DLayerRef: MutableRefObject<boolean>;
  playbackStateDefaults: {
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
  };
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
};

export function useVolumeViewerVr({
  vrProps,
  rendererRef,
  cameraRef,
  sceneRef,
  volumeRootGroupRef,
  trackGroupRef,
  resourcesRef,
  timeIndexRef,
  controllersRef,
  movementStateRef,
  pointerStateRef,
  trackLinesRef,
  trackFollowOffsetRef,
  raycasterRef,
  xrSessionRef,
  sessionCleanupRef,
  xrPreferredSessionModeRef,
  xrCurrentSessionModeRef,
  xrPendingModeSwitchRef,
  hasActive3DLayerRef,
  playbackStateDefaults,
}: UseVolumeViewerVrParams): UseVolumeViewerVrResult {
  void rendererRef;
  void cameraRef;
  void sceneRef;
  void volumeRootGroupRef;
  void trackGroupRef;
  void resourcesRef;
  void timeIndexRef;
  void controllersRef;
  void movementStateRef;
  void pointerStateRef;
  void trackLinesRef;
  void trackFollowOffsetRef;
  void raycasterRef;
  void xrSessionRef;
  void sessionCleanupRef;
  void xrPreferredSessionModeRef;
  void xrCurrentSessionModeRef;
  void xrPendingModeSwitchRef;
  void hasActive3DLayerRef;

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
    isPlaying: playbackStateDefaults.isPlaying,
    playbackDisabled: playbackStateDefaults.playbackDisabled,
    playbackLabel: playbackStateDefaults.playbackLabel,
    fps: playbackStateDefaults.fps,
    timeIndex: playbackStateDefaults.timeIndex,
    totalTimepoints: playbackStateDefaults.totalTimepoints,
    onTogglePlayback: playbackStateDefaults.onTogglePlayback,
    onTimeIndexChange: playbackStateDefaults.onTimeIndexChange,
    onFpsChange: playbackStateDefaults.onFpsChange,
    passthroughSupported: playbackStateDefaults.passthroughSupported,
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
  };
}
