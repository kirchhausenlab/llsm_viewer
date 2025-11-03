import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import type {
  ControllerEntry,
  PlaybackState,
  WebXRFoveationManager,
} from './types';
import { VR_CONTROLLER_TOUCH_RADIUS } from './constants';

export type VrSessionManagerOptions = {
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  controllersRef: MutableRefObject<ControllerEntry[]>;
  playbackStateRef: MutableRefObject<PlaybackState>;
  xrSessionRef: MutableRefObject<XRSession | null>;
  sessionCleanupRef: MutableRefObject<(() => void) | null>;
  preVrCameraStateRef: MutableRefObject<
    | {
        position: THREE.Vector3;
        quaternion: THREE.Quaternion;
        target: THREE.Vector3;
      }
    | null
  >;
  xrPreferredSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar'>;
  xrCurrentSessionModeRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
  xrPendingModeSwitchRef: MutableRefObject<'immersive-vr' | 'immersive-ar' | null>;
  xrPassthroughSupportedRef: MutableRefObject<boolean>;
  xrFoveationAppliedRef: MutableRefObject<boolean>;
  xrPreviousFoveationRef: MutableRefObject<number | undefined>;
  setControllerVisibility: (shouldShow: boolean) => void;
  applyVrPlaybackHoverState: (
    playHovered: boolean,
    playbackSliderHovered: boolean,
    playbackSliderActive: boolean,
    fpsSliderHovered: boolean,
    fpsSliderActive: boolean,
    resetVolumeHovered: boolean,
    resetHudHovered: boolean,
    exitHovered: boolean,
    modeHovered: boolean,
  ) => void;
  updateVrPlaybackHud: () => void;
  onSessionStarted: () => void;
  onSessionEnded: () => void;
  onAfterSessionEnd?: () => void;
  vrLogRef: MutableRefObject<
    ((...args: Parameters<typeof console.debug>) => void) | null | undefined
  >;
  disposedRef: MutableRefObject<boolean>;
};

export type SetupSessionEventHandlers = {
  onSessionStart: () => void;
  onSessionEnd: () => void;
};

export type ConfigureControllerEntry = (entry: ControllerEntry, index: number) => void;

export class VrSessionManager {
  private readonly rendererRef: VrSessionManagerOptions['rendererRef'];
  private readonly cameraRef: VrSessionManagerOptions['cameraRef'];
  private readonly controlsRef: VrSessionManagerOptions['controlsRef'];
  private readonly sceneRef: VrSessionManagerOptions['sceneRef'];
  private readonly controllersRef: VrSessionManagerOptions['controllersRef'];
  private readonly playbackStateRef: VrSessionManagerOptions['playbackStateRef'];
  private readonly xrSessionRef: VrSessionManagerOptions['xrSessionRef'];
  private readonly sessionCleanupRef: VrSessionManagerOptions['sessionCleanupRef'];
  private readonly preVrCameraStateRef: VrSessionManagerOptions['preVrCameraStateRef'];
  private readonly xrPreferredSessionModeRef: VrSessionManagerOptions['xrPreferredSessionModeRef'];
  private readonly xrCurrentSessionModeRef: VrSessionManagerOptions['xrCurrentSessionModeRef'];
  private readonly xrPendingModeSwitchRef: VrSessionManagerOptions['xrPendingModeSwitchRef'];
  private readonly xrPassthroughSupportedRef: VrSessionManagerOptions['xrPassthroughSupportedRef'];
  private readonly xrFoveationAppliedRef: VrSessionManagerOptions['xrFoveationAppliedRef'];
  private readonly xrPreviousFoveationRef: VrSessionManagerOptions['xrPreviousFoveationRef'];
  private readonly setControllerVisibility: VrSessionManagerOptions['setControllerVisibility'];
  private readonly applyVrPlaybackHoverState: VrSessionManagerOptions['applyVrPlaybackHoverState'];
  private readonly updateVrPlaybackHud: VrSessionManagerOptions['updateVrPlaybackHud'];
  private readonly onSessionStarted: VrSessionManagerOptions['onSessionStarted'];
  private readonly onSessionEnded: VrSessionManagerOptions['onSessionEnded'];
  private readonly onAfterSessionEnd?: VrSessionManagerOptions['onAfterSessionEnd'];
  private readonly vrLogRef: VrSessionManagerOptions['vrLogRef'];
  private readonly disposedRef: VrSessionManagerOptions['disposedRef'];

