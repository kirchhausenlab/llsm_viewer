import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  computeLayersWindowDefaultPosition,
  computePaintbrushWindowRecenterPosition,
  computePaintbrushWindowDefaultPosition,
  computePlotSettingsWindowDefaultPosition,
  computePropsWindowRecenterPosition,
  computePropsWindowDefaultPosition,
  computeSelectedTracksWindowDefaultPosition,
  computeTrackSettingsWindowRecenterPosition,
  computeTrackSettingsWindowDefaultPosition,
  computeTrackWindowDefaultPosition,
  computeViewerSettingsWindowDefaultPosition,
  nextLayoutResetToken,
  type WindowPosition
} from '../../../shared/utils/windowLayout';

type UseWindowLayoutResult = {
  layoutResetToken: number;
  layersWindowInitialPosition: WindowPosition;
  paintbrushWindowInitialPosition: WindowPosition;
  propsWindowInitialPosition: WindowPosition;
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
  const layersWindowInitialPosition = useMemo(computeLayersWindowDefaultPosition, []);
  const [propsWindowInitialPosition, setPropsWindowInitialPosition] = useState<WindowPosition>(
    () => computePropsWindowDefaultPosition()
  );
  const [trackWindowInitialPosition, setTrackWindowInitialPosition] = useState<WindowPosition>(
    () => computeTrackWindowDefaultPosition()
  );
  const [paintbrushWindowInitialPosition, setPaintbrushWindowInitialPosition] = useState<WindowPosition>(
    () => computePaintbrushWindowDefaultPosition()
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
      computePaintbrushWindowDefaultPosition,
      setPaintbrushWindowInitialPosition
    );
  }, [updatePositionToDefault]);

  useEffect(() => {
    updatePositionToDefault(
      computeViewerSettingsWindowDefaultPosition,
      setViewerSettingsWindowInitialPosition
    );
  }, [updatePositionToDefault]);

  useEffect(() => {
    updatePositionToDefault(computePropsWindowDefaultPosition, setPropsWindowInitialPosition);
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
    setPropsWindowInitialPosition(computePropsWindowRecenterPosition());
    setTrackWindowInitialPosition(computeTrackWindowDefaultPosition());
    setPaintbrushWindowInitialPosition(computePaintbrushWindowRecenterPosition());
    setViewerSettingsWindowInitialPosition(computeViewerSettingsWindowDefaultPosition());
    setSelectedTracksWindowInitialPosition(computeSelectedTracksWindowDefaultPosition());
    setPlotSettingsWindowInitialPosition(computePlotSettingsWindowDefaultPosition());
    setTrackSettingsWindowInitialPosition(computeTrackSettingsWindowRecenterPosition());
  }, []);

  return {
    layoutResetToken,
    layersWindowInitialPosition,
    paintbrushWindowInitialPosition,
    propsWindowInitialPosition,
    trackWindowInitialPosition,
    viewerSettingsWindowInitialPosition,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition,
    trackSettingsWindowInitialPosition,
    resetLayout
  };
}

export default useWindowLayout;
