import FloatingWindow from '../../widgets/FloatingWindow';
import { useViewerWindowActionColumnHeight } from './hooks/useViewerWindowActionColumnHeight';
import type { LayoutProps } from './types';
import {
  ViewerWindowButton,
  ViewerWindowDivider,
  ViewerWindowEmptyState,
  ViewerWindowManager,
  ViewerWindowManagerActions,
  ViewerWindowManagerItem,
  ViewerWindowManagerItemLabel,
  ViewerWindowManagerList,
  ViewerWindowRow,
  ViewerWindowSlider,
  ViewerWindowStack,
} from './window-ui';
import type { SavedCameraView } from '../../../types/camera';
import { CAMERA_WINDOW_WIDTH } from '../../../shared/utils/windowLayout';

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

type CameraWindowProps = {
  initialPosition: LayoutProps['cameraWindowInitialPosition'];
  windowMargin: number;
  resetSignal: number;
  cameraPositionDraft: CoordinateDraft;
  cameraRotationDraft: RotationDraft;
  translationEnabled: boolean;
  rotationEnabled: boolean;
  canUpdate: boolean;
  voxelFollowDraft: CoordinateDraft;
  voxelFollowLocked: boolean;
  voxelFollowButtonLabel: 'Follow' | 'Stop';
  voxelFollowButtonDisabled: boolean;
  savedViews: SavedCameraView[];
  selectedViewId: string | null;
  canActivateViews: boolean;
  canAddView: boolean;
  canRemoveView: boolean;
  canSaveViews: boolean;
  canLoadViews: boolean;
  canClearViews: boolean;
  onCameraPositionChange: (axis: keyof CoordinateDraft, value: string) => void;
  onCameraRotationChange: (axis: keyof RotationDraft, value: string) => void;
  onApplyCameraUpdate: () => void;
  onVoxelFollowChange: (axis: keyof CoordinateDraft, value: string) => void;
  onVoxelFollowButtonClick: () => void;
  onAddView: () => void;
  onRemoveView: () => void;
  onRenameView: () => void;
  onSaveViews: () => void;
  onLoadViews: () => void;
  onClearViews: () => void;
  onSelectView: (viewId: string) => void;
  onClose: () => void;
};

const AXES: ReadonlyArray<keyof CoordinateDraft> = ['x', 'y', 'z'];
const ROTATION_AXES: ReadonlyArray<keyof RotationDraft> = ['yaw', 'pitch', 'roll'];

