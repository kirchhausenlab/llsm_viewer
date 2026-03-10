const DEFAULT_MAX_VOLUME_BYTES = 5 * 1024 * 1024 * 1024; // 5 GiB

function resolveNumericEnvValue(name: string): number {
  const fromImportMeta = Number((import.meta as { env?: Record<string, unknown> })?.env?.[name] ?? Number.NaN);
  if (Number.isFinite(fromImportMeta)) {
    return fromImportMeta;
  }
  const fromProcessEnv =
    typeof process !== 'undefined' && process?.env ? Number(process.env[name] ?? Number.NaN) : Number.NaN;
  return fromProcessEnv;
}

const configuredMaxVolumeBytes = resolveNumericEnvValue('VITE_MAX_VOLUME_BYTES');
export const MAX_VOLUME_BYTES =
  Number.isFinite(configuredMaxVolumeBytes) && configuredMaxVolumeBytes > 0
    ? Math.max(1, Math.floor(configuredMaxVolumeBytes))
    : DEFAULT_MAX_VOLUME_BYTES;

export {};
