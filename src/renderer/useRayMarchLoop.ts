// @ts-nocheck
import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { TrackLineResource } from './useTrackOverlay';
import type { VolumeResources } from './types';

export type MovementState = {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  moveUp: boolean;
  moveDown: boolean;
};

type PlaybackLoopState = { lastTimestamp: number | null; accumulator: number };

type PlaybackState = {
  isPlaying: boolean;
  playbackDisabled: boolean;
  playbackLabel: string;
  fps: number;
  timeIndex: number;
  totalTimepoints: number;
  onTimeIndexChange?: (nextIndex: number) => void;
};

type HoverState = { playbackSliderActive: boolean } & Record<string, unknown>;

type ControllerSummary = { hoverTrackId: string | null } & Record<string, unknown>;

export type UseRayMarchLoopParams = {
  renderer: THREE.WebGLRenderer | null;
  controls: OrbitControls | null;
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  movementStateRef: MutableRefObject<MovementState>;
  followedTrackIdRef: MutableRefObject<string | null>;
  trackFollowOffsetRef: MutableRefObject<THREE.Vector3 | null>;
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  resourcesRef: MutableRefObject<Map<string, VolumeResources>>;
  playbackLoopRef: MutableRefObject<PlaybackLoopState>;
  playbackStateRef: MutableRefObject<PlaybackState & Record<string, unknown>>;
  vrHoverStateRef: MutableRefObject<HoverState>;
  controllersRef: MutableRefObject<ControllerSummary[]>;
  timeIndexRef: MutableRefObject<number>;
  updateVrPlaybackHud: () => void;
  refreshVrHudPlacements: () => void;
  updateControllerRays: () => void;
  vrLog: (...args: unknown[]) => void;
  playbackFpsLimits: { min: number; max: number };
  trackBlinkSettings: { periodMs: number; base: number; range: number };
  revision?: number;
  onEarlyTerminationChange?: (enabled: boolean) => void;
  updateTrackOverlayDrawRanges?: (timeIndex: number) => void;
  updateTrackOverlayState?: () => void;
};

export type RayMarchLoopControls = {
  startLoop: () => void;
  stopLoop: () => void;
  setEarlyRayTerminationEnabled: (enabled: boolean) => void;
};

