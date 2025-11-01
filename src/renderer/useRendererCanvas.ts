import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type TrackMaterialResolutionTarget = {
  resolution: THREE.Vector2;
  needsUpdate?: boolean;
};

export type TrackMaterialPair = {
  material: TrackMaterialResolutionTarget;
  outlineMaterial?: TrackMaterialResolutionTarget;
};

export type UseRendererCanvasParams = {
  container: HTMLDivElement | null;
  rendererParameters?: THREE.WebGLRendererParameters;
  maxPixelRatio?: number;
  cameraOptions?: {
    fov?: number;
    near?: number;
    far?: number;
    position?: THREE.Vector3 | [number, number, number];
  };
  enableXR?: boolean;
  onResize?: (size: { width: number; height: number }) => void;
  getTrackMaterials?: () => Iterable<TrackMaterialPair> | null | undefined;
};

export type UseRendererCanvasResult = {
  renderer: THREE.WebGLRenderer | null;
  scene: THREE.Scene | null;
  camera: THREE.PerspectiveCamera | null;
  controls: OrbitControls | null;
  hasMeasured: boolean;
  handleResize: () => void;
  dispose: () => void;
};

const DEFAULT_MAX_PIXEL_RATIO = 2;

const DEFAULT_RENDERER_PARAMETERS: THREE.WebGLRendererParameters = {
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance'
};

const DEFAULT_CAMERA_POSITION: [number, number, number] = [0, 0, 2.5];

export function useRendererCanvas({
  container,
  rendererParameters,
  maxPixelRatio = DEFAULT_MAX_PIXEL_RATIO,
  cameraOptions,
  enableXR = false,
  onResize,
  getTrackMaterials
}: UseRendererCanvasParams): UseRendererCanvasResult {
  const [hasMeasured, setHasMeasured] = useState(false);
  const [state, setState] = useState<{
    renderer: THREE.WebGLRenderer | null;
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    controls: OrbitControls | null;
  }>({ renderer: null, scene: null, camera: null, controls: null });

  const cleanupRef = useRef<(() => void) | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(container);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    containerRef.current = container;
  }, [container]);

  const dispose = useCallback(() => {
    const cleanup = cleanupRef.current;
    if (cleanup) {
      cleanup();
      cleanupRef.current = null;
    }
  }, []);

  const mergedRendererParameters = useMemo(() => ({
    ...DEFAULT_RENDERER_PARAMETERS,
    ...rendererParameters
  }), [rendererParameters]);

  const mergedCameraOptions = useMemo(
    () => ({
      fov: 38,
      near: 0.0001,
      far: 1000,
      position: DEFAULT_CAMERA_POSITION,
      ...cameraOptions
    }),
    [cameraOptions]
  );

  const handleResize = useCallback(() => {
    const containerNode = containerRef.current;
    const rendererInstance = rendererRef.current;
    const cameraInstance = cameraRef.current;
    if (!containerNode || !rendererInstance || !cameraInstance) {
      return;
    }

    if ((rendererInstance.xr as { isPresenting?: boolean } | undefined)?.isPresenting) {
      return;
    }

    const width = containerNode.clientWidth;
    const height = containerNode.clientHeight;

    if (width > 0 && height > 0) {
      setHasMeasured(true);
    }

    rendererInstance.setSize(width, height);

    if (width > 0 && height > 0) {
      const trackMaterials = getTrackMaterials?.();
      if (trackMaterials) {
        for (const { material, outlineMaterial } of trackMaterials) {
          material.resolution.set(width, height);
          if (typeof material.needsUpdate === 'boolean') {
            material.needsUpdate = true;
          }
          if (outlineMaterial) {
            outlineMaterial.resolution.set(width, height);
            if (typeof outlineMaterial.needsUpdate === 'boolean') {
              outlineMaterial.needsUpdate = true;
            }
          }
        }
      }
    }

    if (height > 0) {
      cameraInstance.aspect = width / height;
    }
    cameraInstance.updateProjectionMatrix();

    onResize?.({ width, height });
  }, [getTrackMaterials, onResize]);

  useEffect(() => {
    if (!container) {
      dispose();
      return;
    }

    dispose();

    const renderer = new THREE.WebGLRenderer(mergedRendererParameters);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const pixelRatio =
      typeof window === 'undefined'
        ? 1
        : Math.min(window.devicePixelRatio ?? 1, maxPixelRatio);
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.background = 'transparent';
    renderer.xr.enabled = enableXR;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      mergedCameraOptions.fov,
      container.clientHeight > 0 ? container.clientWidth / container.clientHeight : 1,
      mergedCameraOptions.near,
      mergedCameraOptions.far
    );

    const position = mergedCameraOptions.position;
    if (position instanceof THREE.Vector3) {
      camera.position.copy(position);
    } else if (Array.isArray(position)) {
      const [x, y, z] = position;
      camera.position.set(x, y, z);
    }

    scene.add(camera);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = false;

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    setState({ renderer, scene, camera, controls });
    setHasMeasured(false);

    const resizeObserver =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => handleResize())
        : null;
    if (resizeObserver) {
      resizeObserver.observe(container);
    }
    handleResize();

    const cleanup = () => {
      resizeObserver?.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      setState({ renderer: null, scene: null, camera: null, controls: null });
      setHasMeasured(false);
    };

    cleanupRef.current = cleanup;

    return () => {
      cleanup();
      if (cleanupRef.current === cleanup) {
        cleanupRef.current = null;
      }
    };
  }, [
    container,
    dispose,
    enableXR,
    handleResize,
    maxPixelRatio,
    mergedCameraOptions,
    mergedRendererParameters
  ]);

  return {
    renderer: state.renderer,
    scene: state.scene,
    camera: state.camera,
    controls: state.controls,
    hasMeasured,
    handleResize,
    dispose
  };
}
