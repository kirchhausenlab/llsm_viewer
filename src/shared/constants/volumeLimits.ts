// Default to no browser-side volume size limit; use VITE_MAX_VOLUME_BYTES to enforce a cap if desired.
const DEFAULT_MAX_VOLUME_BYTES = Number.POSITIVE_INFINITY;

const parseEnvLimit = (): number | null => {
  const raw = import.meta.env?.VITE_MAX_VOLUME_BYTES;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(`Invalid VITE_MAX_VOLUME_BYTES value "${raw}"; falling back to no volume size limit.`);
    return null;
  }

  return parsed;
};

export const MAX_VOLUME_BYTES = parseEnvLimit() ?? DEFAULT_MAX_VOLUME_BYTES;

export {};
