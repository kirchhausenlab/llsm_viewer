import { useCallback, useEffect, useRef, useState } from 'react';

type UseViewerPanelWindowsOptions = {
  resetToken: number;
  hasTrackData: boolean;
  canShowPlotSettings: boolean;
};

type UseViewerPanelWindowsResult = {
  isChannelsWindowOpen: boolean;
  openChannelsWindow: () => void;
  closeChannelsWindow: () => void;
  isTracksWindowOpen: boolean;
  openTracksWindow: () => void;
  closeTracksWindow: () => void;
  isViewerSettingsOpen: boolean;
  openViewerSettings: () => void;
  closeViewerSettings: () => void;
  isAmplitudePlotOpen: boolean;
  openAmplitudePlot: () => void;
  closeAmplitudePlot: () => void;
  isPlotSettingsOpen: boolean;
  closePlotSettings: () => void;
  isTrackSettingsOpen: boolean;
  openTrackSettings: () => void;
  closeTrackSettings: () => void;
  isPaintbrushOpen: boolean;
  openPaintbrush: () => void;
  closePaintbrush: () => void;
  isDiagnosticsWindowOpen: boolean;
  openDiagnosticsWindow: () => void;
  closeDiagnosticsWindow: () => void;
};

export function useViewerPanelWindows({
  resetToken,
  hasTrackData,
  canShowPlotSettings
}: UseViewerPanelWindowsOptions): UseViewerPanelWindowsResult {
  const lastHasTrackDataRef = useRef(hasTrackData);
  const lastCanShowPlotSettingsRef = useRef(canShowPlotSettings);
  const [isChannelsWindowOpen, setIsChannelsWindowOpen] = useState(true);
  const [isTracksWindowOpen, setIsTracksWindowOpen] = useState(() => hasTrackData);
  const [isViewerSettingsOpen, setIsViewerSettingsOpen] = useState(false);
  const [isAmplitudePlotOpen, setIsAmplitudePlotOpen] = useState(() => canShowPlotSettings);
  const [isPlotSettingsOpen, setIsPlotSettingsOpen] = useState(false);
  const [isTrackSettingsOpen, setIsTrackSettingsOpen] = useState(false);
  const [isPaintbrushOpen, setIsPaintbrushOpen] = useState(false);
  const [isDiagnosticsWindowOpen, setIsDiagnosticsWindowOpen] = useState(false);

  const openChannelsWindow = useCallback(() => {
    setIsChannelsWindowOpen(true);
  }, []);

  const closeChannelsWindow = useCallback(() => {
    setIsChannelsWindowOpen(false);
  }, []);

  const openTracksWindow = useCallback(() => {
    if (!hasTrackData) {
      return;
    }
    setIsTracksWindowOpen(true);
  }, [hasTrackData]);

  const closeTracksWindow = useCallback(() => {
    setIsTracksWindowOpen(false);
    setIsTrackSettingsOpen(false);
  }, []);

  const openViewerSettings = useCallback(() => {
    setIsViewerSettingsOpen(true);
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

  const openAmplitudePlot = useCallback(() => {
    if (!canShowPlotSettings) {
      return;
    }
    setIsAmplitudePlotOpen(true);
    setIsPlotSettingsOpen(true);
  }, [canShowPlotSettings]);

  const closeAmplitudePlot = useCallback(() => {
    setIsAmplitudePlotOpen(false);
    setIsPlotSettingsOpen(false);
  }, []);

  const closePlotSettings = useCallback(() => {
    setIsPlotSettingsOpen(false);
  }, []);

  const openTrackSettings = useCallback(() => {
    if (!hasTrackData) {
      return;
    }
    setIsTracksWindowOpen(true);
    setIsTrackSettingsOpen(true);
  }, [hasTrackData]);

  const closeTrackSettings = useCallback(() => {
    setIsTrackSettingsOpen(false);
  }, []);

  const openDiagnosticsWindow = useCallback(() => {
    setIsDiagnosticsWindowOpen(true);
  }, []);

  const closeDiagnosticsWindow = useCallback(() => {
    setIsDiagnosticsWindowOpen(false);
  }, []);

  useEffect(() => {
    setIsChannelsWindowOpen(true);
    setIsTracksWindowOpen(hasTrackData);
    setIsViewerSettingsOpen(false);
    setIsAmplitudePlotOpen(canShowPlotSettings);
    setIsPlotSettingsOpen(false);
    setIsTrackSettingsOpen(false);
    setIsPaintbrushOpen(false);
    setIsDiagnosticsWindowOpen(false);
  }, [resetToken]);

  useEffect(() => {
    if (!canShowPlotSettings) {
      setIsAmplitudePlotOpen(false);
      setIsPlotSettingsOpen(false);
    } else if (!lastCanShowPlotSettingsRef.current) {
      setIsAmplitudePlotOpen(true);
    }
    lastCanShowPlotSettingsRef.current = canShowPlotSettings;
  }, [canShowPlotSettings]);

  useEffect(() => {
    if (!hasTrackData) {
      setIsTracksWindowOpen(false);
      setIsTrackSettingsOpen(false);
    } else if (!lastHasTrackDataRef.current) {
      setIsTracksWindowOpen(true);
    }
    lastHasTrackDataRef.current = hasTrackData;
  }, [hasTrackData]);

  return {
    isChannelsWindowOpen,
    openChannelsWindow,
    closeChannelsWindow,
    isTracksWindowOpen,
    openTracksWindow,
    closeTracksWindow,
    isViewerSettingsOpen,
    openViewerSettings,
    closeViewerSettings,
    isAmplitudePlotOpen,
    openAmplitudePlot,
    closeAmplitudePlot,
    isPlotSettingsOpen,
    closePlotSettings,
    isTrackSettingsOpen,
    openTrackSettings,
    closeTrackSettings,
    isPaintbrushOpen,
    openPaintbrush,
    closePaintbrush,
    isDiagnosticsWindowOpen,
    openDiagnosticsWindow,
    closeDiagnosticsWindow
  };
}
