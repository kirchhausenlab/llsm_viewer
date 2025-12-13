import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createSessionHelpers } from '../src/components/viewers/volume-viewer/useVolumeViewerVr/helpers/session.ts';
import type { PlaybackState } from '../src/components/viewers/volume-viewer/vr/types.ts';

const createPlaybackState = (): PlaybackState => ({
  isPlaying: false,
  playbackDisabled: false,
  playbackLabel: '0/0',
  fps: 1,
  timeIndex: 0,
  totalTimepoints: 0,
  onTogglePlayback: () => {},
  onTimeIndexChange: () => {},
  onFpsChange: () => {},
  passthroughSupported: false,
  preferredSessionMode: 'immersive-vr',
  currentSessionMode: null,
});

(() => {
  const volumeRootGroup = new THREE.Group();
  const trackGroup = new THREE.Group();
  volumeRootGroup.add(trackGroup);

  const currentDimensionsRef = { current: { width: 10, height: 5, depth: 2 } };
  const volumeStepScaleRef = { current: 1 };
  const volumeRootBaseOffsetRef = { current: new THREE.Vector3() };

  const trackGroupScales: Array<[number, number, number]> = [];
  const volumeRootScales: Array<[number, number, number]> = [];

  const applyVolumeRootTransform = (dimensions: { width: number; height: number; depth: number } | null) => {
    const scale = dimensions ? 1 / Math.max(dimensions.width, dimensions.height, dimensions.depth) : 1;
    volumeRootGroup.scale.setScalar(scale);
    volumeRootGroup.updateMatrixWorld(true);
    volumeRootScales.push(volumeRootGroup.scale.toArray() as [number, number, number]);
  };

  const applyTrackGroupTransform = (dimensions: { width: number; height: number; depth: number } | null) => {
    const scale = dimensions ? 1 / Math.max(dimensions.width, dimensions.height, dimensions.depth) : 1;
    trackGroup.scale.setScalar(scale);
    trackGroup.updateMatrixWorld(true);
    trackGroupScales.push(trackGroup.scale.toArray() as [number, number, number]);
  };

  const { applySessionStartState, applySessionEndState } = createSessionHelpers({
    rendererRef: { current: null },
    cameraRef: { current: null },
    controlsRef: { current: null },
    sceneRef: { current: null },
    controllersRef: { current: [] },
    playbackStateRef: { current: createPlaybackState() },
    xrSessionRef: { current: null },
    sessionCleanupRef: { current: null },
    preVrCameraStateRef: { current: null },
    xrPreferredSessionModeRef: { current: 'immersive-vr' },
    xrCurrentSessionModeRef: { current: null },
    xrPendingModeSwitchRef: { current: null },
    xrPassthroughSupportedRef: { current: false },
    xrFoveationAppliedRef: { current: false },
    xrPreviousFoveationRef: { current: undefined },
    setControllerVisibility: () => {},
    applyVrPlaybackHoverState: () => {},
    updateVrPlaybackHud: () => {},
    onAfterSessionEnd: undefined,
    vrLogRef: { current: null },
    disposedRef: { current: false },
    applyVrFoveation: () => {},
    restoreVrFoveation: () => {},
    volumeStepScaleRef,
    applyVolumeStepScaleToResources: () => {},
    volumeRootBaseOffsetRef,
    applyVolumeRootTransform,
    applyTrackGroupTransform,
    currentDimensionsRef,
    refreshControllerVisibility: () => {},
    setVrPlaybackHudVisible: () => {},
    setVrChannelsHudVisible: () => {},
    setVrTracksHudVisible: () => {},
    resetVrPlaybackHudPlacement: () => {},
    resetVrChannelsHudPlacement: () => {},
    resetVrTracksHudPlacement: () => {},
    updateVrChannelsHud: () => {},
    updateVrTracksHud: () => {},
    updateControllerRaysRef: { current: () => {} },
    updateVolumeHandles: () => {},
    sessionManagerRef: { current: null },
    vrPropsRef: { current: null },
    requestVrSessionRef: { current: null },
    endVrSessionRequestRef: { current: null },
  });

  applySessionStartState();
  applySessionEndState();

  volumeRootScales.forEach((scale, index) => {
    assert.deepStrictEqual(scale, trackGroupScales[index]);
  });
})();
