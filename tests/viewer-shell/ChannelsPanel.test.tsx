import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import ChannelsPanel from '../../src/components/viewers/viewer-shell/ChannelsPanel.tsx';
import type { LoadedDatasetLayer } from '../../src/hooks/dataset/useDatasetSetup.ts';
import {
  RENDER_STYLE_BL,
  RENDER_STYLE_ISO,
  RENDER_STYLE_MIP,
  RENDER_STYLE_SLICE,
  createDefaultLayerSettings,
  type SamplingMode,
} from '../../src/state/layerSettings.ts';

console.log('Starting ChannelsPanel tests');

const layer: LoadedDatasetLayer = {
  key: 'layer-a',
  label: 'Layer A',
  channelId: 'channel-a',
  isSegmentation: false,
  volumeCount: 1,
  width: 8,
  height: 8,
  depth: 8,
  channels: 1,
  dataType: 'uint8',
  min: 0,
  max: 255,
};

const segmentationLayer: LoadedDatasetLayer = {
  ...layer,
  key: 'layer-seg',
  label: 'Segmentation Layer',
  isSegmentation: true,
  dataType: 'uint16',
};

type RenderStyleCall = { layerKey: string; renderStyle: number; samplingMode?: SamplingMode } | null;

function createProps(
  renderStyle: number,
  onRenderStyleCall: (value: RenderStyleCall) => void,
  onVisibilityToggle: (channelId: string) => void = () => {},
  selectedLayer: LoadedDatasetLayer = layer,
  samplingMode: SamplingMode = 'linear',
  channelVisible = true,
) {
  return {
    layout: {
      windowMargin: 16,
      controlWindowWidth: 360,
      layersWindowInitialPosition: { x: 0, y: 0 },
      resetToken: 0,
    },
    isOpen: true,
    onClose: () => {},
    isPlaying: false,
    loadedChannelIds: ['channel-a'],
    channelNameMap: new Map([['channel-a', 'Channel A']]),
    channelVisibility: { 'channel-a': channelVisible },
    channelTintMap: new Map([['channel-a', '#ffffff']]),
    activeChannelId: 'channel-a',
    onChannelTabSelect: () => {},
    onChannelVisibilityToggle: () => {},
    channelLayersMap: new Map([['channel-a', [selectedLayer]]]),
    layerVolumesByKey: { [selectedLayer.key]: null },
    layerBrickAtlasesByKey: { [selectedLayer.key]: null },
    layerSettings: {
      [selectedLayer.key]: {
        ...createDefaultLayerSettings(),
        renderStyle,
        samplingMode,
      },
    },
    getLayerDefaultSettings: (_layerKey: string) => createDefaultLayerSettings(),
    onChannelReset: () => {},
    onChannelVisibilityToggle: onVisibilityToggle,
    onLayerWindowMinChange: () => {},
    onLayerWindowMaxChange: () => {},
    onLayerBrightnessChange: () => {},
    onLayerContrastChange: () => {},
    onLayerAutoContrast: () => {},
    onLayerOffsetChange: () => {},
    onLayerColorChange: () => {},
    onLayerRenderStyleChange: (layerKey: string, nextRenderStyle: number, nextSamplingMode?: SamplingMode) => {
      onRenderStyleCall({ layerKey, renderStyle: nextRenderStyle, samplingMode: nextSamplingMode });
    },
    onLayerBlDensityScaleChange: () => {},
    onLayerBlBackgroundCutoffChange: () => {},
    onLayerBlOpacityScaleChange: () => {},
    onLayerBlEarlyExitAlphaChange: () => {},
    onLayerMipEarlyExitThresholdChange: () => {},
    onLayerInvertToggle: () => {},
  };
}

function findButtonByLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAll((node) => node.type === 'button')
    .find((button) => button.children.join('') === label) ?? null;
}

function findRenderModeSelect(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll((node) => node.type === 'select')[0] ?? null;
}

