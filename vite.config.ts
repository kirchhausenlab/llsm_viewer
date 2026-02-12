import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')?.[1];
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const defaultBase = isGitHubActions && repositoryName ? `/${repositoryName}/` : '/';

export default defineConfig({
  base: process.env.DEPLOY_BASE_PATH ?? defaultBase,
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
