import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import fs from 'node:fs';
import path from 'node:path';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')?.[1];
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
const defaultBase = isGitHubActions && repositoryName ? `/${repositoryName}/` : '/';
const useHttps = process.env.DEV_USE_HTTPS !== 'false';

type HttpsFileConfig = {
  cert: string | Buffer;
  key: string | Buffer;
  ca?: string | Buffer;
  passphrase?: string;
};

const resolveHttpsConfig = (): HttpsFileConfig | null => {
  const certPath = process.env.DEV_HTTPS_CERT_PATH;
  const keyPath = process.env.DEV_HTTPS_KEY_PATH;

  if (!certPath || !keyPath) {
    return null;
  }

  try {
    const cert = fs.readFileSync(certPath);
    const key = fs.readFileSync(keyPath);
    const caPath = process.env.DEV_HTTPS_CA_PATH;
    const ca = caPath ? fs.readFileSync(caPath) : undefined;
    const passphrase = process.env.DEV_HTTPS_PASSPHRASE || undefined;

    return { cert, key, ca, passphrase };
  } catch (error) {
    console.warn(
      '[vite] Failed to load HTTPS credentials from DEV_HTTPS_CERT_PATH / DEV_HTTPS_KEY_PATH. Falling back to the default self-signed certificate.',
      error
    );
    return null;
  }
};

const customHttpsConfig = useHttps ? resolveHttpsConfig() : null;

const plugins = [react()];
if (useHttps && !customHttpsConfig) {
  plugins.push(basicSsl());
}

const httpsOption = useHttps ? customHttpsConfig ?? true : false;

export default defineConfig({
  base: process.env.DEPLOY_BASE_PATH ?? defaultBase,
  plugins,
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: httpsOption,
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
    https: httpsOption
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