  constructor(options: VrSessionManagerOptions) {
    this.rendererRef = options.rendererRef;
    this.cameraRef = options.cameraRef;
    this.controlsRef = options.controlsRef;
    this.sceneRef = options.sceneRef;
    this.controllersRef = options.controllersRef;
    this.playbackStateRef = options.playbackStateRef;
    this.xrSessionRef = options.xrSessionRef;
    this.sessionCleanupRef = options.sessionCleanupRef;
    this.preVrCameraStateRef = options.preVrCameraStateRef;
    this.xrPreferredSessionModeRef = options.xrPreferredSessionModeRef;
    this.xrCurrentSessionModeRef = options.xrCurrentSessionModeRef;
    this.xrPendingModeSwitchRef = options.xrPendingModeSwitchRef;
    this.xrPassthroughSupportedRef = options.xrPassthroughSupportedRef;
    this.xrFoveationAppliedRef = options.xrFoveationAppliedRef;
    this.xrPreviousFoveationRef = options.xrPreviousFoveationRef;
    this.setControllerVisibility = options.setControllerVisibility;
    this.applyVrPlaybackHoverState = options.applyVrPlaybackHoverState;
    this.updateVrPlaybackHud = options.updateVrPlaybackHud;
    this.onSessionStarted = options.onSessionStarted;
    this.onSessionEnded = options.onSessionEnded;
    this.onAfterSessionEnd = options.onAfterSessionEnd;
    this.vrLogRef = options.vrLogRef;
    this.disposedRef = options.disposedRef;
  }

  private log(...args: Parameters<typeof console.debug>) {
    this.vrLogRef.current?.(...args);
  }

  applyFoveation(target: number) {
    const renderer = this.rendererRef.current;
    if (!renderer) {
      return;
    }
    const xrManager = renderer.xr as WebXRFoveationManager;
    const setFoveation = xrManager?.setFoveation;
    if (typeof setFoveation !== 'function') {
      this.xrFoveationAppliedRef.current = false;
      this.xrPreviousFoveationRef.current = undefined;
      return;
    }
    if (!this.xrFoveationAppliedRef.current) {
      const getFoveation = xrManager?.getFoveation;
      this.xrPreviousFoveationRef.current =
        typeof getFoveation === 'function' ? getFoveation() : undefined;
    }
    setFoveation(target);
    this.xrFoveationAppliedRef.current = true;
  }

  restoreFoveation(defaultValue = 0) {
    if (!this.xrFoveationAppliedRef.current) {
      this.xrPreviousFoveationRef.current = undefined;
      return;
    }
    const renderer = this.rendererRef.current;
    if (!renderer) {
      this.xrFoveationAppliedRef.current = false;
      this.xrPreviousFoveationRef.current = undefined;
      return;
    }
    const xrManager = renderer.xr as WebXRFoveationManager;
    const setFoveation = xrManager?.setFoveation;
    if (typeof setFoveation !== 'function') {
      this.xrFoveationAppliedRef.current = false;
      this.xrPreviousFoveationRef.current = undefined;
      return;
    }
    const previous = this.xrPreviousFoveationRef.current;
    this.xrFoveationAppliedRef.current = false;
    this.xrPreviousFoveationRef.current = undefined;
    if (typeof previous === 'number') {
      setFoveation(previous);
    } else {
      setFoveation(defaultValue);
    }
  }

