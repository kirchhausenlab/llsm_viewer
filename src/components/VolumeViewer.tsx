import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { NormalizedVolume } from '../volumeProcessing';
import { VolumeRenderShader } from '../shaders/volumeRenderShader';
import { getCachedTextureData } from '../textureCache';
import './VolumeViewer.css';
import type { TrackDefinition } from '../types/tracks';
import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../layerColors';

type ViewerLayer = {
  key: string;
  label: string;
  volume: NormalizedVolume | null;
  visible: boolean;
  contrast: number;
  brightness: number;
  color: string;
};

type VolumeViewerProps = {
  layers: ViewerLayer[];
  filename: string | null;
  timeIndex: number;
  totalTimepoints: number;
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onTimeIndexChange: (index: number) => void;
  onRegisterReset: (handler: (() => void) | null) => void;
  tracks: TrackDefinition[];
  showTrackOverlay: boolean;
  trackVisibility: Record<number, boolean>;
  trackOpacity: number;
  trackLineWidth: number;
};

type VolumeStats = {
  min: number;
  max: number;
};

type VolumeResources = {
  mesh: THREE.Mesh;
  texture: THREE.Data3DTexture;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  channels: number;
};

type PointerState = {
  mode: 'pan' | 'dolly';
  pointerId: number;
  lastX: number;
  lastY: number;
  previousControlsEnabled: boolean;
  previousEnablePan: boolean | null;
};

type MovementState = {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  moveUp: boolean;
  moveDown: boolean;
};

type TrackLineResource = {
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  times: number[];
};

const MOVEMENT_KEY_MAP: Record<string, keyof MovementState> = {
  KeyW: 'moveForward',
  KeyS: 'moveBackward',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  KeyE: 'moveUp',
  KeyQ: 'moveDown'
};

function createColormapTexture(hexColor: string) {
  const normalized = normalizeHexColor(hexColor, DEFAULT_LAYER_COLOR);
  const red = parseInt(normalized.slice(1, 3), 16) / 255;
  const green = parseInt(normalized.slice(3, 5), 16) / 255;
  const blue = parseInt(normalized.slice(5, 7), 16) / 255;

  const size = 256;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const intensity = i / (size - 1);
    data[i * 4 + 0] = Math.round(red * intensity * 255);
    data[i * 4 + 1] = Math.round(green * intensity * 255);
    data[i * 4 + 2] = Math.round(blue * intensity * 255);
    data[i * 4 + 3] = Math.round(intensity * 255);
  }
  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTrackColor(trackId: number) {
  const color = new THREE.Color();
  const normalizedId = Math.abs(trackId) + 1;
  const hue = ((normalizedId * 137.508) % 360) / 360;
  color.setHSL(hue, 0.75, 0.55);
  return color;
}

