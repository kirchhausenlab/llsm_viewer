import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { RoiAlignment, RoiDefinition, RoiDimensionMode, RoiTool, SavedRoi } from '../../../../types/roi';
import {
  cloneRoiDefinition,
  cloneSavedRoi,
  DEFAULT_ROI_ALIGNMENT,
  DEFAULT_ROI_COLOR,
  formatRoiCentroidName,
  normalizeRoiAlignment,
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
  defaultAlignment: RoiAlignment;
  defaultColor: string;
  workingRoi: RoiDefinition | null;
  savedRois: SavedRoi[];
  selectedSavedRoiIds: string[];
  activeSavedRoiId: string | null;
  editingSavedRoiId: string | null;
  showAllSavedRois: boolean;
  setTool: (tool: RoiTool) => void;
  setDimensionMode: (mode: RoiDimensionMode) => void;
  setDefaultAlignment: (alignment: RoiAlignment) => void;
  setDefaultColor: (color: string) => void;
  setWorkingRoi: (roi: RoiDefinition | null, options?: { detach?: boolean }) => void;
  updateWorkingRoi: (updater: (current: RoiDefinition) => RoiDefinition) => void;
  clearWorkingRoiAttachment: () => void;
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
    defaultAlignment?: RoiAlignment;
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
  const [defaultAlignment, setDefaultAlignmentState] = useState<RoiAlignment>(DEFAULT_ROI_ALIGNMENT);
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

  const setDefaultAlignment = useCallback((alignment: RoiAlignment) => {
    setDefaultAlignmentState(normalizeRoiAlignment(alignment));
  }, []);

  const setWorkingRoi = useCallback((roi: RoiDefinition | null, options?: { detach?: boolean }) => {
    setWorkingRoiState(roi ? cloneRoiDefinition(roi) : null);
    if (options?.detach || roi === null) {
      setActiveSavedRoiId(null);
      setEditingSavedRoiId(null);
    }
  }, []);

  const updateWorkingRoi = useCallback((updater: (current: RoiDefinition) => RoiDefinition) => {
    setWorkingRoiState((current) => {
      if (!current) {
        return current;
      }
      return cloneRoiDefinition(updater(cloneRoiDefinition(current)));
    });
  }, []);

  useEffect(() => {
    if (!workingRoi) {
      return;
    }

    setTool((current) => (current === workingRoi.shape ? current : workingRoi.shape));
    setDimensionMode((current) => (current === workingRoi.mode ? current : workingRoi.mode));
    if (workingRoi.mode === '3d') {
      setDefaultAlignmentState(normalizeRoiAlignment(workingRoi.alignment));
    }
  }, [workingRoi]);

  const attachSavedRoi = useCallback(
    (roiId: string, options?: { preserveSelection?: boolean }) => {
      const nextActiveRoi = savedRois.find((roi) => roi.id === roiId) ?? null;
      if (!nextActiveRoi) {
        return;
      }

      if (!options?.preserveSelection) {
        setSelectedSavedRoiIds([roiId]);
      }
      setEditingSavedRoiId(roiId);
      setActiveSavedRoiId((currentActiveId) => {
        if (currentActiveId === roiId) {
          return currentActiveId;
        }

        const workingCopy = cloneRoiDefinition(nextActiveRoi);
        setWorkingRoiState(workingCopy);
        setDefaultColorState(normalizeRoiColor(nextActiveRoi.color));
        if (nextActiveRoi.mode === '3d') {
          setDefaultAlignmentState(normalizeRoiAlignment(nextActiveRoi.alignment));
        }
        return nextActiveRoi.id;
      });
    },
    [savedRois]
  );

  const clearWorkingRoiAttachment = useCallback(() => {
    setWorkingRoiState(null);
    setActiveSavedRoiId(null);
    setEditingSavedRoiId(null);
  }, []);

  const activateSavedRoi = useCallback(
    (roiId: string) => {
      const preserveSelection = activeSavedRoiId === null && selectedSavedRoiIds.includes(roiId);
      attachSavedRoi(roiId, { preserveSelection });
    },
    [activeSavedRoiId, attachSavedRoi, selectedSavedRoiIds]
  );

  const selectSavedRoi = useCallback(
    (roiId: string, additive = false) => {
      if (additive && selectedSavedRoiIds.length > 0) {
        setSelectedSavedRoiIds((current) => (current.includes(roiId) ? current : [...current, roiId]));
        return;
      }

      const preserveSelection = activeSavedRoiId === null && selectedSavedRoiIds.includes(roiId);
      attachSavedRoi(roiId, { preserveSelection });
    },
    [activeSavedRoiId, attachSavedRoi, selectedSavedRoiIds]
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
      if (promotedRoi.mode === '3d') {
        setDefaultAlignmentState(normalizeRoiAlignment(promotedRoi.alignment));
      }
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
    if (normalizedWorkingRoi.mode === '3d') {
      setDefaultAlignmentState(normalizeRoiAlignment(normalizedWorkingRoi.alignment));
    }
  }, [activeSavedRoiId, workingRoi]);

  const normalizedSavedRois = useMemo(() => savedRois.map((roi) => cloneSavedRoi(roi)), [savedRois]);

  const replaceState = useCallback((state: {
    savedRois: SavedRoi[];
    selectedSavedRoiIds: string[];
    activeSavedRoiId: string | null;
    editingSavedRoiId: string | null;
    workingRoi: RoiDefinition | null;
    defaultColor: string;
    defaultAlignment?: RoiAlignment;
    dimensionMode: RoiDimensionMode;
    tool: RoiTool;
  }) => {
    setSavedRois(state.savedRois.map((roi) => cloneSavedRoi(roi)));
    setSelectedSavedRoiIds([...state.selectedSavedRoiIds]);
    setActiveSavedRoiId(state.activeSavedRoiId);
    setEditingSavedRoiId(state.editingSavedRoiId);
    setWorkingRoiState(state.workingRoi ? cloneRoiDefinition(state.workingRoi) : null);
    setDefaultColorState(normalizeRoiColor(state.defaultColor));
    setDefaultAlignmentState(normalizeRoiAlignment(state.defaultAlignment));
    setDimensionMode(state.dimensionMode);
    setTool(state.tool);
  }, []);

  return {
    tool,
    dimensionMode,
    defaultAlignment,
    defaultColor,
    workingRoi,
    savedRois: normalizedSavedRois,
    selectedSavedRoiIds,
    activeSavedRoiId,
    editingSavedRoiId,
    showAllSavedRois,
    setTool,
    setDimensionMode,
    setDefaultAlignment,
    setDefaultColor,
    setWorkingRoi,
    updateWorkingRoi,
    clearWorkingRoiAttachment,
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
