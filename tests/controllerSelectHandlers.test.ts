import assert from 'node:assert/strict';
import * as THREE from 'three';

import { handleControllerConnected, handleControllerDisconnected } from '../src/components/viewers/volume-viewer/vr/controllerConnectionLifecycle.ts';
import { handleControllerSelectStart } from '../src/components/viewers/volume-viewer/vr/controllerSelectStart.ts';
import { handleControllerSelectEnd } from '../src/components/viewers/volume-viewer/vr/controllerSelectEnd.ts';
import type {
  ControllerEntry,
  PlaybackState,
  VrChannelsState,
  VrTracksInteractiveRegion,
  VrTracksState,
} from '../src/components/viewers/volume-viewer/vr/types.ts';

const ref = <T,>(current: T) => ({ current });

function createPlaybackState(overrides: Partial<PlaybackState> = {}): PlaybackState {
  return {
    isPlaying: false,
    playbackDisabled: false,
    playbackLabel: 'Paused',
    fps: 30,
    timeIndex: 0,
    totalTimepoints: 10,
    onTogglePlayback: () => {},
    onTimeIndexChange: () => {},
    onFpsChange: () => {},
    passthroughSupported: false,
    preferredSessionMode: 'immersive-vr',
    currentSessionMode: null,
    ...overrides,
  };
}

function createControllerEntry(overrides: Partial<ControllerEntry> = {}): ControllerEntry {
  const rayGeometry = new THREE.BufferGeometry();
  const rayMaterial = new THREE.LineBasicMaterial();
  const ray = new THREE.Line(rayGeometry, rayMaterial);

  const entry: ControllerEntry = {
    controller: new THREE.Group(),
    grip: new THREE.Group(),
    ray,
    rayGeometry,
    rayMaterial,
    touchIndicator: new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial()),
    raycaster: new THREE.Raycaster(),
    onConnected: () => {},
    onDisconnected: () => {},
    onSelectStart: () => {},
    onSelectEnd: () => {},
    isConnected: false,
    targetRayMode: null,
    gamepad: null,
    hoverTrackId: null,
    hoverUiTarget: null,
    activeUiTarget: null,
    hoverUiPoint: new THREE.Vector3(),
    hasHoverUiPoint: false,
    hoverPoint: new THREE.Vector3(),
    rayOrigin: new THREE.Vector3(),
    rayDirection: new THREE.Vector3(0, 0, -1),
    rayLength: 3,
    isSelecting: false,
    hudGrabOffsets: { playback: null, channels: null, tracks: null },
    translateGrabOffset: null,
    scaleGrabOffset: null,
    volumeScaleState: null,
    volumeRotationState: null,
    hudRotationState: null,
    ...overrides,
  };
  return entry;
}

function createSelectStartDeps(overrides: Record<string, unknown> = {}) {
  return {
    rendererRef: ref<THREE.WebGLRenderer | null>(null),
    cameraRef: ref<THREE.PerspectiveCamera | null>(null),
    playbackStateRef: ref(createPlaybackState()),
    applyPlaybackSliderFromWorldPointRef: ref<((worldPoint: THREE.Vector3) => void) | null>(null),
    applyFpsSliderFromWorldPointRef: ref<((worldPoint: THREE.Vector3) => void) | null>(null),
    vrPlaybackHudRef: ref(null),
    vrPlaybackHudPlacementRef: ref(null),
    vrPlaybackHudDragTargetRef: ref(new THREE.Vector3()),
    vrChannelsHudRef: ref(null),
    vrChannelsHudPlacementRef: ref(null),
    vrChannelsHudDragTargetRef: ref(new THREE.Vector3()),
    vrTracksHudRef: ref(null),
    vrTracksHudPlacementRef: ref(null),
    vrTracksHudDragTargetRef: ref(new THREE.Vector3()),
    applyVrChannelsSliderFromPointRef: ref<((region: unknown, point: THREE.Vector3) => void) | null>(null),
    applyVrTracksSliderFromPointRef: ref<((region: unknown, point: THREE.Vector3) => void) | null>(null),
    applyVrTracksScrollFromPointRef: ref<((region: unknown, point: THREE.Vector3) => void) | null>(null),
    vrTranslationHandleRef: ref<THREE.Mesh | null>(null),
    vrVolumeScaleHandleRef: ref<THREE.Mesh | null>(null),
    vrHandleWorldPointRef: ref(new THREE.Vector3()),
    vrHandleSecondaryPointRef: ref(new THREE.Vector3()),
    vrHandleDirectionTempRef: ref(new THREE.Vector3()),
    volumeRootGroupRef: ref<THREE.Group | null>(null),
    volumeRootCenterUnscaledRef: ref(new THREE.Vector3()),
    volumeUserScaleRef: ref(1),
    volumeYawRef: ref(0),
    volumePitchRef: ref(0),
    vrHudYawVectorRef: ref(new THREE.Vector3()),
    vrHudPitchVectorRef: ref(new THREE.Vector3()),
    log: () => {},
    ...overrides,
  } as const;
}