  async requestSession(): Promise<XRSession> {
    if (this.xrSessionRef.current) {
      return this.xrSessionRef.current;
    }
    if (typeof navigator === 'undefined' || !navigator.xr) {
      throw new Error('WebXR not available');
    }
    const renderer = this.rendererRef.current;
    if (!renderer) {
      throw new Error('Renderer not initialized');
    }

    const preferredMode = this.xrPreferredSessionModeRef.current;
    const attemptedModes: Array<'immersive-vr' | 'immersive-ar'> = [];
    if (preferredMode === 'immersive-ar' && this.xrPassthroughSupportedRef.current) {
      attemptedModes.push('immersive-ar');
    }
    attemptedModes.push('immersive-vr');
    if (!attemptedModes.includes('immersive-ar') && this.xrPassthroughSupportedRef.current) {
      attemptedModes.push('immersive-ar');
    }

    let session: XRSession | null = null;
    let resolvedMode: 'immersive-vr' | 'immersive-ar' | null = null;
    let lastError: unknown = null;
    for (const mode of attemptedModes) {
      try {
        this.log('[VR] requestSession → navigator.xr.requestSession', { mode });
        const requestedSession = await navigator.xr.requestSession(mode, {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
        });
        session = requestedSession;
        resolvedMode = mode;
        break;
      } catch (error) {
        lastError = error;
        if (mode === 'immersive-ar') {
          console.warn('Failed to start immersive-ar session; falling back to immersive-vr.', error);
          this.setPreferredSessionMode('immersive-vr');
        } else {
          console.warn('Failed to start immersive-vr session', error);
        }
      }
    }

    if (!session || !resolvedMode) {
      throw lastError ?? new Error('Failed to start XR session');
    }

    this.log('[VR] requestSession resolved', {
      presenting: renderer.xr.isPresenting,
      visibilityState: session.visibilityState,
      mode: resolvedMode,
    });

    this.xrSessionRef.current = session;
    this.xrCurrentSessionModeRef.current = resolvedMode;
    const playbackState = this.playbackStateRef.current;
    playbackState.currentSessionMode = resolvedMode;
    if (resolvedMode !== this.xrPreferredSessionModeRef.current) {
      this.setPreferredSessionMode(resolvedMode);
    } else {
      this.updateVrPlaybackHud();
    }
    this.xrPendingModeSwitchRef.current = null;

    const controls = this.controlsRef.current;
    if (controls) {
      controls.enabled = false;
    }
    const camera = this.cameraRef.current;
    if (camera && controls) {
      this.preVrCameraStateRef.current = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        target: controls.target.clone(),
      };
    } else {
      this.preVrCameraStateRef.current = null;
    }

    const onSessionEnd = () => {
      session.removeEventListener('end', onSessionEnd);
      this.handleSessionEnd();
    };
    session.addEventListener('end', onSessionEnd);
    this.sessionCleanupRef.current = () => {
      session.removeEventListener('end', onSessionEnd);
    };

    renderer.xr.setSession(session);
    this.log('[VR] setSession', {
      presenting: renderer.xr.isPresenting,
      visibilityState: session.visibilityState,
    });

    this.onSessionStarted();

