import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import * as zarr from 'zarrita';

import { createInMemoryPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import { openPreprocessedDatasetFromZarrStorage } from '../src/shared/utils/preprocessedDataset/open.ts';
import { createZarrStoreFromPreprocessedStorage } from '../src/shared/utils/zarrStore.ts';

const FIXTURE_DIR = path.resolve(process.cwd(), 'tests/fixtures/preprocessed-schema');

function readFixture(fileName: string): unknown {
  const fixturePath = path.join(FIXTURE_DIR, fileName);
  const payload = fs.readFileSync(fixturePath, 'utf8');
  return JSON.parse(payload) as unknown;
}

async function openDatasetFromFixture(fileName: string) {
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocessed-schema-validation' });
  const zarrStore = createZarrStoreFromPreprocessedStorage(storageHandle.storage);
  const manifest = readFixture(fileName);

  await zarr.create(zarr.root(zarrStore), {
    attributes: {
      llsmViewerPreprocessed: manifest
    }
  });

  return openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
}

async function openDatasetFromManifest(manifest: unknown) {
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocessed-schema-validation-inline' });
  const zarrStore = createZarrStoreFromPreprocessedStorage(storageHandle.storage);

  await zarr.create(zarr.root(zarrStore), {
    attributes: {
      llsmViewerPreprocessed: manifest
    }
  });

  return openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
}

test('openPreprocessedDatasetFromZarrStorage accepts valid non-sharded vNext fixture', async () => {
  const opened = await openDatasetFromFixture('valid-non-sharded.json');
  const baseScale = opened.manifest.dataset.channels[0]?.layers[0]?.zarr.scales[0];
  assert.equal(opened.totalVolumeCount, 2);
  assert.equal(baseScale?.zarr.data.sharding, undefined);
});

test('openPreprocessedDatasetFromZarrStorage accepts valid sharded vNext fixture', async () => {
  const opened = await openDatasetFromFixture('valid-sharded.json');
  const baseScale = opened.manifest.dataset.channels[0]?.layers[0]?.zarr.scales[0];
  assert.equal(opened.totalVolumeCount, 2);
  assert.equal(baseScale?.zarr.data.sharding?.enabled, true);
  assert.equal(baseScale?.zarr.data.sharding?.arrayKind, 'volumeData');
  assert.equal(baseScale?.zarr.data.sharding?.allowTemporalAxis, false);
  assert.deepEqual(baseScale?.zarr.data.sharding?.shardShape, [1, 1, 2, 4, 1]);
});

test('openPreprocessedDatasetFromZarrStorage rejects invalid non-sharded descriptor fixture', async () => {
  await assert.rejects(
    () => openDatasetFromFixture('invalid-non-sharded-data-rank.json'),
    /manifest\.dataset\.channels\[0\]\.layers\[0\]\.zarr\.scales\[0\]\.zarr\.data\.shape/
  );
});

test('openPreprocessedDatasetFromZarrStorage rejects invalid sharded descriptor fixture', async () => {
  await assert.rejects(
    () => openDatasetFromFixture('invalid-sharded-nondivisible-shard-shape.json'),
    /must be divisible by chunkShape\[3\]/
  );
});

test('openPreprocessedDatasetFromZarrStorage accepts segmentation fixtures with labels at every scale', async () => {
  const opened = await openDatasetFromFixture('valid-segmentation-multiscale-labels.json');
  const layer = opened.manifest.dataset.channels[0]?.layers[0];
  assert.equal(layer?.isSegmentation, true);
  assert.equal(layer?.zarr.scales.length, 2);
  for (const scale of layer?.zarr.scales ?? []) {
    assert.ok(scale.zarr.labels);
  }
});

test('openPreprocessedDatasetFromZarrStorage rejects multi-layer channel fixtures', async () => {
  await assert.rejects(
    () => openDatasetFromFixture('valid-multi-layer-volume-count.json'),
    /manifest\.dataset\.channels\[0\]\.layers: expected exactly one layer/
  );
});

test('openPreprocessedDatasetFromZarrStorage rejects segmentation fixtures missing labels for a higher scale', async () => {
  await assert.rejects(
    () => openDatasetFromFixture('invalid-segmentation-missing-label-scale1.json'),
    /segmentation layers require labels for every scale/
  );
});

test('openPreprocessedDatasetFromZarrStorage rejects fixtures with non-contiguous scale levels', async () => {
  await assert.rejects(
    () => openDatasetFromFixture('invalid-noncontiguous-scale-levels.json'),
    /levels must be contiguous/
  );
});

test('openPreprocessedDatasetFromZarrStorage rejects aggregate multi-layer fixtures before volume-count checks', async () => {
  await assert.rejects(
    () => openDatasetFromFixture('invalid-multi-layer-aggregate-volume-count.json'),
    /manifest\.dataset\.channels\[0\]\.layers: expected exactly one layer/
  );
});

test('openPreprocessedDatasetFromZarrStorage rejects fixtures missing spatial resolution metadata', async () => {
  const manifest = readFixture('valid-non-sharded.json') as {
    dataset: Record<string, unknown>;
  };
  delete manifest.dataset.voxelResolution;

  await assert.rejects(
    () => openDatasetFromManifest(manifest),
    /manifest\.dataset\.voxelResolution: expected object/
  );
});

test('openPreprocessedDatasetFromZarrStorage rejects fixtures missing temporal resolution metadata', async () => {
  const manifest = readFixture('valid-non-sharded.json') as {
    dataset: Record<string, unknown>;
  };
  delete manifest.dataset.temporalResolution;

  await assert.rejects(
    () => openDatasetFromManifest(manifest),
    /manifest\.dataset\.temporalResolution: expected object/
  );
});
