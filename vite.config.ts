import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

function normalizeBasePath(basePath: string): string {
  if (basePath === '/') {
    return '/';
  }
  const prefixed = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`;
}

function resolveDeployBasePath(): string {
  const explicit = process.env.DEPLOY_BASE_PATH?.trim();
  if (explicit) {
    return normalizeBasePath(explicit);
  }

  if (process.env.GITHUB_ACTIONS === 'true') {
    const repository = process.env.GITHUB_REPOSITORY?.trim() ?? '';
    const [owner = '', repoName = ''] = repository.split('/');
    if (repoName) {
      if (owner && repoName.toLowerCase() === `${owner.toLowerCase()}.github.io`) {
        return '/';
      }
      return normalizeBasePath(repoName);
    }
  }

  return '/';
}

const deployBasePath = resolveDeployBasePath();

export default defineConfig({
  base: deployBasePath,
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173
  },
  preview: {
    host: '0.0.0.0'
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  worker: {
    format: 'es'
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('/react/') || id.includes('/react-dom/')) {
            return 'vendor-react';
          }
          if (id.includes('/three/')) {
            return 'vendor-three';
          }
          if (id.includes('/geotiff/')) {
            return 'vendor-geotiff';
          }
          if (id.includes('/zarrita/')) {
            return 'vendor-zarr';
          }
          return undefined;
        }
      }
    }
  }
});
