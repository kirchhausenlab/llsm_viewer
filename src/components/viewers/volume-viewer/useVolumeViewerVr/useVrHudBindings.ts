import { useEffect, useMemo } from 'react';

import type { MutableRefObject } from 'react';

import { DEFAULT_TRACK_LINE_WIDTH, DEFAULT_TRACK_OPACITY } from '../constants';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../../../../shared/colorMaps/layerColors';
import {
  DEFAULT_TRACK_COLOR,
  getTrackColorHex,
  normalizeTrackColor,
} from '../../../../shared/colorMaps/trackColors';
import type { TrackDefinition } from '../../../../types/tracks';
import type { UseVolumeViewerVrParams } from '../useVolumeViewerVr.types';
import type { VrChannelsState, VrTracksState } from '../vr';

type UseVrHudBindingsParams = {
  channelPanels: UseVolumeViewerVrParams['channelPanels'];
  activeChannelPanelId: UseVolumeViewerVrParams['activeChannelPanelId'];
  vrChannelsStateRef: MutableRefObject<VrChannelsState>;
  updateVrChannelsHud: () => void;
  trackChannels: UseVolumeViewerVrParams['trackChannels'];
  tracks: UseVolumeViewerVrParams['tracks'];
  trackVisibility: UseVolumeViewerVrParams['trackVisibility'];
  trackOpacityByChannel: UseVolumeViewerVrParams['trackOpacityByChannel'];
  trackLineWidthByChannel: UseVolumeViewerVrParams['trackLineWidthByChannel'];
  channelTrackColorModes: UseVolumeViewerVrParams['channelTrackColorModes'];
  activeTrackChannelId: UseVolumeViewerVrParams['activeTrackChannelId'];
  followedTrackId: UseVolumeViewerVrParams['followedTrackId'];
  selectedTrackIds: UseVolumeViewerVrParams['selectedTrackIds'];
  vrTracksStateRef: MutableRefObject<VrTracksState>;
  updateVrTracksHud: () => void;
};

function groupTracksByChannel(tracks: TrackDefinition[]) {
  return useMemo(() => {
    const map = new Map<string, TrackDefinition[]>();
    for (const track of tracks) {
      const existing = map.get(track.channelId);
      if (existing) {
        existing.push(track);
      } else {
        map.set(track.channelId, [track]);
      }
    }
    return map;
  }, [tracks]);
}

export function useVrHudBindings({
  channelPanels,
  activeChannelPanelId,
  vrChannelsStateRef,
  updateVrChannelsHud,
  trackChannels,
  tracks,
  trackVisibility,
  trackOpacityByChannel,
  trackLineWidthByChannel,
  channelTrackColorModes,
  activeTrackChannelId,
  followedTrackId,
  selectedTrackIds,
  vrTracksStateRef,
  updateVrTracksHud,
}: UseVrHudBindingsParams) {
  const tracksByChannel = groupTracksByChannel(tracks);

  useEffect(() => {
    const nextChannels = channelPanels.map((panel) => ({
      id: panel.id,
      name: panel.name,
      visible: panel.visible,
      activeLayerKey: panel.activeLayerKey,
      layers: panel.layers.map((layer) => ({
        key: layer.key,
        label: layer.label,
        hasData: layer.hasData,
        isGrayscale: layer.isGrayscale,
        isSegmentation: layer.isSegmentation,
        defaultWindow: layer.defaultWindow,
        histogram: layer.histogram ?? null,
        settings: {
          sliderRange: layer.settings.sliderRange,
          minSliderIndex: layer.settings.minSliderIndex,
          maxSliderIndex: layer.settings.maxSliderIndex,
          brightnessSliderIndex: layer.settings.brightnessSliderIndex,
          contrastSliderIndex: layer.settings.contrastSliderIndex,
          windowMin: layer.settings.windowMin,
          windowMax: layer.settings.windowMax,
          color: normalizeHexColor(layer.settings.color, DEFAULT_LAYER_COLOR),
          xOffset: layer.settings.xOffset,
          yOffset: layer.settings.yOffset,
          renderStyle: layer.settings.renderStyle,
          invert: layer.settings.invert,
          samplingMode: layer.settings.samplingMode ?? 'linear',
        },
      })),
    }));
    vrChannelsStateRef.current = {
      channels: nextChannels,
      activeChannelId: activeChannelPanelId,
    };
    updateVrChannelsHud();
  }, [activeChannelPanelId, channelPanels, updateVrChannelsHud, vrChannelsStateRef]);

  useEffect(() => {
    const previousChannels = new Map(
      vrTracksStateRef.current.channels.map((channel) => [channel.id, channel] as const),
    );
    const nextChannels = trackChannels.map((channel) => {
      const tracksForChannel = tracksByChannel.get(channel.id) ?? [];
      const colorMode = channelTrackColorModes[channel.id] ?? { type: 'random' };
      const opacity = trackOpacityByChannel[channel.id] ?? DEFAULT_TRACK_OPACITY;
      const lineWidth = trackLineWidthByChannel[channel.id] ?? DEFAULT_TRACK_LINE_WIDTH;
      let visibleTracks = 0;
      const trackEntries = tracksForChannel.map((track) => {
        const explicitVisible = trackVisibility[track.id] ?? true;
        const isFollowed = followedTrackId === track.id;
        const isSelected = selectedTrackIds.has(track.id);
        if (explicitVisible || isFollowed || isSelected) {
          visibleTracks += 1;
        }
        const color =
          colorMode.type === 'uniform'
            ? normalizeTrackColor(colorMode.color, DEFAULT_TRACK_COLOR)
            : getTrackColorHex(track.id);
        return {
          id: track.id,
          trackNumber: track.trackNumber,
          label: `Track #${track.displayTrackNumber ?? String(track.trackNumber)}`,
          color,
          explicitVisible,
          visible: isFollowed || explicitVisible || isSelected,
          isFollowed,
          isSelected,
        };
      });
      const followedEntry = trackEntries.find((entry) => entry.isFollowed) ?? null;
      const previous = previousChannels.get(channel.id);
      return {
        id: channel.id,
        name: channel.name,
        opacity,
        lineWidth,
        colorMode,
        totalTracks: tracksForChannel.length,
        visibleTracks,
        followedTrackId: followedEntry ? followedEntry.id : null,
        scrollOffset: Math.min(Math.max(previous?.scrollOffset ?? 0, 0), 1),
        tracks: trackEntries,
      };
    });
    const nextState: VrTracksState = {
      channels: nextChannels,
      activeChannelId: activeTrackChannelId,
    };
    if (
      !nextState.activeChannelId ||
      !nextChannels.some((channel) => channel.id === nextState.activeChannelId)
    ) {
      nextState.activeChannelId = nextChannels[0]?.id ?? null;
    }
    vrTracksStateRef.current = nextState;
    updateVrTracksHud();
  }, [
    activeTrackChannelId,
    channelTrackColorModes,
    trackChannels,
    trackLineWidthByChannel,
    trackOpacityByChannel,
    trackVisibility,
    tracksByChannel,
    followedTrackId,
    selectedTrackIds,
    updateVrTracksHud,
    vrTracksStateRef,
  ]);
}
