import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createControllerRayUpdater,
  type ControllerRayDependencies,
} from '../src/components/viewers/volume-viewer/vr/controllerRayUpdater.ts';
import type { ControllerEntry, PlaybackState, VrPlaybackHud } from '../src/components/viewers/volume-viewer/vr/types.ts';

const ref = <T,>(current: T) => ({ current });

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

function createControllerEntry(overrides: Partial<ControllerEntry> = {}): ControllerEntry {
  const rayGeometry = new THREE.BufferGeometry();
  const rayMaterial = new THREE.LineBasicMaterial();
  const ray = new THREE.Line(rayGeometry, rayMaterial);

  const controller = new THREE.Group();
  controller.visible = true;
  controller.updateMatrixWorld(true);

  const grip = new THREE.Group();
  const touchIndicator = new THREE.Mesh(new THREE.SphereGeometry(0.01), new THREE.MeshBasicMaterial());

  const entry: ControllerEntry = {
    controller,
    grip,
    ray,
    rayGeometry,
    rayMaterial,
    touchIndicator,
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

function createPlaybackHud(): VrPlaybackHud {
  const group = new THREE.Group();
  group.visible = true;

  const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshBasicMaterial());
  panel.position.set(0, 0, 0);
  group.add(panel);

  const panelTranslateHandle = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial());
  panelTranslateHandle.position.set(0, 0, 0);
  group.add(panelTranslateHandle);

  const yawLeft = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial());
  yawLeft.position.set(-0.5, 0, 0);
  const yawRight = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial());
  yawRight.position.set(0.5, 0, 0);
  group.add(yawLeft);
  group.add(yawRight);

  const panelPitchHandle = new THREE.Mesh(new THREE.SphereGeometry(0.02), new THREE.MeshBasicMaterial());
  panelPitchHandle.position.set(0, -0.3, 0);
  group.add(panelPitchHandle);

  const playButton = new THREE.Mesh(new THREE.CircleGeometry(0.02), new THREE.MeshBasicMaterial());
  playButton.position.set(0, -0.14, 0.001);
  group.add(playButton);

  const resetVolumeButton = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial());
  resetVolumeButton.position.set(-0.2, 0.1, 0.001);
  group.add(resetVolumeButton);

  const resetHudButton = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial());
  resetHudButton.position.set(-0.05, 0.1, 0.001);
  group.add(resetHudButton);

  const exitButton = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial());
  exitButton.position.set(0.1, 0.1, 0.001);
  group.add(exitButton);

  const modeButton = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshBasicMaterial());
  modeButton.position.set(0.25, 0.1, 0.001);
  group.add(modeButton);

  const playbackSliderGroup = new THREE.Group();
  playbackSliderGroup.position.set(0, -0.08, 0.001);
  const playbackSliderHitArea = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.08), new THREE.MeshBasicMaterial());
  playbackSliderHitArea.position.set(0, 0, 0.0002);
  playbackSliderGroup.add(playbackSliderHitArea);
  group.add(playbackSliderGroup);

  const fpsSliderGroup = new THREE.Group();
  fpsSliderGroup.position.set(0, 0.01, 0.001);
  const fpsSliderHitArea = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.08), new THREE.MeshBasicMaterial());
  fpsSliderHitArea.position.set(0, 0, 0.0002);
  fpsSliderGroup.add(fpsSliderHitArea);
  group.add(fpsSliderGroup);

  return {
    group,
    panel,
    panelTranslateHandle,
    panelYawHandles: [yawLeft, yawRight],
    panelPitchHandle,
    resetVolumeButton,
    resetHudButton,
    playButton,
    playIcon: new THREE.Group(),
    pauseGroup: new THREE.Group(),
    exitButton,
    modeButton,
    modeLabelTexture: new THREE.CanvasTexture(),
    modeLabelCanvas: null,
    modeLabelContext: null,
    modeLabelText: 'Mode: VR',
    playbackSliderGroup,
    playbackSliderTrack: new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.01), new THREE.MeshBasicMaterial()),
    playbackSliderFill: new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.01), new THREE.MeshBasicMaterial()),
    playbackSliderKnob: new THREE.Mesh(new THREE.CircleGeometry(0.01), new THREE.MeshBasicMaterial()),
    playbackSliderHitArea,
    playbackSliderWidth: 0.4,
    fpsSliderGroup,
    fpsSliderTrack: new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.01), new THREE.MeshBasicMaterial()),
    fpsSliderFill: new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.01), new THREE.MeshBasicMaterial()),
    fpsSliderKnob: new THREE.Mesh(new THREE.CircleGeometry(0.01), new THREE.MeshBasicMaterial()),
    fpsSliderHitArea,
    fpsSliderWidth: 0.4,
    labelMesh: new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), new THREE.MeshBasicMaterial()),
    labelTexture: new THREE.CanvasTexture(),
    labelCanvas: null,
    labelContext: null,
    labelText: '',
    fpsLabelMesh: new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), new THREE.MeshBasicMaterial()),
    fpsLabelTexture: new THREE.CanvasTexture(),
    fpsLabelCanvas: null,
    fpsLabelContext: null,
    fpsLabelText: '',
    interactables: [panelTranslateHandle],
    resetVolumeButtonBaseColor: new THREE.Color(0x2b3340),
    resetHudButtonBaseColor: new THREE.Color(0x2b3340),
    playButtonBaseColor: new THREE.Color(0x2b5fa6),
    playbackSliderTrackBaseColor: new THREE.Color(0x3b414d),
    playbackSliderKnobBaseColor: new THREE.Color(0xffffff),
    fpsSliderTrackBaseColor: new THREE.Color(0x3b414d),
    fpsSliderKnobBaseColor: new THREE.Color(0xffffff),
    exitButtonBaseColor: new THREE.Color(0x512b2b),
    modeButtonBaseColor: new THREE.Color(0x2b3340),
    modeButtonActiveColor: new THREE.Color(0x1f6f3f),
    modeButtonDisabledColor: new THREE.Color(0x3a414d),
    hoverHighlightColor: new THREE.Color(0xffffff),
    resetVolumeButtonHalfWidth: 0.05,
    resetVolumeButtonHalfHeight: 0.025,
    resetHudButtonHalfWidth: 0.05,
    resetHudButtonHalfHeight: 0.025,
    exitButtonHalfWidth: 0.05,
    exitButtonHalfHeight: 0.025,
    modeButtonHalfWidth: 0.05,
    modeButtonHalfHeight: 0.025,
    cachedPosition: new THREE.Vector3(NaN, NaN, NaN),
    cachedYaw: Number.NaN,
    cachedPitch: Number.NaN,
    cacheDirty: true,
  } as unknown as VrPlaybackHud;
}

