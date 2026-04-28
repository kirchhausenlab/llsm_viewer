import { useEffect, useRef } from 'react';

import HelpMenu from '../../../components/app/HelpMenu';
import ViewerShellContainer from '../../../components/viewers/ViewerShellContainer';
import { useViewerRouteState } from '../hooks/useViewerRouteState';
import type { ViewerRouteProps } from '../hooks/viewerRouteStateTypes';

export default function ViewerRoute({
  visible,
  launchRequest,
  onLaunchRequestSettled,
  state
}: ViewerRouteProps) {
  const handledLaunchRequestIdRef = useRef<number | null>(null);
  const { viewerShellProps, launchViewer } = useViewerRouteState(state);

  useEffect(() => {
    if (!launchRequest) {
      return;
    }
    if (handledLaunchRequestIdRef.current === launchRequest.id) {
      return;
    }

    handledLaunchRequestIdRef.current = launchRequest.id;
    let cancelled = false;
    void (async () => {
      const launched = await launchViewer({ performanceMode: launchRequest.performanceMode });
      if (!cancelled) {
        onLaunchRequestSettled(launchRequest.id, launched);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [launchRequest, launchViewer, onLaunchRequestSettled]);

  if (!visible) {
    return null;
  }

  return (
    <HelpMenu isViewerLaunched={visible}>
      {(helpMenuProps) => <ViewerShellContainer {...viewerShellProps} {...helpMenuProps} />}
    </HelpMenu>
  );
}
