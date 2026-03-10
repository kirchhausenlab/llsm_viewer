import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

function requireEnv(name: string): string {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return raw.trim();
}

function normalizeBasePath(basePath: string): string {
  const prefixed = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return prefixed.endsWith('/') ? prefixed : `${prefixed}/`;
}

const deployBasePath = normalizeBasePath(requireEnv('DEPLOY_BASE_PATH'));

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
