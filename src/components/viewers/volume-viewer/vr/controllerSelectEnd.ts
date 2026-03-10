import type { ControllerInputDependencies } from './controllerInputDependencies';
import type {
  ControllerEntry,
  VrChannelsInteractiveRegion,
  VrTracksInteractiveRegion,
} from './types';

type ControllerSelectEndDependencies = Pick<
  ControllerInputDependencies,
  | 'playbackStateRef'
  | 'applyPlaybackSliderFromWorldPointRef'
  | 'applyFpsSliderFromWorldPointRef'
  | 'onResetVolumeRef'
  | 'onResetHudPlacementRef'
  | 'endVrSessionRequestRef'
  | 'toggleXrSessionMode'
  | 'vrChannelsStateRef'
  | 'vrTracksStateRef'
  | 'updateVrChannelsHudRef'
  | 'onTrackFollowRequestRef'
  | 'vrPropsRef'
  | 'applyVrChannelsSliderFromPointRef'
  | 'applyVrTracksSliderFromPointRef'
  | 'applyVrTracksScrollFromPointRef'
> & {
  log: (...args: Parameters<typeof console.debug>) => void;
};

export function handleControllerSelectEnd(
  entry: ControllerEntry,
  index: number,
  deps: ControllerSelectEndDependencies,
) {
  const {
    playbackStateRef,
    applyPlaybackSliderFromWorldPointRef,
    applyFpsSliderFromWorldPointRef,
    onResetVolumeRef,
    onResetHudPlacementRef,
    endVrSessionRequestRef,
    toggleXrSessionMode,
    vrChannelsStateRef,
    vrTracksStateRef,
    updateVrChannelsHudRef,
    onTrackFollowRequestRef,
    vrPropsRef,
    applyVrChannelsSliderFromPointRef,
    applyVrTracksSliderFromPointRef,
    applyVrTracksScrollFromPointRef,
    log,
  } = deps;

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
}
