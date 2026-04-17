export const DEFAULT_PUBLIC_EXPERIMENTS_CATALOG_URL =
  'https://mirante4d.s3.us-east-1.amazonaws.com/examples/catalog.json';

function normalizeCatalogUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function resolvePublicExperimentsCatalogUrl(env: Record<string, unknown> = import.meta.env): string {
  const configuredValue = env.VITE_PUBLIC_EXPERIMENTS_CATALOG_URL;
  if (configuredValue === undefined) {
    return DEFAULT_PUBLIC_EXPERIMENTS_CATALOG_URL;
  }
  const normalized = normalizeCatalogUrl(configuredValue);
  if (!normalized) {
    throw new Error('Invalid VITE_PUBLIC_EXPERIMENTS_CATALOG_URL: expected a non-empty absolute URL.');
  }
  return normalized;
}