function createSelectEndDeps(overrides: Record<string, unknown> = {}) {
  return {
    playbackStateRef: ref(createPlaybackState()),
    applyPlaybackSliderFromWorldPointRef: ref<((worldPoint: THREE.Vector3) => void) | null>(null),
    applyFpsSliderFromWorldPointRef: ref<((worldPoint: THREE.Vector3) => void) | null>(null),
    onResetVolumeRef: ref<(() => void) | null>(null),
    onResetHudPlacementRef: ref<(() => void) | null>(null),
    endVrSessionRequestRef: ref<(() => Promise<void> | void) | null>(null),
    toggleXrSessionMode: () => {},
    vrChannelsStateRef: ref<VrChannelsState>({ channels: [], activeChannelId: null }),
    vrTracksStateRef: ref<VrTracksState>({ channels: [], activeChannelId: null }),
    updateVrChannelsHudRef: ref<(() => void) | null>(null),
    onTrackFollowRequestRef: ref<((trackId: string) => void) | null>(null),
    vrPropsRef: ref(null),
    applyVrChannelsSliderFromPointRef: ref<((region: unknown, point: THREE.Vector3) => void) | null>(null),
    applyVrTracksSliderFromPointRef: ref<((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null>(null),
    applyVrTracksScrollFromPointRef: ref<((region: VrTracksInteractiveRegion, point: THREE.Vector3) => void) | null>(null),
    log: () => {},
    ...overrides,
  } as const;
}

(() => {
  const entry = createControllerEntry({
    isConnected: false,
    targetRayMode: null,
    gamepad: null,
    hoverTrackId: 'track-1',
    hoverUiTarget: { type: 'tracks-tab', data: null },
    activeUiTarget: { type: 'tracks-follow', data: null },
  });
  entry.touchIndicator.visible = true;

  let refreshCount = 0;
  let clearCount = 0;
  handleControllerConnected(
    entry,
    0,
    { data: { targetRayMode: 'tracked-pointer', gamepad: {} as Gamepad } },
    () => {},
    () => {
      refreshCount += 1;
    },
  );

  assert.equal(entry.isConnected, true);
  assert.equal(entry.targetRayMode, 'tracked-pointer');
  assert.equal(entry.hoverTrackId, null);
  assert.equal(entry.activeUiTarget, null);
  assert.equal(refreshCount, 1);

  handleControllerDisconnected(
    entry,
    0,
    () => {},
    () => {
      refreshCount += 1;
    },
    ref(() => {
      clearCount += 1;
    }),
  );

  assert.equal(entry.isConnected, false);
  assert.equal(entry.isSelecting, false);
  assert.equal(entry.touchIndicator.visible, false);
  assert.equal(refreshCount, 2);
  assert.equal(clearCount, 1);
})();

(() => {
  const entry = createControllerEntry({
    hoverUiTarget: { type: 'playback-play-toggle', data: null },
  });
  const playbackState = createPlaybackState({ playbackDisabled: true });

  handleControllerSelectStart(
    entry,
    1,
    createSelectStartDeps({ playbackStateRef: ref(playbackState) }),
  );

  assert.equal(entry.isSelecting, true);
  assert.equal(entry.activeUiTarget, null, 'disabled playback should suppress play-toggle activation');
})();

(() => {
  const sliderRegion: VrTracksInteractiveRegion = {
    targetType: 'tracks-slider',
    channelId: 'channel-1',
    sliderKey: 'opacity',
    min: 0,
    max: 1,
    step: 0.05,
    bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
    sliderTrack: { minX: -0.5, maxX: 0.5, y: 0 },
    disabled: false,
  };
  const entry = createControllerEntry({
    hoverUiTarget: { type: 'tracks-slider', data: sliderRegion },
    hasHoverUiPoint: true,
    hoverUiPoint: new THREE.Vector3(1, 2, 3),
  });
  const calls: Array<{ region: VrTracksInteractiveRegion; point: THREE.Vector3 }> = [];

  handleControllerSelectStart(
    entry,
    2,
    createSelectStartDeps({
      applyVrTracksSliderFromPointRef: ref((region: VrTracksInteractiveRegion, point: THREE.Vector3) => {
        calls.push({ region, point: point.clone() });
      }),
    }),
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.region.sliderKey, 'opacity');
  assert.deepEqual(calls[0]?.point.toArray(), [1, 2, 3]);
})();

(() => {
  const entry = createControllerEntry({
    activeUiTarget: {
      type: 'channels-tab',
      data: {
        targetType: 'channels-tab',
        channelId: 'channel-b',
        bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
      },
    },
  });
  let selectedChannel: string | null = null;
  let refreshCount = 0;
  const channelState: VrChannelsState = {
    channels: [],
    activeChannelId: 'channel-a',
  };

  handleControllerSelectEnd(
    entry,
    3,
    createSelectEndDeps({
      vrChannelsStateRef: ref(channelState),
      updateVrChannelsHudRef: ref(() => {
        refreshCount += 1;
      }),
      vrPropsRef: ref({
        onChannelPanelSelect: (channelId: string) => {
          selectedChannel = channelId;
        },
      }),
    }),
  );

  assert.equal(selectedChannel, 'channel-b');
  assert.equal(channelState.activeChannelId, 'channel-b');
  assert.equal(refreshCount, 1);
})();

(() => {
  const entry = createControllerEntry({
    activeUiTarget: {
      type: 'tracks-follow',
      data: {
        targetType: 'tracks-follow',
        channelId: 'channel-1',
        trackId: 'track-42',
        bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
      },
    },
  });

  let followedTrackId: string | null = null;
  handleControllerSelectEnd(
    entry,
    4,
    createSelectEndDeps({
      onTrackFollowRequestRef: ref((trackId: string) => {
        followedTrackId = trackId;
      }),
    }),
  );

  assert.equal(followedTrackId, 'track-42');
})();

(() => {
  const playbackState = createPlaybackState();
  let toggled = 0;
  playbackState.onTogglePlayback = () => {
    toggled += 1;
  };

  const entry = createControllerEntry({
    activeUiTarget: { type: 'playback-play-toggle', data: null },
  });

  handleControllerSelectEnd(
    entry,
    5,
    createSelectEndDeps({ playbackStateRef: ref(playbackState) }),
  );

  assert.equal(toggled, 1);
})();
