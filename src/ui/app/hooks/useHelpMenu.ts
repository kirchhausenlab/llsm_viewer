import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

export interface HelpMenuControls {
  helpMenuRef: RefObject<HTMLDivElement>;
  isHelpMenuOpen: boolean;
  onHelpMenuToggle: () => void;
}

interface UseHelpMenuOptions {
  isViewerLaunched: boolean;
}

export function useHelpMenu({ isViewerLaunched }: UseHelpMenuOptions): HelpMenuControls {
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const helpMenuRef = useRef<HTMLDivElement | null>(null);

  const handleHelpMenuToggle = useCallback(() => {
    setIsHelpMenuOpen((previous) => !previous);
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

    const handleDocumentClick = (event: MouseEvent) => {
      const container = helpMenuRef.current;
      if (!container) {
        return;
      }

      if (!container.contains(event.target as Node)) {
        setIsHelpMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHelpMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHelpMenuOpen]);

  return {
    helpMenuRef,
    isHelpMenuOpen,
    onHelpMenuToggle: handleHelpMenuToggle
  };
}
