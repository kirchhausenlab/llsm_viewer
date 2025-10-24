export type EnvironmentMode = 'lan' | 'wan';

interface EnvironmentSources {
  location?: Pick<Location, 'hostname' | 'protocol'>;
  navigator?: Pick<Navigator, 'connection'>;
}

const RFC1918_IPV4_PATTERNS = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./
];

const LOOPBACK_IPV4_PATTERN = /^127\./;
const LINK_LOCAL_IPV4_PATTERN = /^169\.254\./;

function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim();
  if (!trimmed) {
    return '';
  }

  // Strip IPv6 brackets and zone identifiers (e.g. "[fe80::1%eth0]").
  const withoutBrackets = trimmed.replace(/^\[/, '').replace(/\]$/, '');
  const [withoutZone] = withoutBrackets.split('%', 1);
  return withoutZone.toLowerCase();
}

function isLanHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (!normalized) {
    return false;
  }

  if (normalized === 'localhost' || normalized === 'localhost.localdomain') {
    return true;
  }

  if (normalized.endsWith('.local')) {
    return true;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
    if (LOOPBACK_IPV4_PATTERN.test(normalized) || LINK_LOCAL_IPV4_PATTERN.test(normalized)) {
      return true;
    }

    return RFC1918_IPV4_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  if (normalized === '::1') {
    return true;
  }

  if (/^fc[0-9a-f]{2}:/i.test(normalized) || /^fd[0-9a-f]{2}:/i.test(normalized)) {
    return true;
  }

  if (/^fe80:/i.test(normalized)) {
    return true;
  }

  return false;
}

const LAN_CONNECTION_TYPES = new Set(['wifi', 'ethernet']);
const LAN_EFFECTIVE_TYPES = new Set(['4g', '5g']);

function connectionIndicatesLan(connection: NetworkInformation): boolean {
  const type = connection.type?.toLowerCase();
  if (type && LAN_CONNECTION_TYPES.has(type)) {
    return true;
  }

  const effectiveType = connection.effectiveType?.toLowerCase();
  if (effectiveType && LAN_EFFECTIVE_TYPES.has(effectiveType)) {
    return true;
  }

  return false;
}

export function detectEnvironmentMode(sources: EnvironmentSources = {}): EnvironmentMode {
  const location =
    sources.location ?? (typeof window !== 'undefined' ? window.location : undefined);
  const navigatorRef =
    sources.navigator ?? (typeof window !== 'undefined' ? window.navigator : undefined);

  const hostname = location?.hostname ?? '';
  const protocol = location?.protocol ?? '';

  if (protocol === 'file:') {
    return 'lan';
  }

  const hostLooksLan = isLanHostname(hostname);
  if (hostLooksLan) {
    return 'lan';
  }

  if (hostname && !hostLooksLan) {
    return 'wan';
  }

  const connection = navigatorRef?.connection as NetworkInformation | undefined;
  if (connection && connectionIndicatesLan(connection)) {
    return 'lan';
  }

  return 'wan';
}
