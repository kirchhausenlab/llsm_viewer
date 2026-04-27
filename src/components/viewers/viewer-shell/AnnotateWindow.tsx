import { useCallback, useMemo, useState, type CSSProperties } from 'react';

import FloatingWindow from '../../widgets/FloatingWindow';
import type { AnnotateBrushMode, AnnotateDimensionMode } from '../../../types/annotation';
import type { AnnotateController } from '../../../hooks/annotation/useAnnotate';
import { createSegmentationSeed } from '../../../shared/utils/appHelpers';
import { hashSparseSegmentationLabelColor } from '../../../shared/utils/preprocessedDataset/sparseSegmentation';
import { useActionColumnHeightCssVar } from './hooks/useActionColumnHeightCssVar';
import type { LayoutProps } from './types';

type SelectedAnnotateChannel = {
  channelId: string;
  name: string;
  editable: boolean;
};

type AnnotateWindowProps = {
  initialPosition: LayoutProps['annotateWindowInitialPosition'];
  windowMargin: number;
  controlWindowWidth: number;
  resetSignal: number;
  controller: AnnotateController;
  selectedChannel: SelectedAnnotateChannel | null;
  onClose: () => void;
};

const MODE_OPTIONS: AnnotateDimensionMode[] = ['2d', '3d'];

function formatLabelRow(index: number, name: string): string {
  const trimmed = name.trim();
  return trimmed ? `${index + 1} - ${trimmed}` : `${index + 1}`;
}

function resolveLabelColor(layerKey: string, labelId: number): string {
  const [r, g, b] = hashSparseSegmentationLabelColor(labelId, createSegmentationSeed(layerKey));
  return `rgb(${r}, ${g}, ${b})`;
}

function HandIcon() {
  return (
    <svg className="annotate-tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18 11V6a2 2 0 0 0-4 0v5" />
      <path d="M14 10V5a2 2 0 0 0-4 0v7" />
      <path d="M10 12V7a2 2 0 0 0-4 0v7" />
      <path d="M6 14v-2a2 2 0 0 0-4 0v3c0 4.4 3.6 8 8 8h2c4.4 0 8-3.6 8-8v-4a2 2 0 0 0-2-2Z" />
    </svg>
  );
}

function BrushIcon() {
  return (
    <svg className="annotate-tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 17c0 2-1.5 3.5-4 4 0-2.5 1.5-4 3.5-4h.5Z" />
      <path d="M7 17 19 5a2.1 2.1 0 0 1 3 3L10 20c-.8.8-2.1.8-3 0s-.8-2.1 0-3Z" />
    </svg>
  );
}

function EraserIcon() {
  return (
    <svg className="annotate-tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m4 15 8-8a2.8 2.8 0 0 1 4 0l4 4a2.8 2.8 0 0 1 0 4l-5 5H8l-4-4Z" />
      <path d="m9 10 7 7" />
      <path d="M14 20h7" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg className="annotate-tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 1 1-5.2 9" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg className="annotate-tool-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 1 0 5.2 9" />
    </svg>
  );
}

