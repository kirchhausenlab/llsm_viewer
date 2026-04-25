import * as THREE from 'three';

import type {
  ControllerEntry,
  VrWristMenuDirectionSnapshot,
  VrWristMenuPoseDiagnostic,
  VrWristMenuVectorTuple,
} from './types';

type HeadBasis = {
  right: THREE.Vector3;
  up: THREE.Vector3;
  forward: THREE.Vector3;
};

const LOCAL_X = new THREE.Vector3(1, 0, 0);
const LOCAL_Y = new THREE.Vector3(0, 1, 0);
const LOCAL_Z = new THREE.Vector3(0, 0, 1);
const LOCAL_NEGATIVE_Z = new THREE.Vector3(0, 0, -1);

function round(value: number): number {
  return Number(value.toFixed(3));
}

function vectorTuple(vector: THREE.Vector3): VrWristMenuVectorTuple {
  return [round(vector.x), round(vector.y), round(vector.z)];
}

function positionSnapshot(object: THREE.Object3D, target: THREE.Vector3): VrWristMenuVectorTuple {
  object.getWorldPosition(target);
  return vectorTuple(target);
}

function directionSnapshot(
  direction: THREE.Vector3,
  headBasis: HeadBasis | null,
): VrWristMenuDirectionSnapshot {
  const snapshot: VrWristMenuDirectionSnapshot = {
    world: vectorTuple(direction),
  };
  if (headBasis) {
    snapshot.head = {
      right: round(direction.dot(headBasis.right)),
      up: round(direction.dot(headBasis.up)),
      forward: round(direction.dot(headBasis.forward)),
    };
  }
  return snapshot;
}

function worldDirection(
  object: THREE.Object3D,
  localDirection: THREE.Vector3,
  target: THREE.Vector3,
  quaternion: THREE.Quaternion,
): THREE.Vector3 {
  object.getWorldQuaternion(quaternion);
  return target.copy(localDirection).applyQuaternion(quaternion).normalize();
}

function createHeadBasis(camera: THREE.Camera | null, quaternion: THREE.Quaternion): HeadBasis | null {
  if (!camera) {
    return null;
  }
  camera.updateMatrixWorld(true);
  camera.getWorldQuaternion(quaternion);
  return {
    right: LOCAL_X.clone().applyQuaternion(quaternion).normalize(),
    up: LOCAL_Y.clone().applyQuaternion(quaternion).normalize(),
    forward: LOCAL_NEGATIVE_Z.clone().applyQuaternion(quaternion).normalize(),
  };
}

export function createWristMenuPoseDiagnostic(
  entry: ControllerEntry,
  index: number,
  camera: THREE.Camera | null,
): VrWristMenuPoseDiagnostic {
  entry.controller.parent?.updateMatrixWorld(true);
  entry.grip.parent?.updateMatrixWorld(true);
  entry.controller.updateMatrixWorld(true);
  entry.grip.updateMatrixWorld(true);
  entry.wristMenuHud?.group.updateMatrixWorld(true);

  const direction = new THREE.Vector3();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const headBasis = createHeadBasis(camera, quaternion);

  const gripDirection = (localDirection: THREE.Vector3) =>
    directionSnapshot(
      worldDirection(entry.grip, localDirection, direction, quaternion),
      headBasis,
    );
  const controllerDirection = (localDirection: THREE.Vector3) =>
    directionSnapshot(
      worldDirection(entry.controller, localDirection, direction, quaternion),
      headBasis,
    );
  const hudDirection = (localDirection: THREE.Vector3) =>
    entry.wristMenuHud
      ? directionSnapshot(
          worldDirection(entry.wristMenuHud.group, localDirection, direction, quaternion),
          headBasis,
        )
      : null;

  return {
    note:
      'Direction arrays are [x,y,z] in world space. head.forward is your gaze; a readable HUD front should be near head.forward = -1.',
    index,
    handedness: entry.handedness ?? null,
    positions: {
      grip: positionSnapshot(entry.grip, position),
      controller: positionSnapshot(entry.controller, position),
      hud: entry.wristMenuHud ? positionSnapshot(entry.wristMenuHud.group, position) : null,
    },
    controllerAxes: {
      rayMinusZ: controllerDirection(LOCAL_NEGATIVE_Z),
      plusX: controllerDirection(LOCAL_X),
      plusY: controllerDirection(LOCAL_Y),
      plusZ: controllerDirection(LOCAL_Z),
    },
    gripAxes: {
      plusX: gripDirection(LOCAL_X),
      plusY: gripDirection(LOCAL_Y),
      plusZ: gripDirection(LOCAL_Z),
      minusZ: gripDirection(LOCAL_NEGATIVE_Z),
    },
    hudAxes: {
      rightPlusX: hudDirection(LOCAL_X),
      upPlusY: hudDirection(LOCAL_Y),
      frontPlusZ: hudDirection(LOCAL_Z),
      backMinusZ: hudDirection(LOCAL_NEGATIVE_Z),
    },
    hudLocalTransform: entry.wristMenuHud
      ? {
          position: vectorTuple(entry.wristMenuHud.group.position),
          rotationXYZRadians: [
            round(entry.wristMenuHud.group.rotation.x),
            round(entry.wristMenuHud.group.rotation.y),
            round(entry.wristMenuHud.group.rotation.z),
          ] as VrWristMenuVectorTuple,
        }
      : null,
  };
}
