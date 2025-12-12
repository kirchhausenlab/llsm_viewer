import type { AnisotropyScaleFactors, VoxelResolutionValues } from './voxelResolution';

export type DatasetMovieMode = '2d' | '3d';

export type DatasetZarrStoreDescriptor =
  | { source: 'archive'; root?: string | null }
  | { source: 'url'; url: string; root?: string | null }
  | { source: 'local'; root?: string | null; name?: string | null }
  | { source: 'opfs'; root?: string | null; name?: string | null };

export type DatasetMetadata = {
  movieMode: DatasetMovieMode;
  voxelResolution?: VoxelResolutionValues | null;
  anisotropyCorrection?: { scale: AnisotropyScaleFactors } | null;
  zarrStore?: DatasetZarrStoreDescriptor | null;
};
