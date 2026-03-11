export type WindowPosition = { x: number; y: number };

export const WINDOW_MARGIN = 24;
export const TOP_MENU_HEIGHT = 52;
export const TOP_MENU_WINDOW_PADDING = 12;
export const CONTROL_WINDOW_WIDTH = 360;
export const PROPS_WINDOW_WIDTH = 400;
export const SELECTED_TRACKS_WINDOW_WIDTH = 1120;
export const SELECTED_TRACKS_WINDOW_HEIGHT = 220;
export const PAINTBRUSH_WINDOW_VERTICAL_OFFSET = 220;
export const WARNING_WINDOW_WIDTH = 360;
export const RUNTIME_DIAGNOSTICS_WINDOW_WIDTH = 320;
export const VIEWER_SETTINGS_WINDOW_ESTIMATED_HEIGHT = 320;
export const RECORD_WINDOW_ESTIMATED_HEIGHT = 220;
export const PROPS_WINDOW_ESTIMATED_HEIGHT = 560;
export const PAINTBRUSH_WINDOW_ESTIMATED_HEIGHT = 420;
export const TRACK_WINDOW_ESTIMATED_HEIGHT = 360;
export const PLOT_SETTINGS_WINDOW_ESTIMATED_HEIGHT = 260;
export const TRACK_SETTINGS_WINDOW_ESTIMATED_HEIGHT = 180;
export const RUNTIME_DIAGNOSTICS_WINDOW_ESTIMATED_HEIGHT = 260;

const computeRightColumnX = (preferredWidth = CONTROL_WINDOW_WIDTH): number => {
  if (typeof window === 'undefined') {
    return WINDOW_MARGIN;
  }

  const windowWidth = Math.min(preferredWidth, window.innerWidth - WINDOW_MARGIN * 2);
  return Math.max(WINDOW_MARGIN, window.innerWidth - windowWidth - WINDOW_MARGIN);
};

