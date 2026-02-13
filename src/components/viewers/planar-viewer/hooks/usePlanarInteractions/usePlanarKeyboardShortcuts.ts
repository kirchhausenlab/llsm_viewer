import { useEffect } from 'react';
import { PAN_STEP, ROTATION_KEY_STEP } from '../usePlanarLayout';
import { clamp } from '../../utils';
import type { ViewState } from '../../types';

type UsePlanarKeyboardShortcutsParams = {
  clampedSliceIndex: number;
  effectiveMaxSlices: number;
  onSliceIndexChange: (index: number) => void;
  updateViewState: (updater: Partial<ViewState> | ((prev: ViewState) => ViewState)) => void;
};

export function usePlanarKeyboardShortcuts({
  clampedSliceIndex,
  effectiveMaxSlices,
  onSliceIndexChange,
  updateViewState
}: UsePlanarKeyboardShortcutsParams) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        return;
      }
      if (activeElement instanceof HTMLElement && activeElement.getAttribute('contenteditable') === 'true') {
        return;
      }

      switch (event.code) {
        case 'KeyW': {
          if (effectiveMaxSlices > 0) {
            const step = event.shiftKey ? 10 : 1;
            const nextIndex = clamp(
              clampedSliceIndex + step,
              0,
              Math.max(0, effectiveMaxSlices - 1)
            );
            if (nextIndex !== clampedSliceIndex) {
              onSliceIndexChange(nextIndex);
            }
            event.preventDefault();
          }
          break;
        }
        case 'KeyS': {
          if (effectiveMaxSlices > 0) {
            const step = event.shiftKey ? 10 : 1;
            const nextIndex = clamp(
              clampedSliceIndex - step,
              0,
              Math.max(0, effectiveMaxSlices - 1)
            );
            if (nextIndex !== clampedSliceIndex) {
              onSliceIndexChange(nextIndex);
            }
            event.preventDefault();
          }
          break;
        }
        case 'KeyA': {
          updateViewState((previous) => ({
            ...previous,
            offsetX: previous.offsetX + PAN_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'KeyD': {
          updateViewState((previous) => ({
            ...previous,
            offsetX: previous.offsetX - PAN_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'Space': {
          updateViewState((previous) => ({
            ...previous,
            offsetY: previous.offsetY + PAN_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'KeyC': {
          updateViewState((previous) => ({
            ...previous,
            offsetY: previous.offsetY - PAN_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'KeyQ': {
          updateViewState((previous) => ({
            ...previous,
            rotation: previous.rotation - ROTATION_KEY_STEP
          }));
          event.preventDefault();
          break;
        }
        case 'KeyE': {
          updateViewState((previous) => ({
            ...previous,
            rotation: previous.rotation + ROTATION_KEY_STEP
          }));
          event.preventDefault();
          break;
        }
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [clampedSliceIndex, effectiveMaxSlices, onSliceIndexChange, updateViewState]);
}
