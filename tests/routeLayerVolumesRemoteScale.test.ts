import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRemoteStartupScaleLevel } from '../src/ui/app/hooks/useRouteLayerVolumes';
import type { PreprocessedLayerScaleManifestEntry } from '../src/shared/utils/preprocessedDataset/types';

function createScale({
  level,
  width,
  height,
  depth,
  channels,
  dataType = 'uint8',
  playbackAtlasBytes = null
}: {
  level: number;
  width: number;
  height: number;
  depth: number;
  channels: number;
  dataType?: 'uint8' | 'uint16';
  playbackAtlasBytes?: number | null;
}): PreprocessedLayerScaleManifestEntry {
  return {
    level,
    downsampleFactor: [1, 1, 1],
    width,
    height,
    depth,
    channels,
    zarr: {
      data: {
        path: `scale-${level}/data`,
        shape: [1, depth, height, width, channels],
        chunkShape: [1, depth, height, width, channels],
        dataType
      },
      skipHierarchy: {
        levels: []
      },
      ...(playbackAtlasBytes !== null
        ? {
            playbackAtlas: {
              textureFormat: 'red',
              textureChannels: 1,
              dataType,
              brickAtlasIndices: {
                path: `scale-${level}/playback-atlas/indices`,
                shape: [1, 1, 1, 1],
                chunkShape: [1, 1, 1, 1],
                dataType: 'int32'
              },
              data: {
                path: `scale-${level}/playback-atlas/data`,
                entryCount: 1,
                sharding: {
                  enabled: true,
                  targetShardBytes: playbackAtlasBytes,
                  shardShape: [1],
                  estimatedShardBytes: playbackAtlasBytes
                }
              }
            }
          }
        : {})
    }
  };
}

test('resolveRemoteStartupScaleLevel prefers the finest coarser playback atlas under budget', () => {
  const scalesByLevel = new Map<number, PreprocessedLayerScaleManifestEntry>([
    [0, createScale({ level: 0, width: 256, height: 256, depth: 64, channels: 1 })],
    [1, createScale({ level: 1, width: 128, height: 128, depth: 32, channels: 1, playbackAtlasBytes: 8 * 1024 * 1024 })],
    [2, createScale({ level: 2, width: 64, height: 64, depth: 16, channels: 1, playbackAtlasBytes: 2 * 1024 * 1024 })]
  ]);

  const resolved = resolveRemoteStartupScaleLevel({
    levels: [0, 1, 2],
    scalesByLevel
  });

  assert.equal(resolved, 1);
});

test('resolveRemoteStartupScaleLevel falls back to the finest coarser volume that fits the startup budget', () => {
  const scalesByLevel = new Map<number, PreprocessedLayerScaleManifestEntry>([
    [0, createScale({ level: 0, width: 512, height: 512, depth: 64, channels: 1 })],
    [1, createScale({ level: 1, width: 256, height: 256, depth: 64, channels: 1 })],
    [2, createScale({ level: 2, width: 96, height: 96, depth: 32, channels: 1 })]
  ]);

  const resolved = resolveRemoteStartupScaleLevel({
    levels: [0, 1, 2],
    scalesByLevel
  });

  assert.equal(resolved, 1);
});

test('resolveRemoteStartupScaleLevel still returns a coarser scale when only the smaller fallback fits the startup budget', () => {
  const scalesByLevel = new Map<number, PreprocessedLayerScaleManifestEntry>([
    [0, createScale({ level: 0, width: 1024, height: 1024, depth: 128, channels: 1 })],
    [1, createScale({ level: 1, width: 768, height: 768, depth: 96, channels: 1, playbackAtlasBytes: 64 * 1024 * 1024 })],
    [2, createScale({ level: 2, width: 512, height: 512, depth: 96, channels: 1, playbackAtlasBytes: 48 * 1024 * 1024 })]
  ]);

  const resolved = resolveRemoteStartupScaleLevel({
    levels: [0, 1, 2],
    scalesByLevel
  });

  assert.equal(resolved, 2);
});
