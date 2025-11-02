import { useRef } from 'react';
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

  const playbackPlacement = useRef<VrHudPlacement | null>(null);
  const channelsPlacement = useRef<VrHudPlacement | null>(null);
  const tracksPlacement = useRef<VrHudPlacement | null>(null);

  const playbackDragTarget = useRef(new THREE.Vector3());
  const channelsDragTarget = useRef(new THREE.Vector3());
  const tracksDragTarget = useRef(new THREE.Vector3());

  const plane = useRef(new THREE.Plane());
  const planePoint = useRef(new THREE.Vector3());
  const forward = useRef(new THREE.Vector3(0, 0, 1));
  const yawEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const yawQuaternion = useRef(new THREE.Quaternion());
  const yawVector = useRef(new THREE.Vector3());
  const pitchVector = useRef(new THREE.Vector3());
  const offset = useRef(new THREE.Vector3());
  const intersection = useRef(new THREE.Vector3());

  const channelsLocalPoint = useRef(new THREE.Vector3());
  const tracksLocalPoint = useRef(new THREE.Vector3());

  const handleWorldPoint = useRef(new THREE.Vector3());
  const handleSecondaryPoint = useRef(new THREE.Vector3());
  const handlePrimaryQuaternion = useRef(new THREE.Quaternion());
  const handleSecondaryQuaternion = useRef(new THREE.Quaternion());

  const hoverState = useRef({
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
  const channelsState = useRef<VrChannelsState>({ channels: [], activeChannelId: null });
  const tracksState = useRef<VrTracksState>({ channels: [], activeChannelId: null });

  const refs = useRef<VrHudRefs | null>(null);
  if (!refs.current) {
    refs.current = {
      playback,
      channels,
      tracks,
      placements: {
        playback: playbackPlacement,
        channels: channelsPlacement,
        tracks: tracksPlacement,
      },
      dragTargets: {
        playback: playbackDragTarget,
        channels: channelsDragTarget,
        tracks: tracksDragTarget,
      },
      plane,
      planePoint,
      forward,
      yaw: {
        euler: yawEuler,
        quaternion: yawQuaternion,
        vector: yawVector,
      },
      pitchVector,
      offset,
      intersection,
      localPoints: {
        channels: channelsLocalPoint,
        tracks: tracksLocalPoint,
      },
      handle: {
        world: handleWorldPoint,
        secondary: handleSecondaryPoint,
        quaternion: {
          primary: handlePrimaryQuaternion,
          secondary: handleSecondaryQuaternion,
        },
      },
      states: {
        hover: hoverState,
        channels: channelsState,
        tracks: tracksState,
      },
    };
  }

  return refs.current!;
}
