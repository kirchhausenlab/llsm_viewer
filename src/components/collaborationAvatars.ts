// @ts-nocheck
import * as THREE from 'three';

import type { ParticipantSnapshot } from '../collaboration/types';

const remoteHeadGeometry = new THREE.SphereGeometry(0.1, 20, 20);
const remoteHandGeometry = new THREE.SphereGeometry(0.05, 16, 16);

export function hashStringToHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const normalized = (hash >>> 0) / 0xffffffff;
  return normalized * 360;
}

export function createRemoteAvatar(displayName: string, color: number): THREE.Group {
  const group = new THREE.Group();
  group.name = `participant-${displayName}`;
  const material = new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.8 });
  const head = new THREE.Mesh(remoteHeadGeometry, material.clone());
  head.castShadow = false;
  head.receiveShadow = false;
  group.add(head);
  const left = new THREE.Mesh(remoteHandGeometry, material.clone());
  const right = new THREE.Mesh(remoteHandGeometry, material.clone());
  left.visible = false;
  right.visible = false;
  group.add(left);
  group.add(right);
  group.userData = { head, left, right, label: displayName };
  group.visible = false;
  return group;
}

export function applyParticipantPoseToAvatar(avatar: THREE.Group, participant: ParticipantSnapshot): void {
  const userData = avatar.userData as
    | {
        head?: THREE.Mesh | null;
        left?: THREE.Mesh | null;
        right?: THREE.Mesh | null;
      }
    | undefined;
  const head = userData?.head ?? null;
  const left = userData?.left ?? null;
  const right = userData?.right ?? null;

  const hasHead = Boolean(participant.head);
  const hasLeft = Boolean(participant.leftController);
  const hasRight = Boolean(participant.rightController);

  avatar.visible = hasHead || hasLeft || hasRight;

  if (head) {
    if (participant.head) {
      const [hx, hy, hz] = participant.head.position;
      const [qx, qy, qz, qw] = participant.head.quaternion;
      head.visible = true;
      head.position.set(hx, hy, hz);
      head.quaternion.set(qx, qy, qz, qw);
    } else {
      head.visible = false;
    }
  }

  if (left) {
    if (participant.leftController) {
      const [lx, ly, lz] = participant.leftController.position;
      const [lqx, lqy, lqz, lqw] = participant.leftController.quaternion;
      left.visible = true;
      left.position.set(lx, ly, lz);
      left.quaternion.set(lqx, lqy, lqz, lqw);
    } else {
      left.visible = false;
    }
  }

  if (right) {
    if (participant.rightController) {
      const [rx, ry, rz] = participant.rightController.position;
      const [rqx, rqy, rqz, rqw] = participant.rightController.quaternion;
      right.visible = true;
      right.position.set(rx, ry, rz);
      right.quaternion.set(rqx, rqy, rqz, rqw);
    } else {
      right.visible = false;
    }
  }
}

