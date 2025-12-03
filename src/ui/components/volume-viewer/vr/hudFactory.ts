import * as THREE from 'three';

import {
  VR_CHANNELS_CANVAS_MIN_HEIGHT,
  VR_CHANNELS_CANVAS_WIDTH,
  VR_CHANNELS_PANEL_HEIGHT,
  VR_CHANNELS_PANEL_WIDTH,
  VR_HUD_SURFACE_OFFSET,
  VR_HUD_TRANSLATE_HANDLE_COLOR,
  VR_HUD_TRANSLATE_HANDLE_OFFSET,
  VR_HUD_TRANSLATE_HANDLE_RADIUS,
  VR_HUD_YAW_HANDLE_COLOR,
  VR_HUD_YAW_HANDLE_OFFSET,
  VR_HUD_YAW_HANDLE_RADIUS,
  VR_PLAYBACK_PANEL_HEIGHT,
  VR_PLAYBACK_PANEL_WIDTH,
  VR_TRACKS_CANVAS_HEIGHT,
  VR_TRACKS_CANVAS_WIDTH,
  VR_TRACKS_PANEL_HEIGHT,
  VR_TRACKS_PANEL_WIDTH,
} from './constants';
import type {
  PlaybackState,
  VrChannelsHud,
  VrPlaybackHud,
  VrTracksHud,
  VrUiTargetType,
} from './types';
import { setVrPlaybackLabel, setVrPlaybackProgressFraction } from './hudMutators';

