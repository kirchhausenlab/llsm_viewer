import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const XR_TARGET_FOVEATION = 0.6;

// The WebXRManager type in three.js does not expose foveation helpers, so we extend it here.
type WebXRFoveationManager = THREE.WebXRManager & {
  getFoveation?: () => number | undefined;
  setFoveation?: (value: number) => void;
};

type ControllerEvent = THREE.Event & { data?: { targetRayMode?: string } };

type ControllerState = {
  index: number;
  controller: THREE.Object3D;
  grip: THREE.Object3D;
  isConnected: boolean;
  targetRayMode: string | null;
  onConnected: (event: ControllerEvent) => void;
  onDisconnected: (event: ControllerEvent) => void;
};

export type UseXRSessionParams = {
  renderer: THREE.WebGLRenderer | null;
  camera: THREE.PerspectiveCamera | null;
  controls: OrbitControls | null;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  onSessionStarted?: () => void;
  onSessionEnded?: () => void;
};

export type UseXRSessionResult = {
  requestSession: () => Promise<XRSession | null>;
  endSession: () => Promise<void>;
  isPresenting: boolean;
  session: XRSession | null;
};

export function useXRSession({
  renderer,
  camera,
  controls,
  rendererRef,
  cameraRef,
  controlsRef,
  onSessionStarted,
  onSessionEnded
}: UseXRSessionParams): UseXRSessionResult {
  const sessionRef = useRef<XRSession | null>(null);
  const sessionCleanupRef = useRef<(() => void) | null>(null);
  const preSessionCameraStateRef = useRef<{
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    target: THREE.Vector3;
  } | null>(null);
  const xrFoveationAppliedRef = useRef(false);
  const xrPreviousFoveationRef = useRef<number | undefined>(undefined);
  const controllerStatesRef = useRef<ControllerState[]>([]);
  const onSessionStartedRef = useRef<(() => void) | null>(onSessionStarted ?? null);
  const onSessionEndedRef = useRef<(() => void) | null>(onSessionEnded ?? null);

  const [isPresenting, setIsPresenting] = useState(false);
  const [sessionState, setSessionState] = useState<XRSession | null>(null);

  useEffect(() => {
    onSessionStartedRef.current = onSessionStarted ?? null;
  }, [onSessionStarted]);

  useEffect(() => {
    onSessionEndedRef.current = onSessionEnded ?? null;
  }, [onSessionEnded]);

  useEffect(() => {
    rendererRef.current = renderer;
  }, [renderer, rendererRef]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera, cameraRef]);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls, controlsRef]);

  const applyFoveation = useCallback(
    (target: number = XR_TARGET_FOVEATION) => {
      const rendererInstance = rendererRef.current;
      if (!rendererInstance) {
        return;
      }
      const xrManager = rendererInstance.xr as WebXRFoveationManager;
      const setFoveation = xrManager.setFoveation;
      if (typeof setFoveation !== 'function') {
        return;
      }
      if (!xrFoveationAppliedRef.current) {
        const getFoveation = xrManager.getFoveation;
        xrPreviousFoveationRef.current =
          typeof getFoveation === 'function' ? getFoveation() : undefined;
      }
      setFoveation(target);
      xrFoveationAppliedRef.current = true;
    },
    [rendererRef]
  );

  const restoreFoveation = useCallback(() => {
    if (!xrFoveationAppliedRef.current) {
      return;
    }
    const rendererInstance = rendererRef.current;
    if (!rendererInstance) {
      xrFoveationAppliedRef.current = false;
      xrPreviousFoveationRef.current = undefined;
      return;
    }
    const xrManager = rendererInstance.xr as WebXRFoveationManager;
    const setFoveation = xrManager.setFoveation;
    xrFoveationAppliedRef.current = false;
    const previous = xrPreviousFoveationRef.current;
    xrPreviousFoveationRef.current = undefined;
    if (typeof setFoveation !== 'function') {
      return;
    }
    if (typeof previous === 'number') {
      setFoveation(previous);
    } else {
      setFoveation(0);
    }
  }, [rendererRef]);

  const setControllerVisibility = useCallback(
    (shouldShow: boolean) => {
      for (const entry of controllerStatesRef.current) {
        const visible = shouldShow && entry.isConnected && entry.targetRayMode !== 'tracked-hand';
        entry.controller.visible = visible;
        entry.grip.visible = visible;
      }
    },
    []
  );

  const refreshControllerVisibility = useCallback(() => {
    const isPresentingNow = Boolean(rendererRef.current?.xr?.isPresenting);
    setControllerVisibility(isPresentingNow);
  }, [rendererRef, setControllerVisibility]);

  const handleSessionEnd = useCallback(() => {
    restoreFoveation();
    setControllerVisibility(false);
    const cleanup = sessionCleanupRef.current;
    if (cleanup) {
      cleanup();
      sessionCleanupRef.current = null;
    }
    const session = sessionRef.current;
    sessionRef.current = null;
    if (sessionState === session) {
      setSessionState(null);
    }
    const controlsInstance = controlsRef.current;
    if (controlsInstance) {
      controlsInstance.enabled = true;
    }
    const cameraInstance = cameraRef.current;
    const storedState = preSessionCameraStateRef.current;
    if (cameraInstance && controlsInstance && storedState) {
      cameraInstance.position.copy(storedState.position);
      cameraInstance.quaternion.copy(storedState.quaternion);
      cameraInstance.updateMatrixWorld(true);
      controlsInstance.target.copy(storedState.target);
      controlsInstance.update();
    }
    preSessionCameraStateRef.current = null;
    setIsPresenting(Boolean(rendererRef.current?.xr?.isPresenting));
    onSessionEndedRef.current?.();
  }, [cameraRef, controlsRef, onSessionEndedRef, rendererRef, restoreFoveation, sessionState, setControllerVisibility]);

  const requestSession = useCallback(async () => {
    if (sessionRef.current) {
      return sessionRef.current;
    }
    const rendererInstance = rendererRef.current;
    if (!rendererInstance) {
      throw new Error('Renderer is not ready to start an XR session.');
    }
    if (typeof navigator === 'undefined' || !navigator.xr) {
      throw new Error('WebXR not available');
    }

    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
    });

    sessionRef.current = session;
    setSessionState(session);

    const controlsInstance = controlsRef.current;
    if (controlsInstance) {
      controlsInstance.enabled = false;
    }
    const cameraInstance = cameraRef.current;
    if (cameraInstance && controlsInstance) {
      preSessionCameraStateRef.current = {
        position: cameraInstance.position.clone(),
        quaternion: cameraInstance.quaternion.clone(),
        target: controlsInstance.target.clone()
      };
    } else {
      preSessionCameraStateRef.current = null;
    }

    const onSessionEnd = () => {
      session.removeEventListener('end', onSessionEnd as EventListener);
      handleSessionEnd();
    };
    session.addEventListener('end', onSessionEnd as EventListener);
    sessionCleanupRef.current = () => {
      session.removeEventListener('end', onSessionEnd as EventListener);
    };

    rendererInstance.xr.setSession(session);

    applyFoveation();
    refreshControllerVisibility();
    setIsPresenting(true);
    onSessionStartedRef.current?.();

    return session;
  }, [applyFoveation, cameraRef, controlsRef, handleSessionEnd, refreshControllerVisibility, rendererRef]);

  const endSession = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) {
      return;
    }
    await session.end();
  }, []);

  useEffect(() => {
    if (!renderer) {
      controllerStatesRef.current = [];
      setControllerVisibility(false);
      setIsPresenting(false);
      return;
    }

    const handleSessionStart = () => {
      applyFoveation();
      refreshControllerVisibility();
      setIsPresenting(true);
    };

    const handleSessionEndEvent = () => {
      restoreFoveation();
      refreshControllerVisibility();
      setIsPresenting(false);
    };

    renderer.xr.addEventListener('sessionstart', handleSessionStart);
    renderer.xr.addEventListener('sessionend', handleSessionEndEvent);

    return () => {
      renderer.xr.removeEventListener('sessionstart', handleSessionStart);
      renderer.xr.removeEventListener('sessionend', handleSessionEndEvent);
    };
  }, [applyFoveation, refreshControllerVisibility, renderer, restoreFoveation, setControllerVisibility]);

  useEffect(() => {
    if (!renderer) {
      controllerStatesRef.current = [];
      setControllerVisibility(false);
      return;
    }

    const entries: ControllerState[] = [];

    for (let index = 0; index < 2; index++) {
      const controller = renderer.xr.getController(index);
      const grip = renderer.xr.getControllerGrip(index);
      const entry: ControllerState = {
        index,
        controller,
        grip,
        isConnected: false,
        targetRayMode: null,
        onConnected: () => undefined,
        onDisconnected: () => undefined
      };

      const handleConnected = (event: ControllerEvent) => {
        entry.isConnected = true;
        entry.targetRayMode = event?.data?.targetRayMode ?? null;
        refreshControllerVisibility();
      };

      const handleDisconnected = () => {
        entry.isConnected = false;
        entry.targetRayMode = null;
        refreshControllerVisibility();
      };

      entry.onConnected = handleConnected;
      entry.onDisconnected = handleDisconnected;

      controller.addEventListener('connected', handleConnected as EventListener);
      controller.addEventListener('disconnected', handleDisconnected as EventListener);

      controller.visible = false;
      grip.visible = false;

      entries.push(entry);
    }

    controllerStatesRef.current = entries;
    refreshControllerVisibility();

    return () => {
      for (const entry of entries) {
        entry.controller.removeEventListener('connected', entry.onConnected as EventListener);
        entry.controller.removeEventListener('disconnected', entry.onDisconnected as EventListener);
        entry.controller.visible = false;
        entry.grip.visible = false;
      }
      controllerStatesRef.current = [];
    };
  }, [refreshControllerVisibility, renderer, setControllerVisibility]);

  useEffect(() => {
    return () => {
      sessionCleanupRef.current?.();
      sessionCleanupRef.current = null;
      const activeSession = sessionRef.current;
      sessionRef.current = null;
      if (activeSession) {
        activeSession.end().catch(() => undefined);
      }
      restoreFoveation();
      setControllerVisibility(false);
      setSessionState(null);
      setIsPresenting(false);
    };
  }, [restoreFoveation, setControllerVisibility]);

  return {
    requestSession,
    endSession,
    isPresenting,
    session: sessionState
  };
}
