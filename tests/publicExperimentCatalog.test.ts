import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  coercePublicExperimentCatalog,
  loadPublicExperimentCatalog
} from '../src/shared/utils/publicExperimentCatalog.ts';

test('coercePublicExperimentCatalog accepts entries without sizeBytes', () => {
  const catalog = coercePublicExperimentCatalog({
    version: 1,
    examples: [
      {
        id: 'ap2',
        label: 'AP2',
        description: '1 timepoint, 3 channels (raw, PCA, instance segmentation).',
        baseUrl: 'https://mirante4d.s3.us-east-1.amazonaws.com/examples/datasets/ap2.zarr/',
        timepoints: 1
      }
    ]
  });

  assert.equal(catalog.examples.length, 1);
  assert.equal(catalog.examples[0]?.sizeBytes, undefined);
  assert.equal(
    catalog.examples[0]?.baseUrl,
    'https://mirante4d.s3.us-east-1.amazonaws.com/examples/datasets/ap2.zarr'
  );
});

test('loadPublicExperimentCatalog surfaces HTTP failures', async () => {
  await assert.rejects(
    () =>
      loadPublicExperimentCatalog({
        catalogUrl: 'https://example.com/catalog.json',
        fetchImpl: async () => new Response('missing', { status: 404, statusText: 'Not Found' })
      }),
    /Failed to load public experiment catalog \(404 Not Found\)\./
  );
});
