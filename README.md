# LLSM Viewer

A high-performance web viewer for 4D (3D + time) lattice light-sheet microscopy datasets. The application discovers TIFF volumes stored on the server, decodes them on demand, and presents interactive previews in the browser while a full GPU-powered renderer is developed.

## Getting started

```bash
npm install
npm run dev
```

The development setup runs the Vite front-end (http://localhost:5173) and the Express API server (http://localhost:5174) concurrently.

### Production build

```bash
npm run build
npm run preview
```

## Project structure

- `src/` – React front-end implementation.
- `server/` – Express API that lists datasets and streams TIFF volumes decoded with `geotiff`.
- `PROGRESS.md` – Running log of milestones and upcoming tasks.

## Manual server verification

Use the steps below to confirm that the browse endpoint includes symbolic links that target directories:

1. Create a test directory structure that mixes real folders and symbolic links:

   ```bash
   mkdir -p /tmp/llsm-browse-test/real-dataset
   ln -s /tmp/llsm-browse-test/real-dataset /tmp/llsm-browse-test/link-dataset
   ```

2. Start the development server in a separate terminal with `npm run dev`.

3. Query the browse endpoint for the parent directory and confirm that both `real-dataset` and `link-dataset` are returned:

   ```bash
   curl -s http://localhost:5174/api/browse \
     -H 'Content-Type: application/json' \
     -d '{"path": "/tmp/llsm-browse-test"}' | jq '.directories'
   ```

   The response should list both the physical directory and the symbolic link.

## Next steps

- Implement the WebGPU direct-volume renderer with transfer function controls.
- Add preprocessing hooks for downsampling / caching large datasets.