export const computeCenteredWindowPosition = (
  preferredWidth: number,
  estimatedHeight: number
): WindowPosition => {
  if (typeof window === 'undefined') {
    return { x: WINDOW_MARGIN, y: WINDOW_MARGIN };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const windowWidth = Math.min(preferredWidth, viewportWidth - WINDOW_MARGIN * 2);
  const centeredX = Math.max(WINDOW_MARGIN, Math.round((viewportWidth - windowWidth) / 2));
  const centeredY = Math.max(WINDOW_MARGIN, Math.round((viewportHeight - estimatedHeight) / 2));

  return { x: centeredX, y: centeredY };
};

const computeTopWindowY = (estimatedHeight: number): number => {
  const preferredY = TOP_MENU_HEIGHT + TOP_MENU_WINDOW_PADDING;

  if (typeof window === 'undefined') {
    return preferredY;
  }

  const viewportHeight = window.innerHeight;
  const maxY = Math.max(WINDOW_MARGIN, viewportHeight - estimatedHeight - WINDOW_MARGIN);
  return Math.min(preferredY, maxY);
};

export const computeTopCenteredWindowPosition = (
  preferredWidth: number,
  estimatedHeight: number
): WindowPosition => {
  if (typeof window === 'undefined') {
    return { x: WINDOW_MARGIN, y: TOP_MENU_HEIGHT + TOP_MENU_WINDOW_PADDING };
  }

  const viewportWidth = window.innerWidth;
  const windowWidth = Math.min(preferredWidth, viewportWidth - WINDOW_MARGIN * 2);
  const centeredX = Math.max(WINDOW_MARGIN, Math.round((viewportWidth - windowWidth) / 2));

  return { x: centeredX, y: computeTopWindowY(estimatedHeight) };
};

export const computeLayersWindowDefaultPosition = (): WindowPosition => ({
  x: WINDOW_MARGIN,
  y: TOP_MENU_HEIGHT + TOP_MENU_WINDOW_PADDING
});

export const computePaintbrushWindowDefaultPosition = (): WindowPosition => ({
  x: WINDOW_MARGIN,
  y: TOP_MENU_HEIGHT + TOP_MENU_WINDOW_PADDING + PAINTBRUSH_WINDOW_VERTICAL_OFFSET
});

export const computeViewerSettingsWindowDefaultPosition = (): WindowPosition => {
  return computeTopCenteredWindowPosition(CONTROL_WINDOW_WIDTH, VIEWER_SETTINGS_WINDOW_ESTIMATED_HEIGHT);
};

export const computeRecordWindowDefaultPosition = (): WindowPosition =>
  computeTopCenteredWindowPosition(CONTROL_WINDOW_WIDTH, RECORD_WINDOW_ESTIMATED_HEIGHT);

export const computePropsWindowDefaultPosition = (): WindowPosition => {
  const x = computeRightColumnX(PROPS_WINDOW_WIDTH);
  const y = TOP_MENU_HEIGHT + TOP_MENU_WINDOW_PADDING + 96;

  if (typeof window === 'undefined') {
    return { x, y };
  }

  const viewportHeight = window.innerHeight;
  const maxY = Math.max(WINDOW_MARGIN, viewportHeight - PROPS_WINDOW_ESTIMATED_HEIGHT - WINDOW_MARGIN);

  return { x, y: Math.min(y, maxY) };
};

export const computeTrackWindowDefaultPosition = (): WindowPosition => {
  const x = computeRightColumnX();
  const y = TOP_MENU_HEIGHT + TOP_MENU_WINDOW_PADDING;

  if (typeof window === 'undefined') {
    return { x, y };
  }

  const viewportHeight = window.innerHeight;
  const maxY = Math.max(WINDOW_MARGIN, viewportHeight - TRACK_WINDOW_ESTIMATED_HEIGHT - WINDOW_MARGIN);

  return { x, y: Math.min(y, maxY) };
};

export const computeSelectedTracksWindowDefaultPosition = (): WindowPosition => {
  if (typeof window === 'undefined') {
    return { x: WINDOW_MARGIN, y: WINDOW_MARGIN };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const windowWidth = Math.min(SELECTED_TRACKS_WINDOW_WIDTH, viewportWidth - WINDOW_MARGIN * 2);
  const x = Math.max(WINDOW_MARGIN, Math.round((viewportWidth - windowWidth) / 2));
  const y = Math.max(WINDOW_MARGIN, viewportHeight - SELECTED_TRACKS_WINDOW_HEIGHT - WINDOW_MARGIN);

  return { x, y };
};

export const computePlotSettingsWindowDefaultPosition = (): WindowPosition => {
  if (typeof window === 'undefined') {
    return { x: WINDOW_MARGIN, y: WINDOW_MARGIN };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const windowWidth = Math.min(CONTROL_WINDOW_WIDTH, viewportWidth - WINDOW_MARGIN * 2);
  const x = Math.max(WINDOW_MARGIN, Math.round((viewportWidth - windowWidth) / 2));
  const anchorY = viewportHeight - SELECTED_TRACKS_WINDOW_HEIGHT - WINDOW_MARGIN;
  const y = Math.max(WINDOW_MARGIN, Math.round(anchorY - PLOT_SETTINGS_WINDOW_ESTIMATED_HEIGHT - 16));

  return { x, y };
};

export const computeTrackSettingsWindowDefaultPosition = (): WindowPosition => {
  const x = computeRightColumnX();
  const baseY = TOP_MENU_HEIGHT + TOP_MENU_WINDOW_PADDING + 360;

  if (typeof window === 'undefined') {
    return { x, y: baseY };
  }

  const viewportHeight = window.innerHeight;
  const maxY = Math.max(WINDOW_MARGIN, viewportHeight - TRACK_SETTINGS_WINDOW_ESTIMATED_HEIGHT - WINDOW_MARGIN);

  return { x, y: Math.min(baseY, maxY) };
};

export const computeRuntimeDiagnosticsWindowDefaultPosition = (): WindowPosition => ({
  x: computeRightColumnX(RUNTIME_DIAGNOSTICS_WINDOW_WIDTH),
  y: TOP_MENU_HEIGHT + TOP_MENU_WINDOW_PADDING
});

export const computePropsWindowRecenterPosition = (): WindowPosition =>
  computeTopCenteredWindowPosition(PROPS_WINDOW_WIDTH, PROPS_WINDOW_ESTIMATED_HEIGHT);

export const computePaintbrushWindowRecenterPosition = (): WindowPosition =>
  computeTopCenteredWindowPosition(CONTROL_WINDOW_WIDTH, PAINTBRUSH_WINDOW_ESTIMATED_HEIGHT);

export const computeTrackSettingsWindowRecenterPosition = (): WindowPosition =>
  computeTopCenteredWindowPosition(CONTROL_WINDOW_WIDTH, TRACK_SETTINGS_WINDOW_ESTIMATED_HEIGHT);

export const computeRuntimeDiagnosticsWindowRecenterPosition = (): WindowPosition =>
  computeTopCenteredWindowPosition(
    RUNTIME_DIAGNOSTICS_WINDOW_WIDTH,
    RUNTIME_DIAGNOSTICS_WINDOW_ESTIMATED_HEIGHT
  );

export const nextLayoutResetToken = (token: number): number => token + 1;