function findBlInputs(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    (node) =>
      node.type === 'input' &&
      typeof node.props.id === 'string' &&
      node.props.id.startsWith('layer-bl-'),
  );
}

function findMipInputs(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    (node) =>
      node.type === 'input' &&
      typeof node.props.id === 'string' &&
      node.props.id.startsWith('layer-mip-early-exit-'),
  );
}

function findNodeByClassName(renderer: TestRenderer.ReactTestRenderer, className: string) {
  return renderer.root.findAll((node) => node.props.className === className)[0] ?? null;
}

function findChannelActionRows(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll((node) => node.props.className === 'channel-primary-actions-row');
}

function findNodesByText(renderer: TestRenderer.ReactTestRenderer, text: string) {
  return renderer.root.findAll((node) => Array.isArray(node.children) && node.children.join('') === text);
}

(() => {
  let renderStyleCall: RenderStyleCall = null;
  let visibilityToggleChannelId: string | null = null;
  const renderer = TestRenderer.create(
    <ChannelsPanel {...(createProps(RENDER_STYLE_MIP, (value) => {
      renderStyleCall = value;
    }, (channelId) => {
      visibilityToggleChannelId = channelId;
    }) as any)} />,
  );

  const renderModeSelect = findRenderModeSelect(renderer);
  const hideButton = findButtonByLabel(renderer, 'Hide');
  const currentChannelTitle = findNodeByClassName(renderer, 'channel-current-title');
  const resetAnglesButtonInMip = findButtonByLabel(renderer, 'Reset angles');

  assert.ok(renderModeSelect);
  assert.ok(hideButton);
  assert.equal(currentChannelTitle?.children.join(''), 'Channel A');
  assert.equal(resetAnglesButtonInMip, null);
  assert.equal(renderModeSelect?.props.value, 'mip');
  assert.equal(findBlInputs(renderer).length, 0);
  assert.equal(findMipInputs(renderer).length, 0);
  assert.deepEqual(
    renderModeSelect?.findAll((node) => node.type === 'option').map((option) => option.children.join('')),
    [
      'Max Int Projection (MIP)',
      'Max Int Projection (MIP) - Voxel',
      'Isosurfaces (ISO)',
      'Beer-Lambert (BL)',
      '2D Slices (XY)',
    ],
  );
  const actionRows = findChannelActionRows(renderer);
  assert.equal(actionRows[0]?.findAll((node) => node.type === 'select').length, 1);
  assert.deepEqual(
    actionRows[1]?.findAll((node) => node.type === 'button').map((button) => button.children.join('')),
    ['Reset', 'Invert', 'Auto'],
  );
  assert.equal(findNodesByText(renderer, 'Render mode').length, 0);
  assert.ok(findNodeByClassName(renderer, 'color-swatch-row'));
  assert.equal(findButtonByLabel(renderer, 'MIP'), null);
  assert.equal(findButtonByLabel(renderer, 'ISO'), null);
  assert.equal(findButtonByLabel(renderer, 'BL'), null);
  assert.equal(findButtonByLabel(renderer, 'Slice'), null);

  act(() => {
    hideButton?.props.onClick();
  });
  assert.equal(visibilityToggleChannelId, 'channel-a');

  act(() => {
    renderModeSelect?.props.onChange({ target: { value: 'mip-v' } });
  });
  assert.deepEqual(renderStyleCall, {
    layerKey: 'layer-a',
    renderStyle: RENDER_STYLE_MIP,
    samplingMode: 'nearest',
  });

  act(() => {
    renderModeSelect?.props.onChange({ target: { value: 'bl' } });
  });
  assert.deepEqual(renderStyleCall, {
    layerKey: 'layer-a',
    renderStyle: RENDER_STYLE_BL,
    samplingMode: 'linear',
  });

  renderer.update(
    <ChannelsPanel {...(createProps(RENDER_STYLE_MIP, () => {}, () => {}, layer, 'nearest') as any)} />,
  );
  assert.equal(findRenderModeSelect(renderer)?.props.value, 'mip-v');
  assert.equal(findBlInputs(renderer).length, 0);
  assert.equal(findMipInputs(renderer).length, 0);
  assert.ok(findButtonByLabel(renderer, 'Hide'));

  renderer.update(
    <ChannelsPanel {...(createProps(RENDER_STYLE_ISO, () => {}) as any)} />,
  );
  assert.equal(findRenderModeSelect(renderer)?.props.value, 'iso');
  assert.equal(findBlInputs(renderer).length, 0);
  assert.equal(findMipInputs(renderer).length, 0);
  assert.equal(findButtonByLabel(renderer, 'Reset angles'), null);

  renderer.update(
    <ChannelsPanel {...(createProps(RENDER_STYLE_MIP, () => {}, () => {}, layer, 'linear', false) as any)} />,
  );
  assert.ok(findButtonByLabel(renderer, 'Show'));

  renderer.unmount();
})();

