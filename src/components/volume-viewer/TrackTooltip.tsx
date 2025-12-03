import type { FunctionComponent } from 'react';

export type TrackTooltipProps = {
  label: string | null;
  position: { x: number; y: number } | null;
};

export const TrackTooltip: FunctionComponent<TrackTooltipProps> = ({ label, position }) => {
  if (!label || !position) {
    return null;
  }

  return (
    <div
      className="track-tooltip"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
      role="status"
      aria-live="polite"
    >
      {label}
    </div>
  );
};
