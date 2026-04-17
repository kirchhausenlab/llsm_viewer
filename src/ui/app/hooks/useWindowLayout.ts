import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  computeDrawRoiWindowDefaultPosition,
  computeDrawRoiWindowRecenterPosition,
  computeLayersWindowDefaultPosition,
  computePaintbrushWindowRecenterPosition,
  computePaintbrushWindowDefaultPosition,
  computePlotSettingsWindowDefaultPosition,
  computeMeasurementsWindowDefaultPosition,
  computeMeasurementsWindowRecenterPosition,
  computePropsWindowRecenterPosition,
  computePropsWindowDefaultPosition,
  computeRecordWindowDefaultPosition,
  computeRoiManagerWindowDefaultPosition,
  computeRoiManagerWindowRecenterPosition,
  computeSetMeasurementsWindowDefaultPosition,
  computeSetMeasurementsWindowRecenterPosition,
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
  recordWindowInitialPosition: WindowPosition;
  paintbrushWindowInitialPosition: WindowPosition;
  drawRoiWindowInitialPosition: WindowPosition;
  propsWindowInitialPosition: WindowPosition;
  roiManagerWindowInitialPosition: WindowPosition;
  trackWindowInitialPosition: WindowPosition;
  viewerSettingsWindowInitialPosition: WindowPosition;
  selectedTracksWindowInitialPosition: WindowPosition;
  plotSettingsWindowInitialPosition: WindowPosition;
  trackSettingsWindowInitialPosition: WindowPosition;
  measurementsWindowInitialPosition: WindowPosition;
  setMeasurementsWindowInitialPosition: WindowPosition;
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
  const [drawRoiWindowInitialPosition, setDrawRoiWindowInitialPosition] = useState<WindowPosition>(
    () => computeDrawRoiWindowDefaultPosition()
  );
  const [recordWindowInitialPosition, setRecordWindowInitialPosition] = useState<WindowPosition>(
    () => computeRecordWindowDefaultPosition()
  );
  const [roiManagerWindowInitialPosition, setRoiManagerWindowInitialPosition] = useState<WindowPosition>(
    () => computeRoiManagerWindowDefaultPosition()
  );
  const [viewerSettingsWindowInitialPosition, setViewerSettingsWindowInitialPosition] =
    useState<WindowPosition>(() => computeViewerSettingsWindowDefaultPosition());
  const [selectedTracksWindowInitialPosition, setSelectedTracksWindowInitialPosition] =
    useState<WindowPosition>(() => computeSelectedTracksWindowDefaultPosition());
  const [plotSettingsWindowInitialPosition, setPlotSettingsWindowInitialPosition] =
    useState<WindowPosition>(() => computePlotSettingsWindowDefaultPosition());
  const [trackSettingsWindowInitialPosition, setTrackSettingsWindowInitialPosition] =
    useState<WindowPosition>(() => computeTrackSettingsWindowDefaultPosition());
  const [measurementsWindowInitialPosition, setMeasurementsWindowInitialPosition] =
    useState<WindowPosition>(() => computeMeasurementsWindowDefaultPosition());
  const [setMeasurementsDialogWindowInitialPosition, setSetMeasurementsWindowInitialPosition] =
    useState<WindowPosition>(() => computeSetMeasurementsWindowDefaultPosition());

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
      computeDrawRoiWindowDefaultPosition,
      setDrawRoiWindowInitialPosition
    );
  }, [updatePositionToDefault]);

  useEffect(() => {
    updatePositionToDefault(
      computeViewerSettingsWindowDefaultPosition,
      setViewerSettingsWindowInitialPosition
    );
  }, [updatePositionToDefault]);

  useEffect(() => {
    updatePositionToDefault(computeRecordWindowDefaultPosition, setRecordWindowInitialPosition);
  }, [updatePositionToDefault]);

  useEffect(() => {
    updatePositionToDefault(
      computeRoiManagerWindowDefaultPosition,
      setRoiManagerWindowInitialPosition
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

  useEffect(() => {
    updatePositionToDefault(computeMeasurementsWindowDefaultPosition, setMeasurementsWindowInitialPosition);
  }, [updatePositionToDefault]);

  useEffect(() => {
    updatePositionToDefault(
      computeSetMeasurementsWindowDefaultPosition,
      setSetMeasurementsWindowInitialPosition
    );
  }, [updatePositionToDefault]);

  const resetLayout = useCallback(() => {
    setLayoutResetToken(nextLayoutResetToken);
    setPropsWindowInitialPosition(computePropsWindowRecenterPosition());
    setTrackWindowInitialPosition(computeTrackWindowDefaultPosition());
    setPaintbrushWindowInitialPosition(computePaintbrushWindowRecenterPosition());
    setDrawRoiWindowInitialPosition(computeDrawRoiWindowRecenterPosition());
    setRoiManagerWindowInitialPosition(computeRoiManagerWindowRecenterPosition());
    setViewerSettingsWindowInitialPosition(computeViewerSettingsWindowDefaultPosition());
    setRecordWindowInitialPosition(computeRecordWindowDefaultPosition());
    setSelectedTracksWindowInitialPosition(computeSelectedTracksWindowDefaultPosition());
    setPlotSettingsWindowInitialPosition(computePlotSettingsWindowDefaultPosition());
    setTrackSettingsWindowInitialPosition(computeTrackSettingsWindowRecenterPosition());
    setMeasurementsWindowInitialPosition(computeMeasurementsWindowRecenterPosition());
    setSetMeasurementsWindowInitialPosition(computeSetMeasurementsWindowRecenterPosition());
  }, []);

  return {
    layoutResetToken,
    layersWindowInitialPosition,
    recordWindowInitialPosition,
    paintbrushWindowInitialPosition,
    drawRoiWindowInitialPosition,
    propsWindowInitialPosition,
    roiManagerWindowInitialPosition,
    trackWindowInitialPosition,
    viewerSettingsWindowInitialPosition,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition,
    trackSettingsWindowInitialPosition,
    measurementsWindowInitialPosition,
    setMeasurementsWindowInitialPosition: setMeasurementsDialogWindowInitialPosition,
    resetLayout
  };
}

export default useWindowLayout;
