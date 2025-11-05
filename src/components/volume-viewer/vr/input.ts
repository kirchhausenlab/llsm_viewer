import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';

import type { TrackLineResource, VolumeViewerVrProps } from '../../VolumeViewer.types';
import { computeViewerYawBasis, computeYawAngleForBasis } from './viewerYaw';
import { getHudCategoryFromTarget } from './hudTargets';
import type {
  ControllerEntry,
  PlaybackState,
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrChannelsState,
  VrHudPlacement,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksState,
  VrUiTarget,
  VrUiTargetType,
} from './types';
import type { VolumeHandleCandidate } from '../useVolumeViewerVr.types';
import {
  VR_PLAYBACK_PANEL_HEIGHT,
  VR_PLAYBACK_PANEL_WIDTH,
  VR_UI_TOUCH_DISTANCE,
  VR_UI_TOUCH_SURFACE_MARGIN,
  VR_VOLUME_MAX_SCALE,
  VR_VOLUME_MIN_SCALE,
} from './constants';

export type ControllerEntryConfigurator = (entry: ControllerEntry, index: number) => void;

export type ControllerInputDependencies = {
  vrLogRef: MutableRefObject<((...args: Parameters<typeof console.debug>) => void) | null>;
  refreshControllerVisibilityRef: MutableRefObject<(() => void) | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  applyPlaybackSliderFromWorldPointRef: MutableRefObject<((worldPoint: THREE.Vector3) => void) | null>;
  applyFpsSliderFromWorldPointRef: MutableRefObject<((worldPoint: THREE.Vector3) => void) | null>;
  vrPlaybackHudRef: MutableRefObject<VrPlaybackHud | null>;
  vrPlaybackHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrPlaybackHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrChannelsHudRef: MutableRefObject<VrChannelsHud | null>;
  vrChannelsHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrChannelsHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrTracksHudRef: MutableRefObject<VrTracksHud | null>;
  vrTracksHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrTracksHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  applyVrChannelsSliderFromPointRef: MutableRefObject<
    ((region: VrChannelsInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  applyVrTracksSliderFromPointRef: MutableRefObject<
    ((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  applyVrTracksScrollFromPointRef: MutableRefObject<
    ((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  vrTranslationHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeScaleHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrHandleWorldPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleSecondaryPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleDirectionTempRef: MutableRefObject<THREE.Vector3>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  volumeRootCenterUnscaledRef: MutableRefObject<THREE.Vector3>;
  volumeUserScaleRef: MutableRefObject<number>;
  volumeYawRef: MutableRefObject<number>;
  volumePitchRef: MutableRefObject<number>;
  vrHudYawVectorRef: MutableRefObject<THREE.Vector3>;
  vrHudPitchVectorRef: MutableRefObject<THREE.Vector3>;
  onResetVolumeRef: MutableRefObject<(() => void) | null>;
  onResetHudPlacementRef: MutableRefObject<(() => void) | null>;
  endVrSessionRequestRef: MutableRefObject<(() => Promise<void> | void) | null>;
  toggleXrSessionMode: () => void;
  vrChannelsStateRef: MutableRefObject<VrChannelsState>;
  vrTracksStateRef: MutableRefObject<VrTracksState>;
  updateVrChannelsHudRef: MutableRefObject<(() => void) | null>;
  onTrackFollowRequestRef: MutableRefObject<((trackId: string) => void) | null>;
  vrPropsRef: MutableRefObject<VolumeViewerVrProps | null>;
  vrClearHoverStateRef: MutableRefObject<((source?: 'pointer' | 'controller') => void) | null>;
};

export function createControllerEntryConfigurator(
  deps: ControllerInputDependencies,
): ControllerEntryConfigurator {
  const {
    vrLogRef,
    refreshControllerVisibilityRef,
    rendererRef,
    cameraRef,
    playbackStateRef,
    applyPlaybackSliderFromWorldPointRef,
    applyFpsSliderFromWorldPointRef,
    vrPlaybackHudRef,
    vrPlaybackHudPlacementRef,
    vrPlaybackHudDragTargetRef,
    vrChannelsHudRef,
    vrChannelsHudPlacementRef,
    vrChannelsHudDragTargetRef,
    vrTracksHudRef,
    vrTracksHudPlacementRef,
    vrTracksHudDragTargetRef,
    applyVrChannelsSliderFromPointRef,
    applyVrTracksSliderFromPointRef,
    applyVrTracksScrollFromPointRef,
    vrTranslationHandleRef,
    vrVolumeScaleHandleRef,
    vrHandleWorldPointRef,
    vrHandleSecondaryPointRef,
    vrHandleDirectionTempRef,
    volumeRootGroupRef,
    volumeRootCenterUnscaledRef,
    volumeUserScaleRef,
    volumeYawRef,
    volumePitchRef,
    vrHudYawVectorRef,
    vrHudPitchVectorRef,
    onResetVolumeRef,
    onResetHudPlacementRef,
    endVrSessionRequestRef,
    toggleXrSessionMode,
    vrChannelsStateRef,
    vrTracksStateRef,
    updateVrChannelsHudRef,
    onTrackFollowRequestRef,
    vrPropsRef,
    vrClearHoverStateRef,
  } = deps;

  return (entry, index) => {
    const log = (...args: Parameters<typeof console.debug>) => {
      vrLogRef.current?.(...args);
    };
    const refreshControllers = () => {
      refreshControllerVisibilityRef.current?.();
    };

    entry.onConnected = (event) => {
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
    };

    entry.onDisconnected = () => {
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
    };

    entry.onSelectStart = () => {
      entry.isSelecting = true;
      entry.activeUiTarget = entry.hoverUiTarget;
      entry.hudRotationState = null;
      entry.volumeRotationState = null;
      const activeType = entry.activeUiTarget?.type ?? null;
      const hudCategory = getHudCategoryFromTarget(activeType);
      const rendererInstance = rendererRef.current;
      const camera = cameraRef.current;
      if (
        activeType === 'playback-panel-yaw' ||
        activeType === 'channels-panel-yaw' ||
        activeType === 'tracks-panel-yaw' ||
        activeType === 'playback-panel-pitch' ||
        activeType === 'channels-panel-pitch' ||
        activeType === 'tracks-panel-pitch'
      ) {
        let placement: VrHudPlacement | null = null;
        if (activeType === 'playback-panel-yaw' || activeType === 'playback-panel-pitch') {
          placement = vrPlaybackHudPlacementRef.current;
        } else if (activeType === 'channels-panel-yaw' || activeType === 'channels-panel-pitch') {
          placement = vrChannelsHudPlacementRef.current;
        } else if (activeType === 'tracks-panel-yaw' || activeType === 'tracks-panel-pitch') {
          placement = vrTracksHudPlacementRef.current;
        }
        if (placement && hudCategory) {
          if (
            activeType === 'playback-panel-yaw' ||
            activeType === 'channels-panel-yaw' ||
            activeType === 'tracks-panel-yaw'
          ) {
            const yawVector = vrHudYawVectorRef.current;
            yawVector.copy(entry.rayOrigin).sub(placement.position);
            yawVector.y = 0;
            let initialAngle = placement.yaw;
            const yawBasisForward = new THREE.Vector3();
            const yawBasisRight = new THREE.Vector3();
            computeViewerYawBasis(rendererInstance, camera, yawBasisForward, yawBasisRight);
            if (yawVector.lengthSq() > 1e-6) {
              initialAngle = computeYawAngleForBasis(
                yawVector,
                yawBasisForward,
                yawBasisRight,
              );
            }
            entry.hudRotationState = {
              hud: hudCategory,
              mode: 'yaw',
              initialYaw: placement.yaw,
              initialAngle,
              basisForward: yawBasisForward,
              basisRight: yawBasisRight,
            };
          } else {
            const pitchVector = vrHudPitchVectorRef.current;
            pitchVector.copy(entry.rayOrigin).sub(placement.position);
            pitchVector.x = 0;
            let initialAngle = placement.pitch ?? 0;
            const pitchBasisForward = new THREE.Vector3();
            const pitchBasisRight = new THREE.Vector3();
            computeViewerYawBasis(rendererInstance, camera, pitchBasisForward, pitchBasisRight);
            if (pitchVector.lengthSq() > 1e-6) {
              const forwardComponent = pitchVector.dot(pitchBasisForward);
              initialAngle = Math.atan2(pitchVector.y, forwardComponent);
            }
            entry.hudRotationState = {
              hud: hudCategory,
              mode: 'pitch',
              initialPitch: placement.pitch ?? 0,
              initialAngle,
              basisForward: pitchBasisForward,
            };
          }
        } else {
          entry.activeUiTarget = null;
        }
      }
      const playbackState = playbackStateRef.current;
      if (entry.activeUiTarget?.type === 'playback-play-toggle' && playbackState.playbackDisabled) {
        entry.activeUiTarget = null;
      }
      if (
        entry.activeUiTarget?.type === 'playback-slider' &&
        entry.hasHoverUiPoint &&
        !playbackState.playbackDisabled
      ) {
        applyPlaybackSliderFromWorldPointRef.current?.(entry.hoverUiPoint);
      }
      if (
        entry.activeUiTarget?.type === 'playback-fps-slider' &&
        entry.hasHoverUiPoint &&
        playbackState.totalTimepoints > 1
      ) {
        applyFpsSliderFromWorldPointRef.current?.(entry.hoverUiPoint);
      }
      if (entry.activeUiTarget?.type === 'playback-panel-grab') {
        const hud = vrPlaybackHudRef.current;
        if (hud) {
          const placement = vrPlaybackHudPlacementRef.current;
          const referencePosition = vrPlaybackHudDragTargetRef.current;
          referencePosition.copy(placement?.position ?? hud.group.position);
          if (!entry.hasHoverUiPoint) {
            entry.hoverUiPoint.copy(referencePosition);
            entry.hasHoverUiPoint = true;
          }
          if (!entry.hudGrabOffsets.playback) {
            entry.hudGrabOffsets.playback = new THREE.Vector3();
          }
          entry.hudGrabOffsets.playback.copy(referencePosition).sub(entry.rayOrigin);
        }
      }
      if (
        entry.activeUiTarget?.type === 'channels-slider' &&
        entry.hasHoverUiPoint &&
        entry.activeUiTarget.data &&
        !(entry.activeUiTarget.data as VrChannelsInteractiveRegion).disabled
      ) {
        applyVrChannelsSliderFromPointRef.current?.(
          entry.activeUiTarget.data as VrChannelsInteractiveRegion,
          entry.hoverUiPoint,
        );
      }
      if (entry.activeUiTarget?.type === 'channels-panel-grab') {
        const hud = vrChannelsHudRef.current;
        if (hud) {
          const placement = vrChannelsHudPlacementRef.current;
          const referencePosition = vrChannelsHudDragTargetRef.current;
          referencePosition.copy(placement?.position ?? hud.group.position);
          if (!entry.hasHoverUiPoint) {
            entry.hoverUiPoint.copy(referencePosition);
            entry.hasHoverUiPoint = true;
          }
          if (!entry.hudGrabOffsets.channels) {
            entry.hudGrabOffsets.channels = new THREE.Vector3();
          }
          entry.hudGrabOffsets.channels.copy(referencePosition).sub(entry.rayOrigin);
        }
      }
      if (
        entry.activeUiTarget &&
        (entry.activeUiTarget.type === 'tracks-slider' || entry.activeUiTarget.type === 'tracks-scroll') &&
        entry.hasHoverUiPoint &&
        entry.activeUiTarget.data &&
        !(entry.activeUiTarget.data as VrTracksInteractiveRegion).disabled
      ) {
        const region = entry.activeUiTarget.data as VrTracksInteractiveRegion;
        if (entry.activeUiTarget.type === 'tracks-slider') {
          applyVrTracksSliderFromPointRef.current?.(region, entry.hoverUiPoint);
        } else {
          applyVrTracksScrollFromPointRef.current?.(region, entry.hoverUiPoint);
        }
      }
      if (entry.activeUiTarget?.type === 'tracks-panel-grab') {
        const hud = vrTracksHudRef.current;
        if (hud) {
          const placement = vrTracksHudPlacementRef.current;
          const referencePosition = vrTracksHudDragTargetRef.current;
          referencePosition.copy(placement?.position ?? hud.group.position);
          if (!entry.hasHoverUiPoint) {
            entry.hoverUiPoint.copy(referencePosition);
            entry.hasHoverUiPoint = true;
          }
          if (!entry.hudGrabOffsets.tracks) {
            entry.hudGrabOffsets.tracks = new THREE.Vector3();
          }
          entry.hudGrabOffsets.tracks.copy(referencePosition).sub(entry.rayOrigin);
        }
      }
      if (entry.activeUiTarget?.type === 'volume-translate-handle') {
        const handle = vrTranslationHandleRef.current;
        if (handle) {
          handle.getWorldPosition(vrHandleWorldPointRef.current);
          if (!entry.translateGrabOffset) {
            entry.translateGrabOffset = new THREE.Vector3();
          }
          entry.translateGrabOffset.copy(vrHandleWorldPointRef.current).sub(entry.rayOrigin);
        }
      } else if (entry.activeUiTarget?.type === 'volume-scale-handle') {
        const handle = vrVolumeScaleHandleRef.current;
        const volumeRootGroup = volumeRootGroupRef.current;
        if (handle && volumeRootGroup) {
          handle.getWorldPosition(vrHandleWorldPointRef.current);
          if (!entry.scaleGrabOffset) {
            entry.scaleGrabOffset = new THREE.Vector3();
          }
          entry.scaleGrabOffset.copy(vrHandleWorldPointRef.current).sub(entry.rayOrigin);
          vrHandleSecondaryPointRef.current.copy(volumeRootCenterUnscaledRef.current);
          volumeRootGroup.localToWorld(vrHandleSecondaryPointRef.current);
          vrHandleDirectionTempRef.current
            .copy(vrHandleWorldPointRef.current)
            .sub(vrHandleSecondaryPointRef.current);
          const directionLength = vrHandleDirectionTempRef.current.length();
          if (directionLength > 1e-6) {
            vrHandleDirectionTempRef.current.divideScalar(directionLength);
            const userScale = Math.max(volumeUserScaleRef.current, 1e-6);
            const baseLength = directionLength / userScale;
            entry.volumeScaleState = {
              direction: vrHandleDirectionTempRef.current.clone(),
              baseLength,
            };
          } else {
            entry.volumeScaleState = null;
            entry.activeUiTarget = null;
          }
        } else {
          entry.volumeScaleState = null;
          entry.activeUiTarget = null;
        }
      }
      if (
        entry.activeUiTarget?.type === 'volume-yaw-handle' ||
        entry.activeUiTarget?.type === 'volume-pitch-handle'
      ) {
        const volumeRootGroup = volumeRootGroupRef.current;
        if (volumeRootGroup) {
          vrHandleSecondaryPointRef.current.copy(volumeRootCenterUnscaledRef.current);
          volumeRootGroup.localToWorld(vrHandleSecondaryPointRef.current);
          vrHandleDirectionTempRef.current.copy(entry.rayOrigin).sub(vrHandleSecondaryPointRef.current);
          if (entry.activeUiTarget.type === 'volume-yaw-handle') {
            vrHandleDirectionTempRef.current.y = 0;
            let initialAngle = volumeYawRef.current;
            const yawBasisForward = new THREE.Vector3();
            const yawBasisRight = new THREE.Vector3();
            computeViewerYawBasis(rendererInstance, camera, yawBasisForward, yawBasisRight);
            if (vrHandleDirectionTempRef.current.lengthSq() > 1e-6) {
              initialAngle = computeYawAngleForBasis(
                vrHandleDirectionTempRef.current,
                yawBasisForward,
                yawBasisRight,
              );
            }
            entry.volumeRotationState = {
              mode: 'yaw',
              initialYaw: volumeYawRef.current,
              initialAngle,
              basisForward: yawBasisForward,
              basisRight: yawBasisRight,
            };
          } else {
            vrHandleDirectionTempRef.current.x = 0;
            let initialAngle = volumePitchRef.current;
            const pitchBasisForward = new THREE.Vector3();
            const pitchBasisRight = new THREE.Vector3();
            computeViewerYawBasis(rendererInstance, camera, pitchBasisForward, pitchBasisRight);
            if (vrHandleDirectionTempRef.current.lengthSq() > 1e-6) {
              const forwardComponent = vrHandleDirectionTempRef.current.dot(pitchBasisForward);
              initialAngle = Math.atan2(vrHandleDirectionTempRef.current.y, forwardComponent);
            }
            entry.volumeRotationState = {
              mode: 'pitch',
              initialPitch: volumePitchRef.current,
              initialAngle,
              basisForward: pitchBasisForward,
            };
          }
        } else {
          entry.activeUiTarget = null;
        }
      }
      log('[VR] selectstart', index, {
        hoverTrackId: entry.hoverTrackId,
        uiTarget: entry.activeUiTarget?.type ?? null,
      });
    };

    entry.onSelectEnd = () => {
      entry.isSelecting = false;
      const activeTarget = entry.activeUiTarget;
      entry.activeUiTarget = null;
      const playbackState = playbackStateRef.current;
      const vrCallbacks = vrPropsRef.current;
      if (activeTarget?.type === 'playback-play-toggle') {
        if (!playbackState.playbackDisabled) {
          playbackState.onTogglePlayback?.();
        }
      } else if (activeTarget?.type === 'playback-reset-volume') {
        onResetVolumeRef.current?.();
      } else if (activeTarget?.type === 'playback-reset-hud') {
        onResetHudPlacementRef.current?.();
      } else if (activeTarget?.type === 'playback-exit-vr') {
        void endVrSessionRequestRef.current?.();
      } else if (activeTarget?.type === 'playback-toggle-mode') {
        toggleXrSessionMode();
      } else if (activeTarget?.type === 'playback-slider') {
        if (entry.hasHoverUiPoint && !playbackState.playbackDisabled) {
          applyPlaybackSliderFromWorldPointRef.current?.(entry.hoverUiPoint);
        }
      } else if (activeTarget?.type === 'playback-fps-slider') {
        if (entry.hasHoverUiPoint && playbackState.totalTimepoints > 1) {
          applyFpsSliderFromWorldPointRef.current?.(entry.hoverUiPoint);
        }
      } else if (activeTarget?.type === 'playback-panel-grab') {
        entry.hudGrabOffsets.playback = null;
        entry.hudRotationState = null;
      } else if (
        activeTarget?.type === 'playback-panel-yaw' ||
        activeTarget?.type === 'playback-panel-pitch'
      ) {
        entry.hudRotationState = null;
      } else if (activeTarget?.type === 'channels-panel-grab') {
        entry.hudGrabOffsets.channels = null;
        entry.hudRotationState = null;
      } else if (
        activeTarget?.type === 'channels-panel-yaw' ||
        activeTarget?.type === 'channels-panel-pitch'
      ) {
        entry.hudRotationState = null;
      } else if (activeTarget?.type === 'channels-reset' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        vrCallbacks?.onChannelReset?.(region.channelId);
      } else if (
        activeTarget?.type === 'channels-slider' &&
        activeTarget.data &&
        !(activeTarget.data as VrChannelsInteractiveRegion).disabled &&
        entry.hasHoverUiPoint
      ) {
        applyVrChannelsSliderFromPointRef.current?.(
          activeTarget.data as VrChannelsInteractiveRegion,
          entry.hoverUiPoint,
        );
      } else if (activeTarget?.type === 'channels-tab' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        vrCallbacks?.onChannelPanelSelect?.(region.channelId);
        const state = vrChannelsStateRef.current;
        if (state.activeChannelId !== region.channelId) {
          state.activeChannelId = region.channelId;
          updateVrChannelsHudRef.current?.();
        }
      } else if (activeTarget?.type === 'channels-visibility' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        if (!region.disabled) {
          vrCallbacks?.onChannelVisibilityToggle?.(region.channelId);
        }
      } else if (activeTarget?.type === 'channels-layer' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        if (region.layerKey) {
          vrCallbacks?.onLayerSelect?.(region.layerKey);
        }
      } else if (activeTarget?.type === 'channels-solo' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        if (!region.disabled && region.layerKey) {
          vrCallbacks?.onLayerSoloToggle?.(region.layerKey);
        }
      } else if (activeTarget?.type === 'channels-invert' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        if (!region.disabled && region.layerKey) {
          vrCallbacks?.onLayerInvertToggle?.(region.layerKey);
        }
      } else if (activeTarget?.type === 'channels-auto-contrast' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        if (!region.disabled && region.layerKey) {
          vrCallbacks?.onLayerAutoContrast?.(region.layerKey);
        }
      } else if (activeTarget?.type === 'tracks-panel-grab') {
        entry.hudGrabOffsets.tracks = null;
        entry.hudRotationState = null;
      } else if (
        activeTarget?.type === 'tracks-panel-yaw' ||
        activeTarget?.type === 'tracks-panel-pitch'
      ) {
        entry.hudRotationState = null;
      } else if (activeTarget?.type === 'tracks-tab' && activeTarget.data) {
        const region = activeTarget.data as VrTracksInteractiveRegion;
        vrCallbacks?.onTrackChannelSelect?.(region.channelId);
      } else if (activeTarget?.type === 'tracks-stop-follow' && activeTarget.data) {
        const region = activeTarget.data as VrTracksInteractiveRegion;
        if (!region.disabled) {
          vrCallbacks?.onStopTrackFollow?.(region.channelId);
        }
      } else if (activeTarget?.type === 'tracks-color' && activeTarget.data) {
        const region = activeTarget.data as VrTracksInteractiveRegion;
        if (!region.disabled && region.color) {
          vrCallbacks?.onTrackColorSelect?.(region.channelId, region.color);
        }
      } else if (activeTarget?.type === 'tracks-color-mode' && activeTarget.data) {
        const region = activeTarget.data as VrTracksInteractiveRegion;
        if (!region.disabled) {
          vrCallbacks?.onTrackColorReset?.(region.channelId);
        }
      } else if (activeTarget?.type === 'tracks-master-toggle' && activeTarget.data) {
        const region = activeTarget.data as VrTracksInteractiveRegion;
        if (!region.disabled) {
          const channelState = vrTracksStateRef.current.channels.find(
            (channel) => channel.id === region.channelId,
          );
          if (channelState) {
            const trackCount = channelState.tracks.length;
            const enableAll = trackCount > 0 && channelState.visibleTracks < trackCount;
            vrCallbacks?.onTrackVisibilityAllChange?.(region.channelId, enableAll);
          }
        }
      } else if (activeTarget?.type === 'tracks-toggle' && activeTarget.data) {
        const region = activeTarget.data as VrTracksInteractiveRegion;
        if (region.trackId) {
          vrCallbacks?.onTrackVisibilityToggle?.(region.trackId);
        }
      } else if (activeTarget?.type === 'tracks-follow' && activeTarget.data) {
        const region = activeTarget.data as VrTracksInteractiveRegion;
        if (region.trackId) {
          onTrackFollowRequestRef.current?.(region.trackId);
        }
      } else if (entry.hoverTrackId) {
        onTrackFollowRequestRef.current?.(entry.hoverTrackId);
      }
      log('[VR] selectend', index, {
        hoverTrackId: entry.hoverTrackId,
        uiTarget: activeTarget?.type ?? null,
      });
    };
  };
}



export type ControllerRayDependencies = {
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  containerRef: MutableRefObject<HTMLElement | null>;
  controllersRef: MutableRefObject<ControllerEntry[]>;
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  vrLogRef: MutableRefObject<((...args: Parameters<typeof console.debug>) => void) | null>;
  lastControllerRaySummaryRef: MutableRefObject<
    | {
        presenting: boolean;
        visibleLines: number;
        hoverTrackIds: Array<string | null>;
      }
    | null
  >;
  applyVrPlaybackHoverState: (
    playHovered: boolean,
    playbackSliderHovered: boolean,
    playbackSliderActive: boolean,
    fpsSliderHovered: boolean,
    fpsSliderActive: boolean,
    resetVolumeHovered: boolean,
    resetHudHovered: boolean,
    exitHovered: boolean,
    modeHovered: boolean,
  ) => void;
  applyVolumeYawPitch: (yaw: number, pitch: number) => void;
  resolveChannelsRegionFromPoint: (
    hud: VrChannelsHud,
    point: THREE.Vector3,
  ) => VrChannelsInteractiveRegion | null;
  resolveTracksRegionFromPoint: (
    hud: VrTracksHud,
    point: THREE.Vector3,
  ) => VrTracksInteractiveRegion | null;
  setVrPlaybackHudPlacementPosition: (position: THREE.Vector3) => void;
  setVrChannelsHudPlacementPosition: (position: THREE.Vector3) => void;
  setVrTracksHudPlacementPosition: (position: THREE.Vector3) => void;
  setVrPlaybackHudPlacementYaw: (yaw: number) => void;
  setVrChannelsHudPlacementYaw: (yaw: number) => void;
  setVrTracksHudPlacementYaw: (yaw: number) => void;
  setVrPlaybackHudPlacementPitch: (pitch: number) => void;
  setVrChannelsHudPlacementPitch: (pitch: number) => void;
  setVrTracksHudPlacementPitch: (pitch: number) => void;
  applyPlaybackSliderFromWorldPointRef: MutableRefObject<
    ((worldPoint: THREE.Vector3) => void) | null
  >;
  applyFpsSliderFromWorldPointRef: MutableRefObject<((worldPoint: THREE.Vector3) => void) | null>;
  vrPlaybackHudRef: MutableRefObject<VrPlaybackHud | null>;
  vrPlaybackHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrPlaybackHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrChannelsHudRef: MutableRefObject<VrChannelsHud | null>;
  vrChannelsHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrChannelsHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  vrTracksHudRef: MutableRefObject<VrTracksHud | null>;
  vrTracksHudPlacementRef: MutableRefObject<VrHudPlacement | null>;
  vrTracksHudDragTargetRef: MutableRefObject<THREE.Vector3>;
  applyVrChannelsSliderFromPointRef: MutableRefObject<
    ((region: VrChannelsInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  applyVrTracksSliderFromPointRef: MutableRefObject<
    ((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  applyVrTracksScrollFromPointRef: MutableRefObject<
    ((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  vrTranslationHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeScaleHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrVolumeYawHandlesRef: MutableRefObject<THREE.Mesh[]>;
  vrVolumePitchHandleRef: MutableRefObject<THREE.Mesh | null>;
  vrHandleWorldPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleSecondaryPointRef: MutableRefObject<THREE.Vector3>;
  vrHudYawVectorRef: MutableRefObject<THREE.Vector3>;
  vrHudPitchVectorRef: MutableRefObject<THREE.Vector3>;
  vrHudForwardRef: MutableRefObject<THREE.Vector3>;
  vrHudPlaneRef: MutableRefObject<THREE.Plane>;
  vrHudPlanePointRef: MutableRefObject<THREE.Vector3>;
  vrChannelsLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrTracksLocalPointRef: MutableRefObject<THREE.Vector3>;
  renderVrChannelsHudRef: MutableRefObject<
    ((hud: VrChannelsHud, state: VrChannelsState) => void) | null
  >;
  renderVrTracksHudRef: MutableRefObject<
    ((hud: VrTracksHud, state: VrTracksState) => void) | null
  >;
  vrChannelsStateRef: MutableRefObject<VrChannelsState>;
  vrTracksStateRef: MutableRefObject<VrTracksState>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  volumeRootCenterUnscaledRef: MutableRefObject<THREE.Vector3>;
  volumeRootBaseOffsetRef: MutableRefObject<THREE.Vector3>;
  volumeNormalizationScaleRef: MutableRefObject<number>;
  volumeUserScaleRef: MutableRefObject<number>;
  volumeYawRef: MutableRefObject<number>;
  volumePitchRef: MutableRefObject<number>;
  vrUpdateHoverStateRef: MutableRefObject<
    ((trackId: string | null, position: { x: number; y: number } | null, source?: 'pointer' | 'controller') => void) | null
  >;
  vrClearHoverStateRef: MutableRefObject<((source?: 'pointer' | 'controller') => void) | null>;
};


export function createControllerRayUpdater(
  deps: ControllerRayDependencies,
): () => void {
  const {
    rendererRef,
    cameraRef,
    containerRef,
    controllersRef,
    trackGroupRef,
    trackLinesRef,
    playbackStateRef,
    vrLogRef,
    lastControllerRaySummaryRef,
    applyVrPlaybackHoverState,
    applyVolumeYawPitch,
    resolveChannelsRegionFromPoint,
    resolveTracksRegionFromPoint,
    setVrPlaybackHudPlacementPosition,
    setVrChannelsHudPlacementPosition,
    setVrTracksHudPlacementPosition,
    setVrPlaybackHudPlacementYaw,
    setVrChannelsHudPlacementYaw,
    setVrTracksHudPlacementYaw,
    setVrPlaybackHudPlacementPitch,
    setVrChannelsHudPlacementPitch,
    setVrTracksHudPlacementPitch,
    applyPlaybackSliderFromWorldPointRef,
    applyFpsSliderFromWorldPointRef,
    vrPlaybackHudRef,
    vrPlaybackHudPlacementRef,
    vrPlaybackHudDragTargetRef,
    vrChannelsHudRef,
    vrChannelsHudPlacementRef,
    vrChannelsHudDragTargetRef,
    vrTracksHudRef,
    vrTracksHudPlacementRef,
    vrTracksHudDragTargetRef,
    applyVrChannelsSliderFromPointRef,
    applyVrTracksSliderFromPointRef,
    applyVrTracksScrollFromPointRef,
    vrTranslationHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
    vrVolumePitchHandleRef,
    vrHandleWorldPointRef,
    vrHandleSecondaryPointRef,
    vrHudYawVectorRef,
    vrHudPitchVectorRef,
    vrHudForwardRef,
    vrHudPlaneRef,
    vrHudPlanePointRef,
    vrChannelsLocalPointRef,
    vrTracksLocalPointRef,
    renderVrChannelsHudRef,
    renderVrTracksHudRef,
    vrChannelsStateRef,
    vrTracksStateRef,
    volumeRootGroupRef,
    volumeRootCenterUnscaledRef,
    volumeRootBaseOffsetRef,
    volumeNormalizationScaleRef,
    volumeUserScaleRef,
    volumeYawRef,
    volumePitchRef,
    vrUpdateHoverStateRef,
    vrClearHoverStateRef,
  } = deps;

  const controllerTempMatrix = new THREE.Matrix4();
  const controllerProjectedPoint = new THREE.Vector3();
  const playbackTouchPoint = new THREE.Vector3();
  const playbackLocalPoint = new THREE.Vector3();
  const playbackPlaneNormal = new THREE.Vector3();
  const playbackSliderPoint = new THREE.Vector3();
  const fpsSliderPoint = new THREE.Vector3();
  const channelsTouchPoint = new THREE.Vector3();
  const tracksTouchPoint = new THREE.Vector3();
  const translationHandleWorldPoint = new THREE.Vector3();
  const rotationCenterWorldPoint = new THREE.Vector3();
  const rotationDirectionTemp = new THREE.Vector3();
  const rotationHandleWorldPoint = new THREE.Vector3();
  const scaleHandleWorldPoint = new THREE.Vector3();
  const scaleDirectionTemp = new THREE.Vector3();
  const scaleTargetWorldPoint = new THREE.Vector3();

  return () => {
    const renderer = rendererRef.current;
    if (!renderer) {
      return;
    }
    const log = vrLogRef.current;
    let lastControllerRaySummary = lastControllerRaySummaryRef.current;
    if (!renderer.xr.isPresenting) {
      if (!lastControllerRaySummary || lastControllerRaySummary.presenting !== false) {
        log?.('[VR] skipping controller rays – not presenting');
      }
      lastControllerRaySummary = {
        presenting: false,
        visibleLines: 0,
        hoverTrackIds: controllersRef.current.map((entry) => entry.hoverTrackId),
      };
      lastControllerRaySummaryRef.current = lastControllerRaySummary;
      vrClearHoverStateRef.current?.('controller');
      applyVrPlaybackHoverState(false, false, false, false, false, false, false, false, false);
      return;
    }

    const cameraInstance = cameraRef.current;
    const trackGroupInstance = trackGroupRef.current;
    const containerInstance = containerRef.current;

    const visibleLines: Line2[] = [];
    if (trackGroupInstance && trackGroupInstance.visible) {
      for (const resource of trackLinesRef.current.values()) {
        if (resource.line.visible) {
          visibleLines.push(resource.line);
        }
      }
    }

    let hoveredByController: { trackId: string; position: { x: number; y: number } | null } | null = null;
    let playHoveredAny = false;
    let playbackSliderHoveredAny = false;
    let playbackSliderActiveAny = false;
    let fpsSliderHoveredAny = false;
    let fpsSliderActiveAny = false;
    let resetVolumeHoveredAny = false;
    let resetHudHoveredAny = false;
    let exitHoveredAny = false;
    let modeHoveredAny = false;
    let nextChannelsHoverRegion: VrChannelsInteractiveRegion | null = null;
    let nextTracksHoverRegion: VrTracksInteractiveRegion | null = null;
    let rotationHandleHovered = false;
    let rotationHandleActive = false;

    for (let index = 0; index < controllersRef.current.length; index++) {
      const entry = controllersRef.current[index];
      const previousHoverTrackId = entry.hoverTrackId;
      const previousUiType = entry.hoverUiTarget ? entry.hoverUiTarget.type : null;
      if (!entry.controller.visible) {
        entry.hoverTrackId = null;
        entry.hoverUiTarget = null;
        entry.activeUiTarget = null;
        entry.hasHoverUiPoint = false;
        entry.rayLength = 3;
        entry.ray.scale.set(1, 1, entry.rayLength);
        if (previousHoverTrackId !== entry.hoverTrackId || previousUiType !== null) {
          log?.('[VR] controller hover cleared', index);
        }
        continue;
      }

      controllerTempMatrix.identity().extractRotation(entry.controller.matrixWorld);
      entry.rayOrigin.setFromMatrixPosition(entry.controller.matrixWorld);
      entry.rayDirection.set(0, 0, -1).applyMatrix4(controllerTempMatrix).normalize();
      entry.raycaster.ray.origin.copy(entry.rayOrigin);
      entry.raycaster.ray.direction.copy(entry.rayDirection);

      let rayLength = 3;
      let hoverTrackId: string | null = null;
      let hoverPosition: { x: number; y: number } | null = null;
      entry.hoverUiTarget = null;
      entry.hasHoverUiPoint = false;

      let uiRayLength: number | null = null;
      const playbackHudInstance = vrPlaybackHudRef.current;
      const channelsHudInstance = vrChannelsHudRef.current;
      const tracksHudInstance = vrTracksHudRef.current;
      const translationHandleInstance = vrTranslationHandleRef.current;
      const scaleHandleInstance = vrVolumeScaleHandleRef.current;
      const yawHandleInstances = vrVolumeYawHandlesRef.current;
      const pitchHandleInstance = vrVolumePitchHandleRef.current;

      const isActiveTranslate = entry.activeUiTarget?.type === 'volume-translate-handle';
      const isActiveScale = entry.activeUiTarget?.type === 'volume-scale-handle';
      const isActiveYaw = entry.activeUiTarget?.type === 'volume-yaw-handle';
      const isActivePitch = entry.activeUiTarget?.type === 'volume-pitch-handle';
      if (isActiveYaw || isActivePitch) {
        rotationHandleActive = true;
      }

      let handleCandidateTarget: VrUiTarget | null = null;
      let handleCandidatePoint: THREE.Vector3 | null = null;
      let handleCandidateDistance = Infinity;

      const considerHandleCandidate = (candidate: VolumeHandleCandidate) => {
        if (handleCandidateTarget === null || candidate.distance < handleCandidateDistance) {
          handleCandidateTarget = candidate.target;
          handleCandidatePoint = candidate.point;
          handleCandidateDistance = candidate.distance;
        }
      };

      if (translationHandleInstance && translationHandleInstance.visible) {
        translationHandleInstance.getWorldPosition(translationHandleWorldPoint);
        const distance = translationHandleWorldPoint.distanceTo(entry.rayOrigin);
        if (isActiveTranslate || distance <= VR_UI_TOUCH_DISTANCE) {
          considerHandleCandidate({
            target: { type: 'volume-translate-handle', object: translationHandleInstance },
            point: translationHandleWorldPoint.clone(),
            distance,
          });
        }
      }

      if (scaleHandleInstance && scaleHandleInstance.visible) {
        scaleHandleInstance.getWorldPosition(scaleHandleWorldPoint);
        const distance = scaleHandleWorldPoint.distanceTo(entry.rayOrigin);
        if (isActiveScale || distance <= VR_UI_TOUCH_DISTANCE) {
          considerHandleCandidate({
            target: { type: 'volume-scale-handle', object: scaleHandleInstance },
            point: scaleHandleWorldPoint.clone(),
            distance,
          });
        }
      }

      if (yawHandleInstances.length > 0) {
        const activeYawObject = isActiveYaw ? (entry.activeUiTarget?.object as THREE.Object3D | null) : null;
        for (const yawHandle of yawHandleInstances) {
          if (!yawHandle.visible) {
            continue;
          }
          const isActiveHandle = activeYawObject === yawHandle;
          if (!isActiveHandle && activeYawObject) {
            continue;
          }
          yawHandle.getWorldPosition(rotationHandleWorldPoint);
          const distance = rotationHandleWorldPoint.distanceTo(entry.rayOrigin);
          if (distance <= VR_UI_TOUCH_DISTANCE) {
            rotationHandleHovered = true;
          }
          if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
            considerHandleCandidate({
              target: { type: 'volume-yaw-handle', object: yawHandle },
              point: rotationHandleWorldPoint.clone(),
              distance,
            });
          }
        }
      }

      if (pitchHandleInstance && pitchHandleInstance.visible) {
        pitchHandleInstance.getWorldPosition(rotationHandleWorldPoint);
        const distance = rotationHandleWorldPoint.distanceTo(entry.rayOrigin);
        if (distance <= VR_UI_TOUCH_DISTANCE) {
          rotationHandleHovered = true;
        }
        const isActiveHandle = isActivePitch && entry.activeUiTarget?.object === pitchHandleInstance;
        if (isActiveHandle || (!isActivePitch && distance <= VR_UI_TOUCH_DISTANCE)) {
          considerHandleCandidate({
            target: { type: 'volume-pitch-handle', object: pitchHandleInstance },
            point: rotationHandleWorldPoint.clone(),
            distance,
          });
        }
      }

      if (entry.isSelecting && isActiveTranslate) {
        const handle = vrTranslationHandleRef.current;
        const volumeRootGroup = volumeRootGroupRef.current;
        if (handle && volumeRootGroup) {
          const desiredPosition = rotationHandleWorldPoint;
          desiredPosition.copy(entry.rayOrigin);
          if (entry.translateGrabOffset) {
            desiredPosition.add(entry.translateGrabOffset);
          }
          handle.getWorldPosition(translationHandleWorldPoint);
          rotationDirectionTemp.copy(desiredPosition).sub(translationHandleWorldPoint);
          if (rotationDirectionTemp.lengthSq() > 1e-10) {
            volumeRootGroup.position.add(rotationDirectionTemp);
            volumeRootBaseOffsetRef.current.add(rotationDirectionTemp);
            volumeRootGroup.updateMatrixWorld(true);
          }
          handle.getWorldPosition(translationHandleWorldPoint);
          entry.hoverUiPoint.copy(translationHandleWorldPoint);
          entry.hasHoverUiPoint = true;
          const distance = entry.rayOrigin.distanceTo(translationHandleWorldPoint);
          rayLength = Math.min(rayLength, Math.max(0.12, Math.min(distance, 8)));
          const candidateTarget = handleCandidateTarget as VrUiTarget | null;
          if (candidateTarget && candidateTarget.type === 'volume-translate-handle') {
            handleCandidatePoint = translationHandleWorldPoint.clone();
            handleCandidateDistance = distance;
          }
        }
      }

      if (entry.isSelecting && isActiveScale) {
        const handle = vrVolumeScaleHandleRef.current;
        const volumeRootGroup = volumeRootGroupRef.current;
        const scaleState = entry.volumeScaleState;
        if (!handle || !volumeRootGroup || !scaleState) {
          entry.volumeScaleState = null;
        } else {
          const desiredPosition = scaleTargetWorldPoint;
          desiredPosition.copy(entry.rayOrigin);
          if (entry.scaleGrabOffset) {
            desiredPosition.add(entry.scaleGrabOffset);
          }
          rotationCenterWorldPoint.copy(volumeRootCenterUnscaledRef.current);
          volumeRootGroup.localToWorld(rotationCenterWorldPoint);
          scaleDirectionTemp.copy(desiredPosition).sub(rotationCenterWorldPoint);
          const projection = scaleDirectionTemp.dot(scaleState.direction);
          const minLength = scaleState.baseLength * VR_VOLUME_MIN_SCALE;
          const maxLength = scaleState.baseLength * VR_VOLUME_MAX_SCALE;
          const clampedLength = Math.min(Math.max(projection, minLength), maxLength);
          const safeBaseLength = Math.max(scaleState.baseLength, 1e-6);
          const unclampedScale = clampedLength / safeBaseLength;
          const nextUserScale = Math.min(
            VR_VOLUME_MAX_SCALE,
            Math.max(VR_VOLUME_MIN_SCALE, unclampedScale),
          );
          volumeUserScaleRef.current = nextUserScale;
          const baseScale = volumeNormalizationScaleRef.current;
          volumeRootGroup.scale.setScalar(baseScale * nextUserScale);
          applyVolumeYawPitch(volumeYawRef.current, volumePitchRef.current);
          handle.getWorldPosition(scaleHandleWorldPoint);
          entry.hoverUiPoint.copy(scaleHandleWorldPoint);
          entry.hasHoverUiPoint = true;
          const distance = entry.rayOrigin.distanceTo(scaleHandleWorldPoint);
          rayLength = Math.min(rayLength, Math.max(0.12, Math.min(distance, 8)));
          const scaleTarget = handleCandidateTarget as VrUiTarget | null;
          if (scaleTarget && scaleTarget.type === 'volume-scale-handle') {
            handleCandidatePoint = scaleHandleWorldPoint.clone();
            handleCandidateDistance = distance;
          }
        }
      }

      if (entry.isSelecting && (isActiveYaw || isActivePitch)) {
        const volumeRootGroup = volumeRootGroupRef.current;
        const rotationState = entry.volumeRotationState;
        if (!volumeRootGroup || !rotationState) {
          entry.volumeRotationState = null;
        } else {
          rotationCenterWorldPoint.copy(volumeRootCenterUnscaledRef.current);
          volumeRootGroup.localToWorld(rotationCenterWorldPoint);
          rotationDirectionTemp.copy(entry.rayOrigin).sub(rotationCenterWorldPoint);
          const tau = Math.PI * 2;
          if (rotationState.mode === 'yaw') {
            rotationDirectionTemp.y = 0;
            if (rotationDirectionTemp.lengthSq() > 1e-8) {
              const currentAngle = computeYawAngleForBasis(
                rotationDirectionTemp,
                rotationState.basisForward,
                rotationState.basisRight,
              );
              let delta = currentAngle - rotationState.initialAngle;
              if (delta > Math.PI) {
                delta -= tau;
              } else if (delta < -Math.PI) {
                delta += tau;
              }
              const nextYaw = rotationState.initialYaw - delta;
              applyVolumeYawPitch(nextYaw, volumePitchRef.current);
            }
          } else if (rotationState.mode === 'pitch') {
            rotationDirectionTemp.x = 0;
            if (rotationDirectionTemp.lengthSq() > 1e-8) {
              const forwardComponent = rotationDirectionTemp.dot(rotationState.basisForward);
              const currentAngle = Math.atan2(rotationDirectionTemp.y, forwardComponent);
              let delta = currentAngle - rotationState.initialAngle;
              if (delta > Math.PI) {
                delta -= tau;
              } else if (delta < -Math.PI) {
                delta += tau;
              }
              const pitchLimit = Math.PI / 2 - 0.05;
              const nextPitch = Math.max(
                -pitchLimit,
                Math.min(pitchLimit, rotationState.initialPitch + delta),
              );
              applyVolumeYawPitch(volumeYawRef.current, nextPitch);
            }
          }
          const activeHandle = entry.activeUiTarget?.object as THREE.Object3D | null;
          if (activeHandle) {
            activeHandle.getWorldPosition(rotationHandleWorldPoint);
            entry.hoverUiPoint.copy(rotationHandleWorldPoint);
            entry.hasHoverUiPoint = true;
            const distance = entry.rayOrigin.distanceTo(rotationHandleWorldPoint);
            rayLength = Math.min(rayLength, Math.max(0.12, Math.min(distance, 8)));
            const rotationTarget = handleCandidateTarget as VrUiTarget | null;
            if (
              rotationTarget &&
              (rotationTarget.type === 'volume-yaw-handle' ||
                rotationTarget.type === 'volume-pitch-handle')
            ) {
              handleCandidatePoint = rotationHandleWorldPoint.clone();
              handleCandidateDistance = distance;
            }
          }
        }
      }

      if (handleCandidateTarget && handleCandidatePoint) {
        const target = handleCandidateTarget as VrUiTarget;
        entry.hoverUiTarget = target;
        entry.hasHoverUiPoint = true;
        entry.hoverUiPoint.copy(handleCandidatePoint);
        const candidateDistance = Math.max(0.12, Math.min(handleCandidateDistance, 8));
        rayLength = Math.min(rayLength, candidateDistance);
        hoverTrackId = null;
        if (target.type === 'volume-yaw-handle' || target.type === 'volume-pitch-handle') {
          rotationHandleHovered = true;
        }
        nextChannelsHoverRegion = null;
      } else {
        type PlaybackCandidate = {
          category: 'playback';
          target: VrUiTarget;
          point: THREE.Vector3;
          distance: number;
          region: null;
        };
        type ChannelsCandidate = {
          category: 'channels';
          target: VrUiTarget;
          point: THREE.Vector3;
          distance: number;
          region: VrChannelsInteractiveRegion | null;
        };
        type TracksCandidate = {
          category: 'tracks';
          target: VrUiTarget;
          point: THREE.Vector3;
          distance: number;
          region: VrTracksInteractiveRegion | null;
        };
        type AnyCandidate = PlaybackCandidate | ChannelsCandidate | TracksCandidate;

        let playbackCandidate: PlaybackCandidate | null = null;
        let channelsCandidate: ChannelsCandidate | null = null;
        let tracksCandidate: TracksCandidate | null = null;

        const considerPlaybackCandidate = (
          candidate: PlaybackCandidate,
          rayDistance: number,
        ) => {
          const clampedDistance = Math.max(0.12, Math.min(rayDistance, 8));
          const shouldReplace = !playbackCandidate || candidate.distance < playbackCandidate.distance;
          if (shouldReplace) {
            playbackCandidate = candidate;
            uiRayLength =
              uiRayLength === null ? clampedDistance : Math.min(uiRayLength, clampedDistance);
          }
          return shouldReplace;
        };

        const considerChannelsCandidate = (
          candidate: ChannelsCandidate,
          rayDistance: number,
        ) => {
          const clampedDistance = Math.max(0.12, Math.min(rayDistance, 8));
          const shouldReplace = !channelsCandidate || candidate.distance < channelsCandidate.distance;
          if (shouldReplace) {
            channelsCandidate = candidate;
            uiRayLength =
              uiRayLength === null ? clampedDistance : Math.min(uiRayLength, clampedDistance);
          }
          return shouldReplace;
        };

        const considerTracksCandidate = (
          candidate: TracksCandidate,
          rayDistance: number,
        ) => {
          const clampedDistance = Math.max(0.12, Math.min(rayDistance, 8));
          const shouldReplace = !tracksCandidate || candidate.distance < tracksCandidate.distance;
          if (shouldReplace) {
            tracksCandidate = candidate;
            uiRayLength =
              uiRayLength === null ? clampedDistance : Math.min(uiRayLength, clampedDistance);
          }
          return shouldReplace;
        };

        if (playbackHudInstance && playbackHudInstance.group.visible) {
          const plane = vrHudPlaneRef.current;
          const planePoint = vrHudPlanePointRef.current;
          playbackHudInstance.panel.getWorldPosition(planePoint);
          const planeNormal = vrHudForwardRef.current;
          planeNormal.set(0, 0, 1).applyQuaternion(playbackHudInstance.group.quaternion).normalize();
          plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
          const activeType = entry.activeUiTarget?.type ?? null;
          const activePlayback = activeType ? activeType.startsWith('playback-') : false;
          const playbackSliderActive = activeType === 'playback-slider';
          const fpsSliderActive = activeType === 'playback-fps-slider';
          const playbackSliderLocked = playbackSliderActive && entry.isSelecting;
          const fpsSliderLocked = fpsSliderActive && entry.isSelecting;
          const translateHandle = playbackHudInstance.panelTranslateHandle;
          const yawHandles = playbackHudInstance.panelYawHandles;
          const pitchHandle = playbackHudInstance.panelPitchHandle;
          const handleWorldPoint = vrHandleWorldPointRef.current;
          const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

          if (translateHandle && !playbackSliderLocked && !fpsSliderLocked) {
            translateHandle.getWorldPosition(handleWorldPoint);
            const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
            if (activeType === 'playback-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
              considerPlaybackCandidate(
                {
                  category: 'playback',
                  target: { type: 'playback-panel-grab', object: translateHandle },
                  point: handleWorldPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
            }
          }

          if (yawHandles.length > 0 && !playbackSliderLocked && !fpsSliderLocked) {
            const activeYawObject =
              activeType === 'playback-panel-yaw'
                ? (entry.activeUiTarget?.object as THREE.Object3D | null)
                : null;
            for (const yawHandle of yawHandles) {
              const isActiveHandle = activeYawObject === yawHandle;
              if (!isActiveHandle && activeYawObject && activeType === 'playback-panel-yaw') {
                continue;
              }
              yawHandle.getWorldPosition(handleSecondaryPoint);
              const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
              if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
                considerPlaybackCandidate(
                  {
                    category: 'playback',
                    target: { type: 'playback-panel-yaw', object: yawHandle },
                    point: handleSecondaryPoint.clone(),
                    distance,
                    region: null,
                  },
                  distance,
                );
              }
            }
          }

          if (pitchHandle && !playbackSliderLocked && !fpsSliderLocked) {
            pitchHandle.getWorldPosition(handleSecondaryPoint);
            const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
            if (
              (activeType === 'playback-panel-pitch' && entry.activeUiTarget?.object === pitchHandle) ||
              (activeType !== 'playback-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)
            ) {
              considerPlaybackCandidate(
                {
                  category: 'playback',
                  target: { type: 'playback-panel-pitch', object: pitchHandle },
                  point: handleSecondaryPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
            }
          }

          const denominator = planeNormal.dot(entry.rayDirection);
          if (Math.abs(denominator) > 1e-5) {
            const signedDistance = plane.distanceToPoint(entry.rayOrigin);
            const distanceAlongRay = -signedDistance / denominator;
            if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
              playbackTouchPoint
                .copy(entry.rayDirection)
                .multiplyScalar(distanceAlongRay)
                .add(entry.rayOrigin);
              playbackPlaneNormal.copy(planeNormal);
              playbackLocalPoint.copy(playbackTouchPoint);
              playbackHudInstance.group.worldToLocal(playbackLocalPoint);
              const surfaceMargin = activePlayback
                ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                : VR_UI_TOUCH_SURFACE_MARGIN;
              const halfWidth = VR_PLAYBACK_PANEL_WIDTH / 2 + surfaceMargin;
              const halfHeight = VR_PLAYBACK_PANEL_HEIGHT / 2 + surfaceMargin;
              if (
                playbackLocalPoint.x >= -halfWidth &&
                playbackLocalPoint.x <= halfWidth &&
                playbackLocalPoint.y >= -halfHeight &&
                playbackLocalPoint.y <= halfHeight
              ) {
                const rawDistance = distanceAlongRay;
                const playbackSliderActive = activeType === 'playback-slider';
                const fpsSliderActive = activeType === 'playback-fps-slider';
                const playbackSliderLocked = playbackSliderActive && entry.isSelecting;
                const fpsSliderLocked = fpsSliderActive && entry.isSelecting;
                const playbackSliderMargin = playbackSliderActive
                  ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                  : VR_UI_TOUCH_SURFACE_MARGIN;
                const fpsSliderMargin = fpsSliderActive
                  ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                  : VR_UI_TOUCH_SURFACE_MARGIN;
                const playbackSliderHalfWidth =
                  (playbackHudInstance.playbackSliderWidth + 0.04) / 2 + playbackSliderMargin;
                const playbackSliderHalfHeight = 0.08 / 2 + playbackSliderMargin;
                const playbackSliderLocalX =
                  playbackLocalPoint.x - playbackHudInstance.playbackSliderGroup.position.x;
                const playbackSliderLocalY =
                  playbackLocalPoint.y - playbackHudInstance.playbackSliderGroup.position.y;
                const inPlaybackSliderArea =
                  playbackSliderLocalX >= -playbackSliderHalfWidth &&
                  playbackSliderLocalX <= playbackSliderHalfWidth &&
                  playbackSliderLocalY >= -playbackSliderHalfHeight &&
                  playbackSliderLocalY <= playbackSliderHalfHeight;

                const fpsSliderHalfWidth =
                  (playbackHudInstance.fpsSliderWidth + 0.04) / 2 + fpsSliderMargin;
                const fpsSliderHalfHeight = 0.08 / 2 + fpsSliderMargin;
                const fpsSliderLocalX = playbackLocalPoint.x - playbackHudInstance.fpsSliderGroup.position.x;
                const fpsSliderLocalY = playbackLocalPoint.y - playbackHudInstance.fpsSliderGroup.position.y;
                const inFpsSliderArea =
                  fpsSliderLocalX >= -fpsSliderHalfWidth &&
                  fpsSliderLocalX <= fpsSliderHalfWidth &&
                  fpsSliderLocalY >= -fpsSliderHalfHeight &&
                  fpsSliderLocalY <= fpsSliderHalfHeight;
                const fpsSliderEnabled = playbackStateRef.current.totalTimepoints > 1;

                const playCenter = playbackHudInstance.playButton.position;
                const playRadius = 0.045 + surfaceMargin;
                const playDeltaX = playbackLocalPoint.x - playCenter.x;
                const playDeltaY = playbackLocalPoint.y - playCenter.y;
                const inPlayButton =
                  playDeltaX * playDeltaX + playDeltaY * playDeltaY <= playRadius * playRadius;

                const resetVolumeCenter = playbackHudInstance.resetVolumeButton.position;
                const resetVolumeHalfWidth =
                  playbackHudInstance.resetVolumeButtonHalfWidth + surfaceMargin;
                const resetVolumeHalfHeight =
                  playbackHudInstance.resetVolumeButtonHalfHeight + surfaceMargin;
                const resetVolumeDeltaX = playbackLocalPoint.x - resetVolumeCenter.x;
                const resetVolumeDeltaY = playbackLocalPoint.y - resetVolumeCenter.y;
                const inResetVolumeButton =
                  Math.abs(resetVolumeDeltaX) <= resetVolumeHalfWidth &&
                  Math.abs(resetVolumeDeltaY) <= resetVolumeHalfHeight;

                const resetHudCenter = playbackHudInstance.resetHudButton.position;
                const resetHudHalfWidth =
                  playbackHudInstance.resetHudButtonHalfWidth + surfaceMargin;
                const resetHudHalfHeight =
                  playbackHudInstance.resetHudButtonHalfHeight + surfaceMargin;
                const resetHudDeltaX = playbackLocalPoint.x - resetHudCenter.x;
                const resetHudDeltaY = playbackLocalPoint.y - resetHudCenter.y;
                const inResetHudButton =
                  Math.abs(resetHudDeltaX) <= resetHudHalfWidth &&
                  Math.abs(resetHudDeltaY) <= resetHudHalfHeight;

                const exitCenter = playbackHudInstance.exitButton.position;
                const exitHalfWidth = playbackHudInstance.exitButtonHalfWidth + surfaceMargin;
                const exitHalfHeight = playbackHudInstance.exitButtonHalfHeight + surfaceMargin;
                const exitDeltaX = playbackLocalPoint.x - exitCenter.x;
                const exitDeltaY = playbackLocalPoint.y - exitCenter.y;
                const inExitButton =
                  Math.abs(exitDeltaX) <= exitHalfWidth && Math.abs(exitDeltaY) <= exitHalfHeight;

                const modeCenter = playbackHudInstance.modeButton.position;
                const modeHalfWidth = playbackHudInstance.modeButtonHalfWidth + surfaceMargin;
                const modeHalfHeight = playbackHudInstance.modeButtonHalfHeight + surfaceMargin;
                const modeDeltaX = playbackLocalPoint.x - modeCenter.x;
                const modeDeltaY = playbackLocalPoint.y - modeCenter.y;
                const inModeButton =
                  playbackHudInstance.modeButton.visible &&
                  Math.abs(modeDeltaX) <= modeHalfWidth &&
                  Math.abs(modeDeltaY) <= modeHalfHeight;

                if (!playbackSliderLocked && !fpsSliderLocked && inResetVolumeButton) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-reset-volume', object: playbackHudInstance.resetVolumeButton },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                } else if (!playbackSliderLocked && !fpsSliderLocked && inResetHudButton) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-reset-hud', object: playbackHudInstance.resetHudButton },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                } else if (!playbackSliderLocked && !fpsSliderLocked && inExitButton) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-exit-vr', object: playbackHudInstance.exitButton },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                } else if (!playbackSliderLocked && !fpsSliderLocked && inModeButton) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-toggle-mode', object: playbackHudInstance.modeButton },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                } else if (!playbackSliderLocked && !fpsSliderLocked && inPlayButton) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-play-toggle', object: playbackHudInstance.playButton },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                }

                if (playbackSliderLocked || inPlaybackSliderArea) {
                  const sliderDepth =
                    playbackHudInstance.playbackSliderGroup.position.z +
                    playbackHudInstance.playbackSliderHitArea.position.z;
                  playbackSliderPoint
                    .copy(playbackTouchPoint)
                    .addScaledVector(playbackPlaneNormal, sliderDepth);
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: {
                        type: 'playback-slider',
                        object: playbackHudInstance.playbackSliderHitArea,
                      },
                      point: playbackSliderPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                  if (playbackSliderActive && !playbackStateRef.current.playbackDisabled) {
                    applyPlaybackSliderFromWorldPointRef.current?.(playbackSliderPoint);
                  }
                }

                if (fpsSliderEnabled && (fpsSliderLocked || inFpsSliderArea)) {
                  const fpsDepth =
                    playbackHudInstance.fpsSliderGroup.position.z +
                    playbackHudInstance.fpsSliderHitArea.position.z;
                  fpsSliderPoint
                    .copy(playbackTouchPoint)
                    .addScaledVector(playbackPlaneNormal, fpsDepth);
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-fps-slider', object: playbackHudInstance.fpsSliderHitArea },
                      point: fpsSliderPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                  if (fpsSliderActive) {
                    applyFpsSliderFromWorldPointRef.current?.(fpsSliderPoint);
                  }
                }

                if (!playbackSliderLocked) {
                  considerPlaybackCandidate(
                    {
                      category: 'playback',
                      target: { type: 'playback-panel', object: playbackHudInstance.panel },
                      point: playbackTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                }
              }
            }
          }
        }

        if (channelsHudInstance && channelsHudInstance.group.visible) {
          nextChannelsHoverRegion = null;
          const plane = vrHudPlaneRef.current;
          const planePoint = vrHudPlanePointRef.current;
          channelsHudInstance.panel.getWorldPosition(planePoint);
          const planeNormal = vrHudForwardRef.current;
          planeNormal.set(0, 0, 1).applyQuaternion(channelsHudInstance.group.quaternion).normalize();
          plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
          const activeType = entry.activeUiTarget?.type ?? null;
          const activeChannels = activeType ? activeType.startsWith('channels-') : false;
          const channelsSliderActive = activeType === 'channels-slider';
          const activeChannelsSliderRegion =
            channelsSliderActive &&
            entry.isSelecting &&
            entry.activeUiTarget?.data &&
            !(entry.activeUiTarget.data as VrChannelsInteractiveRegion).disabled
              ? (entry.activeUiTarget.data as VrChannelsInteractiveRegion)
              : null;
          const channelsSliderLocked = Boolean(activeChannelsSliderRegion);
          const translateHandle = channelsHudInstance.panelTranslateHandle;
          const yawHandles = channelsHudInstance.panelYawHandles;
          const pitchHandle = channelsHudInstance.panelPitchHandle;
          const handleWorldPoint = vrHandleWorldPointRef.current;
          const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

          if (translateHandle && !channelsSliderLocked) {
            translateHandle.getWorldPosition(handleWorldPoint);
            const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
            if (activeType === 'channels-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
              const replaced = considerChannelsCandidate(
                {
                  category: 'channels',
                  target: { type: 'channels-panel-grab', object: translateHandle },
                  point: handleWorldPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
              if (replaced) {
                nextChannelsHoverRegion = null;
              }
            }
          }

          if (yawHandles.length > 0 && !channelsSliderLocked) {
            const activeYawObject =
              activeType === 'channels-panel-yaw'
                ? (entry.activeUiTarget?.object as THREE.Object3D | null)
                : null;
            for (const yawHandle of yawHandles) {
              const isActiveHandle = activeYawObject === yawHandle;
              if (!isActiveHandle && activeYawObject && activeType === 'channels-panel-yaw') {
                continue;
              }
              yawHandle.getWorldPosition(handleSecondaryPoint);
              const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
              if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
                const replaced = considerChannelsCandidate(
                  {
                    category: 'channels',
                    target: { type: 'channels-panel-yaw', object: yawHandle },
                    point: handleSecondaryPoint.clone(),
                    distance,
                    region: null,
                  },
                  distance,
                );
                if (replaced) {
                  nextChannelsHoverRegion = null;
                }
              }
            }
          }

          if (pitchHandle && !channelsSliderLocked) {
            pitchHandle.getWorldPosition(handleSecondaryPoint);
            const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
            const isActivePitch =
              activeType === 'channels-panel-pitch' && entry.activeUiTarget?.object === pitchHandle;
            if (isActivePitch || (activeType !== 'channels-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)) {
              const replaced = considerChannelsCandidate(
                {
                  category: 'channels',
                  target: { type: 'channels-panel-pitch', object: pitchHandle },
                  point: handleSecondaryPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
              if (replaced) {
                nextChannelsHoverRegion = null;
              }
            }
          }

          const denominator = planeNormal.dot(entry.rayDirection);
          if (Math.abs(denominator) > 1e-5) {
            const signedDistance = plane.distanceToPoint(entry.rayOrigin);
            const distanceAlongRay = -signedDistance / denominator;
            if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
              channelsTouchPoint
                .copy(entry.rayDirection)
                .multiplyScalar(distanceAlongRay)
                .add(entry.rayOrigin);
              vrChannelsLocalPointRef.current.copy(channelsTouchPoint);
              channelsHudInstance.group.worldToLocal(vrChannelsLocalPointRef.current);
              const surfaceMargin = activeChannels
                ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                : VR_UI_TOUCH_SURFACE_MARGIN;
              const halfWidth = channelsHudInstance.width / 2 + surfaceMargin;
              const halfHeight = channelsHudInstance.height / 2 + surfaceMargin;
              if (
                vrChannelsLocalPointRef.current.x >= -halfWidth &&
                vrChannelsLocalPointRef.current.x <= halfWidth &&
                vrChannelsLocalPointRef.current.y >= -halfHeight &&
                vrChannelsLocalPointRef.current.y <= halfHeight
              ) {
                const rawDistance = distanceAlongRay;
                let region = resolveChannelsRegionFromPoint(channelsHudInstance, channelsTouchPoint);
                if (region?.disabled) {
                  region = null;
                }
                const isActiveSliderRegion =
                  region &&
                  activeChannelsSliderRegion &&
                  region.targetType === 'channels-slider' &&
                  region === activeChannelsSliderRegion;
                if (region && (!channelsSliderLocked || isActiveSliderRegion)) {
                  const replaced = considerChannelsCandidate(
                    {
                      category: 'channels',
                      target: { type: region.targetType, object: channelsHudInstance.panel, data: region },
                      point: channelsTouchPoint.clone(),
                      distance: rawDistance,
                      region,
                    },
                    rawDistance,
                  );
                  if (replaced) {
                    nextChannelsHoverRegion = region;
                  }
                  if (channelsSliderActive && region.targetType === 'channels-slider' && isActiveSliderRegion) {
                    applyVrChannelsSliderFromPointRef.current?.(region, channelsTouchPoint);
                  }
                }

                if (channelsSliderLocked && activeChannelsSliderRegion) {
                  const replaced = considerChannelsCandidate(
                    {
                      category: 'channels',
                      target: {
                        type: 'channels-slider',
                        object: channelsHudInstance.panel,
                        data: activeChannelsSliderRegion,
                      },
                      point: channelsTouchPoint.clone(),
                      distance: rawDistance,
                      region: activeChannelsSliderRegion,
                    },
                    rawDistance,
                  );
                  if (replaced) {
                    nextChannelsHoverRegion = activeChannelsSliderRegion;
                  }
                  applyVrChannelsSliderFromPointRef.current?.(activeChannelsSliderRegion, channelsTouchPoint);
                }

                if (!channelsSliderLocked) {
                  const replacedPanel = considerChannelsCandidate(
                    {
                      category: 'channels',
                      target: { type: 'channels-panel', object: channelsHudInstance.panel },
                      point: channelsTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                  if (replacedPanel) {
                    nextChannelsHoverRegion = null;
                  }
                }
              }
            }
          }
        }

        if (tracksHudInstance && tracksHudInstance.group.visible) {
          nextTracksHoverRegion = null;
          const plane = vrHudPlaneRef.current;
          const planePoint = vrHudPlanePointRef.current;
          tracksHudInstance.panel.getWorldPosition(planePoint);
          const planeNormal = vrHudForwardRef.current;
          planeNormal.set(0, 0, 1).applyQuaternion(tracksHudInstance.group.quaternion).normalize();
          plane.setFromNormalAndCoplanarPoint(planeNormal, planePoint);
          const activeType = entry.activeUiTarget?.type ?? null;
          const activeTracks = activeType ? activeType.startsWith('tracks-') : false;
          const tracksSliderActive = activeType === 'tracks-slider';
          const activeTracksSliderRegion =
            tracksSliderActive &&
            entry.isSelecting &&
            entry.activeUiTarget?.data &&
            !(entry.activeUiTarget.data as VrTracksInteractiveRegion).disabled
              ? (entry.activeUiTarget.data as VrTracksInteractiveRegion)
              : null;
          const tracksSliderLocked = Boolean(activeTracksSliderRegion);
          const translateHandle = tracksHudInstance.panelTranslateHandle;
          const yawHandles = tracksHudInstance.panelYawHandles;
          const pitchHandle = tracksHudInstance.panelPitchHandle;
          const handleWorldPoint = vrHandleWorldPointRef.current;
          const handleSecondaryPoint = vrHandleSecondaryPointRef.current;

          if (translateHandle && !tracksSliderLocked) {
            translateHandle.getWorldPosition(handleWorldPoint);
            const distance = handleWorldPoint.distanceTo(entry.rayOrigin);
            if (activeType === 'tracks-panel-grab' || distance <= VR_UI_TOUCH_DISTANCE) {
              const replaced = considerTracksCandidate(
                {
                  category: 'tracks',
                  target: { type: 'tracks-panel-grab', object: translateHandle },
                  point: handleWorldPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
              if (replaced) {
                nextTracksHoverRegion = null;
              }
            }
          }

          if (yawHandles.length > 0 && !tracksSliderLocked) {
            const activeYawObject =
              activeType === 'tracks-panel-yaw'
                ? (entry.activeUiTarget?.object as THREE.Object3D | null)
                : null;
            for (const yawHandle of yawHandles) {
              const isActiveHandle = activeYawObject === yawHandle;
              if (!isActiveHandle && activeYawObject && activeType === 'tracks-panel-yaw') {
                continue;
              }
              yawHandle.getWorldPosition(handleSecondaryPoint);
              const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
              if (isActiveHandle || distance <= VR_UI_TOUCH_DISTANCE) {
                const replaced = considerTracksCandidate(
                  {
                    category: 'tracks',
                    target: { type: 'tracks-panel-yaw', object: yawHandle },
                    point: handleSecondaryPoint.clone(),
                    distance,
                    region: null,
                  },
                  distance,
                );
                if (replaced) {
                  nextTracksHoverRegion = null;
                }
              }
            }
          }

          if (pitchHandle && !tracksSliderLocked) {
            pitchHandle.getWorldPosition(handleSecondaryPoint);
            const distance = handleSecondaryPoint.distanceTo(entry.rayOrigin);
            const isActivePitch =
              activeType === 'tracks-panel-pitch' && entry.activeUiTarget?.object === pitchHandle;
            if (isActivePitch || (activeType !== 'tracks-panel-pitch' && distance <= VR_UI_TOUCH_DISTANCE)) {
              const replaced = considerTracksCandidate(
                {
                  category: 'tracks',
                  target: { type: 'tracks-panel-pitch', object: pitchHandle },
                  point: handleSecondaryPoint.clone(),
                  distance,
                  region: null,
                },
                distance,
              );
              if (replaced) {
                nextTracksHoverRegion = null;
              }
            }
          }

          const denominator = planeNormal.dot(entry.rayDirection);
          if (Math.abs(denominator) > 1e-5) {
            const signedDistance = plane.distanceToPoint(entry.rayOrigin);
            const distanceAlongRay = -signedDistance / denominator;
            if (distanceAlongRay >= 0 && Number.isFinite(distanceAlongRay)) {
              tracksTouchPoint
                .copy(entry.rayDirection)
                .multiplyScalar(distanceAlongRay)
                .add(entry.rayOrigin);
              vrTracksLocalPointRef.current.copy(tracksTouchPoint);
              tracksHudInstance.group.worldToLocal(vrTracksLocalPointRef.current);
              const surfaceMargin = activeTracks
                ? VR_UI_TOUCH_SURFACE_MARGIN * 1.5
                : VR_UI_TOUCH_SURFACE_MARGIN;
              const halfWidth = tracksHudInstance.width / 2 + surfaceMargin;
              const halfHeight = tracksHudInstance.height / 2 + surfaceMargin;
              if (
                vrTracksLocalPointRef.current.x >= -halfWidth &&
                vrTracksLocalPointRef.current.x <= halfWidth &&
                vrTracksLocalPointRef.current.y >= -halfHeight &&
                vrTracksLocalPointRef.current.y <= halfHeight
              ) {
                const rawDistance = distanceAlongRay;
                const region = resolveTracksRegionFromPoint(tracksHudInstance, tracksTouchPoint);
                const isActiveSliderRegion =
                  region &&
                  activeTracksSliderRegion &&
                  region.targetType === 'tracks-slider' &&
                  region === activeTracksSliderRegion;
                if (region && (!tracksSliderLocked || isActiveSliderRegion)) {
                  const replaced = considerTracksCandidate(
                    {
                      category: 'tracks',
                      target: { type: region.targetType, object: tracksHudInstance.panel, data: region },
                      point: tracksTouchPoint.clone(),
                      distance: rawDistance,
                      region,
                    },
                    rawDistance,
                  );
                  if (replaced) {
                    nextTracksHoverRegion = region;
                  }
                  if (entry.isSelecting && entry.activeUiTarget) {
                    if (
                      entry.activeUiTarget.type === 'tracks-slider' &&
                      region.targetType === 'tracks-slider' &&
                      isActiveSliderRegion
                    ) {
                      applyVrTracksSliderFromPointRef.current?.(region, tracksTouchPoint);
                    } else if (
                      entry.activeUiTarget.type === 'tracks-scroll' &&
                      region.targetType === 'tracks-scroll'
                    ) {
                      applyVrTracksScrollFromPointRef.current?.(region, tracksTouchPoint);
                    }
                  }
                }

                if (tracksSliderLocked && activeTracksSliderRegion) {
                  const replaced = considerTracksCandidate(
                    {
                      category: 'tracks',
                      target: {
                        type: 'tracks-slider',
                        object: tracksHudInstance.panel,
                        data: activeTracksSliderRegion,
                      },
                      point: tracksTouchPoint.clone(),
                      distance: rawDistance,
                      region: activeTracksSliderRegion,
                    },
                    rawDistance,
                  );
                  if (replaced) {
                    nextTracksHoverRegion = activeTracksSliderRegion;
                  }
                  applyVrTracksSliderFromPointRef.current?.(activeTracksSliderRegion, tracksTouchPoint);
                } else if (
                  entry.isSelecting &&
                  entry.activeUiTarget?.type === 'tracks-scroll' &&
                  entry.activeUiTarget.data &&
                  !(entry.activeUiTarget.data as VrTracksInteractiveRegion).disabled
                ) {
                  const activeRegion = entry.activeUiTarget.data as VrTracksInteractiveRegion;
                  const replaced = considerTracksCandidate(
                    {
                      category: 'tracks',
                      target: {
                        type: 'tracks-scroll',
                        object: tracksHudInstance.panel,
                        data: activeRegion,
                      },
                      point: tracksTouchPoint.clone(),
                      distance: rawDistance,
                      region: activeRegion,
                    },
                    rawDistance,
                  );
                  if (replaced) {
                    nextTracksHoverRegion = activeRegion;
                  }
                  applyVrTracksScrollFromPointRef.current?.(activeRegion, tracksTouchPoint);
                }

                if (!tracksSliderLocked) {
                  const replacedPanel = considerTracksCandidate(
                    {
                      category: 'tracks',
                      target: { type: 'tracks-panel', object: tracksHudInstance.panel },
                      point: tracksTouchPoint.clone(),
                      distance: rawDistance,
                      region: null,
                    },
                    rawDistance,
                  );
                  if (replacedPanel) {
                    nextTracksHoverRegion = null;
                  }
                }
              }
            }
          }
        }

        let chosenCandidate: AnyCandidate | null = null;
        const candidateList: AnyCandidate[] = [];
        if (playbackCandidate) {
          candidateList.push(playbackCandidate);
        }
        if (channelsCandidate) {
          candidateList.push(channelsCandidate);
        }
        if (tracksCandidate) {
          candidateList.push(tracksCandidate);
        }
        if (candidateList.length > 0) {
          chosenCandidate = candidateList.reduce(
            (best, current) => (current.distance < best.distance ? current : best),
            candidateList[0],
          );
        }

        if (chosenCandidate) {
          entry.hoverUiTarget = chosenCandidate.target;
          entry.hasHoverUiPoint = true;
          entry.hoverUiPoint.copy(chosenCandidate.point);
          const candidateDistance = Math.max(0.12, Math.min(chosenCandidate.distance, 8));
          uiRayLength =
            uiRayLength === null ? candidateDistance : Math.min(uiRayLength, candidateDistance);
          if (
            chosenCandidate.category === 'channels' &&
            chosenCandidate.region
          ) {
            nextChannelsHoverRegion = chosenCandidate.region;
          } else if (
            chosenCandidate.category === 'tracks' &&
            chosenCandidate.region
          ) {
            nextTracksHoverRegion = chosenCandidate.region;
          }
        }
      }

      const uiType = entry.hoverUiTarget ? entry.hoverUiTarget.type : null;
      if (uiType === 'playback-play-toggle') {
        playHoveredAny = true;
        hoverTrackId = null;
      } else if (uiType === 'playback-slider') {
        playbackSliderHoveredAny = true;
      } else if (uiType === 'playback-fps-slider') {
        fpsSliderHoveredAny = true;
      } else if (
        uiType === 'playback-panel-grab' ||
        uiType === 'playback-panel' ||
        uiType === 'playback-panel-yaw' ||
        uiType === 'playback-panel-pitch'
      ) {
        hoverTrackId = null;
      } else if (uiType === 'playback-reset-volume') {
        resetVolumeHoveredAny = true;
        hoverTrackId = null;
      } else if (uiType === 'playback-reset-hud') {
        resetHudHoveredAny = true;
        hoverTrackId = null;
      } else if (uiType === 'playback-exit-vr') {
        exitHoveredAny = true;
        hoverTrackId = null;
      } else if (uiType === 'playback-toggle-mode') {
        modeHoveredAny = true;
        hoverTrackId = null;
      } else if (
        uiType === 'volume-translate-handle' ||
        uiType === 'volume-scale-handle' ||
        uiType === 'volume-yaw-handle' ||
        uiType === 'volume-pitch-handle'
      ) {
        hoverTrackId = null;
      } else if (uiType && uiType.startsWith('tracks-')) {
        hoverTrackId = null;
      }
      if (entry.activeUiTarget?.type === 'playback-slider') {
        playbackSliderActiveAny = true;
        hoverTrackId = null;
      } else if (entry.activeUiTarget?.type === 'playback-fps-slider') {
        fpsSliderActiveAny = true;
        hoverTrackId = null;
      } else if (entry.activeUiTarget?.type === 'playback-reset-volume') {
        resetVolumeHoveredAny = true;
        hoverTrackId = null;
      } else if (entry.activeUiTarget?.type === 'playback-reset-hud') {
        resetHudHoveredAny = true;
        hoverTrackId = null;
      } else if (entry.activeUiTarget?.type === 'playback-exit-vr') {
        exitHoveredAny = true;
        hoverTrackId = null;
      } else if (entry.activeUiTarget?.type === 'playback-toggle-mode') {
        modeHoveredAny = true;
        hoverTrackId = null;
      }
      if (
        entry.activeUiTarget?.type === 'playback-panel-grab' ||
        entry.activeUiTarget?.type === 'playback-panel-yaw' ||
        entry.activeUiTarget?.type === 'playback-panel-pitch' ||
        entry.activeUiTarget?.type === 'channels-panel-grab' ||
        entry.activeUiTarget?.type === 'channels-panel-yaw' ||
        entry.activeUiTarget?.type === 'channels-panel-pitch' ||
        entry.activeUiTarget?.type === 'tracks-panel-grab' ||
        entry.activeUiTarget?.type === 'tracks-panel-yaw' ||
        entry.activeUiTarget?.type === 'tracks-panel-pitch'
      ) {
        hoverTrackId = null;
      }

      if (uiRayLength !== null && Number.isFinite(uiRayLength)) {
        rayLength = Math.min(rayLength, uiRayLength);
      }

      if (
        entry.isSelecting &&
        entry.activeUiTarget?.type === 'playback-panel-grab' &&
        playbackHudInstance &&
        entry.hasHoverUiPoint
      ) {
        const newPosition = vrPlaybackHudDragTargetRef.current;
        newPosition.copy(entry.rayOrigin);
        if (entry.hudGrabOffsets.playback) {
          newPosition.add(entry.hudGrabOffsets.playback);
        }
        setVrPlaybackHudPlacementPosition(newPosition);
      }

      if (
        entry.isSelecting &&
        entry.activeUiTarget?.type === 'channels-panel-grab' &&
        channelsHudInstance &&
        entry.hasHoverUiPoint
      ) {
        const newPosition = vrChannelsHudDragTargetRef.current;
        newPosition.copy(entry.rayOrigin);
        if (entry.hudGrabOffsets.channels) {
          newPosition.add(entry.hudGrabOffsets.channels);
        }
        setVrChannelsHudPlacementPosition(newPosition);
      }

      if (
        entry.isSelecting &&
        entry.activeUiTarget?.type === 'tracks-panel-grab' &&
        tracksHudInstance &&
        entry.hasHoverUiPoint
      ) {
        const newPosition = vrTracksHudDragTargetRef.current;
        newPosition.copy(entry.rayOrigin);
        if (entry.hudGrabOffsets.tracks) {
          newPosition.add(entry.hudGrabOffsets.tracks);
        }
        setVrTracksHudPlacementPosition(newPosition);
      }

      if (entry.isSelecting && entry.hudRotationState) {
        const rotationState = entry.hudRotationState;
        const expectedTargetType = `${rotationState.hud}-panel-${rotationState.mode}` as VrUiTargetType;
        if (entry.activeUiTarget?.type !== expectedTargetType) {
          entry.hudRotationState = null;
        } else {
          let placement: VrHudPlacement | null = null;
          let applyYaw: ((nextYaw: number) => void) | null = null;
          let applyPitch: ((nextPitch: number) => void) | null = null;
          if (rotationState.hud === 'playback') {
            placement = vrPlaybackHudPlacementRef.current;
            if (rotationState.mode === 'yaw') {
              applyYaw = setVrPlaybackHudPlacementYaw;
            } else {
              applyPitch = setVrPlaybackHudPlacementPitch;
            }
          } else if (rotationState.hud === 'channels') {
            placement = vrChannelsHudPlacementRef.current;
            if (rotationState.mode === 'yaw') {
              applyYaw = setVrChannelsHudPlacementYaw;
            } else {
              applyPitch = setVrChannelsHudPlacementPitch;
            }
          } else if (rotationState.hud === 'tracks') {
            placement = vrTracksHudPlacementRef.current;
            if (rotationState.mode === 'yaw') {
              applyYaw = setVrTracksHudPlacementYaw;
            } else {
              applyPitch = setVrTracksHudPlacementPitch;
            }
          }
          if (placement && (applyYaw || applyPitch)) {
            if (rotationState.mode === 'yaw' && applyYaw) {
              const yawVector = vrHudYawVectorRef.current;
              yawVector.copy(entry.rayOrigin).sub(placement.position);
              yawVector.y = 0;
              if (yawVector.lengthSq() > 1e-6) {
                const currentAngle = computeYawAngleForBasis(
                  yawVector,
                  rotationState.basisForward,
                  rotationState.basisRight,
                );
                let delta = currentAngle - rotationState.initialAngle;
                const tau = Math.PI * 2;
                if (delta > Math.PI) {
                  delta -= tau;
                } else if (delta < -Math.PI) {
                  delta += tau;
                }
                const nextYaw = rotationState.initialYaw - delta;
                applyYaw(nextYaw);
              }
            } else if (rotationState.mode === 'pitch' && applyPitch) {
              const pitchVector = vrHudPitchVectorRef.current;
              pitchVector.copy(entry.rayOrigin).sub(placement.position);
              pitchVector.x = 0;
              if (pitchVector.lengthSq() > 1e-6) {
                const forwardComponent = pitchVector.dot(rotationState.basisForward);
                const currentAngle = Math.atan2(pitchVector.y, forwardComponent);
                let delta = currentAngle - rotationState.initialAngle;
                const tau = Math.PI * 2;
                if (delta > Math.PI) {
                  delta -= tau;
                } else if (delta < -Math.PI) {
                  delta += tau;
                }
                const pitchLimit = Math.PI / 2 - 0.05;
                const nextPitch = Math.max(
                  -pitchLimit,
                  Math.min(pitchLimit, rotationState.initialPitch + delta),
                );
                applyPitch(nextPitch);
              }
            }
          } else {
            entry.hudRotationState = null;
          }
        }
      }

      if (visibleLines.length > 0 && cameraInstance) {
        const raycastCamera = renderer.xr.isPresenting
          ? ((renderer.xr.getCamera() as THREE.Camera) ?? cameraInstance)
          : cameraInstance;
        entry.raycaster.camera = raycastCamera as unknown as THREE.Camera;
        const intersections = entry.raycaster.intersectObjects(visibleLines, false) as Array<{
          object: THREE.Object3D & { userData?: Record<string, unknown> };
          distance: number;
          point: THREE.Vector3;
        }>;

        if (intersections.length > 0) {
          const intersection = intersections[0];
          const trackId =
            intersection.object.userData && typeof intersection.object.userData.trackId === 'string'
              ? (intersection.object.userData.trackId as string)
              : null;

          if (trackId) {
            hoverTrackId = entry.hoverUiTarget ? null : trackId;
            entry.hoverPoint.copy(intersection.point);
            const distance = Math.max(0.15, Math.min(intersection.distance, 8));
            rayLength = Math.min(rayLength, distance);
            if (containerInstance) {
              const width = containerInstance.clientWidth;
              const height = containerInstance.clientHeight;
              if (width > 0 && height > 0) {
                controllerProjectedPoint.copy(intersection.point).project(cameraInstance);
                if (
                  Number.isFinite(controllerProjectedPoint.x) &&
                  Number.isFinite(controllerProjectedPoint.y)
                ) {
                  hoverPosition = {
                    x: (controllerProjectedPoint.x * 0.5 + 0.5) * width,
                    y: (-controllerProjectedPoint.y * 0.5 + 0.5) * height,
                  };
                }
              }
            }
          }
        }
      }

      entry.hoverTrackId = hoverTrackId;
      const currentUiType = entry.hoverUiTarget ? entry.hoverUiTarget.type : null;
      if (previousHoverTrackId !== hoverTrackId || previousUiType !== currentUiType) {
        log?.('[VR] controller hover update', index, {
          hoverTrackId,
          hoverPosition,
          uiTarget: currentUiType,
        });
      }
      entry.rayLength = rayLength;
      entry.ray.scale.set(1, 1, rayLength);

      if (!hoveredByController && hoverTrackId) {
        hoveredByController = { trackId: hoverTrackId, position: hoverPosition };
      }
    }

    applyVrPlaybackHoverState(
      playHoveredAny,
      playbackSliderHoveredAny,
      playbackSliderActiveAny,
      fpsSliderHoveredAny,
      fpsSliderActiveAny,
      resetVolumeHoveredAny,
      resetHudHoveredAny,
      exitHoveredAny,
      modeHoveredAny,
    );

    const channelsHudInstance = vrChannelsHudRef.current;
    const isSameRegion = (
      a: VrChannelsInteractiveRegion | null,
      b: VrChannelsInteractiveRegion | null,
    ) => {
      if (a === b) {
        return true;
      }
      if (!a || !b) {
        return false;
      }
      return (
        a.targetType === b.targetType &&
        a.channelId === b.channelId &&
        a.layerKey === b.layerKey &&
        a.sliderKey === b.sliderKey &&
        a.color === b.color
      );
    };
    if (channelsHudInstance && !isSameRegion(channelsHudInstance.hoverRegion, nextChannelsHoverRegion)) {
      channelsHudInstance.hoverRegion = nextChannelsHoverRegion;
      renderVrChannelsHudRef.current?.(channelsHudInstance, vrChannelsStateRef.current);
    }

    const tracksHudInstance = vrTracksHudRef.current;
    const isSameTracksRegion = (
      a: VrTracksInteractiveRegion | null,
      b: VrTracksInteractiveRegion | null,
    ) => {
      if (a === b) {
        return true;
      }
      if (!a || !b) {
        return false;
      }
      return (
        a.targetType === b.targetType &&
        a.channelId === b.channelId &&
        a.trackId === b.trackId &&
        a.sliderKey === b.sliderKey &&
        a.color === b.color
      );
    };
    if (tracksHudInstance && !isSameTracksRegion(tracksHudInstance.hoverRegion, nextTracksHoverRegion)) {
      tracksHudInstance.hoverRegion = nextTracksHoverRegion;
      renderVrTracksHudRef.current?.(tracksHudInstance, vrTracksStateRef.current);
    }

    const summary = {
      presenting: true,
      visibleLines: visibleLines.length,
      hoverTrackIds: controllersRef.current.map((entry) => entry.hoverTrackId),
    };
    if (
      !lastControllerRaySummary ||
      summary.visibleLines !== lastControllerRaySummary.visibleLines ||
      summary.hoverTrackIds.length !== lastControllerRaySummary.hoverTrackIds.length ||
      summary.hoverTrackIds.some((id, hoverIndex) => id !== lastControllerRaySummary?.hoverTrackIds[hoverIndex])
    ) {
      log?.('[VR] ray pass', summary);
    }
    lastControllerRaySummary = summary;
    lastControllerRaySummaryRef.current = summary;

    if (hoveredByController) {
      vrUpdateHoverStateRef.current?.(
        hoveredByController.trackId,
        hoveredByController.position,
        'controller',
      );
    } else {
      vrClearHoverStateRef.current?.('controller');
    }
  };
}
