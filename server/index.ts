import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { fromFile } from 'geotiff';

const app = express();
const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT ?? '5174', 10);

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

      const raster = (await image.readRasters({ interleave: true })) as ArrayLike<number>;
      const offset = index * width * height * channels;
      for (let i = 0; i < raster.length; i++) {
        floatData[offset + i] = raster[i];
      }
    }

    response.json({
      width,
      height,
      depth: imageCount,
      channels,
      dataType: 'float32',
      data: Buffer.from(floatData.buffer).toString('base64')
    });
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
