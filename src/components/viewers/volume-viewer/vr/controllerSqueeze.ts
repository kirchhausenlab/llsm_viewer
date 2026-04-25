import type { MutableRefObject } from 'react';

import type { VolumeViewerVrProps } from '../../VolumeViewer.types';
import type { HoveredVoxelInfo } from '../../../../types/hover';
import { renderVrWristMenuHud } from './hudRenderersWristMenu';
import { renderVrWristStatusHud } from './hudRenderersWristStatus';
import type { ControllerEntry } from './types';

function isWristMenuController(entry: ControllerEntry, index: number): boolean {
  return entry.handedness === 'left' || (entry.handedness == null && index === 0);
}

function isWristStatusController(entry: ControllerEntry, index: number): boolean {
  return entry.handedness === 'right' || (entry.handedness == null && index === 1);
}

export function handleControllerSqueezeStart(
  entry: ControllerEntry,
  index: number,
  deps: {
    vrPropsRef: MutableRefObject<VolumeViewerVrProps | null>;
    hoverIntensityRef: MutableRefObject<HoveredVoxelInfo | null>;
    log: (...args: Parameters<typeof console.debug>) => void;
  },
) {
  if (isWristStatusController(entry, index)) {
    entry.wristStatusActive = true;
    entry.hoverUiTarget = null;
    entry.hasHoverUiPoint = false;
    if (entry.wristStatusHud) {
      entry.wristStatusHud.group.visible = true;
      entry.wristStatusHud.lastSignature = '';
      renderVrWristStatusHud(entry.wristStatusHud, deps.hoverIntensityRef.current);
    }
    deps.log('[VR] wrist status shown from squeeze', index);
    return;
  }

  if (!isWristMenuController(entry, index)) {
    return;
  }

  entry.wristMenuActive = true;
  entry.hoverUiTarget = null;
  entry.hasHoverUiPoint = false;
  if (entry.wristMenuHud) {
    entry.wristMenuHud.hoverRegion = null;
    entry.wristMenuHud.group.visible = true;
    renderVrWristMenuHud(entry.wristMenuHud, deps.vrPropsRef.current?.menuActions ?? []);
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
  if (entry.wristStatusActive) {
    entry.wristStatusActive = false;
    if (entry.wristStatusHud) {
      entry.wristStatusHud.group.visible = false;
    }
    entry.hoverUiTarget = null;
    entry.hasHoverUiPoint = false;
    deps.log('[VR] wrist status hidden from squeeze', index);
    return;
  }

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
