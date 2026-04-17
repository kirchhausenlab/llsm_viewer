import assert from 'node:assert/strict';
import * as THREE from 'three';

import { resolveVolumeHoverLayerSelection } from '../src/components/viewers/volume-viewer/volumeHoverTargetLayer.ts';
import type { ViewerLayer, VolumeResources } from '../src/components/viewers/VolumeViewer.types.ts';
import { DEFAULT_HOVER_SETTINGS } from '../src/shared/utils/hoverSettings.ts';
import {
  RENDER_STYLE_BL,
  RENDER_STYLE_ISO,
  RENDER_STYLE_MIP,
  RENDER_STYLE_SLICE,
} from '../src/state/layerSettings.ts';

console.log('Starting volume hover target-layer helper tests');

const createVolume = (depth: number) => ({
  width: 2,
  height: 2,
  depth,
  channels: 1,
  dataType: 'uint8' as const,
  normalized: new Uint8Array(Math.max(1, 4 * depth)),
  min: 0,
  max: 255,
});

const createLayer = (key: string, options?: Partial<ViewerLayer>): ViewerLayer => ({
  key,
  label: key,
  channelName: key,
  volume: createVolume(2),
  visible: true,
  sliderRange: 1,
  minSliderIndex: 0,
  maxSliderIndex: 1,
  brightnessSliderIndex: 0,
  contrastSliderIndex: 1,
  windowMin: 0,
  windowMax: 1,
  color: '#ffffff',
  offsetX: 0,
  offsetY: 0,
  renderStyle: RENDER_STYLE_MIP,
  blDensityScale: 1,
  blBackgroundCutoff: 0.08,
  blOpacityScale: 1,
  blEarlyExitAlpha: 0.98,
  invert: false,
  samplingMode: 'linear',
  ...options,
});

const createResource = (mode: '3d' | 'slice'): VolumeResources => ({
  mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()),
  texture: new THREE.DataTexture(),
  dimensions: { width: 2, height: 2, depth: 2 },
  channels: 1,
  mode,
  samplingMode: 'linear',
});

const createPageTable = (layerKey: string) => ({
  layerKey,
  timepoint: 0,
  scaleLevel: 0,
  gridShape: [1, 1, 1] as [number, number, number],
  chunkShape: [2, 2, 2] as [number, number, number],
  volumeShape: [2, 2, 2] as [number, number, number],
  brickAtlasIndices: new Int32Array([0]),
  chunkMin: new Uint8Array([0]),
  chunkMax: new Uint8Array([255]),
  chunkOccupancy: new Float32Array([1]),
  occupiedBrickCount: 1,
});

const createBrickAtlas = (layerKey: string) => {
  const pageTable = createPageTable(layerKey);
  return {
    layerKey,
    timepoint: 0,
    scaleLevel: 0,
    pageTable,
    width: 2,
    height: 2,
    depth: 2,
    textureFormat: 'red' as const,
    sourceChannels: 1,
    data: new Uint8Array(8),
    enabled: true,
  };
};

(() => {
  const sliceLayer = createLayer('slice');
  const gpuLayer = createLayer('gpu');
  const resources = new Map<string, VolumeResources>([
    ['slice', createResource('slice')],
    ['gpu', createResource('3d')],
  ]);

  const selection = resolveVolumeHoverLayerSelection([sliceLayer, gpuLayer], resources);
  assert.strictEqual(selection.targetLayer?.key, 'gpu');
  assert.strictEqual(selection.resource?.mode, '3d');
  assert.deepStrictEqual(
    selection.hoverableLayers.map((layer) => layer.key),
    ['slice', 'gpu'],
  );
})();

(() => {
  const sliceLayer = createLayer('slice-only');
  const resources = new Map<string, VolumeResources>([
    ['slice-only', createResource('slice')],
  ]);

  const selection = resolveVolumeHoverLayerSelection([sliceLayer], resources);
  assert.strictEqual(selection.targetLayer?.key, 'slice-only');
  assert.strictEqual(selection.resource?.mode, 'slice');
})();

(() => {
  const cpuLayer = createLayer('cpu-only');
  const selection = resolveVolumeHoverLayerSelection([cpuLayer], new Map());
  assert.strictEqual(selection.targetLayer?.key, 'cpu-only');
  assert.strictEqual(selection.resource, null);
})();

(() => {
  const atlasLayer = createLayer('atlas-only', {
    volume: null,
    brickAtlas: createBrickAtlas('atlas-only') as ViewerLayer['brickAtlas'],
    brickPageTable: createPageTable('atlas-only') as ViewerLayer['brickPageTable'],
  });
  const selection = resolveVolumeHoverLayerSelection([atlasLayer], new Map());
  assert.strictEqual(selection.targetLayer?.key, 'atlas-only');
  assert.strictEqual(selection.resource, null);
  assert.deepStrictEqual(selection.hoverableLayers.map((layer) => layer.key), ['atlas-only']);
})();

