import type { ViewerShellRouteProps } from './useRouteViewerProps';

type RouteViewerShellViewerSection = Pick<
  ViewerShellRouteProps,
  'viewerMode' | 'viewerPanels' | 'vr'
>;

type RouteViewerShellChromeSection = Pick<
  ViewerShellRouteProps,
  'topMenu' | 'layout' | 'modeControls' | 'playbackControls'
>;

type RouteViewerShellPanelsSection = Pick<
  ViewerShellRouteProps,
  'channelsPanel' | 'tracksPanel' | 'selectedTracksPanel' | 'plotSettings' | 'trackSettings'
>;

export type RouteViewerShellSections = {
  viewer: RouteViewerShellViewerSection;
  chrome: RouteViewerShellChromeSection;
  panels: RouteViewerShellPanelsSection;
};

export function createRouteViewerShellProps({
  viewer,
  chrome,
  panels
}: RouteViewerShellSections): ViewerShellRouteProps {
  return {
    ...viewer,
    ...chrome,
    ...panels
  };
}
