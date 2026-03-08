import { useCallback, useMemo } from 'react';

import FloatingWindow from '../../widgets/FloatingWindow';
import { PROPS_WINDOW_WIDTH } from '../../../shared/utils/windowLayout';
import type { LayoutProps } from './types';
import type { ViewerProp, ViewerPropVolumeDimensions } from '../../../types/viewerProps';

type PropsWindowProps = {
  layout: Pick<LayoutProps, 'windowMargin' | 'propsWindowInitialPosition' | 'resetToken'>;
  isOpen: boolean;
  onClose: () => void;
  props: ViewerProp[];
  selectedPropId: string | null;
  volumeDimensions: ViewerPropVolumeDimensions;
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

function PropsWindow({
  layout,
  isOpen,
  onClose,
  props,
  selectedPropId,
  volumeDimensions,
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

  const resolveWorldAxisRange = useCallback(
    (axis: AxisKey) => {
      const baseDimension = Math.max(
        1,
        volumeDimensions[axis === 'x' ? 'width' : axis === 'y' ? 'height' : 'depth']
      );
      return {
        min: -baseDimension * 0.5,
        max: baseDimension * 1.5,
      };
    },
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
          fontSize: clampInteger(parsed, bounds.min, bounds.max),
        },
      }));
    },
    [resolveWorldFontSizeBounds, updateSelectedProp]
  );

  const resetSelectedOrientation = useCallback(() => {
    if (!selectedProp) {
      return;
    }
    updateSelectedProp((current) =>
      current.dimension === '2d'
        ? {
            ...current,
            screen: {
              ...current.screen,
              rotation: 0,
              flipX: false,
              flipY: false,
            },
          }
        : {
            ...current,
            world: {
              ...current.world,
              roll: 0,
              pitch: 0,
              yaw: 0,
              flipX: false,
              flipY: true,
              flipZ: false,
            },
          }
    );
  }, [selectedProp, updateSelectedProp]);

  if (!isOpen) {
    return null;
  }

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
        <div className="global-controls props-window-controls">
          <div className="control-row props-window-toolbar">
            <div className="props-window-toolbar-main">
              <button type="button" onClick={onCreateProp}>
                Add prop
              </button>
              <div className="props-window-select">
                <select
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
                </select>
              </div>
            </div>
          </div>

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
                  <select
                    id="props-type-select"
                    aria-label="Prop type"
                    value={selectedProp.type}
                    onChange={(event) =>
                      updateSelectedProp((current) => ({
                        ...current,
                        type: event.target.value as ViewerProp['type'],
                      }))
                    }
                  >
                    <option value="text">text</option>
                    <option value="timestamp" disabled>
                      timestamp
                    </option>
                    <option value="scalebar" disabled>
                      scalebar
                    </option>
                  </select>
                </div>

                <div className="control-group props-editor-group">
                  <button
                    type="button"
                    className="viewer-mode-button props-toggle-button"
                    aria-label="Toggle 2D or 3D"
                    onClick={() =>
                      updateSelectedProp((current) => ({
                        ...current,
                        dimension: current.dimension === '2d' ? '3d' : '2d',
                      }))
                    }
                  >
                    {selectedProp.dimension.toUpperCase()}
                  </button>
                </div>

                <div className="control-group props-editor-group">
                  <label className="paintbrush-color-picker props-color-picker" htmlFor="props-color-input">
                    <span>Color</span>
                    <input
                      id="props-color-input"
                      className="paintbrush-color-input"
                      type="color"
                      value={selectedProp.color}
                      onChange={(event) =>
                        updateSelectedProp((current) => ({ ...current, color: event.target.value }))
                      }
                      aria-label="Choose prop color"
                    />
                  </label>
                </div>

                <div className="control-group props-editor-group">
                  <label className="voxel-resolution-field props-font-size-field" htmlFor="props-font-size-input">
                    <span className="voxel-resolution-field-label">Text size:</span>
                    <input
                      id="props-font-size-input"
                      type="number"
                      inputMode="numeric"
                      step={1}
                      min={
                        selectedProp.dimension === '2d'
                          ? SCREEN_FONT_SIZE_MIN
                          : resolveWorldFontSizeBounds().min
                      }
                      max={
                        selectedProp.dimension === '2d'
                          ? SCREEN_FONT_SIZE_MAX
                          : resolveWorldFontSizeBounds().max
                      }
                      value={
                        selectedProp.dimension === '2d'
                          ? Math.round(selectedProp.screen.fontSize)
                          : Math.round(selectedProp.world.fontSize)
                      }
                      onChange={(event) =>
                        selectedProp.dimension === '2d'
                          ? handleScreenFontSizeChange(event.target.value)
                          : handleWorldFontSizeChange(event.target.value)
                      }
                    />
                  </label>
                </div>

                {selectedProp.dimension === '3d' ? (
                  <div className="control-group props-editor-group">
                    <button
                      type="button"
                      className="viewer-mode-button props-toggle-button"
                      aria-label="Toggle World or Billboard facing"
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
                      {selectedProp.world.facingMode === 'fixed' ? 'World' : 'Billboard'}
                    </button>
                  </div>
                ) : null}

                <div className="control-group props-editor-group props-editor-span-2">
                  <textarea
                    id="props-text-input"
                    aria-label="Prop text"
                    rows={2}
                    value={selectedProp.text}
                    onChange={(event) =>
                      updateSelectedProp((current) => ({ ...current, text: event.target.value }))
                    }
                  />
                </div>

                {selectedProp.dimension === '2d' ? (
                  <div className="props-editor-section props-editor-span-2">
                    <div className="props-slider-grid props-slider-grid--double">
                      <div className="control-group control-group--slider props-editor-group">
                        <label htmlFor="props-2d-x-slider">
                          X <span>{Math.round(selectedProp.screen.x * 100)}%</span>
                        </label>
                        <input
                          id="props-2d-x-slider"
                          type="range"
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
                      </div>

                      <div className="control-group control-group--slider props-editor-group">
                        <label htmlFor="props-2d-y-slider">
                          Y <span>{Math.round(selectedProp.screen.y * 100)}%</span>
                        </label>
                        <input
                          id="props-2d-y-slider"
                          type="range"
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
                      </div>

                      <div className="control-group control-group--slider props-editor-group">
                        <label htmlFor="props-2d-rotation-slider">
                          Rotation <span>{`${Math.round(selectedProp.screen.rotation)}\u00B0`}</span>
                        </label>
                        <input
                          id="props-2d-rotation-slider"
                          type="range"
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
                      </div>

                      <div className="control-group props-editor-group">
                        <div className="viewer-mode-row props-flip-row">
                          <button type="button" onClick={resetSelectedOrientation}>
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="props-editor-section props-editor-span-2">
                      <div className="props-slider-grid props-slider-grid--triple">
                        {(['x', 'y', 'z'] as const).map((axis) => {
                          const axisRange = resolveWorldAxisRange(axis);
                          const displayValue = selectedProp.world[axis];
                          return (
                            <div
                              key={`world-position-${axis}`}
                              className="control-group control-group--slider props-editor-group"
                            >
                              <label htmlFor={`props-3d-position-${axis}`}>
                                {axis.toUpperCase()} <span>{formatSliderValue(displayValue)}</span>
                              </label>
                              <input
                                id={`props-3d-position-${axis}`}
                                type="range"
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
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="props-editor-section props-editor-span-2">
                      <div className="props-slider-grid props-slider-grid--triple">
                        {(['roll', 'pitch', 'yaw'] as const).map((axis) => (
                          <div key={axis} className="control-group control-group--slider props-editor-group">
                            <label htmlFor={`props-3d-${axis}`}>
                              {getRotationAxisLabel(axis)}{' '}
                              <span>{`${Math.round(selectedProp.world[axis])}\u00B0`}</span>
                            </label>
                            <input
                              id={`props-3d-${axis}`}
                              type="range"
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
                          </div>
                        ))}
                      </div>

                      <div className="control-group props-editor-group">
                        <div className="viewer-mode-row props-flip-row">
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedProp((current) => ({
                                ...current,
                                world: { ...current.world, flipX: !current.world.flipX },
                              }))
                            }
                            aria-pressed={selectedProp.world.flipX}
                          >
                            Flip X
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              updateSelectedProp((current) => ({
                                ...current,
                                world: { ...current.world, flipY: !current.world.flipY },
                              }))
                            }
                            aria-pressed={selectedProp.world.flipY}
                          >
                            Flip Y
                          </button>
                          <button type="button" onClick={resetSelectedOrientation}>
                            Reset
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="control-row props-editor-delete-row props-editor-span-2">
                  <button
                    type="button"
                    className="viewer-top-menu-button viewer-top-menu-button--danger"
                    onClick={handleDeleteProp}
                  >
                    Delete prop
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSelectedProp((current) => ({ ...current, visible: !current.visible }))
                    }
                    aria-pressed={selectedProp.visible}
                  >
                    {selectedProp.visible ? 'Hide prop' : 'Show prop'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="props-window-empty props-window-empty--editor">
                Select a prop or create a new one.
              </div>
            )}
          </div>

          <div className="control-row props-editor-delete-row">
            <button
              type="button"
              onClick={() => onSetAllVisible(!allPropsVisible)}
              disabled={props.length === 0}
            >
              {allPropsVisible ? 'Hide all' : 'Show all'}
            </button>
            <button
              type="button"
              className="viewer-top-menu-button viewer-top-menu-button--danger"
              onClick={handleClearProps}
              disabled={props.length === 0}
            >
              Clear all
            </button>
          </div>
        </div>
      </div>
    </FloatingWindow>
  );
}

export default PropsWindow;
