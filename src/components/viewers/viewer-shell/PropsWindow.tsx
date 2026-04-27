import { useCallback, useEffect, useMemo } from 'react';

import FloatingWindow from '../../widgets/FloatingWindow';
import { PROPS_WINDOW_WIDTH } from '../../../shared/utils/windowLayout';
import type { LayoutProps } from './types';
import {
  ViewerWindowButton,
  ViewerWindowIconButton,
  ViewerWindowRow,
  ViewerWindowSelect,
  ViewerWindowSlider,
  ViewerWindowStack,
} from './window-ui';
import {
  VIEWER_PROP_TYPEFACES,
  type ViewerProp,
  type ViewerPropVolumeDimensions,
} from '../../../types/viewerProps';
import {
  buildDefaultViewerPropScalebarState,
  buildDefaultViewerPropScreenState,
  buildDefaultViewerPropWorldState,
  clampViewerPropTimepoint,
  inferViewerPropOrderIndex,
  resolveViewerPropDisplayText,
  resolveViewerPropTimestampUnits,
  resolveViewerPropTimepointLimit,
  resolveViewerPropWorldAxisRange,
} from './viewerPropDefaults';
import {
  VOXEL_RESOLUTION_UNITS,
  type TemporalResolutionMetadata,
  type VoxelResolutionUnit,
  type VoxelResolutionValues,
} from '../../../types/voxelResolution';

type PropsWindowProps = {
  layout: Pick<LayoutProps, 'windowMargin' | 'propsWindowInitialPosition' | 'resetToken'>;
  isOpen: boolean;
  onClose: () => void;
  props: ViewerProp[];
  selectedPropId: string | null;
  volumeDimensions: ViewerPropVolumeDimensions;
  currentTimepoint: number;
  totalTimepoints: number;
  temporalResolution?: TemporalResolutionMetadata | null;
  voxelResolution?: VoxelResolutionValues | null;
  onCreateProp: () => void;
  onSelectProp: (propId: string) => void;
  onUpdateProp: (propId: string, updater: (current: ViewerProp) => ViewerProp) => void;
  onSetAllVisible: (visible: boolean) => void;
  onClearProps: () => void;
  onDeleteProp: (propId: string) => void;
};

type AxisKey = 'x' | 'y' | 'z';
type WorldRotationKey = 'roll' | 'pitch' | 'yaw';

const SCREEN_FONT_SIZE_MIN = 10;
const SCREEN_FONT_SIZE_MAX = 160;
const PRESET_PROP_COLORS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Black', value: '#000000' },
  { label: 'Yellow', value: '#ffff00' },
] as const;
const SCALEBAR_AXES = ['x', 'y', 'z'] as const;
const SCALEBAR_TEXT_PLACEMENTS = ['above', 'below', 'right'] as const;

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const clampInteger = (value: number, min: number, max: number) =>
  Math.round(clampNumber(value, min, max));

const formatSliderValue = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0.0';
  }
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
};

const getRotationAxisLabel = (axis: WorldRotationKey) => {
  switch (axis) {
    case 'roll':
      return 'Roll';
    case 'pitch':
      return 'Pitch';
    case 'yaw':
      return 'Yaw';
    default:
      return axis;
  }
};

const getNextCyclicValue = <Value extends string>(
  values: readonly Value[],
  current: Value
): Value => {
  const currentIndex = values.indexOf(current);
  if (currentIndex < 0) {
    return values[0]!;
  }
  return values[(currentIndex + 1) % values.length]!;
};

const getScalebarTextPlacementLabel = (
  placement: (typeof SCALEBAR_TEXT_PLACEMENTS)[number]
) => {
  switch (placement) {
    case 'above':
      return 'Above';
    case 'below':
      return 'Below';
    case 'right':
      return 'To the right';
    default:
      return placement;
  }
};

