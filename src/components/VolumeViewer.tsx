import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { NormalizedVolume } from '../volumeProcessing';
import { VolumeRenderShader } from '../shaders/volumeRenderShader';
import { getCachedTextureData } from '../textureCache';
import './VolumeViewer.css';

type VolumeViewerProps = {
  volume: NormalizedVolume | null;
  filename: string | null;
  timeIndex: number;
  totalTimepoints: number;
  expectedTimepoints: number;
  isLoading: boolean;
  loadingProgress: number;
  loadedTimepoints: number;
  isPlaying: boolean;
  onTogglePlayback: () => void;
  onTimeIndexChange: (index: number) => void;
  contrast: number;
  brightness: number;
  onRegisterReset: (handler: (() => void) | null) => void;
};

type VolumeStats = {
  min: number;
  max: number;
};

type VolumeResources = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
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

const MOVEMENT_KEY_MAP: Record<string, keyof MovementState> = {
  KeyW: 'moveForward',
  KeyS: 'moveBackward',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  KeyE: 'moveUp',
  KeyQ: 'moveDown'
};

function createColormapTexture() {
  const size = 256;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    const intensity = Math.round(t * 255);
    data[i * 4 + 0] = intensity;
    data[i * 4 + 1] = intensity;
    data[i * 4 + 2] = intensity;
    data[i * 4 + 3] = Math.round(Math.min(255, Math.max(0, intensity)));
  }
  const texture = new THREE.DataTexture(data, size, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function VolumeViewer({
  volume,
  filename,
  isLoading,
  loadingProgress,
  loadedTimepoints,
  expectedTimepoints,
  timeIndex,
  totalTimepoints,
  isPlaying,
  onTogglePlayback,
  onTimeIndexChange,
  contrast,
  brightness,
  onRegisterReset
}: VolumeViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const resourcesRef = useRef<VolumeResources | null>(null);
  const colormapRef = useRef<THREE.DataTexture | null>(null);
  const pointerStateRef = useRef<PointerState | null>(null);
  const movementStateRef = useRef<MovementState>({
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false
  });
  const [stats, setStats] = useState<VolumeStats | null>(null);

  if (!colormapRef.current) {
    colormapRef.current = createColormapTexture();
  }

  const title = useMemo(() => {
    if (!filename) {
      return 'No dataset selected';
    }
    return `${filename}`;
  }, [filename]);

  const safeProgress = Math.min(1, Math.max(0, loadingProgress));
  const clampedLoadedTimepoints = Math.max(0, loadedTimepoints);
  const clampedExpectedTimepoints = Math.max(0, expectedTimepoints);
  const normalizedProgress =
    clampedExpectedTimepoints > 0
      ? Math.min(1, clampedLoadedTimepoints / clampedExpectedTimepoints)
      : safeProgress;
  const progressPercentage = Math.round(normalizedProgress * 100);
  const hasStartedLoading = normalizedProgress > 0 || clampedLoadedTimepoints > 0 || safeProgress > 0;
  const hasFinishedLoading =
    clampedExpectedTimepoints > 0 ? clampedLoadedTimepoints >= clampedExpectedTimepoints : safeProgress >= 1;
  const showLoadingOverlay = isLoading || (hasStartedLoading && !hasFinishedLoading);
  const clampedTimeIndex = totalTimepoints === 0 ? 0 : Math.min(timeIndex, totalTimepoints - 1);

  const handleResetView = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) {
      return;
    }
    controls.reset();
    controls.update();
  }, []);

  useEffect(() => {
    onRegisterReset(volume ? handleResetView : null);
    return () => {
      onRegisterReset(null);
    };
  }, [handleResetView, onRegisterReset, volume]);

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
      } else {
        const direction = new THREE.Vector3();
        camera.getWorldDirection(direction);
        const distance = controls.target.distanceTo(camera.position);
        const depthScale = Math.max(distance * 0.002, 0.0005);
        const moveAmount = -deltaY * depthScale;
        direction.multiplyScalar(moveAmount);
        camera.position.add(direction);
        controls.target.add(direction);
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

    const handleResize = () => {
      const target = containerRef.current;
      if (!target || !rendererRef.current || !cameraRef.current) {
        return;
      }
      const width = target.clientWidth;
      const height = target.clientHeight;
      rendererRef.current.setSize(width, height);
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const worldUp = new THREE.Vector3(0, 1, 0);
    const forwardVector = new THREE.Vector3();
    const horizontalForward = new THREE.Vector3();
    const rightVector = new THREE.Vector3();
    const movementVector = new THREE.Vector3();

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

      const distance = controls.target.distanceTo(camera.position);
      const movementScale = Math.max(distance * 0.002, 0.0005);

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
      controls.target.add(movementVector);
    };

    const renderLoop = () => {
      applyKeyboardMovement();
      controls.update();
      const resources = resourcesRef.current;
      if (resources) {
        const { mesh } = resources;
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
      if (resources) {
        scene.remove(resources.mesh);
        resources.mesh.geometry.dispose();
        resources.mesh.material.dispose();
        resources.texture.dispose();
        resourcesRef.current = null;
      }

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
    const releaseResources = () => {
      const resources = resourcesRef.current;
      if (!resources) {
        return;
      }

      const activeScene = sceneRef.current;
      if (activeScene) {
        activeScene.remove(resources.mesh);
      }

      resources.mesh.geometry.dispose();
      resources.mesh.material.dispose();
      resources.texture.dispose();
      resourcesRef.current = null;
    };

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const colormap = colormapRef.current;

    if (!scene || !camera || !controls || !colormap) {
      releaseResources();
      setStats(null);
      return;
    }

    if (!volume) {
      releaseResources();
      setStats(null);
      return;
    }

    const { width, height, depth, min, max, channels } = volume;
    const texturePreparation = getCachedTextureData(volume);
    const { data: textureData, format: textureFormat } = texturePreparation;
    let resources = resourcesRef.current;
    const dimensionsChanged =
      !resources ||
      resources.dimensions.width !== width ||
      resources.dimensions.height !== height ||
      resources.dimensions.depth !== depth ||
      resources.channels !== channels ||
      resources.texture.image.data.length !== textureData.length ||
      resources.texture.format !== textureFormat;

    if (dimensionsChanged) {
      if (resources) {
        releaseResources();
        resources = null;
      }

      const texture = new THREE.Data3DTexture(textureData, width, height, depth);
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
      uniforms.u_size.value.set(width, height, depth);
      uniforms.u_clim.value.set(0, 1);
      uniforms.u_renderstyle.value = 0;
      uniforms.u_renderthreshold.value = 0.5;
      uniforms.u_cmdata.value = colormap;
      uniforms.u_channels.value = channels;
      uniforms.u_contrast.value = contrast;
      uniforms.u_brightness.value = brightness;

      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
        side: THREE.BackSide,
        transparent: true
      });

      const geometry = new THREE.BoxGeometry(width, height, depth);
      geometry.translate(width / 2 - 0.5, height / 2 - 0.5, depth / 2 - 0.5);

      const mesh = new THREE.Mesh(geometry, material);
      const maxDimension = Math.max(width, height, depth);
      const scale = 1 / maxDimension;
      mesh.scale.setScalar(scale);

      const centerOffset = new THREE.Vector3(width / 2 - 0.5, height / 2 - 0.5, depth / 2 - 0.5).multiplyScalar(scale);
      mesh.position.set(-centerOffset.x, -centerOffset.y, -centerOffset.z);

      scene.add(mesh);
      mesh.updateMatrixWorld(true);

      resourcesRef.current = {
        mesh,
        texture,
        dimensions: { width, height, depth },
        channels
      };

      controls.target.set(0, 0, 0);
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
      controls.update();
      controls.saveState();

      const cameraUniform = mesh.material.uniforms.u_cameraPos.value;
      cameraUniform.copy(camera.position);
      mesh.worldToLocal(cameraUniform);
    } else if (resources) {
      resources.texture.image.data = textureData;
      resources.texture.format = textureFormat;
      resources.texture.needsUpdate = true;
      const { mesh } = resources;
      const materialUniforms = mesh.material.uniforms;
      materialUniforms.u_data.value = resources.texture;
      materialUniforms.u_channels.value = channels;
      materialUniforms.u_contrast.value = contrast;
      materialUniforms.u_brightness.value = brightness;

      const localCameraPosition = camera.position.clone();
      mesh.updateMatrixWorld();
      mesh.worldToLocal(localCameraPosition);
      materialUniforms.u_cameraPos.value.copy(localCameraPosition);
    }

    setStats({ min, max });
  }, [volume]);

  useEffect(() => {
    return () => {
      if (colormapRef.current) {
        colormapRef.current.dispose();
        colormapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const resources = resourcesRef.current;
    if (!resources) {
      return;
    }

    const uniforms = resources.mesh.material.uniforms;
    if ('u_contrast' in uniforms) {
      uniforms.u_contrast.value = contrast;
    }
    if ('u_brightness' in uniforms) {
      uniforms.u_brightness.value = brightness;
    }
  }, [brightness, contrast]);

  return (
    <div className="volume-viewer">
      <header>
        <div>
          <h2>{title}</h2>
          {volume ? (
            <p>
              {volume.width} × {volume.height} × {volume.depth} · {volume.channels} channel{volume.channels > 1 ? 's' : ''}
            </p>
          ) : (
            <p>Select a dataset to preview its 3D volume.</p>
          )}
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
              <span className="loading-title">Loading volumes…</span>
              <div className="progress-bar">
                <span style={{ width: `${normalizedProgress * 100}%` }} />
              </div>
              <span className="progress-meta">
                {clampedExpectedTimepoints > 0
                  ? `${Math.min(clampedLoadedTimepoints, clampedExpectedTimepoints)} / ${clampedExpectedTimepoints} · ${progressPercentage}%`
                  : `${progressPercentage}%`}
              </span>
            </div>
          </div>
        )}
        <div className="render-surface" ref={containerRef} />
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

      {stats && (
        <footer>
          <span>
            Intensity normalization: {stats.min.toFixed(3)} – {stats.max.toFixed(3)}
          </span>
        </footer>
      )}
    </div>
  );
}

export default VolumeViewer;
