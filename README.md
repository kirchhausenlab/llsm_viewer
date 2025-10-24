# LLSM Viewer

A high-performance web viewer for 4D (3D + time) lattice light-sheet microscopy datasets. The application loads TIFF volumes and track data directly from the client, decodes them on demand, and presents interactive previews in the browser while a full GPU-powered renderer is developed.

## Getting started

```bash
npm install
npm run dev
```

The development setup runs the Vite front-end (http://localhost:5173).
Requests to `/api/collaboration` (including the `/ws` WebSocket endpoint) are
proxied to the collaboration server on http://localhost:8080 so REST calls and
socket upgrades share the browser origin during development. Keep `npm run
collab-server` running in a separate terminal while the Vite dev server is
active.

### Dropbox Chooser configuration

Importing files directly from Dropbox requires a Dropbox app key with the Chooser permission enabled. You can provide the key in
two different ways:

1. **Build-time configuration** – Add a `.env.local` file next to `package.json` that defines `VITE_DROPBOX_APP_KEY=your_app_key`.
   Restart the dev server after editing the environment file.
2. **Runtime prompt** – If no key is bundled, the viewer asks for one the first time you try importing from Dropbox and stores
   it in `localStorage` so you only need to enter it once per browser profile.

This repository embeds the Dropbox app key `1abfsrk62dy855r` so the chooser is ready to use out of the box. You can override it by
setting `VITE_DROPBOX_APP_KEY` at build time or replacing the embedded key in `src/integrations/dropbox.ts`.

If you do not have an app yet, create one in the [Dropbox App Console](https://www.dropbox.com/developers/apps) (Scoped app → Full
Dropbox access) and enable the **Dropbox Chooser** capability.

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
