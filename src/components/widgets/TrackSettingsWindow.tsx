import type { TrackSettingsProps } from '../viewers/viewer-shell/types';

export default function TrackSettingsWindow({
  isFullTrailEnabled,
  trailLength,
  trailLengthExtent,
  drawCentroids,
  drawStartingPoints,
  onFullTrailToggle,
  onTrailLengthChange,
  onDrawCentroidsToggle,
  onDrawStartingPointsToggle
}: TrackSettingsProps) {
  return (
    <div className="global-controls">
      <div className="control-row">
        <label className="control-label control-label--compact" htmlFor="track-full-trail-toggle">
          <input
            id="track-full-trail-toggle"
            type="checkbox"
            checked={isFullTrailEnabled}
            onChange={(event) => onFullTrailToggle(event.target.checked)}
          />
          Full trail
        </label>
        <div className="control-group control-group--slider">
          <label htmlFor="track-trail-length-slider">
            Trail length <span>{trailLength}</span>
          </label>
          <input
            id="track-trail-length-slider"
            type="range"
            min={trailLengthExtent.min}
            max={trailLengthExtent.max}
            step={1}
            value={trailLength}
            onChange={(event) => onTrailLengthChange(Number(event.target.value))}
            disabled={isFullTrailEnabled}
          />
        </div>
      </div>
      <div className="control-row track-marker-controls">
        <label className="control-label control-label--compact" htmlFor="track-draw-centroids-toggle">
          <input
            id="track-draw-centroids-toggle"
            type="checkbox"
            checked={drawCentroids}
            onChange={(event) => onDrawCentroidsToggle(event.target.checked)}
          />
          Draw centroids
        </label>
      </div>
      <div className="control-row track-marker-controls">
        <label className="control-label control-label--compact" htmlFor="track-draw-starting-points-toggle">
          <input
            id="track-draw-starting-points-toggle"
            type="checkbox"
            checked={drawStartingPoints}
            onChange={(event) => onDrawStartingPointsToggle(event.target.checked)}
          />
          Draw starting points
        </label>
      </div>
    </div>
  );
}
