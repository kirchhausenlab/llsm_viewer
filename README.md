# LLSM Viewer (Work in progress)

A high-performance web viewer for 4D (3D + time) lattice light-sheet microscopy datasets. The application loads TIFF volumes and track data directly from the client, decodes them on demand, and presents interactive previews in the browser while a full GPU-powered renderer is developed.

Try it [here](https://kirchhausenlab.github.io/llsm_viewer/)! Recommended on Chromium browsers (Chrome, Edge, Brave).

## Running locally

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
