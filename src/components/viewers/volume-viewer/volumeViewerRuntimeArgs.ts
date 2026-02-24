import type { VolumeViewerVrBridgeOptions } from './useVolumeViewerVrBridge';
import type { useVolumeViewerLifecycle } from './useVolumeViewerLifecycle';

export type VolumeViewerLifecycleParams = Parameters<typeof useVolumeViewerLifecycle>[0];

export type VolumeViewerVrBridgeOptionGroups = {
  vr: VolumeViewerVrBridgeOptions['vr'];
  refs: Pick<
    VolumeViewerVrBridgeOptions,
    | 'containerRef'
    | 'rendererRef'
    | 'cameraRef'
    | 'controlsRef'
    | 'sceneRef'
    | 'volumeRootGroupRef'
    | 'currentDimensionsRef'
    | 'volumeRootBaseOffsetRef'
    | 'volumeRootCenterOffsetRef'
    | 'volumeRootCenterUnscaledRef'
    | 'volumeRootHalfExtentsRef'
    | 'volumeNormalizationScaleRef'
    | 'volumeAnisotropyScaleRef'
    | 'volumeUserScaleRef'
    | 'volumeRootRotatedCenterTempRef'
    | 'volumeStepScaleRef'
    | 'volumeYawRef'
    | 'volumePitchRef'
    | 'trackGroupRef'
    | 'resourcesRef'
    | 'timeIndexRef'
    | 'movementStateRef'
    | 'trackLinesRef'
    | 'followTargetOffsetRef'
    | 'hasActive3DLayerRef'
  >;
  playbackState: VolumeViewerVrBridgeOptions['playbackState'];
  vrState: Pick<
    VolumeViewerVrBridgeOptions,
    | 'isVrPassthroughSupported'
    | 'channelPanels'
    | 'activeChannelPanelId'
    | 'trackChannels'
    | 'activeTrackChannelId'
  >;
  trackState: Pick<
    VolumeViewerVrBridgeOptions,
    | 'tracks'
    | 'trackVisibility'
    | 'trackOpacityByTrackSet'
    | 'trackLineWidthByTrackSet'
    | 'trackColorModesByTrackSet'
    | 'selectedTrackIds'
    | 'followedTrackId'
  >;
  callbacks: Pick<
    VolumeViewerVrBridgeOptions,
    | 'updateHoverState'
    | 'clearHoverState'
    | 'onResetVolume'
    | 'onResetHudPlacement'
    | 'onTrackFollowRequest'
    | 'vrLog'
    | 'onAfterSessionEnd'
  >;
};

export function buildVolumeViewerVrBridgeOptions({
  vr,
  refs,
  playbackState,
  vrState,
  trackState,
  callbacks,
}: VolumeViewerVrBridgeOptionGroups): VolumeViewerVrBridgeOptions {
  return {
    vr,
    ...refs,
    playbackState,
    ...vrState,
    ...trackState,
    ...callbacks,
  };
}

export type VolumeViewerLifecycleOptionGroups = {
  core: Pick<
    VolumeViewerLifecycleParams,
    | 'containerNode'
    | 'onRegisterCaptureTarget'
    | 'initializeRenderContext'
    | 'createPointerLookHandlers'
    | 'handleResize'
  >;
  renderLoop: Pick<
    VolumeViewerLifecycleParams,
    | 'applyKeyboardRotation'
    | 'applyKeyboardMovement'
    | 'updateTrackAppearance'
    | 'advancePlaybackFrame'
    | 'updateControllerRays'
    | 'controllersRef'
    | 'vrLog'
    | 'followTargetActiveRef'
    | 'followTargetOffsetRef'
    | 'resourcesRef'
    | 'rotationTargetRef'
    | 'refreshVrHudPlacementsRef'
    | 'currentDimensionsRef'
    | 'rendererRef'
    | 'sceneRef'
    | 'cameraRef'
    | 'controlsRef'
    | 'raycasterRef'
    | 'volumeRootGroupRef'
    | 'trackGroupRef'
    | 'applyVolumeRootTransformRef'
    | 'applyTrackGroupTransformRef'
    | 'preservedViewStateRef'
    | 'setRenderContextRevision'
    | 'refreshTrackOverlay'
  >;
  interaction: Pick<
    VolumeViewerLifecycleParams,
    | 'layersRef'
    | 'paintbrushRef'
    | 'paintStrokePointerIdRef'
    | 'hoverIntensityRef'
    | 'followedTrackIdRef'
    | 'updateVoxelHover'
    | 'performHoverHitTest'
    | 'clearHoverState'
    | 'clearVoxelHover'
    | 'resolveHoveredFollowTarget'
    | 'onTrackSelectionToggle'
    | 'onVoxelFollowRequest'
  >;
  hoverLifecycle: Pick<
    VolumeViewerLifecycleParams,
    | 'resetHoverState'
    | 'markHoverInitializationFailed'
    | 'markHoverInitialized'
    | 'teardownHover'
    | 'setHoverNotReady'
  >;
  vrLifecycle: Pick<
    VolumeViewerLifecycleParams,
    | 'restoreVrFoveation'
    | 'applyVolumeStepScaleToResources'
    | 'setControllerVisibility'
    | 'xrSessionRef'
    | 'sessionCleanupRef'
    | 'endVrSessionRequestRef'
    | 'applyVrPlaybackHoverState'
    | 'createVrPlaybackHud'
    | 'createVrChannelsHud'
    | 'createVrTracksHud'
    | 'vrPlaybackHudRef'
    | 'vrChannelsHudRef'
    | 'vrTracksHudRef'
    | 'vrPlaybackHudPlacementRef'
    | 'vrChannelsHudPlacementRef'
    | 'vrTracksHudPlacementRef'
    | 'resetVrPlaybackHudPlacement'
    | 'resetVrChannelsHudPlacement'
    | 'resetVrTracksHudPlacement'
    | 'updateVrPlaybackHud'
    | 'updateVrChannelsHud'
    | 'updateVrTracksHud'
    | 'onRendererInitialized'
    | 'vrTranslationHandleRef'
    | 'vrVolumeScaleHandleRef'
    | 'vrVolumeYawHandlesRef'
    | 'vrVolumePitchHandleRef'
    | 'disposeTrackResources'
  >;
};

export function buildVolumeViewerLifecycleParams({
  core,
  renderLoop,
  interaction,
  hoverLifecycle,
  vrLifecycle,
}: VolumeViewerLifecycleOptionGroups): VolumeViewerLifecycleParams {
  return {
    ...core,
    ...renderLoop,
    ...interaction,
    ...hoverLifecycle,
    ...vrLifecycle,
  };
}
