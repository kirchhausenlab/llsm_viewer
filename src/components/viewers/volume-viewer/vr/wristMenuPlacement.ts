import * as THREE from 'three';

export const WRIST_MENU_GRIP_OFFSET = Object.freeze({
  x: 0,
  y: 0.055,
  z: 0.18,
});

export function applyWristMenuGripPlacement(group: THREE.Object3D): void {
  group.position.set(
    WRIST_MENU_GRIP_OFFSET.x,
    WRIST_MENU_GRIP_OFFSET.y,
    WRIST_MENU_GRIP_OFFSET.z,
  );
  // Leave the panel normal on grip +Z so the watch face stays upright in the watch pose.
  group.rotation.set(0, 0, 0);
}
