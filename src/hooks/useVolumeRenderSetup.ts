import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import * as THREE from 'three';

export type ViewerProjectionMode = 'perspective' | 'orthographic';

export type DesktopViewerCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;

export type DesktopViewState = {
  projectionMode: ViewerProjectionMode;
  position: THREE.Vector3;
  target: THREE.Vector3;
  up: THREE.Vector3;
  zoom: number;
  distanceToTarget: number;
};

export type DesktopViewStateMap = Record<ViewerProjectionMode, DesktopViewState | null>;

export type ViewerCameraNavigationSample = {
  projectionMode: ViewerProjectionMode;
  distanceToTarget: number;
  projectedPixelsPerVoxel: number;
  isMoving: boolean;
  capturedAtMs: number;
};

export type VolumeRenderContext = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: DesktopViewerCamera;
  controls: OrbitControls;
  projectionMode: ViewerProjectionMode;
};

const MAX_RENDERER_PIXEL_RATIO = 2;
export const DEFAULT_DESKTOP_CAMERA_NEAR = 0.0001;
export const DEFAULT_DESKTOP_CAMERA_FAR = 1000;
export const DEFAULT_DESKTOP_PERSPECTIVE_FOV = 38;
const DEFAULT_ORTHOGRAPHIC_HALF_HEIGHT = 1;

export function createEmptyDesktopViewStateMap(): DesktopViewStateMap {
  return {
    perspective: null,
    orthographic: null,
  };
}

export function isPerspectiveDesktopCamera(
  camera: THREE.Camera | null | undefined,
): camera is THREE.PerspectiveCamera {
  return Boolean(camera && 'isPerspectiveCamera' in camera && camera.isPerspectiveCamera);
}

export function isOrthographicDesktopCamera(
  camera: THREE.Camera | null | undefined,
): camera is THREE.OrthographicCamera {
  return Boolean(camera && 'isOrthographicCamera' in camera && camera.isOrthographicCamera);
}

export function getProjectionModeForCamera(camera: THREE.Camera | null | undefined): ViewerProjectionMode {
  return isOrthographicDesktopCamera(camera) ? 'orthographic' : 'perspective';
}

function getSafeAspect(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 1;
  }
  return width / height;
}

export function resizeDesktopCamera(camera: DesktopViewerCamera, width: number, height: number): void {
  if (isPerspectiveDesktopCamera(camera)) {
    camera.aspect = getSafeAspect(width, height);
    camera.updateProjectionMatrix();
    return;
  }

  const aspect = getSafeAspect(width, height);
  camera.left = -DEFAULT_ORTHOGRAPHIC_HALF_HEIGHT * aspect;
  camera.right = DEFAULT_ORTHOGRAPHIC_HALF_HEIGHT * aspect;
  camera.top = DEFAULT_ORTHOGRAPHIC_HALF_HEIGHT;
  camera.bottom = -DEFAULT_ORTHOGRAPHIC_HALF_HEIGHT;
  camera.updateProjectionMatrix();
}

export function createDesktopCamera(
  projectionMode: 'perspective',
  width: number,
  height: number,
  near?: number,
  far?: number,
): THREE.PerspectiveCamera;
export function createDesktopCamera(
  projectionMode: 'orthographic',
  width: number,
  height: number,
  near?: number,
  far?: number,
): THREE.OrthographicCamera;
export function createDesktopCamera(
  projectionMode: ViewerProjectionMode,
  width: number,
  height: number,
  near?: number,
  far?: number,
): DesktopViewerCamera;
export function createDesktopCamera(
  projectionMode: ViewerProjectionMode,
  width: number,
  height: number,
  near = DEFAULT_DESKTOP_CAMERA_NEAR,
  far = DEFAULT_DESKTOP_CAMERA_FAR,
): DesktopViewerCamera {
  if (projectionMode === 'orthographic') {
    const aspect = getSafeAspect(width, height);
    return new THREE.OrthographicCamera(
      -DEFAULT_ORTHOGRAPHIC_HALF_HEIGHT * aspect,
      DEFAULT_ORTHOGRAPHIC_HALF_HEIGHT * aspect,
      DEFAULT_ORTHOGRAPHIC_HALF_HEIGHT,
      -DEFAULT_ORTHOGRAPHIC_HALF_HEIGHT,
      near,
      far,
    );
  }

  return new THREE.PerspectiveCamera(
    DEFAULT_DESKTOP_PERSPECTIVE_FOV,
    getSafeAspect(width, height),
    near,
    far,
  );
}

export function createDesktopControls(
  camera: DesktopViewerCamera,
  domElement: HTMLElement,
): OrbitControls {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = false;
  controls.dampingFactor = 0;
  controls.enablePan = false;
  controls.enableRotate = false;
  controls.rotateSpeed = 0.65;
  controls.zoomSpeed = 0.7;
  return controls;
}

