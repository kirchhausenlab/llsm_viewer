import type { ReactNode } from 'react';

import type { HelpMenuControls } from '../../ui/app/hooks/useHelpMenu';
import { useHelpMenu } from '../../ui/app/hooks/useHelpMenu';

interface HelpMenuProps {
  isViewerLaunched: boolean;
  children: (controls: HelpMenuControls) => ReactNode;
}

export function HelpMenu({ isViewerLaunched, children }: HelpMenuProps) {
  const helpMenuControls = useHelpMenu({ isViewerLaunched });

  return <>{children(helpMenuControls)}</>;
}

export default HelpMenu;
