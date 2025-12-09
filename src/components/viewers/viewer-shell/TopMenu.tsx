import type { TopMenuProps } from './types';

export default function TopMenu({
  onReturnToLauncher,
  onResetLayout,
  helpMenuRef,
  isHelpMenuOpen,
  onHelpMenuToggle,
  followedTrackChannelId,
  followedTrackId,
  onStopTrackFollow,
  hoveredVoxel
}: TopMenuProps) {
  const intensityComponents =
    hoveredVoxel && hoveredVoxel.components.length > 0
      ? hoveredVoxel.components
      : hoveredVoxel
      ? [{ text: hoveredVoxel.intensity, color: null }]
      : [];

  const isTrackFollowActive = followedTrackChannelId !== null && followedTrackId !== null;

  return (
    <div className="viewer-top-menu">
      <div className="viewer-top-menu-row">
        <div className="viewer-top-menu-actions">
          <button type="button" className="viewer-top-menu-button" onClick={onReturnToLauncher}>
            ↩ Return
          </button>
          <button type="button" className="viewer-top-menu-button" onClick={onResetLayout}>
            Reset layout
          </button>
          <div className="viewer-top-menu-help" ref={helpMenuRef}>
            <button
              type="button"
              className="viewer-top-menu-button"
              onClick={onHelpMenuToggle}
              aria-expanded={isHelpMenuOpen}
              aria-controls="viewer-help-popover"
            >
              Help
            </button>
            {isHelpMenuOpen ? (
              <div
                id="viewer-help-popover"
                className="viewer-top-menu-popover"
                role="dialog"
                aria-modal="false"
                aria-labelledby="viewer-help-popover-title"
              >
                <h3 id="viewer-help-popover-title" className="viewer-top-menu-popover-title">
                  Viewer tips
                </h3>
                <div className="viewer-top-menu-popover-section">
                  <h4>3D volume view</h4>
                  <ul>
                    <li>Use WASD with Space/Ctrl to move forward, back, strafe, and rise or descend.</li>
                    <li>Press Q/E to roll the camera counterclockwise/clockwise.</li>
                    <li>Drag to orbit the dataset.</li>
                    <li>
                      Click a track line to select and highlight it. Use the Follow button in the Tracks window to follow that
                      object in time.
                    </li>
                  </ul>
                </div>
                <div className="viewer-top-menu-popover-section">
                  <h4>2D slice view</h4>
                  <ul>
                    <li>Press W/S to step through slices (hold Shift to skip 10 at a time).</li>
                    <li>Drag to pan the slice, and scroll to zoom.</li>
                    <li>Press Q/E to rotate the slice around its center.</li>
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
          {isTrackFollowActive ? (
            <button
              type="button"
              className="viewer-top-menu-button viewer-top-menu-button--danger"
              onClick={() => onStopTrackFollow(followedTrackChannelId ?? undefined)}
            >
              Stop following
            </button>
          ) : null}
        </div>
        <div className="viewer-top-menu-intensity" role="status" aria-live="polite">
          {hoveredVoxel ? (
            <>
              <span className="viewer-top-menu-coordinates">
                ({hoveredVoxel.coordinates.x}, {hoveredVoxel.coordinates.y}, {hoveredVoxel.coordinates.z})
              </span>
              <span className="viewer-top-menu-intensity-value">
                {intensityComponents.map((component, index) => (
                  <span key={`${component.text}-${index}`} className="viewer-top-menu-intensity-part">
                    <span style={component.color ? { color: component.color } : undefined}>{component.text}</span>
                    {index < intensityComponents.length - 1 ? (
                      <span className="viewer-top-menu-intensity-separator" aria-hidden="true">
                        ·
                      </span>
                    ) : null}
                  </span>
                ))}
              </span>
            </>
          ) : (
            <span>—</span>
          )}
        </div>
      </div>
    </div>
  );
}
