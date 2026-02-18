import { defineConfig, devices } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYWRIGHT_ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '.env.playwright');

function loadRequiredEnvFile(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(`Missing required Playwright env file at ${path}.`);
  }

  const lines = raw.split(/\r?\n/u);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const original = lines[lineIndex] ?? '';
    const line = original.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    const separator = line.indexOf('=');
    if (separator <= 0) {
      throw new Error(`Invalid env assignment in ${path}:${lineIndex + 1}.`);
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[A-Z0-9_]+$/u.test(key)) {
      throw new Error(`Invalid env key "${key}" in ${path}:${lineIndex + 1}.`);
    }
    if (value.length === 0) {
      throw new Error(`Empty env value for "${key}" in ${path}:${lineIndex + 1}.`);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadRequiredEnvFile(PLAYWRIGHT_ENV_FILE);

function requireEnv(name: string): string {
  const raw = process.env[name];
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return raw.trim();
}

function parsePositiveInteger(raw: string, name: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, received "${raw}".`);
  }
  return parsed;
}

function parseNonNegativeInteger(raw: string, name: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer, received "${raw}".`);
  }
  return parsed;
}

const HOST = requireEnv('PLAYWRIGHT_HOST');
const PORT = parsePositiveInteger(requireEnv('PLAYWRIGHT_PORT'), 'PLAYWRIGHT_PORT');
const BASE_URL = requireEnv('PLAYWRIGHT_BASE_URL');
const RETRIES = parseNonNegativeInteger(requireEnv('PLAYWRIGHT_RETRIES'), 'PLAYWRIGHT_RETRIES');
const WORKERS = parsePositiveInteger(requireEnv('PLAYWRIGHT_WORKERS'), 'PLAYWRIGHT_WORKERS');

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 3 * 60_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.01
    }
  },
  fullyParallel: false,
  retries: RETRIES,
  workers: WORKERS,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: {
    command: `npm run dev -- --host ${HOST} --port ${PORT}`,
    url: BASE_URL,
    timeout: 120_000,
    reuseExistingServer: true
  }
});