export function createVrPlaybackHud(initialState?: PlaybackState | null): VrPlaybackHud | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const group = new THREE.Group();
  group.name = 'VrPlaybackHud';

  const panelMaterial = new THREE.MeshBasicMaterial({
    color: 0x10161d,
    transparent: false,
    opacity: 1,
    side: THREE.DoubleSide,
    blending: THREE.NoBlending,
  });
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(VR_PLAYBACK_PANEL_WIDTH, VR_PLAYBACK_PANEL_HEIGHT),
    panelMaterial,
  );
  panel.position.set(0, 0, 0);
  panel.userData.vrUiTarget = { type: 'playback-panel' } satisfies { type: VrUiTargetType };
  group.add(panel);

  const buttonRowY = 0.105;
  const fpsLabelRowY = 0.055;
  const fpsSliderRowY = 0.01;
  const playbackLabelRowY = -0.035;
  const playbackSliderRowY = -0.08;
  const playButtonRowY = -0.135;
  const topButtons: THREE.Mesh[] = [];
  const topButtonWidth = 0.11;
  const topButtonHeight = 0.05;
  const topButtonMargin = 0.035;

  const drawButtonLabel = (
    canvas: HTMLCanvasElement | null,
    context: CanvasRenderingContext2D | null,
    texture: THREE.CanvasTexture,
    text: string,
  ) => {
    if (!canvas || !context) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = 'rgba(0, 0, 0, 0)';
    context.fillRect(0, 0, width, height);
    context.font = '600 60px "Inter", "Helvetica Neue", Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    context.fillText(text, width / 2, height / 2 + 6);
    texture.needsUpdate = true;
  };

  const createLabeledButton = (
    label: string,
    color: number,
    target: VrUiTargetType,
  ): {
    button: THREE.Mesh;
    labelTexture: THREE.CanvasTexture;
    labelCanvas: HTMLCanvasElement | null;
    labelContext: CanvasRenderingContext2D | null;
  } => {
    const material = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
    });
    const button = new THREE.Mesh(new THREE.PlaneGeometry(topButtonWidth, topButtonHeight), material);
    button.userData.vrUiTarget = { type: target } satisfies { type: VrUiTargetType };

    const labelCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    const labelContext = labelCanvas ? labelCanvas.getContext('2d') : null;
    if (labelCanvas) {
      labelCanvas.width = 512;
      labelCanvas.height = 256;
    }
    const labelTexture = new THREE.CanvasTexture(labelCanvas ?? undefined);
    labelTexture.colorSpace = THREE.SRGBColorSpace;
    labelTexture.minFilter = THREE.LinearFilter;
    labelTexture.magFilter = THREE.LinearFilter;
    drawButtonLabel(labelCanvas, labelContext, labelTexture, label);

    const labelMaterial = new THREE.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
    });
    const labelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(0.01, topButtonWidth - 0.01), Math.max(0.01, topButtonHeight - 0.01)),
      labelMaterial,
    );
    labelMesh.position.set(0, 0, 0.0005);
    button.add(labelMesh);

    return { button, labelTexture, labelCanvas, labelContext };
  };

  const translateHandleMaterial = new THREE.MeshBasicMaterial({
    color: VR_HUD_TRANSLATE_HANDLE_COLOR,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  translateHandleMaterial.depthTest = false;
  const panelTranslateHandle = new THREE.Mesh(
    new THREE.SphereGeometry(VR_HUD_TRANSLATE_HANDLE_RADIUS, 32, 32),
    translateHandleMaterial,
  );
  panelTranslateHandle.position.set(
    0,
    VR_PLAYBACK_PANEL_HEIGHT / 2 + VR_HUD_TRANSLATE_HANDLE_OFFSET,
    0,
  );
  panelTranslateHandle.userData.vrUiTarget = { type: 'playback-panel-grab' } satisfies {
    type: VrUiTargetType;
  };
  group.add(panelTranslateHandle);

  const yawHandleMaterial = new THREE.MeshBasicMaterial({
    color: VR_HUD_YAW_HANDLE_COLOR,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  yawHandleMaterial.depthTest = false;
  const panelYawHandles: THREE.Mesh[] = [];
  const yawOffsets = [1, -1] as const;
  for (const direction of yawOffsets) {
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
      yawHandleMaterial.clone(),
    );
    handle.position.set(
      direction * (VR_PLAYBACK_PANEL_WIDTH / 2 + VR_HUD_YAW_HANDLE_OFFSET),
      0,
      0,
    );
    handle.userData.vrUiTarget = { type: 'playback-panel-yaw' } satisfies {
      type: VrUiTargetType;
    };
    group.add(handle);
    panelYawHandles.push(handle);
  }

  const panelPitchHandle = new THREE.Mesh(
    new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
    yawHandleMaterial.clone(),
  );
  panelPitchHandle.position.set(
    0,
    -(VR_PLAYBACK_PANEL_HEIGHT / 2 + VR_HUD_YAW_HANDLE_OFFSET),
    0,
  );
  panelPitchHandle.userData.vrUiTarget = { type: 'playback-panel-pitch' } satisfies {
    type: VrUiTargetType;
  };
  group.add(panelPitchHandle);

  const resetVolumeButtonDefinition = createLabeledButton('Reset Volume', 0x2b3340, 'playback-reset-volume');
  const resetVolumeButton = resetVolumeButtonDefinition.button;
  topButtons.push(resetVolumeButton);
  group.add(resetVolumeButton);

  const resetHudButtonDefinition = createLabeledButton('Reset HUD', 0x2b3340, 'playback-reset-hud');
  const resetHudButton = resetHudButtonDefinition.button;
  topButtons.push(resetHudButton);
  group.add(resetHudButton);

  const modeButtonDefinition = createLabeledButton('Mode: VR', 0x2b3340, 'playback-toggle-mode');
  const modeButton = modeButtonDefinition.button;
  topButtons.push(modeButton);
  group.add(modeButton);

  const exitButtonDefinition = createLabeledButton('Exit VR', 0x512b2b, 'playback-exit-vr');
  const exitButton = exitButtonDefinition.button;
  topButtons.push(exitButton);
  group.add(exitButton);

  topButtons.forEach((button, index) => {
    const offset = (index - (topButtons.length - 1) / 2) * (topButtonWidth + topButtonMargin);
    button.position.set(offset, buttonRowY, VR_HUD_SURFACE_OFFSET);
  });

  const playButtonMaterial = new THREE.MeshBasicMaterial({
    color: 0x2b5fa6,
    side: THREE.DoubleSide,
  });
  const playButton = new THREE.Mesh(new THREE.CircleGeometry(0.042, 48), playButtonMaterial);
  playButton.position.set(0, playButtonRowY, VR_HUD_SURFACE_OFFSET);
  playButton.userData.vrUiTarget = { type: 'playback-play-toggle' } satisfies {
    type: VrUiTargetType;
  };
  group.add(playButton);

  const playIconMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const playIcon = new THREE.Group();
  const playTriangleShape = new THREE.Shape();
  playTriangleShape.moveTo(-0.014, -0.018);
  playTriangleShape.lineTo(0.022, 0);
  playTriangleShape.lineTo(-0.014, 0.018);
  playTriangleShape.closePath();
  const playTriangle = new THREE.Mesh(new THREE.ShapeGeometry(playTriangleShape), playIconMaterial.clone());
  playTriangle.position.set(0.004, 0, 0.0009);
  playIcon.add(playTriangle);
  playButton.add(playIcon);

  const pauseGroup = new THREE.Group();
  const pauseLeftBar = new THREE.Mesh(new THREE.PlaneGeometry(0.014, 0.032), playIconMaterial.clone());
  pauseLeftBar.position.set(-0.01, 0, 0.0008);
  const pauseRightBar = new THREE.Mesh(new THREE.PlaneGeometry(0.014, 0.032), playIconMaterial.clone());
  pauseRightBar.position.set(0.01, 0, 0.0008);
  pauseGroup.add(pauseLeftBar);
  pauseGroup.add(pauseRightBar);
  playButton.add(pauseGroup);
  pauseGroup.visible = false;

  const fpsSliderGroup = new THREE.Group();
  fpsSliderGroup.position.set(0, fpsSliderRowY, VR_HUD_SURFACE_OFFSET);
  group.add(fpsSliderGroup);

  const fpsSliderWidth = 0.42;
  const fpsSliderTrackMaterial = new THREE.MeshBasicMaterial({
    color: 0x3b414d,
    side: THREE.DoubleSide,
  });
  const fpsSliderTrack = new THREE.Mesh(
    new THREE.PlaneGeometry(fpsSliderWidth, 0.012),
    fpsSliderTrackMaterial,
  );
  fpsSliderTrack.position.set(0, 0, 0);
  fpsSliderGroup.add(fpsSliderTrack);

  const fpsSliderFillMaterial = new THREE.MeshBasicMaterial({
    color: 0x68a7ff,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const fpsSliderFill = new THREE.Mesh(
    new THREE.PlaneGeometry(fpsSliderWidth, 0.012),
    fpsSliderFillMaterial,
  );
  fpsSliderFill.position.set(0, 0, 0.0005);
  fpsSliderGroup.add(fpsSliderFill);

  const fpsSliderKnobMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const fpsSliderKnob = new THREE.Mesh(new THREE.CircleGeometry(0.02, 32), fpsSliderKnobMaterial);
  fpsSliderKnob.position.set(-fpsSliderWidth / 2, 0, 0.001);
  fpsSliderKnob.userData.vrUiTarget = { type: 'playback-fps-slider' } satisfies {
    type: VrUiTargetType;
  };
  fpsSliderGroup.add(fpsSliderKnob);

  const fpsSliderHitMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0.01,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const fpsSliderHitArea = new THREE.Mesh(
    new THREE.PlaneGeometry(fpsSliderWidth + 0.04, 0.08),
    fpsSliderHitMaterial,
  );
  fpsSliderHitArea.position.set(0, 0, 0.0002);
  fpsSliderHitArea.userData.vrUiTarget = { type: 'playback-fps-slider' } satisfies {
    type: VrUiTargetType;
  };
  fpsSliderGroup.add(fpsSliderHitArea);

  const fpsLabelCanvas = document.createElement('canvas');
  fpsLabelCanvas.width = 1024;
  fpsLabelCanvas.height = 128;
  const fpsLabelContext = fpsLabelCanvas.getContext('2d');
  const fpsLabelTexture = new THREE.CanvasTexture(fpsLabelCanvas);
  fpsLabelTexture.colorSpace = THREE.SRGBColorSpace;
  fpsLabelTexture.minFilter = THREE.LinearFilter;
  fpsLabelTexture.magFilter = THREE.LinearFilter;
  const fpsLabelMaterial = new THREE.MeshBasicMaterial({
    map: fpsLabelTexture,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
  });
  const fpsLabelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.05), fpsLabelMaterial);
  fpsLabelMesh.position.set(0, fpsLabelRowY, VR_HUD_SURFACE_OFFSET + 0.0005);
  group.add(fpsLabelMesh);

  const playbackSliderGroup = new THREE.Group();
  playbackSliderGroup.position.set(0, playbackSliderRowY, VR_HUD_SURFACE_OFFSET);
  group.add(playbackSliderGroup);

  const playbackSliderWidth = 0.46;
  const playbackSliderTrackMaterial = new THREE.MeshBasicMaterial({
    color: 0x3b414d,
    side: THREE.DoubleSide,
  });
  const playbackSliderTrack = new THREE.Mesh(
    new THREE.PlaneGeometry(playbackSliderWidth, 0.012),
    playbackSliderTrackMaterial,
  );
  playbackSliderTrack.position.set(0, 0, 0);
  playbackSliderGroup.add(playbackSliderTrack);

  const playbackSliderFillMaterial = new THREE.MeshBasicMaterial({
    color: 0x68a7ff,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
  });
  const playbackSliderFill = new THREE.Mesh(
    new THREE.PlaneGeometry(playbackSliderWidth, 0.012),
    playbackSliderFillMaterial,
  );
  playbackSliderFill.position.set(0, 0, 0.0005);
  playbackSliderGroup.add(playbackSliderFill);

  const playbackSliderKnobMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
  });
  const playbackSliderKnob = new THREE.Mesh(new THREE.CircleGeometry(0.02, 32), playbackSliderKnobMaterial);
  playbackSliderKnob.position.set(-playbackSliderWidth / 2, 0, 0.001);
  playbackSliderKnob.userData.vrUiTarget = { type: 'playback-slider' } satisfies {
    type: VrUiTargetType;
  };
  playbackSliderGroup.add(playbackSliderKnob);

  const playbackSliderHitMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity: 0.01,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const playbackSliderHitArea = new THREE.Mesh(
    new THREE.PlaneGeometry(playbackSliderWidth + 0.04, 0.08),
    playbackSliderHitMaterial,
  );
  playbackSliderHitArea.position.set(0, 0, 0.0002);
  playbackSliderHitArea.userData.vrUiTarget = { type: 'playback-slider' } satisfies {
    type: VrUiTargetType;
  };
  playbackSliderGroup.add(playbackSliderHitArea);

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 1024;
  labelCanvas.height = 128;
  const labelContext = labelCanvas.getContext('2d');
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace;
  labelTexture.minFilter = THREE.LinearFilter;
  labelTexture.magFilter = THREE.LinearFilter;
  const labelMaterial = new THREE.MeshBasicMaterial({
    map: labelTexture,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
  });
  const labelMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.06), labelMaterial);
  labelMesh.position.set(0, playbackLabelRowY, VR_HUD_SURFACE_OFFSET + 0.0005);
  group.add(labelMesh);

  const hud: VrPlaybackHud = {
    group,
    panel,
    panelTranslateHandle,
    panelYawHandles,
    panelPitchHandle,
    resetVolumeButton,
    resetHudButton,
    playButton,
    playIcon,
    pauseGroup,
    exitButton,
    modeButton,
    playbackSliderGroup,
    playbackSliderTrack,
    playbackSliderFill,
    playbackSliderKnob,
    playbackSliderHitArea,
    playbackSliderWidth,
    fpsSliderGroup,
    fpsSliderTrack,
    fpsSliderFill,
    fpsSliderKnob,
    fpsSliderHitArea,
    fpsSliderWidth,
    modeLabelTexture: modeButtonDefinition.labelTexture,
    modeLabelCanvas: modeButtonDefinition.labelCanvas,
    modeLabelContext: modeButtonDefinition.labelContext,
    modeLabelText: 'Mode: VR',
    labelMesh,
    labelTexture,
    labelCanvas,
    labelContext,
    labelText: '',
    fpsLabelMesh,
    fpsLabelTexture,
    fpsLabelCanvas,
    fpsLabelContext,
    fpsLabelText: '',
    interactables: [
      panelTranslateHandle,
      ...panelYawHandles,
      panelPitchHandle,
      resetVolumeButton,
      resetHudButton,
      playButton,
      modeButton,
      exitButton,
      playbackSliderHitArea,
      playbackSliderKnob,
      fpsSliderHitArea,
      fpsSliderKnob,
    ],
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
    resetVolumeButtonHalfWidth: topButtonWidth / 2,
    resetVolumeButtonHalfHeight: topButtonHeight / 2,
    resetHudButtonHalfWidth: topButtonWidth / 2,
    resetHudButtonHalfHeight: topButtonHeight / 2,
    exitButtonHalfWidth: topButtonWidth / 2,
    exitButtonHalfHeight: topButtonHeight / 2,
    modeButtonHalfWidth: topButtonWidth / 2,
    modeButtonHalfHeight: topButtonHeight / 2,
    cachedPosition: new THREE.Vector3(NaN, NaN, NaN),
    cachedYaw: NaN,
    cachedPitch: NaN,
    cacheDirty: true,
  };

  if (initialState) {
    const maxIndex = Math.max(0, initialState.totalTimepoints - 1);
    const fraction =
      maxIndex > 0 ? Math.min(Math.max(initialState.timeIndex / maxIndex, 0), 1) : 0;
    setVrPlaybackProgressFraction(hud, fraction);
    setVrPlaybackLabel(hud, initialState.playbackLabel ?? '');
  }

  return hud;
}

