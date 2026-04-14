import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_PUBLIC_EXPERIMENTS_CATALOG_URL,
  resolvePublicExperimentsCatalogUrl
} from '../src/config/publicExperiments.ts';

test('resolvePublicExperimentsCatalogUrl uses the default catalog when no override is configured', () => {
  assert.equal(resolvePublicExperimentsCatalogUrl({}), DEFAULT_PUBLIC_EXPERIMENTS_CATALOG_URL);
});

test('resolvePublicExperimentsCatalogUrl normalizes a valid configured catalog URL', () => {
  assert.equal(
    resolvePublicExperimentsCatalogUrl({
      VITE_PUBLIC_EXPERIMENTS_CATALOG_URL: ' https://example.com/catalogs/main.json/ '
    }),
    'https://example.com/catalogs/main.json'
  );
});

test('resolvePublicExperimentsCatalogUrl rejects invalid configured catalog URLs', () => {
  assert.throws(
    () =>
      resolvePublicExperimentsCatalogUrl({
        VITE_PUBLIC_EXPERIMENTS_CATALOG_URL: '/catalog.json'
      }),
    /Invalid VITE_PUBLIC_EXPERIMENTS_CATALOG_URL/
  );
});
