import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import { VR_HUD_MIN_HEIGHT, VR_HUD_PLACEMENT_EPSILON } from './constants';
import type { VrHudRefs } from './useVrHudRefs';
import type {
  VrChannelsHud,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
} from './types';

export type VrHudPlacementHandlers = {
  constrainHudPlacementPosition: (target: THREE.Vector3) => void;
  getHudQuaternionFromAngles: (yaw: number, pitch: number) => THREE.Quaternion;
  updateHudGroupFromPlacement: (
    hud: VrPlaybackHud | VrChannelsHud | VrTracksHud | null,
    placement: VrHudPlacement | null
  ) => void;
  setVrPlaybackHudPlacementPosition: (nextPosition: THREE.Vector3) => void;
  setVrChannelsHudPlacementPosition: (nextPosition: THREE.Vector3) => void;
  setVrTracksHudPlacementPosition: (nextPosition: THREE.Vector3) => void;
  setVrPlaybackHudPlacementYaw: (nextYaw: number) => void;
  setVrChannelsHudPlacementYaw: (nextYaw: number) => void;
  setVrTracksHudPlacementYaw: (nextYaw: number) => void;
  setVrPlaybackHudPlacementPitch: (nextPitch: number) => void;
  setVrChannelsHudPlacementPitch: (nextPitch: number) => void;
  setVrTracksHudPlacementPitch: (nextPitch: number) => void;
  setHudPlacement: (
    placementRef: MutableRefObject<VrHudPlacement | null>,
    dragTargetRef: MutableRefObject<THREE.Vector3>,
    hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
    position: THREE.Vector3,
    yaw: number,
    pitch: number
  ) => void;
  refreshVrHudPlacements: () => void;
  setVrChannelsHudVisible: (visible: boolean) => void;
  setVrTracksHudVisible: (visible: boolean) => void;
};

