import { MutableRefObject, useCallback } from 'react';
import type * as THREE from 'three';

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
  VrChannelsState,
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
  playbackStateRef: MutableRefObject<PlaybackState>;
  playbackLoopRef: MutableRefObject<PlaybackLoopState>;
  controllersRef: MutableRefObject<ControllerEntry[]>;
  movementStateRef: MutableRefObject<MovementState>;
  pointerStateRef: MutableRefObject<PointerState | null>;
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  trackFollowOffsetRef: MutableRefObject<THREE.Vector3 | null>;
  vrHoverStateRef: MutableRefObject<VrHoverState>;
  vrChannelsStateRef: MutableRefObject<VrChannelsState>;
  vrTracksStateRef: MutableRefObject<VrTracksState>;
  raycasterRef: MutableRefObject<RaycasterLike | null>;
  xrSessionRef: MutableRefObject<XRSession | null>;
  sessionCleanupRef: MutableRefObject<(() => void) | null>;
  xrPreferredSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar'>;
  xrCurrentSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
  xrPendingModeSwitchRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
};

export type UseVolumeViewerVrResult = {
  onRegisterVrSession: (
    handlers: Parameters<NonNullable<VolumeViewerVrProps['onRegisterVrSession']>>[0]
  ) => void;
  onVrSessionStarted: () => void;
  onVrSessionEnded: () => void;
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
  playbackStateRef,
  playbackLoopRef,
  controllersRef,
  movementStateRef,
  pointerStateRef,
  trackLinesRef,
  trackFollowOffsetRef,
  vrHoverStateRef,
  vrChannelsStateRef,
  vrTracksStateRef,
  raycasterRef,
  xrSessionRef,
  sessionCleanupRef,
  xrPreferredSessionModeRef,
  xrCurrentSessionModeRef,
  xrPendingModeSwitchRef,
}: UseVolumeViewerVrParams): UseVolumeViewerVrResult {
  void rendererRef;
  void cameraRef;
  void sceneRef;
  void volumeRootGroupRef;
  void trackGroupRef;
  void resourcesRef;
  void timeIndexRef;
  void playbackStateRef;
  void playbackLoopRef;
  void controllersRef;
  void movementStateRef;
  void pointerStateRef;
  void trackLinesRef;
  void trackFollowOffsetRef;
  void vrHoverStateRef;
  void vrChannelsStateRef;
  void vrTracksStateRef;
  void raycasterRef;
  void xrSessionRef;
  void sessionCleanupRef;
  void xrPreferredSessionModeRef;
  void xrCurrentSessionModeRef;
  void xrPendingModeSwitchRef;

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
  };
}
