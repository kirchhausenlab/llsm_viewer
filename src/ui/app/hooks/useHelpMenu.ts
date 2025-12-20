import { useCallback, useEffect, useState } from 'react';

export interface HelpMenuControls {
  isHelpMenuOpen: boolean;
  openHelpMenu: () => void;
  closeHelpMenu: () => void;
}

interface UseHelpMenuOptions {
  isViewerLaunched: boolean;
}

export function useHelpMenu({ isViewerLaunched }: UseHelpMenuOptions): HelpMenuControls {
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);

  const openHelpMenu = useCallback(() => {
    setIsHelpMenuOpen(true);
  }, []);

  const closeHelpMenu = useCallback(() => {
    setIsHelpMenuOpen(false);
  }, []);

  useEffect(() => {
    if (!isViewerLaunched) {
      setIsHelpMenuOpen(false);
    }
  }, [isViewerLaunched]);

  useEffect(() => {
    if (!isHelpMenuOpen || typeof document === 'undefined') {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHelpMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHelpMenuOpen]);

  return {
    isHelpMenuOpen,
    openHelpMenu,
    closeHelpMenu
  };
}
