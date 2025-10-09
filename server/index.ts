import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fromFile, Pool } from 'geotiff';
import { availableParallelism, cpus } from 'node:os';

const app = express();
const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT ?? '5174', 10);

const workerCount = (() => {
  if (typeof availableParallelism === 'function') {
    try {
      const cores = availableParallelism();
      if (Number.isFinite(cores) && cores > 0) {
        return cores;
      }
    } catch {
      // Fallback to cpus below.
    }
  }
  const cpuInfo = cpus();
  return cpuInfo && cpuInfo.length > 0 ? cpuInfo.length : 1;
})();

const pool = new Pool(Math.max(1, workerCount));
let poolDestroyed = false;

function destroyPool() {
  if (!poolDestroyed) {
    pool.destroy();
    poolDestroyed = true;
  }
}

process.on('exit', () => {
  destroyPool();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    destroyPool();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

app.use(cors());
app.use(
  express.json({
    limit: '256mb'
  })
);

function sanitizeDirectory(inputPath: string) {
  const resolved = path.resolve(inputPath);
  return resolved;
}

app.post('/api/list', async (request, response) => {
  const { path: directoryPath } = request.body as { path?: string };
  if (!directoryPath) {
    response.status(400).send('Path is required.');
    return;
  }

  try {
    const resolved = sanitizeDirectory(directoryPath);
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      response.status(400).send('Provided path is not a directory.');
      return;
    }

    const entries = await fs.readdir(resolved);
    const files = entries
      .filter((entry) => entry.toLowerCase().endsWith('.tif') || entry.toLowerCase().endsWith('.tiff'))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    response.json({ files });
  } catch (error) {
    console.error('Failed to list directory', error);
    response.status(500).send('Failed to list directory.');
  }
});

app.post('/api/browse', async (request, response) => {
  const { path: directoryPath } = request.body as { path?: string };
  const targetPath = directoryPath && directoryPath.trim() ? directoryPath : process.cwd();

  try {
    const resolved = sanitizeDirectory(targetPath);
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      response.status(400).send('Provided path is not a directory.');
      return;
    }

    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const directories: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        directories.push(entry.name);
        continue;
      }

      if (entry.isSymbolicLink()) {
        try {
          const linkTarget = await fs.stat(path.join(resolved, entry.name));
          if (linkTarget.isDirectory()) {
            directories.push(entry.name);
          }
        } catch (error) {
          console.warn('Failed to resolve symbolic link while browsing directory', {
            directory: resolved,
            entry: entry.name,
            error
          });
        }
      }
    }

    directories.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    const root = path.parse(resolved).root;
    const parent = resolved === root ? null : path.dirname(resolved);

    response.json({
      path: resolved,
      parent,
      directories
    });
  } catch (error) {
    console.error('Failed to browse directory', error);
    response.status(500).send('Failed to browse directory.');
  }
});

