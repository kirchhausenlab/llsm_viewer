import assert from 'node:assert/strict';
import { resolveHoverSpaceDimensions } from '../src/components/viewers/volume-viewer/useVolumeHover.ts';

(() => {
  const dims = resolveHoverSpaceDimensions({
    targetLayer: {
      fullResolutionWidth: 1200,
      fullResolutionHeight: 600,
      fullResolutionDepth: 300,
    } as any,
    resource: {
      dimensions: { width: 1024, height: 512, depth: 256 },
    } as any,
    targetVolume: null,
    targetAtlasPageTable: {
      volumeShape: [128, 256, 512],
    } as any,
  });

  assert.deepStrictEqual(dims, { width: 1024, height: 512, depth: 256 });
})();

(() => {
  const dims = resolveHoverSpaceDimensions({
    targetLayer: {
      fullResolutionWidth: 1024,
      fullResolutionHeight: 512,
      fullResolutionDepth: 256,
    } as any,
    resource: null,
    targetVolume: null,
    targetAtlasPageTable: {
      volumeShape: [128, 256, 512],
    } as any,
  });

  assert.deepStrictEqual(dims, { width: 1024, height: 512, depth: 256 });
})();

(() => {
  const dims = resolveHoverSpaceDimensions({
    targetLayer: {
      fullResolutionWidth: 0,
      fullResolutionHeight: 0,
      fullResolutionDepth: 0,
    } as any,
    resource: null,
    targetVolume: null,
    targetAtlasPageTable: {
      volumeShape: [128, 256, 512],
    } as any,
  });

  assert.deepStrictEqual(dims, { width: 512, height: 256, depth: 128 });
})();

(() => {
  const dims = resolveHoverSpaceDimensions({
    targetLayer: null,
    resource: null,
    targetVolume: {
      width: 300,
      height: 200,
      depth: 100,
    } as any,
    targetAtlasPageTable: null,
  });

  assert.deepStrictEqual(dims, { width: 300, height: 200, depth: 100 });
})();

console.log('volume hover dimension helper tests passed');