function createDependencies(options: {
  rendererPresenting: boolean;
  controllerEntry: ControllerEntry;
  playbackHud?: VrPlaybackHud | null;
  applyVrPlaybackHoverState?: (...args: Parameters<ControllerRayDependencies['applyVrPlaybackHoverState']>) => void;
  clearHoverState?: (source?: 'pointer' | 'controller') => void;
}): ControllerRayDependencies {
  const playbackHud = options.playbackHud ?? null;

  return {
    rendererRef: ref({
      xr: {
        isPresenting: options.rendererPresenting,
      },
    } as unknown as THREE.WebGLRenderer),
    cameraRef: ref(new THREE.PerspectiveCamera()),
    containerRef: ref(null),
    controllersRef: ref([options.controllerEntry]),
    trackGroupRef: ref(null),
    trackLinesRef: ref(new Map()),
    playbackStateRef: ref(createPlaybackState()),
    vrLogRef: ref(null),
    lastControllerRaySummaryRef: ref(null),
    applyVrPlaybackHoverState: options.applyVrPlaybackHoverState ?? (() => {}),
    applyVolumeYawPitch: () => {},
    resolveChannelsRegionFromPoint: () => null,
    resolveTracksRegionFromPoint: () => null,
    setVrPlaybackHudPlacementPosition: () => {},
    setVrChannelsHudPlacementPosition: () => {},
    setVrTracksHudPlacementPosition: () => {},
    setVrPlaybackHudPlacementYaw: () => {},
    setVrChannelsHudPlacementYaw: () => {},
    setVrTracksHudPlacementYaw: () => {},
    setVrPlaybackHudPlacementPitch: () => {},
    setVrChannelsHudPlacementPitch: () => {},
    setVrTracksHudPlacementPitch: () => {},
    applyPlaybackSliderFromWorldPointRef: ref(null),
    applyFpsSliderFromWorldPointRef: ref(null),
    vrPlaybackHudRef: ref(playbackHud),
    vrPlaybackHudPlacementRef: ref(null),
    vrPlaybackHudDragTargetRef: ref(new THREE.Vector3()),
    vrChannelsHudRef: ref(null),
    vrChannelsHudPlacementRef: ref(null),
    vrChannelsHudDragTargetRef: ref(new THREE.Vector3()),
    vrTracksHudRef: ref(null),
    vrTracksHudPlacementRef: ref(null),
    vrTracksHudDragTargetRef: ref(new THREE.Vector3()),
    applyVrChannelsSliderFromPointRef: ref(null),
    applyVrTracksSliderFromPointRef: ref(null),
    applyVrTracksScrollFromPointRef: ref(null),
    vrTranslationHandleRef: ref(null),
    vrVolumeScaleHandleRef: ref(null),
    vrVolumeYawHandlesRef: ref([]),
    vrVolumePitchHandleRef: ref(null),
    vrHandleWorldPointRef: ref(new THREE.Vector3()),
    vrHandleSecondaryPointRef: ref(new THREE.Vector3()),
    vrHudYawVectorRef: ref(new THREE.Vector3()),
    vrHudPitchVectorRef: ref(new THREE.Vector3()),
    vrHudForwardRef: ref(new THREE.Vector3(0, 0, 1)),
    vrHudPlaneRef: ref(new THREE.Plane()),
    vrHudPlanePointRef: ref(new THREE.Vector3()),
    vrChannelsLocalPointRef: ref(new THREE.Vector3()),
    vrTracksLocalPointRef: ref(new THREE.Vector3()),
    renderVrChannelsHudRef: ref(null),
    renderVrTracksHudRef: ref(null),
    vrChannelsStateRef: ref({ channels: [], activeChannelId: null }),
    vrTracksStateRef: ref({ channels: [], activeChannelId: null }),
    volumeRootGroupRef: ref(null),
    volumeRootCenterUnscaledRef: ref(new THREE.Vector3()),
    volumeRootBaseOffsetRef: ref(new THREE.Vector3()),
    volumeNormalizationScaleRef: ref(1),
    volumeAnisotropyScaleRef: ref({ x: 1, y: 1, z: 1 }),
    volumeUserScaleRef: ref(1),
    volumeYawRef: ref(0),
    volumePitchRef: ref(0),
    vrUpdateHoverStateRef: ref(null),
    vrClearHoverStateRef: ref(options.clearHoverState ?? (() => {})),
  };
}

