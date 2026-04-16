import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps } from './types';
import type { SavedRoi } from '../../../types/roi';

type RoiManagerWindowProps = {
  initialPosition: LayoutProps['roiManagerWindowInitialPosition'];
  windowMargin: number;
  controlWindowWidth: number;
  resetSignal: number;
  savedRois: SavedRoi[];
  activeSavedRoiId: string | null;
  showAllSavedRois: boolean;
  canAdd: boolean;
  canUpdate: boolean;
  onSelectRoi: (roiId: string) => void;
  onAdd: () => void;
  onDelete: () => void;
  onRename: () => void;
  onUpdate: () => void;
  onShowAllChange: (value: boolean) => void;
  onClose: () => void;
};

export default function RoiManagerWindow({
  initialPosition,
  windowMargin,
  controlWindowWidth,
  resetSignal,
  savedRois,
  activeSavedRoiId,
  showAllSavedRois,
  canAdd,
  canUpdate,
  onSelectRoi,
  onAdd,
  onDelete,
  onRename,
  onUpdate,
  onShowAllChange,
  onClose,
}: RoiManagerWindowProps) {
  const hasActiveRoi = activeSavedRoiId !== null;

  return (
    <FloatingWindow
      title="ROI Manager"
      initialPosition={initialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      resetSignal={resetSignal}
      className="floating-window--roi-manager"
      onClose={onClose}
    >
      <div className="roi-manager-window">
        <div className="roi-manager-list" role="listbox" aria-label="Saved ROIs">
          {savedRois.length > 0 ? (
            savedRois.map((roi) => {
              const isActive = roi.id === activeSavedRoiId;
              return (
                <button
                  key={roi.id}
                  type="button"
                  className={isActive ? 'roi-manager-list-item is-active' : 'roi-manager-list-item'}
                  aria-selected={isActive}
                  onClick={() => onSelectRoi(roi.id)}
                >
                  {roi.name}
                </button>
              );
            })
          ) : (
            <p className="roi-manager-empty-state">No saved ROIs.</p>
          )}
        </div>

        <div className="roi-manager-actions">
          <button type="button" onClick={onAdd} disabled={!canAdd}>
            Add
          </button>
          <button type="button" onClick={onDelete} disabled={!hasActiveRoi}>
            Delete
          </button>
          <button type="button" onClick={onRename} disabled={!hasActiveRoi}>
            Rename
          </button>
          <button type="button" onClick={onUpdate} disabled={!canUpdate}>
            Update
          </button>
          <button type="button" disabled>
            Measure
          </button>
          <button type="button" disabled>
            Properties
          </button>
          <button
            type="button"
            className={showAllSavedRois ? 'roi-manager-toggle is-active' : 'roi-manager-toggle'}
            aria-pressed={showAllSavedRois}
            onClick={() => onShowAllChange(!showAllSavedRois)}
          >
            Show all
          </button>
        </div>
      </div>
    </FloatingWindow>
  );
}
