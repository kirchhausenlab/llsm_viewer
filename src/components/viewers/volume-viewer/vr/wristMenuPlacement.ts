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
  // In the watch pose, grip +Z is the controller's bottom/magazine direction.
  // Face the panel back toward the viewer while keeping grip +Y as the panel up axis.
  group.rotation.set(0, Math.PI, 0);
}
