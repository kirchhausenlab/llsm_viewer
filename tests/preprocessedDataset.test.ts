import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import { zipSync, unzipSync } from 'fflate';

import {
  exportPreprocessedDataset,
  importPreprocessedDataset,
  type ChannelExportMetadata,
  type PreprocessedManifest
} from '../src/utils/preprocessedDataset.ts';
import type { LoadedLayer } from '../src/types/layers.ts';
import type { NormalizedVolume } from '../src/volumeProcessing.ts';

describe('preprocessed dataset import/export', () => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  it('exports and imports datasets including streamed archives', async () => {
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
    expect(blob).toBeDefined();
    expect(manifest.dataset.totalVolumeCount).toBe(3);
    expect(manifest.dataset.channels).toHaveLength(1);

    const expectedVolumeEntries: Record<string, Uint8Array> = {
      'volumes/channel-a/structural/timepoint-0000.bin': structuralData,
      'volumes/channel-a/labels/timepoint-0000.bin': segmentationA,
      'volumes/channel-a/labels/timepoint-0001.bin': segmentationB
    };

    const chunkCollector: Uint8Array[] = [];
    const streamedResult = await exportPreprocessedDataset({ layers, channels }, (chunk) => {
      chunkCollector.push(chunk.slice());
    });

    expect(streamedResult.blob).toBeUndefined();
    const alignedStreamedManifest = {
      ...streamedResult.manifest,
      generatedAt: manifest.generatedAt
    } as PreprocessedManifest;
    expect(alignedStreamedManifest).toEqual(manifest);
    expect(chunkCollector.length).toBeGreaterThan(0);

    const streamedSize = chunkCollector.reduce((total, chunk) => total + chunk.byteLength, 0);
    const reconstructed = new Uint8Array(streamedSize);
    let offset = 0;
    for (const chunk of chunkCollector) {
      reconstructed.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const streamedFiles = unzipSync(reconstructed);
    expect(Object.keys(streamedFiles).sort()).toEqual(
      [...Object.keys(expectedVolumeEntries), 'manifest.json'].sort()
    );

    const streamedManifestFromArchive = JSON.parse(
      decoder.decode(streamedFiles['manifest.json'])
    ) as PreprocessedManifest;
    const normalizedStreamedManifestFromArchive = {
      ...streamedManifestFromArchive,
      generatedAt: manifest.generatedAt
    } as PreprocessedManifest;
    expect(normalizedStreamedManifestFromArchive).toEqual(manifest);

    for (const [path, expected] of Object.entries(expectedVolumeEntries)) {
      const entry = streamedFiles[path];
      expect(entry).toBeDefined();
      expect(Array.from(entry!)).toEqual(Array.from(expected));
    }

    const imported = await importPreprocessedDataset(reconstructed);
    expect(imported.totalVolumeCount).toBe(3);
    expect(imported.layers.length).toBe(2);
    expect(imported.channelSummaries.length).toBe(1);
    expect(Array.from(imported.layers[0].volumes[0].normalized)).toEqual(
      Array.from(structuralData)
    );
    expect(Array.from(imported.layers[1].volumes[0].normalized)).toEqual(
      Array.from(segmentationA)
    );
    expect(Array.from(imported.layers[1].volumes[1].normalized)).toEqual(
      Array.from(segmentationB)
    );
    expect(imported.channelSummaries[0].trackEntries).toEqual(channels[0].trackEntries);
  });

  it('honours byte offsets and rejects tampered archives', async () => {
    const payload = new Uint8Array([5, 15, 25, 35, 45, 55, 65, 75]);
    const padded = new Uint8Array(16);
    padded.set(payload, 4);
    const offsetView = new Uint8Array(padded.buffer, 4, payload.length);

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

    const { manifest: offsetManifest } = await exportPreprocessedDataset({
      layers: [offsetLayer],
      channels: [offsetChannel]
    });

    const offsetChunks: Uint8Array[] = [];
    await exportPreprocessedDataset({
      layers: [offsetLayer],
      channels: [offsetChannel]
    }, (chunk) => {
      offsetChunks.push(chunk.slice());
    });

    const offsetSize = offsetChunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const offsetBytes = new Uint8Array(offsetSize);
    let pointer = 0;
    for (const chunk of offsetChunks) {
      offsetBytes.set(chunk, pointer);
      pointer += chunk.byteLength;
    }

    const offsetFiles = unzipSync(offsetBytes);
    const offsetEntryPath = 'volumes/offset-channel/offset-layer/timepoint-0000.bin';
    const offsetEntry = offsetFiles[offsetEntryPath];
    expect(offsetEntry).toBeDefined();
    expect(Array.from(offsetEntry!)).toEqual(Array.from(payload));

    const manifestVolume = offsetManifest.dataset.channels[0].layers[0].volumes[0];
    const expectedDigest = createHash('sha256').update(payload).digest('hex');
    expect(manifestVolume.digest).toBe(expectedDigest);
    expect(manifestVolume.byteLength).toBe(payload.byteLength);

    const baseTamperedFiles = unzipSync(offsetBytes.slice());
    const tamperedManifest = JSON.parse(
      decoder.decode(baseTamperedFiles['manifest.json'])
    ) as PreprocessedManifest;
    tamperedManifest.dataset.channels[0].layers[0].volumes[0].digest = '0'.repeat(64);
    const tamperedManifestBytes = Uint8Array.from(
      encoder.encode(JSON.stringify(tamperedManifest))
    );
    const tamperedFiles: Record<string, Uint8Array> = {
      [offsetEntryPath]: new Uint8Array(offsetFiles[offsetEntryPath] ?? []),
      'manifest.json': tamperedManifestBytes
    };

    const tamperedArchive = zipSync(tamperedFiles);
    const tamperedEntries = unzipSync(tamperedArchive);
    expect(Object.keys(tamperedEntries)).toContain('manifest.json');
    await expect(importPreprocessedDataset(tamperedArchive)).rejects.toThrow(/Digest mismatch/);
  });
});
