import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import CameraWindow from './viewer-shell/CameraWindow';
import CameraSettingsWindow from './viewer-shell/CameraSettingsWindow';
import DrawRoiWindow from './viewer-shell/DrawRoiWindow';
import HoverSettingsWindow from './viewer-shell/HoverSettingsWindow';
import VolumeViewer from './VolumeViewer';
import ChannelsPanel from './viewer-shell/ChannelsPanel';
import MeasurementsWindow from './viewer-shell/MeasurementsWindow';
import NavigationHelpWindow, { computeNavigationHelpInitialPosition } from './viewer-shell/NavigationHelpWindow';
import PaintbrushWindow from './viewer-shell/PaintbrushWindow';
import PlotSettingsPanel from './viewer-shell/PlotSettingsPanel';
import PropsWindow from './viewer-shell/PropsWindow';
import RecordWindow from './viewer-shell/RecordWindow';
import RoiManagerWindow from './viewer-shell/RoiManagerWindow';
import SetMeasurementsWindow from './viewer-shell/SetMeasurementsWindow';
import TopMenu from './viewer-shell/TopMenu';
import TracksPanel from './viewer-shell/TracksPanel';
import ViewerSettingsWindow from './viewer-shell/ViewerSettingsWindow';
import { useViewerModeControls } from './viewer-shell/hooks/useViewerModeControls';
import { useViewerPaintbrushIntegration } from './viewer-shell/hooks/useViewerPaintbrushIntegration';
import { useViewerPanelWindows } from './viewer-shell/hooks/useViewerPanelWindows';
import { useViewerPropsState } from './viewer-shell/hooks/useViewerPropsState';
import { useViewerRoiState } from './viewer-shell/hooks/useViewerRoiState';
import { useViewerRecording } from './viewer-shell/hooks/useViewerRecording';
import type { ViewerShellProps } from './viewer-shell/types';
import {
  createDefaultLayerSettings,
  RENDER_STYLE_SLICE,
  type RenderStyle,
  type SamplingMode,
} from '../../state/layerSettings';
import type {
  CameraCoordinate,
  CameraRotation,
  CameraWindowController,
  CameraWindowState,
  SavedCameraView,
} from '../../types/camera';
import { formatIntensityValue } from '../../shared/utils/intensityFormatting';
import {
  buildAutoCameraViewLabel,
  createSavedCameraViewId,
  parseSavedCameraViewsFromJson,
  serializeSavedCameraViews,
} from '../../shared/utils/cameraViews';
import {
  buildRoiMeasurementsCsv,
  buildRoiMeasurementsSnapshot,
} from '../../shared/utils/roiMeasurements';
import { parseRoiManagerStateFromJson, serializeRoiManagerState } from '../../shared/utils/roiPersistence';
import { createDefaultTrackSetState } from '../../hooks/tracks/useTrackStyling';
import { resolveTrackVisibilityForState } from '../../shared/utils/trackVisibilityState';
import {
  DEFAULT_ROI_MEASUREMENT_SETTINGS,
  type RoiMeasurementSettings,
  type RoiMeasurementsSnapshot,
} from '../../types/roiMeasurements';
import {
  computeHoverSettingsWindowDefaultPosition,
  MEASUREMENTS_WINDOW_WIDTH,
} from '../../shared/utils/windowLayout';
import {
  DEFAULT_HOVER_SETTINGS,
  clampHoverSliderValue,
} from '../../shared/utils/hoverSettings';
import {
  fromUserFacingVoxelIndex,
  getUserFacingVoxelIndexDigits,
  toUserFacingVoxelIndex,
} from '../../shared/utils/voxelIndex';
import type { HoverSettings, HoverType } from '../../types/hover';

type CoordinateDraft = {
  x: string;
  y: string;
  z: string;
};

type RotationDraft = {
  yaw: string;
  pitch: string;
  roll: string;
};

type LayerRenderModeSnapshot = Record<string, { renderStyle: RenderStyle; samplingMode: SamplingMode }>;

const EMPTY_COORDINATE_DRAFT: CoordinateDraft = { x: '', y: '', z: '' };

function coordinateToDraft(
  coordinate: CameraCoordinate,
  options?: {
    decimalPlaces?: number;
    fixed?: boolean;
  }
): CoordinateDraft {
  const decimalPlaces = options?.decimalPlaces ?? null;
  const fixed = options?.fixed ?? false;
  const formatValue = (value: number) => {
    if (!Number.isFinite(value)) {
      return '';
    }
    if (decimalPlaces === null) {
      return value.toString();
    }
    const rounded = Number(value.toFixed(decimalPlaces));
    return fixed ? rounded.toFixed(decimalPlaces) : rounded.toString();
  };
  return {
    x: formatValue(coordinate.x),
    y: formatValue(coordinate.y),
    z: formatValue(coordinate.z),
  };
}

function voxelCoordinateToDraft(coordinate: CameraCoordinate): CoordinateDraft {
  return {
    x: toUserFacingVoxelIndex(coordinate.x).toString(),
    y: toUserFacingVoxelIndex(coordinate.y).toString(),
    z: toUserFacingVoxelIndex(coordinate.z).toString(),
  };
}

function rotationToDraft(rotation: CameraRotation): RotationDraft {
  return {
    yaw: Number.isFinite(rotation.yaw) ? rotation.yaw.toString() : '',
    pitch: Number.isFinite(rotation.pitch) ? rotation.pitch.toString() : '',
    roll: Number.isFinite(rotation.roll) ? rotation.roll.toString() : '',
  };
}

function parseCoordinateDraft(
  draft: CoordinateDraft,
): { value: CameraCoordinate | null; valid: boolean } {
  const x = Number(draft.x);
  const y = Number(draft.y);
  const z = Number(draft.z);
  if (![x, y, z].every((value) => Number.isFinite(value))) {
    return { value: null, valid: false };
  }
  return {
    value: { x, y, z },
    valid: true,
  };
}

function parseVoxelCoordinateDraft(
  draft: CoordinateDraft,
): { value: CameraCoordinate | null; valid: boolean } {
  const x = fromUserFacingVoxelIndex(Number(draft.x));
  const y = fromUserFacingVoxelIndex(Number(draft.y));
  const z = fromUserFacingVoxelIndex(Number(draft.z));
  if (![x, y, z].every((value) => Number.isFinite(value))) {
    return { value: null, valid: false };
  }
  return {
    value: { x, y, z },
    valid: true,
  };
}

function parseRotationDraft(
  draft: RotationDraft,
): { value: CameraRotation | null; valid: boolean } {
  const yaw = Number(draft.yaw);
  const pitch = Number(draft.pitch);
  const roll = Number(draft.roll);
  if (![yaw, pitch, roll].every((value) => Number.isFinite(value))) {
    return { value: null, valid: false };
  }
  return {
    value: { yaw, pitch, roll },
    valid: true,
  };
}

