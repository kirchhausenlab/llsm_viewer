import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps } from './types';
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
  return (
    <FloatingWindow
      title="View selection"
      initialPosition={initialPosition}
      width={`min(${CAMERA_WINDOW_WIDTH}px, calc(100vw - ${windowMargin * 2}px))`}
      className="floating-window--camera"
      resetSignal={resetSignal}
      onClose={onClose}
    >
      <div className="camera-window">
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
              <label key={axis} className="camera-window-slider camera-window-slider--rotation">
                <span className="camera-window-slider-label">
                  {axis[0].toUpperCase() + axis.slice(1)} <span>{formatAngle(cameraRotationDraft[axis])}</span>
                </span>
                <input
                  id={`camera-rotation-${axis}`}
                  type="range"
                  min={-180}
                  max={180}
                  step="0.1"
                  value={cameraRotationDraft[axis]}
                  onChange={(event) => onCameraRotationChange(axis, event.target.value)}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="camera-window-row camera-window-row--update">
          <button type="button" onClick={onApplyCameraUpdate} disabled={!canUpdate}>
            Update view
          </button>
        </div>

        <div className="camera-window-section">
          <span className="camera-window-section-label camera-window-section-label--centered">Voxel to follow:</span>
          <div className="camera-window-row camera-window-row--follow">
            <div className="camera-window-follow-inputs">
              {AXES.map((axis) => (
                <label key={axis} className="camera-window-inline-input">
                  <span>{axis.toUpperCase()}</span>
                  <input
                    id={`camera-follow-${axis}`}
                    type="number"
                    min={0}
                    step={1}
                    value={voxelFollowDraft[axis]}
                    disabled={voxelFollowLocked}
                    onChange={(event) => onVoxelFollowChange(axis, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
          <div className="camera-window-row camera-window-row--follow-action">
            <button type="button" onClick={onVoxelFollowButtonClick} disabled={voxelFollowButtonDisabled}>
              {voxelFollowButtonLabel}
            </button>
          </div>
        </div>

        <div className="camera-window-divider" aria-hidden="true" />

        <div className="camera-window-library">
          <div className="roi-manager-list camera-window-views" role="listbox" aria-label="Saved camera views">
            {savedViews.length > 0 ? (
              savedViews.map((view) => {
                const isSelected = selectedViewId === view.id;
                return (
                  <button
                    key={view.id}
                    type="button"
                    role="listitem"
                    className={[
                      'roi-manager-list-item',
                      'camera-window-view',
                      isSelected ? 'is-selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-selected={isSelected}
                    disabled={!canActivateViews}
                    onClick={() => onSelectView(view.id)}
                  >
                    <span className="roi-manager-list-item-label camera-window-view-label">{view.label}</span>
                  </button>
                );
              })
            ) : (
              <p className="roi-manager-empty-state camera-window-empty-state">No saved views.</p>
            )}
          </div>

          <div className="roi-manager-actions camera-window-actions">
            <button type="button" onClick={onAddView} disabled={!canAddView}>
              Add
            </button>
            <button type="button" onClick={onRemoveView} disabled={!canRemoveView}>
              Delete
            </button>
            <button type="button" onClick={onRenameView} disabled={!canRemoveView}>
              Rename
            </button>
            <button type="button" onClick={onSaveViews} disabled={!canSaveViews}>
              Save
            </button>
            <button type="button" onClick={onLoadViews} disabled={!canLoadViews}>
              Load
            </button>
            <button type="button" onClick={onClearViews} disabled={!canClearViews}>
              Clear
            </button>
          </div>
        </div>
      </div>
    </FloatingWindow>
  );
}
