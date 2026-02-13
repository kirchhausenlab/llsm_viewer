import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';

import { resolveControllerUiCandidates } from '../src/components/viewers/volume-viewer/vr/controllerRayHudCandidates.ts';
import { resolvePlaybackUiCandidate } from '../src/components/viewers/volume-viewer/vr/controllerRayPlaybackCandidates.ts';
import { resolveChannelsUiCandidate } from '../src/components/viewers/volume-viewer/vr/controllerRayChannelsCandidates.ts';
import { resolveTracksUiCandidate } from '../src/components/viewers/volume-viewer/vr/controllerRayTracksCandidates.ts';
import type {
  ControllerEntry,
  PlaybackState,
  VrChannelsHud,
  VrChannelsInteractiveRegion,
  VrPlaybackHud,
  VrTracksHud,
  VrTracksInteractiveRegion,
} from '../src/components/viewers/volume-viewer/vr/types.ts';

const ref = <T,>(current: T) => ({ current });

function createControllerEntry(overrides: Partial<ControllerEntry> = {}): ControllerEntry {
  const rayGeometry = new THREE.BufferGeometry();
  const rayMaterial = new THREE.LineBasicMaterial();
  const ray = new THREE.Line(rayGeometry, rayMaterial);
  const controller = new THREE.Group();
  controller.visible = true;

  return {
    controller,
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
    isConnected: true,
    targetRayMode: null,
    gamepad: null,
    hoverTrackId: null,
    hoverUiTarget: null,
    activeUiTarget: null,
    hoverUiPoint: new THREE.Vector3(),
    hasHoverUiPoint: false,
    hoverPoint: new THREE.Vector3(),
    rayOrigin: new THREE.Vector3(0, 0, 0),
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
}

function createPlaybackState(): PlaybackState {
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
  };
}

function createPlaybackHud(handleX = 0.04): VrPlaybackHud {
  const group = new THREE.Group();
  group.visible = true;

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial());
  panel.position.set(0, 0, -1);
  group.add(panel);

  const panelTranslateHandle = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial());
  panelTranslateHandle.position.set(handleX, 0, 0);
  group.add(panelTranslateHandle);

  const panelPitchHandle = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial());
  panelPitchHandle.position.set(0, -0.25, 0);
  group.add(panelPitchHandle);

  const playButton = new THREE.Mesh(new THREE.CircleGeometry(0.02), new THREE.MeshBasicMaterial());
  const resetVolumeButton = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial());
  const resetHudButton = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial());
  const exitButton = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial());
  const modeButton = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial());

  playButton.position.set(0, -0.14, 0.001);
  resetVolumeButton.position.set(-0.2, 0.1, 0.001);
  resetHudButton.position.set(-0.05, 0.1, 0.001);
  exitButton.position.set(0.1, 0.1, 0.001);
  modeButton.position.set(0.25, 0.1, 0.001);

  group.add(playButton, resetVolumeButton, resetHudButton, exitButton, modeButton);

  const playbackSliderGroup = new THREE.Group();
  playbackSliderGroup.position.set(0, -0.08, 0.001);
  const playbackSliderHitArea = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.08), new THREE.MeshBasicMaterial());
  playbackSliderGroup.add(playbackSliderHitArea);
  group.add(playbackSliderGroup);

  const fpsSliderGroup = new THREE.Group();
  fpsSliderGroup.position.set(0, 0.01, 0.001);
  const fpsSliderHitArea = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.08), new THREE.MeshBasicMaterial());
  fpsSliderGroup.add(fpsSliderHitArea);
  group.add(fpsSliderGroup);

  return {
    group,
    panel,
    panelTranslateHandle,
    panelYawHandles: [],
    panelPitchHandle,
    playButton,
    resetVolumeButton,
    resetHudButton,
    exitButton,
    modeButton,
    playbackSliderGroup,
    playbackSliderHitArea,
    playbackSliderWidth: 0.4,
    fpsSliderGroup,
    fpsSliderHitArea,
    fpsSliderWidth: 0.4,
    resetVolumeButtonHalfWidth: 0.05,
    resetVolumeButtonHalfHeight: 0.025,
    resetHudButtonHalfWidth: 0.05,
    resetHudButtonHalfHeight: 0.025,
    exitButtonHalfWidth: 0.05,
    exitButtonHalfHeight: 0.025,
    modeButtonHalfWidth: 0.05,
    modeButtonHalfHeight: 0.025,
  } as unknown as VrPlaybackHud;
}

