import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import type { VolumeViewerVrProps } from '../../VolumeViewer.types';
import type {
  PlaybackState,
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrChannelsState,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksState,
} from './types';

export type ControllerInputDependencies = {
  vrLogRef: MutableRefObject<((...args: Parameters<typeof console.debug>) => void) | null>;
  refreshControllerVisibilityRef: MutableRefObject<(() => void) | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  applyPlaybackSliderFromWorldPointRef: MutableRefObject<((worldPoint: THREE.Vector3) => void) | null>;
  applyFpsSliderFromWorldPointRef: MutableRefObject<((worldPoint: THREE.Vector3) => void) | null>;
  vrPlaybackHudRef: MutableRefObject<VrPlaybackHud | null>;
  vrPlaybackHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrPlaybackHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrChannelsHudRef: MutableRefObject<VrChannelsHud | null>;
  vrChannelsHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrChannelsHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrTracksHudRef: MutableRefObject<VrTracksHud | null>;
  vrTracksHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrTracksHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  applyVrChannelsSliderFromPointRef: MutableRefObject<
    ((region: VrChannelsInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  applyVrTracksSliderFromPointRef: MutableRefObject<
    ((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  applyVrTracksScrollFromPointRef: MutableRefObject<
    ((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  vrTranslationHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeScaleHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrHandleWorldPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleSecondaryPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleDirectionTempRef: MutableRefObject<THREE.Vector3>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  volumeRootCenterUnscaledRef: MutableRefObject<THREE.Vector3>;
  volumeUserScaleRef: MutableRefObject<number>;
  volumeYawRef: MutableRefObject<number>;
  volumePitchRef: MutableRefObject<number>;
  vrHudYawVectorRef: MutableRefObject<THREE.Vector3>;
  vrHudPitchVectorRef: MutableRefObject<THREE.Vector3>;
  onResetVolumeRef: MutableRefObject<(() => void) | null>;
  onResetHudPlacementRef: MutableRefObject<(() => void) | null>;
  endVrSessionRequestRef: MutableRefObject<(() => Promise<void> | void) | null>;
  toggleXrSessionMode: () => void;
  vrChannelsStateRef: MutableRefObject<VrChannelsState>;
  vrTracksStateRef: MutableRefObject<VrTracksState>;
  updateVrChannelsHudRef: MutableRefObject<(() => void) | null>;
  onTrackFollowRequestRef: MutableRefObject<((trackId: string) => void) | null>;
  vrPropsRef: MutableRefObject<VolumeViewerVrProps | null>;
  vrClearHoverStateRef: MutableRefObject<((source?: 'pointer' | 'controller') => void) | null>;
};
