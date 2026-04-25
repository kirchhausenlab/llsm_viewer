import type { MutableRefObject } from 'react';
import type * as THREE from 'three';

import type { VolumeViewerVrProps } from '../../VolumeViewer.types';
import { renderVrWristMenuHud } from './hudRenderersWristMenu';
import type { ControllerEntry } from './types';
import { createWristMenuPoseDiagnostic } from './wristMenuDiagnostics';

function isWristMenuController(entry: ControllerEntry, index: number): boolean {
  return entry.handedness === 'left' || (entry.handedness == null && index === 0);
}

export function handleControllerSqueezeStart(
  entry: ControllerEntry,
  index: number,
  deps: {
    vrPropsRef: MutableRefObject<VolumeViewerVrProps | null>;
    cameraRef?: MutableRefObject<THREE.PerspectiveCamera | null>;
    log: (...args: Parameters<typeof console.debug>) => void;
  },
) {
  if (!isWristMenuController(entry, index)) {
    return;
  }

  entry.wristMenuActive = true;
  entry.hoverUiTarget = null;
  entry.hasHoverUiPoint = false;
  let diagnostic: ReturnType<typeof createWristMenuPoseDiagnostic> | null = null;
  if (entry.wristMenuHud) {
    entry.wristMenuHud.hoverRegion = null;
    entry.wristMenuHud.group.visible = true;
    diagnostic = createWristMenuPoseDiagnostic(entry, index, deps.cameraRef?.current ?? null);
    entry.wristMenuHud.debugPoseDiagnostic = diagnostic;
    renderVrWristMenuHud(entry.wristMenuHud, deps.vrPropsRef.current?.menuActions ?? []);
  }
  deps.log(
    '[VR] wrist menu pose diagnostic',
    diagnostic,
  );
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
    entry.wristMenuHud.debugPoseDiagnostic = null;
  }
  entry.hoverUiTarget = null;
  entry.hasHoverUiPoint = false;
  deps.log('[VR] wrist menu hidden from squeeze', index);
}
