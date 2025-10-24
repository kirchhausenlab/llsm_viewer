import assert from 'node:assert/strict';

import { detectEnvironmentMode } from '../src/utils/environment.ts';

console.log('Starting environment detection tests');

function makeConnection<T extends Partial<NetworkInformation>>(connection: T): NetworkInformation {
  return connection as NetworkInformation;
}

const lanHostSources = {
  location: { hostname: 'localhost', protocol: 'http:' }
} as const;

try {
  assert.equal(detectEnvironmentMode(lanHostSources), 'lan');

  const ethernetConnection = detectEnvironmentMode({
    location: { hostname: '', protocol: 'file:' },
    navigator: { connection: makeConnection({ type: 'ethernet' }) }
  });
  assert.equal(ethernetConnection, 'lan');

  const wifiConnection = detectEnvironmentMode({
    location: { hostname: '', protocol: 'file:' },
    navigator: { connection: makeConnection({ type: 'wifi' }) }
  });
  assert.equal(wifiConnection, 'lan');

  const effectiveTypeConnection = detectEnvironmentMode({
    location: { hostname: '', protocol: 'file:' },
    navigator: { connection: makeConnection({ effectiveType: '4g' }) }
  });
  assert.equal(effectiveTypeConnection, 'lan');

  const remoteOverWifi = detectEnvironmentMode({
    location: { hostname: 'example.com', protocol: 'https:' },
    navigator: { connection: makeConnection({ type: 'wifi', effectiveType: '4g' }) }
  });
  assert.equal(remoteOverWifi, 'wan');

  const rfc1918 = detectEnvironmentMode({
    location: { hostname: '192.168.1.10', protocol: 'http:' },
    navigator: { connection: makeConnection({ type: 'cellular', effectiveType: '3g' }) }
  });
  assert.equal(rfc1918, 'lan');

  console.log('environment detection tests passed');
} catch (error) {
  console.error('environment detection tests failed');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
}
