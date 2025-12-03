export type WindowPosition = { x: number; y: number };

export const WINDOW_MARGIN = 24;
export const CONTROL_WINDOW_WIDTH = 360;
export const SELECTED_TRACKS_WINDOW_WIDTH = 1120;
export const SELECTED_TRACKS_WINDOW_HEIGHT = 220;
export const LAYERS_WINDOW_VERTICAL_OFFSET = 420;
export const WARNING_WINDOW_WIDTH = 360;

const computeRightColumnX = (): number => {
  if (typeof window === 'undefined') {
    return WINDOW_MARGIN;
  }

  const windowWidth = Math.min(CONTROL_WINDOW_WIDTH, window.innerWidth - WINDOW_MARGIN * 2);
  return Math.max(WINDOW_MARGIN, window.innerWidth - windowWidth - WINDOW_MARGIN);
};

export const computeControlWindowDefaultPosition = (): WindowPosition => ({
  x: WINDOW_MARGIN,
  y: WINDOW_MARGIN
});

export const computeLayersWindowDefaultPosition = (): WindowPosition => ({
  x: WINDOW_MARGIN,
  y: WINDOW_MARGIN + LAYERS_WINDOW_VERTICAL_OFFSET
});

export const computeViewerSettingsWindowDefaultPosition = (): WindowPosition => {
  if (typeof window === 'undefined') {
    return { x: WINDOW_MARGIN, y: WINDOW_MARGIN };
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const windowWidth = Math.min(CONTROL_WINDOW_WIDTH, viewportWidth - WINDOW_MARGIN * 2);
  const estimatedHeight = 320;
  const centeredX = Math.max(WINDOW_MARGIN, Math.round((viewportWidth - windowWidth) / 2));
  const centeredY = Math.max(WINDOW_MARGIN, Math.round((viewportHeight - estimatedHeight) / 2));

  return { x: centeredX, y: centeredY };
};

export const computeTrackWindowDefaultPosition = (): WindowPosition => {
  const x = computeRightColumnX();

  if (typeof window === 'undefined') {
    return { x, y: WINDOW_MARGIN };
  }

  const viewportHeight = window.innerHeight;
  const estimatedHeight = 360;
  const maxY = Math.max(WINDOW_MARGIN, viewportHeight - estimatedHeight - WINDOW_MARGIN);

  return { x, y: Math.min(WINDOW_MARGIN, maxY) };
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
  const estimatedHeight = 260;
  const x = Math.max(WINDOW_MARGIN, Math.round((viewportWidth - windowWidth) / 2));
  const anchorY = viewportHeight - SELECTED_TRACKS_WINDOW_HEIGHT - WINDOW_MARGIN;
  const y = Math.max(WINDOW_MARGIN, Math.round(anchorY - estimatedHeight - 16));

  return { x, y };
};

export const nextLayoutResetToken = (token: number): number => token + 1;
