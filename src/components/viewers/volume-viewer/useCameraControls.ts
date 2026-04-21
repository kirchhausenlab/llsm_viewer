import { type MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import {
  applyDesktopViewState,
  captureDesktopViewState,
  computeOrthographicVisibleHeight,
  createDesktopCamera,
  createDesktopControls,
  createEmptyDesktopViewStateMap,
  createOrthographicViewStateFromPerspective,
  createVolumeRenderContext,
  isOrthographicDesktopCamera,
  isPerspectiveDesktopCamera,
  resizeDesktopCamera,
  type DesktopViewStateMap,
  type DesktopViewerCamera,
  type ViewerProjectionMode,
  type VolumeRenderContext,
} from '../../../hooks/useVolumeRenderSetup';
import {
  resolveSceneWorldBounds,
} from './cameraNavigationBounds';
import type { MovementState, RoiRenderResource, TrackRenderResource } from '../VolumeViewer.types';
import type { CameraRotation, CameraWindowState } from '../../../types/camera';
import { normalizeSignedAngleDegrees } from '../../../shared/utils/cameraViews';

const MOVEMENT_KEY_MAP: Record<string, keyof MovementState> = {
  KeyW: 'moveForward',
  KeyS: 'moveBackward',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  Space: 'moveUp',
  KeyC: 'moveDown'
};

const ROLL_KEY_MAP: Record<string, keyof MovementState> = {
  KeyQ: 'rollLeft',
  KeyE: 'rollRight'
};

const LOOK_KEY_CODES = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

type PointerLookHandlers = {
  beginPointerLook: (event: PointerEvent) => void;
  updatePointerLook: (event: PointerEvent) => void;
  endPointerLook: (event?: PointerEvent) => void;
};

type UseCameraControlsParams = {
  trackLinesRef: MutableRefObject<Map<string, TrackRenderResource>>;
  roiLinesRef: MutableRefObject<Map<string, RoiRenderResource>>;
  volumeRootGroupRef: MutableRefObject<THREE.Group | null>;
  currentDimensionsRef: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  followTargetActiveRef: MutableRefObject<boolean>;
  followTargetOffsetRef: MutableRefObject<THREE.Vector3 | null>;
  setHasMeasured: (hasMeasured: boolean) => void;
  projectionMode: ViewerProjectionMode;
  translationSpeedMultiplier?: number;
  rotationSpeedMultiplier?: number;
  enableKeyboardNavigation?: boolean;
  rotationLocked?: boolean;
};

export function useCameraControls({
  trackLinesRef,
  roiLinesRef,
  volumeRootGroupRef,
  currentDimensionsRef,
  followTargetActiveRef,
  followTargetOffsetRef,
  setHasMeasured,
  projectionMode,
  translationSpeedMultiplier = 1,
  rotationSpeedMultiplier = 1,
  enableKeyboardNavigation = true,
  rotationLocked = false,
}: UseCameraControlsParams) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<DesktopViewerCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rotationTargetRef = useRef(new THREE.Vector3());
  const defaultViewStateRef = useRef<DesktopViewStateMap>(createEmptyDesktopViewStateMap());
  const projectionViewStateRef = useRef<DesktopViewStateMap>(createEmptyDesktopViewStateMap());
  const currentProjectionModeRef = useRef<ViewerProjectionMode>(projectionMode);
  const movementStateRef = useRef<MovementState>({
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false,
    rollLeft: false,
    rollRight: false,
  });
  const endPointerLookRef = useRef<(event?: PointerEvent) => void>(() => {});

  const handleResize = useCallback(() => {
    const target = containerRef.current;
    const rendererInstance = rendererRef.current;
    const cameraInstance = cameraRef.current;
    if (!target || !rendererInstance || !cameraInstance) {
      return;
    }
    if (rendererInstance.xr?.isPresenting) {
      return;
    }

    const width = target.clientWidth;
    const height = target.clientHeight;
    if (width > 0 && height > 0) {
      setHasMeasured(true);
    }

    rendererInstance.setSize(width, height);
    if (width > 0 && height > 0) {
      for (const resource of trackLinesRef.current.values()) {
        resource.material.resolution.set(width, height);
        resource.material.needsUpdate = true;
        if (resource.kind === 'overlay') {
          resource.outlineMaterial.resolution.set(width, height);
          resource.outlineMaterial.needsUpdate = true;
        }
      }
      for (const resource of roiLinesRef.current.values()) {
        resource.material.resolution.set(width, height);
        resource.material.needsUpdate = true;
      }
    }
    resizeDesktopCamera(cameraInstance, width, height);
  }, [roiLinesRef, setHasMeasured, trackLinesRef]);

  const worldUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const lookDirectionRef = useRef(new THREE.Vector3());
  const centerWorldRef = useRef(new THREE.Vector3());
  const cornerWorldRef = useRef(new THREE.Vector3());
  const forwardVectorRef = useRef(new THREE.Vector3());
  const horizontalForwardRef = useRef(new THREE.Vector3());
  const rightVectorRef = useRef(new THREE.Vector3());
  const movementVectorRef = useRef(new THREE.Vector3());
  const rollAxisRef = useRef(new THREE.Vector3());
  const rollQuaternionRef = useRef(new THREE.Quaternion());
  const cameraEulerRef = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));
  const keyboardLookStateRef = useRef({
    rotateLeft: false,
    rotateRight: false,
    rotateUp: false,
    rotateDown: false,
  });
  const translationSpeedMultiplierRef = useRef(translationSpeedMultiplier);
  translationSpeedMultiplierRef.current = translationSpeedMultiplier;
  const rotationSpeedMultiplierRef = useRef(rotationSpeedMultiplier);
  rotationSpeedMultiplierRef.current = rotationSpeedMultiplier;
  const rotationLockedRef = useRef(rotationLocked);
  rotationLockedRef.current = rotationLocked;

  const PERSPECTIVE_TRANSLATION_BASE_SPEED = 0.0125;
  const ROLL_SPEED = 0.02;
  const LOOK_SENSITIVITY = 0.0025;
  const MAX_LOOK_PITCH = Math.PI / 2 - 0.001;
  const KEYBOARD_LOOK_SENSITIVITY = 0.02;
  const TARGET_DISTANCE_FALLBACK = 1;

  const resolveCameraRotation = useCallback((camera: DesktopViewerCamera): CameraRotation => {
    const euler = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(camera.quaternion, 'YXZ');
    return {
      yaw: normalizeSignedAngleDegrees(THREE.MathUtils.radToDeg(euler.y)),
      pitch: normalizeSignedAngleDegrees(THREE.MathUtils.radToDeg(euler.x)),
      roll: normalizeSignedAngleDegrees(THREE.MathUtils.radToDeg(euler.z)),
    };
  }, []);

  const resolveOrientationVectors = useCallback((rotation: CameraRotation) => {
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(rotation.pitch),
      THREE.MathUtils.degToRad(rotation.yaw),
      THREE.MathUtils.degToRad(rotation.roll),
      'YXZ',
    );
    const quaternion = new THREE.Quaternion().setFromEuler(euler);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion).normalize();
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion).normalize();
    return { forward, up };
  }, []);

  const mapWorldToCanonical = useCallback((worldPosition: THREE.Vector3) => {
    const canonicalPosition = worldPosition.clone();
    const volumeRootGroup = volumeRootGroupRef.current;
    if (volumeRootGroup) {
      volumeRootGroup.updateMatrixWorld(true);
      volumeRootGroup.worldToLocal(canonicalPosition);
    }
    return canonicalPosition;
  }, [volumeRootGroupRef]);

  const mapCanonicalToWorld = useCallback((canonicalPosition: { x: number; y: number; z: number }) => {
    const localPosition = new THREE.Vector3(canonicalPosition.x, canonicalPosition.y, canonicalPosition.z);
    const volumeRootGroup = volumeRootGroupRef.current;
    if (volumeRootGroup) {
      volumeRootGroup.updateMatrixWorld(true);
      return volumeRootGroup.localToWorld(localPosition);
    }
    return localPosition;
  }, [volumeRootGroupRef]);

  const resolveTargetDistance = useCallback((camera: DesktopViewerCamera, controls: OrbitControls) => {
    const distance = camera.position.distanceTo(controls.target);
    return Number.isFinite(distance) && distance > 1e-6 ? distance : TARGET_DISTANCE_FALLBACK;
  }, []);

  const resolveCanonicalBounds = useCallback(() => {
    const dimensions = currentDimensionsRef.current;
    const volumeRootGroup = volumeRootGroupRef.current;
    if (!dimensions || !volumeRootGroup) {
      return null;
    }

    const centerLocal = new THREE.Vector3(
      dimensions.width / 2 - 0.5,
      dimensions.height / 2 - 0.5,
      dimensions.depth / 2 - 0.5,
    );
    const cornerLocal = new THREE.Vector3(dimensions.width - 1, dimensions.height - 1, dimensions.depth - 1);
    volumeRootGroup.updateMatrixWorld(true);
    const centerWorld = volumeRootGroup.localToWorld(centerWorldRef.current.copy(centerLocal));
    const cornerWorld = volumeRootGroup.localToWorld(cornerWorldRef.current.copy(cornerLocal));
    return {
      centerWorld: centerWorld.clone(),
      radius: Math.max(centerWorld.distanceTo(cornerWorld), 1e-3),
    };
  }, [currentDimensionsRef, volumeRootGroupRef]);

  const createWeaklyCanonicalOrthographicState = useCallback(
    (camera: DesktopViewerCamera) => {
      const bounds = resolveCanonicalBounds();
      if (!bounds) {
        return isPerspectiveDesktopCamera(camera)
          ? createOrthographicViewStateFromPerspective(camera, rotationTargetRef.current.clone())
          : captureDesktopViewState(camera, rotationTargetRef.current.clone(), 'orthographic');
      }

      const rotation = resolveCameraRotation(camera);
      const { forward, up } = resolveOrientationVectors(rotation);
      const safeDistance = Math.max(bounds.radius * 3, TARGET_DISTANCE_FALLBACK);
      const visibleHeight = Math.max(bounds.radius * 2.2, 1e-6);
      return {
        projectionMode: 'orthographic' as const,
        position: bounds.centerWorld.clone().addScaledVector(forward, -safeDistance),
        target: bounds.centerWorld.clone(),
        up,
        zoom: Math.max(2 / visibleHeight, 1e-6),
        distanceToTarget: safeDistance,
      };
    },
    [resolveCanonicalBounds, resolveCameraRotation, resolveOrientationVectors],
  );

  const captureCameraWindowState = useCallback((): CameraWindowState | null => {
    const camera = cameraRef.current;
    if (!camera) {
      return null;
    }
    const canonicalPosition = mapWorldToCanonical(camera.position);
    return {
      cameraPosition: {
        x: Number(canonicalPosition.x.toFixed(6)),
        y: Number(canonicalPosition.y.toFixed(6)),
        z: Number(canonicalPosition.z.toFixed(6)),
      },
      cameraRotation: resolveCameraRotation(camera),
    };
  }, [mapWorldToCanonical, resolveCameraRotation]);

  const applyCameraPose = useCallback(
    ({
      cameraPosition,
      cameraRotation,
    }: {
      cameraPosition?: { x: number; y: number; z: number } | null;
      cameraRotation: CameraRotation;
    }): boolean => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) {
        return false;
      }

      const nextPosition = cameraPosition ? mapCanonicalToWorld(cameraPosition) : camera.position.clone();
      const { forward, up } = resolveOrientationVectors(cameraRotation);
      const nextTarget = followTargetActiveRef.current
        ? controls.target.clone()
        : nextPosition.clone().addScaledVector(forward, resolveTargetDistance(camera, controls));

      camera.position.copy(nextPosition);
      camera.up.copy(up);
      controls.target.copy(nextTarget);
      camera.lookAt(nextTarget);
      camera.updateMatrixWorld(true);
      controls.update();
      rotationTargetRef.current.copy(nextTarget);

      if (followTargetActiveRef.current) {
        if (!followTargetOffsetRef.current) {
          followTargetOffsetRef.current = new THREE.Vector3();
        }
        followTargetOffsetRef.current.copy(camera.position).sub(nextTarget);
      }

      return true;
    },
    [
      followTargetActiveRef,
      followTargetOffsetRef,
      mapCanonicalToWorld,
      resolveOrientationVectors,
      resolveTargetDistance,
    ],
  );

  const resolveMovementScale = useCallback(
    (camera: DesktopViewerCamera) => {
      const multiplier = Math.max(0.1, Math.min(3, translationSpeedMultiplierRef.current));
      if (!isOrthographicDesktopCamera(camera)) {
        return PERSPECTIVE_TRANSLATION_BASE_SPEED * multiplier;
      }
      return Math.max(computeOrthographicVisibleHeight(camera) * 0.005 * multiplier, 0.0006);
    },
    [],
  );

  const applyKeyboardMovement = useCallback(
    (renderer: THREE.WebGLRenderer, camera: DesktopViewerCamera, controls: OrbitControls) => {
      if (renderer.xr.isPresenting) {
        return;
      }
      const movementState = movementStateRef.current;
      if (
        !movementState ||
        (!movementState.moveForward &&
          !movementState.moveBackward &&
          !movementState.moveLeft &&
          !movementState.moveRight &&
          !movementState.moveUp &&
          !movementState.moveDown &&
          !movementState.rollLeft &&
          !movementState.rollRight)
      ) {
        return;
      }

      const forwardVector = forwardVectorRef.current;
      camera.getWorldDirection(forwardVector).normalize();

      const rollInput = rotationLockedRef.current
        ? 0
        : (movementState.rollLeft ? 1 : 0) - (movementState.rollRight ? 1 : 0);
      if (rollInput !== 0) {
        const rollAxis = rollAxisRef.current.copy(forwardVector).normalize();
        const rollQuaternion = rollQuaternionRef.current;
        const multiplier = Math.max(0.1, Math.min(3, rotationSpeedMultiplierRef.current));
        rollQuaternion.setFromAxisAngle(rollAxis, rollInput * ROLL_SPEED * multiplier);
        camera.applyQuaternion(rollQuaternion);
        camera.up.applyQuaternion(rollQuaternion);
      }

      if (followTargetActiveRef.current) {
        return;
      }

      const rotationTarget = rotationTargetRef.current;
      const movementScale = resolveMovementScale(camera);

      const horizontalForward = horizontalForwardRef.current;
      horizontalForward.copy(forwardVector).projectOnPlane(worldUp);
      if (horizontalForward.lengthSq() < 1e-8) {
        horizontalForward.set(0, 0, forwardVector.z >= 0 ? 1 : -1);
      } else {
        horizontalForward.normalize();
      }

      const rightVector = rightVectorRef.current;
      rightVector.crossVectors(horizontalForward, worldUp);
      if (rightVector.lengthSq() < 1e-8) {
        rightVector.set(1, 0, 0);
      } else {
        rightVector.normalize();
      }

      const movementVector = movementVectorRef.current;
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
    },
    [followTargetActiveRef, resolveMovementScale, worldUp],
  );

  const applyKeyboardRotation = useCallback(
    (renderer: THREE.WebGLRenderer, camera: DesktopViewerCamera, controls: OrbitControls) => {
      if (renderer.xr.isPresenting) {
        return;
      }
      if (rotationLockedRef.current) {
        return;
      }

      const lookState = keyboardLookStateRef.current;
      const yawInput = (lookState.rotateRight ? 1 : 0) - (lookState.rotateLeft ? 1 : 0);
      const pitchInput = (lookState.rotateDown ? 1 : 0) - (lookState.rotateUp ? 1 : 0);
      if (yawInput === 0 && pitchInput === 0) {
        return;
      }

      const cameraEuler = cameraEulerRef.current;
      const multiplier = Math.max(0.1, Math.min(3, rotationSpeedMultiplierRef.current));
      cameraEuler.setFromQuaternion(camera.quaternion, 'YXZ');
      cameraEuler.y -= yawInput * KEYBOARD_LOOK_SENSITIVITY * multiplier;
      cameraEuler.x -= pitchInput * KEYBOARD_LOOK_SENSITIVITY * multiplier;
      cameraEuler.x = THREE.MathUtils.clamp(cameraEuler.x, -MAX_LOOK_PITCH, MAX_LOOK_PITCH);
      camera.quaternion.setFromEuler(cameraEuler);

      const orbitCenter = followTargetActiveRef.current ? controls.target : rotationTargetRef.current;
      const targetDistance = Math.max(camera.position.distanceTo(orbitCenter), TARGET_DISTANCE_FALLBACK);
      const lookDirection = lookDirectionRef.current;
      lookDirection.set(0, 0, -1).applyQuaternion(camera.quaternion);

      if (followTargetActiveRef.current) {
        camera.position.copy(orbitCenter).addScaledVector(lookDirection, -targetDistance);
        rotationTargetRef.current.copy(orbitCenter);
        controls.target.copy(orbitCenter);
      } else {
        rotationTargetRef.current.copy(camera.position).addScaledVector(lookDirection, targetDistance);
        controls.target.copy(rotationTargetRef.current);
      }
    },
    [followTargetActiveRef],
  );

  const createPointerLookHandlers = useCallback(
    ({ renderer }: VolumeRenderContext): PointerLookHandlers => {
      const domElement = renderer.domElement;
      const pointerLookState = {
        activePointerId: null as number | null,
        yaw: 0,
        pitch: 0,
        roll: 0,
        lastClientX: 0,
        lastClientY: 0,
      };
      const cameraEuler = cameraEulerRef.current;
      const lookDirection = lookDirectionRef.current;

      const resolvePointerLookContext = () => {
        const camera = cameraRef.current;
        const controls = controlsRef.current;
        if (!camera || !controls) {
          return null;
        }
        return { camera, controls };
      };

      const beginPointerLook = (event: PointerEvent) => {
        if (renderer.xr.isPresenting) {
          return;
        }
        if (rotationLockedRef.current) {
          return;
        }

        const context = resolvePointerLookContext();
        if (!context) {
          return;
        }
        const { camera } = context;

        pointerLookState.activePointerId = event.pointerId;
        pointerLookState.lastClientX = event.clientX;
        pointerLookState.lastClientY = event.clientY;

        cameraEuler.setFromQuaternion(camera.quaternion, 'YXZ');
        pointerLookState.yaw = cameraEuler.y;
        pointerLookState.pitch = cameraEuler.x;
        pointerLookState.roll = cameraEuler.z;

        domElement.setPointerCapture(event.pointerId);
      };

      const updatePointerLook = (event: PointerEvent) => {
        if (pointerLookState.activePointerId !== event.pointerId) {
          return;
        }
        if (rotationLockedRef.current) {
          endPointerLook(event);
          return;
        }

        const context = resolvePointerLookContext();
        if (!context) {
          return;
        }
        const { camera, controls } = context;

        const deltaX = event.clientX - pointerLookState.lastClientX;
        const deltaY = event.clientY - pointerLookState.lastClientY;
        pointerLookState.lastClientX = event.clientX;
        pointerLookState.lastClientY = event.clientY;

        const multiplier = Math.max(0.1, Math.min(3, rotationSpeedMultiplierRef.current));
        pointerLookState.yaw -= deltaX * LOOK_SENSITIVITY * multiplier;
        pointerLookState.pitch -= deltaY * LOOK_SENSITIVITY * multiplier;
        pointerLookState.pitch = THREE.MathUtils.clamp(pointerLookState.pitch, -MAX_LOOK_PITCH, MAX_LOOK_PITCH);

        cameraEuler.set(pointerLookState.pitch, pointerLookState.yaw, pointerLookState.roll, 'YXZ');
        camera.quaternion.setFromEuler(cameraEuler);

        const orbitCenter = followTargetActiveRef.current ? controls.target : rotationTargetRef.current;
        const targetDistance = Math.max(camera.position.distanceTo(orbitCenter), TARGET_DISTANCE_FALLBACK);
        lookDirection.set(0, 0, -1).applyQuaternion(camera.quaternion);

        if (followTargetActiveRef.current) {
          camera.position.copy(orbitCenter).addScaledVector(lookDirection, -targetDistance);
          rotationTargetRef.current.copy(orbitCenter);
          controls.target.copy(orbitCenter);
        } else {
          rotationTargetRef.current.copy(camera.position).addScaledVector(lookDirection, targetDistance);
          controls.target.copy(rotationTargetRef.current);
        }
        controls.update();
      };

      const endPointerLook = (event?: PointerEvent) => {
        const activePointerId = pointerLookState.activePointerId;
        if (activePointerId === null) {
          return;
        }

        pointerLookState.activePointerId = null;

        if (event && domElement.hasPointerCapture(activePointerId)) {
          domElement.releasePointerCapture(activePointerId);
        }
      };

      endPointerLookRef.current = endPointerLook;

      return {
        beginPointerLook,
        updatePointerLook,
        endPointerLook,
      };
    },
    [],
  );

  const initializeRenderContext = useCallback((container: HTMLElement) => {
    const renderContext = createVolumeRenderContext(container, currentProjectionModeRef.current);
    rendererRef.current = renderContext.renderer;
    sceneRef.current = renderContext.scene;
    cameraRef.current = renderContext.camera;
    controlsRef.current = renderContext.controls;
    return renderContext;
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!renderer || !scene || !camera || !controls) {
      currentProjectionModeRef.current = projectionMode;
      return;
    }
    if (renderer.xr?.isPresenting) {
      return;
    }
    const previousProjectionMode = currentProjectionModeRef.current;
    if (previousProjectionMode === projectionMode) {
      return;
    }

    const container = containerRef.current;
    const width = container?.clientWidth ?? renderer.domElement.clientWidth;
    const height = container?.clientHeight ?? renderer.domElement.clientHeight;

    projectionViewStateRef.current[previousProjectionMode] = captureDesktopViewState(
      camera,
      controls.target,
      previousProjectionMode,
    );

    let nextViewState = projectionViewStateRef.current[projectionMode];
    if (projectionMode === 'orthographic') {
      nextViewState = createWeaklyCanonicalOrthographicState(camera);
      projectionViewStateRef.current.orthographic = nextViewState;
    } else if (!nextViewState) {
      nextViewState =
        defaultViewStateRef.current.perspective ?? captureDesktopViewState(camera, controls.target, projectionMode);
      projectionViewStateRef.current.perspective = nextViewState;
    }

    const nextCamera = createDesktopCamera(
      projectionMode,
      width,
      height,
      camera.near,
      camera.far,
    );
    const nextControls = createDesktopControls(nextCamera, renderer.domElement);
    nextControls.enableRotate = controls.enableRotate;

    scene.remove(camera);
    scene.add(nextCamera);
    controls.dispose();

    cameraRef.current = nextCamera;
    controlsRef.current = nextControls;
    currentProjectionModeRef.current = projectionMode;
    applyDesktopViewState(nextCamera, nextControls, nextViewState, width, height);
    rotationTargetRef.current.copy(nextControls.target);
  }, [createWeaklyCanonicalOrthographicState, projectionMode]);

  useEffect(() => {
    if (!rotationLocked) {
      return;
    }

    const movementState = movementStateRef.current;
    if (movementState) {
      movementState.rollLeft = false;
      movementState.rollRight = false;
    }
    const lookState = keyboardLookStateRef.current;
    lookState.rotateLeft = false;
    lookState.rotateRight = false;
    lookState.rotateUp = false;
    lookState.rotateDown = false;
    endPointerLookRef.current?.();
  }, [rotationLocked]);

  useEffect(() => {
    if (!enableKeyboardNavigation) {
      const movementState = movementStateRef.current;
      if (movementState) {
        movementState.moveForward = false;
        movementState.moveBackward = false;
        movementState.moveLeft = false;
        movementState.moveRight = false;
        movementState.moveUp = false;
        movementState.moveDown = false;
        movementState.rollLeft = false;
        movementState.rollRight = false;
      }
      const lookState = keyboardLookStateRef.current;
      lookState.rotateLeft = false;
      lookState.rotateRight = false;
      lookState.rotateUp = false;
      lookState.rotateDown = false;
      return;
    }

    const handleKeyChange = (event: KeyboardEvent, isPressed: boolean) => {
      const movementKey = MOVEMENT_KEY_MAP[event.code];
      const rollKey = ROLL_KEY_MAP[event.code];
      const lookKey = LOOK_KEY_CODES.has(event.code);
      if (!movementKey && !rollKey && !lookKey) {
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

      if (lookKey) {
        if (event.code === 'ArrowLeft') {
          keyboardLookStateRef.current.rotateLeft = isPressed;
        } else if (event.code === 'ArrowRight') {
          keyboardLookStateRef.current.rotateRight = isPressed;
        } else if (event.code === 'ArrowUp') {
          keyboardLookStateRef.current.rotateUp = isPressed;
        } else if (event.code === 'ArrowDown') {
          keyboardLookStateRef.current.rotateDown = isPressed;
        }
      }

      if (followTargetActiveRef.current && movementKey) {
        return;
      }

      if (movementKey) {
        movementState[movementKey] = isPressed;
      }
      if (rollKey) {
        movementState[rollKey] = isPressed;
      }
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
        movementState.rollLeft = false;
        movementState.rollRight = false;
      }
      const lookState = keyboardLookStateRef.current;
      lookState.rotateLeft = false;
      lookState.rotateRight = false;
      lookState.rotateUp = false;
      lookState.rotateDown = false;
    };
  }, [enableKeyboardNavigation, followTargetActiveRef]);

  return {
    containerRef,
    rendererRef,
    sceneRef,
    cameraRef,
    controlsRef,
    rotationTargetRef,
    defaultViewStateRef,
    projectionViewStateRef,
    currentProjectionModeRef,
    movementStateRef,
    endPointerLookRef,
    handleResize,
    applyKeyboardRotation,
    applyKeyboardMovement,
    applyCameraPose,
    captureCameraWindowState,
    createPointerLookHandlers,
    initializeRenderContext,
  };
}
