import type { MutableRefObject } from 'react';
import type * as THREE from 'three';

import type {
  ControllerEntry,
  PlaybackState,
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksInteractiveRegion,
} from './types';
import { clampUiRayLength } from './controllerHudInteractions';
import type { AnyCandidate } from './controllerRayHudCandidateTypes';
import { resolvePlaybackUiCandidate } from './controllerRayPlaybackCandidates';
import { resolveChannelsUiCandidate } from './controllerRayChannelsCandidates';
import { resolveTracksUiCandidate } from './controllerRayTracksCandidates';

export type ResolveControllerUiCandidatesDeps = {
  entry: ControllerEntry;
  playbackStateRef: MutableRefObject<PlaybackState>;
  playbackHudInstance: VrPlaybackHud | null;
  channelsHudInstance: VrChannelsHud | null;
  tracksHudInstance: VrTracksHud | null;
  resolveChannelsRegionFromPoint: (
    hud: VrChannelsHud,
    point: THREE.Vector3,
  ) => VrChannelsInteractiveRegion | null;
  resolveTracksRegionFromPoint: (
    hud: VrTracksHud,
    point: THREE.Vector3,
  ) => VrTracksInteractiveRegion | null;
  applyPlaybackSliderFromWorldPointRef: MutableRefObject<((worldPoint: THREE.Vector3) => void) | null>;
  applyFpsSliderFromWorldPointRef: MutableRefObject<((worldPoint: THREE.Vector3) => void) | null>;
  applyVrChannelsSliderFromPointRef: MutableRefObject<
    ((region: VrChannelsInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  applyVrTracksSliderFromPointRef: MutableRefObject<
    ((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  applyVrTracksScrollFromPointRef: MutableRefObject<
    ((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null
  >;
  vrHudPlaneRef: MutableRefObject<THREE.Plane>;
  vrHudPlanePointRef: MutableRefObject<THREE.Vector3>;
  vrHudForwardRef: MutableRefObject<THREE.Vector3>;
  vrHandleWorldPointRef: MutableRefObject<THREE.Vector3>;
  vrHandleSecondaryPointRef: MutableRefObject<THREE.Vector3>;
  vrChannelsLocalPointRef: MutableRefObject<THREE.Vector3>;
  vrTracksLocalPointRef: MutableRefObject<THREE.Vector3>;
  playbackTouchPoint: THREE.Vector3;
  playbackLocalPoint: THREE.Vector3;
  playbackPlaneNormal: THREE.Vector3;
  playbackSliderPoint: THREE.Vector3;
  fpsSliderPoint: THREE.Vector3;
  channelsTouchPoint: THREE.Vector3;
  tracksTouchPoint: THREE.Vector3;
  playbackCandidatePoint: THREE.Vector3;
  channelsCandidatePoint: THREE.Vector3;
  tracksCandidatePoint: THREE.Vector3;
  uiRayLength: number | null;
  nextChannelsHoverRegion: VrChannelsInteractiveRegion | null;
  nextTracksHoverRegion: VrTracksInteractiveRegion | null;
};

export type ResolveControllerUiCandidatesResult = {
  uiRayLength: number | null;
  nextChannelsHoverRegion: VrChannelsInteractiveRegion | null;
  nextTracksHoverRegion: VrTracksInteractiveRegion | null;
};

export function resolveControllerUiCandidates(
  deps: ResolveControllerUiCandidatesDeps,
): ResolveControllerUiCandidatesResult {
  const {
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
  } = deps;
  let { uiRayLength, nextChannelsHoverRegion, nextTracksHoverRegion } = deps;

  const playbackCandidate = resolvePlaybackUiCandidate({
    entry,
    playbackStateRef,
    playbackHudInstance,
    applyPlaybackSliderFromWorldPointRef,
    applyFpsSliderFromWorldPointRef,
    vrHudPlaneRef,
    vrHudPlanePointRef,
    vrHudForwardRef,
    vrHandleWorldPointRef,
    vrHandleSecondaryPointRef,
    playbackTouchPoint,
    playbackLocalPoint,
    playbackPlaneNormal,
    playbackSliderPoint,
    fpsSliderPoint,
    playbackCandidatePoint,
  });

  const channelsResult = resolveChannelsUiCandidate({
    entry,
    channelsHudInstance,
    resolveChannelsRegionFromPoint,
    applyVrChannelsSliderFromPointRef,
    vrHudPlaneRef,
    vrHudPlanePointRef,
    vrHudForwardRef,
    vrHandleWorldPointRef,
    vrHandleSecondaryPointRef,
    vrChannelsLocalPointRef,
    channelsTouchPoint,
    channelsCandidatePoint,
  });
  const channelsCandidate = channelsResult.candidate;
  nextChannelsHoverRegion = channelsResult.hoverRegion;

  const tracksResult = resolveTracksUiCandidate({
    entry,
    tracksHudInstance,
    resolveTracksRegionFromPoint,
    applyVrTracksSliderFromPointRef,
    applyVrTracksScrollFromPointRef,
    vrHudPlaneRef,
    vrHudPlanePointRef,
    vrHudForwardRef,
    vrHandleWorldPointRef,
    vrHandleSecondaryPointRef,
    vrTracksLocalPointRef,
    tracksTouchPoint,
    tracksCandidatePoint,
  });
  const tracksCandidate = tracksResult.candidate;
  nextTracksHoverRegion = tracksResult.hoverRegion;

  const candidates: Array<AnyCandidate | null> = [playbackCandidate, channelsCandidate, tracksCandidate];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const candidateRayLength = clampUiRayLength(candidate.distance);
    uiRayLength = uiRayLength === null ? candidateRayLength : Math.min(uiRayLength, candidateRayLength);
  }

  let chosenCandidate: AnyCandidate | null = playbackCandidate;
  const channelsDistance = channelsCandidate?.distance ?? Number.POSITIVE_INFINITY;
  const playbackDistance = chosenCandidate?.distance ?? Number.POSITIVE_INFINITY;
  if (channelsDistance < playbackDistance) {
    chosenCandidate = channelsCandidate;
  }
  const tracksDistance = tracksCandidate?.distance ?? Number.POSITIVE_INFINITY;
  const chosenDistance = chosenCandidate?.distance ?? Number.POSITIVE_INFINITY;
  if (tracksDistance < chosenDistance) {
    chosenCandidate = tracksCandidate;
  }

  if (chosenCandidate) {
    entry.hoverUiTarget = chosenCandidate.target;
    entry.hasHoverUiPoint = true;
    entry.hoverUiPoint.copy(chosenCandidate.point);
    const candidateDistance = clampUiRayLength(chosenCandidate.distance);
    uiRayLength = uiRayLength === null ? candidateDistance : Math.min(uiRayLength, candidateDistance);
    if (chosenCandidate.category === 'channels' && chosenCandidate.region) {
      nextChannelsHoverRegion = chosenCandidate.region;
    } else if (chosenCandidate.category === 'tracks' && chosenCandidate.region) {
      nextTracksHoverRegion = chosenCandidate.region;
    }
  }

  return {
    uiRayLength,
    nextChannelsHoverRegion,
    nextTracksHoverRegion,
  };
}
