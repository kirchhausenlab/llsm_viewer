export type ChannelLayerSource = {
  id: string;
  files: File[];
  isSegmentation: boolean;
};

export type ChannelSource = {
  id: string;
  name: string;
  layers: ChannelLayerSource[];
  trackFile: File | null;
  trackStatus: 'idle' | 'loading' | 'loaded' | 'error';
  trackError: string | null;
  trackEntries: string[][];
};

export type ChannelValidation = {
  errors: string[];
  warnings: string[];
};
