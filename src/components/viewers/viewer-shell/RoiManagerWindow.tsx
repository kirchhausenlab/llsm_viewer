import FloatingWindow from '../../widgets/FloatingWindow';
import type { LayoutProps } from './types';
import type { SavedRoi } from '../../../types/roi';

type RoiManagerWindowProps = {
  initialPosition: LayoutProps['roiManagerWindowInitialPosition'];
  windowMargin: number;
  controlWindowWidth: number;
  resetSignal: number;
  savedRois: SavedRoi[];
  selectedSavedRoiIds: string[];
  activeSavedRoiId: string | null;
  showAllSavedRois: boolean;
  canAdd: boolean;
  canUpdate: boolean;
  canMeasure: boolean;
  canSave: boolean;
  canLoad: boolean;
  onSelectRoi: (roiId: string, additive?: boolean) => void;
  onAdd: () => void;
  onDelete: () => void;
  onRename: () => void;
  onUpdate: () => void;
  onMeasure: () => void;
  onSave: () => void;
  onLoad: () => void;
  onShowAllChange: (value: boolean) => void;
  onClose: () => void;
};

export default function RoiManagerWindow({
  initialPosition,
  windowMargin,
  controlWindowWidth,
  resetSignal,
  savedRois,
  selectedSavedRoiIds,
  activeSavedRoiId,
  showAllSavedRois,
  canAdd,
  canUpdate,
  canMeasure,
  canSave,
  canLoad,
  onSelectRoi,
  onAdd,
  onDelete,
  onRename,
  onUpdate,
  onMeasure,
  onSave,
  onLoad,
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
        <div className="roi-manager-list" role="listbox" aria-label="Saved ROIs" aria-multiselectable="true">
          {savedRois.length > 0 ? (
            savedRois.map((roi) => {
              const selectionIndex = selectedSavedRoiIds.indexOf(roi.id);
              const isSelected = selectionIndex !== -1;
              const isActive = roi.id === activeSavedRoiId;
              return (
                <button
                  key={roi.id}
                  type="button"
                  className={[
                    'roi-manager-list-item',
                    isSelected ? 'is-selected' : '',
                    isActive ? 'is-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-selected={isSelected}
                  onClick={(event) => onSelectRoi(roi.id, event.shiftKey)}
                >
                  <span className="roi-manager-list-item-label">{roi.name}</span>
                  {isSelected ? (
                    <span
                      className={isActive ? 'roi-manager-selection-badge is-active' : 'roi-manager-selection-badge'}
                      aria-hidden="true"
                    >
                      {selectionIndex + 1}
                    </span>
                  ) : null}
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
          <button type="button" onClick={onMeasure} disabled={!canMeasure}>
            Measure
          </button>
          <button type="button" onClick={onSave} disabled={!canSave}>
            Save
          </button>
          <button type="button" onClick={onLoad} disabled={!canLoad}>
            Load
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
