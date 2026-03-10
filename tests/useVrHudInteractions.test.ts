import assert from 'node:assert/strict';
import * as THREE from 'three';

import { useVrHudInteractions } from '../src/components/viewers/volume-viewer/useVolumeViewerVr/useVrHudInteractions.ts';
import type {
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrChannelsState,
  VrTracksHud,
  VrTracksInteractiveRegion,
  VrTracksState,
} from '../src/components/viewers/volume-viewer/vr/types.ts';
import { createDefaultLayerSettings } from '../src/state/layerSettings.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useVrHudInteractions tests');

type HudHarness = {
  hook: ReturnType<typeof renderHook>;
  channelsStateRef: { current: VrChannelsState };
  tracksStateRef: { current: VrTracksState };
  renderChannelsCalls: number;
  renderTracksCalls: number;
  layerOffsetCalls: Array<{ layerKey: string; axis: 'x' | 'y'; value: number }>;
  trackOpacityCalls: Array<{ channelId: string; value: number }>;
};

const createHarness = (): HudHarness => {
  let renderChannelsCalls = 0;
  let renderTracksCalls = 0;
  const layerOffsetCalls: Array<{ layerKey: string; axis: 'x' | 'y'; value: number }> = [];
  const trackOpacityCalls: Array<{ channelId: string; value: number }> = [];

  const vrChannelsStateRef = {
    current: {
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
              defaultWindow: null,
              histogram: null,
              settings: createDefaultLayerSettings({ windowMin: 0, windowMax: 1 }),
            },
          ],
        },
      ],
      activeChannelId: 'channel-1',
    } satisfies VrChannelsState,
  };

  const vrTracksStateRef = {
    current: {
      channels: [
        {
          id: 'channel-1',
          name: 'Channel 1',
          opacity: 0.2,
          lineWidth: 0.3,
          colorMode: { type: 'random' },
          totalTracks: 0,
          visibleTracks: 0,
          followedTrackId: null,
          scrollOffset: 0,
          tracks: [],
        },
      ],
      activeChannelId: 'channel-1',
    } satisfies VrTracksState,
  };

  const channelsHudRef = {
    current: {
      panel: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()),
    } as unknown as VrChannelsHud,
  };

  const tracksHudRef = {
    current: {
      panel: new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()),
    } as unknown as VrTracksHud,
  };

  const hook = renderHook(() =>
    useVrHudInteractions({
      vrChannelsHudRef: channelsHudRef,
      vrTracksHudRef: tracksHudRef,
      sliderLocalPointRef: { current: new THREE.Vector3() },
      vrChannelsStateRef,
      vrTracksStateRef,
      renderVrChannelsHud: () => {
        renderChannelsCalls += 1;
      },
      renderVrTracksHud: () => {
        renderTracksCalls += 1;
      },
      onLayerOffsetChange: (layerKey, axis, value) => {
        layerOffsetCalls.push({ layerKey, axis, value });
      },
      onTrackOpacityChange: (channelId, value) => {
        trackOpacityCalls.push({ channelId, value });
      },
    }),
  );

  return {
    hook,
    channelsStateRef: vrChannelsStateRef,
    tracksStateRef: vrTracksStateRef,
    get renderChannelsCalls() {
      return renderChannelsCalls;
    },
    get renderTracksCalls() {
      return renderTracksCalls;
    },
    layerOffsetCalls,
    trackOpacityCalls,
  };
};

(() => {
  const harness = createHarness();
  const sliderRegion: VrChannelsInteractiveRegion = {
    targetType: 'channels-slider',
    channelId: 'channel-1',
    layerKey: 'layer-1',
    sliderKey: 'xOffset',
    min: -1,
    max: 1,
    step: 0.5,
    bounds: { minX: 0, maxX: 1, minY: -0.1, maxY: 0.1 },
    sliderTrack: { minX: 0, maxX: 1, y: 0 },
  };

  harness.hook.act(() => {
    harness.hook.result.applyVrChannelsSliderFromPoint(sliderRegion, new THREE.Vector3(0.76, 0, 0));
  });

  assert.strictEqual(harness.channelsStateRef.current.channels[0]?.layers[0]?.settings.xOffset, 0.5);
  assert.deepStrictEqual(harness.layerOffsetCalls, [
    { layerKey: 'layer-1', axis: 'x', value: 0.5 },
  ]);
  assert.strictEqual(harness.renderChannelsCalls, 1);

  harness.hook.act(() => {
    harness.hook.result.applyVrChannelsSliderFromPoint(
      { ...sliderRegion, disabled: true },
      new THREE.Vector3(0.2, 0, 0),
    );
  });

  assert.strictEqual(harness.channelsStateRef.current.channels[0]?.layers[0]?.settings.xOffset, 0.5);
  assert.strictEqual(harness.renderChannelsCalls, 1);
  harness.hook.unmount();
})();

(() => {
  const harness = createHarness();
  const opacityRegion: VrTracksInteractiveRegion = {
    targetType: 'tracks-slider',
    channelId: 'channel-1',
    sliderKey: 'opacity',
    min: 0,
    max: 1,
    step: 0.1,
    bounds: { minX: 0, maxX: 1, minY: -0.1, maxY: 0.1 },
    sliderTrack: { minX: 0, maxX: 1, y: 0 },
  };

  harness.hook.act(() => {
    harness.hook.result.applyVrTracksSliderFromPoint(opacityRegion, new THREE.Vector3(0.34, 0, 0));
  });

  assert.ok(Math.abs((harness.tracksStateRef.current.channels[0]?.opacity ?? 0) - 0.3) < 1e-6);
  assert.strictEqual(harness.trackOpacityCalls.length, 1);
  assert.strictEqual(harness.trackOpacityCalls[0]?.channelId, 'channel-1');
  assert.ok(Math.abs((harness.trackOpacityCalls[0]?.value ?? 0) - 0.3) < 1e-6);
  assert.strictEqual(harness.renderTracksCalls, 1);

  const scrollRegion: VrTracksInteractiveRegion = {
    targetType: 'tracks-scroll',
    channelId: 'channel-1',
    bounds: { minX: -0.1, maxX: 0.1, minY: 0, maxY: 1 },
    verticalSliderTrack: {
      x: 0,
      minY: 0,
      maxY: 1,
      visibleRows: 2,
      totalRows: 5,
    },
  };

  harness.hook.act(() => {
    harness.hook.result.applyVrTracksScrollFromPoint(scrollRegion, new THREE.Vector3(0, 0.74, 0));
  });

  assert.ok(Math.abs((harness.tracksStateRef.current.channels[0]?.scrollOffset ?? 0) - 2 / 3) < 1e-6);
  assert.strictEqual(harness.renderTracksCalls, 2);

  harness.hook.act(() => {
    harness.hook.result.applyVrTracksScrollFromPoint(scrollRegion, new THREE.Vector3(0, 0.73, 0));
  });

  assert.strictEqual(harness.renderTracksCalls, 2);
  harness.hook.unmount();
})();

console.log('useVrHudInteractions tests passed');
