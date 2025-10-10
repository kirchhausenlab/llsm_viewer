import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool } from 'geotiff';
import { availableParallelism, cpus } from 'node:os';
import { LoadVolumeWorkerPool, LoadVolumeWorkerError } from './workers/loadVolumeWorkerPool.js';

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

const poolSize = Math.max(1, workerCount);
const geotiffWorkerPoolSize = Math.max(1, Math.floor(workerCount / poolSize));
const pool = new Pool(poolSize);
const volumeWorkerPool = new LoadVolumeWorkerPool(poolSize, { geotiffPoolSize: geotiffWorkerPoolSize });
let resourcesDestroyed = false;

function destroyResources() {
  if (resourcesDestroyed) {
    return;
  }
  resourcesDestroyed = true;

  try {
    pool.destroy();
  } catch (error) {
    console.error('Failed to destroy GeoTIFF worker pool', error);
  }

  volumeWorkerPool.destroy().catch((error) => {
    console.error('Failed to destroy volume worker pool', error);
  });
}

process.on('exit', () => {
  destroyResources();
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    destroyResources();
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

function isHidden(name: string) {
  return name.startsWith('.');
}

function hasCsvExtension(name: string) {
  return name.toLowerCase().endsWith('.csv');
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
      if (isHidden(entry.name)) {
        continue;
      }

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

app.post('/api/browse-csv', async (request, response) => {
  const { path: targetPath } = request.body as { path?: string };
  const requestedPath = targetPath && targetPath.trim() ? targetPath : process.cwd();

  try {
    const resolved = sanitizeDirectory(requestedPath);
    const stats = await fs.stat(resolved);

    let directoryPath = resolved;
    let selectedFile: string | null = null;

    if (stats.isDirectory()) {
      directoryPath = resolved;
    } else if (stats.isFile()) {
      if (!hasCsvExtension(resolved)) {
        response.status(400).send('Only CSV files can be selected.');
        return;
      }
      directoryPath = path.dirname(resolved);
      selectedFile = path.basename(resolved);
    } else {
      response.status(400).send('Provided path must be a directory or CSV file.');
      return;
    }

    const entries = await fs.readdir(directoryPath, { withFileTypes: true });
    const directories: string[] = [];
    const csvFiles: string[] = [];

    for (const entry of entries) {
      if (isHidden(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        directories.push(entry.name);
        continue;
      }

      if (entry.isFile() && hasCsvExtension(entry.name)) {
        csvFiles.push(entry.name);
        continue;
      }

      if (entry.isSymbolicLink()) {
        try {
          const linkTarget = await fs.stat(path.join(directoryPath, entry.name));
          if (linkTarget.isDirectory()) {
            directories.push(entry.name);
          } else if (linkTarget.isFile() && hasCsvExtension(entry.name)) {
            csvFiles.push(entry.name);
          }
        } catch (error) {
          console.warn('Failed to resolve symbolic link while browsing for CSV files', {
            directory: directoryPath,
            entry: entry.name,
            error
          });
        }
      }
    }

    directories.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    csvFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    if (selectedFile && !csvFiles.includes(selectedFile)) {
      csvFiles.push(selectedFile);
      csvFiles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }

    const root = path.parse(directoryPath).root;
    const parent = directoryPath === root ? null : path.dirname(directoryPath);

    response.json({
      path: directoryPath,
      parent,
      directories,
      csvFiles,
      selectedFile
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      response.status(404).send('The requested path could not be found.');
      return;
    }
    console.error('Failed to browse for CSV file', error);
    response.status(500).send('Failed to browse for CSV file.');
  }
});

app.post('/api/tracks', async (request, response) => {
  const { path: filePath } = request.body as { path?: string };
  if (!filePath) {
    response.status(400).send('Path is required.');
    return;
  }

  try {
    const resolved = sanitizeDirectory(filePath);
    const stats = await fs.stat(resolved);
    if (!stats.isFile()) {
      response.status(400).send('Provided path is not a file.');
      return;
    }

    if (!hasCsvExtension(resolved)) {
      response.status(400).send('Tracks must be provided as a CSV file.');
      return;
    }

    const contents = await fs.readFile(resolved, 'utf8');
    const lines = contents.split(/\r?\n/);
    const rows: string[][] = [];

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const columns = line.split(',');
      if (columns.length !== 8) {
        response
          .status(400)
          .send('CSV file must contain exactly 8 comma-separated columns per row.');
        return;
      }

      rows.push(columns.map((value) => value.trim()));
    }

    response.json({ rows });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      response.status(404).send('The requested CSV file could not be found.');
      return;
    }
    console.error('Failed to load tracks CSV', error);
    response.status(500).send('Failed to load tracks CSV.');
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

    const { metadata, buffer } = await volumeWorkerPool.schedule(resolvedDir, filename);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Volume-Metadata', JSON.stringify(metadata));
    response.setHeader('Content-Length', buffer.byteLength.toString());
    response.send(buffer);
  } catch (error) {
    if (error instanceof LoadVolumeWorkerError) {
      const status = error.statusCode ?? 500;
      response.status(status).send(error.message);
      return;
    }

    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      response.status(404).send('Requested volume file was not found.');
      return;
    }

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