export function useVrHudPlacement(hudRefs: VrHudRefs): VrHudPlacementHandlers {
  const constrainHudPlacementPosition = useCallback((target: THREE.Vector3) => {
    target.y = Math.max(target.y, VR_HUD_MIN_HEIGHT);
  }, []);

  const getHudQuaternionFromAngles = useCallback(
    (yaw: number, pitch: number) => {
      const yawQuaternion = hudRefs.yaw.quaternion.current;
      const yawEuler = hudRefs.yaw.euler.current;
      yawEuler.set(pitch, yaw, 0, 'YXZ');
      yawQuaternion.setFromEuler(yawEuler);
      return yawQuaternion;
    },
    [hudRefs]
  );

  const updateHudGroupFromPlacement = useCallback(
    (
      hud: VrPlaybackHud | VrChannelsHud | VrTracksHud | null,
      placement: VrHudPlacement | null
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
    [getHudQuaternionFromAngles]
  );

  const setVrPlaybackHudPlacementPosition = useCallback(
    (nextPosition: THREE.Vector3) => {
      const placement =
        hudRefs.placements.playback.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevX = placement.position.x;
      const prevY = placement.position.y;
      const prevZ = placement.position.z;
      placement.position.copy(nextPosition);
      constrainHudPlacementPosition(placement.position);
      const positionChanged =
        Math.abs(prevX - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevY - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevZ - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      hudRefs.placements.playback.current = placement;
      hudRefs.dragTargets.playback.current.copy(placement.position);
      if (positionChanged && hudRefs.playback.current) {
        hudRefs.playback.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hudRefs.playback.current, placement);
    },
    [
      constrainHudPlacementPosition,
      hudRefs,
      updateHudGroupFromPlacement,
    ]
  );

  const setVrChannelsHudPlacementPosition = useCallback(
    (nextPosition: THREE.Vector3) => {
      const placement =
        hudRefs.placements.channels.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevX = placement.position.x;
      const prevY = placement.position.y;
      const prevZ = placement.position.z;
      placement.position.copy(nextPosition);
      constrainHudPlacementPosition(placement.position);
      const positionChanged =
        Math.abs(prevX - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevY - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevZ - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      hudRefs.placements.channels.current = placement;
      hudRefs.dragTargets.channels.current.copy(placement.position);
      if (positionChanged && hudRefs.channels.current) {
        hudRefs.channels.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hudRefs.channels.current, placement);
    },
    [
      constrainHudPlacementPosition,
      hudRefs,
      updateHudGroupFromPlacement,
    ]
  );

  const setVrTracksHudPlacementPosition = useCallback(
    (nextPosition: THREE.Vector3) => {
      const placement =
        hudRefs.placements.tracks.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevX = placement.position.x;
      const prevY = placement.position.y;
      const prevZ = placement.position.z;
      placement.position.copy(nextPosition);
      constrainHudPlacementPosition(placement.position);
      const positionChanged =
        Math.abs(prevX - placement.position.x) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevY - placement.position.y) > VR_HUD_PLACEMENT_EPSILON ||
        Math.abs(prevZ - placement.position.z) > VR_HUD_PLACEMENT_EPSILON;
      hudRefs.placements.tracks.current = placement;
      hudRefs.dragTargets.tracks.current.copy(placement.position);
      if (positionChanged && hudRefs.tracks.current) {
        hudRefs.tracks.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hudRefs.tracks.current, placement);
    },
    [
      constrainHudPlacementPosition,
      hudRefs,
      updateHudGroupFromPlacement,
    ]
  );

  const setVrPlaybackHudPlacementYaw = useCallback(
    (nextYaw: number) => {
      const placement =
        hudRefs.placements.playback.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevYaw = placement.yaw;
      placement.yaw = nextYaw;
      const yawChanged = Math.abs(prevYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      hudRefs.placements.playback.current = placement;
      if (yawChanged && hudRefs.playback.current) {
        hudRefs.playback.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hudRefs.playback.current, placement);
    },
    [hudRefs, updateHudGroupFromPlacement]
  );

  const setVrChannelsHudPlacementYaw = useCallback(
    (nextYaw: number) => {
      const placement =
        hudRefs.placements.channels.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevYaw = placement.yaw;
      placement.yaw = nextYaw;
      const yawChanged = Math.abs(prevYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      hudRefs.placements.channels.current = placement;
      if (yawChanged && hudRefs.channels.current) {
        hudRefs.channels.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hudRefs.channels.current, placement);
    },
    [hudRefs, updateHudGroupFromPlacement]
  );

  const setVrTracksHudPlacementYaw = useCallback(
    (nextYaw: number) => {
      const placement =
        hudRefs.placements.tracks.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevYaw = placement.yaw;
      placement.yaw = nextYaw;
      const yawChanged = Math.abs(prevYaw - placement.yaw) > VR_HUD_PLACEMENT_EPSILON;
      hudRefs.placements.tracks.current = placement;
      if (yawChanged && hudRefs.tracks.current) {
        hudRefs.tracks.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hudRefs.tracks.current, placement);
    },
    [hudRefs, updateHudGroupFromPlacement]
  );

  const setVrPlaybackHudPlacementPitch = useCallback(
    (nextPitch: number) => {
      const placement =
        hudRefs.placements.playback.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevPitch = placement.pitch;
      placement.pitch = nextPitch;
      const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      hudRefs.placements.playback.current = placement;
      if (pitchChanged && hudRefs.playback.current) {
        hudRefs.playback.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hudRefs.playback.current, placement);
    },
    [hudRefs, updateHudGroupFromPlacement]
  );

  const setVrChannelsHudPlacementPitch = useCallback(
    (nextPitch: number) => {
      const placement =
        hudRefs.placements.channels.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevPitch = placement.pitch;
      placement.pitch = nextPitch;
      const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      hudRefs.placements.channels.current = placement;
      if (pitchChanged && hudRefs.channels.current) {
        hudRefs.channels.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hudRefs.channels.current, placement);
    },
    [hudRefs, updateHudGroupFromPlacement]
  );

  const setVrTracksHudPlacementPitch = useCallback(
    (nextPitch: number) => {
      const placement =
        hudRefs.placements.tracks.current ??
        ({ position: new THREE.Vector3(), yaw: 0, pitch: 0 } satisfies VrHudPlacement);
      const prevPitch = placement.pitch;
      placement.pitch = nextPitch;
      const pitchChanged = Math.abs(prevPitch - placement.pitch) > VR_HUD_PLACEMENT_EPSILON;
      hudRefs.placements.tracks.current = placement;
      if (pitchChanged && hudRefs.tracks.current) {
        hudRefs.tracks.current.cacheDirty = true;
      }
      updateHudGroupFromPlacement(hudRefs.tracks.current, placement);
    },
    [hudRefs, updateHudGroupFromPlacement]
  );

  const setHudPlacement = useCallback(
    (
      placementRef: MutableRefObject<VrHudPlacement | null>,
      dragTargetRef: MutableRefObject<THREE.Vector3>,
      hudRef: MutableRefObject<VrPlaybackHud | VrChannelsHud | VrTracksHud | null>,
      position: THREE.Vector3,
      yaw: number,
      pitch: number
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
    [constrainHudPlacementPosition, updateHudGroupFromPlacement]
  );

  const refreshVrHudPlacements = useCallback(() => {
    updateHudGroupFromPlacement(
      hudRefs.playback.current,
      hudRefs.placements.playback.current ?? null
    );
    updateHudGroupFromPlacement(
      hudRefs.channels.current,
      hudRefs.placements.channels.current ?? null
    );
    updateHudGroupFromPlacement(
      hudRefs.tracks.current,
      hudRefs.placements.tracks.current ?? null
    );
  }, [hudRefs, updateHudGroupFromPlacement]);

  const setVrChannelsHudVisible = useCallback(
    (visible: boolean) => {
      const hud = hudRefs.channels.current;
      if (!hud) {
        return;
      }
      hud.group.visible = visible;
      if (!visible) {
        hud.hoverRegion = null;
      }
    },
    [hudRefs]
  );

  const setVrTracksHudVisible = useCallback(
    (visible: boolean) => {
      const hud = hudRefs.tracks.current;
      if (!hud) {
        return;
      }
      hud.group.visible = visible;
      if (!visible) {
        hud.hoverRegion = null;
      }
    },
    [hudRefs]
  );

  return {
    constrainHudPlacementPosition,
    getHudQuaternionFromAngles,
    updateHudGroupFromPlacement,
    setVrPlaybackHudPlacementPosition,
    setVrChannelsHudPlacementPosition,
    setVrTracksHudPlacementPosition,
    setVrPlaybackHudPlacementYaw,
    setVrChannelsHudPlacementYaw,
    setVrTracksHudPlacementYaw,
    setVrPlaybackHudPlacementPitch,
    setVrChannelsHudPlacementPitch,
    setVrTracksHudPlacementPitch,
    setHudPlacement,
    refreshVrHudPlacements,
    setVrChannelsHudVisible,
    setVrTracksHudVisible,
  };
}
