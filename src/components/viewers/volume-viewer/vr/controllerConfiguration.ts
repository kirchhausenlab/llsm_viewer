import type { ControllerEntry } from './types';
import type { ControllerInputDependencies } from './controllerInputDependencies';
export type { ControllerInputDependencies } from './controllerInputDependencies';
import {
  handleControllerConnected,
  handleControllerDisconnected,
} from './controllerConnectionLifecycle';
import { handleControllerSelectStart } from './controllerSelectStart';
import { handleControllerSelectEnd } from './controllerSelectEnd';

export type ControllerEntryConfigurator = (entry: ControllerEntry, index: number) => void;

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
      handleControllerConnected(entry, index, event, log, refreshControllers);
    };

    entry.onDisconnected = () => {
      handleControllerDisconnected(entry, index, log, refreshControllers, vrClearHoverStateRef);
    };

    entry.onSelectStart = () => {
      handleControllerSelectStart(entry, index, {
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
        log,
      });
    };

    entry.onSelectEnd = () => {
      handleControllerSelectEnd(entry, index, {
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
      });
    };
  };
}
