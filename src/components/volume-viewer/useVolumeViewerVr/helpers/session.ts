import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import {
  DESKTOP_VOLUME_STEP_SCALE,
  VR_VOLUME_BASE_OFFSET,
  VR_VOLUME_STEP_SCALE,
  type VolumeDimensions,
} from '../../vr';
import { bindSessionRequests, createSessionLifecycle } from '../../vr/session';
import { VrSessionManager } from '../../vr/sessionManager';
import type { UseVolumeViewerVrParams, UseVolumeViewerVrResult } from '../../useVolumeViewerVr.types';
import type { ControllerEntry, PlaybackState } from '../../vr';
import type { VolumeViewerVrProps } from '../../../VolumeViewer.types';

export type CreateSessionHelpersParams = {
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  controllersRef: MutableRefObject<ControllerEntry[]>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  xrSessionRef: MutableRefObject<XRSession | null>;
  sessionCleanupRef: MutableRefObject<(() => void) | null>;
  preVrCameraStateRef: MutableRefObject<{
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    target: THREE.Vector3;
  } | null>;
  xrPreferredSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar'>;
  xrCurrentSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
  xrPendingModeSwitchRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
  xrPassthroughSupportedRef: MutableRefObject<boolean>;
  xrFoveationAppliedRef: MutableRefObject<boolean>;
  xrPreviousFoveationRef: MutableRefObject<number | undefined>;
  setControllerVisibility: UseVolumeViewerVrResult['setControllerVisibility'];
  applyVrPlaybackHoverState: UseVolumeViewerVrResult['applyVrPlaybackHoverState'];
  updateVrPlaybackHud: UseVolumeViewerVrResult['updateVrPlaybackHud'];
  onAfterSessionEnd: (() => void) | undefined;
  vrLogRef: MutableRefObject<UseVolumeViewerVrParams['vrLog'] | null | undefined>;
  disposedRef: MutableRefObject<boolean>;
  applyVrFoveation: UseVolumeViewerVrResult['applyVrFoveation'];
  restoreVrFoveation: UseVolumeViewerVrResult['restoreVrFoveation'];
  applyVolumeStepScaleToResources: UseVolumeViewerVrResult['applyVolumeStepScaleToResources'];
  volumeRootBaseOffsetRef: MutableRefObject<THREE.Vector3>;
  applyVolumeRootTransform: UseVolumeViewerVrResult['applyVolumeRootTransform'];
  currentDimensionsRef: MutableRefObject<VolumeDimensions | null>;
  refreshControllerVisibility: UseVolumeViewerVrResult['refreshControllerVisibility'];
  setVrPlaybackHudVisible: UseVolumeViewerVrResult['setVrPlaybackHudVisible'];
  setVrChannelsHudVisible: UseVolumeViewerVrResult['setVrChannelsHudVisible'];
  setVrTracksHudVisible: UseVolumeViewerVrResult['setVrTracksHudVisible'];
  resetVrPlaybackHudPlacement: UseVolumeViewerVrResult['resetVrPlaybackHudPlacement'];
  resetVrChannelsHudPlacement: UseVolumeViewerVrResult['resetVrChannelsHudPlacement'];
  resetVrTracksHudPlacement: UseVolumeViewerVrResult['resetVrTracksHudPlacement'];
  updateVrChannelsHud: UseVolumeViewerVrResult['updateVrChannelsHud'];
  updateVrTracksHud: UseVolumeViewerVrResult['updateVrTracksHud'];
  updateControllerRaysRef: MutableRefObject<() => void>;
  updateVolumeHandles: UseVolumeViewerVrResult['updateVolumeHandles'];
  sessionManagerRef: MutableRefObject<VrSessionManager | null>;
  vrPropsRef: MutableRefObject<VolumeViewerVrProps | null>;
  requestVrSessionRef: MutableRefObject<(() => Promise<XRSession>) | null>;
  endVrSessionRequestRef: MutableRefObject<(() => Promise<void> | void) | null>;
};

export type CreateSessionHelpersResult = {
  applySessionStartState: () => void;
  applySessionEndState: () => void;
  sessionManager: ReturnType<typeof createSessionLifecycle>['sessionManager'];
  callOnVrSessionStarted: UseVolumeViewerVrResult['callOnVrSessionStarted'];
  callOnVrSessionEnded: UseVolumeViewerVrResult['callOnVrSessionEnded'];
  attachSessionManager: () => () => void;
  requestVrSession: UseVolumeViewerVrResult['requestVrSession'];
  endVrSession: UseVolumeViewerVrResult['endVrSession'];
  callOnRegisterVrSession: UseVolumeViewerVrResult['callOnRegisterVrSession'];
  attachRequestRef: () => () => void;
  attachEndRef: () => () => void;
};

