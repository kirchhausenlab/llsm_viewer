import { useCallback, useMemo, useState, type CSSProperties } from 'react';

import FloatingWindow from '../../widgets/FloatingWindow';
import type { AnnotateController } from '../../../hooks/annotation/useAnnotate';
import { createSegmentationSeed } from '../../../shared/utils/appHelpers';
import { hashSparseSegmentationLabelColor } from '../../../shared/utils/preprocessedDataset/sparseSegmentation';
import { useViewerWindowActionColumnHeight } from './hooks/useViewerWindowActionColumnHeight';
import type { LayoutProps } from './types';
import {
  ViewerWindowButton,
  ViewerWindowDivider,
  ViewerWindowEmptyState,
  ViewerWindowFieldRow,
  ViewerWindowForm,
  ViewerWindowManager,
  ViewerWindowManagerActions,
  ViewerWindowManagerItem,
  ViewerWindowManagerItemLabel,
  ViewerWindowManagerList,
  ViewerWindowMessage,
  ViewerWindowRow,
  ViewerWindowSelect,
  ViewerWindowSlider,
  ViewerWindowStack,
  ViewerWindowValue,
} from './window-ui';

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

function formatLabelRow(index: number, name: string): string {
  const trimmed = name.trim();
  return trimmed ? `${index + 1} - ${trimmed}` : `${index + 1}`;
}

function resolveLabelColor(layerKey: string, labelId: number): string {
  const [r, g, b] = hashSparseSegmentationLabelColor(labelId, createSegmentationSeed(layerKey));
  return `rgb(${r}, ${g}, ${b})`;
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
  const createButtonDisabled = !controller.available || controller.busy;
  const deleteButtonDisabled = !canEditSelectedChannel || controller.busy;
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [draftName, setDraftName] = useState(controller.creationName);
  const [draftSourceId, setDraftSourceId] = useState(controller.selectedSourceId);
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const { actionsRef: labelActionsRef, managerStyle: labelManagerStyle } = useViewerWindowActionColumnHeight();
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
        <ViewerWindowStack className="annotate-window">
          <ViewerWindowRow className="annotate-top-row" wrap>
            <ViewerWindowButton
              type="button"
              expand
              onClick={handleOpenCreateDialog}
              disabled={createButtonDisabled || createDialogOpen}
            >
              New channel
            </ViewerWindowButton>
            <ViewerWindowButton
              type="button"
              expand
              onClick={controller.deleteActiveChannel}
              disabled={deleteButtonDisabled}
            >
              Delete channel
            </ViewerWindowButton>
          </ViewerWindowRow>

          <ViewerWindowDivider />

          <div className={bodyDisabled ? 'annotate-body is-disabled' : 'annotate-body'} aria-disabled={bodyDisabled}>
            <ViewerWindowFieldRow label="Channel:" className="annotate-info-row">
              <ViewerWindowValue className="annotate-info-value">{channelLabel}</ViewerWindowValue>
            </ViewerWindowFieldRow>

            <ViewerWindowFieldRow label="Label:" className="annotate-info-row">
              <ViewerWindowValue className="annotate-current-label" style={selectedLabelStyle}>
                {selectedLabelText}
              </ViewerWindowValue>
            </ViewerWindowFieldRow>

            <ViewerWindowRow className="annotate-radius-row">
              <ViewerWindowSlider
                id="annotate-radius-slider"
                className="annotate-slider-group"
                label="Radius"
                valueLabel={radius}
                min={1}
                max={10}
                step={1}
                value={radius}
                onChange={(event) => controller.setRadius(Number(event.target.value))}
                disabled={!canEditSelectedChannel}
              />
            </ViewerWindowRow>

            <ViewerWindowDivider />

            <ViewerWindowManager className="annotate-label-manager" style={labelManagerStyle}>
              <ViewerWindowManagerList
                role="listbox"
                aria-label="Labels"
                tabIndex={0}
              >
                {(active?.labels.length ?? 0) > 0 ? (
                  active?.labels.map((label, index) => {
                    const selected = active.activeLabelIndex === index;
                    return (
                      <ViewerWindowManagerItem
                        key={index}
                        type="button"
                        role="option"
                        className="roi-manager-list-item"
                        selected={selected}
                        active={selected}
                        onClick={() => controller.setActiveLabelIndex(index)}
                        disabled={!canEditSelectedChannel}
                      >
                        <ViewerWindowManagerItemLabel className="roi-manager-list-item-label">
                          {formatLabelRow(index, label.name)}
                        </ViewerWindowManagerItemLabel>
                      </ViewerWindowManagerItem>
                    );
                  })
                ) : (
                  <ViewerWindowEmptyState>No labels.</ViewerWindowEmptyState>
                )}
              </ViewerWindowManagerList>
              <ViewerWindowManagerActions className="annotate-label-actions" ref={labelActionsRef}>
                <ViewerWindowButton type="button" onClick={controller.addLabel} disabled={!canEditSelectedChannel}>
                  Add
                </ViewerWindowButton>
                <ViewerWindowButton type="button" onClick={controller.deleteActiveLabel} disabled={!canEditSelectedChannel}>
                  Delete
                </ViewerWindowButton>
                <ViewerWindowButton type="button" onClick={controller.renameActiveLabel} disabled={!canEditSelectedChannel}>
                  Rename
                </ViewerWindowButton>
                <ViewerWindowButton type="button" onClick={() => void controller.saveActiveChannel()} disabled={!canEditSelectedChannel || controller.busy}>
                  Save
                </ViewerWindowButton>
                <ViewerWindowButton type="button" onClick={controller.clearActiveChannel} disabled={!canEditSelectedChannel}>
                  Clear
                </ViewerWindowButton>
              </ViewerWindowManagerActions>
            </ViewerWindowManager>

            {controller.message || controller.unavailableReason ? (
              <ViewerWindowMessage className="annotate-message" role="status" aria-live="polite">
                {controller.message ?? controller.unavailableReason}
              </ViewerWindowMessage>
            ) : null}
          </div>
        </ViewerWindowStack>
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
          <ViewerWindowForm
            className="annotate-create-window"
            onSubmit={(event) => {
              event.preventDefault();
              void handleCreateChannel();
            }}
          >
            <ViewerWindowRow className="annotate-create-form-row" align="center">
              <label htmlFor="annotate-create-channel-name">Name:</label>
              <input
                id="annotate-create-channel-name"
                type="text"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                disabled={controller.busy}
              />
            </ViewerWindowRow>

            <ViewerWindowRow className="annotate-create-form-row" align="center">
              <label htmlFor="annotate-create-source-select">Source:</label>
              <ViewerWindowSelect
                id="annotate-create-source-select"
                value={createSourceId}
                onChange={(event) => setDraftSourceId(event.target.value)}
                disabled={controller.busy}
                expand
              >
                {controller.sourceOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </ViewerWindowSelect>
            </ViewerWindowRow>

            <ViewerWindowRow className="annotate-create-actions" justify="center">
              <ViewerWindowButton type="submit" disabled={!controller.available || controller.busy}>
                Create
              </ViewerWindowButton>
              <ViewerWindowButton type="button" onClick={handleCancelCreate} disabled={controller.busy}>
                Cancel
              </ViewerWindowButton>
            </ViewerWindowRow>

            {createMessage ? (
              <ViewerWindowMessage className="annotate-create-message annotate-create-message--error" role="alert">
                {createMessage}
              </ViewerWindowMessage>
            ) : null}
          </ViewerWindowForm>
        </FloatingWindow>
      ) : null}
    </>
  );
}