export function useRayMarchLoop({
  renderer,
  controls,
  scene,
  camera,
  rotationTargetRef,
  movementStateRef,
  followedTrackIdRef,
  trackFollowOffsetRef,
  trackLinesRef,
  resourcesRef,
  playbackLoopRef,
  playbackStateRef,
  vrHoverStateRef,
  controllersRef,
  timeIndexRef,
  updateVrPlaybackHud,
  refreshVrHudPlacements,
  updateControllerRays,
  vrLog,
  playbackFpsLimits,
  trackBlinkSettings,
  revision,
  onEarlyTerminationChange,
  updateTrackOverlayDrawRanges,
  updateTrackOverlayState
}: UseRayMarchLoopParams): RayMarchLoopControls {
  const renderLoopRef = useRef<((timestamp: number) => void) | null>(null);
  const earlyTerminationEnabledRef = useRef(true);

  useEffect(() => {
    if (!renderer || !controls || !scene || !camera) {
      if (renderer) {
        renderer.setAnimationLoop(null);
      }
      renderLoopRef.current = null;
      return;
    }

    let disposed = false;

    const worldUp = new THREE.Vector3(0, 1, 0);
    const forwardVector = new THREE.Vector3();
    const horizontalForward = new THREE.Vector3();
    const rightVector = new THREE.Vector3();
    const movementVector = new THREE.Vector3();

    const applyKeyboardMovement = () => {
      if (renderer.xr.isPresenting) {
        return;
      }
      if (followedTrackIdRef.current !== null) {
        return;
      }
      const movementState = movementStateRef.current;
      if (
        !movementState ||
        (!movementState.moveForward &&
          !movementState.moveBackward &&
          !movementState.moveLeft &&
          !movementState.moveRight &&
          !movementState.moveUp &&
          !movementState.moveDown)
      ) {
        return;
      }

      const rotationTarget = rotationTargetRef.current;
      const distance = rotationTarget.distanceTo(camera.position);
      const movementScale = Math.max(distance * 0.0025, 0.0006);

      camera.getWorldDirection(forwardVector).normalize();
      horizontalForward.copy(forwardVector).projectOnPlane(worldUp);
      if (horizontalForward.lengthSq() < 1e-8) {
        horizontalForward.set(0, 0, forwardVector.z >= 0 ? 1 : -1);
      } else {
        horizontalForward.normalize();
      }

      rightVector.crossVectors(horizontalForward, worldUp);
      if (rightVector.lengthSq() < 1e-8) {
        rightVector.set(1, 0, 0);
      } else {
        rightVector.normalize();
      }

      movementVector.set(0, 0, 0);

      if (movementState.moveForward) {
        movementVector.addScaledVector(horizontalForward, movementScale);
      }
      if (movementState.moveBackward) {
        movementVector.addScaledVector(horizontalForward, -movementScale);
      }
      if (movementState.moveLeft) {
        movementVector.addScaledVector(rightVector, -movementScale);
      }
      if (movementState.moveRight) {
        movementVector.addScaledVector(rightVector, movementScale);
      }
      if (movementState.moveUp) {
        movementVector.addScaledVector(worldUp, movementScale);
      }
      if (movementState.moveDown) {
        movementVector.addScaledVector(worldUp, -movementScale);
      }

      if (movementVector.lengthSq() === 0) {
        return;
      }

      camera.position.add(movementVector);
      rotationTarget.add(movementVector);
      controls.target.copy(rotationTarget);
    };

    let lastRenderTickSummary: { presenting: boolean; hoveredByController: string | null } | null =
      null;

    const renderLoop = (timestamp: number) => {
      if (disposed) {
        return;
      }

      applyKeyboardMovement();
      updateTrackOverlayState?.();
      controls.update();

      const { periodMs, base, range } = trackBlinkSettings;
      const blinkPhase = (timestamp % periodMs) / periodMs;
      const blinkScale = base + range * Math.sin(blinkPhase * Math.PI * 2);

      for (const resource of trackLinesRef.current.values()) {
        const { line, outline, material, outlineMaterial, baseColor, highlightColor } = resource;
        const shouldShow = resource.shouldShow;
        if (line.visible !== shouldShow) {
          line.visible = shouldShow;
        }
        const isHighlighted = resource.isFollowed || resource.isHovered || resource.isSelected;
        const outlineVisible = shouldShow && isHighlighted;
        if (outline.visible !== outlineVisible) {
          outline.visible = outlineVisible;
        }

        if (resource.needsAppearanceUpdate) {
          const targetColor = isHighlighted ? highlightColor : baseColor;
          if (!material.color.equals(targetColor)) {
            material.color.copy(targetColor);
            material.needsUpdate = true;
          }
        }

        const blinkMultiplier = resource.isSelected ? blinkScale : 1;
        const targetOpacity = resource.targetOpacity * blinkMultiplier;
        if (material.opacity !== targetOpacity) {
          material.opacity = targetOpacity;
          material.needsUpdate = true;
        }

        if (material.linewidth !== resource.targetLineWidth) {
          material.linewidth = resource.targetLineWidth;
          material.needsUpdate = true;
        }

        const outlineBlinkMultiplier = resource.isSelected ? blinkScale : 1;
        const targetOutlineOpacity = resource.outlineBaseOpacity * outlineBlinkMultiplier;
        if (outlineMaterial.opacity !== targetOutlineOpacity) {
          outlineMaterial.opacity = targetOutlineOpacity;
          outlineMaterial.needsUpdate = true;
        }

        const outlineWidth = resource.targetLineWidth + resource.outlineExtraWidth;
        if (outlineMaterial.linewidth !== outlineWidth) {
          outlineMaterial.linewidth = outlineWidth;
          outlineMaterial.needsUpdate = true;
        }

        if (resource.needsAppearanceUpdate) {
          resource.needsAppearanceUpdate = false;
        }
      }

      if (followedTrackIdRef.current !== null) {
        const rotationTarget = rotationTargetRef.current;
        if (rotationTarget) {
          if (!trackFollowOffsetRef.current) {
            trackFollowOffsetRef.current = new THREE.Vector3();
          }
          trackFollowOffsetRef.current.copy(camera.position).sub(rotationTarget);
        }
      }

      const resources = resourcesRef.current;
      for (const resource of resources.values()) {
        const { mesh } = resource;
        mesh.updateMatrixWorld();
      }

      const playbackLoopState = playbackLoopRef.current;
      const playbackState = playbackStateRef.current;
      const playbackSliderActive = vrHoverStateRef.current.playbackSliderActive;
      const shouldAdvancePlayback =
        playbackState.isPlaying &&
        !playbackState.playbackDisabled &&
        playbackState.totalTimepoints > 1 &&
        !playbackSliderActive &&
        typeof playbackState.onTimeIndexChange === 'function';

      if (shouldAdvancePlayback) {
        const minFps = playbackFpsLimits.min;
        const maxFps = playbackFpsLimits.max;
        const requestedFps = playbackState.fps ?? minFps;
        const clampedFps = Math.min(Math.max(requestedFps, minFps), maxFps);
        const frameDuration = clampedFps > 0 ? 1000 / clampedFps : 0;

        if (frameDuration > 0) {
          if (playbackLoopState.lastTimestamp === null) {
            playbackLoopState.lastTimestamp = timestamp;
            playbackLoopState.accumulator = 0;
          } else {
            const delta = Math.max(0, Math.min(timestamp - playbackLoopState.lastTimestamp, 1000));
            playbackLoopState.accumulator += delta;
            playbackLoopState.lastTimestamp = timestamp;

            const maxIndex = Math.max(0, playbackState.totalTimepoints - 1);
            let didAdvance = false;

            while (playbackLoopState.accumulator >= frameDuration) {
              playbackLoopState.accumulator -= frameDuration;
              let nextIndex = playbackState.timeIndex + 1;
              if (nextIndex > maxIndex) {
                nextIndex = 0;
              }
              if (nextIndex === playbackState.timeIndex) {
                break;
              }

              playbackState.timeIndex = nextIndex;
              timeIndexRef.current = nextIndex;
              updateTrackOverlayDrawRanges?.(nextIndex);

              const total = Math.max(0, playbackState.totalTimepoints);
              const labelCurrent = total > 0 ? Math.min(nextIndex + 1, total) : 0;
              playbackState.playbackLabel = `${labelCurrent} / ${total}`;
              playbackState.onTimeIndexChange?.(nextIndex);
              didAdvance = true;
            }

            if (didAdvance) {
              updateVrPlaybackHud();
            }
          }
        }
      } else {
        playbackLoopState.lastTimestamp = null;
        playbackLoopState.accumulator = 0;
      }

      refreshVrHudPlacements();

      updateControllerRays();
      const hoveredEntry = controllersRef.current.find((entry) => entry.hoverTrackId);
      const renderSummary = {
        presenting: renderer.xr.isPresenting,
        hoveredByController: hoveredEntry?.hoverTrackId ?? null
      };
      if (
        !lastRenderTickSummary ||
        renderSummary.presenting !== lastRenderTickSummary.presenting ||
        renderSummary.hoveredByController !== lastRenderTickSummary.hoveredByController
      ) {
        vrLog('[VR] render tick', renderSummary);
      }
      lastRenderTickSummary = renderSummary;
      renderer.render(scene, camera);
    };

    renderLoopRef.current = renderLoop;
    renderer.setAnimationLoop(renderLoop);

    return () => {
      disposed = true;
      if (renderLoopRef.current === renderLoop) {
        renderLoopRef.current = null;
      }
      renderer.setAnimationLoop(null);
    };
  }, [
    renderer,
    controls,
    scene,
    camera,
    followedTrackIdRef,
    movementStateRef,
    playbackFpsLimits.max,
    playbackFpsLimits.min,
    refreshVrHudPlacements,
    trackBlinkSettings.base,
    trackBlinkSettings.periodMs,
    trackBlinkSettings.range,
    updateControllerRays,
    updateTrackOverlayDrawRanges,
    updateTrackOverlayState,
    updateVrPlaybackHud,
    vrLog,
    revision
  ]);

  const startLoop = useCallback(() => {
    if (renderer && renderLoopRef.current) {
      renderer.setAnimationLoop(renderLoopRef.current);
    }
  }, [renderer]);

  const stopLoop = useCallback(() => {
    if (renderer) {
      renderer.setAnimationLoop(null);
    }
  }, [renderer]);

  const setEarlyRayTerminationEnabled = useCallback(
    (enabled: boolean) => {
      if (earlyTerminationEnabledRef.current === enabled) {
        return;
      }
      earlyTerminationEnabledRef.current = enabled;
      onEarlyTerminationChange?.(enabled);
    },
    [onEarlyTerminationChange]
  );

  return { startLoop, stopLoop, setEarlyRayTerminationEnabled };
}
