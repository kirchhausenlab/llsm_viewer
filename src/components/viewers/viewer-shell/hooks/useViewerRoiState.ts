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
  selectedSavedRoiIds: string[];
  activeSavedRoiId: string | null;
  editingSavedRoiId: string | null;
  showAllSavedRois: boolean;
  setTool: (tool: RoiTool) => void;
  setDimensionMode: (mode: RoiDimensionMode) => void;
  setDefaultColor: (color: string) => void;
  setWorkingRoi: (roi: RoiDefinition | null) => void;
  updateWorkingRoi: (updater: (current: RoiDefinition) => RoiDefinition) => void;
  activateSavedRoi: (roiId: string) => void;
  selectSavedRoi: (roiId: string, additive?: boolean) => void;
  addWorkingRoi: () => SavedRoi | null;
  deleteActiveSavedRoi: () => void;
  renameActiveSavedRoi: (name: string) => void;
  updateActiveSavedRoiFromWorking: () => void;
  setShowAllSavedRois: (value: boolean) => void;
  replaceState: (state: {
    savedRois: SavedRoi[];
    selectedSavedRoiIds: string[];
    activeSavedRoiId: string | null;
    editingSavedRoiId: string | null;
    workingRoi: RoiDefinition | null;
    defaultColor: string;
    dimensionMode: RoiDimensionMode;
    tool: RoiTool;
  }) => void;
};

const normalizeName = (name: string) => name.trim();

export function useViewerRoiState({
  volumeDimensions,
}: UseViewerRoiStateOptions): UseViewerRoiStateResult {
  const nextRoiIdRef = useRef(1);
  const [tool, setTool] = useState<RoiTool>('line');
  const [dimensionMode, setDimensionMode] = useState<RoiDimensionMode>('2d');
  const [defaultColor, setDefaultColorState] = useState(() => normalizeRoiColor(DEFAULT_ROI_COLOR));
  const [workingRoi, setWorkingRoiState] = useState<RoiDefinition | null>(null);
  const [savedRois, setSavedRois] = useState<SavedRoi[]>([]);
  const [selectedSavedRoiIds, setSelectedSavedRoiIds] = useState<string[]>([]);
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

  const activateSavedRoi = useCallback(
    (roiId: string) => {
      const nextActiveRoi = savedRois.find((roi) => roi.id === roiId) ?? null;
      if (!nextActiveRoi) {
        return;
      }

      setSelectedSavedRoiIds([roiId]);
      setEditingSavedRoiId(roiId);
      setActiveSavedRoiId((currentActiveId) => {
        if (currentActiveId === roiId) {
          return currentActiveId;
        }

        const workingCopy = cloneRoiDefinition(nextActiveRoi);
        setWorkingRoiState(workingCopy);
        setDefaultColorState(normalizeRoiColor(nextActiveRoi.color));
        return nextActiveRoi.id;
      });
    },
    [savedRois]
  );

  const selectSavedRoi = useCallback(
    (roiId: string, additive = false) => {
      const nextActiveRoi = savedRois.find((roi) => roi.id === roiId) ?? null;
      if (!nextActiveRoi) {
        return;
      }

      if (additive && activeSavedRoiId !== null && selectedSavedRoiIds.length > 0) {
        setSelectedSavedRoiIds((current) => (current.includes(roiId) ? current : [...current, roiId]));
        return;
      }

      setSelectedSavedRoiIds([roiId]);
      setEditingSavedRoiId(roiId);
      setActiveSavedRoiId((currentActiveId) => {
        if (currentActiveId === roiId) {
          return currentActiveId;
        }

        const workingCopy = cloneRoiDefinition(nextActiveRoi);
        setWorkingRoiState(workingCopy);
        setDefaultColorState(normalizeRoiColor(nextActiveRoi.color));
        return nextActiveRoi.id;
      });
    },
    [activeSavedRoiId, savedRois, selectedSavedRoiIds.length]
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
    setSelectedSavedRoiIds([savedRoi.id]);
    setActiveSavedRoiId(savedRoi.id);
    setEditingSavedRoiId(savedRoi.id);
    setDefaultColorState(normalizeRoiColor(savedRoi.color));
    return savedRoi;
  }, [volumeDimensions, workingRoi]);

  const deleteActiveSavedRoi = useCallback(() => {
    if (!activeSavedRoiId) {
      return;
    }

    const nextSelectedRoiIds = selectedSavedRoiIds.filter((roiId) => roiId !== activeSavedRoiId);
    const promotedRoi = nextSelectedRoiIds.length > 0
      ? savedRois.find((roi) => roi.id === nextSelectedRoiIds[0]) ?? null
      : null;

    setSavedRois((current) => current.filter((roi) => roi.id !== activeSavedRoiId));
    setSelectedSavedRoiIds(nextSelectedRoiIds);
    setActiveSavedRoiId(promotedRoi?.id ?? null);
    if (promotedRoi) {
      setWorkingRoiState(cloneRoiDefinition(promotedRoi));
      setDefaultColorState(normalizeRoiColor(promotedRoi.color));
      setEditingSavedRoiId(promotedRoi.id);
    } else if (editingSavedRoiId === activeSavedRoiId) {
      setEditingSavedRoiId(null);
    }
  }, [activeSavedRoiId, editingSavedRoiId, savedRois, selectedSavedRoiIds]);

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

  const replaceState = useCallback((state: {
    savedRois: SavedRoi[];
    selectedSavedRoiIds: string[];
    activeSavedRoiId: string | null;
    editingSavedRoiId: string | null;
    workingRoi: RoiDefinition | null;
    defaultColor: string;
    dimensionMode: RoiDimensionMode;
    tool: RoiTool;
  }) => {
    setSavedRois(state.savedRois.map((roi) => cloneSavedRoi(roi)));
    setSelectedSavedRoiIds([...state.selectedSavedRoiIds]);
    setActiveSavedRoiId(state.activeSavedRoiId);
    setEditingSavedRoiId(state.editingSavedRoiId);
    setWorkingRoiState(state.workingRoi ? cloneRoiDefinition(state.workingRoi) : null);
    setDefaultColorState(normalizeRoiColor(state.defaultColor));
    setDimensionMode(state.dimensionMode);
    setTool(state.tool);
  }, []);

  return {
    tool,
    dimensionMode,
    defaultColor,
    workingRoi,
    savedRois: normalizedSavedRois,
    selectedSavedRoiIds,
    activeSavedRoiId,
    editingSavedRoiId,
    showAllSavedRois,
    setTool,
    setDimensionMode,
    setDefaultColor,
    setWorkingRoi,
    updateWorkingRoi,
    activateSavedRoi,
    selectSavedRoi,
    addWorkingRoi,
    deleteActiveSavedRoi,
    renameActiveSavedRoi,
    updateActiveSavedRoiFromWorking,
    setShowAllSavedRois,
    replaceState,
  };
}
