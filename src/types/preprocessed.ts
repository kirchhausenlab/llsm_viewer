import type { ImportPreprocessedDatasetResult } from '../utils/preprocessedDataset';

export type StagedPreprocessedExperiment = ImportPreprocessedDatasetResult & {
  sourceName: string | null;
  sourceSize: number | null;
};
