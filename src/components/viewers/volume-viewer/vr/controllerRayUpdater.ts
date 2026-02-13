import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';

import type { TrackLineResource } from '../../VolumeViewer.types';
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
} from './types';
import { clampUiRayLength } from './controllerHudInteractions';
import { resolveVolumeRayDomain } from './controllerRayVolumeDomain';
import {
  type ControllerRaySummary
} from './controllerRayRegionState';
import {
  applyControllerUiFlags,
  createEmptyControllerUiFlags
} from './controllerRayUiFlags';
import { resolveControllerUiCandidates } from './controllerRayHudCandidates';
import { applyControllerHudTransforms } from './controllerRayHudTransforms';
import { resolveControllerTrackIntersection } from './controllerRayTrackIntersections';
import { finalizeControllerRayFrame } from './controllerRayFrameFinalize';

export type ControllerRayDependencies = {
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  containerRef: MutableRefObject<HTMLElement | null>;
  controllersRef: MutableRefObject<ControllerEntry[]>;
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  vrLogRef: MutableRefObject<((...args: Parameters<typeof console.debug>) => void) | null>;
  lastControllerRaySummaryRef: MutableRefObject<ControllerRaySummary | null>;
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
  volumeAnisotropyScaleRef: MutableRefObject<{ x: number; y: number; z: number }>;
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
    volumeAnisotropyScaleRef,
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
  const playbackCandidatePoint = new THREE.Vector3();
  const channelsCandidatePoint = new THREE.Vector3();
  const tracksCandidatePoint = new THREE.Vector3();
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
    let uiFlags = createEmptyControllerUiFlags();
    let nextChannelsHoverRegion: VrChannelsInteractiveRegion | null = null;
    let nextTracksHoverRegion: VrTracksInteractiveRegion | null = null;

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
      const {
        handleCandidateTarget,
        handleCandidatePoint,
        handleCandidateDistance,
        rayLength: nextRayLength,
      } = resolveVolumeRayDomain({
        entry,
        initialRayLength: rayLength,
        translationHandle: vrTranslationHandleRef.current,
        scaleHandle: vrVolumeScaleHandleRef.current,
        yawHandles: vrVolumeYawHandlesRef.current,
        pitchHandle: vrVolumePitchHandleRef.current,
        applyVolumeYawPitch,
        volumeRootGroup: volumeRootGroupRef.current,
        volumeRootCenterUnscaledRef,
        volumeRootBaseOffsetRef,
        volumeNormalizationScaleRef,
        volumeAnisotropyScaleRef,
        volumeUserScaleRef,
        volumeYawRef,
        volumePitchRef,
        temps: {
          translationHandleWorldPoint,
          rotationCenterWorldPoint,
          rotationDirectionTemp,
          rotationHandleWorldPoint,
          scaleHandleWorldPoint,
          scaleDirectionTemp,
          scaleTargetWorldPoint,
        },
      });
      rayLength = nextRayLength;

      if (handleCandidateTarget && handleCandidatePoint) {
        const target = handleCandidateTarget as VrUiTarget;
        entry.hoverUiTarget = target;
        entry.hasHoverUiPoint = true;
        entry.hoverUiPoint.copy(handleCandidatePoint);
        const candidateDistance = clampUiRayLength(handleCandidateDistance);
        rayLength = Math.min(rayLength, candidateDistance);
        hoverTrackId = null;
        nextChannelsHoverRegion = null;
      } else {
        const candidateResolution = resolveControllerUiCandidates({
          entry,
          playbackStateRef,
          playbackHudInstance,
          channelsHudInstance,
          tracksHudInstance,
          resolveChannelsRegionFromPoint,
          resolveTracksRegionFromPoint,
          applyPlaybackSliderFromWorldPointRef,
          applyFpsSliderFromWorldPointRef,
          applyVrChannelsSliderFromPointRef,
          applyVrTracksSliderFromPointRef,
          applyVrTracksScrollFromPointRef,
          vrHudPlaneRef,
          vrHudPlanePointRef,
          vrHudForwardRef,
          vrHandleWorldPointRef,
          vrHandleSecondaryPointRef,
          vrChannelsLocalPointRef,
          vrTracksLocalPointRef,
          playbackTouchPoint,
          playbackLocalPoint,
          playbackPlaneNormal,
          playbackSliderPoint,
          fpsSliderPoint,
          channelsTouchPoint,
          tracksTouchPoint,
          playbackCandidatePoint,
          channelsCandidatePoint,
          tracksCandidatePoint,
          uiRayLength,
          nextChannelsHoverRegion,
          nextTracksHoverRegion,
        });
        uiRayLength = candidateResolution.uiRayLength;
        nextChannelsHoverRegion = candidateResolution.nextChannelsHoverRegion;
        nextTracksHoverRegion = candidateResolution.nextTracksHoverRegion;
      }
      const uiType = entry.hoverUiTarget ? entry.hoverUiTarget.type : null;
      const uiState = applyControllerUiFlags({
        hoverUiType: uiType,
        activeUiType: entry.activeUiTarget?.type ?? null,
        hoverTrackId,
        flags: uiFlags
      });
      hoverTrackId = uiState.hoverTrackId;
      uiFlags = uiState.flags;

      if (uiRayLength !== null && Number.isFinite(uiRayLength)) {
        rayLength = Math.min(rayLength, uiRayLength);
      }

      applyControllerHudTransforms({
        entry,
        playbackHudInstance,
        channelsHudInstance,
        tracksHudInstance,
        vrPlaybackHudPlacement: vrPlaybackHudPlacementRef.current,
        vrChannelsHudPlacement: vrChannelsHudPlacementRef.current,
        vrTracksHudPlacement: vrTracksHudPlacementRef.current,
        vrPlaybackHudDragTarget: vrPlaybackHudDragTargetRef.current,
        vrChannelsHudDragTarget: vrChannelsHudDragTargetRef.current,
        vrTracksHudDragTarget: vrTracksHudDragTargetRef.current,
        vrHudYawVector: vrHudYawVectorRef.current,
        vrHudPitchVector: vrHudPitchVectorRef.current,
        setVrPlaybackHudPlacementPosition,
        setVrChannelsHudPlacementPosition,
        setVrTracksHudPlacementPosition,
        setVrPlaybackHudPlacementYaw,
        setVrChannelsHudPlacementYaw,
        setVrTracksHudPlacementYaw,
        setVrPlaybackHudPlacementPitch,
        setVrChannelsHudPlacementPitch,
        setVrTracksHudPlacementPitch,
      });

      if (cameraInstance) {
        const intersectionResolution = resolveControllerTrackIntersection({
          entry,
          visibleLines,
          renderer,
          cameraInstance,
          containerInstance,
          controllerProjectedPoint,
          initialHoverTrackId: hoverTrackId,
          initialRayLength: rayLength,
        });
        hoverTrackId = intersectionResolution.hoverTrackId;
        hoverPosition = intersectionResolution.hoverPosition;
        rayLength = intersectionResolution.rayLength;
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

    const summary = finalizeControllerRayFrame({
      uiFlags,
      nextChannelsHoverRegion,
      nextTracksHoverRegion,
      hoveredByController,
      visibleLinesCount: visibleLines.length,
      controllers: controllersRef.current,
      log,
      lastControllerRaySummary,
      applyVrPlaybackHoverState,
      vrChannelsHud: vrChannelsHudRef.current,
      vrTracksHud: vrTracksHudRef.current,
      renderVrChannelsHud: renderVrChannelsHudRef.current,
      renderVrTracksHud: renderVrTracksHudRef.current,
      vrChannelsState: vrChannelsStateRef.current,
      vrTracksState: vrTracksStateRef.current,
      vrUpdateHoverState: vrUpdateHoverStateRef.current,
      vrClearHoverState: vrClearHoverStateRef.current,
    });
    lastControllerRaySummary = summary;
    lastControllerRaySummaryRef.current = summary;
  };
}
