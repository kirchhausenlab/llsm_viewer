import fs from 'node:fs';
import path from 'node:path';

export type DatasetFixture = {
  rootDir: string;
  tiffPaths: string[];
  available: boolean;
  reason: string | null;
};

const TIFF_EXTENSIONS = new Set(['.tif', '.tiff']);

const compareNaturally = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });

export function resolveDatasetFixture(): DatasetFixture {
  const configuredPath = process.env.TEST_DATA_DIR?.trim();
  const rootDir = path.resolve(
    process.cwd(),
    configuredPath && configuredPath.length > 0 ? configuredPath : 'data/test_dataset_0'
  );

  if (!fs.existsSync(rootDir)) {
    return {
      rootDir,
      tiffPaths: [],
      available: false,
      reason: `Dataset directory does not exist: ${rootDir}`
    };
  }

  const tiffPaths = fs
    .readdirSync(rootDir)
    .map((name) => path.join(rootDir, name))
    .filter((candidatePath) => {
      const stats = fs.statSync(candidatePath);
      if (!stats.isFile()) {
        return false;
      }
      const extension = path.extname(candidatePath).toLowerCase();
      return TIFF_EXTENSIONS.has(extension);
    })
    .sort(compareNaturally);

  if (tiffPaths.length === 0) {
    return {
      rootDir,
      tiffPaths: [],
      available: false,
      reason: `No TIFF files were found under ${rootDir}`
    };
  }

  return {
    rootDir,
    tiffPaths,
    available: true,
    reason: null
  };
}
