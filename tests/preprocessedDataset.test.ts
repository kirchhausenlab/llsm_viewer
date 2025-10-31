import assert from 'node:assert/strict';

import { zipSync, unzipSync } from 'fflate';

import {
  exportPreprocessedDataset,
  importPreprocessedDataset,
  type ChannelExportMetadata,
  type PreprocessedManifest
} from '../src/utils/preprocessedDataset.ts';
import type { LoadedLayer } from '../src/types/layers.ts';
import type { NormalizedVolume } from '../src/volumeProcessing.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

console.log('Starting preprocessed dataset import/export tests');

(async () => {
  try {
    const structuralData = new Uint8Array([0, 32, 64, 96, 128, 160, 192, 224]);
    const structuralVolume: NormalizedVolume = {
      width: 4,
      height: 2,
      depth: 1,
      channels: 1,
      dataType: 'uint8',
      normalized: structuralData,
      min: 0,
      max: 255
    };

    const segmentationA = new Uint8Array([0, 0, 0, 0, 255, 128, 64, 255]);
    const segmentationB = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]);
    const segmentationVolumes: NormalizedVolume[] = [
      {
        width: 2,
        height: 2,
        depth: 1,
        channels: 4,
        dataType: 'uint8',
        normalized: segmentationA,
        min: 0,
        max: 1
      },
      {
        width: 2,
        height: 2,
        depth: 1,
        channels: 4,
        dataType: 'uint8',
        normalized: segmentationB,
        min: 0,
        max: 1
      }
    ];

    const layers: LoadedLayer[] = [
      {
        key: 'structural',
        label: 'Structural',
        channelId: 'channel-a',
        volumes: [structuralVolume],
        isSegmentation: false
      },
      {
        key: 'labels',
        label: 'Labels',
        channelId: 'channel-a',
        volumes: segmentationVolumes,
        isSegmentation: true
      }
    ];

    const channels: ChannelExportMetadata[] = [
      {
        id: 'channel-a',
        name: 'Channel A',
        trackEntries: [
          ['track_id', 't', 'x', 'y', 'z'],
          ['track-1', '0', '10', '15', '5']
        ]
      }
    ];

    const { blob, manifest } = await exportPreprocessedDataset({ layers, channels });

    assert.strictEqual(manifest.dataset.totalVolumeCount, 3);
    assert.strictEqual(manifest.dataset.channels.length, 1);
    assert.strictEqual(manifest.dataset.channels[0].layers.length, 2);
    assert.strictEqual(manifest.dataset.channels[0].trackEntries.length, 2);

    const archiveBuffer = await blob.arrayBuffer();
    const imported = await importPreprocessedDataset(archiveBuffer);

    assert.strictEqual(imported.totalVolumeCount, 3);
    assert.strictEqual(imported.layers.length, 2);
    assert.strictEqual(imported.channelSummaries.length, 1);

    const importedStructural = imported.layers[0];
    assert.strictEqual(importedStructural.isSegmentation, false);
    assert.strictEqual(importedStructural.volumes.length, 1);
    assert.deepEqual(
      Array.from(importedStructural.volumes[0].normalized),
      Array.from(structuralData)
    );

    const importedLabels = imported.layers[1];
    assert.strictEqual(importedLabels.isSegmentation, true);
    assert.strictEqual(importedLabels.volumes.length, 2);
    assert.deepEqual(
      Array.from(importedLabels.volumes[0].normalized),
      Array.from(segmentationA)
    );
    assert.deepEqual(
      Array.from(importedLabels.volumes[1].normalized),
      Array.from(segmentationB)
    );

    const summary = imported.channelSummaries[0];
    assert.strictEqual(summary.layers.length, 2);
    assert.strictEqual(summary.layers[0].volumeCount, 1);
    assert.strictEqual(summary.layers[1].volumeCount, 2);
    assert.deepEqual(summary.trackEntries, channels[0].trackEntries);

    const tamperedFiles = unzipSync(new Uint8Array(archiveBuffer));
    const tamperedManifest = JSON.parse(
      decoder.decode(tamperedFiles['manifest.json'])
    ) as PreprocessedManifest;
    tamperedManifest.dataset.channels[0].layers[0].volumes[0].digest = '0'.repeat(64);
    tamperedFiles['manifest.json'] = encoder.encode(JSON.stringify(tamperedManifest));

    const tamperedArchive = zipSync(tamperedFiles);

    await assert.rejects(() => importPreprocessedDataset(tamperedArchive), /Digest mismatch/);

    console.log('preprocessed dataset import/export tests passed');
  } catch (error) {
    console.error('preprocessed dataset import/export tests failed');
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
})();
