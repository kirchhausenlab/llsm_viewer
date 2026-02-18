import fs from 'node:fs';
import path from 'node:path';

const TIFF_EXTENSIONS = new Set(['.tif', '.tiff']);

export type TiffDatasetFixture = {
  rootDir: string;
  tiffPaths: string[];
  available: boolean;
  reason: string | null;
};

const compareNaturally = (left: string, right: string) =>
  left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' });

function resolveConfiguredDatasetPath(): string {
  const configuredPath = process.env.TEST_DATA_DIR?.trim();
  if (!configuredPath) {
    throw new Error(
      'TEST_DATA_DIR must be set to a dataset directory containing TIFF files for deterministic test runs.'
    );
  }
  return configuredPath;
}

export function resolveTiffDatasetFixture(): TiffDatasetFixture {
  const rootDir = path.resolve(process.cwd(), resolveConfiguredDatasetPath());

  if (!fs.existsSync(rootDir)) {
    throw new Error(`Dataset directory does not exist: ${rootDir}`);
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
    throw new Error(`No TIFF files were found under ${rootDir}`);
  }

  return {
    rootDir,
    tiffPaths,
    available: true,
    reason: null
  };
}

export async function createBrowserFilesFromPaths(paths: string[]): Promise<File[]> {
  return Promise.all(
    paths.map(async (filePath) => {
      const bytes = await fs.promises.readFile(filePath);
      return new File([bytes], path.basename(filePath), {
        type: 'image/tiff'
      });
    })
  );
}
