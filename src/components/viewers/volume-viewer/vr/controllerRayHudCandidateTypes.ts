import type { MutableRefObject } from 'react';
import type * as THREE from 'three';

import type {
  ControllerEntry,
  PlaybackState,
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrUiTarget,
} from './types';

export type PlaybackCandidate = {
  category: 'playback';
  target: VrUiTarget;
  point: THREE.Vector3;
  distance: number;
  region: null;
};

export type ChannelsCandidate = {
  category: 'channels';
  target: VrUiTarget;
  point: THREE.Vector3;
  distance: number;
  region: VrChannelsInteractiveRegion | null;
};

export type TracksCandidate = {
  category: 'tracks';
  target: VrUiTarget;
  point: THREE.Vector3;
  distance: number;
  region: VrTracksInteractiveRegion | null;
};

export type AnyCandidate = PlaybackCandidate | ChannelsCandidate | TracksCandidate;

export type ResolvePlaybackUiCandidateParams = {
  entry: ControllerEntry;
  playbackStateRef: MutableRefObject<PlaybackState>;
  playbackHudInstance: VrPlaybackHud | null;
  applyPlaybackSliderFromWorldPointRef: MutableRefObject<((worldPoint: THREE.Vector3) => void) | null>;
  applyFpsSliderFromWorldPointRef: MutableRefObject<((worldPoint: THREE.Vector3) => void) | null>;
  vrHudPlaneRef: MutableRefObject<THREE.Plane>;
  vrHudPlanePointRef: MutableRefObject<THREE.Vector3>;
  vrHudForwardRef: MutableRefObject<THREE.Vector3>;
  vrHandleWorldPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleSecondaryPointRef: MutableRefObject<THREE.Vector3>;
  playbackTouchPoint: THREE.Vector3;
  playbackLocalPoint: THREE.Vector3;
  playbackPlaneNormal: THREE.Vector3;
  playbackSliderPoint: THREE.Vector3;
  fpsSliderPoint: THREE.Vector3;
  playbackCandidatePoint: THREE.Vector3;
};

export type ResolveChannelsUiCandidateParams = {
  entry: ControllerEntry;
  channelsHudInstance: VrChannelsHud | null;
  resolveChannelsRegionFromPoint: (
    hud: VrChannelsHud,
    point: THREE.Vector3,
  ) => VrChannelsInteractiveRegion | null;
  applyVrChannelsSliderFromPointRef: MutableRefObject<
    ((region: VrChannelsInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  vrHudPlaneRef: MutableRefObject<THREE.Plane>;
  vrHudPlanePointRef: MutableRefObject<THREE.Vector3>;
  vrHudForwardRef: MutableRefObject<THREE.Vector3>;
  vrHandleWorldPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleSecondaryPointRef: MutableRefObject<THREE.Vector3>;
  vrChannelsLocalPointRef: MutableRefObject<THREE.Vector3>;
  channelsTouchPoint: THREE.Vector3;
  channelsCandidatePoint: THREE.Vector3;
};

export type ResolveTracksUiCandidateParams = {
  entry: ControllerEntry;
  tracksHudInstance: VrTracksHud | null;
  resolveTracksRegionFromPoint: (
    hud: VrTracksHud,
    point: THREE.Vector3,
  ) => VrTracksInteractiveRegion | null;
  applyVrTracksSliderFromPointRef: MutableRefObject<
    ((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  applyVrTracksScrollFromPointRef: MutableRefObject<
    ((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  vrHudPlaneRef: MutableRefObject<THREE.Plane>;
  vrHudPlanePointRef: MutableRefObject<THREE.Vector3>;
  vrHudForwardRef: MutableRefObject<THREE.Vector3>;
  vrHandleWorldPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleSecondaryPointRef: MutableRefObject<THREE.Vector3>;
  vrTracksLocalPointRef: MutableRefObject<THREE.Vector3>;
  tracksTouchPoint: THREE.Vector3;
  tracksCandidatePoint: THREE.Vector3;
};
