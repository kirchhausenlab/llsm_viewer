import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  computeControlWindowDefaultPosition,
  computeLayersWindowDefaultPosition,
  computePlotSettingsWindowDefaultPosition,
  computeSelectedTracksWindowDefaultPosition,
  computeTrackSettingsWindowDefaultPosition,
  computeTrackWindowDefaultPosition,
  computeViewerSettingsWindowDefaultPosition,
  nextLayoutResetToken,
  type WindowPosition
} from '../../../shared/utils/windowLayout';

type UseWindowLayoutResult = {
  layoutResetToken: number;
  controlWindowInitialPosition: WindowPosition;
  layersWindowInitialPosition: WindowPosition;
  trackWindowInitialPosition: WindowPosition;
  viewerSettingsWindowInitialPosition: WindowPosition;
  selectedTracksWindowInitialPosition: WindowPosition;
  plotSettingsWindowInitialPosition: WindowPosition;
  trackSettingsWindowInitialPosition: WindowPosition;
  resetLayout: () => void;
};

const positionsMatch = (a: WindowPosition, b: WindowPosition) => a.x === b.x && a.y === b.y;

export function useWindowLayout(): UseWindowLayoutResult {
  const [layoutResetToken, setLayoutResetToken] = useState(0);
  const controlWindowInitialPosition = useMemo(computeControlWindowDefaultPosition, []);
  const layersWindowInitialPosition = useMemo(computeLayersWindowDefaultPosition, []);
  const [trackWindowInitialPosition, setTrackWindowInitialPosition] = useState<WindowPosition>(
    () => computeTrackWindowDefaultPosition()
  );
  const [viewerSettingsWindowInitialPosition, setViewerSettingsWindowInitialPosition] =
    useState<WindowPosition>(() => computeViewerSettingsWindowDefaultPosition());
  const [selectedTracksWindowInitialPosition, setSelectedTracksWindowInitialPosition] =
    useState<WindowPosition>(() => computeSelectedTracksWindowDefaultPosition());
  const [plotSettingsWindowInitialPosition, setPlotSettingsWindowInitialPosition] =
    useState<WindowPosition>(() => computePlotSettingsWindowDefaultPosition());
  const [trackSettingsWindowInitialPosition, setTrackSettingsWindowInitialPosition] =
    useState<WindowPosition>(() => computeTrackSettingsWindowDefaultPosition());

  const updatePositionToDefault = useCallback(
    (
      computeDefaultPosition: () => WindowPosition,
      setPosition: React.Dispatch<React.SetStateAction<WindowPosition>>,
    ) => {
      const defaultPosition = computeDefaultPosition();
      setPosition((current) => (positionsMatch(current, defaultPosition) ? current : defaultPosition));
    },
    []
  );

  useEffect(() => {
    updatePositionToDefault(computeTrackWindowDefaultPosition, setTrackWindowInitialPosition);
  }, [updatePositionToDefault]);

  useEffect(() => {
    updatePositionToDefault(
      computeViewerSettingsWindowDefaultPosition,
      setViewerSettingsWindowInitialPosition
    );
  }, [updatePositionToDefault]);

  useEffect(() => {
    updatePositionToDefault(
      computeSelectedTracksWindowDefaultPosition,
      setSelectedTracksWindowInitialPosition
    );
  }, [updatePositionToDefault]);

  useEffect(() => {
    updatePositionToDefault(computePlotSettingsWindowDefaultPosition, setPlotSettingsWindowInitialPosition);
  }, [updatePositionToDefault]);

  useEffect(() => {
    updatePositionToDefault(
      computeTrackSettingsWindowDefaultPosition,
      setTrackSettingsWindowInitialPosition
    );
  }, [updatePositionToDefault]);

  const resetLayout = useCallback(() => {
    setLayoutResetToken(nextLayoutResetToken);
    setTrackWindowInitialPosition(computeTrackWindowDefaultPosition());
    setViewerSettingsWindowInitialPosition(computeViewerSettingsWindowDefaultPosition());
    setSelectedTracksWindowInitialPosition(computeSelectedTracksWindowDefaultPosition());
    setPlotSettingsWindowInitialPosition(computePlotSettingsWindowDefaultPosition());
    setTrackSettingsWindowInitialPosition(computeTrackSettingsWindowDefaultPosition());
  }, []);

  return {
    layoutResetToken,
    controlWindowInitialPosition,
    layersWindowInitialPosition,
    trackWindowInitialPosition,
    viewerSettingsWindowInitialPosition,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition,
    trackSettingsWindowInitialPosition,
    resetLayout
  };
}

export default useWindowLayout;
