import type { FrontPageContainerProps, FrontPageRouteProps } from './frontPage';
import type { ViewerShellRouteProps } from './viewerShell';

export type DatasetSetupRouteProps = FrontPageContainerProps;

export type ViewerRouteProps = {
  viewerShellProps: ViewerShellRouteProps;
  isViewerLaunched: boolean;
};

export type RouteDatasetSetupProps = FrontPageRouteProps;

export type AppRouteState = {
  isViewerLaunched: boolean;
  datasetSetupProps: DatasetSetupRouteProps;
  viewerRouteProps: ViewerRouteProps;
};
