import { useCallback, useEffect, useMemo, useRef, useState, type RefCallback } from 'react';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  useRendererCanvas,
  type UseRendererCanvasResult,
  type TrackMaterialPair
} from './useRendererCanvas';
import type { VolumeViewerProps } from './types';
import { useVolumeTextures } from './useVolumeTextures';
import { useTransferFunctionCache } from './useTransferFunction';
import { useRayMarchMaterial } from './useRayMarchMaterial';
import { useRayMarchLoop, type MovementState } from './useRayMarchLoop';
import { useXRSession } from './useXRSession';
import { useTrackOverlay, type TrackLineResource } from './useTrackOverlay';
import { createTrackColor } from '../trackColors';
import '../components/VolumeViewer.css';

type TooltipPosition = { x: number; y: number } | null;

const MAX_RENDERER_PIXEL_RATIO = 2;
const DEFAULT_TRACK_OPACITY = 0.9;
const DEFAULT_TRACK_LINE_WIDTH = 1;
const HOVERED_TRACK_LINE_WIDTH_MULTIPLIER = 1.2;
const FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER = 1.35;
const SELECTED_TRACK_LINE_WIDTH_MULTIPLIER = 1.5;
const SELECTED_TRACK_BLINK_PERIOD_MS = 1600;
const SELECTED_TRACK_BLINK_BASE = 0.85;
const SELECTED_TRACK_BLINK_RANGE = 0.15;
const VR_PLAYBACK_MIN_FPS = 1;
const VR_PLAYBACK_MAX_FPS = 60;
const DEFAULT_STEP_SCALE = 1;

type VolumeSceneContainer = {
  containerRef: RefCallback<HTMLDivElement>;
  hasMeasured: boolean;
};

type VolumeSceneLoadingOverlay = {
  showLoadingOverlay: boolean;
};

type VolumeSceneTooltip = {
  hoveredTrackLabel: string | null;
  tooltipPosition: TooltipPosition;
};

export function useVolumeSceneContainer(
  _props: VolumeViewerProps,
  rendererCanvas: UseRendererCanvasResult,
  containerRef: RefCallback<HTMLDivElement>
): VolumeSceneContainer {
  return { containerRef, hasMeasured: rendererCanvas.hasMeasured };
}

export function useVolumeSceneLoadingOverlay(
  props: VolumeViewerProps,
  _rendererCanvas: UseRendererCanvasResult
): VolumeSceneLoadingOverlay {
  const safeProgress = Math.min(1, Math.max(0, props.loadingProgress));
  const clampedLoadedVolumes = Math.max(0, props.loadedVolumes);
  const clampedExpectedVolumes = Math.max(0, props.expectedVolumes);
  const normalizedProgress =
    clampedExpectedVolumes > 0
      ? Math.min(1, clampedLoadedVolumes / Math.max(clampedExpectedVolumes, 1))
      : safeProgress;
  const hasStartedLoading =
    normalizedProgress > 0 || clampedLoadedVolumes > 0 || safeProgress > 0;
  const hasFinishedLoading =
    clampedExpectedVolumes > 0
      ? clampedLoadedVolumes >= clampedExpectedVolumes
      : safeProgress >= 1;
  return {
    showLoadingOverlay: props.isLoading || (hasStartedLoading && !hasFinishedLoading)
  };
}

export function useVolumeSceneTooltip(
  _props: VolumeViewerProps,
  _rendererCanvas: UseRendererCanvasResult,
  hoveredTrackLabel: string | null,
  tooltipPosition: TooltipPosition
): VolumeSceneTooltip {
  return { hoveredTrackLabel, tooltipPosition };
}

function hashTracks(tracks: VolumeViewerProps['tracks']) {
  let hash = tracks.length;
  for (const track of tracks) {
    hash = (hash * 31 + track.id.length + track.points.length) | 0;
  }
  return hash;
}

