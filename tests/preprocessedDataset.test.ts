import assert from 'node:assert/strict';
import * as zarr from 'zarrita';

import { createVolumeProvider } from '../src/core/volumeProvider.ts';
import { createInMemoryPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import { computeUint8VolumeHistogram, encodeUint32ArrayLE } from '../src/shared/utils/histogram.ts';
import { openPreprocessedDatasetFromZarrStorage } from '../src/shared/utils/preprocessedDataset/open.ts';
import type { PreprocessedManifest } from '../src/shared/utils/preprocessedDataset/types.ts';
import { serializeTrackEntriesToCsvBytes } from '../src/shared/utils/preprocessedDataset/tracks.ts';
import { createZarrStoreFromPreprocessedStorage } from '../src/shared/utils/zarrStore.ts';

console.log('Starting preprocessed dataset Zarr v4 tests');

const makeManifest = (): PreprocessedManifest => {
  const width = 2;
  const height = 2;
  const depth = 1;
  const timepoints = 2;

  const segChannels = 4;
  const segDataPath = 'channels/channel-a/seg/data';
  const segLabelsPath = 'channels/channel-a/seg/labels';
  const segHistogramPath = 'channels/channel-a/seg/histogram';

  return {
    format: 'llsm-viewer-preprocessed',
    version: 4,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode: '3d',
      totalVolumeCount: timepoints,
      channels: [
        {
          id: 'channel-a',
          name: 'Channel A',
          tracks: { path: 'tracks/channel-a.csv', format: 'csv', columns: 8, decimalPlaces: 3 },
          layers: [
            {
              key: 'seg',
              label: 'Segmentation',
              channelId: 'channel-a',
              isSegmentation: true,
              volumeCount: timepoints,
              width,
              height,
              depth,
              channels: segChannels,
              dataType: 'uint8',
              normalization: { min: 0, max: 255 },
              zarr: {
                data: {
                  path: segDataPath,
                  shape: [timepoints, depth, height, width, segChannels],
                  chunkShape: [1, depth, height, width, segChannels],
                  dataType: 'uint8'
                },
                labels: {
                  path: segLabelsPath,
                  shape: [timepoints, depth, height, width],
                  chunkShape: [1, depth, height, width],
                  dataType: 'uint32'
                },
                histogram: {
                  path: segHistogramPath,
                  shape: [timepoints, 256],
                  chunkShape: [1, 256],
                  dataType: 'uint32'
                }
              }
            }
          ]
        }
      ],
      voxelResolution: null,
      anisotropyCorrection: null
    }
  };
};

(async () => {
  try {
    const storageHandle = createInMemoryPreprocessedStorage();
    const zarrStore = createZarrStoreFromPreprocessedStorage(storageHandle.storage);

    const manifest = makeManifest();
    await zarr.create(zarr.root(zarrStore), { attributes: { llsmViewerPreprocessed: manifest } });

    const layer = manifest.dataset.channels[0]!.layers[0]!;
    const trackEntries = [
      ['1', '0', '1', '1.123456', '2.100000', '3.987654', '4.000000', '0.000000']
    ];
    await storageHandle.storage.writeFile(
      'tracks/channel-a.csv',
      serializeTrackEntriesToCsvBytes(trackEntries, { decimalPlaces: 3 })
    );
    await zarr.create(zarr.root(zarrStore).resolve(layer.zarr.data.path), {
      shape: layer.zarr.data.shape,
      data_type: layer.zarr.data.dataType,
      chunk_shape: layer.zarr.data.chunkShape,
      codecs: [],
      fill_value: 0
    });
    await zarr.create(zarr.root(zarrStore).resolve(layer.zarr.labels!.path), {
      shape: layer.zarr.labels!.shape,
      data_type: layer.zarr.labels!.dataType,
      chunk_shape: layer.zarr.labels!.chunkShape,
      codecs: [],
      fill_value: 0
    });
    await zarr.create(zarr.root(zarrStore).resolve(layer.zarr.histogram.path), {
      shape: layer.zarr.histogram.shape,
      data_type: layer.zarr.histogram.dataType,
      chunk_shape: layer.zarr.histogram.chunkShape,
      codecs: [],
      fill_value: 0
    });

    const segT0 = new Uint8Array([0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
    const segT1 = new Uint8Array([255, 255, 255, 255, 10, 20, 30, 255, 40, 50, 60, 255, 0, 0, 0, 0]);
    const labelsT0 = new Uint32Array([0, 1, 2, 3]);
    const labelsT1 = new Uint32Array([3, 2, 1, 0]);

    await storageHandle.storage.writeFile(`${layer.zarr.data.path}/c/0/0/0/0/0`, segT0);
    await storageHandle.storage.writeFile(`${layer.zarr.data.path}/c/1/0/0/0/0`, segT1);
    await storageHandle.storage.writeFile(
      `${layer.zarr.labels!.path}/c/0/0/0/0`,
      new Uint8Array(labelsT0.buffer, labelsT0.byteOffset, labelsT0.byteLength)
    );
    await storageHandle.storage.writeFile(
      `${layer.zarr.labels!.path}/c/1/0/0/0`,
      new Uint8Array(labelsT1.buffer, labelsT1.byteOffset, labelsT1.byteLength)
    );

    const histogramT0 = computeUint8VolumeHistogram({
      width: layer.width,
      height: layer.height,
      depth: layer.depth,
      channels: layer.channels,
      normalized: segT0
    });
    const histogramT1 = computeUint8VolumeHistogram({
      width: layer.width,
      height: layer.height,
      depth: layer.depth,
      channels: layer.channels,
      normalized: segT1
    });
    await storageHandle.storage.writeFile(`${layer.zarr.histogram.path}/c/0/0`, encodeUint32ArrayLE(histogramT0));
    await storageHandle.storage.writeFile(`${layer.zarr.histogram.path}/c/1/0`, encodeUint32ArrayLE(histogramT1));

    const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
    assert.equal(opened.manifest.version, 4);
    assert.equal(opened.totalVolumeCount, 2);
    assert.equal(opened.channelSummaries.length, 1);
    assert.deepEqual(opened.channelSummaries[0]?.trackEntries, [['1', '0', '1', '1.123', '2.1', '3.988', '4', '0']]);

    const provider = createVolumeProvider({ manifest: opened.manifest, storage: storageHandle.storage });
    const volume0 = await provider.getVolume('seg', 0);
    assert.deepEqual(Array.from(volume0.normalized), Array.from(segT0));
    assert.deepEqual(Array.from(volume0.segmentationLabels ?? []), Array.from(labelsT0));
    assert.deepEqual(Array.from(volume0.histogram ?? []), Array.from(histogramT0));

    const volume1 = await provider.getVolume('seg', 1);
    assert.deepEqual(Array.from(volume1.normalized), Array.from(segT1));
    assert.deepEqual(Array.from(volume1.segmentationLabels ?? []), Array.from(labelsT1));
    assert.deepEqual(Array.from(volume1.histogram ?? []), Array.from(histogramT1));

    console.log('preprocessed dataset Zarr v4 tests passed');
  } catch (error) {
    console.error('preprocessed dataset Zarr v4 tests failed');
    console.error(error);
    process.exitCode = 1;
  }
})();
