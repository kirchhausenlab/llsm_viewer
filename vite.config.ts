import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')?.[1];
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const defaultBase = isGitHubActions && repositoryName ? `/${repositoryName}/` : '/';

export default defineConfig({
  base: process.env.DEPLOY_BASE_PATH ?? defaultBase,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: 'tests/setupVitest.ts',
    restoreMocks: true,
    clearMocks: true
  },
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
    emptyOutDir: true
  }
});
