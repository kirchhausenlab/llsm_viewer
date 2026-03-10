export type PublicExperimentCatalogEntry = {
  id: string;
  label: string;
  description: string;
  baseUrl: string;
  timepoints: number;
  sizeBytes?: number | null;
};

export type PublicExperimentCatalog = {
  version: 1;
  examples: PublicExperimentCatalogEntry[];
};

type FetchLike = typeof fetch;

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid public experiment catalog at ${label}: expected object.`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Invalid public experiment catalog at ${label}: expected string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Invalid public experiment catalog at ${label}: value must not be empty.`);
  }
  return trimmed;
}

function expectPositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.floor(value) !== value || value <= 0) {
    throw new Error(`Invalid public experiment catalog at ${label}: expected positive integer.`);
  }
  return value;
}

function expectOptionalNonNegativeInteger(value: unknown, label: string): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.floor(value) !== value || value < 0) {
    throw new Error(`Invalid public experiment catalog at ${label}: expected non-negative integer.`);
  }
  return value;
}

function normalizeBaseUrl(value: string, label: string): string {
  try {
    const url = new URL(value);
    const normalizedPath = url.pathname.replace(/\/+$/, '');
    url.pathname = normalizedPath;
    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(`Invalid public experiment catalog at ${label}: expected absolute URL.`);
  }
}

export function coercePublicExperimentCatalog(value: unknown): PublicExperimentCatalog {
  const root = expectRecord(value, 'catalog');
  const version = root.version;
  if (version !== 1) {
    throw new Error(`Unsupported public experiment catalog version: ${String(version)}.`);
  }

  const examplesRaw = root.examples;
  if (!Array.isArray(examplesRaw)) {
    throw new Error('Invalid public experiment catalog at catalog.examples: expected array.');
  }

  const seenIds = new Set<string>();
  const examples = examplesRaw.map((entryValue, index) => {
    const entry = expectRecord(entryValue, `catalog.examples[${index}]`);
    const id = expectString(entry.id, `catalog.examples[${index}].id`);
    if (seenIds.has(id)) {
      throw new Error(`Invalid public experiment catalog: duplicate example id "${id}".`);
    }
    seenIds.add(id);

    return {
      id,
      label: expectString(entry.label, `catalog.examples[${index}].label`),
      description: expectString(entry.description, `catalog.examples[${index}].description`),
      baseUrl: normalizeBaseUrl(expectString(entry.baseUrl, `catalog.examples[${index}].baseUrl`), `catalog.examples[${index}].baseUrl`),
      timepoints: expectPositiveInteger(entry.timepoints, `catalog.examples[${index}].timepoints`),
      sizeBytes: expectOptionalNonNegativeInteger(entry.sizeBytes, `catalog.examples[${index}].sizeBytes`)
    } satisfies PublicExperimentCatalogEntry;
  });

  return {
    version: 1,
    examples
  };
}

export async function loadPublicExperimentCatalog({
  catalogUrl,
  fetchImpl,
  signal
}: {
  catalogUrl: string;
  fetchImpl?: FetchLike;
  signal?: AbortSignal | null;
}): Promise<PublicExperimentCatalog> {
  if (typeof (fetchImpl ?? fetch) !== 'function') {
    throw new Error('Fetching public experiments is not supported in this environment.');
  }

  const response = await (fetchImpl ?? fetch)(catalogUrl, {
    method: 'GET',
    signal: signal ?? undefined
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load public experiment catalog (${response.status}${response.statusText ? ` ${response.statusText}` : ''}).`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Failed to parse public experiment catalog JSON.');
  }

  return coercePublicExperimentCatalog(payload);
}
