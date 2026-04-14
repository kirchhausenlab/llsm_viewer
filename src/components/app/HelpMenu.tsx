import type { ReactNode } from 'react';

import type { HelpMenuControls } from '../../hooks/app/useHelpMenu';
import { useHelpMenu } from '../../hooks/app/useHelpMenu';

interface HelpMenuProps {
  isViewerLaunched: boolean;
  children: (controls: HelpMenuControls) => ReactNode;
}

export function HelpMenu({ isViewerLaunched, children }: HelpMenuProps) {
  const helpMenuControls = useHelpMenu({ isViewerLaunched });

  return <>{children(helpMenuControls)}</>;
}

export default HelpMenu;
