import type { MutableRefObject } from 'react';

import type { VolumeViewerVrProps } from '../../VolumeViewer.types';
import { renderVrWristMenuHud } from './hudRenderersWristMenu';
import type { ControllerEntry } from './types';

function isWristMenuController(entry: ControllerEntry, index: number): boolean {
  return entry.handedness === 'left' || (entry.handedness == null && index === 0);
}

export function handleControllerSqueezeStart(
  entry: ControllerEntry,
  index: number,
  deps: {
    vrPropsRef: MutableRefObject<VolumeViewerVrProps | null>;
    log: (...args: Parameters<typeof console.debug>) => void;
  },
) {
  if (!isWristMenuController(entry, index)) {
    return;
  }

  entry.wristMenuActive = true;
  entry.hoverUiTarget = null;
  entry.hasHoverUiPoint = false;
  if (entry.wristMenuHud) {
    entry.wristMenuHud.hoverRegion = null;
    renderVrWristMenuHud(entry.wristMenuHud, deps.vrPropsRef.current?.menuActions ?? []);
    entry.wristMenuHud.group.visible = true;
  }
  deps.log('[VR] wrist menu shown from squeeze', index);
}

export function handleControllerSqueezeEnd(
  entry: ControllerEntry,
  index: number,
  deps: {
    log: (...args: Parameters<typeof console.debug>) => void;
  },
) {
  if (!entry.wristMenuActive) {
    return;
  }

  entry.wristMenuActive = false;
  if (entry.wristMenuHud) {
    entry.wristMenuHud.group.visible = false;
    entry.wristMenuHud.hoverRegion = null;
  }
  entry.hoverUiTarget = null;
  entry.hasHoverUiPoint = false;
  deps.log('[VR] wrist menu hidden from squeeze', index);
}
