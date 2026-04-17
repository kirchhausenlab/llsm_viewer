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
  isPropsWindowOpen: boolean;
  openPropsWindow: () => void;
  closePropsWindow: () => void;
  isTracksWindowOpen: boolean;
  openTracksWindow: () => void;
  closeTracksWindow: () => void;
  isViewerSettingsOpen: boolean;
  openViewerSettings: () => void;
  closeViewerSettings: () => void;
  isHoverSettingsWindowOpen: boolean;
  openHoverSettingsWindow: () => void;
  closeHoverSettingsWindow: () => void;
  isRecordWindowOpen: boolean;
  openRecordWindow: () => void;
  closeRecordWindow: () => void;
  isAmplitudePlotOpen: boolean;
  openAmplitudePlot: () => void;
  closeAmplitudePlot: () => void;
  isPlotSettingsOpen: boolean;
  openPlotSettings: () => void;
  closePlotSettings: () => void;
  isTrackSettingsOpen: boolean;
  openTrackSettings: () => void;
  closeTrackSettings: () => void;
  isPaintbrushOpen: boolean;
  openPaintbrush: () => void;
  closePaintbrush: () => void;
  isDrawRoiWindowOpen: boolean;
  openDrawRoiWindow: () => void;
  closeDrawRoiWindow: () => void;
  isRoiManagerWindowOpen: boolean;
  openRoiManagerWindow: () => void;
  closeRoiManagerWindow: () => void;
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
  const [isChannelsWindowOpen, setIsChannelsWindowOpen] = useState(true);
  const [isPropsWindowOpen, setIsPropsWindowOpen] = useState(false);
  const [isTracksWindowOpen, setIsTracksWindowOpen] = useState(hasTrackData);
  const [isViewerSettingsOpen, setIsViewerSettingsOpen] = useState(false);
  const [isHoverSettingsWindowOpen, setIsHoverSettingsWindowOpen] = useState(false);
  const [isRecordWindowOpen, setIsRecordWindowOpen] = useState(false);
  const [isAmplitudePlotOpen, setIsAmplitudePlotOpen] = useState(false);
  const [isPlotSettingsOpen, setIsPlotSettingsOpen] = useState(false);
  const [isTrackSettingsOpen, setIsTrackSettingsOpen] = useState(false);
  const [isPaintbrushOpen, setIsPaintbrushOpen] = useState(false);
  const [isDrawRoiWindowOpen, setIsDrawRoiWindowOpen] = useState(false);
  const [isRoiManagerWindowOpen, setIsRoiManagerWindowOpen] = useState(false);
  const [isDiagnosticsWindowOpen, setIsDiagnosticsWindowOpen] = useState(false);

  const openChannelsWindow = useCallback(() => {
    setIsChannelsWindowOpen(true);
  }, []);

  const closeChannelsWindow = useCallback(() => {
    setIsChannelsWindowOpen(false);
  }, []);

  const openPropsWindow = useCallback(() => {
    setIsPropsWindowOpen(true);
  }, []);

  const closePropsWindow = useCallback(() => {
    setIsPropsWindowOpen(false);
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

  const openHoverSettingsWindow = useCallback(() => {
    setIsHoverSettingsWindowOpen(true);
  }, []);

  const closeHoverSettingsWindow = useCallback(() => {
    setIsHoverSettingsWindowOpen(false);
  }, []);

  const openRecordWindow = useCallback(() => {
    setIsRecordWindowOpen(true);
  }, []);

  const closeRecordWindow = useCallback(() => {
    setIsRecordWindowOpen(false);
  }, []);

  const openPaintbrush = useCallback(() => {
    setIsPaintbrushOpen(true);
  }, []);

  const closePaintbrush = useCallback(() => {
    setIsPaintbrushOpen(false);
  }, []);

  const openDrawRoiWindow = useCallback(() => {
    setIsDrawRoiWindowOpen(true);
  }, []);

  const closeDrawRoiWindow = useCallback(() => {
    setIsDrawRoiWindowOpen(false);
  }, []);

  const openRoiManagerWindow = useCallback(() => {
    setIsRoiManagerWindowOpen(true);
  }, []);

  const closeRoiManagerWindow = useCallback(() => {
    setIsRoiManagerWindowOpen(false);
  }, []);

  const openAmplitudePlot = useCallback(() => {
    if (!canShowPlotSettings) {
      return;
    }
    setIsAmplitudePlotOpen(true);
    setIsPlotSettingsOpen(true);
  }, [canShowPlotSettings]);

  const openPlotSettings = useCallback(() => {
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
    // Recenter windows is position-only. Preserve open/closed window state.
  }, [resetToken]);

  useEffect(() => {
    if (!canShowPlotSettings) {
      setIsAmplitudePlotOpen(false);
      setIsPlotSettingsOpen(false);
    }
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
    isPropsWindowOpen,
    openPropsWindow,
    closePropsWindow,
    isTracksWindowOpen,
    openTracksWindow,
    closeTracksWindow,
    isViewerSettingsOpen,
    openViewerSettings,
    closeViewerSettings,
    isHoverSettingsWindowOpen,
    openHoverSettingsWindow,
    closeHoverSettingsWindow,
    isRecordWindowOpen,
    openRecordWindow,
    closeRecordWindow,
    isAmplitudePlotOpen,
    openAmplitudePlot,
    closeAmplitudePlot,
    isPlotSettingsOpen,
    openPlotSettings,
    closePlotSettings,
    isTrackSettingsOpen,
    openTrackSettings,
    closeTrackSettings,
    isPaintbrushOpen,
    openPaintbrush,
    closePaintbrush,
    isDrawRoiWindowOpen,
    openDrawRoiWindow,
    closeDrawRoiWindow,
    isRoiManagerWindowOpen,
    openRoiManagerWindow,
    closeRoiManagerWindow,
    isDiagnosticsWindowOpen,
    openDiagnosticsWindow,
    closeDiagnosticsWindow
  };
}
