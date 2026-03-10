const DEFAULT_PUBLIC_EXPERIMENTS_CATALOG_URL = 'https://mirante4d.s3.us-east-1.amazonaws.com/examples/catalog.json';

function normalizeCatalogUrl(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

export const PUBLIC_EXPERIMENTS_CATALOG_URL =
  normalizeCatalogUrl(import.meta.env.VITE_PUBLIC_EXPERIMENTS_CATALOG_URL) ?? DEFAULT_PUBLIC_EXPERIMENTS_CATALOG_URL;