(() => {
  const atlasLayer = createLayer('atlas-disabled', {
    volume: null,
    brickAtlas: {
      ...(createBrickAtlas('atlas-disabled') as ViewerLayer['brickAtlas']),
      enabled: false,
    } as ViewerLayer['brickAtlas'],
    brickPageTable: createPageTable('atlas-disabled') as ViewerLayer['brickPageTable'],
  });
  const selection = resolveVolumeHoverLayerSelection([atlasLayer], new Map());
  assert.strictEqual(selection.targetLayer, null);
  assert.strictEqual(selection.resource, null);
  assert.deepStrictEqual(selection.hoverableLayers, []);
})();

(() => {
  const pageTable = createPageTable('atlas-resource-page-table');
  const atlasLayer = createLayer('atlas-resource-page-table', {
    volume: null,
    brickAtlas: {
      ...(createBrickAtlas('atlas-resource-page-table') as ViewerLayer['brickAtlas']),
      pageTable: undefined,
    } as unknown as ViewerLayer['brickAtlas'],
    brickPageTable: null,
  });
  const resource = {
    ...createResource('3d'),
    brickAtlasSourcePageTable: pageTable,
  } as VolumeResources;
  const selection = resolveVolumeHoverLayerSelection(
    [atlasLayer],
    new Map([['atlas-resource-page-table', resource]]),
  );
  assert.strictEqual(selection.targetLayer?.key, 'atlas-resource-page-table');
  assert.strictEqual(selection.resource?.mode, '3d');
  assert.deepStrictEqual(selection.hoverableLayers.map((layer) => layer.key), ['atlas-resource-page-table']);
})();

(() => {
  const hidden = createLayer('hidden', { visible: false });
  const noDepth = createLayer('no-depth', { volume: createVolume(1) });
  const disabled = createLayer('disabled', { isHoverTarget: false });
  const valid = createLayer('valid');

  const selection = resolveVolumeHoverLayerSelection(
    [hidden, noDepth, disabled, valid],
    new Map([['valid', createResource('3d')]]),
  );

  assert.deepStrictEqual(selection.hoverableLayers.map((layer) => layer.key), ['valid']);
  assert.strictEqual(selection.targetLayer?.key, 'valid');
})();

(() => {
  const isoLayer = createLayer('iso', { renderStyle: RENDER_STYLE_ISO });
  const mipLayer = createLayer('mip', { renderStyle: RENDER_STYLE_MIP });
  const blLayer = createLayer('bl', { renderStyle: RENDER_STYLE_BL });
  const sliceLayer = createLayer('slice', { renderStyle: RENDER_STYLE_SLICE });
  const resources = new Map<string, VolumeResources>([
    ['iso', createResource('3d')],
    ['mip', createResource('3d')],
    ['bl', createResource('3d')],
    ['slice', createResource('slice')],
  ]);

  const defaultSelection = resolveVolumeHoverLayerSelection(
    [mipLayer, isoLayer, blLayer, sliceLayer],
    resources,
    DEFAULT_HOVER_SETTINGS,
  );
  assert.deepStrictEqual(defaultSelection.hoverableLayers.map((layer) => layer.key), ['mip', 'iso', 'bl', 'slice']);
  assert.strictEqual(defaultSelection.targetLayer?.key, 'mip');
  assert.strictEqual(defaultSelection.resource?.mode, '3d');

  const crosshairSelection = resolveVolumeHoverLayerSelection(
    [isoLayer, mipLayer, blLayer],
    resources,
    { ...DEFAULT_HOVER_SETTINGS, type: 'crosshair' },
  );
  assert.deepStrictEqual(crosshairSelection.hoverableLayers.map((layer) => layer.key), ['bl']);
  assert.strictEqual(crosshairSelection.targetLayer?.key, 'bl');
  assert.strictEqual(crosshairSelection.resource?.mode, '3d');

  const disabledSelection = resolveVolumeHoverLayerSelection(
    [mipLayer, blLayer, sliceLayer],
    resources,
    { ...DEFAULT_HOVER_SETTINGS, enabled: false },
  );
  assert.deepStrictEqual(disabledSelection.hoverableLayers, []);
  assert.strictEqual(disabledSelection.targetLayer, null);
  assert.strictEqual(disabledSelection.resource, null);
})();

(() => {
  const isoLayer = createLayer('iso-only', { renderStyle: RENDER_STYLE_ISO });
  const resources = new Map<string, VolumeResources>([
    ['iso-only', createResource('3d')],
  ]);

  const selection = resolveVolumeHoverLayerSelection(
    [isoLayer],
    resources,
    DEFAULT_HOVER_SETTINGS,
  );

  assert.deepStrictEqual(selection.hoverableLayers.map((layer) => layer.key), ['iso-only']);
  assert.strictEqual(selection.targetLayer?.key, 'iso-only');
  assert.strictEqual(selection.resource?.mode, '3d');
})();

console.log('volume hover target-layer helper tests passed');
