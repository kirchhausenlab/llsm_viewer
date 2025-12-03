import ViewerShell from './ViewerShell';
import { useViewerShellProps, type ViewerShellContainerProps } from './useViewerShellProps';

export { useViewerShellProps };
export type { ViewerShellContainerProps };

export default function ViewerShellContainer(props: ViewerShellContainerProps) {
  const viewerShellProps = useViewerShellProps(props);
  return <ViewerShell {...viewerShellProps} />;
}