    return session;
  }

  async endSession(): Promise<void> {
    const session = this.xrSessionRef.current;
    if (!session) {
      return;
    }
    await session.end();
  }

  setPreferredSessionMode(mode: 'immersive-vr' | 'immersive-ar') {
    this.xrPreferredSessionModeRef.current = mode;
    const playbackState = this.playbackStateRef.current;
    playbackState.preferredSessionMode = mode;
    this.updateVrPlaybackHud();
  }

  togglePreferredSessionMode() {
    if (!this.xrPassthroughSupportedRef.current) {
      return;
    }
    const nextMode =
      this.xrPreferredSessionModeRef.current === 'immersive-ar' ? 'immersive-vr' : 'immersive-ar';
    this.setPreferredSessionMode(nextMode);
    const session = this.xrSessionRef.current;
    if (session) {
      if (this.xrCurrentSessionModeRef.current === nextMode) {
        return;
      }
      this.xrPendingModeSwitchRef.current = nextMode;
      session.end().catch((error) => {
        console.warn('Failed to switch XR session mode', error);
        this.xrPendingModeSwitchRef.current = null;
      });
    }
  }

  installSessionEventListeners({ onSessionStart, onSessionEnd }: SetupSessionEventHandlers) {
    const renderer = this.rendererRef.current;
    if (!renderer) {
      return () => {};
    }
    const xrManager = renderer.xr as
      | (THREE.WebXRManager & {
          addEventListener?: (event: string, handler: () => void) => void;
          removeEventListener?: (event: string, handler: () => void) => void;
        })
      | undefined;
    const addEventListener = xrManager?.addEventListener?.bind(xrManager);
    const removeEventListener = xrManager?.removeEventListener?.bind(xrManager);
    if (!addEventListener || !removeEventListener) {
      return () => {};
    }

    const handleSessionStart = () => {
      this.log('[VR] sessionstart event', {
        presenting: renderer.xr.isPresenting,
        visibilityState: this.xrSessionRef.current?.visibilityState ?? null,
      });
      onSessionStart();
    };

    const handleSessionEnd = () => {
      this.log('[VR] sessionend event', {
        presenting: renderer.xr.isPresenting,
        visibilityState: this.xrSessionRef.current?.visibilityState ?? null,
      });
      onSessionEnd();
    };

    addEventListener('sessionstart', handleSessionStart);
    addEventListener('sessionend', handleSessionEnd);

    return () => {
      removeEventListener('sessionstart', handleSessionStart);
      removeEventListener('sessionend', handleSessionEnd);
    };
  }

  setupControllers(configureEntry: ConfigureControllerEntry) {
    const renderer = this.rendererRef.current;
    const scene = this.sceneRef.current;
    if (!renderer || !scene) {
      return () => {};
    }

    const controllers = this.controllersRef.current;
    const controllerModelFactory = new XRControllerModelFactory();
    const createdEntries: Array<{
      entry: ControllerEntry;
      onConnected: (event: any) => void;
      onDisconnected: (event: XRInputSourceEvent) => void;
      onSelectStart: (event: XRInputSourceEvent) => void;
      onSelectEnd: (event: XRInputSourceEvent) => void;
    }> = [];

    controllers.splice(0, controllers.length);

    for (let index = 0; index < 2; index++) {
      const controller = renderer.xr.getController(index);
      controller.visible = false;

      const grip = renderer.xr.getControllerGrip(index);
      grip.visible = false;

      const rayGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -1),
      ]);
      const rayMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
      const ray = new THREE.Line(rayGeometry, rayMaterial);
      ray.visible = false;
      controller.add(ray);

      const touchIndicatorMaterial = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
      });
      touchIndicatorMaterial.depthTest = false;
      const touchIndicator = new THREE.Mesh(
        new THREE.SphereGeometry(VR_CONTROLLER_TOUCH_RADIUS, 16, 16),
        touchIndicatorMaterial,
      );
      touchIndicator.visible = false;
      controller.add(touchIndicator);

      const model = controllerModelFactory.createControllerModel(grip);
      grip.add(model);

      const controllerRaycaster = new THREE.Raycaster();
      controllerRaycaster.params.Line = { threshold: 0.02 };
      (controllerRaycaster.params as unknown as { Line2?: { threshold: number } }).Line2 = {
        threshold: 0.02,
      };
      controllerRaycaster.far = 10;

      const entry: ControllerEntry = {
        controller,
        grip,
        ray,
        rayGeometry,
        rayMaterial,
        touchIndicator,
        raycaster: controllerRaycaster,
        onConnected: () => undefined,
        onDisconnected: () => undefined,
        onSelectStart: () => undefined,
        onSelectEnd: () => undefined,
        isConnected: false,
        targetRayMode: null,
        gamepad: null,
        hoverTrackId: null,
        hoverUiTarget: null,
        activeUiTarget: null,
        hoverUiPoint: new THREE.Vector3(),
        hasHoverUiPoint: false,
        hoverPoint: new THREE.Vector3(),
        rayOrigin: new THREE.Vector3(),
        rayDirection: new THREE.Vector3(0, 0, -1),
        rayLength: 3,
        isSelecting: false,
        hudGrabOffsets: { playback: null, channels: null, tracks: null },
        translateGrabOffset: null,
        scaleGrabOffset: null,
        volumeScaleState: null,
        volumeRotationState: null,
        hudRotationState: null,
      };

      configureEntry(entry, index);

      const handleConnected = (event: any) => entry.onConnected(event);
      const handleDisconnected = (event: XRInputSourceEvent) => entry.onDisconnected(event);
      const handleSelectStart = (event: XRInputSourceEvent) => entry.onSelectStart(event);
      const handleSelectEnd = (event: XRInputSourceEvent) => entry.onSelectEnd(event);

      (controller as unknown as {
        addEventListener: (type: string, handler: (event: any) => void) => void;
      }).addEventListener('connected', handleConnected);
      (controller as unknown as {
        addEventListener: (type: string, handler: (event: XRInputSourceEvent) => void) => void;
      }).addEventListener('disconnected', handleDisconnected);
      (controller as unknown as {
        addEventListener: (type: string, handler: (event: XRInputSourceEvent) => void) => void;
      }).addEventListener('selectstart', handleSelectStart);
      (controller as unknown as {
        addEventListener: (type: string, handler: (event: XRInputSourceEvent) => void) => void;
      }).addEventListener('selectend', handleSelectEnd);

      scene.add(controller);
      scene.add(grip);

      createdEntries.push({
        entry,
        onConnected: handleConnected,
        onDisconnected: handleDisconnected,
        onSelectStart: handleSelectStart,
        onSelectEnd: handleSelectEnd,
      });
    }

    controllers.push(...createdEntries.map((item) => item.entry));

    return () => {
      for (const created of createdEntries) {
        const { entry, onConnected, onDisconnected, onSelectStart, onSelectEnd } = created;
        (entry.controller as unknown as {
          removeEventListener: (type: string, handler: (event: any) => void) => void;
        }).removeEventListener('connected', onConnected);
        (entry.controller as unknown as {
          removeEventListener: (type: string, handler: (event: XRInputSourceEvent) => void) => void;
        }).removeEventListener('disconnected', onDisconnected);
        (entry.controller as unknown as {
          removeEventListener: (type: string, handler: (event: XRInputSourceEvent) => void) => void;
        }).removeEventListener('selectstart', onSelectStart);
        (entry.controller as unknown as {
          removeEventListener: (type: string, handler: (event: XRInputSourceEvent) => void) => void;
        }).removeEventListener('selectend', onSelectEnd);
        entry.controller.remove(entry.ray);
        entry.controller.remove(entry.touchIndicator);
        entry.touchIndicator.geometry?.dispose?.();
        (entry.touchIndicator.material as THREE.Material | undefined)?.dispose?.();
        scene.remove(entry.controller);
        scene.remove(entry.grip);
        entry.rayGeometry.dispose();
        entry.rayMaterial.dispose();
      }
      controllers.splice(0, controllers.length);
    };
  }

  refreshControllerVisibility() {
    const renderer = this.rendererRef.current;
    const shouldShow = Boolean(renderer?.xr?.isPresenting);
    this.setControllerVisibility(shouldShow);
  }

  dispose() {
    const cleanup = this.sessionCleanupRef.current;
    if (cleanup) {
      cleanup();
      this.sessionCleanupRef.current = null;
    }
  }

  private handleSessionEnd() {
    const renderer = this.rendererRef.current;
    this.log('[VR] handleSessionEnd', {
      presenting: renderer?.xr?.isPresenting ?? false,
      visibilityState: this.xrSessionRef.current?.visibilityState ?? null,
    });
    this.onSessionEnded();
    this.sessionCleanupRef.current = null;
    this.xrSessionRef.current = null;
    this.xrCurrentSessionModeRef.current = null;
    const playbackState = this.playbackStateRef.current;
    playbackState.currentSessionMode = null;
    this.updateVrPlaybackHud();
    this.setControllerVisibility(false);
    this.applyVrPlaybackHoverState(false, false, false, false, false, false, false, false, false);
    for (const entry of this.controllersRef.current) {
      entry.ray.scale.set(1, 1, 1);
      entry.hudGrabOffsets.playback = null;
      entry.hudGrabOffsets.channels = null;
      entry.hudGrabOffsets.tracks = null;
      entry.translateGrabOffset = null;
      entry.scaleGrabOffset = null;
      entry.volumeScaleState = null;
    }
    const controls = this.controlsRef.current;
    if (controls) {
      controls.enabled = true;
    }
    const stored = this.preVrCameraStateRef.current;
    const camera = this.cameraRef.current;
    if (stored && camera && controls) {
      camera.position.copy(stored.position);
      camera.quaternion.copy(stored.quaternion);
      camera.updateMatrixWorld(true);
      controls.target.copy(stored.target);
      controls.update();
    }
    this.preVrCameraStateRef.current = null;
    this.refreshControllerVisibility();
    this.onAfterSessionEnd?.();
    const pendingMode = this.xrPendingModeSwitchRef.current;
    this.xrPendingModeSwitchRef.current = null;
    if (!this.disposedRef.current) {
      if (pendingMode) {
        this.log('[VR] restarting session to honor pending mode switch', {
          mode: pendingMode,
        });
        void this.requestSession().catch((error) => {
          console.error('Failed to restart XR session after mode switch', error);
        });
      }
    }
  }
}
