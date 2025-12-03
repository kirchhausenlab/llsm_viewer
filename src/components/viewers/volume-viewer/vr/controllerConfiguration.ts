import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import type { VolumeViewerVrProps } from '../../VolumeViewer.types';
import { computeViewerYawBasis } from './viewerYaw';
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
  VrUiTargetType,
} from './types';
import {
  computePitchRotation,
  computeYawRotation,
  createVolumeScaleState,
} from './controllerVolumeGestures';

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
      const hudCategory = getHudCategoryFromTarget(activeType as VrUiTargetType | null);
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
            const yawBasisForward = new THREE.Vector3();
            const yawBasisRight = new THREE.Vector3();
            computeViewerYawBasis(rendererInstance, camera, yawBasisForward, yawBasisRight);
            const initialAngle = computeYawRotation(
              yawVector,
              yawBasisForward,
              yawBasisRight,
              placement.yaw,
            );
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
            const pitchBasisForward = new THREE.Vector3();
            const pitchBasisRight = new THREE.Vector3();
            computeViewerYawBasis(rendererInstance, camera, pitchBasisForward, pitchBasisRight);
            const initialAngle = computePitchRotation(
              pitchVector,
              pitchBasisForward,
              placement.pitch ?? 0,
            );
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
          const scaleState = createVolumeScaleState(
            vrHandleWorldPointRef.current,
            vrHandleSecondaryPointRef.current,
            volumeUserScaleRef.current,
          );
          if (scaleState) {
            entry.volumeScaleState = scaleState;
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
            const yawBasisForward = new THREE.Vector3();
            const yawBasisRight = new THREE.Vector3();
            computeViewerYawBasis(rendererInstance, camera, yawBasisForward, yawBasisRight);
            const initialAngle = computeYawRotation(
              vrHandleDirectionTempRef.current,
              yawBasisForward,
              yawBasisRight,
              volumeYawRef.current,
            );
            entry.volumeRotationState = {
              mode: 'yaw',
              initialYaw: volumeYawRef.current,
              initialAngle,
              basisForward: yawBasisForward,
              basisRight: yawBasisRight,
            };
          } else {
            vrHandleDirectionTempRef.current.x = 0;
            const pitchBasisForward = new THREE.Vector3();
            const pitchBasisRight = new THREE.Vector3();
            computeViewerYawBasis(rendererInstance, camera, pitchBasisForward, pitchBasisRight);
            const initialAngle = computePitchRotation(
              vrHandleDirectionTempRef.current,
              pitchBasisForward,
              volumePitchRef.current,
            );
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
      } else if (activeTarget?.type === 'channels-tab-toggle' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        vrCallbacks?.onChannelVisibilityToggle?.(region.channelId);
      } else if (activeTarget?.type === 'channels-layer' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        if (region.layerKey) {
          vrCallbacks?.onLayerSelect?.(region.layerKey);
        }
      } else if (activeTarget?.type === 'channels-render-style' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        if (!region.disabled && region.layerKey) {
          vrCallbacks?.onLayerRenderStyleToggle?.(region.layerKey);
        }
      } else if (activeTarget?.type === 'channels-sampling' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        if (!region.disabled && region.layerKey) {
          vrCallbacks?.onLayerSamplingModeToggle?.(region.layerKey);
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
      } else if (activeTarget?.type === 'channels-color' && activeTarget.data) {
        const region = activeTarget.data as VrChannelsInteractiveRegion;
        if (!region.disabled && region.layerKey && region.color) {
          vrCallbacks?.onLayerColorChange?.(region.layerKey, region.color);
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
      } else if (activeTarget?.type === 'tracks-slider' && activeTarget.data) {
        const region = activeTarget.data as VrTracksInteractiveRegion;
        if (!region.disabled && entry.hasHoverUiPoint) {
          applyVrTracksSliderFromPointRef.current?.(region, entry.hoverUiPoint);
        }
      } else if (activeTarget?.type === 'tracks-scroll' && activeTarget.data) {
        const region = activeTarget.data as VrTracksInteractiveRegion;
        if (!region.disabled && entry.hasHoverUiPoint) {
          applyVrTracksScrollFromPointRef.current?.(region, entry.hoverUiPoint);
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
