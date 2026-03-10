import type {
  ControllerEntry,
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrChannelsState,
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksState,
} from './types';
import {
  isSameChannelsRegion,
  isSameTracksRegion,
  shouldLogControllerRaySummary,
  type ControllerRaySummary,
} from './controllerRayRegionState';
import type { ControllerUiFlagState } from './controllerRayUiFlags';

export function finalizeControllerRayFrame(params: {
  uiFlags: ControllerUiFlagState;
  nextChannelsHoverRegion: VrChannelsInteractiveRegion | null;
  nextTracksHoverRegion: VrTracksInteractiveRegion | null;
  hoveredByController: { trackId: string; position: { x: number; y: number } | null } | null;
  visibleLinesCount: number;
  controllers: ControllerEntry[];
  log: ((...args: Parameters<typeof console.debug>) => void) | null;
  lastControllerRaySummary: ControllerRaySummary | null;
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
  vrChannelsHud: VrChannelsHud | null;
  vrTracksHud: VrTracksHud | null;
  renderVrChannelsHud: ((hud: VrChannelsHud, state: VrChannelsState) => void) | null;
  renderVrTracksHud: ((hud: VrTracksHud, state: VrTracksState) => void) | null;
  vrChannelsState: VrChannelsState;
  vrTracksState: VrTracksState;
  vrUpdateHoverState: ((trackId: string | null, position: { x: number; y: number } | null, source?: 'pointer' | 'controller') => void) | null;
  vrClearHoverState: ((source?: 'pointer' | 'controller') => void) | null;
}): ControllerRaySummary {
  const {
    uiFlags,
    nextChannelsHoverRegion,
    nextTracksHoverRegion,
    hoveredByController,
    visibleLinesCount,
    controllers,
    log,
    lastControllerRaySummary,
    applyVrPlaybackHoverState,
    vrChannelsHud,
    vrTracksHud,
    renderVrChannelsHud,
    renderVrTracksHud,
    vrChannelsState,
    vrTracksState,
    vrUpdateHoverState,
    vrClearHoverState,
  } = params;

  applyVrPlaybackHoverState(
    uiFlags.playHoveredAny,
    uiFlags.playbackSliderHoveredAny,
    uiFlags.playbackSliderActiveAny,
    uiFlags.fpsSliderHoveredAny,
    uiFlags.fpsSliderActiveAny,
    uiFlags.resetVolumeHoveredAny,
    uiFlags.resetHudHoveredAny,
    uiFlags.exitHoveredAny,
    uiFlags.modeHoveredAny,
  );

  if (vrChannelsHud && !isSameChannelsRegion(vrChannelsHud.hoverRegion, nextChannelsHoverRegion)) {
    vrChannelsHud.hoverRegion = nextChannelsHoverRegion;
    renderVrChannelsHud?.(vrChannelsHud, vrChannelsState);
  }

  if (vrTracksHud && !isSameTracksRegion(vrTracksHud.hoverRegion, nextTracksHoverRegion)) {
    vrTracksHud.hoverRegion = nextTracksHoverRegion;
    renderVrTracksHud?.(vrTracksHud, vrTracksState);
  }

  const summary: ControllerRaySummary = {
    presenting: true,
    visibleLines: visibleLinesCount,
    hoverTrackIds: controllers.map((entry) => entry.hoverTrackId),
  };
  if (shouldLogControllerRaySummary(lastControllerRaySummary, summary)) {
    log?.('[VR] ray pass', summary);
  }

  if (hoveredByController) {
    vrUpdateHoverState?.(
      hoveredByController.trackId,
      hoveredByController.position,
      'controller',
    );
  } else {
    vrClearHoverState?.('controller');
  }

  return summary;
}
