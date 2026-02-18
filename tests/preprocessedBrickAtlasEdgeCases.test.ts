import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as zarr from 'zarrita';

import {
  createVolumeProvider,
  DEFAULT_MAX_CACHED_CHUNK_BYTES,
  DEFAULT_MAX_CONCURRENT_CHUNK_READS,
  DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
} from '../src/core/volumeProvider.ts';
import { createInMemoryPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import { computeUint8VolumeHistogram, encodeUint32ArrayLE } from '../src/shared/utils/histogram.ts';
import { openPreprocessedDatasetFromZarrStorage } from '../src/shared/utils/preprocessedDataset/open.ts';
import { PREPROCESSED_DATASET_FORMAT, type PreprocessedManifest } from '../src/shared/utils/preprocessedDataset/types.ts';
import { createZarrStoreFromPreprocessedStorage } from '../src/shared/utils/zarrStore.ts';

const WIDTH = 3;
const HEIGHT = 2;
const DEPTH = 3;
const CHANNELS = 3;
const TIMEPOINTS = 3;

function buildManifest(): PreprocessedManifest {
  const dataPath = 'channels/channel-edge/layer-edge/scales/0/data';
  const histogramPath = 'channels/channel-edge/layer-edge/scales/0/histogram';
  const chunkMinPath = 'channels/channel-edge/layer-edge/scales/0/chunk-stats/min';
  const chunkMaxPath = 'channels/channel-edge/layer-edge/scales/0/chunk-stats/max';
  const chunkOccPath = 'channels/channel-edge/layer-edge/scales/0/chunk-stats/occupancy';

  return {
    format: PREPROCESSED_DATASET_FORMAT,
    generatedAt: new Date().toISOString(),
    dataset: {
      movieMode: '3d',
      totalVolumeCount: TIMEPOINTS,
      channels: [
        {
          id: 'channel-edge',
          name: 'Channel Edge',
          trackSets: [],
          layers: [
            {
              key: 'layer-edge',
              label: 'Layer Edge',
              channelId: 'channel-edge',
              isSegmentation: false,
              volumeCount: TIMEPOINTS,
              width: WIDTH,
              height: HEIGHT,
              depth: DEPTH,
              channels: CHANNELS,
              dataType: 'uint8',
              normalization: { min: 0, max: 255 },
              zarr: {
                scales: [
                  {
                    level: 0,
                    downsampleFactor: [1, 1, 1],
                    width: WIDTH,
                    height: HEIGHT,
                    depth: DEPTH,
                    channels: CHANNELS,
                    zarr: {
                      data: {
                        path: dataPath,
                        shape: [TIMEPOINTS, DEPTH, HEIGHT, WIDTH, CHANNELS],
                        chunkShape: [2, 2, 2, 2, 4],
                        dataType: 'uint8'
                      },
                      histogram: {
                        path: histogramPath,
                        shape: [TIMEPOINTS, 256],
                        chunkShape: [1, 256],
                        dataType: 'uint32'
                      },
                      chunkStats: {
                        min: {
                          path: chunkMinPath,
                          shape: [TIMEPOINTS, 2, 1, 2],
                          chunkShape: [1, 2, 1, 2],
                          dataType: 'uint8'
                        },
                        max: {
                          path: chunkMaxPath,
                          shape: [TIMEPOINTS, 2, 1, 2],
                          chunkShape: [1, 2, 1, 2],
                          dataType: 'uint8'
                        },
                        occupancy: {
                          path: chunkOccPath,
                          shape: [TIMEPOINTS, 2, 1, 2],
                          chunkShape: [1, 2, 1, 2],
                          dataType: 'float32'
                        }
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
      ],
      voxelResolution: null,
      anisotropyCorrection: null
    }
  };
}

function sampleRgb(timepoint: number, z: number, y: number, x: number): [number, number, number] {
  const base = timepoint * 40 + z * 8 + y * 3 + x;
  return [base + 10, base + 60, base + 110];
}

function buildFrame(timepoint: number): Uint8Array {
  const values: number[] = [];
  for (let z = 0; z < DEPTH; z += 1) {
    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const [r, g, b] = sampleRgb(timepoint, z, y, x);
        values.push(r, g, b);
      }
    }
  }
  return new Uint8Array(values);
}

function buildChunkBytesWithPadding({
  frames,
  timeStart,
  timeExtent,
  zStart,
  zExtent,
  yStart,
  yExtent,
  xStart,
  xExtent
}: {
  frames: Uint8Array[];
  timeStart: number;
  timeExtent: number;
  zStart: number;
  zExtent: number;
  yStart: number;
  yExtent: number;
  xStart: number;
  xExtent: number;
}): Uint8Array {
  const bytes: number[] = [];
  for (let localTime = 0; localTime < timeExtent; localTime += 1) {
    const frame = frames[timeStart + localTime];
    if (!frame) {
      throw new Error(`Missing frame for timepoint ${timeStart + localTime}.`);
    }
    for (let localZ = 0; localZ < zExtent; localZ += 1) {
      for (let localY = 0; localY < yExtent; localY += 1) {
        for (let localX = 0; localX < xExtent; localX += 1) {
          const z = zStart + localZ;
          const y = yStart + localY;
          const x = xStart + localX;
          const voxelOffset = ((z * HEIGHT + y) * WIDTH + x) * CHANNELS;
          bytes.push(
            frame[voxelOffset] ?? 0,
            frame[voxelOffset + 1] ?? 0,
            frame[voxelOffset + 2] ?? 0,
            222
          );
        }
      }
    }
  }
  return new Uint8Array(bytes);
}

function atlasRgba(atlasData: Uint8Array, atlasWidth: number, atlasHeight: number, z: number, y: number, x: number): [number, number, number, number] {
  const offset = ((z * atlasHeight + y) * atlasWidth + x) * 4;
  return [
    atlasData[offset] ?? 0,
    atlasData[offset + 1] ?? 0,
    atlasData[offset + 2] ?? 0,
    atlasData[offset + 3] ?? 0
  ];
}

test('brick atlas loading handles multi-timepoint chunks and edge chunks with padded channel stride', async () => {
  const storageHandle = createInMemoryPreprocessedStorage({ datasetId: 'preprocessed-brick-atlas-edge-cases' });
  const zarrStore = createZarrStoreFromPreprocessedStorage(storageHandle.storage);
  const manifest = buildManifest();
  const layer = manifest.dataset.channels[0]!.layers[0]!;
  const scale = layer.zarr.scales[0]!;

  await zarr.create(zarr.root(zarrStore), { attributes: { llsmViewerPreprocessed: manifest } });
  await zarr.create(zarr.root(zarrStore).resolve(scale.zarr.data.path), {
    shape: scale.zarr.data.shape,
    data_type: scale.zarr.data.dataType,
    chunk_shape: scale.zarr.data.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(scale.zarr.chunkStats.min.path), {
    shape: scale.zarr.chunkStats.min.shape,
    data_type: scale.zarr.chunkStats.min.dataType,
    chunk_shape: scale.zarr.chunkStats.min.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(scale.zarr.chunkStats.max.path), {
    shape: scale.zarr.chunkStats.max.shape,
    data_type: scale.zarr.chunkStats.max.dataType,
    chunk_shape: scale.zarr.chunkStats.max.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(scale.zarr.chunkStats.occupancy.path), {
    shape: scale.zarr.chunkStats.occupancy.shape,
    data_type: scale.zarr.chunkStats.occupancy.dataType,
    chunk_shape: scale.zarr.chunkStats.occupancy.chunkShape,
    codecs: [],
    fill_value: 0
  });
  await zarr.create(zarr.root(zarrStore).resolve(scale.zarr.histogram.path), {
    shape: scale.zarr.histogram.shape,
    data_type: scale.zarr.histogram.dataType,
    chunk_shape: scale.zarr.histogram.chunkShape,
    codecs: [],
    fill_value: 0
  });

  const frames = [buildFrame(0), buildFrame(1), buildFrame(2)];
  const timeChunkLength = scale.zarr.data.chunkShape[0];
  const chunkDepth = scale.zarr.data.chunkShape[1];
  const chunkHeight = scale.zarr.data.chunkShape[2];
  const chunkWidth = scale.zarr.data.chunkShape[3];

  for (let timepoint = 0; timepoint < TIMEPOINTS; timepoint += 1) {
    const histogram = computeUint8VolumeHistogram({
      width: WIDTH,
      height: HEIGHT,
      depth: DEPTH,
      channels: CHANNELS,
      normalized: frames[timepoint]!
    });
    await storageHandle.storage.writeFile(`${scale.zarr.histogram.path}/c/${timepoint}/0`, encodeUint32ArrayLE(histogram));
    await storageHandle.storage.writeFile(`${scale.zarr.chunkStats.min.path}/c/${timepoint}/0/0/0`, new Uint8Array([0, 0, 0, 0]));
    await storageHandle.storage.writeFile(
      `${scale.zarr.chunkStats.max.path}/c/${timepoint}/0/0/0`,
      new Uint8Array([255, 255, 255, 255])
    );
    const occ = new Uint8Array(16);
    const occView = new DataView(occ.buffer);
    occView.setFloat32(0, 1, true);
    occView.setFloat32(4, 1, true);
    occView.setFloat32(8, 1, true);
    occView.setFloat32(12, 1, true);
    await storageHandle.storage.writeFile(`${scale.zarr.chunkStats.occupancy.path}/c/${timepoint}/0/0/0`, occ);
  }

  for (let timeChunkCoord = 0; timeChunkCoord < Math.ceil(TIMEPOINTS / timeChunkLength); timeChunkCoord += 1) {
    const timeStart = timeChunkCoord * timeChunkLength;
    const timeExtent = Math.min(timeChunkLength, TIMEPOINTS - timeStart);
    for (let chunkZ = 0; chunkZ < Math.ceil(DEPTH / chunkDepth); chunkZ += 1) {
      const zStart = chunkZ * chunkDepth;
      const zExtent = Math.min(chunkDepth, DEPTH - zStart);
      for (let chunkX = 0; chunkX < Math.ceil(WIDTH / chunkWidth); chunkX += 1) {
        const xStart = chunkX * chunkWidth;
        const xExtent = Math.min(chunkWidth, WIDTH - xStart);
        const bytes = buildChunkBytesWithPadding({
          frames,
          timeStart,
          timeExtent,
          zStart,
          zExtent,
          yStart: 0,
          yExtent: HEIGHT,
          xStart,
          xExtent
        });
        await storageHandle.storage.writeFile(`${scale.zarr.data.path}/c/${timeChunkCoord}/${chunkZ}/0/${chunkX}/0`, bytes);
      }
    }
  }

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  const provider = createVolumeProvider({
    manifest: opened.manifest,
    storage: storageHandle.storage,
    maxCachedVolumes: 4,
    maxCachedChunkBytes: DEFAULT_MAX_CACHED_CHUNK_BYTES,
    maxConcurrentChunkReads: DEFAULT_MAX_CONCURRENT_CHUNK_READS,
    maxConcurrentPrefetchLoads: DEFAULT_MAX_CONCURRENT_PREFETCH_LOADS
  });

  const atlasT1 = await provider.getBrickAtlas!('layer-edge', 1);
  assert.equal(atlasT1.enabled, true);
  assert.equal(atlasT1.textureFormat, 'rgba');
  assert.equal(atlasT1.width, 2);
  assert.equal(atlasT1.height, 2);
  assert.equal(atlasT1.depth, 8);
  assert.deepEqual(Array.from(atlasT1.pageTable.brickAtlasIndices), [0, 1, 2, 3]);

  assert.deepEqual(atlasRgba(atlasT1.data, atlasT1.width, atlasT1.height, 0, 0, 0), [...sampleRgb(1, 0, 0, 0), 255]);
  assert.deepEqual(atlasRgba(atlasT1.data, atlasT1.width, atlasT1.height, 1, 1, 1), [...sampleRgb(1, 1, 1, 1), 255]);
  assert.deepEqual(atlasRgba(atlasT1.data, atlasT1.width, atlasT1.height, 2, 0, 0), [...sampleRgb(1, 0, 0, 2), 255]);
  assert.deepEqual(atlasRgba(atlasT1.data, atlasT1.width, atlasT1.height, 2, 0, 1), [0, 0, 0, 0]);
  assert.deepEqual(atlasRgba(atlasT1.data, atlasT1.width, atlasT1.height, 4, 1, 1), [...sampleRgb(1, 2, 1, 1), 255]);
  assert.deepEqual(atlasRgba(atlasT1.data, atlasT1.width, atlasT1.height, 5, 0, 0), [0, 0, 0, 0]);
  assert.deepEqual(atlasRgba(atlasT1.data, atlasT1.width, atlasT1.height, 6, 0, 0), [...sampleRgb(1, 2, 0, 2), 255]);
  assert.deepEqual(atlasRgba(atlasT1.data, atlasT1.width, atlasT1.height, 6, 0, 1), [0, 0, 0, 0]);
  assert.deepEqual(atlasRgba(atlasT1.data, atlasT1.width, atlasT1.height, 7, 0, 0), [0, 0, 0, 0]);

  const atlasT2 = await provider.getBrickAtlas!('layer-edge', 2);
  assert.deepEqual(atlasRgba(atlasT2.data, atlasT2.width, atlasT2.height, 0, 0, 0), [...sampleRgb(2, 0, 0, 0), 255]);
  assert.deepEqual(atlasRgba(atlasT2.data, atlasT2.width, atlasT2.height, 6, 0, 0), [...sampleRgb(2, 2, 0, 2), 255]);
});