function coordinatesEqual(left: CameraCoordinate | null | undefined, right: CameraCoordinate | null | undefined): boolean {
  if (!left || !right) {
    return left === right;
  }
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function ViewerShell({
  viewerMode,
  volumeViewerProps,
  loadMeasurementVolume,
  topMenu,
  layout,
  modeControls,
  playbackControls,
  channelsPanel,
  tracksPanel,
  selectedTracksPanel,
  plotSettings,
  trackSettings,
  trackDefaults
}: ViewerShellProps) {
  const {
    windowMargin,
    controlWindowWidth,
    selectedTracksWindowWidth,
    resetToken,
    cameraWindowInitialPosition,
    cameraSettingsWindowInitialPosition,
    viewerSettingsWindowInitialPosition,
    recordWindowInitialPosition,
    layersWindowInitialPosition,
    paintbrushWindowInitialPosition,
    drawRoiWindowInitialPosition,
    propsWindowInitialPosition,
    roiManagerWindowInitialPosition,
    trackWindowInitialPosition,
    selectedTracksWindowInitialPosition,
    plotSettingsWindowInitialPosition,
    trackSettingsWindowInitialPosition,
    measurementsWindowInitialPosition,
    setMeasurementsWindowInitialPosition,
  } = layout;
  const { loadedChannelIds, channelLayersMap } = channelsPanel;
  const managedChannelLayers = useMemo(
    () => loadedChannelIds.flatMap((channelId) => channelLayersMap.get(channelId) ?? []),
    [channelLayersMap, loadedChannelIds]
  );

  const hasVolumeData = loadedChannelIds.some((channelId) =>
    (channelLayersMap.get(channelId) ?? []).some((layer) => layer.volumeCount > 0)
  );
  const hasTrackData = tracksPanel.trackSets.some(
    (trackSet) => (tracksPanel.trackHeadersByTrackSet.get(trackSet.id)?.totalTracks ?? 0) > 0
  );
  const navigationHelpInitialPosition = useMemo(
    () =>
      computeNavigationHelpInitialPosition({
        windowMargin,
        windowWidth: controlWindowWidth * 2
      }),
    [controlWindowWidth, windowMargin]
  );
  const { isHelpMenuOpen, closeHelpMenu } = topMenu;
  const hoverCoordinateDigits = useMemo(() => {
    let maxWidth = 1;
    let maxHeight = 1;
    let maxDepth = 1;

    for (const channelLayers of channelLayersMap.values()) {
      for (const layer of channelLayers) {
        maxWidth = Math.max(maxWidth, layer.width);
        maxHeight = Math.max(maxHeight, layer.height);
        maxDepth = Math.max(maxDepth, layer.depth);
      }
    }

    return {
      x: getUserFacingVoxelIndexDigits(maxWidth),
      y: getUserFacingVoxelIndexDigits(maxHeight),
      z: getUserFacingVoxelIndexDigits(maxDepth)
    };
  }, [channelLayersMap]);
  const hoverIntensityValueDigits = useMemo(() => {
    let maxDigits = 1;

    for (const channelLayers of channelLayersMap.values()) {
      for (const layer of channelLayers) {
        const minDigits = formatIntensityValue(layer.min, layer.dataType).length;
        const maxValueDigits = formatIntensityValue(layer.max, layer.dataType).length;
        const componentPrefixDigits = layer.channels > 1 ? `C${layer.channels} `.length : 0;
        maxDigits = Math.max(maxDigits, componentPrefixDigits + minDigits, componentPrefixDigits + maxValueDigits);
      }
    }

    return maxDigits;
  }, [channelLayersMap]);
  const volumeDimensions = useMemo(() => {
    let maxWidth = 1;
    let maxHeight = 1;
    let maxDepth = 1;

    for (const channelLayers of channelLayersMap.values()) {
      for (const layer of channelLayers) {
        maxWidth = Math.max(maxWidth, layer.width);
        maxHeight = Math.max(maxHeight, layer.height);
        maxDepth = Math.max(maxDepth, layer.depth);
      }
    }

    return {
      width: maxWidth,
      height: maxHeight,
      depth: maxDepth
    };
  }, [channelLayersMap]);
  const volumeShapeZYX = useMemo<[number, number, number]>(
    () => [volumeDimensions.depth, volumeDimensions.height, volumeDimensions.width],
    [volumeDimensions.depth, volumeDimensions.height, volumeDimensions.width]
  );
  const [renderingQuality, setRenderingQuality] = useState(1.1);
  const [hoverSettings, setHoverSettings] = useState<HoverSettings>(() => ({ ...DEFAULT_HOVER_SETTINGS }));
  const [hoverSettingsWindowInitialPosition, setHoverSettingsWindowInitialPosition] = useState(() =>
    computeHoverSettingsWindowDefaultPosition()
  );
  const lastHoverSettingsResetTokenRef = useRef(resetToken);

  const handleRenderingQualityChange = (value: number) => {
    setRenderingQuality(value);
    volumeViewerProps.onVolumeStepScaleChange?.(value);
  };

  const {
    playbackControlsWithRecording,
    registerVolumeCaptureTarget
  } = useViewerRecording({
    viewerMode,
    playbackControls
  });
  const playbackState = playbackControlsWithRecording;
  const recordingIndicatorState =
    playbackState.recordingStatus === 'recording'
      ? 'recording'
      : playbackState.recordingStatus === 'paused' || playbackState.recordingStatus === 'pending-resume'
        ? 'paused'
        : null;
  const countdownValue = playbackState.countdownRemainingSeconds;
  const totalViewerPropTimepoints = Math.max(1, playbackState.volumeTimepointCount);
  const currentViewerPropTimepoint = Math.min(
    totalViewerPropTimepoints,
    Math.max(1, playbackState.selectedIndex + 1)
  );

  const {
    paintbrushController,
    volumeViewerProps: volumeViewerWithCaptureTarget,
    handleSavePainting
  } = useViewerPaintbrushIntegration({
    volumeViewerProps,
    resetToken,
    onVolumeCaptureTarget: registerVolumeCaptureTarget
  });

  const {
    isChannelsWindowOpen,
    openChannelsWindow,
    closeChannelsWindow,
    isCameraWindowOpen,
    openCameraWindow,
    closeCameraWindow,
    isCameraSettingsWindowOpen,
    openCameraSettingsWindow,
    closeCameraSettingsWindow,
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
  } = useViewerPanelWindows({
    resetToken,
    hasTrackData,
    canShowPlotSettings: selectedTracksPanel.shouldRender
  });

  useEffect(() => {
    if (lastHoverSettingsResetTokenRef.current === resetToken) {
      return;
    }
    lastHoverSettingsResetTokenRef.current = resetToken;
    setHoverSettingsWindowInitialPosition(computeHoverSettingsWindowDefaultPosition());
  }, [resetToken]);

  const handleHoverEnabledChange = useCallback((enabled: boolean) => {
    setHoverSettings((current) => ({ ...current, enabled }));
  }, []);

  const handleHoverTypeChange = useCallback((type: HoverType) => {
    setHoverSettings((current) => ({ ...current, type }));
  }, []);

  const handleHoverStrengthChange = useCallback((value: number) => {
    setHoverSettings((current) => ({ ...current, strength: clampHoverSliderValue(value) }));
  }, []);

  const handleHoverRadiusChange = useCallback((value: number) => {
    setHoverSettings((current) => ({ ...current, radius: clampHoverSliderValue(value) }));
  }, []);
  const propsController = useViewerPropsState({
    volumeDimensions,
    totalTimepoints: totalViewerPropTimepoints,
    voxelResolution: volumeViewerProps.voxelResolution ?? null,
  });
  const {
    tool: roiTool,
    dimensionMode: roiDimensionMode,
    defaultColor: roiDefaultColor,
    workingRoi,
    twoDCurrentZEnabled,
    twoDStartZIndex,
    savedRois,
    selectedSavedRoiIds,
    activeSavedRoiId,
    editingSavedRoiId,
    showAllSavedRois,
    setTool: setRoiTool,
    setDimensionMode: setRoiDimensionMode,
    setDefaultColor: setRoiDefaultColor,
    setTwoDCurrentZEnabled,
    setTwoDStartZIndex,
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
  } = useViewerRoiState({
    volumeDimensions,
  });
  const currentRoiColor = workingRoi?.color ?? roiDefaultColor;
  const activeSavedRoi = useMemo(
    () => savedRois.find((roi) => roi.id === activeSavedRoiId) ?? null,
    [activeSavedRoiId, savedRois]
  );
  const currentRoiName = activeSavedRoi?.name ?? (workingRoi ? 'Unsaved ROI' : 'No ROI');
  const roiAttachmentState: 'none' | 'unsaved' | 'saved' =
    activeSavedRoi !== null ? 'saved' : workingRoi ? 'unsaved' : 'none';
  const selectedSavedRois = useMemo(
    () =>
      selectedSavedRoiIds
        .map((roiId) => savedRois.find((roi) => roi.id === roiId) ?? null)
        .filter((roi): roi is (typeof savedRois)[number] => roi !== null),
    [savedRois, selectedSavedRoiIds]
  );
  const viewerLayerVolumeByKey = useMemo(
    () => new Map(volumeViewerProps.layers.map((layer) => [layer.key, layer.volume ?? null])),
    [volumeViewerProps.layers]
  );
  const measurableChannelSources = useMemo(
    () =>
      loadedChannelIds.flatMap((channelId) => {
        const channelLayers = channelLayersMap.get(channelId) ?? [];
        const selectedLayer = channelLayers[0] ?? null;
        if (!selectedLayer || selectedLayer.isSegmentation) {
          return [];
        }
        return [{
          id: channelId,
          name: channelsPanel.channelNameMap.get(channelId) ?? 'Untitled channel',
          layerKey: selectedLayer.key,
          volume: viewerLayerVolumeByKey.get(selectedLayer.key) ?? null,
        }];
      }),
    [channelLayersMap, channelsPanel.channelNameMap, loadedChannelIds, viewerLayerVolumeByKey]
  );
  const canMeasureRois = selectedSavedRois.length > 0 && measurableChannelSources.length > 0;
  const canSaveRois = savedRois.length > 0;
  const canLoadRois = loadedChannelIds.length > 0;
  const [measurementDefaults, setMeasurementDefaults] = useState<RoiMeasurementSettings>(
    DEFAULT_ROI_MEASUREMENT_SETTINGS
  );
  const [measurementsSnapshot, setMeasurementsSnapshot] = useState<RoiMeasurementsSnapshot | null>(null);
  const [measurementsSettings, setMeasurementsSettings] = useState<RoiMeasurementSettings>(
    DEFAULT_ROI_MEASUREMENT_SETTINGS
  );
  const [measurementVisibleChannelIds, setMeasurementVisibleChannelIds] = useState<string[]>([]);
  const [measurementSettingsDraft, setMeasurementSettingsDraft] = useState<RoiMeasurementSettings>(
    DEFAULT_ROI_MEASUREMENT_SETTINGS
  );
  const [isSetMeasurementsWindowOpen, setIsSetMeasurementsWindowOpen] = useState(false);
  const roiLoadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraLoadInputRef = useRef<HTMLInputElement | null>(null);
  const cameraControllerRef = useRef<CameraWindowController | null>(null);
  const pendingCameraViewRef = useRef<SavedCameraView | null>(null);
  const pending2dResetRef = useRef(false);
  const pending3dPoseRestoreRef = useRef<CameraWindowState | null>(null);
  const previous3dPoseRef = useRef<CameraWindowState | null>(null);
  const previousLayerRenderModesRef = useRef<LayerRenderModeSnapshot>({});
  const [cameraWindowState, setCameraWindowState] = useState<CameraWindowState | null>(null);
  const [is2dViewActive, setIs2dViewActive] = useState(false);
  const [translationSpeedMultiplier, setTranslationSpeedMultiplier] = useState(1);
  const [rotationSpeedMultiplier, setRotationSpeedMultiplier] = useState(1);
  const [cameraPositionDraft, setCameraPositionDraft] = useState<CoordinateDraft>(EMPTY_COORDINATE_DRAFT);
  const [cameraRotationDraft, setCameraRotationDraft] = useState<RotationDraft>({
    yaw: '0',
    pitch: '0',
    roll: '0',
  });
  const [isCameraDraftDirty, setIsCameraDraftDirty] = useState(false);
  const [voxelFollowDraft, setVoxelFollowDraft] = useState<CoordinateDraft>(EMPTY_COORDINATE_DRAFT);
  const [savedCameraViews, setSavedCameraViews] = useState<SavedCameraView[]>([]);
  const [selectedCameraViewId, setSelectedCameraViewId] = useState<string | null>(null);

  const handleRoiColorChange = useCallback(
    (color: string) => {
      setRoiDefaultColor(color);
      if (workingRoi) {
        updateWorkingRoi((current) => ({
          ...current,
          color,
        }));
      }
    },
    [setRoiDefaultColor, updateWorkingRoi, workingRoi]
  );

  useEffect(() => {
    if (!twoDCurrentZEnabled || roiDimensionMode !== '2d') {
      return;
    }

    const targetZIndex = Math.max(0, (playbackState.zSliderValue ?? 1) - 1);
    if (workingRoi?.mode === '2d') {
      if (workingRoi.start.z === targetZIndex && workingRoi.end.z === targetZIndex) {
        return;
      }
      updateWorkingRoi((current) => ({
        ...current,
        start: {
          ...current.start,
          z: targetZIndex,
        },
        end: {
          ...current.end,
          z: targetZIndex,
        },
      }));
      return;
    }

    if (!workingRoi) {
      setTwoDStartZIndex(targetZIndex);
    }
  }, [
    playbackState.zSliderValue,
    roiDimensionMode,
    setTwoDStartZIndex,
    twoDCurrentZEnabled,
    updateWorkingRoi,
    workingRoi,
  ]);

  const handleClearOrDetachRoi = useCallback(() => {
    clearWorkingRoiAttachment();
  }, [clearWorkingRoiAttachment]);

  const handleRenameActiveRoi = useCallback(() => {
    if (!activeSavedRoi) {
      return;
    }
    const nextName =
      typeof window !== 'undefined' && typeof window.prompt === 'function'
        ? window.prompt('Rename ROI', activeSavedRoi.name)
        : activeSavedRoi.name;
    if (nextName === null) {
      return;
    }
    renameActiveSavedRoi(nextName);
  }, [activeSavedRoi, renameActiveSavedRoi]);

  const buildTimestampedFileName = useCallback((prefix: string, extension: string) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${prefix}_${timestamp}.${extension}`;
  }, []);

  const downloadTextFile = useCallback((content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.position = 'fixed';
    link.style.left = '-9999px';
    link.style.top = '-9999px';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const saveTextFile = useCallback(
    async (content: string, fileName: string, mimeType: string, accept: Record<string, string[]>) => {
      const target = window as Window & {
        showSaveFilePicker?: (options?: {
          suggestedName?: string;
          types?: Array<{
            description?: string;
            accept: Record<string, string[]>;
          }>;
        }) => Promise<FileSystemFileHandle>;
      };

      if (typeof target.showSaveFilePicker === 'function') {
        try {
          const fileHandle = await target.showSaveFilePicker({
            suggestedName: fileName,
            types: [{ accept }],
          });
          const writable = await fileHandle.createWritable();
          await writable.write(content);
          await writable.close();
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            return;
          }
          // Fall back to a normal browser download below.
        }
      }

      downloadTextFile(content, fileName, mimeType);
    },
    [downloadTextFile]
  );

  const closeMeasurementsWindow = useCallback(() => {
    setMeasurementsSnapshot(null);
    setMeasurementVisibleChannelIds([]);
    setIsSetMeasurementsWindowOpen(false);
  }, []);

  const handleOpenMeasurementsWindow = useCallback(async () => {
    if (!canMeasureRois) {
      return;
    }

    const resolvedChannels = await Promise.all(
      measurableChannelSources.map(async (channel) => {
        if (channel.volume !== null || !loadMeasurementVolume) {
          return channel;
        }

        try {
          const loadedVolume = await loadMeasurementVolume(channel.layerKey, playbackState.selectedIndex);
          return {
            ...channel,
            volume: loadedVolume,
          };
        } catch {
          return channel;
        }
      })
    );

    const snapshot = buildRoiMeasurementsSnapshot({
      selectedRois: selectedSavedRois,
      channels: resolvedChannels,
      timepoint: currentViewerPropTimepoint,
    });

    if (snapshot.rows.length === 0) {
      return;
    }

    setMeasurementsSnapshot(snapshot);
    setMeasurementsSettings(measurementDefaults);
    setMeasurementSettingsDraft(measurementDefaults);
    setMeasurementVisibleChannelIds(snapshot.channels.map((channel) => channel.id));
    setIsSetMeasurementsWindowOpen(false);
  }, [
    canMeasureRois,
    currentViewerPropTimepoint,
    loadMeasurementVolume,
    measurableChannelSources,
    measurementDefaults,
    playbackState.selectedIndex,
    selectedSavedRois,
  ]);

  const handleOpenSetMeasurementsWindow = useCallback(() => {
    setMeasurementSettingsDraft(measurementsSnapshot ? measurementsSettings : measurementDefaults);
    setIsSetMeasurementsWindowOpen(true);
  }, [measurementDefaults, measurementsSettings, measurementsSnapshot]);

  const handleCancelSetMeasurementsWindow = useCallback(() => {
    setMeasurementSettingsDraft(measurementsSettings);
    setIsSetMeasurementsWindowOpen(false);
  }, [measurementsSettings]);

  const handleConfirmSetMeasurementsWindow = useCallback(() => {
    setMeasurementDefaults(measurementSettingsDraft);
    if (measurementsSnapshot) {
      setMeasurementsSettings(measurementSettingsDraft);
    }
    setIsSetMeasurementsWindowOpen(false);
  }, [measurementSettingsDraft, measurementsSnapshot]);

  const handleSaveMeasurements = useCallback(async () => {
    if (!measurementsSnapshot) {
      return;
    }

    const csv = buildRoiMeasurementsCsv({
      snapshot: measurementsSnapshot,
      settings: measurementsSettings,
      visibleChannelIds: measurementVisibleChannelIds,
    });
    await saveTextFile(
      csv,
      buildTimestampedFileName(`measurements_t${measurementsSnapshot.timepoint}`, 'csv'),
      'text/csv',
      { 'text/csv': ['.csv'] },
    );
  }, [
    buildTimestampedFileName,
    measurementVisibleChannelIds,
    measurementsSettings,
    measurementsSnapshot,
    saveTextFile,
  ]);

  const handleSaveRois = useCallback(async () => {
    if (!canSaveRois) {
      return;
    }

    const serialized = serializeRoiManagerState({
      savedRois,
      selectedSavedRoiIds,
      activeSavedRoiId,
      defaultColor: roiDefaultColor,
      dimensionMode: roiDimensionMode,
      tool: roiTool,
    });

    await saveTextFile(
      serialized,
      buildTimestampedFileName('rois', 'json'),
      'application/json',
      { 'application/json': ['.json'] },
    );
  }, [
    activeSavedRoiId,
    buildTimestampedFileName,
    canSaveRois,
    roiDefaultColor,
    roiDimensionMode,
    roiTool,
    saveTextFile,
    savedRois,
    selectedSavedRoiIds,
  ]);

  const handleLoadRoiFile = useCallback(
    async (file: File) => {
      try {
        const loadedState = parseRoiManagerStateFromJson(await file.text(), volumeDimensions);
        replaceState(loadedState);
      } catch (error) {
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(error instanceof Error ? error.message : 'Failed to load ROI file.');
        }
      }
    },
    [replaceState, volumeDimensions]
  );

  const confirmRoiReplacement = useCallback(() => {
    if (
      savedRois.length > 0 &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function'
    ) {
      return window.confirm('Load ROI file and replace the current ROI state?');
    }
    return true;
  }, [savedRois.length]);

  const handleLoadRois = useCallback(async () => {
    if (!canLoadRois) {
      return;
    }

    const target = window as Window & {
      showOpenFilePicker?: (options?: {
        multiple?: boolean;
        types?: Array<{
          description?: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<FileSystemFileHandle[]>;
    };

    if (typeof target.showOpenFilePicker === 'function') {
      try {
        const [fileHandle] = await target.showOpenFilePicker({
          multiple: false,
          types: [{ accept: { 'application/json': ['.json'] } }],
        });
        if (!fileHandle) {
          return;
        }
        const file = await fileHandle.getFile();
        if (!confirmRoiReplacement()) {
          return;
        }
        await handleLoadRoiFile(file);
        return;
      } catch {
        // Fall back to the file input below.
      }
    }

    const input = roiLoadInputRef.current;
    if (!input) {
      return;
    }
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    input.value = '';
    if (typeof pickerInput.showPicker === 'function') {
      try {
        pickerInput.showPicker();
        return;
      } catch {
        // Fall through to input.click() below.
      }
    }
    try {
      input.click();
    } catch (error) {
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(
          error instanceof Error ? error.message : 'Failed to open ROI file picker.'
        );
      }
    }
  }, [canLoadRois, confirmRoiReplacement, handleLoadRoiFile]);

  const handleRegisterCameraWindowController = useCallback((controller: CameraWindowController | null) => {
    cameraControllerRef.current = controller;
  }, []);

  const handleCameraWindowStateChange = useCallback((state: CameraWindowState | null) => {
    setCameraWindowState(state);
  }, []);

  useEffect(() => {
    if (!cameraWindowState || isCameraDraftDirty) {
      return;
    }
    setCameraPositionDraft(
      coordinateToDraft(cameraWindowState.cameraPosition, {
        decimalPlaces: 2,
        fixed: true,
      })
    );
    setCameraRotationDraft(rotationToDraft(cameraWindowState.cameraRotation));
  }, [cameraWindowState, isCameraDraftDirty]);

  const captureCurrentCameraState = useCallback(
    () => cameraControllerRef.current?.captureCameraState() ?? cameraWindowState,
    [cameraWindowState]
  );
  const captureLayerRenderModes = useCallback((): LayerRenderModeSnapshot => {
    const snapshot: LayerRenderModeSnapshot = {};
    for (const layer of managedChannelLayers) {
      const settings = channelsPanel.layerSettings[layer.key] ?? channelsPanel.getLayerDefaultSettings(layer.key);
      snapshot[layer.key] = {
        renderStyle: settings.renderStyle,
        samplingMode: settings.samplingMode,
      };
    }
    return snapshot;
  }, [channelsPanel.getLayerDefaultSettings, channelsPanel.layerSettings, managedChannelLayers]);
  const force2dLayerModes = useCallback(() => {
    for (const layer of managedChannelLayers) {
      channelsPanel.onLayerRenderStyleChange(layer.key, RENDER_STYLE_SLICE, 'nearest');
    }
  }, [channelsPanel.onLayerRenderStyleChange, managedChannelLayers]);
  const restoreLayerRenderModes = useCallback(
    (snapshot: LayerRenderModeSnapshot) => {
      const activeLayerKeys = new Set(managedChannelLayers.map((layer) => layer.key));
      for (const [layerKey, settings] of Object.entries(snapshot)) {
        if (!activeLayerKeys.has(layerKey)) {
          continue;
        }
        channelsPanel.onLayerRenderStyleChange(layerKey, settings.renderStyle, settings.samplingMode);
      }
    },
    [channelsPanel.onLayerRenderStyleChange, managedChannelLayers]
  );

  const handleToggle2dView = useCallback(() => {
    if (is2dViewActive) {
      pending2dResetRef.current = false;
      pending3dPoseRestoreRef.current = previous3dPoseRef.current;
      setIs2dViewActive(false);
      restoreLayerRenderModes(previousLayerRenderModesRef.current);
      modeControls.onProjectionModeChange('perspective');
      return;
    }

    if (modeControls.isVrActive || !modeControls.resetViewHandler) {
      return;
    }

    previous3dPoseRef.current = captureCurrentCameraState();
    previousLayerRenderModesRef.current = captureLayerRenderModes();
    pending3dPoseRestoreRef.current = null;
    pending2dResetRef.current = true;
    setIs2dViewActive(true);
    force2dLayerModes();
    modeControls.onProjectionModeChange('orthographic');
  }, [
    captureCurrentCameraState,
    captureLayerRenderModes,
    force2dLayerModes,
    is2dViewActive,
    modeControls.isVrActive,
    modeControls.onProjectionModeChange,
    modeControls.resetViewHandler,
    restoreLayerRenderModes,
  ]);

  useEffect(() => {
    if (!is2dViewActive || !pending2dResetRef.current || modeControls.projectionMode !== 'orthographic') {
      return;
    }
    pending2dResetRef.current = false;
    modeControls.resetViewHandler?.();
  }, [is2dViewActive, modeControls.projectionMode, modeControls.resetViewHandler]);

  useEffect(() => {
    const pendingPose = pending3dPoseRestoreRef.current;
    if (is2dViewActive || !pendingPose || modeControls.projectionMode !== 'perspective') {
      return;
    }

    const controller = cameraControllerRef.current;
    if (
      controller?.applyCameraPose({
        cameraPosition: pendingPose.cameraPosition,
        cameraRotation: pendingPose.cameraRotation,
      })
    ) {
      pending3dPoseRestoreRef.current = null;
      setIsCameraDraftDirty(false);
    }
  }, [is2dViewActive, modeControls.projectionMode]);

  useEffect(() => {
    if (!volumeViewerProps.followedVoxel) {
      return;
    }
    setVoxelFollowDraft(voxelCoordinateToDraft(volumeViewerProps.followedVoxel.coordinates));
  }, [volumeViewerProps.followedVoxel]);

  useEffect(() => {
    const pendingView = pendingCameraViewRef.current;
    if (!pendingView || is2dViewActive || volumeViewerProps.followedTrackId !== null) {
      return;
    }

    const controller = cameraControllerRef.current;
    if (!controller) {
      return;
    }

    if (pendingView.mode === 'free-roam') {
      if (volumeViewerProps.followedVoxel !== null) {
        return;
      }
    } else if (!coordinatesEqual(volumeViewerProps.followedVoxel?.coordinates, pendingView.followedVoxel)) {
      return;
    }

    if (
      controller.applyCameraPose({
        cameraPosition: pendingView.cameraPosition,
        cameraRotation: pendingView.cameraRotation,
      })
    ) {
      pendingCameraViewRef.current = null;
      setIsCameraDraftDirty(false);
    }
  }, [is2dViewActive, volumeViewerProps.followedTrackId, volumeViewerProps.followedVoxel]);

  const translationEnabled =
    !is2dViewActive && volumeViewerProps.followedTrackId === null && volumeViewerProps.followedVoxel === null;
  const rotationEnabled = !is2dViewActive;
  const parsedCameraPosition = useMemo(() => parseCoordinateDraft(cameraPositionDraft), [cameraPositionDraft]);
  const parsedCameraRotation = useMemo(() => parseRotationDraft(cameraRotationDraft), [cameraRotationDraft]);
  const parsedFollowVoxel = useMemo(() => parseVoxelCoordinateDraft(voxelFollowDraft), [voxelFollowDraft]);
  const canUpdateCamera =
    !is2dViewActive &&
    cameraControllerRef.current !== null &&
    parsedCameraRotation.valid &&
    (translationEnabled ? parsedCameraPosition.valid : true);
  const voxelFollowLocked =
    is2dViewActive || volumeViewerProps.followedTrackId !== null || volumeViewerProps.followedVoxel !== null;
  const voxelFollowButtonLabel: 'Follow' | 'Stop' = volumeViewerProps.followedVoxel ? 'Stop' : 'Follow';
  const voxelFollowButtonDisabled =
    is2dViewActive ||
    volumeViewerProps.followedTrackId !== null ||
    (volumeViewerProps.followedVoxel === null && !parsedFollowVoxel.valid);
  const canAddCameraView =
    !is2dViewActive && cameraWindowState !== null && volumeViewerProps.followedTrackId === null;
  const canActivateCameraViews = !is2dViewActive && volumeViewerProps.followedTrackId === null;
  const canRemoveCameraView = !is2dViewActive && selectedCameraViewId !== null;
  const canSaveCameraViews = !is2dViewActive && savedCameraViews.length > 0;
  const canLoadCameraViews = !is2dViewActive && hasVolumeData;
  const canClearCameraViews = !is2dViewActive && savedCameraViews.length > 0;

  const handleCameraPositionChange = useCallback((axis: keyof CoordinateDraft, value: string) => {
    setCameraPositionDraft((current) => ({ ...current, [axis]: value }));
    setIsCameraDraftDirty(true);
  }, []);

  const handleCameraRotationChange = useCallback((axis: keyof RotationDraft, value: string) => {
    setCameraRotationDraft((current) => ({ ...current, [axis]: value }));
    setIsCameraDraftDirty(true);
  }, []);

  const handleApplyCameraUpdate = useCallback(() => {
    if (is2dViewActive) {
      return;
    }
    const controller = cameraControllerRef.current;
    if (!controller || !parsedCameraRotation.value) {
      return;
    }

    const applied = controller.applyCameraPose({
      cameraPosition: translationEnabled ? parsedCameraPosition.value : undefined,
      cameraRotation: parsedCameraRotation.value,
    });
    if (applied) {
      setIsCameraDraftDirty(false);
    }
  }, [is2dViewActive, parsedCameraPosition.value, parsedCameraRotation.value, translationEnabled]);

  const handleVoxelFollowChange = useCallback((axis: keyof CoordinateDraft, value: string) => {
    setVoxelFollowDraft((current) => ({ ...current, [axis]: value }));
  }, []);

  const handleVoxelFollowButtonClick = useCallback(() => {
    if (is2dViewActive || volumeViewerProps.followedTrackId !== null) {
      return;
    }

    if (volumeViewerProps.followedVoxel) {
      topMenu.onStopVoxelFollow();
      return;
    }

    if (!parsedFollowVoxel.value) {
      return;
    }

    const clampedCoordinates = {
      x: Math.min(Math.max(Math.round(parsedFollowVoxel.value.x), 0), volumeDimensions.width - 1),
      y: Math.min(Math.max(Math.round(parsedFollowVoxel.value.y), 0), volumeDimensions.height - 1),
      z: Math.min(Math.max(Math.round(parsedFollowVoxel.value.z), 0), volumeDimensions.depth - 1),
    };
    setVoxelFollowDraft(voxelCoordinateToDraft(clampedCoordinates));
    volumeViewerProps.onVoxelFollowRequest({
      coordinates: clampedCoordinates,
    });
  }, [
    is2dViewActive,
    parsedFollowVoxel.value,
    topMenu,
    volumeDimensions.depth,
    volumeDimensions.height,
    volumeDimensions.width,
    volumeViewerProps,
  ]);

  const handleAddCameraView = useCallback(() => {
    if (is2dViewActive || !cameraWindowState || volumeViewerProps.followedTrackId !== null) {
      return;
    }

    setSavedCameraViews((current) => {
      const viewMode = volumeViewerProps.followedVoxel ? 'voxel-follow' : 'free-roam';
      const nextView: SavedCameraView =
        viewMode === 'voxel-follow' && volumeViewerProps.followedVoxel
          ? {
              id: createSavedCameraViewId(Date.now() + current.length + 1),
              label: buildAutoCameraViewLabel(current, viewMode, volumeViewerProps.followedVoxel.coordinates),
              mode: viewMode,
              cameraPosition: cameraWindowState.cameraPosition,
              cameraRotation: cameraWindowState.cameraRotation,
              followedVoxel: volumeViewerProps.followedVoxel.coordinates,
            }
          : {
              id: createSavedCameraViewId(Date.now() + current.length + 1),
              label: buildAutoCameraViewLabel(current, 'free-roam'),
              mode: 'free-roam',
              cameraPosition: cameraWindowState.cameraPosition,
              cameraRotation: cameraWindowState.cameraRotation,
            };
      return [...current, nextView];
    });
  }, [cameraWindowState, is2dViewActive, volumeViewerProps.followedTrackId, volumeViewerProps.followedVoxel]);

  const handleRemoveCameraView = useCallback(() => {
    if (!selectedCameraViewId) {
      return;
    }
    setSavedCameraViews((current) => current.filter((view) => view.id !== selectedCameraViewId));
    setSelectedCameraViewId(null);
  }, [selectedCameraViewId]);

  const handleRenameCameraView = useCallback(() => {
    if (!selectedCameraViewId) {
      return;
    }
    const activeView = savedCameraViews.find((view) => view.id === selectedCameraViewId) ?? null;
    if (!activeView) {
      return;
    }
    const nextName =
      typeof window !== 'undefined' && typeof window.prompt === 'function'
        ? window.prompt('Rename view', activeView.label)
        : activeView.label;
    if (nextName === null) {
      return;
    }
    const normalizedName = nextName.trim();
    if (!normalizedName) {
      return;
    }
    setSavedCameraViews((current) =>
      current.map((view) => (view.id === selectedCameraViewId ? { ...view, label: normalizedName } : view))
    );
  }, [savedCameraViews, selectedCameraViewId]);

  const handleClearCameraViews = useCallback(() => {
    setSavedCameraViews([]);
    setSelectedCameraViewId(null);
  }, []);

  const handleSelectCameraView = useCallback(
    (viewId: string) => {
      if (is2dViewActive) {
        return;
      }
      setSelectedCameraViewId(viewId);
      if (volumeViewerProps.followedTrackId !== null) {
        return;
      }

      const view = savedCameraViews.find((entry) => entry.id === viewId) ?? null;
      if (!view) {
        return;
      }

      const controller = cameraControllerRef.current;
      if (!controller) {
        return;
      }

      if (view.mode === 'free-roam') {
        if (volumeViewerProps.followedVoxel) {
          pendingCameraViewRef.current = view;
          topMenu.onStopVoxelFollow();
          return;
        }
      } else if (!coordinatesEqual(volumeViewerProps.followedVoxel?.coordinates, view.followedVoxel)) {
        pendingCameraViewRef.current = view;
        volumeViewerProps.onVoxelFollowRequest({
          coordinates: view.followedVoxel,
        });
        return;
      }

      if (
        controller.applyCameraPose({
          cameraPosition: view.cameraPosition,
          cameraRotation: view.cameraRotation,
        })
      ) {
        setIsCameraDraftDirty(false);
      }
    },
    [is2dViewActive, savedCameraViews, topMenu, volumeViewerProps],
  );

  const handleSaveCameraViews = useCallback(async () => {
    if (savedCameraViews.length === 0) {
      return;
    }

    const serialized = serializeSavedCameraViews({
      shapeZYX: volumeShapeZYX,
      views: savedCameraViews,
    });
    await saveTextFile(
      serialized,
      buildTimestampedFileName('camera_views', 'json'),
      'application/json',
      { 'application/json': ['.json'] },
    );
  }, [buildTimestampedFileName, saveTextFile, savedCameraViews, volumeShapeZYX]);

  const handleLoadCameraFile = useCallback(
    async (file: File) => {
      try {
        const loadedViews = parseSavedCameraViewsFromJson(await file.text(), volumeShapeZYX);
        setSavedCameraViews(loadedViews);
        setSelectedCameraViewId(null);
      } catch (error) {
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
          window.alert(error instanceof Error ? error.message : 'Failed to load camera views file.');
        }
      }
    },
    [volumeShapeZYX],
  );

  const confirmCameraViewReplacement = useCallback(() => {
    if (
      savedCameraViews.length > 0 &&
      typeof window !== 'undefined' &&
      typeof window.confirm === 'function'
    ) {
      return window.confirm('Load camera views file and replace the current saved views?');
    }
    return true;
  }, [savedCameraViews.length]);

  const handleLoadCameraViews = useCallback(async () => {
    if (!canLoadCameraViews) {
      return;
    }

    const target = window as Window & {
      showOpenFilePicker?: (options?: {
        multiple?: boolean;
        types?: Array<{
          description?: string;
          accept: Record<string, string[]>;
        }>;
      }) => Promise<FileSystemFileHandle[]>;
    };

    if (typeof target.showOpenFilePicker === 'function') {
      try {
        const [fileHandle] = await target.showOpenFilePicker({
          multiple: false,
          types: [{ accept: { 'application/json': ['.json'] } }],
        });
        if (!fileHandle) {
          return;
        }
        const file = await fileHandle.getFile();
        if (!confirmCameraViewReplacement()) {
          return;
        }
        await handleLoadCameraFile(file);
        return;
      } catch {
        // Fall back to the file input below.
      }
    }

    const input = cameraLoadInputRef.current;
    if (!input) {
      return;
    }
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    input.value = '';
    if (typeof pickerInput.showPicker === 'function') {
      try {
        pickerInput.showPicker();
        return;
      } catch {
        // Fall through to input.click() below.
      }
    }
    input.click();
  }, [canLoadCameraViews, confirmCameraViewReplacement, handleLoadCameraFile]);

  useEffect(() => {
    if (typeof window === 'undefined' || !import.meta.env?.DEV) {
      return;
    }

    const setWorkingRoiForTests = (nextRoi: typeof workingRoi) => {
      setWorkingRoi(nextRoi);
      if (nextRoi?.color) {
        setRoiDefaultColor(nextRoi.color);
      }
      return true;
    };

    (window as Window & { __LLSM_SET_WORKING_ROI__?: ((roi: typeof workingRoi) => boolean) | null }).__LLSM_SET_WORKING_ROI__ =
      setWorkingRoiForTests;

    return () => {
      const target = window as Window & { __LLSM_SET_WORKING_ROI__?: ((roi: typeof workingRoi) => boolean) | null };
      if (target.__LLSM_SET_WORKING_ROI__ === setWorkingRoiForTests) {
        delete target.__LLSM_SET_WORKING_ROI__;
      }
    };
  }, [setRoiDefaultColor, setWorkingRoi, workingRoi]);

  useEffect(() => {
    if (typeof window === 'undefined' || !import.meta.env?.DEV) {
      return;
    }

    const getMeasurementChannelStateForTests = () =>
      measurableChannelSources.map((channel) => ({
        id: channel.id,
        name: channel.name,
        hasVolume: channel.volume !== null,
      }));

    (
      window as Window & {
        __LLSM_MEASUREMENT_CHANNEL_SOURCES__?: (() => Array<{ id: string; name: string; hasVolume: boolean }>) | null;
      }
    ).__LLSM_MEASUREMENT_CHANNEL_SOURCES__ = getMeasurementChannelStateForTests;

    return () => {
      const target = window as Window & {
        __LLSM_MEASUREMENT_CHANNEL_SOURCES__?: (() => Array<{ id: string; name: string; hasVolume: boolean }>) | null;
      };
      if (target.__LLSM_MEASUREMENT_CHANNEL_SOURCES__ === getMeasurementChannelStateForTests) {
        delete target.__LLSM_MEASUREMENT_CHANNEL_SOURCES__;
      }
    };
  }, [measurableChannelSources]);

  useEffect(() => {
    if (typeof window === 'undefined' || !import.meta.env?.DEV) {
      return;
    }

    const getCameraWindowStateForTests = () => ({
      cameraWindowState,
      translationSpeedMultiplier,
      rotationSpeedMultiplier,
      savedViews: savedCameraViews,
      selectedCameraViewId,
      volumeShapeZYX,
      followedTrackId: volumeViewerProps.followedTrackId,
      followedVoxel: volumeViewerProps.followedVoxel?.coordinates ?? null,
    });

    (
      window as Window & {
        __LLSM_CAMERA_WINDOW_STATE__?: (() => ReturnType<typeof getCameraWindowStateForTests>) | null;
      }
    ).__LLSM_CAMERA_WINDOW_STATE__ = getCameraWindowStateForTests;

    return () => {
      const target = window as Window & {
        __LLSM_CAMERA_WINDOW_STATE__?: (() => ReturnType<typeof getCameraWindowStateForTests>) | null;
      };
      if (target.__LLSM_CAMERA_WINDOW_STATE__ === getCameraWindowStateForTests) {
        delete target.__LLSM_CAMERA_WINDOW_STATE__;
      }
    };
  }, [
    cameraWindowState,
    rotationSpeedMultiplier,
    savedCameraViews,
    selectedCameraViewId,
    translationSpeedMultiplier,
    volumeShapeZYX,
    volumeViewerProps.followedTrackId,
    volumeViewerProps.followedVoxel,
  ]);

  const showRenderingQualityControl = modeControls.is3dModeAvailable;
  const globalRenderControls = useMemo(() => {
    const fallbackSettings = createDefaultLayerSettings();
    const firstChannelId = channelsPanel.loadedChannelIds[0] ?? null;
    const firstLayer = firstChannelId ? (channelsPanel.channelLayersMap.get(firstChannelId) ?? [])[0] ?? null : null;
    const settings = firstLayer
      ? channelsPanel.layerSettings[firstLayer.key] ?? channelsPanel.getLayerDefaultSettings(firstLayer.key)
      : fallbackSettings;
    const controlLayerKey = firstLayer?.key ?? null;

    const withLayerKey = (callback: ((layerKey: string, value: number) => void) | undefined) => (value: number) => {
      if (!callback || !controlLayerKey) {
        return;
      }
      callback(controlLayerKey, value);
    };

    return {
      disabled: !firstLayer || firstLayer.volumeCount === 0,
      mipEarlyExitThreshold: settings.mipEarlyExitThreshold,
      blDensityScale: settings.blDensityScale,
      blBackgroundCutoff: settings.blBackgroundCutoff,
      blOpacityScale: settings.blOpacityScale,
      blEarlyExitAlpha: settings.blEarlyExitAlpha,
      onBlDensityScaleChange: withLayerKey(channelsPanel.onLayerBlDensityScaleChange),
      onBlBackgroundCutoffChange: withLayerKey(channelsPanel.onLayerBlBackgroundCutoffChange),
      onBlOpacityScaleChange: withLayerKey(channelsPanel.onLayerBlOpacityScaleChange),
      onBlEarlyExitAlphaChange: withLayerKey(channelsPanel.onLayerBlEarlyExitAlphaChange),
      onMipEarlyExitThresholdChange: withLayerKey(channelsPanel.onLayerMipEarlyExitThresholdChange)
    };
  }, [channelsPanel]);
  const resolvedGlobalRenderControls = useMemo(
    () => ({
      ...globalRenderControls,
      disabled: globalRenderControls.disabled || is2dViewActive,
    }),
    [globalRenderControls, is2dViewActive]
  );

  const { modeToggle, viewerSettings } = useViewerModeControls({
    modeControls,
    showRenderingQualityControl,
    renderingQuality,
    onRenderingQualityChange: handleRenderingQualityChange,
    hasVolumeData
  });
  const twoDViewButtonDisabled = modeToggle.isVrActive || (!is2dViewActive && !modeToggle.resetViewHandler);
  const twoDViewButtonTitle = modeToggle.isVrActive
    ? '2D view is unavailable while VR is active.'
    : !is2dViewActive && !modeToggle.resetViewHandler
      ? '2D view is unavailable until the viewer is ready.'
      : undefined;
  const vrButtonDisabled = modeToggle.vrButtonDisabled || is2dViewActive;
  const vrButtonTitle = is2dViewActive
    ? 'VR is unavailable while 2D view is active.'
    : modeToggle.vrButtonTitle;
  const segmentationChannelIds = useMemo(() => {
    const next = new Set<string>();

    for (const channelId of channelsPanel.loadedChannelIds) {
      const channelLayers = channelsPanel.channelLayersMap.get(channelId) ?? [];
      if (channelLayers.length > 0 && channelLayers.every((layer) => layer.isSegmentation)) {
        next.add(channelId);
      }
    }

    return next;
  }, [channelsPanel.channelLayersMap, channelsPanel.loadedChannelIds]);
  const trackVisibilitySummaryByTrackSet = useMemo(() => {
    const summary = new Map<string, { total: number; visible: number }>();

    for (const trackSet of tracksPanel.trackSets) {
      const state = tracksPanel.trackSetStates[trackSet.id] ?? createDefaultTrackSetState();
      const tracksForSet = tracksPanel.filteredTracksByTrackSet.get(trackSet.id) ?? [];
      if (tracksForSet.length === 0) {
        const total = tracksPanel.trackHeadersByTrackSet.get(trackSet.id)?.totalTracks ?? 0;
        const visible = state.defaultVisibility ? total : 0;
        summary.set(trackSet.id, { total, visible });
        continue;
      }

      let visible = 0;
      for (const track of tracksForSet) {
        const explicitVisible = resolveTrackVisibilityForState(state, track.id);
        const isFollowedTrack = tracksPanel.followedTrackId === track.id;
        const isSelectedTrack = tracksPanel.selectedTrackIds.has(track.id);
        if (explicitVisible || isFollowedTrack || isSelectedTrack) {
          visible += 1;
        }
      }

      summary.set(trackSet.id, { total: tracksForSet.length, visible });
    }

    return summary;
  }, [
    tracksPanel.filteredTracksByTrackSet,
    tracksPanel.followedTrackId,
    tracksPanel.selectedTrackIds,
    tracksPanel.trackHeadersByTrackSet,
    tracksPanel.trackSetStates,
    tracksPanel.trackSets
  ]);

  const topMenuProps = useMemo(
    () => ({
      ...topMenu,
      onOpenChannelsWindow: openChannelsWindow,
      onOpenCameraWindow: openCameraWindow,
      onOpenCameraSettingsWindow: openCameraSettingsWindow,
      onOpenPropsWindow: openPropsWindow,
      onOpenPaintbrush: openPaintbrush,
      onOpenDrawRoiWindow: openDrawRoiWindow,
      onOpenRoiManagerWindow: openRoiManagerWindow,
      onOpenSetMeasurementsWindow: handleOpenSetMeasurementsWindow,
      onOpenRecordWindow: openRecordWindow,
      onOpenRenderSettingsWindow: openViewerSettings,
      onOpenHoverSettingsWindow: openHoverSettingsWindow,
      onOpenTracksWindow: openTracksWindow,
      onOpenAmplitudePlotWindow: openAmplitudePlot,
      onOpenPlotSettingsWindow: openPlotSettings,
      onOpenTrackSettingsWindow: openTrackSettings,
      onOpenDiagnosticsWindow: openDiagnosticsWindow,
      is3dModeAvailable: modeToggle.is3dModeAvailable,
      resetViewHandler: modeToggle.resetViewHandler,
      is2dViewActive,
      onToggle2dView: handleToggle2dView,
      twoDViewButtonDisabled,
      twoDViewButtonTitle,
      onVrButtonClick: modeToggle.onVrButtonClick,
      vrButtonDisabled,
      vrButtonTitle,
      vrButtonLabel: modeToggle.vrButtonLabel,
      volumeTimepointCount: playbackState.volumeTimepointCount,
      isPlaying: playbackState.isPlaying,
      selectedIndex: playbackState.selectedIndex,
      onTimeIndexChange: playbackState.onTimeIndexChange,
      playbackDisabled: playbackState.playbackDisabled,
      onTogglePlayback: playbackState.onTogglePlayback,
      zSliderValue: playbackState.zSliderValue,
      zSliderMax: playbackState.zSliderMax,
      onZSliderChange: playbackState.onZSliderChange,
      loadedChannelIds: channelsPanel.loadedChannelIds,
      channelNameMap: channelsPanel.channelNameMap,
      channelVisibility: channelsPanel.channelVisibility,
      channelTintMap: channelsPanel.channelTintMap,
      segmentationChannelIds,
      activeChannelId: channelsPanel.activeChannelId,
      onChannelTabSelect: channelsPanel.onChannelTabSelect,
      onChannelVisibilityToggle: channelsPanel.onChannelVisibilityToggle,
      trackSets: tracksPanel.trackSets,
      trackHeadersByTrackSet: tracksPanel.trackHeadersByTrackSet,
      activeTrackSetId: tracksPanel.activeTrackSetId,
      trackColorModesByTrackSet: tracksPanel.trackColorModesByTrackSet,
      trackVisibilitySummaryByTrackSet,
      onTrackSetTabSelect: tracksPanel.onTrackSetTabSelect,
      onTrackVisibilityAllChange: tracksPanel.onTrackVisibilityAllChange,
      hoverCoordinateDigits,
      hoverIntensityValueDigits
    }),
    [
      channelsPanel,
      hoverCoordinateDigits,
      hoverIntensityValueDigits,
      modeToggle,
      openAmplitudePlot,
      openCameraWindow,
      openCameraSettingsWindow,
      openPlotSettings,
      openChannelsWindow,
      openDiagnosticsWindow,
      openHoverSettingsWindow,
      openPaintbrush,
      openDrawRoiWindow,
      handleOpenSetMeasurementsWindow,
      handleToggle2dView,
      openRecordWindow,
      openRoiManagerWindow,
      openPropsWindow,
      openTrackSettings,
      openTracksWindow,
      openViewerSettings,
      playbackState,
      segmentationChannelIds,
      is2dViewActive,
      twoDViewButtonDisabled,
      twoDViewButtonTitle,
      trackVisibilitySummaryByTrackSet,
      tracksPanel,
      vrButtonDisabled,
      vrButtonTitle,
      topMenu
    ]
  );
  const volumeViewerPropsWithViewerProps = useMemo(
    () => ({
      ...volumeViewerWithCaptureTarget,
      hoverSettings,
      translationSpeedMultiplier,
      rotationSpeedMultiplier,
      rotationLocked: is2dViewActive,
      onCameraWindowStateChange: handleCameraWindowStateChange,
      onRegisterCameraWindowController: handleRegisterCameraWindowController,
      viewerPropsConfig: {
        props: propsController.props,
        selectedPropId: propsController.selectedPropId,
        isEditing: isPropsWindowOpen,
        currentTimepoint: currentViewerPropTimepoint,
        totalTimepoints: totalViewerPropTimepoints,
        temporalResolution: volumeViewerProps.temporalResolution ?? null,
        voxelResolution: volumeViewerProps.voxelResolution ?? null,
        onSelectProp: propsController.selectProp,
        onUpdateScreenPosition: propsController.updateScreenPosition,
        onUpdateWorldPosition: propsController.updateWorldPosition,
      },
      roiConfig: {
        isDrawWindowOpen: isDrawRoiWindowOpen,
        tool: roiTool,
        dimensionMode: roiDimensionMode,
        selectedZIndex: Math.max(0, (playbackState.zSliderValue ?? 1) - 1),
        twoDCurrentZEnabled,
        twoDStartZIndex,
        defaultColor: roiDefaultColor,
        workingRoi,
        savedRois,
        activeSavedRoiId,
        editingSavedRoiId,
        showAllSavedRois,
        onWorkingRoiChange: setWorkingRoi,
        onSavedRoiActivate: activateSavedRoi,
      },
    }),
    [
      activeSavedRoiId,
      editingSavedRoiId,
      isPropsWindowOpen,
      isDrawRoiWindowOpen,
      activateSavedRoi,
      twoDCurrentZEnabled,
      twoDStartZIndex,
      propsController.props,
      propsController.selectProp,
      propsController.selectedPropId,
      propsController.updateScreenPosition,
      propsController.updateWorldPosition,
      currentViewerPropTimepoint,
      totalViewerPropTimepoints,
      roiDefaultColor,
      roiDimensionMode,
      roiTool,
      savedRois,
      setWorkingRoi,
      showAllSavedRois,
      volumeViewerProps.temporalResolution,
      volumeViewerWithCaptureTarget,
      hoverSettings,
      is2dViewActive,
      translationSpeedMultiplier,
      rotationSpeedMultiplier,
      handleCameraWindowStateChange,
      handleRegisterCameraWindowController,
      workingRoi,
      playbackState.zSliderValue,
    ]
  );

  return (
    <div className="app">
      <input
        ref={roiLoadInputRef}
        type="file"
        accept=".json,application/json"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          width: '1px',
          height: '1px',
          opacity: 0,
          pointerEvents: 'none',
        }}
        onChange={async (event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (!file) {
            return;
          }
          if (!confirmRoiReplacement()) {
            return;
          }
          await handleLoadRoiFile(file);
        }}
      />

      <input
        ref={cameraLoadInputRef}
        type="file"
        accept=".json,application/json"
        data-camera-load-input="true"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: '-9999px',
          width: '1px',
          height: '1px',
          opacity: 0,
          pointerEvents: 'none',
        }}
        onChange={async (event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (!file) {
            return;
          }
          if (!confirmCameraViewReplacement()) {
            return;
          }
          await handleLoadCameraFile(file);
        }}
      />

      <main className="viewer">
        <VolumeViewer
          {...volumeViewerPropsWithViewerProps}
          isDiagnosticsWindowOpen={isDiagnosticsWindowOpen}
          onCloseDiagnosticsWindow={closeDiagnosticsWindow}
          windowResetSignal={resetToken}
        />
      </main>

      <TopMenu {...topMenuProps} />

      {recordingIndicatorState ? (
        <div
          className={`viewer-capture-indicator viewer-capture-indicator--${recordingIndicatorState}`}
          aria-hidden="true"
        />
      ) : null}

      {typeof countdownValue === 'number' && countdownValue > 0 ? (
        <div className="viewer-capture-countdown" role="status" aria-live="assertive">
          <span className="viewer-capture-countdown__value">{countdownValue}</span>
        </div>
      ) : null}

      <NavigationHelpWindow
        isOpen={isHelpMenuOpen}
        onClose={closeHelpMenu}
        initialPosition={navigationHelpInitialPosition}
        windowMargin={windowMargin}
        width={controlWindowWidth * 2}
        resetSignal={resetToken}
      />

      {isCameraWindowOpen ? (
        <CameraWindow
          initialPosition={cameraWindowInitialPosition}
          windowMargin={windowMargin}
          resetSignal={resetToken}
          cameraPositionDraft={cameraPositionDraft}
          cameraRotationDraft={cameraRotationDraft}
          translationEnabled={translationEnabled}
          rotationEnabled={rotationEnabled}
          canUpdate={canUpdateCamera}
          voxelFollowDraft={
            volumeViewerProps.followedTrackId !== null
              ? EMPTY_COORDINATE_DRAFT
              : voxelFollowDraft
          }
          voxelFollowLocked={voxelFollowLocked}
          voxelFollowButtonLabel={voxelFollowButtonLabel}
          voxelFollowButtonDisabled={voxelFollowButtonDisabled}
          savedViews={savedCameraViews}
          selectedViewId={selectedCameraViewId}
          canActivateViews={canActivateCameraViews}
          canAddView={canAddCameraView}
          canRemoveView={canRemoveCameraView}
          canSaveViews={canSaveCameraViews}
          canLoadViews={canLoadCameraViews}
          canClearViews={canClearCameraViews}
          onCameraPositionChange={handleCameraPositionChange}
          onCameraRotationChange={handleCameraRotationChange}
          onApplyCameraUpdate={handleApplyCameraUpdate}
          onVoxelFollowChange={handleVoxelFollowChange}
          onVoxelFollowButtonClick={handleVoxelFollowButtonClick}
          onAddView={handleAddCameraView}
          onRemoveView={handleRemoveCameraView}
          onRenameView={handleRenameCameraView}
          onSaveViews={handleSaveCameraViews}
          onLoadViews={handleLoadCameraViews}
          onClearViews={handleClearCameraViews}
          onSelectView={handleSelectCameraView}
          onClose={closeCameraWindow}
        />
      ) : null}

      <CameraSettingsWindow
        layout={{
          windowMargin,
          controlWindowWidth,
          cameraSettingsWindowInitialPosition,
          resetToken,
        }}
        modeToggle={modeToggle}
        isOpen={isCameraSettingsWindowOpen}
        onClose={closeCameraSettingsWindow}
        translationSpeedMultiplier={translationSpeedMultiplier}
        rotationSpeedMultiplier={rotationSpeedMultiplier}
        onTranslationSpeedMultiplierChange={setTranslationSpeedMultiplier}
        onRotationSpeedMultiplierChange={setRotationSpeedMultiplier}
        projectionLocked={is2dViewActive}
      />

      {isPaintbrushOpen ? (
        <PaintbrushWindow
          initialPosition={paintbrushWindowInitialPosition}
          windowMargin={windowMargin}
          controlWindowWidth={controlWindowWidth}
          resetSignal={resetToken}
          enabled={paintbrushController.enabled}
          overlayVisible={paintbrushController.overlayVisible}
          mode={paintbrushController.mode}
          radius={paintbrushController.radius}
          color={paintbrushController.color}
          labelCount={paintbrushController.labelCount}
          canUndo={paintbrushController.canUndo}
          canRedo={paintbrushController.canRedo}
          onEnabledChange={paintbrushController.setEnabled}
          onOverlayVisibleChange={paintbrushController.setOverlayVisible}
          onModeChange={paintbrushController.setMode}
          onRadiusChange={paintbrushController.setRadius}
          onColorChange={paintbrushController.setColor}
          onRandomColor={paintbrushController.pickRandomUnusedColor}
          onUndo={paintbrushController.undo}
          onRedo={paintbrushController.redo}
          onClear={paintbrushController.clear}
          onSave={handleSavePainting}
          onClose={closePaintbrush}
        />
      ) : null}

      {isDrawRoiWindowOpen ? (
        <DrawRoiWindow
          initialPosition={drawRoiWindowInitialPosition}
          windowMargin={windowMargin}
          controlWindowWidth={controlWindowWidth}
          resetSignal={resetToken}
          volumeDimensions={volumeDimensions}
          tool={roiTool}
          dimensionMode={roiDimensionMode}
          selectedZIndex={Math.max(0, (playbackState.zSliderValue ?? 1) - 1)}
          currentRoiName={currentRoiName}
          roiAttachmentState={roiAttachmentState}
          currentColor={currentRoiColor}
          workingRoi={workingRoi}
          twoDCurrentZEnabled={twoDCurrentZEnabled}
          twoDStartZIndex={twoDStartZIndex}
          onToolChange={setRoiTool}
          onDimensionModeChange={setRoiDimensionMode}
          onColorChange={handleRoiColorChange}
          onTwoDCurrentZEnabledChange={setTwoDCurrentZEnabled}
          onTwoDStartZIndexChange={setTwoDStartZIndex}
          onUpdateWorkingRoi={updateWorkingRoi}
          onClearOrDetach={handleClearOrDetachRoi}
          onClose={closeDrawRoiWindow}
        />
      ) : null}

      <PropsWindow
        layout={{
          windowMargin,
          propsWindowInitialPosition,
          resetToken
        }}
        isOpen={isPropsWindowOpen}
        onClose={closePropsWindow}
        props={propsController.props}
        selectedPropId={propsController.selectedPropId}
        volumeDimensions={volumeDimensions}
        currentTimepoint={currentViewerPropTimepoint}
        totalTimepoints={totalViewerPropTimepoints}
        temporalResolution={volumeViewerProps.temporalResolution ?? null}
        voxelResolution={volumeViewerProps.voxelResolution ?? null}
        onCreateProp={propsController.createProp}
        onSelectProp={propsController.selectProp}
        onUpdateProp={propsController.updateProp}
        onSetAllVisible={propsController.setAllVisible}
        onClearProps={propsController.clearProps}
        onDeleteProp={propsController.deleteProp}
      />

      <ViewerSettingsWindow
        layout={{
          windowMargin,
          controlWindowWidth,
          resetToken,
          viewerSettingsWindowInitialPosition
        }}
        modeToggle={modeToggle}
        playbackControls={playbackState}
        viewerSettings={viewerSettings}
        isOpen={isViewerSettingsOpen}
        onClose={closeViewerSettings}
        renderingQuality={renderingQuality}
        onRenderingQualityChange={handleRenderingQualityChange}
        globalRenderControls={resolvedGlobalRenderControls}
      />

      <HoverSettingsWindow
        layout={{
          windowMargin,
          controlWindowWidth,
          hoverSettingsWindowInitialPosition,
          resetToken,
        }}
        hoverSettings={{
          settings: hoverSettings,
          onEnabledChange: handleHoverEnabledChange,
          onTypeChange: handleHoverTypeChange,
          onStrengthChange: handleHoverStrengthChange,
          onRadiusChange: handleHoverRadiusChange,
        }}
        isOpen={isHoverSettingsWindowOpen}
        onClose={closeHoverSettingsWindow}
      />

      <RecordWindow
        layout={{
          windowMargin,
          controlWindowWidth,
          resetToken,
          recordWindowInitialPosition
        }}
        playbackControls={playbackState}
        isOpen={isRecordWindowOpen}
        onClose={closeRecordWindow}
      />

      {isRoiManagerWindowOpen ? (
        <RoiManagerWindow
          initialPosition={roiManagerWindowInitialPosition}
          windowMargin={windowMargin}
          controlWindowWidth={controlWindowWidth}
          resetSignal={resetToken}
          savedRois={savedRois}
          selectedSavedRoiIds={selectedSavedRoiIds}
          activeSavedRoiId={activeSavedRoiId}
          showAllSavedRois={showAllSavedRois}
          canAdd={workingRoi !== null}
          canUpdate={workingRoi !== null && activeSavedRoiId !== null}
          canMeasure={canMeasureRois}
          canSave={canSaveRois}
          canLoad={canLoadRois}
          onSelectRoi={selectSavedRoi}
          onAdd={() => {
            addWorkingRoi();
          }}
          onDelete={deleteActiveSavedRoi}
          onRename={handleRenameActiveRoi}
          onUpdate={updateActiveSavedRoiFromWorking}
          onMeasure={handleOpenMeasurementsWindow}
          onSave={handleSaveRois}
          onLoad={handleLoadRois}
          onShowAllChange={setShowAllSavedRois}
          onClose={closeRoiManagerWindow}
        />
      ) : null}

      {measurementsSnapshot ? (
        <MeasurementsWindow
          initialPosition={measurementsWindowInitialPosition}
          windowMargin={windowMargin}
          width={MEASUREMENTS_WINDOW_WIDTH}
          resetSignal={resetToken}
          snapshot={measurementsSnapshot}
          settings={measurementsSettings}
          visibleChannelIds={measurementVisibleChannelIds}
          channelColorsById={channelsPanel.channelTintMap}
          onVisibleChannelIdsChange={setMeasurementVisibleChannelIds}
          onOpenSettings={handleOpenSetMeasurementsWindow}
          onSave={handleSaveMeasurements}
          onClose={closeMeasurementsWindow}
        />
      ) : null}

      {isSetMeasurementsWindowOpen ? (
        <SetMeasurementsWindow
          initialPosition={setMeasurementsWindowInitialPosition}
          windowMargin={windowMargin}
          width={controlWindowWidth}
          resetSignal={resetToken}
          settings={measurementSettingsDraft}
          onSettingsChange={setMeasurementSettingsDraft}
          onHelp={() => {}}
          onCancel={handleCancelSetMeasurementsWindow}
          onConfirm={handleConfirmSetMeasurementsWindow}
          onClose={handleCancelSetMeasurementsWindow}
        />
      ) : null}

      <ChannelsPanel
        layout={{ windowMargin, controlWindowWidth, layersWindowInitialPosition, resetToken }}
        isOpen={isChannelsWindowOpen}
        onClose={closeChannelsWindow}
        renderModeLocked={is2dViewActive}
        {...channelsPanel}
      />

      <TracksPanel
        layout={{
          windowMargin,
          controlWindowWidth,
          trackWindowInitialPosition,
          trackSettingsWindowInitialPosition,
          resetToken
        }}
        isOpen={isTracksWindowOpen}
        onClose={closeTracksWindow}
        hasTrackData={hasTrackData}
        trackDefaults={trackDefaults}
        trackSettings={trackSettings}
        isTrackSettingsOpen={isTrackSettingsOpen}
        onCloseTrackSettings={closeTrackSettings}
        {...tracksPanel}
      />

      <PlotSettingsPanel
        layout={{
          windowMargin,
          controlWindowWidth,
          selectedTracksWindowWidth,
          selectedTracksWindowInitialPosition,
          plotSettingsWindowInitialPosition,
          resetToken
        }}
        selectedTracksPanel={selectedTracksPanel}
        plotSettings={plotSettings}
        isVrActive={modeControls.isVrActive}
        isPlotWindowOpen={isAmplitudePlotOpen}
        onClosePlotWindow={closeAmplitudePlot}
        isPlotSettingsOpen={isPlotSettingsOpen}
        onClosePlotSettings={closePlotSettings}
      />
    </div>
  );
}

export type { ViewerShellProps } from './viewer-shell/types';
export default ViewerShell;