function VolumeViewer({
  layers,
  filename,
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
  timeIndex,
  totalTimepoints,
  isPlaying,
  onTogglePlayback,
  onTimeIndexChange,
  onRegisterReset,
  tracks,
  showTrackOverlay,
  trackVisibility,
  trackOpacity,
  trackLineWidth
}: VolumeViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const resourcesRef = useRef<Map<string, VolumeResources>>(new Map());
  const currentDimensionsRef = useRef<{ width: number; height: number; depth: number } | null>(null);
  const colormapCacheRef = useRef<Map<string, THREE.DataTexture>>(new Map());
  const rotationTargetRef = useRef(new THREE.Vector3());
  const defaultViewStateRef = useRef<{
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null>(null);
  const pointerStateRef = useRef<PointerState | null>(null);
  const movementStateRef = useRef<MovementState>({
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false
  });
  const trackGroupRef = useRef<THREE.Group | null>(null);
  const trackLinesRef = useRef<Map<number, TrackLineResource>>(new Map());
  const timeIndexRef = useRef(0);
  const [layerStats, setLayerStats] = useState<Record<string, VolumeStats>>({});
  const [hasMeasured, setHasMeasured] = useState(false);

  const getColormapTexture = useCallback((color: string) => {
    const normalized = normalizeHexColor(color, DEFAULT_LAYER_COLOR);
    const cache = colormapCacheRef.current;
    let texture = cache.get(normalized) ?? null;
    if (!texture) {
      texture = createColormapTexture(normalized);
      cache.set(normalized, texture);
    }
    return texture;
  }, []);

  const updateTrackDrawRanges = useCallback((targetTimeIndex: number) => {
    const lines = trackLinesRef.current;
    const maxVisibleTime = targetTimeIndex + 1;

    for (const resource of lines.values()) {
      const { line, times } = resource;
      let visiblePoints = 0;
      for (let index = 0; index < times.length; index++) {
        if (times[index] <= maxVisibleTime) {
          visiblePoints = index + 1;
        } else {
          break;
        }
      }

      if (visiblePoints >= 2) {
        line.geometry.setDrawRange(0, visiblePoints);
      } else {
        line.geometry.setDrawRange(0, 0);
      }
    }
  }, []);

  const title = useMemo(() => {
    if (!filename) {
      return 'No dataset selected';
    }
    return `${filename}`;
  }, [filename]);

  const safeProgress = Math.min(1, Math.max(0, loadingProgress));
  const clampedLoadedVolumes = Math.max(0, loadedVolumes);
  const clampedExpectedVolumes = Math.max(0, expectedVolumes);
  const normalizedProgress =
    clampedExpectedVolumes > 0
      ? Math.min(1, clampedLoadedVolumes / clampedExpectedVolumes)
      : safeProgress;
  const hasStartedLoading = normalizedProgress > 0 || clampedLoadedVolumes > 0 || safeProgress > 0;
  const hasFinishedLoading =
    clampedExpectedVolumes > 0 ? clampedLoadedVolumes >= clampedExpectedVolumes : safeProgress >= 1;
  const showLoadingOverlay = isLoading || (hasStartedLoading && !hasFinishedLoading);
  const clampedTimeIndex = totalTimepoints === 0 ? 0 : Math.min(timeIndex, totalTimepoints - 1);
  const primaryVolume = useMemo(() => {
    for (const layer of layers) {
      if (layer.volume) {
        return layer.volume;
      }
    }
    return null;
  }, [layers]);
  const hasRenderableLayer = Boolean(primaryVolume);

  useEffect(() => {
    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      return;
    }

    const trackLines = trackLinesRef.current;
    const activeIds = new Set<number>();
    tracks.forEach((track) => {
      if (track.points.length > 0) {
        activeIds.add(track.id);
      }
    });

    for (const [id, resource] of Array.from(trackLines.entries())) {
      if (!activeIds.has(id)) {
        trackGroup.remove(resource.line);
        resource.line.geometry.dispose();
        resource.line.material.dispose();
        trackLines.delete(id);
      }
    }

    for (const track of tracks) {
      if (track.points.length === 0) {
        continue;
      }

      let resource = trackLines.get(track.id) ?? null;
      const positions = new Float32Array(track.points.length * 3);
      const times = new Array<number>(track.points.length);

      for (let index = 0; index < track.points.length; index++) {
        const point = track.points[index];
        positions[index * 3 + 0] = point.x;
        positions[index * 3 + 1] = point.y;
        positions[index * 3 + 2] = point.z;
        times[index] = point.time;
      }

      if (!resource) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setDrawRange(0, 0);
        geometry.computeBoundingSphere();
        const material = new THREE.LineBasicMaterial({
          color: createTrackColor(track.id),
          linewidth: 1,
          depthTest: false,
          depthWrite: false,
          transparent: true,
          opacity: 0.9
        });
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 1000;
        line.frustumCulled = false;
        trackGroup.add(line);
        resource = { line, times };
        trackLines.set(track.id, resource);
      } else {
        const { line } = resource;
        const geometry = line.geometry as THREE.BufferGeometry;
        const positionAttribute = geometry.getAttribute('position') as
          | THREE.BufferAttribute
          | undefined
          | null;
        if (!positionAttribute || positionAttribute.count !== track.points.length) {
          geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        } else {
          positionAttribute.array.set(positions);
          positionAttribute.needsUpdate = true;
        }
        geometry.computeBoundingSphere();
        resource.times = times;
      }
    }

    updateTrackDrawRanges(timeIndexRef.current);
  }, [tracks, updateTrackDrawRanges]);

  useEffect(() => {
    const trackGroup = trackGroupRef.current;
    if (!trackGroup) {
      return;
    }

    const sanitizedOpacity = Math.min(1, Math.max(0, trackOpacity));
    const sanitizedLineWidth = Math.max(0.1, Math.min(10, trackLineWidth));
    let visibleCount = 0;

    for (const track of tracks) {
      const resource = trackLinesRef.current.get(track.id);
      if (!resource) {
        continue;
      }

      const line = resource.line;
      const material = line.material;
      if (material instanceof THREE.LineBasicMaterial) {
        if (material.opacity !== sanitizedOpacity) {
          material.opacity = sanitizedOpacity;
          material.needsUpdate = true;
        }
        if (material.linewidth !== sanitizedLineWidth) {
          material.linewidth = sanitizedLineWidth;
          material.needsUpdate = true;
        }
      }

      const isVisible = showTrackOverlay && (trackVisibility[track.id] ?? true);
      line.visible = isVisible;
      if (isVisible) {
        visibleCount += 1;
      }
    }

    trackGroup.visible = showTrackOverlay && visibleCount > 0;
  }, [showTrackOverlay, trackLineWidth, trackOpacity, trackVisibility, tracks]);

  useEffect(() => {
    timeIndexRef.current = clampedTimeIndex;
    updateTrackDrawRanges(clampedTimeIndex);
  }, [clampedTimeIndex, updateTrackDrawRanges]);

  const handleResetView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    const camera = cameraRef.current;
    const defaultViewState = defaultViewStateRef.current;
    if (defaultViewState && camera) {
      camera.position.copy(defaultViewState.position);
      controls.target.copy(defaultViewState.target);
      rotationTargetRef.current.copy(defaultViewState.target);
      controls.update();
    } else {
      controls.reset();
      controls.target.copy(rotationTargetRef.current);
      controls.update();
    }
  }, []);

  useEffect(() => {
    onRegisterReset(hasRenderableLayer ? handleResetView : null);
    return () => {
      onRegisterReset(null);
    };
  }, [handleResetView, hasRenderableLayer, onRegisterReset]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);

    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080c);

    const trackGroup = new THREE.Group();
    trackGroup.name = 'TrackingOverlay';
    trackGroup.visible = false;
    scene.add(trackGroup);
    trackGroupRef.current = trackGroup;

    const camera = new THREE.PerspectiveCamera(
      38,
      container.clientWidth / container.clientHeight,
      0.0001,
      1000
    );
    camera.position.set(0, 0, 2.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.dampingFactor = 0;
    controls.enablePan = false;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.7;
    controlsRef.current = controls;

    const domElement = renderer.domElement;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !controlsRef.current || !cameraRef.current) {
        return;
      }

      const mode = event.ctrlKey ? 'dolly' : event.shiftKey ? 'pan' : null;
      if (!mode) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const controls = controlsRef.current;
      const previousEnablePan = mode === 'pan' ? controls.enablePan : null;
      if (mode === 'pan') {
        controls.enablePan = true;
      }

      pointerStateRef.current = {
        mode,
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        previousControlsEnabled: controls.enabled,
        previousEnablePan
      };
      controls.enabled = false;

      try {
        domElement.setPointerCapture(event.pointerId);
      } catch (error) {
        // Ignore errors from unsupported pointer capture (e.g., Safari)
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const state = pointerStateRef.current;
      if (!state || event.pointerId !== state.pointerId) {
        return;
      }

      const controls = controlsRef.current;
      const camera = cameraRef.current;
      if (!controls || !camera) {
        return;
      }

      const deltaX = event.clientX - state.lastX;
      const deltaY = event.clientY - state.lastY;

      if (state.mode === 'pan') {
        (controls as unknown as { pan: (dx: number, dy: number) => void }).pan(deltaX, deltaY);
        rotationTargetRef.current.copy(controls.target);
      } else {
        const rotationTarget = rotationTargetRef.current;
        camera.getWorldDirection(dollyDirection);
        const distance = rotationTarget.distanceTo(camera.position);
        const depthScale = Math.max(distance * 0.0025, 0.0006);
        const moveAmount = -deltaY * depthScale;
        dollyDirection.multiplyScalar(moveAmount);
        camera.position.add(dollyDirection);
        controls.target.copy(rotationTarget);
      }

      controls.update();
      state.lastX = event.clientX;
      state.lastY = event.clientY;
    };

    const handlePointerUp = (event: PointerEvent) => {
      const state = pointerStateRef.current;
      if (!state || event.pointerId !== state.pointerId) {
        return;
      }

      const controls = controlsRef.current;
      if (controls) {
        controls.enabled = state.previousControlsEnabled;
        if (state.mode === 'pan' && state.previousEnablePan !== null) {
          controls.enablePan = state.previousEnablePan;
        }
      }

      try {
        domElement.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Ignore errors from unsupported pointer capture (e.g., Safari)
      }

      pointerStateRef.current = null;
    };

    const pointerDownOptions: AddEventListenerOptions = { capture: true };

    domElement.addEventListener('pointerdown', handlePointerDown, pointerDownOptions);
    domElement.addEventListener('pointermove', handlePointerMove);
    domElement.addEventListener('pointerup', handlePointerUp);
    domElement.addEventListener('pointercancel', handlePointerUp);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;

    const handleResize = (entries?: ResizeObserverEntry[]) => {
      const target = containerRef.current;
      if (!target || !rendererRef.current || !cameraRef.current) {
        return;
      }
      const width = target.clientWidth;
      const height = target.clientHeight;
      if (width > 0 && height > 0) {
        setHasMeasured(true);
      }
      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver((entries) => handleResize(entries));
    resizeObserver.observe(container);
    handleResize();

    const worldUp = new THREE.Vector3(0, 1, 0);
    const forwardVector = new THREE.Vector3();
    const horizontalForward = new THREE.Vector3();
    const rightVector = new THREE.Vector3();
    const movementVector = new THREE.Vector3();
    const dollyDirection = new THREE.Vector3();

    const applyKeyboardMovement = () => {
      const movementState = movementStateRef.current;
      if (
        !movementState ||
        (!movementState.moveForward &&
          !movementState.moveBackward &&
          !movementState.moveLeft &&
          !movementState.moveRight &&
          !movementState.moveUp &&
          !movementState.moveDown)
      ) {
        return;
      }

      const rotationTarget = rotationTargetRef.current;
      const distance = rotationTarget.distanceTo(camera.position);
      const movementScale = Math.max(distance * 0.0025, 0.0006);

      camera.getWorldDirection(forwardVector).normalize();
      horizontalForward.copy(forwardVector).projectOnPlane(worldUp);
      if (horizontalForward.lengthSq() < 1e-8) {
        horizontalForward.set(0, 0, forwardVector.z >= 0 ? 1 : -1);
      } else {
        horizontalForward.normalize();
      }

      rightVector.crossVectors(horizontalForward, worldUp);
      if (rightVector.lengthSq() < 1e-8) {
        rightVector.set(1, 0, 0);
      } else {
        rightVector.normalize();
      }

      movementVector.set(0, 0, 0);

      if (movementState.moveForward) {
        movementVector.addScaledVector(horizontalForward, movementScale);
      }
      if (movementState.moveBackward) {
        movementVector.addScaledVector(horizontalForward, -movementScale);
      }
      if (movementState.moveLeft) {
        movementVector.addScaledVector(rightVector, -movementScale);
      }
      if (movementState.moveRight) {
        movementVector.addScaledVector(rightVector, movementScale);
      }
      if (movementState.moveUp) {
        movementVector.addScaledVector(worldUp, movementScale);
      }
      if (movementState.moveDown) {
        movementVector.addScaledVector(worldUp, -movementScale);
      }

      if (movementVector.lengthSq() === 0) {
        return;
      }

      camera.position.add(movementVector);
      rotationTarget.add(movementVector);
      controls.target.copy(rotationTarget);
    };

    const renderLoop = () => {
      applyKeyboardMovement();
      controls.update();
      const resources = resourcesRef.current;
      for (const resource of resources.values()) {
        const { mesh } = resource;
        mesh.updateMatrixWorld();
        const cameraUniform = mesh.material.uniforms.u_cameraPos.value;
        cameraUniform.copy(camera.position);
        mesh.worldToLocal(cameraUniform);
      }
      renderer.render(scene, camera);
      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    return () => {
      const resources = resourcesRef.current;
      for (const resource of resources.values()) {
        scene.remove(resource.mesh);
        resource.mesh.geometry.dispose();
        resource.mesh.material.dispose();
        resource.texture.dispose();
      }
      resources.clear();

      const trackGroup = trackGroupRef.current;
      if (trackGroup) {
        for (const resource of trackLinesRef.current.values()) {
          trackGroup.remove(resource.line);
          resource.line.geometry.dispose();
          resource.line.material.dispose();
        }
        trackLinesRef.current.clear();
        if (trackGroup.parent) {
          trackGroup.parent.remove(trackGroup);
        }
      }
      trackGroupRef.current = null;

      domElement.removeEventListener('pointerdown', handlePointerDown, pointerDownOptions);
      domElement.removeEventListener('pointermove', handlePointerMove);
      domElement.removeEventListener('pointerup', handlePointerUp);
      domElement.removeEventListener('pointercancel', handlePointerUp);

      const activePointerState = pointerStateRef.current;
      if (activePointerState && controlsRef.current) {
        controlsRef.current.enabled = activePointerState.previousControlsEnabled;
        if (activePointerState.mode === 'pan' && activePointerState.previousEnablePan !== null) {
          controlsRef.current.enablePan = activePointerState.previousEnablePan;
        }
      }
      pointerStateRef.current = null;

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleKeyChange = (event: KeyboardEvent, isPressed: boolean) => {
      const mappedKey = MOVEMENT_KEY_MAP[event.code];
      if (!mappedKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        const isEditable = target.isContentEditable;
        if (isEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
          return;
        }
      }

      event.preventDefault();

      const movementState = movementStateRef.current;
      if (!movementState) {
        return;
      }

      movementState[mappedKey] = isPressed;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyChange(event, true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      handleKeyChange(event, false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      const movementState = movementStateRef.current;
      if (movementState) {
        movementState.moveForward = false;
        movementState.moveBackward = false;
        movementState.moveLeft = false;
        movementState.moveRight = false;
        movementState.moveUp = false;
        movementState.moveDown = false;
      }
    };
  }, []);

  useEffect(() => {
    const removeResource = (key: string) => {
      const resource = resourcesRef.current.get(key);
      if (!resource) {
        return;
      }
      const activeScene = sceneRef.current;
      if (activeScene) {
        activeScene.remove(resource.mesh);
      }
      resource.mesh.geometry.dispose();
      resource.mesh.material.dispose();
      resource.texture.dispose();
      resourcesRef.current.delete(key);
    };

    const removeAllResources = () => {
      for (const key of Array.from(resourcesRef.current.keys())) {
        removeResource(key);
      }
    };

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (!scene || !camera || !controls) {
      removeAllResources();
      currentDimensionsRef.current = null;
      setLayerStats({});
      return;
    }

    const referenceVolume = primaryVolume;

    if (!referenceVolume) {
      removeAllResources();
      currentDimensionsRef.current = null;
      rotationTargetRef.current.set(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();
      defaultViewStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone()
      };
      const trackGroup = trackGroupRef.current;
      if (trackGroup) {
        trackGroup.visible = false;
        trackGroup.position.set(0, 0, 0);
        trackGroup.scale.set(1, 1, 1);
      }
      setLayerStats({});
      return;
    }

    const { width, height, depth } = referenceVolume;
    const dimensionsChanged =
      !currentDimensionsRef.current ||
      currentDimensionsRef.current.width !== width ||
      currentDimensionsRef.current.height !== height ||
      currentDimensionsRef.current.depth !== depth;

    if (dimensionsChanged) {
      removeAllResources();
      currentDimensionsRef.current = { width, height, depth };

      const maxDimension = Math.max(width, height, depth);
      const scale = 1 / maxDimension;
      const boundingRadius = Math.sqrt(width * width + height * height + depth * depth) * scale * 0.5;
      const fovInRadians = THREE.MathUtils.degToRad(camera.fov * 0.5);
      const distance = boundingRadius / Math.sin(fovInRadians);
      const safeDistance = Number.isFinite(distance) ? distance * 1.2 : 2.5;
      const nearDistance = Math.max(0.0001, boundingRadius * 0.00025);
      const farDistance = Math.max(safeDistance * 5, boundingRadius * 10);
      if (camera.near !== nearDistance || camera.far !== farDistance) {
        camera.near = nearDistance;
        camera.far = farDistance;
        camera.updateProjectionMatrix();
      }
      camera.position.set(0, 0, safeDistance);
      const rotationTarget = rotationTargetRef.current;
      rotationTarget.set(0, 0, 0);
      controls.target.copy(rotationTarget);
      controls.update();
      defaultViewStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone()
      };
      controls.saveState();

      const trackGroup = trackGroupRef.current;
      if (trackGroup) {
        const centerOffset = new THREE.Vector3(
          width / 2 - 0.5,
          height / 2 - 0.5,
          depth / 2 - 0.5
        ).multiplyScalar(scale);
        trackGroup.scale.setScalar(scale);
        trackGroup.position.set(-centerOffset.x, -centerOffset.y, -centerOffset.z);
      }
    }

    const nextStats: Record<string, VolumeStats> = {};
    const seenKeys = new Set<string>();

    layers.forEach((layer, index) => {
      const volume = layer.volume;
      if (!volume) {
        removeResource(layer.key);
        return;
      }

      const texturePreparation = getCachedTextureData(volume);
      const { data: textureData, format: textureFormat } = texturePreparation;
      let resources: VolumeResources | null = resourcesRef.current.get(layer.key) ?? null;
      const needsRebuild =
        !resources ||
        resources.dimensions.width !== volume.width ||
        resources.dimensions.height !== volume.height ||
        resources.dimensions.depth !== volume.depth ||
        resources.channels !== volume.channels ||
        resources.texture.image.data.length !== textureData.length ||
        resources.texture.format !== textureFormat;

      const isGrayscale = volume.channels === 1;
      const colormapTexture = getColormapTexture(
        isGrayscale ? layer.color : DEFAULT_LAYER_COLOR
      );

      if (needsRebuild) {
        removeResource(layer.key);

        const texture = new THREE.Data3DTexture(textureData, volume.width, volume.height, volume.depth);
        texture.format = textureFormat;
        texture.type = THREE.UnsignedByteType;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.unpackAlignment = 1;
        texture.colorSpace = THREE.LinearSRGBColorSpace;
        texture.needsUpdate = true;

        const shader = VolumeRenderShader;
        const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
        uniforms.u_data.value = texture;
        uniforms.u_size.value.set(volume.width, volume.height, volume.depth);
        uniforms.u_clim.value.set(0, 1);
        uniforms.u_renderstyle.value = 0;
        uniforms.u_renderthreshold.value = 0.5;
        uniforms.u_cmdata.value = colormapTexture;
        uniforms.u_channels.value = volume.channels;
        uniforms.u_contrast.value = layer.contrast;
        uniforms.u_brightness.value = layer.brightness;

        const material = new THREE.ShaderMaterial({
          uniforms,
          vertexShader: shader.vertexShader,
          fragmentShader: shader.fragmentShader,
          side: THREE.BackSide,
          transparent: true
        });
        const baseMaterial = material as unknown as { depthWrite: boolean };
        baseMaterial.depthWrite = false;

        const geometry = new THREE.BoxGeometry(volume.width, volume.height, volume.depth);
        geometry.translate(volume.width / 2 - 0.5, volume.height / 2 - 0.5, volume.depth / 2 - 0.5);

        const mesh = new THREE.Mesh(geometry, material);
        const maxDimension = Math.max(volume.width, volume.height, volume.depth);
        const scale = 1 / maxDimension;
        mesh.scale.setScalar(scale);

        const centerOffset = new THREE.Vector3(
          volume.width / 2 - 0.5,
          volume.height / 2 - 0.5,
          volume.depth / 2 - 0.5
        ).multiplyScalar(scale);
        mesh.position.set(-centerOffset.x, -centerOffset.y, -centerOffset.z);

        const meshObject = mesh as unknown as { visible: boolean; renderOrder: number };
        meshObject.visible = layer.visible;
        meshObject.renderOrder = index;

        scene.add(mesh);
        mesh.updateMatrixWorld(true);

        const cameraUniform = mesh.material.uniforms.u_cameraPos.value;
        cameraUniform.copy(camera.position);
        mesh.worldToLocal(cameraUniform);

        resourcesRef.current.set(layer.key, {
          mesh,
          texture,
          dimensions: { width: volume.width, height: volume.height, depth: volume.depth },
          channels: volume.channels
        });
        resources = resourcesRef.current.get(layer.key) ?? null;
      }

      if (resources) {
        resources.texture.image.data = textureData;
        resources.texture.format = textureFormat;
        resources.texture.needsUpdate = true;

        const { mesh } = resources;
        const meshObject = mesh as unknown as { visible: boolean; renderOrder: number };
        meshObject.visible = layer.visible;
        meshObject.renderOrder = index;
        const materialUniforms = mesh.material.uniforms;
        materialUniforms.u_data.value = resources.texture;
        materialUniforms.u_channels.value = volume.channels;
        materialUniforms.u_contrast.value = layer.contrast;
        materialUniforms.u_brightness.value = layer.brightness;
        materialUniforms.u_cmdata.value = colormapTexture;

        const localCameraPosition = camera.position.clone();
        mesh.updateMatrixWorld();
        mesh.worldToLocal(localCameraPosition);
        materialUniforms.u_cameraPos.value.copy(localCameraPosition);
      }

      nextStats[layer.key] = { min: volume.min, max: volume.max };
      seenKeys.add(layer.key);
    });

    for (const key of Array.from(resourcesRef.current.keys())) {
      if (!seenKeys.has(key)) {
        removeResource(key);
      }
    }

    setLayerStats(nextStats);
  }, [getColormapTexture, layers]);

  useEffect(() => {
    return () => {
      for (const texture of colormapCacheRef.current.values()) {
        texture.dispose();
      }
      colormapCacheRef.current.clear();
    };
  }, []);

  return (
    <div className="volume-viewer">
      <header>
        <div>
          <h2>{title}</h2>
          {primaryVolume ? (
            <p>
              {primaryVolume.width} × {primaryVolume.height} × {primaryVolume.depth} · {primaryVolume.channels} channel
              {primaryVolume.channels > 1 ? 's' : ''}
            </p>
          ) : (
            <p>Select a dataset to preview its 3D volume.</p>
          )}
          {layers.length > 0 ? (
            <div className="viewer-layer-summary">
              {layers.map((layer) => (
                <span
                  key={layer.key}
                  className={layer.visible ? 'layer-pill' : 'layer-pill is-hidden'}
                  aria-label={layer.visible ? `${layer.label} visible` : `${layer.label} hidden`}
                >
                  {layer.label}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="viewer-meta">
          <div className="time-info">
            <span>Frame {totalTimepoints === 0 ? 0 : timeIndex + 1}</span>
            <span>/</span>
            <span>{totalTimepoints}</span>
          </div>
        </div>
      </header>

      <section className="viewer-surface">
        {showLoadingOverlay && (
          <div className="overlay">
            <div className="loading-panel">
              <span className="loading-title">Loading dataset…</span>
            </div>
          </div>
        )}
        <div className={`render-surface${hasMeasured ? ' is-ready' : ''}`} ref={containerRef} />
      </section>

    {totalTimepoints > 0 && (
      <section className="time-controls">
        <button
          type="button"
          onClick={onTogglePlayback}
          disabled={isLoading || totalTimepoints <= 1}
          className={isPlaying ? 'playing' : ''}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min={0}
          max={Math.max(0, totalTimepoints - 1)}
          value={clampedTimeIndex}
          onChange={(event) => onTimeIndexChange(Number(event.target.value))}
          disabled={isLoading || totalTimepoints <= 1}
        />
        <span className="time-label">
          {totalTimepoints === 0 ? 0 : clampedTimeIndex + 1} / {totalTimepoints}
        </span>
      </section>
    )}

      {Object.keys(layerStats).length > 0 && (
        <footer className="viewer-stats">
          <span className="viewer-stats-title">Intensity normalization</span>
          <ul>
            {layers
              .filter((layer) => layerStats[layer.key])
              .map((layer) => {
                const stats = layerStats[layer.key];
                if (!stats) {
                  return null;
                }
                return (
                  <li key={layer.key} className={layer.visible ? '' : 'is-hidden'}>
                    <span className="layer-label">{layer.label}</span>
                    <span className="layer-range">
                      {stats.min.toFixed(3)} – {stats.max.toFixed(3)}
                    </span>
                  </li>
                );
              })}
          </ul>
        </footer>
      )}
    </div>
  );
}

export default VolumeViewer;
