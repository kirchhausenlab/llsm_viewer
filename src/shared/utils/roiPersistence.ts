import type { RoiDefinition, RoiDimensionMode, RoiTool, SavedRoi } from '../../types/roi';
import {
  cloneRoiDefinition,
  cloneSavedRoi,
  DEFAULT_ROI_COLOR,
  normalizeRoiColor,
} from '../../types/roi';
import { validateSavedRoiWithinDimensions } from './roiMeasurements';

type MeasurementDimensions = {
  width: number;
  height: number;
  depth: number;
};

type RoiPersistenceFile = {
  version: 1;
  savedRois: SavedRoi[];
  selectedSavedRoiIds?: string[];
  activeSavedRoiId?: string | null;
  defaultColor?: string;
  dimensionMode?: RoiDimensionMode;
  tool?: RoiTool;
};

export type SerializedRoiManagerState = {
  savedRois: SavedRoi[];
  selectedSavedRoiIds: string[];
  activeSavedRoiId: string | null;
  editingSavedRoiId: string | null;
  workingRoi: RoiDefinition | null;
  defaultColor: string;
  dimensionMode: RoiDimensionMode;
  tool: RoiTool;
};

export function serializeRoiManagerState(state: {
  savedRois: SavedRoi[];
  selectedSavedRoiIds: string[];
  activeSavedRoiId: string | null;
  defaultColor: string;
  dimensionMode: RoiDimensionMode;
  tool: RoiTool;
}) {
  const payload: RoiPersistenceFile = {
    version: 1,
    savedRois: state.savedRois.map((roi) => cloneSavedRoi(roi)),
    selectedSavedRoiIds: [...state.selectedSavedRoiIds],
    activeSavedRoiId: state.activeSavedRoiId,
    defaultColor: normalizeRoiColor(state.defaultColor),
    dimensionMode: state.dimensionMode,
    tool: state.tool,
  };
  return JSON.stringify(payload, null, 2);
}

function assertIsObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeLoadedSavedRoi(value: unknown): SavedRoi {
  if (!assertIsObject(value)) {
    throw new Error('ROI file is malformed.');
  }

  const start = value.start;
  const end = value.end;
  if (!assertIsObject(start) || !assertIsObject(end)) {
    throw new Error('ROI file is malformed.');
  }

  const roi: SavedRoi = {
    id: typeof value.id === 'string' ? value.id : '',
    name: typeof value.name === 'string' ? value.name : '',
    shape: value.shape === 'line' || value.shape === 'rectangle' || value.shape === 'ellipse' ? value.shape : 'line',
    mode: value.mode === '3d' ? '3d' : '2d',
    start: {
      x: Number(start.x),
      y: Number(start.y),
      z: Number(start.z),
    },
    end: {
      x: Number(end.x),
      y: Number(end.y),
      z: Number(end.z),
    },
    color: normalizeRoiColor(typeof value.color === 'string' ? value.color : DEFAULT_ROI_COLOR),
  };

  if (!roi.id || !roi.name) {
    throw new Error('ROI file is malformed.');
  }

  return cloneSavedRoi(roi);
}

export function parseRoiManagerStateFromJson(
  text: string,
  dimensions: MeasurementDimensions,
): SerializedRoiManagerState {
  const parsed = JSON.parse(text) as unknown;
  if (!assertIsObject(parsed) || parsed.version !== 1 || !Array.isArray(parsed.savedRois)) {
    throw new Error('ROI file is malformed.');
  }

  const savedRois = parsed.savedRois.map((roi) => normalizeLoadedSavedRoi(roi));
  if (savedRois.some((roi) => !validateSavedRoiWithinDimensions(roi, dimensions))) {
    throw new Error('Could not load ROI file because one or more ROIs are outside the current experiment bounds.');
  }

  const existingIds = new Set(savedRois.map((roi) => roi.id));
  const selectedSavedRoiIds = Array.isArray(parsed.selectedSavedRoiIds)
    ? parsed.selectedSavedRoiIds.filter((roiId): roiId is string => typeof roiId === 'string' && existingIds.has(roiId))
    : [];
  const dedupedSelectedSavedRoiIds = Array.from(new Set(selectedSavedRoiIds));
  const candidateActiveSavedRoiId =
    typeof parsed.activeSavedRoiId === 'string' && existingIds.has(parsed.activeSavedRoiId)
      ? parsed.activeSavedRoiId
      : null;
  const activeSavedRoiId =
    candidateActiveSavedRoiId ??
    dedupedSelectedSavedRoiIds[0] ??
    savedRois[0]?.id ??
    null;
  const normalizedSelectedSavedRoiIds =
    activeSavedRoiId === null
      ? []
      : dedupedSelectedSavedRoiIds.length > 0
        ? dedupedSelectedSavedRoiIds.includes(activeSavedRoiId)
          ? dedupedSelectedSavedRoiIds
          : [activeSavedRoiId, ...dedupedSelectedSavedRoiIds]
        : [activeSavedRoiId];
  const activeSavedRoi = activeSavedRoiId ? savedRois.find((roi) => roi.id === activeSavedRoiId) ?? null : null;

  return {
    savedRois,
    selectedSavedRoiIds: normalizedSelectedSavedRoiIds,
    activeSavedRoiId,
    editingSavedRoiId: activeSavedRoiId,
    workingRoi: activeSavedRoi ? cloneRoiDefinition(activeSavedRoi) : null,
    defaultColor: normalizeRoiColor(typeof parsed.defaultColor === 'string' ? parsed.defaultColor : DEFAULT_ROI_COLOR),
    dimensionMode: parsed.dimensionMode === '3d' ? '3d' : '2d',
    tool: parsed.tool === 'rectangle' || parsed.tool === 'ellipse' ? parsed.tool : 'line',
  };
}
