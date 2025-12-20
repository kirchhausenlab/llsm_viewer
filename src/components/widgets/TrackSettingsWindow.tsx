import type { TrackSettingsProps } from '../viewers/viewer-shell/types';

export default function TrackSettingsWindow({
  isFullTrailEnabled,
  trailLength,
  trailLengthExtent,
  onFullTrailToggle,
  onTrailLengthChange
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
    </div>
  );
}
