import FloatingWindow from '../../widgets/FloatingWindow';
import { useViewerWindowActionColumnHeight } from './hooks/useViewerWindowActionColumnHeight';
import type { LayoutProps } from './types';
import {
  ViewerWindowButton,
  ViewerWindowEmptyState,
  ViewerWindowManager,
  ViewerWindowManagerActions,
  ViewerWindowManagerBadge,
  ViewerWindowManagerItem,
  ViewerWindowManagerItemLabel,
  ViewerWindowManagerList,
} from './window-ui';
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
  const { actionsRef, managerStyle } = useViewerWindowActionColumnHeight();

  return (
    <FloatingWindow
      title="ROI Manager"
      initialPosition={initialPosition}
      width={`min(${controlWindowWidth}px, calc(100vw - ${windowMargin * 2}px))`}
      resetSignal={resetSignal}
      className="floating-window--roi-manager"
      onClose={onClose}
    >
      <ViewerWindowManager className="roi-manager-window" style={managerStyle}>
        <ViewerWindowManagerList className="roi-manager-list" aria-label="Saved ROIs" multiselectable>
          {savedRois.length > 0 ? (
            savedRois.map((roi) => {
              const selectionIndex = selectedSavedRoiIds.indexOf(roi.id);
              const isSelected = selectionIndex !== -1;
              const isActive = roi.id === activeSavedRoiId;
              return (
                <ViewerWindowManagerItem
                  key={roi.id}
                  type="button"
                  className="roi-manager-list-item"
                  selected={isSelected}
                  active={isActive}
                  onClick={(event) => onSelectRoi(roi.id, event.shiftKey)}
                >
                  <ViewerWindowManagerItemLabel className="roi-manager-list-item-label">
                    {roi.name}
                  </ViewerWindowManagerItemLabel>
                  {isSelected ? (
                    <ViewerWindowManagerBadge
                      className={isActive ? 'roi-manager-selection-badge is-active' : 'roi-manager-selection-badge'}
                      aria-hidden="true"
                    >
                      {selectionIndex + 1}
                    </ViewerWindowManagerBadge>
                  ) : null}
                </ViewerWindowManagerItem>
              );
            })
          ) : (
            <ViewerWindowEmptyState>No saved ROIs.</ViewerWindowEmptyState>
          )}
        </ViewerWindowManagerList>

        <ViewerWindowManagerActions className="roi-manager-actions" ref={actionsRef}>
          <ViewerWindowButton type="button" onClick={onAdd} disabled={!canAdd}>
            Add
          </ViewerWindowButton>
          <ViewerWindowButton type="button" onClick={onDelete} disabled={!hasActiveRoi}>
            Delete
          </ViewerWindowButton>
          <ViewerWindowButton type="button" onClick={onRename} disabled={!hasActiveRoi}>
            Rename
          </ViewerWindowButton>
          <ViewerWindowButton type="button" onClick={onUpdate} disabled={!canUpdate}>
            Update
          </ViewerWindowButton>
          <ViewerWindowButton type="button" onClick={onMeasure} disabled={!canMeasure}>
            Measure
          </ViewerWindowButton>
          <ViewerWindowButton type="button" onClick={onSave} disabled={!canSave}>
            Save
          </ViewerWindowButton>
          <ViewerWindowButton type="button" onClick={onLoad} disabled={!canLoad}>
            Load
          </ViewerWindowButton>
          <ViewerWindowButton
            type="button"
            active={showAllSavedRois}
            aria-pressed={showAllSavedRois}
            onClick={() => onShowAllChange(!showAllSavedRois)}
          >
            Show all
          </ViewerWindowButton>
        </ViewerWindowManagerActions>
      </ViewerWindowManager>
    </FloatingWindow>
  );
}
