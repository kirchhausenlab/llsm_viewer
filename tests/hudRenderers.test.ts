import assert from 'node:assert/strict';

import { renderVrTracksHud } from '../src/components/viewers/volume-viewer/vr/hudRenderersTracks.ts';
import { renderVrChannelsHud } from '../src/components/viewers/volume-viewer/vr/hudRenderersChannels.ts';
import type {
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrChannelsState,
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksState,
} from '../src/components/viewers/volume-viewer/vr/types.ts';

console.log('Starting hudRenderers tests');

type MockCanvasContext = CanvasRenderingContext2D & { __roundRectCalls: number };

function createMockCanvasContext(): MockCanvasContext {
  const target: Record<string, unknown> = {
    __roundRectCalls: 0,
    roundRect: () => {
      target.__roundRectCalls = ((target.__roundRectCalls as number) ?? 0) + 1;
    },
    measureText: () => ({ width: 120 }),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '12px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    lineWidth: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
  };

  const noop = () => {};
  const methods = [
    'setTransform',
    'clearRect',
    'save',
    'scale',
    'fillRect',
    'fillText',
    'restore',
    'beginPath',
    'rect',
    'clip',
    'fill',
    'stroke',
    'arc',
    'moveTo',
    'lineTo',
    'closePath',
    'quadraticCurveTo',
  ];

  for (const method of methods) {
    target[method] = noop;
  }

  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) {
        return obj[prop as keyof typeof obj];
      }
      return noop;
    },
    set(obj, prop, value) {
      obj[prop as keyof typeof obj] = value;
      return true;
    },
  }) as MockCanvasContext;
}

(() => {
  const ctx = createMockCanvasContext();
  const hoverRegion: VrTracksInteractiveRegion = {
    targetType: 'tracks-color',
    channelId: 'channel-1',
    color: '#abcdef',
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  };

  const hud = {
    panelCanvas: { width: 1024, height: 768 },
    panelContext: ctx,
    panelDisplayWidth: 1024,
    panelDisplayHeight: 768,
    panelTexture: { needsUpdate: false },
    pixelRatio: 1,
    width: 1.4,
    height: 1,
    regions: [],
    hoverRegion,
  } as unknown as VrTracksHud;

  const state: VrTracksState = {
    channels: [
      {
        id: 'channel-1',
        name: 'Channel 1',
        opacity: 0.8,
        lineWidth: 1,
        colorMode: { type: 'uniform', color: '#ff5500' },
        totalTracks: 0,
        visibleTracks: 0,
        followedTrackId: null,
        scrollOffset: 0,
        tracks: [],
      },
    ],
    activeChannelId: 'channel-1',
  };

  renderVrTracksHud(hud, state);

  assert.ok(hud.regions.length > 0, 'expected interaction regions to be emitted');
  assert.ok(ctx.__roundRectCalls > 0, 'expected native roundRect path to be used when available');
  assert.equal(hud.hoverRegion, null, 'stale hover region should be cleared when no longer valid');
  assert.equal((hud.panelTexture as unknown as { needsUpdate: boolean }).needsUpdate, true);
})();

(() => {
  const ctx = createMockCanvasContext();
  const hoverRegion: VrTracksInteractiveRegion = {
    targetType: 'tracks-follow',
    channelId: 'channel-1',
    trackId: 'missing-track',
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  };

  const hud = {
    panelCanvas: { width: 1024, height: 820 },
    panelContext: ctx,
    panelDisplayWidth: 1024,
    panelDisplayHeight: 820,
    panelTexture: { needsUpdate: false },
    pixelRatio: 1,
    width: 1.4,
    height: 1,
    regions: [],
    hoverRegion,
  } as unknown as VrTracksHud;

  const tracks = Array.from({ length: 5 }, (_, index) => ({
    id: `track-${index}`,
    trackNumber: index + 1,
    label: `Track ${index + 1}`,
    color: '#ff5500',
    explicitVisible: index % 2 === 0,
    visible: index % 2 === 0,
    isFollowed: index === 2,
    isSelected: false,
  }));

  const state: VrTracksState = {
    channels: [
      {
        id: 'channel-1',
        name: 'Channel 1',
        opacity: 0.85,
        lineWidth: 1.7,
        colorMode: { type: 'uniform', color: '#ff5500' },
        totalTracks: tracks.length,
        visibleTracks: tracks.filter((track) => track.visible).length,
        followedTrackId: 'track-2',
        scrollOffset: 0.4,
        tracks,
      },
    ],
    activeChannelId: 'channel-1',
  };

  renderVrTracksHud(hud, state);

  assert.ok(hud.regions.some((region) => region.targetType === 'tracks-slider'));
  assert.ok(hud.regions.some((region) => region.targetType === 'tracks-color-mode'));
  assert.ok(hud.regions.some((region) => region.targetType === 'tracks-toggle'));
  assert.ok(hud.regions.some((region) => region.targetType === 'tracks-follow'));
  assert.ok(hud.regions.some((region) => region.targetType === 'tracks-scroll'));
  assert.equal(hud.hoverRegion, null, 'stale hover region should be cleared when no longer valid');
  assert.equal((hud.panelTexture as unknown as { needsUpdate: boolean }).needsUpdate, true);
})();

