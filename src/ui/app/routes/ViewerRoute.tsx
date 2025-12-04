import HelpMenu from '../../../components/app/HelpMenu';
import ViewerShellContainer from '../../../components/viewers/ViewerShellContainer';
import type { ViewerRouteProps } from '../hooks/useAppRouteState';

export default function ViewerRoute({ viewerShellProps, isViewerLaunched }: ViewerRouteProps) {
  return (
    <HelpMenu isViewerLaunched={isViewerLaunched}>
      {(helpMenuProps) => <ViewerShellContainer {...viewerShellProps} {...helpMenuProps} />}
    </HelpMenu>
  );
}
