import type { TrackSettingsProps } from '../viewers/viewer-shell/types';
import {
  ViewerWindowRow,
  ViewerWindowSlider,
  ViewerWindowStack,
} from '../viewers/viewer-shell/window-ui';

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
    <ViewerWindowStack className="track-settings-window">
      <ViewerWindowRow>
        <label className="control-label control-label--compact" htmlFor="track-full-trail-toggle">
          <input
            id="track-full-trail-toggle"
            type="checkbox"
            checked={isFullTrailEnabled}
            onChange={(event) => onFullTrailToggle(event.target.checked)}
          />
          Full trail
        </label>
        <ViewerWindowSlider
          id="track-trail-length-slider"
          label="Trail length"
          valueLabel={trailLength}
          min={trailLengthExtent.min}
          max={trailLengthExtent.max}
          step={1}
          value={trailLength}
          onChange={(event) => onTrailLengthChange(Number(event.target.value))}
          disabled={isFullTrailEnabled}
        />
      </ViewerWindowRow>
      <ViewerWindowRow className="track-marker-controls" align="center">
        <label className="control-label control-label--compact" htmlFor="track-draw-centroids-toggle">
          <input
            id="track-draw-centroids-toggle"
            type="checkbox"
            checked={drawCentroids}
            onChange={(event) => onDrawCentroidsToggle(event.target.checked)}
          />
          Draw centroids
        </label>
      </ViewerWindowRow>
      <ViewerWindowRow className="track-marker-controls" align="center">
        <label className="control-label control-label--compact" htmlFor="track-draw-starting-points-toggle">
          <input
            id="track-draw-starting-points-toggle"
            type="checkbox"
            checked={drawStartingPoints}
            onChange={(event) => onDrawStartingPointsToggle(event.target.checked)}
          />
          Draw starting points
        </label>
      </ViewerWindowRow>
    </ViewerWindowStack>
  );
}
