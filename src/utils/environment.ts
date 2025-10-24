export type EnvironmentMode = 'external' | 'lan';

const LOCAL_OVERRIDE_KEY = 'llsm-viewer:env-override';

type DetectionResult = {
  mode: EnvironmentMode;
  reason: string;
  overridden: boolean;
};

const RFC1918_PATTERNS = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./
];

const LOOPBACK_PATTERNS = [/^127\./, /^0\.0\.0\.0$/];

function isLikelyLanHost(hostname: string): boolean {
  if (!hostname) {
    return false;
  }
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost') {
    return true;
  }
  if (normalized.endsWith('.local')) {
    return true;
  }
  if (RFC1918_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  if (LOOPBACK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  return false;
}

function getStoredOverride(): EnvironmentMode | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_OVERRIDE_KEY);
    if (!raw) {
      return null;
    }
    if (raw === 'lan' || raw === 'external') {
      return raw;
    }
  } catch (error) {
    console.warn('Failed to read environment override', error);
  }
  return null;
}

export function setEnvironmentOverride(mode: EnvironmentMode | null): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (!mode) {
      window.localStorage.removeItem(LOCAL_OVERRIDE_KEY);
    } else {
      window.localStorage.setItem(LOCAL_OVERRIDE_KEY, mode);
    }
  } catch (error) {
    console.warn('Failed to write environment override', error);
  }
}

export function detectEnvironmentMode(): DetectionResult {
  if (typeof window === 'undefined') {
    return { mode: 'external', reason: 'server', overridden: false };
  }

  const override = getStoredOverride();
  if (override) {
    return { mode: override, reason: 'override', overridden: true };
  }

  const { hostname, protocol } = window.location;
  if (protocol === 'file:') {
    return { mode: 'lan', reason: 'file-protocol', overridden: false };
  }
  if (isLikelyLanHost(hostname)) {
    return { mode: 'lan', reason: 'hostname', overridden: false };
  }

  const connection = (navigator as any)?.connection;
  const effectiveType: string | undefined = connection?.effectiveType;
  if (effectiveType === 'wifi' || effectiveType === 'ethernet') {
    return { mode: 'lan', reason: 'connection', overridden: false };
  }

  return { mode: 'external', reason: 'fallback', overridden: false };
}

export function getEnvironmentMode(): EnvironmentMode {
  return detectEnvironmentMode().mode;
}