(() => {
  const entry = createControllerEntry({ hoverTrackId: 'track-1' });
  const applyCalls: Array<boolean[]> = [];
  const clearCalls: Array<'pointer' | 'controller' | undefined> = [];

  const deps = createDependencies({
    rendererPresenting: false,
    controllerEntry: entry,
    applyVrPlaybackHoverState: (...args) => {
      applyCalls.push(args as boolean[]);
    },
    clearHoverState: (source) => {
      clearCalls.push(source);
    },
  });

  const update = createControllerRayUpdater(deps);
  update();

  assert.deepStrictEqual(clearCalls, ['controller']);
  assert.strictEqual(applyCalls.length, 1);
  assert.deepStrictEqual(applyCalls[0], [false, false, false, false, false, false, false, false, false]);
  assert.deepStrictEqual(deps.lastControllerRaySummaryRef.current, {
    presenting: false,
    visibleLines: 0,
    hoverTrackIds: ['track-1'],
  });
})();

(() => {
  const entry = createControllerEntry();
  const playbackHud = createPlaybackHud();

  const deps = createDependencies({
    rendererPresenting: true,
    controllerEntry: entry,
    playbackHud,
  });

  const update = createControllerRayUpdater(deps);
  update();

  assert.ok(entry.hoverUiTarget, 'expected a hover UI target');
  assert.strictEqual(entry.hoverUiTarget?.type, 'playback-panel-grab');
  assert.strictEqual(entry.hasHoverUiPoint, true);
  assert.ok(Math.abs(entry.rayLength - 0.12) < 1e-6);
})();