function createChannelsHud(handleX = 0.03): VrChannelsHud {
  const group = new THREE.Group();
  group.visible = true;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  panel.position.set(0, 0, -1);
  group.add(panel);
  const panelTranslateHandle = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial());
  panelTranslateHandle.position.set(handleX, 0, 0);
  group.add(panelTranslateHandle);

  return {
    group,
    panel,
    width: 1,
    height: 1,
    panelTranslateHandle,
    panelYawHandles: [],
    panelPitchHandle: null,
  } as unknown as VrChannelsHud;
}

function createTracksHud(handleX = 0.02): VrTracksHud {
  const group = new THREE.Group();
  group.visible = true;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  panel.position.set(0, 0, -1);
  group.add(panel);
  const panelTranslateHandle = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial());
  panelTranslateHandle.position.set(handleX, 0, 0);
  group.add(panelTranslateHandle);

  return {
    group,
    panel,
    width: 1,
    height: 1,
    panelTranslateHandle,
    panelYawHandles: [],
    panelPitchHandle: null,
  } as unknown as VrTracksHud;
}

test('resolveControllerUiCandidates chooses nearest category candidate', () => {
  const entry = createControllerEntry();
  const playbackHud = createPlaybackHud(0.04);
  const channelsHud = createChannelsHud(0.03);
  const tracksHud = createTracksHud(0.02);

  const result = resolveControllerUiCandidates({
    entry,
    playbackStateRef: ref(createPlaybackState()),
    playbackHudInstance: playbackHud,
    channelsHudInstance: channelsHud,
    tracksHudInstance: tracksHud,
    resolveChannelsRegionFromPoint: () => null,
    resolveTracksRegionFromPoint: () => null,
    applyPlaybackSliderFromWorldPointRef: ref(null),
    applyFpsSliderFromWorldPointRef: ref(null),
    applyVrChannelsSliderFromPointRef: ref(null),
    applyVrTracksSliderFromPointRef: ref(null),
    applyVrTracksScrollFromPointRef: ref(null),
    vrHudPlaneRef: ref(new THREE.Plane()),
    vrHudPlanePointRef: ref(new THREE.Vector3()),
    vrHudForwardRef: ref(new THREE.Vector3(0, 0, 1)),
    vrHandleWorldPointRef: ref(new THREE.Vector3()),
    vrHandleSecondaryPointRef: ref(new THREE.Vector3()),
    vrChannelsLocalPointRef: ref(new THREE.Vector3()),
    vrTracksLocalPointRef: ref(new THREE.Vector3()),
    playbackTouchPoint: new THREE.Vector3(),
    playbackLocalPoint: new THREE.Vector3(),
    playbackPlaneNormal: new THREE.Vector3(),
    playbackSliderPoint: new THREE.Vector3(),
    fpsSliderPoint: new THREE.Vector3(),
    channelsTouchPoint: new THREE.Vector3(),
    tracksTouchPoint: new THREE.Vector3(),
    playbackCandidatePoint: new THREE.Vector3(),
    channelsCandidatePoint: new THREE.Vector3(),
    tracksCandidatePoint: new THREE.Vector3(),
    uiRayLength: null,
    nextChannelsHoverRegion: null,
    nextTracksHoverRegion: null,
  });

  assert.equal(entry.hoverUiTarget?.type, 'tracks-panel-grab');
  assert.ok(typeof result.uiRayLength === 'number');
});

