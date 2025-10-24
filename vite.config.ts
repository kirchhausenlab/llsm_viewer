import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import path from 'node:path';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')?.[1];
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const defaultBase = isGitHubActions && repositoryName ? `/${repositoryName}/` : '/';
const useHttps = process.env.DEV_USE_HTTPS !== 'false';

const plugins = [react()];
if (useHttps) {
  plugins.push(basicSsl());
}

export default defineConfig({
  base: process.env.DEPLOY_BASE_PATH ?? defaultBase,
  plugins,
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: useHttps,
    proxy: {
      '/api/collaboration': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    https: useHttps
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
    emptyOutDir: true
  }
});
