import type { ZarrVolumeSource } from '../data/ZarrVolumeSource';
import type { NormalizedVolume } from '../core/volumeProcessing';

export type LoadedVolume = NormalizedVolume & {
  streamingSource?: ZarrVolumeSource;
  streamingBaseShape?: [number, number, number, number, number];
  streamingBaseChunkShape?: [number, number, number, number, number];
};

export type LoadedLayer = {
  key: string;
  label: string;
  channelId: string;
  volumes: LoadedVolume[];
  isSegmentation: boolean;
};
