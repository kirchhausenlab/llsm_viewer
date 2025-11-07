import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import {
  Uint8ArrayReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter
} from '@zip.js/zip.js';

import {
  exportPreprocessedDataset,
  importPreprocessedDataset,
  type ChannelExportMetadata,
  type PreprocessedManifest
} from '../src/utils/preprocessedDataset/index.ts';
import type { LoadedLayer } from '../src/types/layers.ts';
import type { NormalizedVolume } from '../src/volumeProcessing.ts';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function unzipToMap(data: Uint8Array): Promise<Record<string, Uint8Array>> {
  const reader = new ZipReader(new Uint8ArrayReader(data));
  try {
    const entries = await reader.getEntries();
    const files: Record<string, Uint8Array> = {};
    for (const entry of entries) {
      if (entry.directory) {
        continue;
      }
      const content = await entry.getData(new Uint8ArrayWriter());
      files[entry.filename] = content;
    }
    return files;
  } finally {
    await reader.close();
  }
}

async function zipFromMap(files: Record<string, Uint8Array>): Promise<Uint8Array> {
  const arrayWriter = new Uint8ArrayWriter();
  const writer = new ZipWriter(arrayWriter, { zip64: true });
  let isClosed = false;
  try {
    for (const [path, content] of Object.entries(files)) {
      await writer.add(path, new Uint8ArrayReader(content), { zip64: true });
    }
    const result = (await writer.close(undefined, { zip64: true })) as Uint8Array;
    isClosed = true;
    return result;
  } finally {
    if (!isClosed) {
      await writer.close().catch(() => {
        // Ignore errors when attempting to close an already-failed writer.
      });
    }
  }
}

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

    const exportResult = await exportPreprocessedDataset({ layers, channels });
    const { blob, manifest } = exportResult;

    if (!blob) {
      throw new Error('Expected export without onChunk callback to produce a Blob.');
    }

    assert.strictEqual(manifest.dataset.totalVolumeCount, 3);
    assert.strictEqual(manifest.dataset.channels.length, 1);
    assert.strictEqual(manifest.dataset.channels[0].layers.length, 2);
    assert.strictEqual(manifest.dataset.channels[0].trackEntries.length, 2);

    const archiveBytes = new Uint8Array(await blob.arrayBuffer());
    assert.strictEqual(archiveBytes.byteLength, blob.size);

    const filesInArchive = await unzipToMap(archiveBytes);
    assert.ok(filesInArchive['manifest.json']);
    const manifestFromArchive = JSON.parse(
      decoder.decode(filesInArchive['manifest.json'])
    ) as PreprocessedManifest;
    assert.deepEqual(manifestFromArchive, manifest);

    const expectedVolumeEntries: Record<string, Uint8Array> = {
      'volumes/channel-a/structural/timepoint-0000.bin': structuralData,
      'volumes/channel-a/labels/timepoint-0000.bin': segmentationA,
      'volumes/channel-a/labels/timepoint-0001.bin': segmentationB
    };

    assert.deepEqual(
      Object.keys(filesInArchive).sort(),
      [...Object.keys(expectedVolumeEntries), 'manifest.json'].sort()
    );

    for (const [path, expected] of Object.entries(expectedVolumeEntries)) {
      const entry = filesInArchive[path];
      assert.ok(entry, `missing archive entry for ${path}`);
      assert.deepEqual(Array.from(entry), Array.from(expected));
    }

    const imported = await importPreprocessedDataset(archiveBytes);

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

    const streamedImportProgress: number[] = [];
    const streamedImport = await importPreprocessedDataset(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const chunkSize = 5;
          for (let offset = 0; offset < archiveBytes.byteLength; offset += chunkSize) {
            const end = Math.min(offset + chunkSize, archiveBytes.byteLength);
            controller.enqueue(archiveBytes.subarray(offset, end));
          }
          controller.close();
        }
      }),
      {
        onProgress: (bytesProcessed) => {
          streamedImportProgress.push(bytesProcessed);
        }
      }
    );

    assert.strictEqual(streamedImport.totalVolumeCount, imported.totalVolumeCount);
    assert.deepEqual(streamedImport.channelSummaries, imported.channelSummaries);
    assert.strictEqual(streamedImport.layers.length, imported.layers.length);
    for (let index = 0; index < streamedImport.layers.length; index += 1) {
      const expectedLayer = imported.layers[index];
      const actualLayer = streamedImport.layers[index];
      assert.strictEqual(actualLayer.volumes.length, expectedLayer.volumes.length);
      for (let volumeIndex = 0; volumeIndex < actualLayer.volumes.length; volumeIndex += 1) {
        assert.deepEqual(
          Array.from(actualLayer.volumes[volumeIndex].normalized),
          Array.from(expectedLayer.volumes[volumeIndex].normalized)
        );
      }
    }

    assert.ok(
      streamedImportProgress.length > 0 &&
        streamedImportProgress[streamedImportProgress.length - 1] === archiveBytes.byteLength,
      'expected streaming import to report progress up to the archive size'
    );

    const chunkCollector: Uint8Array[] = [];
    const streamedResult = await exportPreprocessedDataset({ layers, channels }, (chunk) => {
      chunkCollector.push(chunk.slice());
    });

    assert.strictEqual(streamedResult.blob, undefined);
    const alignedStreamedManifest = {
      ...streamedResult.manifest,
      generatedAt: manifest.generatedAt
    } as PreprocessedManifest;
    assert.deepEqual(alignedStreamedManifest, manifest);
    assert.ok(chunkCollector.length > 0, 'expected streamed export to emit chunks');

    const streamedSize = chunkCollector.reduce((total, chunk) => total + chunk.byteLength, 0);
    assert.ok(streamedSize > 0);

    const reconstructed = new Uint8Array(streamedSize);
    let offset = 0;
    for (const chunk of chunkCollector) {
      reconstructed.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const streamedFiles = await unzipToMap(reconstructed);
    assert.deepEqual(
      Object.keys(streamedFiles).sort(),
      [...Object.keys(expectedVolumeEntries), 'manifest.json'].sort()
    );

    const streamedManifestFromArchive = JSON.parse(
      decoder.decode(streamedFiles['manifest.json'])
    ) as PreprocessedManifest;
    const normalizedStreamedManifestFromArchive = {
      ...streamedManifestFromArchive,
      generatedAt: manifest.generatedAt
    } as PreprocessedManifest;
    assert.deepEqual(normalizedStreamedManifestFromArchive, manifest);

    for (const [path, expected] of Object.entries(expectedVolumeEntries)) {
      const entry = streamedFiles[path];
      assert.ok(entry, `missing streamed archive entry for ${path}`);
      assert.deepEqual(Array.from(entry), Array.from(expected));
    }
    const paddedBuffer = new Uint8Array(16);
    const offsetPayload = new Uint8Array([5, 15, 25, 35, 45, 55, 65, 75]);
    paddedBuffer.set(offsetPayload, 4);
    const offsetView = new Uint8Array(paddedBuffer.buffer, 4, offsetPayload.length);

    const offsetLayer: LoadedLayer = {
      key: 'offset-layer',
      label: 'Offset Layer',
      channelId: 'offset-channel',
      volumes: [
        {
          width: 2,
          height: 2,
          depth: 2,
          channels: 1,
          dataType: 'uint8',
          normalized: offsetView,
          min: 0,
          max: 255
        }
      ],
      isSegmentation: false
    };

    const offsetChannel: ChannelExportMetadata = {
      id: 'offset-channel',
      name: 'Offset Channel',
      trackEntries: []
    };

    const { blob: offsetBlob, manifest: offsetManifest } = await exportPreprocessedDataset({
      layers: [offsetLayer],
      channels: [offsetChannel]
    });

    const offsetBytes = new Uint8Array(await offsetBlob.arrayBuffer());
    const offsetFiles = await unzipToMap(offsetBytes);

    const offsetEntryPath = 'volumes/offset-channel/offset-layer/timepoint-0000.bin';
    const offsetEntry = offsetFiles[offsetEntryPath];
    assert.ok(offsetEntry, 'missing archive entry for offset volume');
    assert.deepEqual(Array.from(offsetEntry), Array.from(offsetPayload));

    const manifestVolume = offsetManifest.dataset.channels[0].layers[0].volumes[0];
    const expectedDigest = createHash('sha256').update(offsetPayload).digest('hex');
    assert.strictEqual(manifestVolume.digest, expectedDigest);
    assert.strictEqual(manifestVolume.byteLength, offsetPayload.byteLength);

    const tamperedFiles = await unzipToMap(new Uint8Array(archiveBytes));
    const tamperedManifest = JSON.parse(
      decoder.decode(tamperedFiles['manifest.json'])
    ) as PreprocessedManifest;
    tamperedManifest.dataset.channels[0].layers[0].volumes[0].digest = '0'.repeat(64);
    tamperedFiles['manifest.json'] = encoder.encode(JSON.stringify(tamperedManifest));

    const tamperedArchive = await zipFromMap(tamperedFiles);

    await assert.rejects(() => importPreprocessedDataset(tamperedArchive), /Digest mismatch/);

    console.log('preprocessed dataset import/export tests passed');
  } catch (error) {
    console.error('preprocessed dataset import/export tests failed');
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
})();