app.post('/api/volume', async (request, response) => {
  const { path: directoryPath, filename } = request.body as { path?: string; filename?: string };
  if (!directoryPath || !filename) {
    response.status(400).send('Path and filename are required.');
    return;
  }

  try {
    const resolvedDir = sanitizeDirectory(directoryPath);
    const resolvedFile = path.resolve(resolvedDir, filename);
    const relative = path.relative(resolvedDir, resolvedFile);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      response.status(400).send('Requested file is outside the dataset directory.');
      return;
    }

    const fileStats = await fs.stat(resolvedFile);
    if (!fileStats.isFile()) {
      response.status(404).send('Requested volume file was not found.');
      return;
    }

    const tiff = await fromFile(resolvedFile);
    const imageCount = await tiff.getImageCount();
    if (imageCount === 0) {
      response.status(400).send('TIFF file does not contain any images.');
      return;
    }

    const firstImage = await tiff.getImage(0);
    const width = firstImage.getWidth();
    const height = firstImage.getHeight();
    const channels = firstImage.getSamplesPerPixel();

    const sliceLength = width * height * channels;
    const totalValues = sliceLength * imageCount;

    const firstRasterRaw = (await firstImage.readRasters({ interleave: true, pool })) as unknown;
    if (!ArrayBuffer.isView(firstRasterRaw)) {
      response.status(500).send('Volume rasters must be typed arrays.');
      return;
    }

    type SupportedTypedArray = Uint8Array | Uint16Array | Float32Array;
    type VolumeDataType = 'uint8' | 'uint16' | 'float32';

    let dataType: VolumeDataType;
    let combinedData: SupportedTypedArray;
    let firstRaster: SupportedTypedArray;

    if (firstRasterRaw instanceof Uint8Array) {
      dataType = 'uint8';
      combinedData = new Uint8Array(totalValues);
      firstRaster = firstRasterRaw;
    } else if (firstRasterRaw instanceof Uint16Array) {
      dataType = 'uint16';
      combinedData = new Uint16Array(totalValues);
      firstRaster = firstRasterRaw;
    } else if (firstRasterRaw instanceof Float32Array) {
      dataType = 'float32';
      combinedData = new Float32Array(totalValues);
      firstRaster = firstRasterRaw;
    } else {
      response.status(415).send('Unsupported raster data type.');
      return;
    }

    if (firstRaster.length !== sliceLength) {
      response.status(500).send('Unexpected raster length for first slice.');
      return;
    }

    let globalMin = Number.POSITIVE_INFINITY;
    let globalMax = Number.NEGATIVE_INFINITY;

    const copySlice = (source: SupportedTypedArray, offset: number) => {
      for (let i = 0; i < source.length; i++) {
        const value = source[i];
        if (value < globalMin) {
          globalMin = value;
        }
        if (value > globalMax) {
          globalMax = value;
        }
        combinedData[offset + i] = value;
      }
    };

    copySlice(firstRaster, 0);

    for (let index = 1; index < imageCount; index++) {
      const image = await tiff.getImage(index);
      if (image.getWidth() !== width || image.getHeight() !== height) {
        response.status(400).send('All slices in a volume must have identical dimensions.');
        return;
      }
      if (image.getSamplesPerPixel() !== channels) {
        response.status(400).send('All slices in a volume must have the same channel count.');
        return;
      }

      const rasterRaw = (await image.readRasters({ interleave: true, pool })) as unknown;
      if (!ArrayBuffer.isView(rasterRaw)) {
        response.status(500).send('Volume rasters must be typed arrays.');
        return;
      }

      let raster: SupportedTypedArray;
      switch (dataType) {
        case 'uint8':
          if (!(rasterRaw instanceof Uint8Array)) {
            response.status(400).send('All slices in a volume must use the same sample type.');
            return;
          }
          raster = rasterRaw;
          break;
        case 'uint16':
          if (!(rasterRaw instanceof Uint16Array)) {
            response.status(400).send('All slices in a volume must use the same sample type.');
            return;
          }
          raster = rasterRaw;
          break;
        case 'float32':
          if (!(rasterRaw instanceof Float32Array)) {
            response.status(400).send('All slices in a volume must use the same sample type.');
            return;
          }
          raster = rasterRaw;
          break;
        default:
          response.status(500).send('Unsupported raster data type.');
          return;
      }

      if (raster.length !== sliceLength) {
        response.status(500).send('Unexpected raster length for slice.');
        return;
      }

      const offset = index * sliceLength;
      copySlice(raster, offset);
    }

    if (!Number.isFinite(globalMin) || globalMin === Number.POSITIVE_INFINITY) {
      globalMin = 0;
    }
    if (!Number.isFinite(globalMax) || globalMax === Number.NEGATIVE_INFINITY) {
      globalMax = 1;
    }
    if (globalMin === globalMax) {
      globalMax = globalMin + 1;
    }

    const metadata = {
      width,
      height,
      depth: imageCount,
      channels,
      dataType,
      min: globalMin,
      max: globalMax
    };

    const buffer = Buffer.from(combinedData.buffer, combinedData.byteOffset, combinedData.byteLength);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Volume-Metadata', JSON.stringify(metadata));
    response.setHeader('Content-Length', buffer.byteLength.toString());
    response.send(buffer);
  } catch (error) {
    console.error('Failed to load TIFF volume', error);
    response.status(500).send('Failed to load TIFF volume.');
  }
});

if (process.env.NODE_ENV === 'production') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const clientDir = path.resolve(__dirname, '../client');
  app.use(express.static(clientDir));
  app.get('*', (_request, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.listen(PORT, HOST, () => {
  const hostname = HOST === '0.0.0.0' ? 'localhost' : HOST;
  console.log(`LLSM viewer API listening on http://${hostname}:${PORT} (bound to ${HOST})`);
});
