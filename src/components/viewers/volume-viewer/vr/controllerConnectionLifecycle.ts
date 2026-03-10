import type { MutableRefObject } from 'react';

import type { ControllerEntry } from './types';

type ControllerConnectEvent = {
  data?: {
    targetRayMode?: string;
    gamepad?: Gamepad;
  };
};

type ControllerLog = (...args: Parameters<typeof console.debug>) => void;

export function handleControllerConnected(
  entry: ControllerEntry,
  index: number,
  event: ControllerConnectEvent | undefined,
  log: ControllerLog,
  refreshControllers: () => void,
) {
  entry.isConnected = true;
  entry.targetRayMode = event?.data?.targetRayMode ?? null;
  entry.gamepad = event?.data?.gamepad ?? null;
  entry.hoverTrackId = null;
  entry.hoverUiTarget = null;
  entry.activeUiTarget = null;
  entry.hasHoverUiPoint = false;
  entry.hudGrabOffsets.playback = null;
  entry.hudGrabOffsets.channels = null;
  entry.hudGrabOffsets.tracks = null;
  entry.translateGrabOffset = null;
  entry.scaleGrabOffset = null;
  entry.volumeScaleState = null;
  entry.volumeRotationState = null;
  entry.hudRotationState = null;
  entry.rayLength = 3;
  log('[VR] controller connected', index, {
    targetRayMode: entry.targetRayMode,
    hasGamepad: Boolean(entry.gamepad),
  });
  refreshControllers();
}

export function handleControllerDisconnected(
  entry: ControllerEntry,
  index: number,
  log: ControllerLog,
  refreshControllers: () => void,
  vrClearHoverStateRef: MutableRefObject<((source?: 'pointer' | 'controller') => void) | null>,
) {
  entry.isConnected = false;
  entry.targetRayMode = null;
  entry.gamepad = null;
  entry.hoverTrackId = null;
  entry.hoverUiTarget = null;
  entry.activeUiTarget = null;
  entry.hasHoverUiPoint = false;
  entry.rayLength = 3;
  entry.isSelecting = false;
  entry.ray.scale.set(1, 1, entry.rayLength);
  entry.hudGrabOffsets.playback = null;
  entry.hudGrabOffsets.channels = null;
  entry.hudGrabOffsets.tracks = null;
  entry.translateGrabOffset = null;
  entry.scaleGrabOffset = null;
  entry.volumeScaleState = null;
  entry.volumeRotationState = null;
  entry.hudRotationState = null;
  entry.touchIndicator.visible = false;
  log('[VR] controller disconnected', index);
  refreshControllers();
  vrClearHoverStateRef.current?.('controller');
}
