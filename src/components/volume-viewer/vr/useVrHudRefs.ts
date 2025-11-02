import { useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import type {
  VrChannelsHud,
  VrChannelsState,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksState,
} from './types';

export type VrHudRefs = {
  playback: MutableRefObject<VrPlaybackHud | null>;
  channels: MutableRefObject<VrChannelsHud | null>;
  tracks: MutableRefObject<VrTracksHud | null>;
  placements: {
    playback: MutableRefObject<VrHudPlacement | null>;
    channels: MutableRefObject<VrHudPlacement | null>;
    tracks: MutableRefObject<VrHudPlacement | null>;
  };
  dragTargets: {
    playback: MutableRefObject<THREE.Vector3>;
    channels: MutableRefObject<THREE.Vector3>;
    tracks: MutableRefObject<THREE.Vector3>;
  };
  plane: MutableRefObject<THREE.Plane>;
  planePoint: MutableRefObject<THREE.Vector3>;
  forward: MutableRefObject<THREE.Vector3>;
  yaw: {
    euler: MutableRefObject<THREE.Euler>;
    quaternion: MutableRefObject<THREE.Quaternion>;
    vector: MutableRefObject<THREE.Vector3>;
  };
  pitchVector: MutableRefObject<THREE.Vector3>;
  offset: MutableRefObject<THREE.Vector3>;
  intersection: MutableRefObject<THREE.Vector3>;
  localPoints: {
    channels: MutableRefObject<THREE.Vector3>;
    tracks: MutableRefObject<THREE.Vector3>;
  };
  handle: {
    world: MutableRefObject<THREE.Vector3>;
    secondary: MutableRefObject<THREE.Vector3>;
    quaternion: {
      primary: MutableRefObject<THREE.Quaternion>;
      secondary: MutableRefObject<THREE.Quaternion>;
    };
  };
  states: {
    hover: MutableRefObject<{
      play: boolean;
      playbackSlider: boolean;
      playbackSliderActive: boolean;
      fpsSlider: boolean;
      fpsSliderActive: boolean;
      resetVolume: boolean;
      resetHud: boolean;
      exit: boolean;
      mode: boolean;
    }>;
    channels: MutableRefObject<VrChannelsState>;
    tracks: MutableRefObject<VrTracksState>;
  };
};

export function useVrHudRefs(): VrHudRefs {
  const playback = useRef<VrPlaybackHud | null>(null);
  const channels = useRef<VrChannelsHud | null>(null);
  const tracks = useRef<VrTracksHud | null>(null);

  const placements = {
    playback: useRef<VrHudPlacement | null>(null),
    channels: useRef<VrHudPlacement | null>(null),
    tracks: useRef<VrHudPlacement | null>(null),
  } as const;

  const dragTargets = {
    playback: useRef(new THREE.Vector3()),
    channels: useRef(new THREE.Vector3()),
    tracks: useRef(new THREE.Vector3()),
  } as const;

  const plane = useRef(new THREE.Plane());
  const planePoint = useRef(new THREE.Vector3());
  const forward = useRef(new THREE.Vector3(0, 0, 1));
  const yaw = {
    euler: useRef(new THREE.Euler(0, 0, 0, 'YXZ')),
    quaternion: useRef(new THREE.Quaternion()),
    vector: useRef(new THREE.Vector3()),
  } as const;
  const pitchVector = useRef(new THREE.Vector3());
  const offset = useRef(new THREE.Vector3());
  const intersection = useRef(new THREE.Vector3());

  const localPoints = {
    channels: useRef(new THREE.Vector3()),
    tracks: useRef(new THREE.Vector3()),
  } as const;

  const handle = {
    world: useRef(new THREE.Vector3()),
    secondary: useRef(new THREE.Vector3()),
    quaternion: {
      primary: useRef(new THREE.Quaternion()),
      secondary: useRef(new THREE.Quaternion()),
    },
  } as const;

  const states = {
    hover: useRef({
      play: false,
      playbackSlider: false,
      playbackSliderActive: false,
      fpsSlider: false,
      fpsSliderActive: false,
      resetVolume: false,
      resetHud: false,
      exit: false,
      mode: false,
    }),
    channels: useRef<VrChannelsState>({ channels: [], activeChannelId: null }),
    tracks: useRef<VrTracksState>({ channels: [], activeChannelId: null }),
  } as const;

  return useMemo(
    () => ({
      playback,
      channels,
      tracks,
      placements,
      dragTargets,
      plane,
      planePoint,
      forward,
      yaw,
      pitchVector,
      offset,
      intersection,
      localPoints,
      handle,
      states,
    }),
    []
  );
}