export default function AnnotateWindow({
  initialPosition,
  windowMargin,
  controlWindowWidth,
  resetSignal,
  controller,
  selectedChannel,
  onClose,
}: AnnotateWindowProps) {
  const active = controller.activeChannel;
  const mode = active?.mode ?? '3d';
  const radius = active?.radius ?? 1;
  const canEditSelectedChannel = Boolean(
    active &&
    selectedChannel?.editable &&
    selectedChannel.channelId === active.channelId
  );
  const bodyDisabled = !canEditSelectedChannel;
  const selectedLabel = active?.labels[active.activeLabelIndex] ?? null;
  const selectedLabelText = active && selectedLabel ? formatLabelRow(active.activeLabelIndex, selectedLabel.name) : 'None';
  const selectedLabelColor = active && selectedLabel ? resolveLabelColor(active.layerKey, active.activeLabelIndex + 1) : undefined;
  const selectedLabelStyle: CSSProperties | undefined = selectedLabelColor ? { color: selectedLabelColor } : undefined;
  const channelLabel = selectedChannel
    ? `${selectedChannel.name}${selectedChannel.editable ? '' : ' (read-only)'}`
    : 'None';
  const activeTool: 'hand' | AnnotateBrushMode = active?.enabled ? active.brushMode : 'hand';
  const createButtonDisabled = !controller.available || controller.busy;
  const deleteButtonDisabled = !canEditSelectedChannel || controller.busy;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [draftName, setDraftName] = useState(controller.creationName);
  const [draftSourceId, setDraftSourceId] = useState(controller.selectedSourceId);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const { actionsRef: labelActionsRef, managerStyle: labelManagerStyle } = useActionColumnHeightCssVar();
  const resolveAvailableSourceId = useCallback(
    (candidate: string) => (
      controller.sourceOptions.some((option) => option.id === candidate)
        ? candidate
        : controller.sourceOptions[0]?.id ?? 'empty'
    ),
    [controller.sourceOptions]
  );
  const createSourceId = resolveAvailableSourceId(draftSourceId);
  const createWindowInitialPosition = useMemo(
    () => ({ x: initialPosition.x + 28, y: initialPosition.y + 48 }),
    [initialPosition.x, initialPosition.y]
  );

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const handleOpenCreateDialog = useCallback(() => {
    if (createButtonDisabled || createDialogOpen) {
      return;
    }
    setDraftName(controller.creationName);
    setDraftSourceId(resolveAvailableSourceId(controller.selectedSourceId));
    setCreateMessage(null);
    setCreateDialogOpen(true);
  }, [
    controller.creationName,
    controller.selectedSourceId,
    createButtonDisabled,
    createDialogOpen,
    resolveAvailableSourceId,
  ]);

  const handleCancelCreate = useCallback(() => {
    setCreateDialogOpen(false);
    setCreateMessage(null);
  }, []);

  const handleCreateChannel = useCallback(async () => {
    setCreateMessage(null);
    const result = await controller.createChannel({
      name: draftName,
      sourceId: createSourceId,
    });
    if (result.ok) {
      setCreateDialogOpen(false);
      return;
    }
    setCreateMessage(result.message);
  }, [controller, createSourceId, draftName]);

  const handleToolChange = useCallback((tool: 'hand' | AnnotateBrushMode) => {
    if (!canEditSelectedChannel) {
      return;
    }
    if (tool === 'hand') {
      controller.setEnabled(false);
      return;
    }
    controller.setBrushMode(tool);
    controller.setEnabled(true);
  }, [canEditSelectedChannel, controller]);

  return (
    <>
      <FloatingWindow
        title="Annotate"
        className="floating-window--annotate"
        initialPosition={initialPosition}
        width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
        resetSignal={resetSignal}
        onClose={handleClose}
      >
        <div className="global-controls annotate-window">
          <div className="control-row annotate-top-row">
            <button type="button" onClick={handleOpenCreateDialog} disabled={createButtonDisabled || createDialogOpen}>
              New channel
            </button>
            <button type="button" onClick={controller.deleteActiveChannel} disabled={deleteButtonDisabled}>
              Delete channel
            </button>
          </div>

          <div className="annotate-divider" />

          <div className={bodyDisabled ? 'annotate-body is-disabled' : 'annotate-body'} aria-disabled={bodyDisabled}>
            <div className="control-row annotate-info-row">
              <span className="annotate-info-label">Channel:</span>
              <span className="annotate-info-value">{channelLabel}</span>
            </div>

            <div className="control-row annotate-info-row">
              <span className="annotate-info-label">Label:</span>
              <span className="annotate-current-label" style={selectedLabelStyle}>
                {selectedLabelText}
              </span>
            </div>

            <div className="control-row annotate-tool-row">
              <div
                className="draw-roi-segmented-control annotate-tool-segmented-control"
                role="group"
                aria-label="Annotation tool"
              >
                <button
                  type="button"
                  className={activeTool === 'hand' ? 'draw-roi-segment-button is-active' : 'draw-roi-segment-button'}
                  aria-label="Hand"
                  aria-pressed={activeTool === 'hand'}
                  title="Hand"
                  onClick={() => handleToolChange('hand')}
                  disabled={!canEditSelectedChannel}
                >
                  <HandIcon />
                </button>
                <button
                  type="button"
                  className={activeTool === 'brush' ? 'draw-roi-segment-button is-active' : 'draw-roi-segment-button'}
                  aria-label="Brush"
                  aria-pressed={activeTool === 'brush'}
                  title="Brush"
                  onClick={() => handleToolChange('brush')}
                  disabled={!canEditSelectedChannel}
                >
                  <BrushIcon />
                </button>
                <button
                  type="button"
                  className={activeTool === 'eraser' ? 'draw-roi-segment-button is-active' : 'draw-roi-segment-button'}
                  aria-label="Eraser"
                  aria-pressed={activeTool === 'eraser'}
                  title="Eraser"
                  onClick={() => handleToolChange('eraser')}
                  disabled={!canEditSelectedChannel}
                >
                  <EraserIcon />
                </button>
              </div>
            </div>

            <div className="control-row annotate-mode-history-row">
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
                      disabled={!canEditSelectedChannel}
                    >
                      {option.toUpperCase()}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="annotate-icon-button"
                onClick={controller.undo}
                disabled={!canEditSelectedChannel || !controller.canUndo}
                aria-label="Undo"
                title="Undo"
              >
                <UndoIcon />
              </button>
              <button
                type="button"
                className="annotate-icon-button"
                onClick={controller.redo}
                disabled={!canEditSelectedChannel || !controller.canRedo}
                aria-label="Redo"
                title="Redo"
              >
                <RedoIcon />
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
                  disabled={!canEditSelectedChannel}
                />
              </div>
            </div>

            <div className="annotate-divider" />

            <div className="annotate-label-manager" style={labelManagerStyle}>
              <div
                className="roi-manager-list"
                role="listbox"
                aria-label="Labels"
                tabIndex={0}
              >
                {(active?.labels.length ?? 0) > 0 ? (
                  active?.labels.map((label, index) => {
                    const selected = active.activeLabelIndex === index;
                    return (
                      <button
                        key={index}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={[
                          'roi-manager-list-item',
                          selected ? 'is-active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => controller.setActiveLabelIndex(index)}
                        disabled={!canEditSelectedChannel}
                      >
                        <span className="roi-manager-list-item-label">
                          {formatLabelRow(index, label.name)}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="roi-manager-empty-state">No labels.</p>
                )}
              </div>
              <div className="roi-manager-actions annotate-label-actions" ref={labelActionsRef}>
                <button type="button" onClick={controller.addLabel} disabled={!canEditSelectedChannel}>
                  Add
                </button>
                <button type="button" onClick={controller.deleteActiveLabel} disabled={!canEditSelectedChannel}>
                  Delete
                </button>
                <button type="button" onClick={controller.renameActiveLabel} disabled={!canEditSelectedChannel}>
                  Rename
                </button>
                <button type="button" onClick={() => void controller.saveActiveChannel()} disabled={!canEditSelectedChannel || controller.busy}>
                  Save
                </button>
                <button type="button" onClick={controller.clearActiveChannel} disabled={!canEditSelectedChannel}>
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
        </div>
      </FloatingWindow>

      {createDialogOpen ? (
        <FloatingWindow
          title="Create new channel"
          className="floating-window--annotate-create"
          initialPosition={createWindowInitialPosition}
          width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
          resetSignal={resetSignal}
          onClose={handleCancelCreate}
        >
          <form
            className="global-controls annotate-create-window"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateChannel();
            }}
          >
            <div className="control-row annotate-create-form-row">
              <label htmlFor="annotate-create-channel-name">Name:</label>
              <input
                id="annotate-create-channel-name"
                type="text"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                disabled={controller.busy}
              />
            </div>

            <div className="control-row annotate-create-form-row">
              <label htmlFor="annotate-create-source-select">Source:</label>
              <select
                id="annotate-create-source-select"
                value={createSourceId}
                onChange={(event) => setDraftSourceId(event.target.value)}
                disabled={controller.busy}
              >
                {controller.sourceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="control-row annotate-create-actions">
              <button type="submit" disabled={!controller.available || controller.busy}>
                Create
              </button>
              <button type="button" onClick={handleCancelCreate} disabled={controller.busy}>
                Cancel
              </button>
            </div>

            {createMessage ? (
              <div className="annotate-create-message annotate-create-message--error" role="alert">
                {createMessage}
              </div>
            ) : null}
          </form>
        </FloatingWindow>
      ) : null}
    </>
  );
}
