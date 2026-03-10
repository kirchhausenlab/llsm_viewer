import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createHttpPreprocessedStorage } from '../src/shared/storage/preprocessedStorage.ts';
import { openPreprocessedDatasetFromZarrStorage } from '../src/shared/utils/preprocessedDataset/open.ts';
import {
  PREPROCESSED_DATASET_FORMAT,
  type PreprocessedManifest
} from '../src/shared/utils/preprocessedDataset/types.ts';

const encoder = new TextEncoder();

function createManifest(): PreprocessedManifest {
  return {
    format: PREPROCESSED_DATASET_FORMAT,
    generatedAt: '2026-03-10T00:00:00.000Z',
    dataset: {
      movieMode: '3d',
      totalVolumeCount: 1,
      trackSets: [],
      channels: [
        {
          id: 'channel-a',
          name: 'Channel A',
          layers: [
            {
              key: 'layer-a',
              label: 'Volume',
              channelId: 'channel-a',
              isSegmentation: false,
              volumeCount: 1,
              width: 8,
              height: 8,
              depth: 4,
              channels: 1,
              dataType: 'uint8',
              normalization: {
                min: 0,
                max: 255
              },
              zarr: {
                scales: [
                  {
                    level: 0,
                    downsampleFactor: [1, 1, 1],
                    width: 8,
                    height: 8,
                    depth: 4,
                    channels: 1,
                    zarr: {
                      data: {
                        path: 'channels/channel-a/layer-a/data',
                        shape: [1, 4, 8, 8, 1],
                        chunkShape: [1, 4, 4, 4, 1],
                        dataType: 'uint8'
                      },
                      skipHierarchy: {
                        levels: [
                          {
                            level: 0,
                            gridShape: [1, 2, 2],
                            occupancy: {
                              path: 'channels/channel-a/layer-a/skip/occupancy',
                              shape: [1, 1, 2, 2],
                              chunkShape: [1, 1, 2, 2],
                              dataType: 'uint8'
                            },
                            min: {
                              path: 'channels/channel-a/layer-a/skip/min',
                              shape: [1, 1, 2, 2],
                              chunkShape: [1, 1, 2, 2],
                              dataType: 'uint8'
                            },
                            max: {
                              path: 'channels/channel-a/layer-a/skip/max',
                              shape: [1, 1, 2, 2],
                              chunkShape: [1, 1, 2, 2],
                              dataType: 'uint8'
                            }
                          },
                          {
                            level: 1,
                            gridShape: [1, 1, 1],
                            occupancy: {
                              path: 'channels/channel-a/layer-a/skip-root/occupancy',
                              shape: [1, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            min: {
                              path: 'channels/channel-a/layer-a/skip-root/min',
                              shape: [1, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            },
                            max: {
                              path: 'channels/channel-a/layer-a/skip-root/max',
                              shape: [1, 1, 1, 1],
                              chunkShape: [1, 1, 1, 1],
                              dataType: 'uint8'
                            }
                          }
                        ]
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
      ],
      voxelResolution: {
        x: 120,
        y: 120,
        z: 300,
        unit: 'nm',
        correctAnisotropy: false
      },
      temporalResolution: {
        interval: 2.3,
        unit: 'ms'
      },
      anisotropyCorrection: null
    }
  };
}

function createFetchMap(files: Record<string, Uint8Array>) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const bytes = files[request];
    if (!bytes) {
      return new Response('missing', { status: 404, statusText: 'Not Found' });
    }

    const headers = new Headers();
    const rangeHeader = init?.headers instanceof Headers
      ? init.headers.get('Range')
      : typeof init?.headers === 'object' && init?.headers !== null && 'Range' in init.headers
        ? String((init.headers as Record<string, string>).Range)
        : null;

    if (rangeHeader) {
      const match = /bytes=(\d+)-(\d+)/.exec(rangeHeader);
      assert.ok(match, `Unexpected range header: ${rangeHeader}`);
      const start = Number.parseInt(match[1]!, 10);
      const end = Number.parseInt(match[2]!, 10) + 1;
      headers.set('Content-Range', `bytes ${start}-${end - 1}/${bytes.byteLength}`);
      return new Response(bytes.slice(start, end), {
        status: 206,
        headers
      });
    }

    return new Response(bytes, {
      status: 200,
      headers
    });
  };
}

test('HTTP preprocessed storage reads manifest metadata through openPreprocessedDatasetFromZarrStorage', async () => {
  const manifest = createManifest();
  const zarrJson = encoder.encode(
    JSON.stringify({
      zarr_format: 3,
      node_type: 'group',
      attributes: {
        llsmViewerPreprocessed: manifest
      }
    })
  );

  const storageHandle = createHttpPreprocessedStorage({
    id: 'ap2',
    baseUrl: 'https://example.com/examples/datasets/ap2.zarr',
    fetchImpl: createFetchMap({
      'https://example.com/examples/datasets/ap2.zarr/zarr.json': zarrJson
    })
  });

  const opened = await openPreprocessedDatasetFromZarrStorage(storageHandle.storage);
  assert.equal(opened.totalVolumeCount, 1);
  assert.equal(opened.channelSummaries[0]?.name, 'Channel A');
  assert.equal(opened.channelSummaries[0]?.layers[0]?.label, 'Volume');
});

test('HTTP preprocessed storage sends byte ranges for range reads', async () => {
  const bytes = Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const calls: string[] = [];
  const storageHandle = createHttpPreprocessedStorage({
    id: 'ap2',
    baseUrl: 'https://example.com/examples/datasets/ap2.zarr',
    fetchImpl: async (input, init) => {
      const request = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const headers = init?.headers instanceof Headers
        ? init.headers
        : new Headers(init?.headers as HeadersInit | undefined);
      calls.push(headers.get('Range') ?? 'none');
      return createFetchMap({
        [request]: bytes
      })(request, init);
    }
  });

  const ranged = await storageHandle.storage.readFileRange!('chunks/data.bin', 3, 4);
  assert.deepEqual(Array.from(ranged), [3, 4, 5, 6]);
  assert.deepEqual(calls, ['bytes=3-6']);
});
