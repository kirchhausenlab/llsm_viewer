import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fromArrayBuffer } from 'geotiff';

import {
  createBrowserFilesFromPaths,
  resolveTiffDatasetFixture
} from './helpers/datasetFixture.ts';

const fixture = resolveTiffDatasetFixture();

test('local TIFF fixture discovery reports status', () => {
  assert.equal(typeof fixture.rootDir, 'string');
  assert.equal(fixture.available, true);
  assert.equal(fixture.reason, null);
  assert.ok(fixture.tiffPaths.length >= 1);
});

test('local TIFF fixture decodes first stack successfully', async () => {
  const bytes = await fs.promises.readFile(fixture.tiffPaths[0]!);
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const tiff = await fromArrayBuffer(arrayBuffer);
  const imageCount = await tiff.getImageCount();
  assert.ok(imageCount > 0);

  const firstImage = await tiff.getImage(0);
  assert.ok(firstImage.getWidth() > 0);
  assert.ok(firstImage.getHeight() > 0);
  assert.ok(firstImage.getSamplesPerPixel() >= 1);
});

test('fixture paths can be converted to browser File objects', async () => {
  const files = await createBrowserFilesFromPaths([fixture.tiffPaths[0]!]);
  assert.equal(files.length, 1);
  assert.equal(files[0]?.name.endsWith('.tif') || files[0]?.name.endsWith('.tiff'), true);
});
