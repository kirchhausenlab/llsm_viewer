import ViewerShell from './ViewerShell';
import { useViewerShellProps } from './useViewerShellProps';
import type { ViewerShellContainerProps } from '../../ui/contracts/viewerShell';

export { useViewerShellProps };
export type { ViewerShellContainerProps };

export default function ViewerShellContainer(props: ViewerShellContainerProps) {
  const viewerShellProps = useViewerShellProps(props);
  return <ViewerShell {...viewerShellProps} />;
}