export function VolumeScene(props: VolumeViewerProps) {
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);
  const [rendererSize, setRendererSize] = useState<{ width: number; height: number } | null>(null);

  const rotationTargetRef = useRef(new THREE.Vector3());
  const datasetCenterRef = useRef(new THREE.Vector3());
  const datasetRadiusRef = useRef(1);
  const resetCameraOffsetRef = useRef(new THREE.Vector3());
  const movementStateRef = useRef<MovementState>({
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    moveUp: false,
    moveDown: false
  });
  const followedTrackIdRef = useRef<string | null>(props.followedTrackId);
  const trackFollowOffsetRef = useRef<THREE.Vector3 | null>(null);
  const trackLinesRef = useRef<Map<string, TrackLineResource>>(new Map());
  const playbackLoopRef = useRef<{ lastTimestamp: number | null; accumulator: number }>(
    {
      lastTimestamp: null,
      accumulator: 0
    }
  );
  const playbackStateRef = useRef({
    isPlaying: props.isPlaying,
    playbackDisabled: props.playbackDisabled,
    playbackLabel: props.playbackLabel,
    fps: props.fps,
    timeIndex: props.timeIndex,
    totalTimepoints: props.totalTimepoints,
    onTimeIndexChange: props.onTimeIndexChange
  });
  const vrHoverStateRef = useRef<{ playbackSliderActive: boolean } & Record<string, unknown>>({
    playbackSliderActive: false
  });
  const controllersRef = useRef<Array<{ hoverTrackId: string | null } & Record<string, unknown>>>([]);
  const timeIndexRef = useRef(props.timeIndex);

  const hoveredTrackIdRef = useRef<string | null>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition>(null);

  const clearMovementState = useCallback(() => {
    const movementState = movementStateRef.current;
    movementState.moveForward = false;
    movementState.moveBackward = false;
    movementState.moveLeft = false;
    movementState.moveRight = false;
    movementState.moveUp = false;
    movementState.moveDown = false;
  }, []);

  const transferFunctionCache = useTransferFunctionCache();
  const rayMarchMaterial = useRayMarchMaterial(transferFunctionCache);

  const getTrackMaterials = useCallback<() => Iterable<TrackMaterialPair> | null>(() => {
    if (trackLinesRef.current.size === 0) {
      return null;
    }
    return Array.from(trackLinesRef.current.values(), (resource) => ({
      material: resource.material,
      outlineMaterial: resource.outlineMaterial
    }));
  }, []);

  const handleResize = useCallback((size: { width: number; height: number }) => {
    setRendererSize(size);
  }, []);

  const rendererCanvas = useRendererCanvas({
    container: containerNode,
    maxPixelRatio: MAX_RENDERER_PIXEL_RATIO,
    enableXR: true,
    onResize: handleResize,
    getTrackMaterials
  });

  const containerRef = useCallback<RefCallback<HTMLDivElement>>((node) => {
    setContainerNode(node);
  }, []);

  const { containerRef: forwardedContainerRef, hasMeasured } = useVolumeSceneContainer(
    props,
    rendererCanvas,
    containerRef
  );
  const { showLoadingOverlay } = useVolumeSceneLoadingOverlay(props, rendererCanvas);

  const volumeRootGroupRef = useRef<THREE.Group | null>(null);
  const trackGroupRef = useRef<THREE.Group | null>(null);
  const volumeStepScaleRef = useRef(DEFAULT_STEP_SCALE);

  useEffect(() => {
    const scene = rendererCanvas.scene;
    if (!scene) {
      volumeRootGroupRef.current = null;
      trackGroupRef.current = null;
      return;
    }

    const volumeRoot = new THREE.Group();
    volumeRoot.name = 'VolumeRoot';
    const trackGroup = new THREE.Group();
    trackGroup.name = 'TrackOverlay';
    volumeRoot.add(trackGroup);
    scene.add(volumeRoot);

    volumeRootGroupRef.current = volumeRoot;
    trackGroupRef.current = trackGroup;

    return () => {
      volumeRoot.remove(trackGroup);
      scene.remove(volumeRoot);
      trackGroup.clear();
      trackGroupRef.current = null;
      volumeRootGroupRef.current = null;
    };
  }, [rendererCanvas.scene]);

  const {
    resourcesRef,
    upsertLayer,
    removeLayer,
    removeAllLayers,
    addInvalidationListener,
    clearColormap
  } = useVolumeTextures({
    scene: rendererCanvas.scene,
    volumeRoot: volumeRootGroupRef.current,
    volumeStepScaleRef,
    rayMarchMaterial
  });

  useEffect(() => {
    return addInvalidationListener(() => {
      trackLinesRef.current.forEach((resource) => {
        resource.needsAppearanceUpdate = true;
      });
    });
  }, [addInvalidationListener]);

  useEffect(() => {
    const scene = rendererCanvas.scene;
    if (!scene) {
      removeAllLayers();
      return;
    }

    const seenKeys = new Set<string>();
    props.layers.forEach((layer, index) => {
      const resource = upsertLayer({ layer, index });
      if (resource) {
        seenKeys.add(layer.key);
      }
    });

    for (const key of Array.from(resourcesRef.current.keys())) {
      if (!seenKeys.has(key)) {
        removeLayer(key);
      }
    }
  }, [props.layers, removeAllLayers, removeLayer, rendererCanvas.scene, resourcesRef, upsertLayer]);

  useEffect(() => {
    return () => {
      clearColormap();
    };
  }, [clearColormap]);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    rendererRef.current = rendererCanvas.renderer;
  }, [rendererCanvas.renderer]);
  useEffect(() => {
    cameraRef.current = rendererCanvas.camera;
  }, [rendererCanvas.camera]);
  useEffect(() => {
    controlsRef.current = rendererCanvas.controls;
    if (rendererCanvas.controls) {
      rendererCanvas.controls.target.copy(rotationTargetRef.current);
      rendererCanvas.controls.update();
    }
  }, [rendererCanvas.controls]);

  const xrSession = useXRSession({
    renderer: rendererCanvas.renderer,
    camera: rendererCanvas.camera,
    controls: rendererCanvas.controls,
    rendererRef,
    cameraRef,
    controlsRef,
    onSessionStarted: props.onVrSessionStarted,
    onSessionEnded: props.onVrSessionEnded
  });

  useEffect(() => {
    volumeStepScaleRef.current = xrSession.isPresenting ? 1.4 : DEFAULT_STEP_SCALE;
  }, [xrSession.isPresenting]);

  useEffect(() => {
    if (!props.onRegisterVrSession) {
      return;
    }
    props.onRegisterVrSession({
      requestSession: xrSession.requestSession,
      endSession: xrSession.endSession
    });
    return () => {
      props.onRegisterVrSession?.(null);
    };
  }, [props.onRegisterVrSession, xrSession.endSession, xrSession.requestSession]);

  const primaryLayer = useMemo(() => {
    for (const layer of props.layers) {
      if (layer.volume) {
        return layer;
      }
    }
    return null;
  }, [props.layers]);

  const primaryVolume = primaryLayer?.volume ?? null;

  useEffect(() => {
    const volumeRoot = volumeRootGroupRef.current;
    if (!volumeRoot) {
      return;
    }

    if (!primaryVolume) {
      volumeRoot.position.set(0, 0, 0);
      volumeRoot.scale.set(1, 1, 1);
      volumeRoot.rotation.set(0, 0, 0);
      volumeRoot.updateMatrixWorld(true);
      datasetCenterRef.current.set(0, 0, 0);
      datasetRadiusRef.current = 1;
      if (!props.followedTrackId && rendererCanvas.controls) {
        rotationTargetRef.current.set(0, 0, 0);
        rendererCanvas.controls.target.set(0, 0, 0);
        rendererCanvas.controls.update();
      }
      const camera = rendererCanvas.camera;
      if (camera) {
        camera.near = 0.1;
        camera.far = 1000;
        camera.updateProjectionMatrix();
      }
      return;
    }

    const { width, height, depth } = primaryVolume;
    const maxDimension = Math.max(width, height, depth);
    const scale = maxDimension > 0 ? 1 / maxDimension : 1;
    volumeRoot.scale.setScalar(scale);
    volumeRoot.position.set(0, 0, 0);
    volumeRoot.rotation.set(0, 0, 0);
    volumeRoot.updateMatrixWorld(true);

    const offsetX = primaryLayer?.offsetX ?? 0;
    const offsetY = primaryLayer?.offsetY ?? 0;
    const centerX = (width > 0 ? width / 2 - 0.5 : 0) + offsetX;
    const centerY = (height > 0 ? height / 2 - 0.5 : 0) + offsetY;
    const centerZ = depth > 0 ? depth / 2 - 0.5 : 0;
    datasetCenterRef.current.set(centerX * scale, centerY * scale, centerZ * scale);

    const halfWidth = Math.max(width, 1) * 0.5;
    const halfHeight = Math.max(height, 1) * 0.5;
    const halfDepth = Math.max(depth, 1) * 0.5;
    const radiusLocal = Math.sqrt(
      halfWidth * halfWidth + halfHeight * halfHeight + halfDepth * halfDepth
    );
    const radiusWorld = radiusLocal * scale;
    datasetRadiusRef.current = Math.max(radiusWorld, 0.1);

    if (!props.followedTrackId && rendererCanvas.controls) {
      rotationTargetRef.current.copy(datasetCenterRef.current);
      rendererCanvas.controls.target.copy(datasetCenterRef.current);
      rendererCanvas.controls.update();
    }

    const camera = rendererCanvas.camera;
    if (camera) {
      const near = Math.max(datasetRadiusRef.current * 0.02, 0.001);
      const far = Math.max(datasetRadiusRef.current * 12, near + 5);
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }, [
    primaryLayer?.offsetX,
    primaryLayer?.offsetY,
    primaryVolume?.width,
    primaryVolume?.height,
    primaryVolume?.depth,
    props.followedTrackId,
    rendererCanvas.camera,
    rendererCanvas.controls
  ]);

  const clearHoverState = useCallback(() => {
    hoveredTrackIdRef.current = null;
    setHoveredTrackId(null);
    setTooltipPosition(null);
  }, []);

  const resetView = useCallback(
    (options?: { stopFollow?: boolean }) => {
      const shouldStopFollow = options?.stopFollow ?? false;
      if (shouldStopFollow && followedTrackIdRef.current) {
        props.onStopTrackFollow();
      }

      const rotationTarget = datasetCenterRef.current;
      rotationTargetRef.current.copy(rotationTarget);

      const controlsInstance = rendererCanvas.controls;
      if (controlsInstance) {
        controlsInstance.target.copy(rotationTarget);
        controlsInstance.update();
      }

      const cameraInstance = rendererCanvas.camera;
      if (cameraInstance) {
        const radius = Math.max(datasetRadiusRef.current, 0.1);
        const offsetDistance = radius * 2.4 + 0.4;
        const offsetVector = resetCameraOffsetRef.current;
        offsetVector.set(0, 0, offsetDistance);
        cameraInstance.position.copy(rotationTarget).add(offsetVector);
        cameraInstance.near = Math.max(radius * 0.02, 0.001);
        cameraInstance.far = Math.max(offsetDistance * 4, radius * 8, cameraInstance.near + 5);
        cameraInstance.updateProjectionMatrix();
      }

      clearMovementState();
      trackFollowOffsetRef.current = null;
    },
    [clearMovementState, props.onStopTrackFollow, rendererCanvas.camera, rendererCanvas.controls]
  );

  const registeredResetHandler = useCallback(() => {
    resetView({ stopFollow: true });
  }, [resetView]);

  useEffect(() => {
    props.onRegisterReset(registeredResetHandler);
    return () => {
      props.onRegisterReset(null);
    };
  }, [props.onRegisterReset, registeredResetHandler]);

  useEffect(() => {
    if (!rendererCanvas.camera || !rendererCanvas.controls) {
      return;
    }
    resetView({ stopFollow: false });
  }, [
    resetView,
    rendererCanvas.camera,
    rendererCanvas.controls,
    primaryLayer?.offsetX,
    primaryLayer?.offsetY,
    primaryVolume?.width,
    primaryVolume?.height,
    primaryVolume?.depth
  ]);

  const resolveTrackColor = useCallback(
    (track: VolumeViewerProps['tracks'][number]) => {
      const mode = props.channelTrackColorModes[track.channelId];
      if (mode && mode.type === 'uniform') {
        return new THREE.Color(mode.color);
      }
      return createTrackColor(track.id);
    },
    [props.channelTrackColorModes]
  );

  const selectedTrackIdsKey = useMemo(
    () => Array.from(props.selectedTrackIds).sort().join('|'),
    [props.selectedTrackIds]
  );

  const trackOverlayRevision = useMemo(
    () =>
      hashTracks(props.tracks) +
      Object.keys(props.trackVisibility).length * 7 +
      Object.keys(props.trackOpacityByChannel).length * 13 +
      Object.keys(props.trackLineWidthByChannel).length * 17 +
      selectedTrackIdsKey.length +
      (props.followedTrackId ? props.followedTrackId.length : 0),
    [
      props.tracks,
      props.trackVisibility,
      props.trackOpacityByChannel,
      props.trackLineWidthByChannel,
      props.followedTrackId,
      selectedTrackIdsKey
    ]
  );

  const { updateTrackDrawRanges, updateTrackInteractionState } = useTrackOverlay({
    trackGroup: trackGroupRef.current,
    trackLinesRef,
    tracks: props.tracks,
    trackOverlayRevision,
    rendererSize,
    channelTrackOffsets: props.channelTrackOffsets,
    resolveTrackColor,
    hoveredTrackIdRef,
    clearHoverState,
    timeIndexRef,
    defaultTrackOpacity: DEFAULT_TRACK_OPACITY,
    defaultTrackLineWidth: DEFAULT_TRACK_LINE_WIDTH,
    hoverLineWidthMultiplier: HOVERED_TRACK_LINE_WIDTH_MULTIPLIER,
    followLineWidthMultiplier: FOLLOWED_TRACK_LINE_WIDTH_MULTIPLIER,
    selectedLineWidthMultiplier: SELECTED_TRACK_LINE_WIDTH_MULTIPLIER,
    trackVisibility: props.trackVisibility,
    selectedTrackIds: props.selectedTrackIds,
    hoveredTrackId,
    followedTrackId: props.followedTrackId,
    trackOpacityByChannel: props.trackOpacityByChannel,
    trackLineWidthByChannel: props.trackLineWidthByChannel
  });

  useEffect(() => {
    updateTrackInteractionState();
  }, [updateTrackInteractionState]);

  useEffect(() => {
    timeIndexRef.current = props.timeIndex;
    updateTrackDrawRanges(props.timeIndex);
  }, [props.timeIndex, updateTrackDrawRanges]);

  useEffect(() => {
    followedTrackIdRef.current = props.followedTrackId;
    if (!props.followedTrackId) {
      trackFollowOffsetRef.current = null;
    }
  }, [props.followedTrackId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const movementKeys: Record<string, keyof MovementState> = {
      KeyW: 'moveForward',
      ArrowUp: 'moveForward',
      KeyS: 'moveBackward',
      ArrowDown: 'moveBackward',
      KeyA: 'moveLeft',
      ArrowLeft: 'moveLeft',
      KeyD: 'moveRight',
      ArrowRight: 'moveRight',
      KeyE: 'moveUp',
      KeyQ: 'moveDown'
    };

    const shouldIgnoreEvent = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return false;
      }
      const tagName = target.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return true;
      }
      if (target.isContentEditable) {
        return true;
      }
      return false;
    };

    const handleKeyChange = (event: KeyboardEvent, pressed: boolean) => {
      const binding = movementKeys[event.code];
      if (!binding) {
        return;
      }
      if (shouldIgnoreEvent(event)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const movementState = movementStateRef.current;
      if (movementState[binding] === pressed) {
        return;
      }
      movementState[binding] = pressed;
      event.preventDefault();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      handleKeyChange(event, true);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      handleKeyChange(event, false);
    };

    const handleBlur = () => {
      clearMovementState();
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        clearMovementState();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [clearMovementState]);

  useEffect(() => {
    playbackStateRef.current = {
      isPlaying: props.isPlaying,
      playbackDisabled: props.playbackDisabled,
      playbackLabel: props.playbackLabel,
      fps: props.fps,
      timeIndex: props.timeIndex,
      totalTimepoints: props.totalTimepoints,
      onTimeIndexChange: props.onTimeIndexChange
    };
  }, [
    props.isPlaying,
    props.playbackDisabled,
    props.playbackLabel,
    props.fps,
    props.timeIndex,
    props.totalTimepoints,
    props.onTimeIndexChange
  ]);

  const renderRevision = useMemo(() => props.layers.length, [props.layers.length]);

  useRayMarchLoop({
    renderer: rendererCanvas.renderer,
    controls: rendererCanvas.controls,
    scene: rendererCanvas.scene,
    camera: rendererCanvas.camera,
    volumeRootRef: volumeRootGroupRef,
    rotationTargetRef,
    movementStateRef,
    followedTrackIdRef,
    trackFollowOffsetRef,
    trackLinesRef,
    resourcesRef,
    playbackLoopRef,
    playbackStateRef,
    vrHoverStateRef,
    controllersRef,
    timeIndexRef,
    updateVrPlaybackHud: () => {},
    refreshVrHudPlacements: () => {},
    updateControllerRays: () => {},
    vrLog: () => {},
    playbackFpsLimits: { min: VR_PLAYBACK_MIN_FPS, max: VR_PLAYBACK_MAX_FPS },
    trackBlinkSettings: {
      periodMs: SELECTED_TRACK_BLINK_PERIOD_MS,
      base: SELECTED_TRACK_BLINK_BASE,
      range: SELECTED_TRACK_BLINK_RANGE
    },
    revision: renderRevision,
    updateTrackOverlayDrawRanges: updateTrackDrawRanges,
    updateTrackOverlayState: updateTrackInteractionState
  });

  const hoveredTrackLabel = useMemo(() => {
    if (!hoveredTrackId) {
      return null;
    }
    const track = props.tracks.find((entry) => entry.id === hoveredTrackId);
    if (!track) {
      return null;
    }
    const channelName = track.channelName ? `${track.channelName} · ` : '';
    return `${channelName}${track.id}`;
  }, [hoveredTrackId, props.tracks]);

  const tooltip = useVolumeSceneTooltip(props, rendererCanvas, hoveredTrackLabel, tooltipPosition);

  return (
    <div className="volume-viewer">
      <section className="viewer-surface">
        {showLoadingOverlay && (
          <div className="overlay">
            <div className="loading-panel">
              <span className="loading-title">Loading dataset…</span>
            </div>
          </div>
        )}
        <div className={`render-surface${hasMeasured ? ' is-ready' : ''}`} ref={forwardedContainerRef}>
          {tooltip.hoveredTrackLabel && tooltip.tooltipPosition ? (
            <div
              className="track-tooltip"
              style={{
                left: `${tooltip.tooltipPosition.x}px`,
                top: `${tooltip.tooltipPosition.y}px`
              }}
              role="status"
              aria-live="polite"
            >
              {tooltip.hoveredTrackLabel}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default VolumeScene;