(() => {
  const ctx = createMockCanvasContext();
  const hoverRegion: VrChannelsInteractiveRegion = {
    targetType: 'channels-color',
    channelId: 'missing',
    layerKey: 'missing-layer',
    color: '#ffffff',
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  };

  const hud = {
    panelCanvas: { width: 1024, height: 256 },
    panelContext: ctx,
    panelDisplayWidth: 1024,
    panelDisplayHeight: 220,
    panelTexture: { needsUpdate: false },
    pixelRatio: 1,
    width: 1.4,
    height: 1,
    regions: [],
    hoverRegion,
  } as unknown as VrChannelsHud;

  const state: VrChannelsState = {
    channels: [],
    activeChannelId: null,
  };

  const desiredHeight = renderVrChannelsHud(hud, state);

  assert.ok(typeof desiredHeight === 'number' && desiredHeight > hud.panelDisplayHeight);
  assert.deepStrictEqual(hud.regions, []);
  assert.equal(hud.hoverRegion, null);
})();

(() => {
  const ctx = createMockCanvasContext();
  const hoverRegion: VrChannelsInteractiveRegion = {
    targetType: 'channels-slider',
    channelId: 'missing-channel',
    layerKey: 'missing-layer',
    sliderKey: 'windowMin',
    bounds: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
  };

  const hud = {
    panelCanvas: { width: 1024, height: 1800 },
    panelContext: ctx,
    panelDisplayWidth: 1024,
    panelDisplayHeight: 1800,
    panelTexture: { needsUpdate: false },
    pixelRatio: 1,
    width: 1.4,
    height: 1,
    regions: [],
    hoverRegion,
  } as unknown as VrChannelsHud;

  const state: VrChannelsState = {
    channels: [
      {
        id: 'channel-1',
        name: 'Channel 1',
        visible: true,
        activeLayerKey: 'layer-1',
        layers: [
          {
            key: 'layer-1',
            label: 'Layer 1',
            hasData: true,
            isGrayscale: true,
            isSegmentation: false,
            defaultWindow: { windowMin: 0, windowMax: 1 },
            histogram: new Uint32Array([0, 2, 4, 3, 1]),
            settings: {
              sliderRange: 20,
              minSliderIndex: 0,
              maxSliderIndex: 20,
              brightnessSliderIndex: 11,
              contrastSliderIndex: 9,
              windowMin: 0.1,
              windowMax: 0.9,
              color: '#ffffff',
              xOffset: 0.5,
              yOffset: -0.5,
              renderStyle: 0,
              blDensityScale: 1,
              blBackgroundCutoff: 0.08,
              blOpacityScale: 1,
              blEarlyExitAlpha: 0.98,
              invert: false,
              samplingMode: 'linear',
            },
          },
        ],
      },
    ],
    activeChannelId: 'channel-1',
  };

  const desiredHeight = renderVrChannelsHud(hud, state);

  assert.ok(
    desiredHeight === null || (typeof desiredHeight === 'number' && desiredHeight > 0),
    'expected HUD renderer to either update in-place or request a valid display height',
  );
  assert.ok(hud.regions.some((region) => region.targetType === 'channels-tab'));
  assert.ok(hud.regions.some((region) => region.targetType === 'channels-slider'));
  assert.ok(hud.regions.some((region) => region.targetType === 'channels-color'));
  assert.equal(hud.hoverRegion, null, 'stale hover region should be cleared when no longer valid');
  if (desiredHeight === null) {
    assert.equal((hud.panelTexture as unknown as { needsUpdate: boolean }).needsUpdate, true);
  }
})();

console.log('hudRenderers tests passed');