const formatAngle = (value: string) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(1)}°` : '0.0°';
};

export default function CameraWindow({
  initialPosition,
  windowMargin,
  resetSignal,
  cameraPositionDraft,
  cameraRotationDraft,
  translationEnabled,
  rotationEnabled,
  canUpdate,
  voxelFollowDraft,
  voxelFollowLocked,
  voxelFollowButtonLabel,
  voxelFollowButtonDisabled,
  savedViews,
  selectedViewId,
  canActivateViews,
  canAddView,
  canRemoveView,
  canSaveViews,
  canLoadViews,
  canClearViews,
  onCameraPositionChange,
  onCameraRotationChange,
  onApplyCameraUpdate,
  onVoxelFollowChange,
  onVoxelFollowButtonClick,
  onAddView,
  onRemoveView,
  onRenameView,
  onSaveViews,
  onLoadViews,
  onClearViews,
  onSelectView,
  onClose,
}: CameraWindowProps) {
  const { actionsRef, managerStyle } = useViewerWindowActionColumnHeight();

  return (
    <FloatingWindow
      title="View selection"
      initialPosition={initialPosition}
      width={`min(${CAMERA_WINDOW_WIDTH}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--camera"
      resetSignal={resetSignal}
      onClose={onClose}
    >
      <ViewerWindowStack className="camera-window">
        <fieldset className="camera-window-fieldset" disabled={!translationEnabled}>
          <div className="camera-window-grid camera-window-grid--triple">
            {AXES.map((axis) => (
              <label key={axis} className="camera-window-input">
                <span>{axis.toUpperCase()}</span>
                <input
                  id={`camera-position-${axis}`}
                  type="number"
                  step="1"
                  value={cameraPositionDraft[axis]}
                  onChange={(event) => onCameraPositionChange(axis, event.target.value)}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="camera-window-fieldset" disabled={!rotationEnabled}>
          <div className="camera-window-rotation-list">
            {ROTATION_AXES.map((axis) => (
              <ViewerWindowSlider
                key={axis}
                id={`camera-rotation-${axis}`}
                className="camera-window-slider camera-window-slider--rotation"
                label={axis[0].toUpperCase() + axis.slice(1)}
                valueLabel={formatAngle(cameraRotationDraft[axis])}
                min={-180}
                max={180}
                step="0.1"
                value={cameraRotationDraft[axis]}
                onChange={(event) => onCameraRotationChange(axis, event.target.value)}
              />
            ))}
          </div>
        </fieldset>

        <ViewerWindowRow className="camera-window-row camera-window-row--update" justify="center">
          <ViewerWindowButton type="button" onClick={onApplyCameraUpdate} disabled={!canUpdate}>
            Update view
          </ViewerWindowButton>
        </ViewerWindowRow>

        <div className="camera-window-section">
          <span className="camera-window-section-label camera-window-section-label--centered">Voxel to follow:</span>
          <ViewerWindowRow className="camera-window-row camera-window-row--follow" justify="center">
            <div className="camera-window-follow-inputs">
              {AXES.map((axis) => (
                <label key={axis} className="camera-window-inline-input">
                  <span>{axis.toUpperCase()}</span>
                  <input
                    id={`camera-follow-${axis}`}
                    type="number"
                    min={1}
                    step={1}
                    value={voxelFollowDraft[axis]}
                    disabled={voxelFollowLocked}
                    onChange={(event) => onVoxelFollowChange(axis, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </ViewerWindowRow>
          <ViewerWindowRow className="camera-window-row camera-window-row--follow-action" justify="center">
            <ViewerWindowButton type="button" onClick={onVoxelFollowButtonClick} disabled={voxelFollowButtonDisabled}>
              {voxelFollowButtonLabel}
            </ViewerWindowButton>
          </ViewerWindowRow>
        </div>

        <ViewerWindowDivider className="camera-window-divider" aria-hidden="true" />

        <ViewerWindowManager className="camera-window-library" style={managerStyle}>
          <ViewerWindowManagerList className="roi-manager-list camera-window-views" aria-label="Saved camera views">
            {savedViews.length > 0 ? (
              savedViews.map((view) => {
                const isSelected = selectedViewId === view.id;
                return (
                  <ViewerWindowManagerItem
                    key={view.id}
                    type="button"
                    role="listitem"
                    className="roi-manager-list-item camera-window-view"
                    selected={isSelected}
                    disabled={!canActivateViews}
                    onClick={() => onSelectView(view.id)}
                  >
                    <ViewerWindowManagerItemLabel className="roi-manager-list-item-label camera-window-view-label">
                      {view.label}
                    </ViewerWindowManagerItemLabel>
                  </ViewerWindowManagerItem>
                );
              })
            ) : (
              <ViewerWindowEmptyState className="roi-manager-empty-state camera-window-empty-state">
                No saved views.
              </ViewerWindowEmptyState>
            )}
          </ViewerWindowManagerList>

          <ViewerWindowManagerActions className="roi-manager-actions camera-window-actions" ref={actionsRef}>
            <ViewerWindowButton type="button" onClick={onAddView} disabled={!canAddView}>
              Add
            </ViewerWindowButton>
            <ViewerWindowButton type="button" onClick={onRemoveView} disabled={!canRemoveView}>
              Delete
            </ViewerWindowButton>
            <ViewerWindowButton type="button" onClick={onRenameView} disabled={!canRemoveView}>
              Rename
            </ViewerWindowButton>
            <ViewerWindowButton type="button" onClick={onSaveViews} disabled={!canSaveViews}>
              Save
            </ViewerWindowButton>
            <ViewerWindowButton type="button" onClick={onLoadViews} disabled={!canLoadViews}>
              Load
            </ViewerWindowButton>
            <ViewerWindowButton type="button" onClick={onClearViews} disabled={!canClearViews}>
              Clear
            </ViewerWindowButton>
          </ViewerWindowManagerActions>
        </ViewerWindowManager>
      </ViewerWindowStack>
    </FloatingWindow>
  );
}
