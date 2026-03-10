import type { FrontPageContainerProps } from '../../../components/pages/FrontPageContainer';
import type { ViewerShellContainerProps } from '../../../components/viewers/ViewerShellContainer';
import { WARNING_WINDOW_WIDTH, WINDOW_MARGIN } from '../../../shared/utils/windowLayout';

export type ViewerShellRouteProps = Omit<
  ViewerShellContainerProps,
  'isHelpMenuOpen' | 'openHelpMenu' | 'closeHelpMenu'
>;

export type RouteDatasetSetupProps = Omit<
  FrontPageContainerProps,
  'warningWindowInitialPosition' | 'warningWindowWidth'
>;

type UseRouteViewerPropsOptions = {
  datasetSetup: RouteDatasetSetupProps;
  viewerShell: ViewerShellRouteProps;
};

type UseRouteViewerPropsResult = {
  datasetSetupProps: FrontPageContainerProps;
  viewerShellContainerProps: ViewerShellRouteProps;
};

export function useRouteViewerProps({
  datasetSetup,
  viewerShell
}: UseRouteViewerPropsOptions): UseRouteViewerPropsResult {
  const warningWindowInitialPosition =
    typeof window === 'undefined'
      ? { x: WINDOW_MARGIN, y: WINDOW_MARGIN }
      : {
          x: Math.max(WINDOW_MARGIN, Math.round(window.innerWidth / 2 - WARNING_WINDOW_WIDTH / 2)),
          y: WINDOW_MARGIN + 16
        };

  return {
    datasetSetupProps: {
      ...datasetSetup,
      warningWindowInitialPosition,
      warningWindowWidth: WARNING_WINDOW_WIDTH
    },
    viewerShellContainerProps: viewerShell
  };
}