(() => {
  let renderStyleCall: RenderStyleCall = null;
  const renderer = TestRenderer.create(
    <ChannelsPanel
      {...(createProps(
        RENDER_STYLE_BL,
        (value) => {
          renderStyleCall = value;
        },
        () => {},
        segmentationLayer,
      ) as any)}
    />,
  );

  const segmentation3dButton = findButtonByLabel(renderer, '3D');
  const sliceButton = findButtonByLabel(renderer, 'Slice');

  assert.ok(segmentation3dButton);
  assert.ok(sliceButton);
  assert.equal(findRenderModeSelect(renderer), null);
  assert.equal(findButtonByLabel(renderer, 'MIP'), null);
  assert.equal(findButtonByLabel(renderer, 'ISO'), null);
  assert.equal(findButtonByLabel(renderer, 'BL'), null);
  assert.equal(segmentation3dButton?.props['aria-pressed'], true);
  assert.equal(sliceButton?.props['aria-pressed'], false);

  act(() => {
    segmentation3dButton?.props.onClick();
  });
  assert.deepEqual(renderStyleCall, {
    layerKey: 'layer-seg',
    renderStyle: RENDER_STYLE_MIP,
    samplingMode: undefined,
  });

  act(() => {
    sliceButton?.props.onClick();
  });
  assert.deepEqual(renderStyleCall, {
    layerKey: 'layer-seg',
    renderStyle: RENDER_STYLE_SLICE,
    samplingMode: undefined,
  });

  renderer.update(
    <ChannelsPanel {...(createProps(RENDER_STYLE_SLICE, () => {}, () => {}, segmentationLayer) as any)} />,
  );
  assert.equal(findButtonByLabel(renderer, '3D')?.props['aria-pressed'], false);
  assert.equal(findButtonByLabel(renderer, 'Slice')?.props['aria-pressed'], true);

  renderer.unmount();
})();

(() => {
  const renderer = TestRenderer.create(
    <ChannelsPanel
      {...(createProps(RENDER_STYLE_MIP, () => {}) as any)}
      renderModeLocked
    />,
  );

  const renderModeSelect = findRenderModeSelect(renderer);
  assert.equal(renderModeSelect?.props.disabled, true);
  assert.equal(renderModeSelect?.props.title, 'Render mode is locked while 2D view is active.');

  renderer.update(
    <ChannelsPanel
      {...(createProps(RENDER_STYLE_SLICE, () => {}, () => {}, segmentationLayer) as any)}
      renderModeLocked
    />,
  );

  const segmentation3dButton = findButtonByLabel(renderer, '3D');
  const sliceButton = findButtonByLabel(renderer, 'Slice');
  assert.equal(segmentation3dButton?.props.disabled, true);
  assert.equal(sliceButton?.props.disabled, true);

  renderer.unmount();
})();

console.log('ChannelsPanel tests passed');
