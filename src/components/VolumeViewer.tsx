import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { NormalizedVolume } from '../volumeProcessing';
import { VolumeRenderShader } from '../shaders/volumeRenderShader';
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

type PreparedTexture = {
  data: Uint8Array;
  format: THREE.Data3DTexture['format'];
};

type PointerState = {
  mode: 'pan' | 'dolly';
  pointerId: number;
  lastX: number;
  lastY: number;
  previousControlsEnabled: boolean;
  previousEnablePan: boolean | null;
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

function prepareTextureData(volume: NormalizedVolume): PreparedTexture {
  const { normalized, width, height, depth, channels } = volume;
  const voxelCount = width * height * depth;

  if (channels <= 2) {
    const data = new Uint8Array(normalized.length);
    data.set(normalized);
    const format = channels === 1 ? THREE.RedFormat : THREE.RGFormat;
    return { data, format };
  }

  const packed = new Uint8Array(voxelCount * 4);
  const alphaChannels = Math.min(channels, 3);

  for (let index = 0; index < voxelCount; index++) {
    const srcBase = index * channels;
    const dstBase = index * 4;

    const r = normalized[srcBase];
    const g = channels > 1 ? normalized[srcBase + 1] : r;
    const b = channels > 2 ? normalized[srcBase + 2] : g;

    packed[dstBase] = r;
    packed[dstBase + 1] = g;
    packed[dstBase + 2] = b;

    if (channels >= 4) {
      packed[dstBase + 3] = normalized[srcBase + 3];
    } else {
      let alphaSum = 0;
      for (let channel = 0; channel < alphaChannels; channel++) {
        alphaSum += normalized[srcBase + channel];
      }
      packed[dstBase + 3] = Math.round(alphaSum / alphaChannels);
    }
  }

  return { data: packed, format: THREE.RGBAFormat };
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
  onTimeIndexChange
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
  const progressPercentage = Math.round(safeProgress * 100);
  const hasStartedLoading = safeProgress > 0 || loadedTimepoints > 0;
  const showLoadingOverlay = isLoading || (hasStartedLoading && safeProgress < 1);
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
      0.01,
      100
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

    const renderLoop = () => {
      controls.update();
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
    const texturePreparation = prepareTextureData(volume);
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
      camera.position.set(0, 0, safeDistance);
      controls.update();
      controls.saveState();
    } else if (resources) {
      resources.texture.image.data.set(textureData);
      resources.texture.needsUpdate = true;
      resources.mesh.material.uniforms.u_data.value = resources.texture;
      resources.mesh.material.uniforms.u_channels.value = channels;
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
          <button type="button" onClick={handleResetView} disabled={!volume}>
            Reset view
          </button>
        </div>
      </header>

      <section className="viewer-surface">
        {showLoadingOverlay && (
          <div className="overlay">
            <div className="loading-panel">
              <span className="loading-title">Loading volumes…</span>
              <div className="progress-bar">
                <span style={{ width: `${safeProgress * 100}%` }} />
              </div>
              <span className="progress-meta">
                {expectedTimepoints > 0
                  ? `${Math.min(loadedTimepoints, expectedTimepoints)} / ${expectedTimepoints} · ${progressPercentage}%`
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
