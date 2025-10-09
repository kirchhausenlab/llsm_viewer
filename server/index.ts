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

const pool = new Pool({ numWorkers: workerCount });
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

    const floatData = new Float32Array(width * height * imageCount * channels);
    let globalMin = Number.POSITIVE_INFINITY;
    let globalMax = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < imageCount; index++) {
      const image = await tiff.getImage(index);
      if (image.getWidth() !== width || image.getHeight() !== height) {
        response.status(400).send('All slices in a volume must have identical dimensions.');
        return;
      }
      if (image.getSamplesPerPixel() !== channels) {
        response.status(400).send('All slices in a volume must have the same channel count.');
        return;
      }

      const raster = (await image.readRasters({ interleave: true, pool })) as ArrayLike<number>;
      const offset = index * width * height * channels;
      floatData.set(raster, offset);

      for (let i = 0; i < raster.length; i++) {
        const value = raster[i];
        if (value < globalMin) {
          globalMin = value;
        }
        if (value > globalMax) {
          globalMax = value;
        }
      }
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
      dataType: 'float32' as const,
      min: globalMin,
      max: globalMax
    };

    const buffer = Buffer.from(floatData.buffer, floatData.byteOffset, floatData.byteLength);
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
