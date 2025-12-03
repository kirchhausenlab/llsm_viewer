import { type MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { createVolumeRenderContext, type VolumeRenderContext } from '../../hooks/useVolumeRenderSetup';
import type { MovementState, TrackLineResource } from '../VolumeViewer.types';

const MOVEMENT_KEY_MAP: Record<string, keyof MovementState> = {
  KeyW: 'moveForward',
  KeyS: 'moveBackward',
  KeyA: 'moveLeft',
  KeyD: 'moveRight',
  KeyE: 'moveUp',
  KeyQ: 'moveDown'
};

type PointerLookHandlers = {
  beginPointerLook: (event: PointerEvent) => void;
  updatePointerLook: (event: PointerEvent) => void;
  endPointerLook: (event?: PointerEvent) => void;
};

type UseCameraControlsParams = {
  trackLinesRef: MutableRefObject<Map<string, TrackLineResource>>;
  followedTrackIdRef: MutableRefObject<string | null>;
  setHasMeasured: (hasMeasured: boolean) => void;
};

export function useCameraControls({
  trackLinesRef,
  followedTrackIdRef,
  setHasMeasured,
}: UseCameraControlsParams) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rotationTargetRef = useRef(new THREE.Vector3());
  const defaultViewStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const movementStateRef = useRef<MovementState>({
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false,
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
        resource.outlineMaterial.resolution.set(width, height);
        resource.outlineMaterial.needsUpdate = true;
      }
    }
    cameraInstance.aspect = width / height;
    cameraInstance.updateProjectionMatrix();
  }, [setHasMeasured, trackLinesRef]);

  const worldUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const forwardVectorRef = useRef(new THREE.Vector3());
  const horizontalForwardRef = useRef(new THREE.Vector3());
  const rightVectorRef = useRef(new THREE.Vector3());
  const movementVectorRef = useRef(new THREE.Vector3());

  const applyKeyboardMovement = useCallback(
    (renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, controls: OrbitControls) => {
      if (renderer.xr.isPresenting) {
        return;
      }
      if (followedTrackIdRef.current !== null) {
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
          !movementState.moveDown)
      ) {
        return;
      }

      const rotationTarget = rotationTargetRef.current;
      const distance = rotationTarget.distanceTo(camera.position);
      const movementScale = Math.max(distance * 0.0025, 0.0006);

      const forwardVector = forwardVectorRef.current;
      camera.getWorldDirection(forwardVector).normalize();

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
    [followedTrackIdRef, worldUp],
  );

  const createPointerLookHandlers = useCallback(
    ({ renderer, camera, controls }: VolumeRenderContext): PointerLookHandlers => {
      const domElement = renderer.domElement;
      const pointerLookState = {
        activePointerId: null as number | null,
        yaw: 0,
        pitch: 0,
        lastClientX: 0,
        lastClientY: 0,
      };
      const cameraEuler = new THREE.Euler(0, 0, 0, 'YXZ');
      const lookDirection = new THREE.Vector3();

      const LOOK_SENSITIVITY = 0.0025;
      const MAX_LOOK_PITCH = Math.PI / 2 - 0.001;

      const beginPointerLook = (event: PointerEvent) => {
        if (renderer.xr.isPresenting) {
          return;
        }

        pointerLookState.activePointerId = event.pointerId;
        pointerLookState.lastClientX = event.clientX;
        pointerLookState.lastClientY = event.clientY;

        cameraEuler.setFromQuaternion(camera.quaternion, 'YXZ');
        pointerLookState.yaw = cameraEuler.y;
        pointerLookState.pitch = cameraEuler.x;

        domElement.setPointerCapture(event.pointerId);
      };

      const updatePointerLook = (event: PointerEvent) => {
        if (pointerLookState.activePointerId !== event.pointerId) {
          return;
        }

        const deltaX = event.clientX - pointerLookState.lastClientX;
        const deltaY = event.clientY - pointerLookState.lastClientY;
        pointerLookState.lastClientX = event.clientX;
        pointerLookState.lastClientY = event.clientY;

        pointerLookState.yaw -= deltaX * LOOK_SENSITIVITY;
        pointerLookState.pitch -= deltaY * LOOK_SENSITIVITY;
        pointerLookState.pitch = THREE.MathUtils.clamp(pointerLookState.pitch, -MAX_LOOK_PITCH, MAX_LOOK_PITCH);

        cameraEuler.set(pointerLookState.pitch, pointerLookState.yaw, 0, 'YXZ');
        camera.quaternion.setFromEuler(cameraEuler);

        const targetDistance = Math.max(camera.position.distanceTo(rotationTargetRef.current), 0.0001);
        lookDirection.set(0, 0, -1).applyQuaternion(camera.quaternion);
        rotationTargetRef.current.copy(camera.position).addScaledVector(lookDirection, targetDistance);
        controls.target.copy(rotationTargetRef.current);
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
    const renderContext = createVolumeRenderContext(container);
    rendererRef.current = renderContext.renderer;
    sceneRef.current = renderContext.scene;
    cameraRef.current = renderContext.camera;
    controlsRef.current = renderContext.controls;
    return renderContext;
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

      if (followedTrackIdRef.current !== null) {
        return;
      }

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
  }, [followedTrackIdRef]);

  return {
    containerRef,
    rendererRef,
    sceneRef,
    cameraRef,
    controlsRef,
    rotationTargetRef,
    defaultViewStateRef,
    movementStateRef,
    endPointerLookRef,
    handleResize,
    applyKeyboardMovement,
    createPointerLookHandlers,
    initializeRenderContext,
  };
}
