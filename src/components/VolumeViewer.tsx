import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { VolumeRenderShader1 } from 'three/examples/jsm/shaders/VolumeShader.js';
import type { VolumePayload } from '../api';
import './VolumeViewer.css';

type VolumeViewerProps = {
  volume: VolumePayload | null;
  filename: string | null;
  timeIndex: number;
  totalTimepoints: number;
  isLoading: boolean;
};

type VolumeStats = {
  min: number;
  max: number;
};

type VolumeResources = {
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
  texture: THREE.Data3DTexture;
};

type PointerState = {
  mode: 'pan' | 'dolly';
  pointerId: number;
  lastX: number;
  lastY: number;
  previousControlsEnabled: boolean;
};

const panOffset = new THREE.Vector3();
const panXAxis = new THREE.Vector3();
const panYAxis = new THREE.Vector3();
const panMatrix = new THREE.Matrix4();
const forwardVector = new THREE.Vector3();

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

function extractVolume(volume: VolumePayload) {
  const { width, height, depth, channels } = volume;
  const voxelCount = width * height * depth;
  const source = new Float32Array(volume.data);
  const intensities = new Float32Array(voxelCount);

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  if (channels === 1) {
    for (let i = 0; i < voxelCount; i++) {
      const value = source[i];
      intensities[i] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  } else {
    for (let i = 0; i < voxelCount; i++) {
      let sum = 0;
      const base = i * channels;
      for (let channel = 0; channel < channels; channel++) {
        sum += source[base + channel];
      }
      const value = sum / channels;
      intensities[i] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || min === Number.POSITIVE_INFINITY) {
    min = 0;
    max = 1;
  }

  const range = max - min || 1;
  const normalized = new Uint8Array(voxelCount);
  for (let i = 0; i < voxelCount; i++) {
    const normalizedValue = (intensities[i] - min) / range;
    const clamped = Math.max(0, Math.min(1, normalizedValue));
    normalized[i] = Math.round(clamped * 255);
  }

  return {
    normalized,
    min,
    max
  };
}

function VolumeViewer({ volume, filename, isLoading, timeIndex, totalTimepoints }: VolumeViewerProps) {
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
      pointerStateRef.current = {
        mode,
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
        previousControlsEnabled: controls.enabled
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
      const renderer = rendererRef.current;
      if (!controls || !camera || !renderer) {
        return;
      }

      const deltaX = event.clientX - state.lastX;
      const deltaY = event.clientY - state.lastY;

      if (state.mode === 'pan') {
        const element = renderer.domElement;
        const width = element.clientWidth || 1;
        const height = element.clientHeight || 1;
        const distance = controls.target.distanceTo(camera.position);
        const fovInRadians = THREE.MathUtils.degToRad(camera.fov);
        const halfHeight = Math.tan(fovInRadians * 0.5) * distance;
        const halfWidth = halfHeight * camera.aspect;
        const moveX = (-deltaX / width) * (halfWidth * 2);
        const moveY = (deltaY / height) * (halfHeight * 2);

        panMatrix.extractRotation(camera.matrixWorld);
        panXAxis.set(1, 0, 0).applyMatrix4(panMatrix).normalize();
        panYAxis.set(0, 1, 0).applyMatrix4(panMatrix).normalize();

        panOffset.copy(panXAxis).multiplyScalar(moveX);
        panOffset.addScaledVector(panYAxis, moveY);

        camera.position.add(panOffset);
        controls.target.add(panOffset);
      } else {
        camera.getWorldDirection(forwardVector);
        const distance = controls.target.distanceTo(camera.position);
        const depthScale = Math.max(distance * 0.002, 0.0005);
        const moveAmount = -deltaY * depthScale;
        forwardVector.multiplyScalar(moveAmount);
        camera.position.add(forwardVector);
        controls.target.add(forwardVector);
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
      domElement.removeEventListener('pointerdown', handlePointerDown, pointerDownOptions);
      domElement.removeEventListener('pointermove', handlePointerMove);
      domElement.removeEventListener('pointerup', handlePointerUp);
      domElement.removeEventListener('pointercancel', handlePointerUp);

      const activePointerState = pointerStateRef.current;
      if (activePointerState && controlsRef.current) {
        controlsRef.current.enabled = activePointerState.previousControlsEnabled;
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
    const resources = resourcesRef.current;
    const scene = sceneRef.current;
    if (resources && scene) {
      scene.remove(resources.mesh);
      resources.mesh.geometry.dispose();
      resources.mesh.material.dispose();
      resources.texture.dispose();
      resourcesRef.current = null;
    }

    if (!volume || !scene || !rendererRef.current || !cameraRef.current || !controlsRef.current) {
      setStats(null);
      return;
    }

    const { width, height, depth } = volume;
    const { normalized, min, max } = extractVolume(volume);

    const texture = new THREE.Data3DTexture(normalized, width, height, depth);
    texture.format = THREE.RedFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    const shader = VolumeRenderShader1;
    const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
    uniforms.u_data.value = texture;
    uniforms.u_size.value.set(width, height, depth);
    uniforms.u_clim.value.set(0, 1);
    uniforms.u_renderstyle.value = 0;
    uniforms.u_renderthreshold.value = 0.5;
    uniforms.u_cmdata.value = colormapRef.current;

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
    resourcesRef.current = { mesh, texture };
    setStats({ min, max });

    controlsRef.current.target.set(0, 0, 0);
    const boundingRadius = Math.sqrt(width * width + height * height + depth * depth) * scale * 0.5;
    const fovInRadians = THREE.MathUtils.degToRad(cameraRef.current.fov * 0.5);
    const distance = boundingRadius / Math.sin(fovInRadians);
    const safeDistance = Number.isFinite(distance) ? distance * 1.2 : 2.5;
    cameraRef.current.position.set(0, 0, safeDistance);
    controlsRef.current.update();
    controlsRef.current.saveState();

    return () => {
      if (resourcesRef.current) {
        const current = resourcesRef.current;
        scene.remove(current.mesh);
        current.mesh.geometry.dispose();
        current.mesh.material.dispose();
        current.texture.dispose();
        resourcesRef.current = null;
      }
    };
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
        {isLoading && <div className="overlay">Loading…</div>}
        <div className="render-surface" ref={containerRef} />
      </section>

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
