import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import ChannelsPanel from '../../src/components/viewers/viewer-shell/ChannelsPanel.tsx';
import type { LoadedDatasetLayer } from '../../src/hooks/dataset/useDatasetSetup.ts';
import {
  RENDER_STYLE_BL,
  RENDER_STYLE_ISO,
  RENDER_STYLE_MIP,
  createDefaultLayerSettings,
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

type RenderStyleCall = { layerKey: string; renderStyle: number } | null;

function createProps(
  renderStyle: number,
  onRenderStyleCall: (value: RenderStyleCall) => void,
) {
  return {
    layout: {
      windowMargin: 16,
      controlWindowWidth: 360,
      layersWindowInitialPosition: { x: 0, y: 0 },
      resetToken: 0,
    },
    isPlaying: false,
    loadedChannelIds: ['channel-a'],
    channelNameMap: new Map([['channel-a', 'Channel A']]),
    channelVisibility: { 'channel-a': true },
    channelTintMap: new Map([['channel-a', '#ffffff']]),
    activeChannelId: 'channel-a',
    onChannelTabSelect: () => {},
    onChannelVisibilityToggle: () => {},
    channelLayersMap: new Map([['channel-a', [layer]]]),
    layerVolumesByKey: { 'layer-a': null },
    layerBrickAtlasesByKey: { 'layer-a': null },
    channelActiveLayer: { 'channel-a': 'layer-a' },
    layerSettings: {
      'layer-a': {
        ...createDefaultLayerSettings(),
        renderStyle,
      },
    },
    getLayerDefaultSettings: (_layerKey: string) => createDefaultLayerSettings(),
    onChannelLayerSelect: () => {},
    onChannelReset: () => {},
    onLayerWindowMinChange: () => {},
    onLayerWindowMaxChange: () => {},
    onLayerBrightnessChange: () => {},
    onLayerContrastChange: () => {},
    onLayerAutoContrast: () => {},
    onLayerOffsetChange: () => {},
    onLayerColorChange: () => {},
    onLayerRenderStyleChange: (layerKey: string, nextRenderStyle: number) => {
      onRenderStyleCall({ layerKey, renderStyle: nextRenderStyle });
    },
    onLayerBlDensityScaleChange: () => {},
    onLayerBlBackgroundCutoffChange: () => {},
    onLayerBlOpacityScaleChange: () => {},
    onLayerBlEarlyExitAlphaChange: () => {},
    onLayerInvertToggle: () => {},
  };
}

function findButtonByLabel(renderer: TestRenderer.ReactTestRenderer, label: string) {
  return renderer.root
    .findAll((node) => node.type === 'button')
    .find((button) => button.children.join('') === label) ?? null;
}

function findBlInputs(renderer: TestRenderer.ReactTestRenderer) {
  return renderer.root.findAll(
    (node) =>
      node.type === 'input' &&
      typeof node.props.id === 'string' &&
      node.props.id.startsWith('layer-bl-'),
  );
}

(() => {
  let renderStyleCall: RenderStyleCall = null;
  const renderer = TestRenderer.create(
    <ChannelsPanel {...(createProps(RENDER_STYLE_MIP, (value) => {
      renderStyleCall = value;
    }) as any)} />,
  );

  const mipButton = findButtonByLabel(renderer, 'MIP');
  const isoButton = findButtonByLabel(renderer, 'ISO');
  const blButton = findButtonByLabel(renderer, 'BL');
  const resetAnglesButtonInMip = findButtonByLabel(renderer, 'Reset angles');

  assert.ok(mipButton);
  assert.ok(isoButton);
  assert.ok(blButton);
  assert.equal(resetAnglesButtonInMip, null);
  assert.equal(mipButton?.props['aria-pressed'], true);
  assert.equal(isoButton?.props['aria-pressed'], false);
  assert.equal(blButton?.props['aria-pressed'], false);
  assert.equal(findBlInputs(renderer).length, 0);

  act(() => {
    blButton?.props.onClick();
  });
  assert.deepEqual(renderStyleCall, { layerKey: 'layer-a', renderStyle: RENDER_STYLE_BL });

  renderer.update(
    <ChannelsPanel {...(createProps(RENDER_STYLE_BL, () => {}) as any)} />,
  );
  assert.equal(findBlInputs(renderer).length, 4);

  renderer.update(
    <ChannelsPanel {...(createProps(RENDER_STYLE_ISO, () => {}) as any)} />,
  );
  assert.equal(findBlInputs(renderer).length, 0);
  assert.equal(findButtonByLabel(renderer, 'Reset angles'), null);

  renderer.unmount();
})();

console.log('ChannelsPanel tests passed');
