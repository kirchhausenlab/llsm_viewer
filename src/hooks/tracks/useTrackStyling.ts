import { useEffect, useMemo, useRef, useState, useCallback, type Dispatch, type SetStateAction } from 'react';
import { TRACK_COLOR_SWATCHES, normalizeTrackColor, type TrackColorOption } from '../../shared/colorMaps/trackColors';
import type { ChannelTrackState } from '../../types/channelTracks';
import type { TrackColorMode, TrackDefinition } from '../../types/tracks';
import type { ChannelSource } from '../dataset';

export const DEFAULT_TRACK_OPACITY = 0.9;
export const DEFAULT_TRACK_LINE_WIDTH = 1;

export const createDefaultChannelTrackState = (): ChannelTrackState => ({
  opacity: DEFAULT_TRACK_OPACITY,
  lineWidth: DEFAULT_TRACK_LINE_WIDTH,
  visibility: {},
  colorMode: { type: 'random' }
});

export type UseTrackStylingResult = {
  channelTrackStates: Record<string, ChannelTrackState>;
  setChannelTrackStates: Dispatch<SetStateAction<Record<string, ChannelTrackState>>>;
  trackOpacityByChannel: Record<string, number>;
  trackLineWidthByChannel: Record<string, number>;
  channelTrackColorModes: Record<string, TrackColorMode>;
  ensureTrackIsVisible: (track: TrackDefinition) => void;
  handleTrackOpacityChange: (channelId: string, value: number) => void;
  handleTrackLineWidthChange: (channelId: string, value: number) => void;
  handleTrackColorSelect: (channelId: string, color: string | TrackColorOption) => void;
  handleTrackColorReset: (channelId: string) => void;
  resetTrackStyling: () => void;
};

export const useTrackStyling = ({
  channels,
  parsedTracksByChannel
}: {
  channels: ChannelSource[];
  parsedTracksByChannel: Map<string, TrackDefinition[]>;
}): UseTrackStylingResult => {
  const [channelTrackStates, setChannelTrackStates] = useState<Record<string, ChannelTrackState>>({});
  const hasInitializedTrackColorsRef = useRef(false);

  useEffect(() => {
    if (channels.length === 0) {
      hasInitializedTrackColorsRef.current = false;
    }
  }, [channels.length]);

  useEffect(() => {
    if (hasInitializedTrackColorsRef.current) {
      return;
    }

    const channelsWithTracks = channels.filter(
      (channel) => (parsedTracksByChannel.get(channel.id)?.length ?? 0) > 0
    );

    if (channelsWithTracks.length === 0) {
      return;
    }

    setChannelTrackStates((current) => {
      const next: Record<string, ChannelTrackState> = { ...current };
      let changed = false;

      const ensureState = (channelId: string) => {
        const existing = next[channelId];
        if (existing) {
          return existing;
        }
        const fallback = createDefaultChannelTrackState();
        next[channelId] = fallback;
        changed = true;
        return fallback;
      };

      if (channelsWithTracks.length === 1) {
        const channelId = channelsWithTracks[0].id;
        const state = ensureState(channelId);
        if (state.colorMode.type !== 'random') {
          next[channelId] = { ...state, colorMode: { type: 'random' } };
          changed = true;
        }
      } else {
        channelsWithTracks.forEach((channel, index) => {
          const state = ensureState(channel.id);
          if (index < TRACK_COLOR_SWATCHES.length) {
            const color = normalizeTrackColor(TRACK_COLOR_SWATCHES[index].value);
            if (state.colorMode.type !== 'uniform' || state.colorMode.color !== color) {
              next[channel.id] = { ...state, colorMode: { type: 'uniform', color } };
              changed = true;
            }
          } else if (state.colorMode.type !== 'random') {
            next[channel.id] = { ...state, colorMode: { type: 'random' } };
            changed = true;
          }
        });
      }

      return changed ? next : current;
    });

    hasInitializedTrackColorsRef.current = true;
  }, [channels, parsedTracksByChannel]);

  useEffect(() => {
    setChannelTrackStates((current) => {
      const next: Record<string, ChannelTrackState> = {};
      let changed = false;

      for (const channel of channels) {
        const channelId = channel.id;
        const existing = current[channelId] ?? createDefaultChannelTrackState();
        const tracks = parsedTracksByChannel.get(channelId) ?? [];

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

        next[channelId] = nextState;
        if (!current[channelId] || nextState !== existing) {
          changed = true;
        }
      }

      if (Object.keys(current).length !== channels.length) {
        changed = true;
      }

      return changed ? next : current;
    });
  }, [channels, parsedTracksByChannel]);

  const trackOpacityByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.opacity;
    }
    return map;
  }, [channelTrackStates, channels]);

  const trackLineWidthByChannel = useMemo(() => {
    const map: Record<string, number> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.lineWidth;
    }
    return map;
  }, [channelTrackStates, channels]);

  const channelTrackColorModes = useMemo(() => {
    const map: Record<string, TrackColorMode> = {};
    for (const channel of channels) {
      const state = channelTrackStates[channel.id] ?? createDefaultChannelTrackState();
      map[channel.id] = state.colorMode;
    }
    return map;
  }, [channelTrackStates, channels]);

  const ensureTrackIsVisible = useCallback((track: TrackDefinition) => {
    setChannelTrackStates((current) => {
      const existing = current[track.channelId] ?? createDefaultChannelTrackState();
      if (existing.visibility[track.id] ?? true) {
        return current;
      }
      return {
        ...current,
        [track.channelId]: {
          ...existing,
          visibility: {
            ...existing.visibility,
            [track.id]: true
          }
        }
      };
    });
  }, []);

  const handleTrackOpacityChange = useCallback((channelId: string, value: number) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.opacity === value) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          opacity: value
        }
      };
    });
  }, []);

  const handleTrackLineWidthChange = useCallback((channelId: string, value: number) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.lineWidth === value) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          lineWidth: value
        }
      };
    });
  }, []);

  const handleTrackColorSelect = useCallback((channelId: string, color: string | TrackColorOption) => {
    const normalized = typeof color === 'string' ? normalizeTrackColor(color) : normalizeTrackColor(color.value);
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.colorMode.type === 'uniform' && existing.colorMode.color === normalized) {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          colorMode: { type: 'uniform', color: normalized }
        }
      };
    });
  }, []);

  const handleTrackColorReset = useCallback((channelId: string) => {
    setChannelTrackStates((current) => {
      const existing = current[channelId] ?? createDefaultChannelTrackState();
      if (existing.colorMode.type === 'random') {
        return current;
      }
      return {
        ...current,
        [channelId]: {
          ...existing,
          colorMode: { type: 'random' }
        }
      };
    });
  }, []);

  const resetTrackStyling = useCallback(() => {
    setChannelTrackStates({});
    hasInitializedTrackColorsRef.current = false;
  }, []);

  return {
    channelTrackStates,
    setChannelTrackStates,
    trackOpacityByChannel,
    trackLineWidthByChannel,
    channelTrackColorModes,
    ensureTrackIsVisible,
    handleTrackOpacityChange,
    handleTrackLineWidthChange,
    handleTrackColorSelect,
    handleTrackColorReset,
    resetTrackStyling
  };
};

export default useTrackStyling;
