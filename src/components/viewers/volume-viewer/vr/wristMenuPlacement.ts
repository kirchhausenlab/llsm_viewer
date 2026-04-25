import * as THREE from 'three';

export const WRIST_MENU_GRIP_OFFSET = Object.freeze({
  x: 0,
  y: 0.055,
  z: 0.18,
});

function headDiagnosticToDefaultWorld(right: number, up: number, forward: number): THREE.Vector3 {
  return new THREE.Vector3(right, up, -forward).normalize();
}

const MEASURED_WATCH_GRIP_X_WORLD = headDiagnosticToDefaultWorld(-0.096, -0.984, -0.151);
const MEASURED_WATCH_GRIP_Y_WORLD_RAW = headDiagnosticToDefaultWorld(-0.965, 0.129, -0.230);
const MEASURED_WATCH_GRIP_Z_WORLD = new THREE.Vector3()
  .crossVectors(MEASURED_WATCH_GRIP_X_WORLD, MEASURED_WATCH_GRIP_Y_WORLD_RAW)
  .normalize();
const MEASURED_WATCH_GRIP_Y_WORLD = new THREE.Vector3()
  .crossVectors(MEASURED_WATCH_GRIP_Z_WORLD, MEASURED_WATCH_GRIP_X_WORLD)
  .normalize();

const DESIRED_WATCH_HUD_RIGHT_WORLD = new THREE.Vector3(1, 0, 0);
const DESIRED_WATCH_HUD_UP_WORLD = new THREE.Vector3(0, 1, 0);
const DESIRED_WATCH_HUD_FRONT_WORLD = new THREE.Vector3(0, 0, 1);

function worldDirectionToMeasuredGripLocal(direction: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(
    MEASURED_WATCH_GRIP_X_WORLD.dot(direction),
    MEASURED_WATCH_GRIP_Y_WORLD.dot(direction),
    MEASURED_WATCH_GRIP_Z_WORLD.dot(direction),
  ).normalize();
}

function createWristMenuGripQuaternion(): THREE.Quaternion {
  const front = worldDirectionToMeasuredGripLocal(DESIRED_WATCH_HUD_FRONT_WORLD);
  const upHint = worldDirectionToMeasuredGripLocal(DESIRED_WATCH_HUD_UP_WORLD);
  const right = new THREE.Vector3().crossVectors(upHint, front).normalize();
  const up = new THREE.Vector3().crossVectors(front, right).normalize();
  const rotation = new THREE.Matrix4().makeBasis(right, up, front);
  return new THREE.Quaternion().setFromRotationMatrix(rotation).normalize();
}

export const WRIST_MENU_GRIP_QUATERNION = createWristMenuGripQuaternion();

export function applyWristMenuGripPlacement(group: THREE.Object3D): void {
  group.position.set(
    WRIST_MENU_GRIP_OFFSET.x,
    WRIST_MENU_GRIP_OFFSET.y,
    WRIST_MENU_GRIP_OFFSET.z,
  );
  group.quaternion.copy(WRIST_MENU_GRIP_QUATERNION);
}
