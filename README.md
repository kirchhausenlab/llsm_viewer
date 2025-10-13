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

### GitHub Pages deployment

This repository ships with a GitHub Actions workflow that builds the static site and publishes it to GitHub Pages whenever `main` is updated. To finish setting up hosting:

1. Push your changes to GitHub so the `.github/workflows/deploy.yml` workflow is available.
2. In your repository settings, open **Pages** and choose **GitHub Actions** as the deployment source.
3. Trigger a deployment by pushing to `main` or running the workflow manually via **Actions → Deploy static site → Run workflow**.
4. Once the deploy job succeeds, the published URL will appear in the workflow summary and on the **Pages** settings screen.

The workflow automatically infers the correct base path for project sites (e.g., `/username/repository/`). If you publish under a custom path, set a `DEPLOY_BASE_PATH` repository variable to the desired value (for example `/viewer/`).

## Project structure

- `src/` – React front-end implementation.
- `public/` – Static assets served by Vite.
- `PROGRESS.md` – Running log of milestones and upcoming tasks.

## Next steps

- Implement the WebGPU direct-volume renderer with transfer function controls.
- Add preprocessing hooks for downsampling / caching large datasets.
