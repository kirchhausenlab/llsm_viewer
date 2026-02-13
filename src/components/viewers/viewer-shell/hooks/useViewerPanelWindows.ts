import { useCallback, useEffect, useState } from 'react';

type UseViewerPanelWindowsOptions = {
  resetToken: number;
  hasTrackData: boolean;
  canShowPlotSettings: boolean;
};

type UseViewerPanelWindowsResult = {
  isViewerSettingsOpen: boolean;
  toggleViewerSettings: () => void;
  closeViewerSettings: () => void;
  isPlotSettingsOpen: boolean;
  togglePlotSettings: () => void;
  closePlotSettings: () => void;
  isTrackSettingsOpen: boolean;
  toggleTrackSettings: () => void;
  closeTrackSettings: () => void;
  isPaintbrushOpen: boolean;
  openPaintbrush: () => void;
  closePaintbrush: () => void;
};

export function useViewerPanelWindows({
  resetToken,
  hasTrackData,
  canShowPlotSettings
}: UseViewerPanelWindowsOptions): UseViewerPanelWindowsResult {
  const [isViewerSettingsOpen, setIsViewerSettingsOpen] = useState(false);
  const [isPlotSettingsOpen, setIsPlotSettingsOpen] = useState(false);
  const [isTrackSettingsOpen, setIsTrackSettingsOpen] = useState(false);
  const [isPaintbrushOpen, setIsPaintbrushOpen] = useState(false);

  const toggleViewerSettings = useCallback(() => {
    setIsViewerSettingsOpen((current) => !current);
  }, []);

  const closeViewerSettings = useCallback(() => {
    setIsViewerSettingsOpen(false);
  }, []);

  const openPaintbrush = useCallback(() => {
    setIsPaintbrushOpen(true);
  }, []);

  const closePaintbrush = useCallback(() => {
    setIsPaintbrushOpen(false);
  }, []);

  const togglePlotSettings = useCallback(() => {
    setIsPlotSettingsOpen((current) => !current);
  }, []);

  const closePlotSettings = useCallback(() => {
    setIsPlotSettingsOpen(false);
  }, []);

  const toggleTrackSettings = useCallback(() => {
    setIsTrackSettingsOpen((current) => !current);
  }, []);

  const closeTrackSettings = useCallback(() => {
    setIsTrackSettingsOpen(false);
  }, []);

  useEffect(() => {
    setIsViewerSettingsOpen(false);
    setIsPlotSettingsOpen(false);
    setIsTrackSettingsOpen(false);
    setIsPaintbrushOpen(false);
  }, [resetToken]);

  useEffect(() => {
    if (!canShowPlotSettings) {
      setIsPlotSettingsOpen(false);
    }
  }, [canShowPlotSettings]);

  useEffect(() => {
    if (!hasTrackData) {
      setIsTrackSettingsOpen(false);
    }
  }, [hasTrackData]);

  return {
    isViewerSettingsOpen,
    toggleViewerSettings,
    closeViewerSettings,
    isPlotSettingsOpen,
    togglePlotSettings,
    closePlotSettings,
    isTrackSettingsOpen,
    toggleTrackSettings,
    closeTrackSettings,
    isPaintbrushOpen,
    openPaintbrush,
    closePaintbrush
  };
}
