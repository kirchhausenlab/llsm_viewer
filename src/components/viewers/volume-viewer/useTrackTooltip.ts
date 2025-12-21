import { useMemo } from 'react';

import type { TrackDefinition } from '../../../types/tracks';

export type UseTrackTooltipParams = {
  hoveredTrackId: string | null;
  trackLookup: Map<string, TrackDefinition>;
};

export function useTrackTooltip({ hoveredTrackId, trackLookup }: UseTrackTooltipParams) {
  const hoveredTrackDefinition = useMemo(
    () => (hoveredTrackId ? trackLookup.get(hoveredTrackId) ?? null : null),
    [hoveredTrackId, trackLookup],
  );

  const hoveredTrackLabel = useMemo(() => {
    if (!hoveredTrackDefinition) {
      return null;
    }
    const trackNumber = hoveredTrackDefinition.displayTrackNumber ?? String(hoveredTrackDefinition.trackNumber);
    return `${hoveredTrackDefinition.trackSetName} · Track #${trackNumber}`;
  }, [hoveredTrackDefinition]);

  return { hoveredTrackDefinition, hoveredTrackLabel };
}
