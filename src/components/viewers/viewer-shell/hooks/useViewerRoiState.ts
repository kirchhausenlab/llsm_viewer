import { useCallback, useMemo, useRef, useState } from 'react';

import type { RoiDefinition, RoiDimensionMode, RoiTool, SavedRoi } from '../../../../types/roi';
import {
  cloneRoiDefinition,
  cloneSavedRoi,
  DEFAULT_ROI_COLOR,
  formatRoiCentroidName,
  normalizeRoiColor,
} from '../../../../types/roi';

type UseViewerRoiStateOptions = {
  volumeDimensions: {
    width: number;
    height: number;
    depth: number;
  };
};

type UseViewerRoiStateResult = {
  tool: RoiTool;
  dimensionMode: RoiDimensionMode;
  defaultColor: string;
  workingRoi: RoiDefinition | null;
  savedRois: SavedRoi[];
  activeSavedRoiId: string | null;
  editingSavedRoiId: string | null;
  showAllSavedRois: boolean;
  setTool: (tool: RoiTool) => void;
  setDimensionMode: (mode: RoiDimensionMode) => void;
  setDefaultColor: (color: string) => void;
  setWorkingRoi: (roi: RoiDefinition | null) => void;
  updateWorkingRoi: (updater: (current: RoiDefinition) => RoiDefinition) => void;
  selectSavedRoi: (roiId: string | null) => void;
  addWorkingRoi: () => SavedRoi | null;
  deleteActiveSavedRoi: () => void;
  renameActiveSavedRoi: (name: string) => void;
  updateActiveSavedRoiFromWorking: () => void;
  setShowAllSavedRois: (value: boolean) => void;
};

const normalizeName = (name: string) => name.trim();

export function useViewerRoiState({
  volumeDimensions,
}: UseViewerRoiStateOptions): UseViewerRoiStateResult {
  const nextRoiIdRef = useRef(1);
  const [tool, setTool] = useState<RoiTool>('hand');
  const [dimensionMode, setDimensionMode] = useState<RoiDimensionMode>('2d');
  const [defaultColor, setDefaultColorState] = useState(() => normalizeRoiColor(DEFAULT_ROI_COLOR));
  const [workingRoi, setWorkingRoiState] = useState<RoiDefinition | null>(null);
  const [savedRois, setSavedRois] = useState<SavedRoi[]>([]);
  const [activeSavedRoiId, setActiveSavedRoiId] = useState<string | null>(null);
  const [editingSavedRoiId, setEditingSavedRoiId] = useState<string | null>(null);
  const [showAllSavedRois, setShowAllSavedRois] = useState(false);

  const setDefaultColor = useCallback((color: string) => {
    setDefaultColorState(normalizeRoiColor(color));
  }, []);

  const setWorkingRoi = useCallback((roi: RoiDefinition | null) => {
    setWorkingRoiState(roi ? cloneRoiDefinition(roi) : null);
  }, []);

  const updateWorkingRoi = useCallback((updater: (current: RoiDefinition) => RoiDefinition) => {
    setWorkingRoiState((current) => {
      if (!current) {
        return current;
      }
      return cloneRoiDefinition(updater(cloneRoiDefinition(current)));
    });
  }, []);

  const selectSavedRoi = useCallback(
    (roiId: string | null) => {
      setActiveSavedRoiId((currentActiveId) => {
        const nextActiveId = currentActiveId === roiId ? null : roiId;
        const nextActiveRoi = nextActiveId ? savedRois.find((roi) => roi.id === nextActiveId) ?? null : null;

        if (nextActiveRoi) {
          const workingCopy = cloneRoiDefinition(nextActiveRoi);
          setWorkingRoiState(workingCopy);
          setDefaultColorState(normalizeRoiColor(nextActiveRoi.color));
          setEditingSavedRoiId(nextActiveRoi.id);
        } else {
          setEditingSavedRoiId(null);
        }

        return nextActiveId;
      });
    },
    [savedRois]
  );

  const addWorkingRoi = useCallback(() => {
    if (!workingRoi) {
      return null;
    }

    const savedRoi: SavedRoi = {
      ...cloneRoiDefinition(workingRoi),
      id: `roi-${nextRoiIdRef.current++}`,
      name: formatRoiCentroidName(workingRoi, volumeDimensions),
    };

    setSavedRois((current) => [...current, savedRoi]);
    setActiveSavedRoiId(savedRoi.id);
    setEditingSavedRoiId(savedRoi.id);
    setDefaultColorState(normalizeRoiColor(savedRoi.color));
    return savedRoi;
  }, [volumeDimensions, workingRoi]);

  const deleteActiveSavedRoi = useCallback(() => {
    if (!activeSavedRoiId) {
      return;
    }

    setSavedRois((current) => current.filter((roi) => roi.id !== activeSavedRoiId));
    setActiveSavedRoiId(null);
    if (editingSavedRoiId === activeSavedRoiId) {
      setEditingSavedRoiId(null);
    }
  }, [activeSavedRoiId, editingSavedRoiId]);

  const renameActiveSavedRoi = useCallback(
    (name: string) => {
      if (!activeSavedRoiId) {
        return;
      }

      const normalized = normalizeName(name);
      if (!normalized) {
        return;
      }

      setSavedRois((current) =>
        current.map((roi) => (roi.id === activeSavedRoiId ? { ...roi, name: normalized } : roi))
      );
    },
    [activeSavedRoiId]
  );

  const updateActiveSavedRoiFromWorking = useCallback(() => {
    if (!activeSavedRoiId || !workingRoi) {
      return;
    }

    const normalizedWorkingRoi = cloneRoiDefinition(workingRoi);
    setSavedRois((current) =>
      current.map((roi) =>
        roi.id === activeSavedRoiId
          ? {
              ...roi,
              ...normalizedWorkingRoi,
            }
          : roi
      )
    );
    setEditingSavedRoiId(activeSavedRoiId);
    setDefaultColorState(normalizeRoiColor(normalizedWorkingRoi.color));
  }, [activeSavedRoiId, workingRoi]);

  const normalizedSavedRois = useMemo(() => savedRois.map((roi) => cloneSavedRoi(roi)), [savedRois]);

  return {
    tool,
    dimensionMode,
    defaultColor,
    workingRoi,
    savedRois: normalizedSavedRois,
    activeSavedRoiId,
    editingSavedRoiId,
    showAllSavedRois,
    setTool,
    setDimensionMode,
    setDefaultColor,
    setWorkingRoi,
    updateWorkingRoi,
    selectSavedRoi,
    addWorkingRoi,
    deleteActiveSavedRoi,
    renameActiveSavedRoi,
    updateActiveSavedRoiFromWorking,
    setShowAllSavedRois,
  };
}