export function createSessionHelpers({
  rendererRef,
  cameraRef,
  controlsRef,
  sceneRef,
  controllersRef,
  playbackStateRef,
  xrSessionRef,
  sessionCleanupRef,
  preVrCameraStateRef,
  xrPreferredSessionModeRef,
  xrCurrentSessionModeRef,
  xrPendingModeSwitchRef,
  xrPassthroughSupportedRef,
  xrFoveationAppliedRef,
  xrPreviousFoveationRef,
  setControllerVisibility,
  applyVrPlaybackHoverState,
  updateVrPlaybackHud,
  onAfterSessionEnd,
  vrLogRef,
  disposedRef,
  applyVrFoveation,
  restoreVrFoveation,
  applyVolumeStepScaleToResources,
  volumeRootBaseOffsetRef,
  applyVolumeRootTransform,
  currentDimensionsRef,
  refreshControllerVisibility,
  setVrPlaybackHudVisible,
  setVrChannelsHudVisible,
  setVrTracksHudVisible,
  resetVrPlaybackHudPlacement,
  resetVrChannelsHudPlacement,
  resetVrTracksHudPlacement,
  updateVrChannelsHud,
  updateVrTracksHud,
  updateControllerRaysRef,
  updateVolumeHandles,
  sessionManagerRef,
  vrPropsRef,
  requestVrSessionRef,
  endVrSessionRequestRef,
}: CreateSessionHelpersParams): CreateSessionHelpersResult {
  const applySessionStartState = () => {
    applyVrFoveation();
    applyVolumeStepScaleToResources(VR_VOLUME_STEP_SCALE);
    volumeRootBaseOffsetRef.current.copy(VR_VOLUME_BASE_OFFSET);
    applyVolumeRootTransform(currentDimensionsRef.current);
    refreshControllerVisibility();
    setVrPlaybackHudVisible(true);
    setVrChannelsHudVisible(true);
    setVrTracksHudVisible(true);
    resetVrPlaybackHudPlacement();
    resetVrChannelsHudPlacement();
    resetVrTracksHudPlacement();
    updateVrPlaybackHud();
    updateVrChannelsHud();
    updateVrTracksHud();
    updateControllerRaysRef.current();
    updateVolumeHandles();
  };

  const applySessionEndState = () => {
    restoreVrFoveation();
    applyVolumeStepScaleToResources(DESKTOP_VOLUME_STEP_SCALE);
    volumeRootBaseOffsetRef.current.set(0, 0, 0);
    applyVolumeRootTransform(currentDimensionsRef.current);
    refreshControllerVisibility();
    setVrPlaybackHudVisible(false);
    setVrChannelsHudVisible(false);
    setVrTracksHudVisible(false);
    updateVolumeHandles();
  };

  const { sessionManager, callOnVrSessionStarted, callOnVrSessionEnded, attachSessionManager } =
    createSessionLifecycle({
      createManager: (handlers) =>
        new VrSessionManager({
          rendererRef,
          cameraRef,
          controlsRef,
          sceneRef,
          controllersRef,
          playbackStateRef,
          xrSessionRef,
          sessionCleanupRef,
          preVrCameraStateRef,
          xrPreferredSessionModeRef,
          xrCurrentSessionModeRef,
          xrPendingModeSwitchRef,
          xrPassthroughSupportedRef,
          xrFoveationAppliedRef,
          xrPreviousFoveationRef,
          setControllerVisibility,
          applyVrPlaybackHoverState,
          updateVrPlaybackHud,
          onSessionStarted: handlers.onSessionStarted,
          onSessionEnded: handlers.onSessionEnded,
          onAfterSessionEnd,
          vrLogRef,
          disposedRef,
        }),
      sessionManagerRef,
      applySessionStartState,
      applySessionEndState,
      disposedRef,
      vrPropsRef,
    });

  const { requestVrSession, endVrSession, callOnRegisterVrSession, attachRequestRef, attachEndRef } =
    bindSessionRequests({
      sessionManagerRef,
      requestSessionRef: requestVrSessionRef,
      endSessionRequestRef: endVrSessionRequestRef,
      vrPropsRef,
    });

  return {
    applySessionStartState,
    applySessionEndState,
    sessionManager,
    callOnVrSessionStarted,
    callOnVrSessionEnded,
    attachSessionManager,
    requestVrSession,
    endVrSession,
    callOnRegisterVrSession,
    attachRequestRef,
    attachEndRef,
  };
}
