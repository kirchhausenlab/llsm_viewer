import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import * as THREE from 'three';

export type VolumeRenderContext = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
};

const MAX_RENDERER_PIXEL_RATIO = 2;

export function createVolumeRenderContext(container: HTMLElement): VolumeRenderContext {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const pixelRatio =
    typeof window === 'undefined'
      ? 1
      : Math.min(window.devicePixelRatio ?? 1, MAX_RENDERER_PIXEL_RATIO);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.background = 'transparent';
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType?.('local-floor');

  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    38,
    container.clientWidth / container.clientHeight,
    0.0001,
    1000,
  );
  camera.position.set(0, 0, 2.5);
  scene.add(camera);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.dampingFactor = 0;
  controls.enablePan = false;
  controls.enableRotate = false;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.7;

  return { renderer, scene, camera, controls };
}