function PropsWindow({
  layout,
  isOpen,
  onClose,
  props,
  selectedPropId,
  volumeDimensions,
  currentTimepoint,
  totalTimepoints,
  temporalResolution,
  voxelResolution,
  onCreateProp,
  onSelectProp,
  onUpdateProp,
  onSetAllVisible,
  onClearProps,
  onDeleteProp,
}: PropsWindowProps) {
  const { windowMargin, propsWindowInitialPosition, resetToken } = layout;

  const selectedProp = useMemo(
    () => props.find((entry) => entry.id === selectedPropId) ?? null,
    [props, selectedPropId]
  );
  const allPropsVisible = props.length > 0 && props.every((prop) => prop.visible);
  const displayedPropText = useMemo(
    () =>
      selectedProp
        ? resolveViewerPropDisplayText(
            selectedProp,
            currentTimepoint,
            totalTimepoints,
            temporalResolution ?? null
          )
        : '',
    [currentTimepoint, selectedProp, temporalResolution, totalTimepoints]
  );
  const resolvedTimestampUnits = selectedProp
    ? resolveViewerPropTimestampUnits(selectedProp.timestampUnits, temporalResolution)
    : 'index';
  const selectedPropDimension =
    selectedProp?.type === 'timestamp'
      ? '2d'
      : selectedProp?.type === 'scalebar'
        ? '3d'
        : (selectedProp?.dimension ?? '2d');
  const resolvedTimepointLimit = resolveViewerPropTimepointLimit(totalTimepoints);

  const handleDeleteProp = useCallback(() => {
    if (!selectedProp) {
      return;
    }
    if (typeof globalThis.confirm === 'function') {
      const confirmed = globalThis.confirm(`Delete ${selectedProp.name}?`);
      if (!confirmed) {
        return;
      }
    }
    onDeleteProp(selectedProp.id);
  }, [onDeleteProp, selectedProp]);

  const handleClearProps = useCallback(() => {
    if (props.length === 0) {
      return;
    }
    if (typeof globalThis.confirm === 'function') {
      const confirmed = globalThis.confirm('Clear all props?');
      if (!confirmed) {
        return;
      }
    }
    onClearProps();
  }, [onClearProps, props.length]);

  const updateSelectedProp = useCallback(
    (updater: (current: ViewerProp) => ViewerProp) => {
      if (!selectedProp) {
        return;
      }
      onUpdateProp(selectedProp.id, updater);
    },
    [onUpdateProp, selectedProp]
  );

  useEffect(() => {
    if (!selectedProp || selectedProp.type !== 'timestamp' || selectedProp.dimension === '2d') {
      return;
    }

    updateSelectedProp((current) => {
      if (current.type !== 'timestamp' || current.dimension === '2d') {
        return current;
      }

      return {
        ...current,
        dimension: '2d',
        screen: {
          ...current.screen,
          fontSize: current.world.fontSize,
        },
      };
    });
  }, [selectedProp, updateSelectedProp]);

  useEffect(() => {
    if (!selectedProp || selectedProp.type !== 'scalebar' || selectedProp.dimension === '3d') {
      return;
    }

    updateSelectedProp((current) => {
      if (current.type !== 'scalebar' || current.dimension === '3d') {
        return current;
      }

      return {
        ...current,
        dimension: '3d',
        world: {
          ...current.world,
          fontSize: current.screen.fontSize,
        },
      };
    });
  }, [selectedProp, updateSelectedProp]);

  useEffect(() => {
    if (
      !selectedProp ||
      selectedProp.type !== 'scalebar' ||
      (selectedProp.initialTimepoint === 1 && selectedProp.finalTimepoint === resolvedTimepointLimit)
    ) {
      return;
    }

    updateSelectedProp((current) => {
      if (
        current.type !== 'scalebar' ||
        (current.initialTimepoint === 1 && current.finalTimepoint === resolvedTimepointLimit)
      ) {
        return current;
      }

      return {
        ...current,
        initialTimepoint: 1,
        finalTimepoint: resolvedTimepointLimit,
      };
    });
  }, [resolvedTimepointLimit, selectedProp, updateSelectedProp]);

  const resolveWorldAxisRange = useCallback(
    (axis: AxisKey) => resolveViewerPropWorldAxisRange(volumeDimensions, axis),
    [volumeDimensions]
  );

  const resolveWorldFontSizeBounds = useCallback(() => {
    const baseDimension = Math.max(1, Math.min(volumeDimensions.width, volumeDimensions.height));
    return {
      min: 1,
      max: Math.max(6, Math.round(baseDimension * 0.35)),
    };
  }, [volumeDimensions.height, volumeDimensions.width]);
  const handleScreenFontSizeChange = useCallback(
    (value: string) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      updateSelectedProp((current) => ({
        ...current,
        screen: {
          ...current.screen,
          fontSize: clampInteger(parsed, SCREEN_FONT_SIZE_MIN, SCREEN_FONT_SIZE_MAX),
        },
      }));
    },
    [updateSelectedProp]
  );

  const handleWorldFontSizeChange = useCallback(
    (value: string) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      const bounds = resolveWorldFontSizeBounds();
      updateSelectedProp((current) => ({
        ...current,
        world: {
          ...current.world,
          fontSize: clampInteger(
            parsed,
            bounds.min,
            Math.max(bounds.max, Math.round(current.world.fontSize))
          ),
        },
      }));
    },
    [resolveWorldFontSizeBounds, updateSelectedProp]
  );

  const handleInitialTimepointChange = useCallback(
    (value: string) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      updateSelectedProp((current) => ({
        ...current,
        initialTimepoint: clampInteger(
          parsed,
          1,
          clampViewerPropTimepoint(current.finalTimepoint, resolvedTimepointLimit)
        ),
      }));
    },
    [resolvedTimepointLimit, updateSelectedProp]
  );

  const handleFinalTimepointChange = useCallback(
    (value: string) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      updateSelectedProp((current) => ({
        ...current,
        finalTimepoint: clampInteger(
          parsed,
          clampViewerPropTimepoint(current.initialTimepoint, resolvedTimepointLimit),
          resolvedTimepointLimit
        ),
      }));
    },
    [resolvedTimepointLimit, updateSelectedProp]
  );

  const toggleSelectedDimension = useCallback(() => {
    updateSelectedProp((current) => {
      if (current.type === 'timestamp' || current.type === 'scalebar') {
        return current;
      }
      const activeFontSize =
        current.dimension === '2d' ? current.screen.fontSize : current.world.fontSize;
      return current.dimension === '2d'
        ? {
            ...current,
            dimension: '3d',
            world: {
              ...current.world,
              fontSize: activeFontSize,
            },
          }
        : {
            ...current,
            dimension: '2d',
            screen: {
              ...current.screen,
              fontSize: activeFontSize,
            },
          };
    });
  }, [updateSelectedProp]);

  const handleScalebarLengthChange = useCallback(
    (value: string) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) {
        return;
      }
      updateSelectedProp((current) => ({
        ...current,
        scalebar: {
          ...current.scalebar,
          length: Math.max(0, Math.round(parsed)),
        },
      }));
    },
    [updateSelectedProp]
  );

  const cycleScalebarAxis = useCallback(() => {
    updateSelectedProp((current) => ({
      ...current,
      scalebar: {
        ...current.scalebar,
        axis: getNextCyclicValue(SCALEBAR_AXES, current.scalebar.axis),
      },
    }));
  }, [updateSelectedProp]);

  const handleScalebarUnitChange = useCallback(
    (unit: VoxelResolutionUnit) => {
      updateSelectedProp((current) => ({
        ...current,
        scalebar: {
          ...current.scalebar,
          unit,
        },
      }));
    },
    [updateSelectedProp]
  );

  const toggleScalebarText = useCallback(() => {
    updateSelectedProp((current) => ({
      ...current,
      scalebar: {
        ...current.scalebar,
        showText: !current.scalebar.showText,
      },
    }));
  }, [updateSelectedProp]);

  const cycleScalebarTextPlacement = useCallback(() => {
    updateSelectedProp((current) => ({
      ...current,
      scalebar: {
        ...current.scalebar,
        textPlacement: getNextCyclicValue(
          SCALEBAR_TEXT_PLACEMENTS,
          current.scalebar.textPlacement
        ),
      },
    }));
  }, [updateSelectedProp]);

  const resetSelectedPlacement = useCallback(() => {
    if (!selectedProp) {
      return;
    }
    const defaultScreen = buildDefaultViewerPropScreenState();
    const defaultWorld = buildDefaultViewerPropWorldState(
      inferViewerPropOrderIndex(selectedProp.id),
      volumeDimensions
    );
    updateSelectedProp((current) =>
      current.type === 'timestamp' || current.dimension === '2d'
        ? {
            ...current,
            screen: {
              ...current.screen,
              x: defaultScreen.x,
              y: defaultScreen.y,
              rotation: defaultScreen.rotation,
              flipX: defaultScreen.flipX,
              flipY: defaultScreen.flipY,
            },
          }
        : {
            ...current,
            world: {
              ...current.world,
              x: defaultWorld.x,
              y: defaultWorld.y,
              z: defaultWorld.z,
              roll: defaultWorld.roll,
              pitch: defaultWorld.pitch,
              yaw: defaultWorld.yaw,
              flipX: defaultWorld.flipX,
              flipY: defaultWorld.flipY,
              flipZ: defaultWorld.flipZ,
            },
          }
    );
  }, [selectedProp, updateSelectedProp, volumeDimensions]);

  if (!isOpen) {
    return null;
  }

  const worldFontSizeBounds = selectedProp
    ? resolveWorldFontSizeBounds()
    : { min: 1, max: 1 };
  const displayedWorldFontSize = selectedProp ? Math.round(selectedProp.world.fontSize) : 1;
  const selectedFontSizeMin =
    selectedPropDimension === '2d' ? SCREEN_FONT_SIZE_MIN : worldFontSizeBounds.min;
  const selectedFontSizeMax =
    selectedPropDimension === '2d'
      ? SCREEN_FONT_SIZE_MAX
      : Math.max(worldFontSizeBounds.max, displayedWorldFontSize);
  const timeRangeControls =
    selectedProp?.type === 'text' ? (
      <div className="control-row props-editor-section-toolbar">
        <div className="props-timepoint-controls" role="group" aria-label="Prop time range">
          <span className="voxel-resolution-field-label">Start/end times:</span>
          <div className="props-timepoint-input-row">
            <input
              id="props-initial-timepoint-input"
              type="number"
              inputMode="numeric"
              step={1}
              min={1}
              max={resolvedTimepointLimit}
              value={selectedProp.initialTimepoint}
              onChange={(event) => handleInitialTimepointChange(event.target.value)}
              aria-label="Initial time"
            />
            <input
              id="props-final-timepoint-input"
              type="number"
              inputMode="numeric"
              step={1}
              min={1}
              max={resolvedTimepointLimit}
              value={selectedProp.finalTimepoint}
              onChange={(event) => handleFinalTimepointChange(event.target.value)}
              aria-label="Final time"
            />
          </div>
        </div>
      </div>
    ) : null;

  return (
    <FloatingWindow
      title="Props"
      initialPosition={propsWindowInitialPosition}
      width={`min(${PROPS_WINDOW_WIDTH}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--props"
      bodyClassName="props-window"
      resetSignal={resetToken}
      onClose={onClose}
    >
      <div className="sidebar sidebar-right">
        <ViewerWindowStack className="props-window-controls">
          <ViewerWindowRow className="props-window-action-row" align="center" wrap>
            <ViewerWindowButton type="button" onClick={onCreateProp}>
              Add new prop
            </ViewerWindowButton>
            <div className="props-window-action-spacer" />
            <ViewerWindowButton
              type="button"
              onClick={() => onSetAllVisible(!allPropsVisible)}
              disabled={props.length === 0}
            >
              {allPropsVisible ? 'Hide all' : 'Show all'}
            </ViewerWindowButton>
            <ViewerWindowButton
              type="button"
              className="viewer-top-menu-button viewer-top-menu-button--danger"
              onClick={handleClearProps}
              disabled={props.length === 0}
            >
              Clear all
            </ViewerWindowButton>
          </ViewerWindowRow>

          <ViewerWindowRow className="props-window-select-row" align="center">
            <div className="props-window-select">
              <ViewerWindowSelect
                id="props-selected-prop"
                aria-label="Props list"
                value={selectedPropId ?? ''}
                onChange={(event) => {
                  if (event.target.value) {
                    onSelectProp(event.target.value);
                  }
                }}
                disabled={props.length === 0}
              >
                {props.length === 0 ? (
                  <option value="">No props</option>
                ) : (
                  props.map((prop) => (
                    <option key={prop.id} value={prop.id}>
                      {prop.name}
                    </option>
                  ))
                )}
              </ViewerWindowSelect>
            </div>
            <ViewerWindowButton
              type="button"
              className="viewer-top-menu-button viewer-top-menu-button--danger"
              onClick={handleDeleteProp}
              disabled={!selectedProp}
            >
              Delete
            </ViewerWindowButton>
            <ViewerWindowButton
              type="button"
              onClick={() =>
                updateSelectedProp((current) => ({ ...current, visible: !current.visible }))
              }
              active={selectedProp?.visible ?? false}
              aria-pressed={selectedProp?.visible ?? false}
              title={selectedProp?.visible ? 'Hide prop' : 'Show prop'}
              disabled={!selectedProp}
            >
              {selectedProp?.visible ? 'Hide' : 'Show'}
            </ViewerWindowButton>
          </ViewerWindowRow>

          <div className="props-editor-card">
            {selectedProp ? (
              <div className="props-editor-grid">
                <div className="control-group props-editor-group">
                  <input
                    id="props-name-input"
                    type="text"
                    aria-label="Prop name"
                    value={selectedProp.name}
                    onChange={(event) =>
                      updateSelectedProp((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </div>

                <div className="control-group props-editor-group">
                  <ViewerWindowSelect
                    id="props-type-select"
                    aria-label="Prop type"
                    value={selectedProp.type}
                    onChange={(event) =>
                      updateSelectedProp((current) => {
                        const nextType = event.target.value as ViewerProp['type'];
                        const activeFontSize =
                          current.dimension === '2d' ? current.screen.fontSize : current.world.fontSize;
                        if (nextType === 'timestamp') {
                          return {
                            ...current,
                            type: nextType,
                            dimension: '2d',
                            initialTimepoint: 1,
                            finalTimepoint: resolvedTimepointLimit,
                            screen: {
                              ...current.screen,
                              fontSize: activeFontSize,
                            },
                          };
                        }

                        if (nextType === 'scalebar') {
                          return {
                            ...current,
                            type: nextType,
                            dimension: '3d',
                            initialTimepoint: 1,
                            finalTimepoint: resolvedTimepointLimit,
                            world: {
                              ...current.world,
                              fontSize: activeFontSize,
                            },
                            scalebar: buildDefaultViewerPropScalebarState(voxelResolution ?? null),
                          };
                        }

                        return {
                          ...current,
                          type: nextType,
                        };
                      })
                    }
                  >
                    <option value="text">Text</option>
                    <option value="timestamp">Timestamp</option>
                    <option value="scalebar">Scalebar</option>
                  </ViewerWindowSelect>
                </div>

                {selectedProp.type !== 'timestamp' && selectedProp.type !== 'scalebar' ? (
                  <ViewerWindowRow className="props-editor-mode-row props-editor-span-2" wrap>
                    <ViewerWindowButton
                      type="button"
                      className="viewer-mode-button props-toggle-button props-dimension-toggle"
                      aria-label="Toggle On-screen or On-world"
                      onClick={toggleSelectedDimension}
                    >
                      {selectedPropDimension === '2d' ? 'On-screen' : 'On-world'}
                    </ViewerWindowButton>
                    {selectedPropDimension === '3d' ? (
                      <ViewerWindowButton
                        type="button"
                        className="viewer-mode-button props-toggle-button"
                        aria-label="Toggle World-facing or User-facing"
                        onClick={() =>
                          updateSelectedProp((current) => ({
                            ...current,
                            world: {
                              ...current.world,
                              facingMode:
                                current.world.facingMode === 'fixed' ? 'billboard' : 'fixed',
                            },
                          }))
                        }
                      >
                      {selectedProp.world.facingMode === 'fixed'
                        ? 'World-facing'
                        : 'User-facing'}
                      </ViewerWindowButton>
                  ) : null}
                  </ViewerWindowRow>
                ) : null}

                <div className="control-row props-editor-inline-row props-editor-inline-row--size-color props-editor-span-2">
                  <label
                    className="props-font-size-field props-editor-inline-control"
                    htmlFor="props-font-size-input"
                  >
                    <span className="voxel-resolution-field-label">Size:</span>
                    <input
                      id="props-font-size-input"
                      type="number"
                      inputMode="numeric"
                      step={1}
                      min={selectedFontSizeMin}
                      max={selectedFontSizeMax}
                      value={
                        selectedPropDimension === '2d'
                          ? Math.round(selectedProp.screen.fontSize)
                          : Math.round(selectedProp.world.fontSize)
                      }
                      onChange={(event) =>
                        selectedPropDimension === '2d'
                          ? handleScreenFontSizeChange(event.target.value)
                          : handleWorldFontSizeChange(event.target.value)
                      }
                    />
                  </label>

                  <div className="props-color-picker props-editor-inline-control">
                    <span className="voxel-resolution-field-label">Color:</span>
                    <div className="color-swatch-row">
                      <div className="color-swatch-grid" role="group" aria-label="Preset prop colors">
                        {PRESET_PROP_COLORS.map((swatch) => {
                          const isSelected = selectedProp.color.toLowerCase() === swatch.value;
                          return (
                            <button
                              key={swatch.value}
                              type="button"
                              className={
                                isSelected
                                  ? 'color-swatch-button is-selected'
                                  : 'color-swatch-button'
                              }
                              style={{ backgroundColor: swatch.value }}
                              onClick={() =>
                                updateSelectedProp((current) => ({
                                  ...current,
                                  color: swatch.value,
                                }))
                              }
                              aria-pressed={isSelected}
                              aria-label={`${swatch.label} prop color`}
                              title={swatch.label}
                            />
                          );
                        })}
                        <label className="color-picker-trigger" htmlFor="props-color-input">
                          <input
                            id="props-color-input"
                            className="color-picker-input"
                            type="color"
                            value={selectedProp.color}
                            onChange={(event) =>
                              updateSelectedProp((current) => ({ ...current, color: event.target.value }))
                            }
                            aria-label="Choose prop color"
                          />
                          <span
                            className="color-picker-indicator"
                            style={{ backgroundColor: selectedProp.color }}
                            aria-hidden="true"
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedProp.type === 'scalebar' ? (
                  <>
                    <ViewerWindowRow className="props-editor-inline-row props-editor-span-2 props-scalebar-row" wrap>
                      <ViewerWindowButton
                        id="props-scalebar-axis-button"
                        type="button"
                        className="viewer-mode-button props-toggle-button props-scalebar-axis-button"
                        aria-label="Toggle scalebar axis"
                        onClick={cycleScalebarAxis}
                      >
                        {selectedProp.scalebar.axis.toUpperCase()}
                      </ViewerWindowButton>
                      <label
                        className="props-scalebar-length-field props-editor-inline-control"
                        htmlFor="props-scalebar-length-input"
                      >
                        <span className="voxel-resolution-field-label">Length:</span>
                        <input
                          id="props-scalebar-length-input"
                          type="number"
                          inputMode="numeric"
                          step={1}
                          min={0}
                          value={selectedProp.scalebar.length}
                          onChange={(event) => handleScalebarLengthChange(event.target.value)}
                        />
                      </label>
                      <label className="voxel-resolution-unit props-scalebar-unit props-editor-inline-control">
                        <ViewerWindowSelect
                          id="props-scalebar-unit-select"
                          aria-label="Scalebar spatial unit"
                          value={selectedProp.scalebar.unit}
                          onChange={(event) =>
                            handleScalebarUnitChange(event.target.value as VoxelResolutionUnit)
                          }
                          compact
                        >
                          {VOXEL_RESOLUTION_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </ViewerWindowSelect>
                      </label>
                    </ViewerWindowRow>

                    <ViewerWindowRow className="props-editor-inline-row props-editor-span-2 props-scalebar-row" wrap>
                      <ViewerWindowButton
                        id="props-scalebar-text-toggle"
                        type="button"
                        className="viewer-mode-button props-toggle-button"
                        active={selectedProp.scalebar.showText}
                        aria-pressed={selectedProp.scalebar.showText}
                        onClick={toggleScalebarText}
                      >
                        {selectedProp.scalebar.showText ? 'Hide text' : 'Show text'}
                      </ViewerWindowButton>
                      {selectedProp.scalebar.showText ? (
                        <ViewerWindowButton
                          id="props-scalebar-text-placement-button"
                          type="button"
                          className="viewer-mode-button props-toggle-button"
                          onClick={cycleScalebarTextPlacement}
                        >
                          {getScalebarTextPlacementLabel(selectedProp.scalebar.textPlacement)}
                        </ViewerWindowButton>
                      ) : null}
                      <ViewerWindowButton
                        id="props-scalebar-facing-mode-button"
                        type="button"
                        className="viewer-mode-button props-toggle-button"
                        aria-label="Toggle World-facing or User-facing"
                        onClick={() =>
                          updateSelectedProp((current) => ({
                            ...current,
                            world: {
                              ...current.world,
                              facingMode:
                                current.world.facingMode === 'fixed' ? 'billboard' : 'fixed',
                            },
                          }))
                        }
                      >
                        {selectedProp.world.facingMode === 'fixed'
                          ? 'World-facing'
                          : 'User-facing'}
                      </ViewerWindowButton>
                    </ViewerWindowRow>
                  </>
                ) : null}

                {selectedProp.type !== 'scalebar' || selectedProp.scalebar.showText ? (
                  <div className="control-row props-typeface-row props-editor-span-2">
                    <label className="props-typeface-field" htmlFor="props-typeface-select">
                      <span className="voxel-resolution-field-label">Font:</span>
                      <ViewerWindowSelect
                        id="props-typeface-select"
                        value={selectedProp.typeface}
                        onChange={(event) =>
                          updateSelectedProp((current) => ({
                            ...current,
                            typeface: event.target.value as ViewerProp['typeface'],
                          }))
                        }
                        compact
                      >
                        {VIEWER_PROP_TYPEFACES.map((typeface) => (
                          <option key={typeface} value={typeface}>
                            {typeface}
                          </option>
                        ))}
                      </ViewerWindowSelect>
                    </label>
                    <div className="props-text-style-controls" role="group" aria-label="Text style">
                      <ViewerWindowIconButton
                        type="button"
                        className={
                          selectedProp.bold
                            ? 'props-text-style-button is-active'
                            : 'props-text-style-button'
                        }
                        active={selectedProp.bold}
                        aria-label="Toggle boldface"
                        aria-pressed={selectedProp.bold}
                        onClick={() =>
                          updateSelectedProp((current) => ({
                            ...current,
                            bold: !current.bold,
                          }))
                        }
                      >
                        <span
                          className="props-text-style-symbol props-text-style-symbol--bold"
                          aria-hidden="true"
                        >
                          B
                        </span>
                      </ViewerWindowIconButton>
                      <ViewerWindowIconButton
                        type="button"
                        className={
                          selectedProp.italic
                            ? 'props-text-style-button is-active'
                            : 'props-text-style-button'
                        }
                        active={selectedProp.italic}
                        aria-label="Toggle italic"
                        aria-pressed={selectedProp.italic}
                        onClick={() =>
                          updateSelectedProp((current) => ({
                            ...current,
                            italic: !current.italic,
                          }))
                        }
                      >
                        <span
                          className="props-text-style-symbol props-text-style-symbol--italic"
                          aria-hidden="true"
                        >
                          I
                        </span>
                      </ViewerWindowIconButton>
                      <ViewerWindowIconButton
                        type="button"
                        className={
                          selectedProp.underline
                            ? 'props-text-style-button is-active'
                            : 'props-text-style-button'
                        }
                        active={selectedProp.underline}
                        aria-label="Toggle underline"
                        aria-pressed={selectedProp.underline}
                        onClick={() =>
                          updateSelectedProp((current) => ({
                            ...current,
                            underline: !current.underline,
                          }))
                        }
                      >
                        <span
                          className="props-text-style-symbol props-text-style-symbol--underline"
                          aria-hidden="true"
                        >
                          U
                        </span>
                      </ViewerWindowIconButton>
                    </div>
                  </div>
                ) : null}

                {selectedProp.type === 'timestamp' ? (
                  <div className="control-row props-editor-inline-row props-editor-span-2">
                    <label
                      className="props-units-field props-editor-inline-control"
                      htmlFor="props-timestamp-units-button"
                    >
                      <span className="voxel-resolution-field-label">Units:</span>
                      <ViewerWindowButton
                        id="props-timestamp-units-button"
                        type="button"
                        className="viewer-mode-button props-toggle-button"
                        onClick={() =>
                          updateSelectedProp((current) => ({
                            ...current,
                            timestampUnits:
                              current.timestampUnits === 'index' ? 'physical' : 'index',
                          }))
                        }
                        title="Toggle timestamp units"
                      >
                        {resolvedTimestampUnits === 'physical' ? 'Physical' : 'Index'}
                      </ViewerWindowButton>
                    </label>
                  </div>
                ) : null}

                {selectedProp.type === 'text' ? (
                  <div className="control-group props-editor-group props-editor-span-2">
                    <textarea
                      id="props-text-input"
                      className="props-text-input"
                      aria-label="Prop text"
                      rows={1}
                      value={displayedPropText}
                      onChange={(event) =>
                        updateSelectedProp((current) => ({
                          ...current,
                          text: event.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}

                {selectedPropDimension === '2d' ? (
                  <div className="props-editor-section props-editor-span-2">
                    {timeRangeControls}
                    <div className="props-slider-grid props-slider-grid--double">
                      <ViewerWindowSlider
                        id="props-2d-x-slider"
                        className="props-editor-group"
                        label="X"
                        valueLabel={`${Math.round(selectedProp.screen.x * 100)}%`}
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(selectedProp.screen.x * 100)}
                        onChange={(event) =>
                          updateSelectedProp((current) => ({
                            ...current,
                            screen: {
                              ...current.screen,
                              x: clampNumber(Number(event.target.value) / 100, 0, 1),
                            },
                          }))
                        }
                      />

                      <ViewerWindowSlider
                        id="props-2d-y-slider"
                        className="props-editor-group"
                        label="Y"
                        valueLabel={`${Math.round(selectedProp.screen.y * 100)}%`}
                        min={0}
                        max={100}
                        step={1}
                        value={Math.round(selectedProp.screen.y * 100)}
                        onChange={(event) =>
                          updateSelectedProp((current) => ({
                            ...current,
                            screen: {
                              ...current.screen,
                              y: clampNumber(Number(event.target.value) / 100, 0, 1),
                            },
                          }))
                        }
                      />

                      <ViewerWindowSlider
                        id="props-2d-rotation-slider"
                        className="props-editor-group"
                        label="Rotation"
                        valueLabel={`${Math.round(selectedProp.screen.rotation)}\u00B0`}
                        min={-180}
                        max={180}
                        step={1}
                        value={selectedProp.screen.rotation}
                        onChange={(event) =>
                          updateSelectedProp((current) => ({
                            ...current,
                            screen: {
                              ...current.screen,
                              rotation: Number(event.target.value),
                            },
                          }))
                        }
                      />

                      <div className="control-group props-editor-group props-reset-group">
                        <ViewerWindowButton type="button" onClick={resetSelectedPlacement}>
                          Reset
                        </ViewerWindowButton>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="props-editor-section props-editor-span-2">
                    {timeRangeControls}
                    <div className="props-slider-grid props-slider-grid--triple">
                      {(['x', 'y', 'z'] as const).map((axis) => {
                        const axisRange = resolveWorldAxisRange(axis);
                        const displayValue = selectedProp.world[axis];
                        return (
                          <ViewerWindowSlider
                            key={`world-position-${axis}`}
                            id={`props-3d-position-${axis}`}
                            className="props-editor-group"
                            label={axis.toUpperCase()}
                            valueLabel={formatSliderValue(displayValue)}
                            min={axisRange.min}
                            max={axisRange.max}
                            step={0.1}
                            value={displayValue}
                            onChange={(event) =>
                              updateSelectedProp((current) => ({
                                ...current,
                                world: {
                                  ...current.world,
                                  [axis]: Number(event.target.value),
                                },
                              }))
                            }
                          />
                        );
                      })}
                      {(['roll', 'pitch', 'yaw'] as const).map((axis) => (
                        <ViewerWindowSlider
                          key={axis}
                          id={`props-3d-${axis}`}
                          className="props-editor-group"
                          label={getRotationAxisLabel(axis)}
                          valueLabel={`${Math.round(selectedProp.world[axis])}\u00B0`}
                          min={-180}
                          max={180}
                          step={1}
                          value={selectedProp.world[axis]}
                          disabled={
                            selectedProp.world.facingMode === 'billboard' && axis !== 'roll'
                          }
                          onChange={(event) =>
                            updateSelectedProp((current) => ({
                              ...current,
                              world: { ...current.world, [axis]: Number(event.target.value) },
                            }))
                          }
                        />
                      ))}
                    </div>

                    <div className="control-group props-editor-group">
                      <div className="viewer-mode-row props-flip-row">
                        <ViewerWindowButton
                          type="button"
                          active={selectedProp.world.flipX}
                          onClick={() =>
                            updateSelectedProp((current) => ({
                              ...current,
                              world: { ...current.world, flipX: !current.world.flipX },
                            }))
                          }
                          aria-pressed={selectedProp.world.flipX}
                        >
                          Flip X
                        </ViewerWindowButton>
                        <ViewerWindowButton
                          type="button"
                          active={selectedProp.world.flipY}
                          onClick={() =>
                            updateSelectedProp((current) => ({
                              ...current,
                              world: { ...current.world, flipY: !current.world.flipY },
                            }))
                          }
                          aria-pressed={selectedProp.world.flipY}
                        >
                          Flip Y
                        </ViewerWindowButton>
                        <ViewerWindowButton
                          type="button"
                          className="props-reset-inline-button"
                          onClick={resetSelectedPlacement}
                        >
                          Reset
                        </ViewerWindowButton>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="props-window-empty props-window-empty--editor">
                Select a prop or create a new one.
              </div>
            )}
          </div>
        </ViewerWindowStack>
      </div>
    </FloatingWindow>
  );
}

export default PropsWindow;
