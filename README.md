# LLSM Viewer

A high-performance web viewer for 4D (3D + time) lattice light-sheet microscopy datasets. The application loads TIFF volumes and track data directly from the client, decodes them on demand, and presents interactive previews in the browser while a full GPU-powered renderer is developed.

## Getting started

```bash
npm install
npm run dev
```

The development setup runs the Vite front-end (http://localhost:5173).

### Production build

```bash
npm run build
npm run preview
```

## Project structure

- `src/` – React front-end implementation.
- `public/` – Static assets served by Vite.
- `PROGRESS.md` – Running log of milestones and upcoming tasks.

## Next steps

- Implement the WebGPU direct-volume renderer with transfer function controls.
- Add preprocessing hooks for downsampling / caching large datasets.
