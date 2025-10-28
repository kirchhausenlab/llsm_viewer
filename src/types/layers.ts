import type { NormalizedVolume } from '../volumeProcessing';

export type LoadedLayer = {
  key: string;
  label: string;
  channelId: string;
  volumes: NormalizedVolume[];
  isSegmentation: boolean;
};
