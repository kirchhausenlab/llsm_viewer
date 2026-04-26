import { useCallback } from 'react';

import FloatingWindow from '../../widgets/FloatingWindow';
import type { AnnotateBrushMode, AnnotateDimensionMode } from '../../../types/annotation';
import type { AnnotateController } from '../../../hooks/annotation/useAnnotate';
import type { LayoutProps } from './types';

type AnnotateWindowProps = {
  initialPosition: LayoutProps['annotateWindowInitialPosition'];
  windowMargin: number;
  controlWindowWidth: number;
  resetSignal: number;
  controller: AnnotateController;
  onClose: () => void;
};

const MODE_OPTIONS: AnnotateDimensionMode[] = ['2d', '3d'];

function formatLabelRow(index: number, name: string): string {
  return `${index + 1} - ${name}`;
}

export default function AnnotateWindow({
  initialPosition,
  windowMargin,
  controlWindowWidth,
  resetSignal,
  controller,
  onClose,
}: AnnotateWindowProps) {
  const active = controller.activeChannel;
  const isEraserMode = active?.brushMode === 'eraser';
  const mode = active?.mode ?? '3d';
  const radius = active?.radius ?? 1;
  const creationLocked = active !== null;
  const creationDisabled = creationLocked || !controller.available || controller.busy;

  const handleClose = useCallback(() => {
    controller.setEnabled(false);
    onClose();
  }, [controller, onClose]);

  const handleBrushModeToggle = useCallback(() => {
    const next: AnnotateBrushMode = isEraserMode ? 'brush' : 'eraser';
    controller.setBrushMode(next);
  }, [controller, isEraserMode]);

  return (
    <FloatingWindow
      title="Annotate"
      className="floating-window--annotate"
      initialPosition={initialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      resetSignal={resetSignal}
      onClose={handleClose}
    >
      <div className="global-controls annotate-window">
        <div className={creationLocked ? 'control-row annotate-create-row is-locked' : 'control-row annotate-create-row'}>
          <button type="button" onClick={() => void controller.createChannel()} disabled={creationDisabled}>
            New
          </button>
          <label className="annotate-select-label" htmlFor="annotate-source-select">
            <span className="sr-only">Annotation source</span>
            <select
              id="annotate-source-select"
              value={controller.selectedSourceId}
              onChange={(event) => controller.setSelectedSourceId(event.target.value)}
              disabled={creationDisabled}
            >
              {controller.sourceOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className={creationLocked ? 'control-row annotate-name-row is-locked' : 'control-row annotate-name-row'}>
          <label htmlFor="annotate-channel-name">Channel</label>
          <input
            id="annotate-channel-name"
            type="text"
            value={controller.creationName}
            onChange={(event) => controller.setCreationName(event.target.value)}
            disabled={creationDisabled}
          />
        </div>

        <div className="control-row annotate-toolbar">
          <div className="draw-roi-segmented-control draw-roi-segmented-control--mode" role="group" aria-label="Annotation dimension">
            {MODE_OPTIONS.map((option) => {
              const isSelected = mode === option;
              return (
                <button
                  key={option}
                  type="button"
                  className={isSelected ? 'draw-roi-segment-button is-active' : 'draw-roi-segment-button'}
                  aria-pressed={isSelected}
                  onClick={() => controller.setMode(option)}
                  disabled={!active}
                >
                  {option.toUpperCase()}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="annotate-toggle"
            onClick={() => controller.setEnabled(!active?.enabled)}
            aria-pressed={active?.enabled ?? false}
            disabled={!active}
            title="Hold Ctrl + left-click or drag in the viewer to annotate"
          >
            {active?.enabled ? 'Enabled' : 'Disabled'}
          </button>
          <button type="button" onClick={handleBrushModeToggle} aria-pressed={isEraserMode} disabled={!active}>
            {isEraserMode ? 'Brush' : 'Eraser'}
          </button>
          <button
            type="button"
            className="annotate-toggle"
            onClick={() => controller.setOverlayVisible(!active?.overlayVisible)}
            aria-pressed={active?.overlayVisible ?? false}
            disabled={!active}
          >
            {active?.overlayVisible ? 'Hide' : 'Show'}
          </button>
        </div>

        <div className="control-row annotate-history-row">
          <button type="button" onClick={controller.undo} disabled={!controller.canUndo}>
            Undo
          </button>
          <button type="button" onClick={controller.redo} disabled={!controller.canRedo}>
            Redo
          </button>
        </div>

        <div className="control-row annotate-radius-row">
          <div className="control-group control-group--slider annotate-slider-group">
            <label htmlFor="annotate-radius-slider">
              Radius <span>{radius}</span>
            </label>
            <input
              id="annotate-radius-slider"
              type="range"
              min={1}
              max={10}
              step={1}
              value={radius}
              onChange={(event) => controller.setRadius(Number(event.target.value))}
              disabled={!active}
            />
          </div>
        </div>

        <div className="annotate-divider" />

        <div className="annotate-label-manager">
          <div
            className="annotate-label-list"
            role="listbox"
            aria-label="Labels"
            tabIndex={0}
          >
            {(active?.labels ?? []).map((label, index) => {
              const selected = active?.activeLabelIndex === index;
              return (
                <button
                  key={index}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={selected ? 'annotate-label-item is-active' : 'annotate-label-item'}
                  onClick={() => controller.setActiveLabelIndex(index)}
                >
                  {formatLabelRow(index, label.name)}
                </button>
              );
            })}
          </div>
          <div className="annotate-label-actions">
            <button type="button" onClick={controller.addLabel} disabled={!active}>
              Add
            </button>
            <button type="button" onClick={controller.deleteActiveLabel} disabled={!active}>
              Delete
            </button>
            <button type="button" onClick={controller.renameActiveLabel} disabled={!active}>
              Rename
            </button>
            <button type="button" onClick={() => void controller.saveActiveChannel()} disabled={!active || controller.busy}>
              Save
            </button>
            <button type="button" onClick={controller.clearActiveChannel} disabled={!active}>
              Clear
            </button>
          </div>
        </div>

        {controller.message || controller.unavailableReason ? (
          <div className="annotate-message" role="status" aria-live="polite">
            {controller.message ?? controller.unavailableReason}
          </div>
        ) : null}
      </div>
    </FloatingWindow>
  );
}