export function createVrChannelsHud(): VrChannelsHud | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const group = new THREE.Group();
  group.name = 'VrChannelsHud';

  const backgroundMaterial = new THREE.MeshBasicMaterial({
    color: 0x10161d,
    transparent: false,
    opacity: 1,
    side: THREE.DoubleSide,
  });
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(VR_CHANNELS_PANEL_WIDTH, VR_CHANNELS_PANEL_HEIGHT),
    backgroundMaterial,
  );
  background.position.set(0, 0, 0);
  group.add(background);

  const panelCanvas = document.createElement('canvas');
  const panelDisplayWidth = VR_CHANNELS_CANVAS_WIDTH;
  const panelDisplayHeight = VR_CHANNELS_CANVAS_MIN_HEIGHT;
  const pixelRatio = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  panelCanvas.width = Math.round(panelDisplayWidth * pixelRatio);
  panelCanvas.height = Math.round(panelDisplayHeight * pixelRatio);
  const panelContext = panelCanvas.getContext('2d');
  if (!panelContext) {
    return null;
  }
  panelContext.imageSmoothingEnabled = true;
  panelContext.imageSmoothingQuality = 'high';
  const panelTexture = new THREE.CanvasTexture(panelCanvas);
  panelTexture.colorSpace = THREE.SRGBColorSpace;
  panelTexture.minFilter = THREE.LinearFilter;
  panelTexture.magFilter = THREE.LinearFilter;

  const panelMaterial = new THREE.MeshBasicMaterial({
    map: panelTexture,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
  });
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(VR_CHANNELS_PANEL_WIDTH, VR_CHANNELS_PANEL_HEIGHT),
    panelMaterial,
  );
  panel.position.set(0, 0, VR_HUD_SURFACE_OFFSET);
  panel.userData.vrUiTarget = { type: 'channels-panel' } satisfies { type: VrUiTargetType };
  group.add(panel);

  const translateHandleMaterial = new THREE.MeshBasicMaterial({
    color: VR_HUD_TRANSLATE_HANDLE_COLOR,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  translateHandleMaterial.depthTest = false;
  const panelTranslateHandle = new THREE.Mesh(
    new THREE.SphereGeometry(VR_HUD_TRANSLATE_HANDLE_RADIUS, 32, 32),
    translateHandleMaterial,
  );
  panelTranslateHandle.position.set(
    0,
    VR_CHANNELS_PANEL_HEIGHT / 2 + VR_HUD_TRANSLATE_HANDLE_OFFSET,
    0,
  );
  panelTranslateHandle.userData.vrUiTarget = { type: 'channels-panel-grab' } satisfies {
    type: VrUiTargetType;
  };
  group.add(panelTranslateHandle);

  const yawHandleMaterial = new THREE.MeshBasicMaterial({
    color: VR_HUD_YAW_HANDLE_COLOR,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  yawHandleMaterial.depthTest = false;
  const panelYawHandles: THREE.Mesh[] = [];
  for (const direction of [1, -1] as const) {
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
      yawHandleMaterial.clone(),
    );
    handle.position.set(
      direction * (VR_CHANNELS_PANEL_WIDTH / 2 + VR_HUD_YAW_HANDLE_OFFSET),
      0,
      0,
    );
    handle.userData.vrUiTarget = { type: 'channels-panel-yaw' } satisfies {
      type: VrUiTargetType;
    };
    group.add(handle);
    panelYawHandles.push(handle);
  }

  const panelPitchHandle = new THREE.Mesh(
    new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
    yawHandleMaterial.clone(),
  );
  panelPitchHandle.position.set(
    0,
    -(VR_CHANNELS_PANEL_HEIGHT / 2 + VR_HUD_YAW_HANDLE_OFFSET),
    0,
  );
  panelPitchHandle.userData.vrUiTarget = { type: 'channels-panel-pitch' } satisfies {
    type: VrUiTargetType;
  };
  group.add(panelPitchHandle);

  const hud: VrChannelsHud = {
    group,
    background,
    panel,
    panelTranslateHandle,
    panelYawHandles,
    panelPitchHandle,
    panelTexture,
    panelCanvas,
    panelContext,
    panelDisplayWidth,
    panelDisplayHeight,
    pixelRatio,
    interactables: [panelTranslateHandle, ...panelYawHandles, panelPitchHandle, panel],
    regions: [],
    width: VR_CHANNELS_PANEL_WIDTH,
    height: VR_CHANNELS_PANEL_HEIGHT,
    hoverRegion: null,
    cachedPosition: new THREE.Vector3(NaN, NaN, NaN),
    cachedYaw: NaN,
    cachedPitch: NaN,
    cacheDirty: true,
  };

  return hud;
}

export function createVrTracksHud(): VrTracksHud | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const group = new THREE.Group();
  group.name = 'VrTracksHud';

  const backgroundMaterial = new THREE.MeshBasicMaterial({
    color: 0x10161d,
    transparent: false,
    opacity: 1,
    side: THREE.DoubleSide,
  });
  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(VR_TRACKS_PANEL_WIDTH, VR_TRACKS_PANEL_HEIGHT),
    backgroundMaterial,
  );
  background.position.set(0, 0, 0);
  group.add(background);

  const panelCanvas = document.createElement('canvas');
  const panelDisplayWidth = VR_TRACKS_CANVAS_WIDTH;
  const panelDisplayHeight = VR_TRACKS_CANVAS_HEIGHT;
  const pixelRatio = typeof window !== 'undefined' ? Math.min(2, window.devicePixelRatio || 1) : 1;
  panelCanvas.width = Math.round(panelDisplayWidth * pixelRatio);
  panelCanvas.height = Math.round(panelDisplayHeight * pixelRatio);
  const panelContext = panelCanvas.getContext('2d');
  if (!panelContext) {
    return null;
  }
  panelContext.imageSmoothingEnabled = true;
  panelContext.imageSmoothingQuality = 'high';
  const panelTexture = new THREE.CanvasTexture(panelCanvas);
  panelTexture.colorSpace = THREE.SRGBColorSpace;
  panelTexture.minFilter = THREE.LinearFilter;
  panelTexture.magFilter = THREE.LinearFilter;

  const panelMaterial = new THREE.MeshBasicMaterial({
    map: panelTexture,
    transparent: true,
    opacity: 1,
    side: THREE.DoubleSide,
  });
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(VR_TRACKS_PANEL_WIDTH, VR_TRACKS_PANEL_HEIGHT),
    panelMaterial,
  );
  panel.position.set(0, 0, VR_HUD_SURFACE_OFFSET);
  panel.userData.vrUiTarget = { type: 'tracks-panel' } satisfies { type: VrUiTargetType };
  group.add(panel);

  const translateHandleMaterial = new THREE.MeshBasicMaterial({
    color: VR_HUD_TRANSLATE_HANDLE_COLOR,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  translateHandleMaterial.depthTest = false;
  const panelTranslateHandle = new THREE.Mesh(
    new THREE.SphereGeometry(VR_HUD_TRANSLATE_HANDLE_RADIUS, 32, 32),
    translateHandleMaterial,
  );
  panelTranslateHandle.position.set(
    0,
    VR_TRACKS_PANEL_HEIGHT / 2 + VR_HUD_TRANSLATE_HANDLE_OFFSET,
    0,
  );
  panelTranslateHandle.userData.vrUiTarget = { type: 'tracks-panel-grab' } satisfies {
    type: VrUiTargetType;
  };
  group.add(panelTranslateHandle);

  const yawHandleMaterial = new THREE.MeshBasicMaterial({
    color: VR_HUD_YAW_HANDLE_COLOR,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  yawHandleMaterial.depthTest = false;
  const panelYawHandles: THREE.Mesh[] = [];
  for (const direction of [1, -1] as const) {
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
      yawHandleMaterial.clone(),
    );
    handle.position.set(
      direction * (VR_TRACKS_PANEL_WIDTH / 2 + VR_HUD_YAW_HANDLE_OFFSET),
      0,
      0,
    );
    handle.userData.vrUiTarget = { type: 'tracks-panel-yaw' } satisfies {
      type: VrUiTargetType;
    };
    group.add(handle);
    panelYawHandles.push(handle);
  }

  const panelPitchHandle = new THREE.Mesh(
    new THREE.SphereGeometry(VR_HUD_YAW_HANDLE_RADIUS, 32, 32),
    yawHandleMaterial.clone(),
  );
  panelPitchHandle.position.set(
    0,
    -(VR_TRACKS_PANEL_HEIGHT / 2 + VR_HUD_YAW_HANDLE_OFFSET),
    0,
  );
  panelPitchHandle.userData.vrUiTarget = { type: 'tracks-panel-pitch' } satisfies {
    type: VrUiTargetType;
  };
  group.add(panelPitchHandle);

  const hud: VrTracksHud = {
    group,
    panel,
    panelTranslateHandle,
    panelYawHandles,
    panelPitchHandle,
    panelTexture,
    panelCanvas,
    panelContext,
    panelDisplayWidth,
    panelDisplayHeight,
    pixelRatio,
    interactables: [panelTranslateHandle, ...panelYawHandles, panelPitchHandle, panel],
    regions: [],
    width: VR_TRACKS_PANEL_WIDTH,
    height: VR_TRACKS_PANEL_HEIGHT,
    hoverRegion: null,
    cachedPosition: new THREE.Vector3(NaN, NaN, NaN),
    cachedYaw: NaN,
    cachedPitch: NaN,
    cacheDirty: true,
  };

  return hud;
}
