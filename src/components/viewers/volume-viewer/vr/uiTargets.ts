import type * as THREE from 'three';

import type { VrUiTarget, VrUiTargetType } from './types';

export function isVrUiTargetType(value: unknown): value is VrUiTargetType {
  if (typeof value !== 'string') {
    return false;
  }
  return (
    value.startsWith('playback-') ||
    value.startsWith('channels-') ||
    value.startsWith('tracks-') ||
    value.startsWith('volume-')
  );
}

export function isVrUiTargetDescriptor(value: unknown): value is { type: VrUiTargetType; data?: unknown } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const descriptor = value as { type?: unknown };
  return isVrUiTargetType(descriptor.type);
}

export function resolveVrUiTarget(object: THREE.Object3D | null): VrUiTarget | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const target = current.userData?.vrUiTarget;
    if (isVrUiTargetDescriptor(target)) {
      return { type: target.type, object: current, data: target.data };
    }
    current = current.parent ?? null;
  }
  return null;
}