export function computePerspectiveVisibleHeight(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
): number {
  const distance = Math.max(camera.position.distanceTo(target), 1e-4);
  const effectiveFov =
    typeof camera.getEffectiveFOV === 'function' ? camera.getEffectiveFOV() : camera.fov;
  return 2 * distance * Math.tan(THREE.MathUtils.degToRad(effectiveFov) * 0.5);
}

export function computeOrthographicVisibleHeight(
  camera: THREE.OrthographicCamera,
): number {
  return (camera.top - camera.bottom) / Math.max(camera.zoom, 1e-6);
}

export function computeProjectedPixelsPerUnit(
  camera: DesktopViewerCamera,
  renderer: THREE.WebGLRenderer,
  target: THREE.Vector3,
): number {
  const height = Math.max(renderer.domElement.clientHeight, 1);
  const visibleHeight = isPerspectiveDesktopCamera(camera)
    ? computePerspectiveVisibleHeight(camera, target)
    : computeOrthographicVisibleHeight(camera);
  return height / Math.max(visibleHeight, 1e-6);
}

export function captureDesktopViewState(
  camera: DesktopViewerCamera,
  target: THREE.Vector3,
  projectionMode = getProjectionModeForCamera(camera),
): DesktopViewState {
  return {
    projectionMode,
    position: camera.position.clone(),
    target: target.clone(),
    up: camera.up.clone(),
    zoom: Math.max(camera.zoom ?? 1, 1e-6),
    distanceToTarget: Math.max(camera.position.distanceTo(target), 1e-6),
  };
}

export function cloneDesktopViewState(state: DesktopViewState | null): DesktopViewState | null {
  if (!state) {
    return null;
  }
  return {
    projectionMode: state.projectionMode,
    position: state.position.clone(),
    target: state.target.clone(),
    up: state.up.clone(),
    zoom: state.zoom,
    distanceToTarget: state.distanceToTarget,
  };
}

export function cloneDesktopViewStateMap(stateMap: DesktopViewStateMap): DesktopViewStateMap {
  return {
    perspective: cloneDesktopViewState(stateMap.perspective),
    orthographic: cloneDesktopViewState(stateMap.orthographic),
  };
}

export function applyDesktopViewState(
  camera: DesktopViewerCamera,
  controls: OrbitControls,
  state: DesktopViewState,
  width: number,
  height: number,
): void {
  resizeDesktopCamera(camera, width, height);
  camera.position.copy(state.position);
  camera.up.copy(state.up);
  if (isOrthographicDesktopCamera(camera)) {
    camera.zoom = Math.max(state.zoom, 1e-6);
  } else if (isPerspectiveDesktopCamera(camera)) {
    camera.zoom = Math.max(state.zoom || 1, 1e-6);
  }
  camera.updateProjectionMatrix();
  controls.target.copy(state.target);
  camera.lookAt(state.target);
  controls.update();
}

export function createOrthographicViewStateFromPerspective(
  camera: THREE.PerspectiveCamera,
  target: THREE.Vector3,
): DesktopViewState {
  const visibleHeight = computePerspectiveVisibleHeight(camera, target);
  return {
    projectionMode: 'orthographic',
    position: camera.position.clone(),
    target: target.clone(),
    up: camera.up.clone(),
    zoom: Math.max(2 / Math.max(visibleHeight, 1e-6), 1e-6),
    distanceToTarget: Math.max(camera.position.distanceTo(target), 1e-6),
  };
}

export function createPerspectiveViewStateFromOrthographic(
  camera: THREE.OrthographicCamera,
  target: THREE.Vector3,
  fov = DEFAULT_DESKTOP_PERSPECTIVE_FOV,
): DesktopViewState {
  const visibleHeight = computeOrthographicVisibleHeight(camera);
  const distance = Math.max(
    visibleHeight / (2 * Math.tan(THREE.MathUtils.degToRad(fov) * 0.5)),
    1e-6,
  );
  const lookDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
  const position = target.clone().addScaledVector(lookDirection, -distance);
  return {
    projectionMode: 'perspective',
    position,
    target: target.clone(),
    up: camera.up.clone(),
    zoom: 1,
    distanceToTarget: distance,
  };
}

export function createVolumeRenderContext(
  container: HTMLElement,
  projectionMode: ViewerProjectionMode = 'perspective',
): VolumeRenderContext {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
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
  const camera = createDesktopCamera(
    projectionMode,
    container.clientWidth,
    container.clientHeight,
  );
  camera.position.set(0, 0, 2.5);
  scene.add(camera);

  const controls = createDesktopControls(camera, renderer.domElement);

  return { renderer, scene, camera, controls, projectionMode };
}

export function destroyVolumeRenderContext(context: VolumeRenderContext): void {
  const { renderer, scene, controls } = context;

  if (renderer.domElement.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  controls.dispose();

  renderer.setAnimationLoop(null);
  renderer.dispose();
  renderer.renderLists?.dispose?.();
  renderer.xr?.dispose?.();

  scene.clear();
}