test('resolvePlaybackUiCandidate returns panel-grab candidate for nearby handle', () => {
  const entry = createControllerEntry();
  const playbackHud = createPlaybackHud(0.03);

  const candidate = resolvePlaybackUiCandidate({
    entry,
    playbackStateRef: ref(createPlaybackState()),
    playbackHudInstance: playbackHud,
    applyPlaybackSliderFromWorldPointRef: ref(null),
    applyFpsSliderFromWorldPointRef: ref(null),
    vrHudPlaneRef: ref(new THREE.Plane()),
    vrHudPlanePointRef: ref(new THREE.Vector3()),
    vrHudForwardRef: ref(new THREE.Vector3(0, 0, 1)),
    vrHandleWorldPointRef: ref(new THREE.Vector3()),
    vrHandleSecondaryPointRef: ref(new THREE.Vector3()),
    playbackTouchPoint: new THREE.Vector3(),
    playbackLocalPoint: new THREE.Vector3(),
    playbackPlaneNormal: new THREE.Vector3(),
    playbackSliderPoint: new THREE.Vector3(),
    fpsSliderPoint: new THREE.Vector3(),
    playbackCandidatePoint: new THREE.Vector3(),
  });

  assert.equal(candidate?.target.type, 'playback-panel-grab');
});

test('resolveChannelsUiCandidate keeps active slider region while locked', () => {
  const activeRegion: VrChannelsInteractiveRegion = {
    targetType: 'channels-slider',
    channelId: 'c1',
    layerKey: 'layer-1',
    sliderKey: 'windowMin',
    min: 0,
    max: 1,
    step: 0.1,
    bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
    sliderTrack: { minX: -1, maxX: 1, y: 0 },
  };

  let channelsSliderApplyCalls = 0;
  const entry = createControllerEntry({
    isSelecting: true,
    activeUiTarget: {
      type: 'channels-slider',
      object: new THREE.Object3D(),
      data: activeRegion,
    },
  });

  const channelsHud = createChannelsHud(0.2);
  const result = resolveChannelsUiCandidate({
    entry,
    channelsHudInstance: channelsHud,
    resolveChannelsRegionFromPoint: () => null,
    applyVrChannelsSliderFromPointRef: ref(() => {
      channelsSliderApplyCalls += 1;
    }),
    vrHudPlaneRef: ref(new THREE.Plane()),
    vrHudPlanePointRef: ref(new THREE.Vector3()),
    vrHudForwardRef: ref(new THREE.Vector3(0, 0, 1)),
    vrHandleWorldPointRef: ref(new THREE.Vector3()),
    vrHandleSecondaryPointRef: ref(new THREE.Vector3()),
    vrChannelsLocalPointRef: ref(new THREE.Vector3()),
    channelsTouchPoint: new THREE.Vector3(),
    channelsCandidatePoint: new THREE.Vector3(),
  });

  assert.equal(result.candidate?.target.type, 'channels-slider');
  assert.equal(result.hoverRegion, activeRegion);
  assert.equal(channelsSliderApplyCalls, 1);
});

test('resolveTracksUiCandidate continues active scroll interaction', () => {
  const activeRegion: VrTracksInteractiveRegion = {
    targetType: 'tracks-scroll',
    channelId: 'c1',
    bounds: { minX: -1, maxX: 1, minY: -1, maxY: 1 },
    verticalSliderTrack: { x: 0, minY: -1, maxY: 1, visibleRows: 4, totalRows: 8 },
  };

  let scrollCalls = 0;
  const entry = createControllerEntry({
    isSelecting: true,
    activeUiTarget: {
      type: 'tracks-scroll',
      object: new THREE.Object3D(),
      data: activeRegion,
    },
  });

  const tracksHud = createTracksHud(0.2);
  const result = resolveTracksUiCandidate({
    entry,
    tracksHudInstance: tracksHud,
    resolveTracksRegionFromPoint: () => null,
    applyVrTracksSliderFromPointRef: ref(null),
    applyVrTracksScrollFromPointRef: ref(() => {
      scrollCalls += 1;
    }),
    vrHudPlaneRef: ref(new THREE.Plane()),
    vrHudPlanePointRef: ref(new THREE.Vector3()),
    vrHudForwardRef: ref(new THREE.Vector3(0, 0, 1)),
    vrHandleWorldPointRef: ref(new THREE.Vector3()),
    vrHandleSecondaryPointRef: ref(new THREE.Vector3()),
    vrTracksLocalPointRef: ref(new THREE.Vector3()),
    tracksTouchPoint: new THREE.Vector3(),
    tracksCandidatePoint: new THREE.Vector3(),
  });

  assert.equal(result.candidate?.target.type, 'tracks-scroll');
  assert.equal(scrollCalls, 1);
});
