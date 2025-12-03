const DEFAULT_MAX_VOLUME_BYTES = 512 * 1024 * 1024; // 512 MiB

const parseEnvLimit = (): number | null => {
  const raw = import.meta.env?.VITE_MAX_VOLUME_BYTES;
  if (typeof raw !== 'string' || raw.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.warn(
      `Invalid VITE_MAX_VOLUME_BYTES value "${raw}"; falling back to default of ${DEFAULT_MAX_VOLUME_BYTES}.`
    );
    return null;
  }

  return parsed;
};

export const MAX_VOLUME_BYTES = parseEnvLimit() ?? DEFAULT_MAX_VOLUME_BYTES;

export {};
