import { useEffect, useMemo, useRef, useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { TRACK_COLOR_SWATCHES, normalizeTrackColor, type TrackColorOption } from '../../shared/colorMaps/trackColors';
import type { TrackSetState } from '../../types/channelTracks';
import type { TrackColorMode, TrackDefinition } from '../../types/tracks';

export const DEFAULT_TRACK_OPACITY = 0.9;
export const DEFAULT_TRACK_LINE_WIDTH = 1;

export const createDefaultTrackSetState = (): TrackSetState => ({
  opacity: DEFAULT_TRACK_OPACITY,
  lineWidth: DEFAULT_TRACK_LINE_WIDTH,
  visibility: {},
  colorMode: { type: 'random' }
});

export type TrackSetDescriptor = {
  id: string;
  name: string;
};

export type UseTrackStylingResult = {
  trackSetStates: Record<string, TrackSetState>;
  setTrackSetStates: Dispatch<SetStateAction<Record<string, TrackSetState>>>;
  trackOpacityByTrackSet: Record<string, number>;
  trackLineWidthByTrackSet: Record<string, number>;
  trackColorModesByTrackSet: Record<string, TrackColorMode>;
  ensureTrackIsVisible: (track: TrackDefinition) => void;
  handleTrackOpacityChange: (trackSetId: string, value: number) => void;
  handleTrackLineWidthChange: (trackSetId: string, value: number) => void;
  handleTrackColorSelect: (trackSetId: string, color: string | TrackColorOption) => void;
  handleTrackColorReset: (trackSetId: string) => void;
  resetTrackStyling: () => void;
};

export const useTrackStyling = ({
  trackSets,
  parsedTracksByTrackSet
}: {
  trackSets: TrackSetDescriptor[];
  parsedTracksByTrackSet: Map<string, TrackDefinition[]>;
}): UseTrackStylingResult => {
  const [trackSetStates, setTrackSetStates] = useState<Record<string, TrackSetState>>({});
  const hasInitializedTrackColorsRef = useRef(false);

  useEffect(() => {
    if (trackSets.length === 0) {
      hasInitializedTrackColorsRef.current = false;
    }
  }, [trackSets.length]);

  useEffect(() => {
    if (hasInitializedTrackColorsRef.current) {
      return;
    }

    const setsWithTracks = trackSets.filter((set) => (parsedTracksByTrackSet.get(set.id)?.length ?? 0) > 0);
    if (setsWithTracks.length === 0) {
      return;
    }

    setTrackSetStates((current) => {
      const next: Record<string, TrackSetState> = { ...current };
      let changed = false;

      const ensureState = (trackSetId: string) => {
        const existing = next[trackSetId];
        if (existing) {
          return existing;
        }
        const fallback = createDefaultTrackSetState();
        next[trackSetId] = fallback;
        changed = true;
        return fallback;
      };

      if (setsWithTracks.length === 1) {
        const trackSetId = setsWithTracks[0].id;
        const state = ensureState(trackSetId);
        if (state.colorMode.type !== 'random') {
          next[trackSetId] = { ...state, colorMode: { type: 'random' } };
          changed = true;
        }
      } else {
        setsWithTracks.forEach((set, index) => {
          const state = ensureState(set.id);
          if (index < TRACK_COLOR_SWATCHES.length) {
            const color = normalizeTrackColor(TRACK_COLOR_SWATCHES[index].value);
            if (state.colorMode.type !== 'uniform' || state.colorMode.color !== color) {
              next[set.id] = { ...state, colorMode: { type: 'uniform', color } };
              changed = true;
            }
          } else if (state.colorMode.type !== 'random') {
            next[set.id] = { ...state, colorMode: { type: 'random' } };
            changed = true;
          }
        });
      }

      return changed ? next : current;
    });

    hasInitializedTrackColorsRef.current = true;
  }, [parsedTracksByTrackSet, trackSets]);

  useEffect(() => {
    setTrackSetStates((current) => {
      const next: Record<string, TrackSetState> = {};
      let changed = false;

      for (const set of trackSets) {
        const trackSetId = set.id;
        const existing = current[trackSetId] ?? createDefaultTrackSetState();
        const tracks = parsedTracksByTrackSet.get(trackSetId) ?? [];

        const visibility: Record<string, boolean> = {};
        let visibilityChanged = false;
        for (const track of tracks) {
          const previous = existing.visibility[track.id];
          if (previous === undefined) {
            visibilityChanged = true;
          }
          visibility[track.id] = previous ?? true;
        }

        for (const key of Object.keys(existing.visibility)) {
          if (!(key in visibility)) {
            visibilityChanged = true;
            break;
          }
        }

        let nextState = existing;
        if (visibilityChanged) {
          nextState = { ...nextState, visibility };
        }

        next[trackSetId] = nextState;
        if (!current[trackSetId] || nextState !== existing) {
          changed = true;
        }
      }

      if (Object.keys(current).length !== trackSets.length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [parsedTracksByTrackSet, trackSets]);

  const trackOpacityByTrackSet = useMemo(() => {
    const map: Record<string, number> = {};
    for (const set of trackSets) {
      const state = trackSetStates[set.id] ?? createDefaultTrackSetState();
      map[set.id] = state.opacity;
    }
    return map;
  }, [trackSetStates, trackSets]);

  const trackLineWidthByTrackSet = useMemo(() => {
    const map: Record<string, number> = {};
    for (const set of trackSets) {
      const state = trackSetStates[set.id] ?? createDefaultTrackSetState();
      map[set.id] = state.lineWidth;
    }
    return map;
  }, [trackSetStates, trackSets]);

  const trackColorModesByTrackSet = useMemo(() => {
    const map: Record<string, TrackColorMode> = {};
    for (const set of trackSets) {
      const state = trackSetStates[set.id] ?? createDefaultTrackSetState();
      map[set.id] = state.colorMode;
    }
    return map;
  }, [trackSetStates, trackSets]);

  const ensureTrackIsVisible = useCallback((track: TrackDefinition) => {
    setTrackSetStates((current) => {
      const existing = current[track.trackSetId] ?? createDefaultTrackSetState();
      if (existing.visibility[track.id] ?? true) {
        return current;
      }
      return {
        ...current,
        [track.trackSetId]: {
          ...existing,
          visibility: {
            ...existing.visibility,
            [track.id]: true
          }
        }
      };
    });
  }, []);

  const handleTrackOpacityChange = useCallback((trackSetId: string, value: number) => {
    setTrackSetStates((current) => {
      const existing = current[trackSetId] ?? createDefaultTrackSetState();
      if (existing.opacity === value) {
        return current;
      }
      return {
        ...current,
        [trackSetId]: {
          ...existing,
          opacity: value
        }
      };
    });
  }, []);

  const handleTrackLineWidthChange = useCallback((trackSetId: string, value: number) => {
    setTrackSetStates((current) => {
      const existing = current[trackSetId] ?? createDefaultTrackSetState();
      if (existing.lineWidth === value) {
        return current;
      }
      return {
        ...current,
        [trackSetId]: {
          ...existing,
          lineWidth: value
        }
      };
    });
  }, []);

  const handleTrackColorSelect = useCallback((trackSetId: string, color: string | TrackColorOption) => {
    const normalized = typeof color === 'string' ? normalizeTrackColor(color) : normalizeTrackColor(color.value);
    setTrackSetStates((current) => {
      const existing = current[trackSetId] ?? createDefaultTrackSetState();
      if (existing.colorMode.type === 'uniform' && existing.colorMode.color === normalized) {
        return current;
      }
      return {
        ...current,
        [trackSetId]: {
          ...existing,
          colorMode: { type: 'uniform', color: normalized }
        }
      };
    });
  }, []);

  const handleTrackColorReset = useCallback((trackSetId: string) => {
    setTrackSetStates((current) => {
      const existing = current[trackSetId] ?? createDefaultTrackSetState();
      if (existing.colorMode.type === 'random') {
        return current;
      }
      return {
        ...current,
        [trackSetId]: {
          ...existing,
          colorMode: { type: 'random' }
        }
      };
    });
  }, []);

  const resetTrackStyling = useCallback(() => {
    setTrackSetStates({});
    hasInitializedTrackColorsRef.current = false;
  }, []);

  return {
    trackSetStates,
    setTrackSetStates,
    trackOpacityByTrackSet,
    trackLineWidthByTrackSet,
    trackColorModesByTrackSet,
    ensureTrackIsVisible,
    handleTrackOpacityChange,
    handleTrackLineWidthChange,
    handleTrackColorSelect,
    handleTrackColorReset,
    resetTrackStyling
  };
};

export default useTrackStyling;

