import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import './viewerCommon.css';
import './VolumeViewer.css';
import { createEmptyDesktopViewStateMap, type DesktopViewerCamera } from '../../hooks/useVolumeRenderSetup';
import type {
  VolumeViewerCaptureTarget,
  VolumeResources,
  VolumeViewerProps,
} from './VolumeViewer.types';
import { LoadingOverlay } from './volume-viewer/LoadingOverlay';
import { TrackTooltip } from './volume-viewer/TrackTooltip';
import { HoverDebug } from './volume-viewer/HoverDebug';
import { ViewerPropsOverlay } from './volume-viewer/ViewerPropsOverlay';
import { VolumeViewerVrAdapter } from './volume-viewer/VolumeViewerVrAdapter';
import { TrackCameraPresenter } from './volume-viewer/TrackCameraPresenter';
import {
  resolveAdaptiveCameraFrustum,
  resolveSceneWorldBounds,
} from './volume-viewer/cameraNavigationBounds';
import { resolveBackgroundGridStyle } from './volume-viewer/backgroundGrid';
import { resolveCanonicalSceneDimensions } from './volume-viewer/layerRenderSource';
import { useVolumeHover } from './volume-viewer/useVolumeHover';
import { useVolumeViewerVrBridge } from './volume-viewer/useVolumeViewerVrBridge';
import { useViewerPropsRendering } from './volume-viewer/useViewerPropsRendering';
import { useCameraControls } from './volume-viewer/useCameraControls';
import { useTrackRendering } from './volume-viewer/useTrackRendering';
import { useRoiRendering } from './volume-viewer/useRoiRendering';
import { usePlaybackControls } from './volume-viewer/usePlaybackControls';
import { useTrackTooltip } from './volume-viewer/useTrackTooltip';
import { useVolumeViewerState } from './volume-viewer/useVolumeViewerState';
import { useVolumeViewerDataState, useVolumeViewerResources } from './volume-viewer/useVolumeViewerData';
import { useVolumeViewerInteractions } from './volume-viewer/useVolumeViewerInteractions';
import { useVolumeViewerFollowTarget } from './volume-viewer/useVolumeViewerFollowTarget';
import { useVolumeViewerLifecycle } from './volume-viewer/useVolumeViewerLifecycle';
import { useVolumeViewerResets } from './volume-viewer/useVolumeViewerResets';
import { useVolumeViewerAnisotropy } from './volume-viewer/useVolumeViewerAnisotropy';
import { useVolumeViewerRefSync } from './volume-viewer/useVolumeViewerRefSync';
import { useVolumeViewerSurfaceBinding } from './volume-viewer/useVolumeViewerSurfaceBinding';
import { useVolumeViewerTransformBindings } from './volume-viewer/useVolumeViewerTransformBindings';
import { resolveVolumeViewerVrRuntime } from './volume-viewer/volumeViewerVrRuntime';
import {
  resolvePlaybackWarmupGateWaitMs,
  resetPlaybackWarmupGateState,
  shouldAllowPlaybackAdvanceWithWarmup,
  type PlaybackWarmupGateState,
} from './volume-viewer/playbackWarmupGate';
import {
  buildVolumeViewerLifecycleParams,
  buildVolumeViewerVrBridgeOptions,
} from './volume-viewer/volumeViewerRuntimeArgs';
import {
  computeRuntimeDiagnosticsWindowDefaultPosition,
  computeRuntimeDiagnosticsWindowRecenterPosition,
  RUNTIME_DIAGNOSTICS_WINDOW_WIDTH,
} from '../../shared/utils/windowLayout';
import { computeLoopedNextTimeIndex } from '../../shared/utils';
import { RENDER_STYLE_BL, RENDER_STYLE_SLICE } from '../../state/layerSettings';
import FloatingWindow from '../widgets/FloatingWindow';
import { DEFAULT_HOVER_SETTINGS, normalizeHoverSettings } from '../../shared/utils/hoverSettings';
import {
  DEFAULT_DESKTOP_RENDER_RESOLUTION,
  resolveDesktopRenderResolutionPixelRatioCap,
} from '../../types/renderResolution';

function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
}

function formatChunkBytesAsMb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0.0 MB';
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeGpuResidency(resources: Map<string, VolumeResources>) {
  let layerCount = 0;
  let residentBricks = 0;
  let totalBricks = 0;
  let residentBytes = 0;
  let budgetBytes = 0;
  let uploads = 0;
  let evictions = 0;
  let pendingBricks = 0;
  let scheduledUploads = 0;

  for (const resource of resources.values()) {
    const metrics = resource.gpuBrickResidencyMetrics;
    if (!metrics) {
      continue;
    }
    layerCount += 1;
    residentBricks += metrics.residentBricks;
    totalBricks += metrics.totalBricks;
    residentBytes += metrics.residentBytes;
    budgetBytes += metrics.budgetBytes;
    uploads += metrics.uploads;
    evictions += metrics.evictions;
    pendingBricks += metrics.pendingBricks;
    scheduledUploads += metrics.scheduledUploads;
  }

  if (layerCount === 0) {
    return null;
  }

  return {
    layerCount,
    residentBricks,
    totalBricks,
    residentBytes,
    budgetBytes,
    uploads,
    evictions,
    pendingBricks,
    scheduledUploads
  };
}

function resolveBackgroundReferenceDimensions(
  layers: VolumeViewerProps['layers'],
  primaryVolume: { width: number; height: number; depth: number } | null
): { width: number; height: number; depth: number } | null {
  const canonicalDimensions = resolveCanonicalSceneDimensions(layers);
  if (canonicalDimensions) {
    return canonicalDimensions;
  }

  if (primaryVolume) {
    return {
      width: primaryVolume.width,
      height: primaryVolume.height,
      depth: primaryVolume.depth,
    };
  }

  return null;
}

const ROI_COMPOSITE_SHADER_KEY = 'roi-composite-transmittance-v1';
const ROI_PREPASS_SHADER_KEY = 'roi-prepass-depth-v1';
const ROI_TRANSMITTANCE_FALLBACK_TEXTURE = (() => {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  texture.type = THREE.UnsignedByteType;
  texture.internalFormat = null;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
})();
const BACKGROUND_FLOOR_SHADER_KEY = 'background-floor-infinite-plane-v3';

type ScreenshotCanvasResource = {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  imageData: ImageData;
};

function dataUrlToBlob(dataUrl: string): Blob | null {
  const [header, encodedPayload] = dataUrl.split(',', 2);
  if (!header || !encodedPayload) {
    return null;
  }

  const mimeTypeMatch = /^data:(.*?)(;base64)?$/.exec(header);
  if (!mimeTypeMatch) {
    return null;
  }

  const mimeType = mimeTypeMatch[1] || 'application/octet-stream';

  try {
    if (mimeTypeMatch[2] === ';base64') {
      const binary = globalThis.atob(encodedPayload);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new Blob([bytes], { type: mimeType });
    }

    return new Blob([decodeURIComponent(encodedPayload)], { type: mimeType });
  } catch {
    return null;
  }
}

async function captureCanvasPng(canvas: HTMLCanvasElement): Promise<Blob | null> {
  if (typeof canvas.toBlob === 'function') {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), 'image/png');
    });
    if (blob) {
      return blob;
    }
  }

  try {
    return dataUrlToBlob(canvas.toDataURL('image/png'));
  } catch {
    return null;
  }
}

function ensureScreenshotCanvasResource(
  resourceRef: MutableRefObject<ScreenshotCanvasResource | null>,
  width: number,
  height: number,
): ScreenshotCanvasResource | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const existing = resourceRef.current;
  if (existing && existing.canvas.width === width && existing.canvas.height === height) {
    return existing;
  }

  const canvas = existing?.canvas ?? document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = existing?.context ?? canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const imageData = context.createImageData(width, height);
  const nextResource = { canvas, context, imageData };
  resourceRef.current = nextResource;
  return nextResource;
}

function copyRenderTargetPixelsToImageData(
  pixels: Uint8Array,
  imageData: ImageData,
  width: number,
  height: number,
): void {
  const rowLength = width * 4;
  for (let row = 0; row < height; row += 1) {
    const sourceOffset = row * rowLength;
    const targetOffset = (height - row - 1) * rowLength;
    imageData.data.set(pixels.subarray(sourceOffset, sourceOffset + rowLength), targetOffset);
  }
}

function ensureScreenshotRenderTarget(
  targetRef: MutableRefObject<THREE.WebGLRenderTarget | null>,
  renderer: THREE.WebGLRenderer,
  width: number,
  height: number,
): THREE.WebGLRenderTarget {
  const current = targetRef.current;
  if (current && current.width === width && current.height === height) {
    return current;
  }

  current?.dispose();
  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: true,
    stencilBuffer: false,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
  });
  target.texture.minFilter = THREE.LinearFilter;
  target.texture.magFilter = THREE.LinearFilter;
  target.texture.generateMipmaps = false;
  target.texture.colorSpace = THREE.SRGBColorSpace;
  if (renderer.capabilities.isWebGL2) {
    target.samples = 4;
  }
  targetRef.current = target;
  return target;
}

function ensureScreenshotReadbackBuffer(
  bufferRef: MutableRefObject<Uint8Array | null>,
  width: number,
  height: number,
): Uint8Array {
  const expectedLength = width * height * 4;
  const current = bufferRef.current;
  if (current && current.length === expectedLength) {
    return current;
  }
  const nextBuffer = new Uint8Array(expectedLength);
  bufferRef.current = nextBuffer;
  return nextBuffer;
}

function ensureRoiCompositeShader(
  material: LineMaterial,
  uniforms: {
    enabled: { value: number };
    transmittanceTexture: { value: THREE.Texture };
    viewport: { value: THREE.Vector2 };
  }
) {
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.roiCompositeEnabled = uniforms.enabled;
    shader.uniforms.roiCompositeTransmittance = uniforms.transmittanceTexture;
    shader.uniforms.roiCompositeViewport = uniforms.viewport;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'uniform float linewidth;\n',
        'uniform float linewidth;\nuniform float roiCompositeEnabled;\nuniform sampler2D roiCompositeTransmittance;\nuniform vec2 roiCompositeViewport;\n'
      )
      .replace(
        'float alpha = opacity;\n',
        `float alpha = opacity;
			if (roiCompositeEnabled > 0.5 && roiCompositeViewport.x > 0.0 && roiCompositeViewport.y > 0.0) {
				vec2 roiCompositeUv = clamp(gl_FragCoord.xy / roiCompositeViewport, vec2(0.0), vec2(1.0));
				float roiCompositeTrans = texture2D(roiCompositeTransmittance, roiCompositeUv).r;
				alpha *= clamp(roiCompositeTrans, 0.0, 1.0);
			}\n`
      );
  };
  material.customProgramCacheKey = () => ROI_COMPOSITE_SHADER_KEY;
  material.needsUpdate = true;
}

function ensureRoiPrepassShader(material: LineMaterial) {
  material.transparent = false;
  material.depthTest = false;
  material.depthWrite = false;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'gl_FragColor = vec4( diffuseColor.rgb, alpha );',
      'gl_FragColor = vec4(vec3(gl_FragCoord.z), 1.0);'
    );
  };
  material.customProgramCacheKey = () => ROI_PREPASS_SHADER_KEY;
  material.needsUpdate = true;
}

function isPlaybackWarmupEligibleLayer(layer: VolumeViewerProps['layers'][number]): boolean {
  if (!layer.visible) {
    return false;
  }
  if (layer.renderStyle === RENDER_STYLE_SLICE) {
    return false;
  }
  const depth =
    layer.volume?.depth ??
    layer.brickAtlas?.pageTable.volumeShape[0] ??
    layer.fullResolutionDepth ??
    0;
  const viewerMode =
    layer.mode === 'slice' || layer.mode === '3d'
      ? layer.mode
      : depth > 1
        ? '3d'
        : 'slice';
  return viewerMode === '3d';
}

function VolumeViewer({
  layers,
  playbackWarmupLayers = [],
  playbackWarmupFrames = [],
  projectionMode = 'perspective',
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
  runtimeDiagnostics,
  lodPolicyDiagnostics,
  residencyDecisions = {},
  isDiagnosticsWindowOpen = false,
  onCloseDiagnosticsWindow,
  windowResetSignal,
  desktopRenderResolution = DEFAULT_DESKTOP_RENDER_RESOLUTION,
  timeIndex,
  totalTimepoints,
  isPlaying,
  isPlaybackStartPending = false,
  playbackDisabled,
  playbackLabel,
  fps,
  playbackBufferFrames,
  blendingMode,
  zClipFrontFraction = 0,
  onTogglePlayback,
  onTimeIndexChange,
  playbackWindow = null,
  canAdvancePlayback,
  onBufferedPlaybackStart,
  onFpsChange,
  onRegisterVolumeStepScaleChange,
  onCameraNavigationSample,
  translationSpeedMultiplier = 1,
  rotationSpeedMultiplier = 1,
  rotationLocked = false,
  onCameraWindowStateChange,
  onRegisterCameraWindowController,
  onRegisterReset,
  onRegisterCaptureTarget,
  trackScale,
  tracks,
  compiledTrackPayloadByTrackSet,
  onRequireTrackPayloads,
  trackSetStates,
  trackOpacityByTrackSet,
  trackLineWidthByTrackSet,
  trackColorModesByTrackSet,
  channelTrackOffsets,
  isFullTrackTrailEnabled,
  trackTrailLength,
  drawTrackCentroids = false,
  drawTrackStartingPoints = true,
  selectedTrackIds,
  followedTrackId,
  followedVoxel,
  onTrackSelectionToggle,
  onTrackFollowRequest,
  onVoxelFollowRequest,
  onHoverVoxelChange,
  hoverSettings = DEFAULT_HOVER_SETTINGS,
  background,
  viewerPropsConfig,
  roiConfig,
  paintbrush,
  vr
}: VolumeViewerProps) {
  const vrLog = (...args: Parameters<typeof console.debug>) => {
    if (import.meta.env?.DEV) {
      console.debug(...args);
    }
  };

  const {
    isVrPassthroughSupported,
    trackChannels,
    activeTrackChannelId,
    channelPanels,
    activeChannelPanelId,
    onRegisterVrSession,
  } = resolveVolumeViewerVrRuntime(vr);
  const paintbrushRef = useRef(paintbrush);
  const paintStrokePointerIdRef = useRef<number | null>(null);
  const roiBlOcclusionAlphaSceneRef = useRef<THREE.Scene | null>(new THREE.Scene());
  const roiBlOcclusionDepthSceneRef = useRef<THREE.Scene | null>(new THREE.Scene());
  const roiBlOcclusionAlphaTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const roiBlOcclusionDepthTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const roiBlOcclusionSizeRef = useRef({ width: 0, height: 0 });
  const screenshotRenderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const screenshotReadbackBufferRef = useRef<Uint8Array | null>(null);
  const screenshotCanvasResourceRef = useRef<ScreenshotCanvasResource | null>(null);
  const backgroundPassSceneRef = useRef<THREE.Scene | null>(new THREE.Scene());
  const backgroundPassMeshRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null>(null);
  const backgroundPassPlanePointLocalRef = useRef(new THREE.Vector3());
  const backgroundPassPlanePointWorldRef = useRef(new THREE.Vector3());
  const backgroundPassPlaneNormalWorldRef = useRef(new THREE.Vector3());
  const backgroundPassCameraLocalRef = useRef(new THREE.Vector3());
  const roiPrepassSceneRef = useRef<THREE.Scene | null>(new THREE.Scene());
  const roiPrepassLineRef = useRef<LineSegments2 | null>(null);
  const roiPrepassTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const roiCompositeSceneRef = useRef<THREE.Scene | null>(new THREE.Scene());
  const roiCompositeLineRef = useRef<LineSegments2 | null>(null);
  const roiCompositeLineMaterialRef = useRef<LineMaterial | null>(null);
  const roiCompositeUniformsRef = useRef({
    enabled: { value: 0 },
    transmittanceTexture: { value: ROI_TRANSMITTANCE_FALLBACK_TEXTURE as THREE.Texture },
    viewport: { value: new THREE.Vector2(1, 1) },
  });
  const backgroundPassUniformsRef = useRef({
    projectionInverse: { value: new THREE.Matrix4() },
    cameraWorldMatrix: { value: new THREE.Matrix4() },
    cameraWorldPosition: { value: new THREE.Vector3() },
    volumeRootWorldInverse: { value: new THREE.Matrix4() },
    planePointWorld: { value: new THREE.Vector3() },
    planeNormalWorld: { value: new THREE.Vector3(0, 1, 0) },
    floorColor: { value: new THREE.Color('#d7dbe0') },
    gridColor: { value: new THREE.Color('#8c9198') },
    gridSpacing: { value: 10 },
    gridStrength: { value: 0.5 },
    gridOriginOffset: { value: new THREE.Vector2() },
    farGridColor: { value: new THREE.Color('#9ea3aa') },
    farGridSpacing: { value: 40 },
    farGridStrength: { value: 0.34 },
    farGridOriginOffset: { value: new THREE.Vector2() },
  });

  const resourcesRef = useRef<Map<string, VolumeResources>>(new Map());
  const playbackWarmupGateRef = useRef<PlaybackWarmupGateState>({
    blockedNextIndex: null,
    blockedAtMs: null,
  });
  const playbackStartupBufferStartedAtRef = useRef<number | null>(null);
  const hoverRaycasterRef = useRef<THREE.Raycaster | null>(null);
  const {
    containerNode,
    setContainerNode,
    currentDimensionsRef,
    colormapCacheRef,
    volumeRootGroupRef,
    volumeRootBaseOffsetRef,
    volumeRootCenterOffsetRef,
    volumeRootCenterUnscaledRef,
    volumeRootHalfExtentsRef,
    volumeNormalizationScaleRef,
    volumeAnisotropyScaleRef,
    volumeStepScaleBaseRef,
    volumeStepScaleRatioRef,
    volumeUserScaleRef,
    volumeStepScaleRef,
    volumeYawRef,
    volumePitchRef,
    volumeRootRotatedCenterTempRef,
    trackGroupRef,
    roiGroupRef,
    trackLinesRef,
    roiLinesRef,
    followedTrackIdRef,
    followTargetOffsetRef,
    previousFollowTargetKeyRef,
    followTargetActiveRef,
    followedVoxelRef,
    hasActive3DLayerRef,
    hasMeasured,
    setHasMeasured,
    renderContextRevision,
    setRenderContextRevision,
    layersRef,
    hoverIntensityRef,
    hoveredVoxelRef,
    voxelHoverDebugRef,
    voxelHoverDebug,
    setVoxelHoverDebug,
    resetVolumeCallbackRef,
    resetHudPlacementCallbackRef,
    trackFollowRequestCallbackRef,
  } = useVolumeViewerState();
  const resolvedHoverSettings = useMemo(
    () => normalizeHoverSettings(hoverSettings),
    [hoverSettings]
  );
  const rendererPixelRatioCap = useMemo(
    () => resolveDesktopRenderResolutionPixelRatioCap(desktopRenderResolution),
    [desktopRenderResolution],
  );
  const enableKeyboardNavigation = useMemo(
    () =>
      layers.some((layer) => {
        const depth =
          layer.volume?.depth ??
          layer.brickAtlas?.pageTable.volumeShape[0] ??
          layer.fullResolutionDepth ??
          0;
        if (layer.renderStyle === RENDER_STYLE_SLICE) {
          return depth > 0;
        }
        const mode =
          layer.mode === 'slice' || layer.mode === '3d'
            ? layer.mode
            : depth > 1
              ? '3d'
              : 'slice';
        return mode === '3d';
      }),
    [layers],
  );
  const {
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
  } = useCameraControls({
    trackLinesRef,
    roiLinesRef,
    volumeRootGroupRef,
    currentDimensionsRef,
    followTargetActiveRef,
    followTargetOffsetRef,
    setHasMeasured,
    projectionMode,
    translationSpeedMultiplier,
    rotationSpeedMultiplier,
    enableKeyboardNavigation,
    rotationLocked,
    rendererPixelRatioCap,
  });
  useEffect(() => {
    onRegisterCameraWindowController?.({
      applyCameraPose,
      captureCameraState: captureCameraWindowState,
    });
    return () => {
      onRegisterCameraWindowController?.(null);
    };
  }, [applyCameraPose, captureCameraWindowState, onRegisterCameraWindowController]);
  const isDevMode = Boolean(import.meta.env?.DEV);
  const { resolvedAnisotropyScale, anisotropyStepRatio } = useVolumeViewerAnisotropy({
    trackScale,
    volumeAnisotropyScaleRef,
    volumeStepScaleBaseRef,
    volumeStepScaleRatioRef,
    volumeStepScaleRef,
  });
  const {
    requestVolumeReset,
    requestHudPlacementReset,
    handleTrackFollowRequest,
  } = useVolumeViewerRefSync({
    paintbrush,
    paintbrushRef,
    layers,
    layersRef,
    followedTrackId,
    followedTrackIdRef,
    followedVoxel,
    followedVoxelRef,
    followTargetActiveRef,
    trackFollowRequestCallbackRef,
    onTrackFollowRequest,
    resetVolumeCallbackRef,
    resetHudPlacementCallbackRef,
  });
  const getPlaybackWarmupStatusRef = useRef<
    (nextIndex: number, requiredLayerKeys: string[]) => 'ready' | 'pending' | 'missing'
  >(() => 'missing');
  const playbackRequiredLayerKeys = useMemo(
    () =>
      layers
        .filter((layer) => isPlaybackWarmupEligibleLayer(layer) && (residencyDecisions[layer.key] ?? null) !== null)
        .map((layer) => layer.key),
    [layers, residencyDecisions]
  );

  const canAdvancePlaybackWithWarmup = useMemo(() => {
    return (nextIndex: number) => {
      if (canAdvancePlayback && !canAdvancePlayback(nextIndex)) {
        resetPlaybackWarmupGateState(playbackWarmupGateRef.current);
        return false;
      }
      return shouldAllowPlaybackAdvanceWithWarmup({
        nextIndex,
        requiredLayerKeys: playbackRequiredLayerKeys,
        getWarmupStatus: getPlaybackWarmupStatusRef.current,
        fps,
        nowMs: Date.now(),
        gateState: playbackWarmupGateRef.current,
      });
    };
  }, [canAdvancePlayback, fps, playbackRequiredLayerKeys]);

  useEffect(() => {
    if (!isPlaying) {
      resetPlaybackWarmupGateState(playbackWarmupGateRef.current);
    }
  }, [isPlaying]);
  useEffect(() => {
    if (!isPlaybackStartPending) {
      playbackStartupBufferStartedAtRef.current = null;
    }
  }, [isPlaybackStartPending]);

  const {
    playbackState,
    clampedTimeIndex,
    timeIndexRef,
    registerPlaybackRefs,
    advancePlaybackFrame,
  } = usePlaybackControls({
    isPlaying,
    playbackDisabled,
    playbackLabel,
    fps,
    timeIndex,
    totalTimepoints,
    onTogglePlayback,
    onTimeIndexChange,
    canAdvancePlayback: canAdvancePlaybackWithWarmup,
    playbackWindow,
    onFpsChange,
  });

  const isAdditiveBlending = blendingMode === 'additive';
  const preservedViewStateRef = useRef(createEmptyDesktopViewStateMap());
  const gpuResidencySummary = summarizeGpuResidency(resourcesRef.current);
  const residencyDecisionSummary = useMemo(
    () =>
      layers
        .filter((layer) => layer.visible)
        .map((layer) => {
          const decision = residencyDecisions[layer.key] ?? null;
          return decision ? `${layer.key}: ${decision.mode} s${decision.scaleLevel}` : null;
        })
        .filter((value): value is string => value !== null)
        .join(', '),
    [layers, residencyDecisions]
  );
  const residencyRationaleSummary = useMemo(
    () =>
      layers
        .filter((layer) => layer.visible)
        .map((layer) => {
          const decision = residencyDecisions[layer.key] ?? null;
          return decision ? `${layer.key}: ${decision.rationale}` : null;
        })
        .filter((value): value is string => value !== null)
        .join(', '),
    [layers, residencyDecisions]
  );
  const [runtimeDiagnosticsWindowInitialPosition, setRuntimeDiagnosticsWindowInitialPosition] = useState(
    () => computeRuntimeDiagnosticsWindowDefaultPosition()
  );
  const lastWindowResetSignalRef = useRef(windowResetSignal);

  useEffect(() => {
    if (windowResetSignal === undefined) {
      lastWindowResetSignalRef.current = windowResetSignal;
      return;
    }
    if (lastWindowResetSignalRef.current === windowResetSignal) {
      return;
    }
    lastWindowResetSignalRef.current = windowResetSignal;
    setRuntimeDiagnosticsWindowInitialPosition(computeRuntimeDiagnosticsWindowRecenterPosition());
  }, [windowResetSignal]);

  const {
    applyHoverHighlightToResources,
    emitHoverVoxel,
    clearVoxelHover,
    reportVoxelHoverAbort,
    clearVoxelHoverDebug,
    setHoverNotReady,
  } = useVolumeViewerInteractions({
    layersRef,
    resourcesRef,
    hoveredVoxelRef,
    volumeAnisotropyScaleRef,
    hoverIntensityRef,
    voxelHoverDebugRef,
    setVoxelHoverDebug,
    isDevMode,
    hoverSettings: resolvedHoverSettings,
    onHoverVoxelChange,
  });

  const { showLoadingOverlay, primaryVolume, hasRenderableLayer, hasActive3DLayer } =
    useVolumeViewerDataState({
      layers,
      isLoading,
      loadingProgress,
      loadedVolumes,
      expectedVolumes,
    });
  const backgroundReferenceDimensions = useMemo(
    () => resolveBackgroundReferenceDimensions(layers, primaryVolume),
    [layers, primaryVolume]
  );
  const isDesktopBackgroundDisabled = vr?.isVrActive ?? false;
  const viewerSurfaceBackgroundStyle = useMemo(
    () =>
      !isDesktopBackgroundDisabled && background?.surfaceColor
        ? { background: background.surfaceColor }
        : undefined,
    [background?.surfaceColor, isDesktopBackgroundDisabled]
  );
  const {
    hoveredTrackId,
    tooltipPosition,
    trackLookup,
    applyTrackGroupTransform,
    performHoverHitTest,
    updateHoverState,
    clearHoverState,
    updateTrackAppearance,
    computeTrackCentroid,
    refreshTrackOverlay,
    disposeTrackResources,
  } = useTrackRendering({
    tracks,
    compiledTrackPayloadByTrackSet,
    onRequireTrackPayloads,
    trackSetStates,
    trackOpacityByTrackSet,
    trackLineWidthByTrackSet,
    trackColorModesByTrackSet,
    channelTrackOffsets,
    isFullTrackTrailEnabled,
    trackTrailLength,
    drawTrackCentroids,
    drawTrackStartingPoints,
    trackScale,
    selectedTrackIds,
    followedTrackId,
    clampedTimeIndex,
    trackGroupRef,
    trackLinesRef,
    containerRef,
    rendererRef,
    cameraRef,
    hoverRaycasterRef,
    hasActive3DLayer,
  });

  const { hoveredTrackLabel } = useTrackTooltip({
    hoveredTrackId,
    trackLookup,
  });
  const {
    isDrawToolActiveRef,
    isDrawPreviewActiveRef,
    isRoiMoveInteractionActiveRef,
    isRoiMoveActiveRef,
    performHoverHitTest: performRoiHitTest,
    handlePointerDown: handleRoiPointerDown,
    handlePointerMove: handleRoiPointerMove,
    handlePointerUp: handleRoiPointerUp,
    handlePointerLeave: handleRoiPointerLeave,
    updateRoiAppearance,
    disposeRoiResources,
  } = useRoiRendering({
    roiConfig,
    renderContextRevision,
    roiGroupRef,
    roiLinesRef,
    layersRef,
    hoveredVoxelRef,
    currentDimensionsRef,
    containerRef,
    rendererRef,
    cameraRef,
    volumeRootGroupRef,
  });
  const updateOverlayAppearance = useCallback(
    (timestamp: number) => {
      updateTrackAppearance(timestamp);
      updateRoiAppearance(timestamp);
    },
    [updateRoiAppearance, updateTrackAppearance]
  );
  const ensureRoiPrepassHelpers = useCallback((renderer: THREE.WebGLRenderer) => {
    const bufferSize = new THREE.Vector2();
    renderer.getDrawingBufferSize(bufferSize);
    const width = Math.max(1, Math.floor(bufferSize.x));
    const height = Math.max(1, Math.floor(bufferSize.y));
    const prepassScene = roiPrepassSceneRef.current;
    const compositeScene = roiCompositeSceneRef.current;
    if (!prepassScene || !compositeScene) {
      return null;
    }

    if (!roiPrepassLineRef.current) {
      const material = new LineMaterial({
        color: new THREE.Color(0xffffff),
        linewidth: 1,
        transparent: false,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
      });
      material.resolution.set(width, height);
      ensureRoiPrepassShader(material);
      const line = new LineSegments2(undefined as never, material);
      line.frustumCulled = false;
      line.visible = false;
      line.matrixAutoUpdate = false;
      roiPrepassLineRef.current = line;
      prepassScene.add(line);
    }

    if (!roiCompositeLineRef.current) {
      const material = new LineMaterial({
        color: new THREE.Color(0xffffff),
        linewidth: 1,
        transparent: true,
        opacity: 1,
        depthTest: false,
        depthWrite: false,
      });
      material.resolution.set(width, height);
      ensureRoiCompositeShader(material, roiCompositeUniformsRef.current);
      const line = new LineSegments2(undefined as never, material);
      line.frustumCulled = false;
      line.visible = false;
      line.matrixAutoUpdate = false;
      roiCompositeLineRef.current = line;
      roiCompositeLineMaterialRef.current = material;
      compositeScene.add(line);
    }

    roiPrepassLineRef.current.material.resolution.set(width, height);
    roiCompositeLineMaterialRef.current?.resolution.set(width, height);
    roiCompositeUniformsRef.current.viewport.value.set(width, height);

    return {
      width,
      height,
      prepassLine: roiPrepassLineRef.current,
      compositeLine: roiCompositeLineRef.current,
    };
  }, []);
  const ensureRoiRenderTargets = useCallback((renderer: THREE.WebGLRenderer) => {
    const bufferSize = new THREE.Vector2();
    renderer.getDrawingBufferSize(bufferSize);
    const width = Math.max(1, Math.floor(bufferSize.x));
    const height = Math.max(1, Math.floor(bufferSize.y));
    if (
      roiBlOcclusionAlphaTargetRef.current &&
      roiPrepassTargetRef.current &&
      roiBlOcclusionSizeRef.current.width === width &&
      roiBlOcclusionSizeRef.current.height === height
    ) {
      return {
        width,
        height,
        alphaTarget: roiBlOcclusionAlphaTargetRef.current,
        prepassTarget: roiPrepassTargetRef.current,
      };
    }

    roiBlOcclusionAlphaTargetRef.current?.dispose();
    roiBlOcclusionDepthTargetRef.current?.dispose();
    roiPrepassTargetRef.current?.dispose();

    const alphaTarget = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: false,
      stencilBuffer: false,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });
    alphaTarget.texture.minFilter = THREE.LinearFilter;
    alphaTarget.texture.magFilter = THREE.LinearFilter;
    alphaTarget.texture.generateMipmaps = false;

    const prepassTarget = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: false,
      stencilBuffer: false,
      format: THREE.RGBAFormat,
      type: THREE.FloatType,
    });
    prepassTarget.texture.minFilter = THREE.NearestFilter;
    prepassTarget.texture.magFilter = THREE.NearestFilter;
    prepassTarget.texture.generateMipmaps = false;

    roiBlOcclusionAlphaTargetRef.current = alphaTarget;
    roiPrepassTargetRef.current = prepassTarget;
    roiBlOcclusionSizeRef.current = { width, height };

    return { width, height, alphaTarget, prepassTarget };
  }, []);
  const renderRoiBlOcclusionPass = useCallback(
    (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => {
      const alphaScene = roiBlOcclusionAlphaSceneRef.current;
      const helperBundle = ensureRoiPrepassHelpers(renderer);
      if (!alphaScene || !helperBundle) {
        return;
      }

      const blResources = Array.from(resourcesRef.current.values()).filter(
        (resource) =>
          resource.mode === '3d' &&
          resource.renderStyle === RENDER_STYLE_BL &&
          resource.roiBlOcclusionAlphaMesh
      );

      for (const resource of blResources) {
        resource.mesh.updateMatrixWorld(true);
        const alphaMesh = resource.roiBlOcclusionAlphaMesh!;
        alphaMesh.matrixAutoUpdate = false;
        alphaMesh.matrix.copy(resource.mesh.matrixWorld);
        alphaMesh.matrixWorld.copy(resource.mesh.matrixWorld);
        alphaMesh.matrixWorldNeedsUpdate = false;
        alphaMesh.visible = resource.mesh.visible;
      }

      const visibleBlResources = blResources.filter((resource) => resource.mesh.visible);
      const visibleRoiResources = Array.from(roiLinesRef.current.values()).filter((resource) => resource.line.visible);

      if (visibleRoiResources.length === 0) {
        return;
      }

      const { width, height, alphaTarget, prepassTarget } = ensureRoiRenderTargets(renderer);
      const { prepassLine, compositeLine } = helperBundle;
      const previousRenderTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      const previousClearColor = new THREE.Color();
      renderer.getClearColor(previousClearColor);
      const previousClearAlpha = renderer.getClearAlpha();

      for (const roiResource of visibleRoiResources) {
        const prepassMaterial = prepassLine.material as LineMaterial;
        prepassMaterial.color.copy(roiResource.material.color);
        prepassMaterial.opacity = roiResource.material.opacity;
        prepassMaterial.linewidth = roiResource.material.linewidth;
        prepassMaterial.resolution.set(width, height);
        prepassLine.geometry = roiResource.geometry;
        prepassLine.matrix.copy(roiResource.line.matrixWorld);
        prepassLine.matrixWorld.copy(roiResource.line.matrixWorld);
        prepassLine.matrixWorldNeedsUpdate = false;
        prepassLine.visible = true;

        renderer.setRenderTarget(prepassTarget);
        renderer.autoClear = true;
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, true, true);
        renderer.render(roiPrepassSceneRef.current!, camera);

        if (visibleBlResources.length > 0) {
          for (const resource of visibleBlResources) {
            const uniforms = (resource.roiBlOcclusionAlphaMesh!.material as THREE.ShaderMaterial).uniforms as Record<string, { value: unknown }>;
            if (uniforms.u_roiOcclusionDepthTexture) {
              uniforms.u_roiOcclusionDepthTexture.value = prepassTarget.texture;
            }
            if (uniforms.u_roiOcclusionViewport) {
              (uniforms.u_roiOcclusionViewport.value as THREE.Vector2).set(width, height);
            }
          }

          renderer.setRenderTarget(alphaTarget);
          renderer.autoClear = true;
          renderer.setClearColor(0xffffff, 1);
          renderer.clear(true, true, true);
          renderer.render(alphaScene, camera);
        }

        const compositeMaterial = roiCompositeLineMaterialRef.current!;
        compositeMaterial.color.copy(roiResource.material.color);
        compositeMaterial.opacity = roiResource.material.opacity;
        compositeMaterial.linewidth = roiResource.material.linewidth;
        compositeMaterial.resolution.set(width, height);
        roiCompositeUniformsRef.current.enabled.value = visibleBlResources.length > 0 ? 1 : 0;
        roiCompositeUniformsRef.current.transmittanceTexture.value =
          visibleBlResources.length > 0 ? alphaTarget.texture : ROI_TRANSMITTANCE_FALLBACK_TEXTURE;
        compositeLine.geometry = roiResource.geometry;
        compositeLine.matrix.copy(roiResource.line.matrixWorld);
        compositeLine.matrixWorld.copy(roiResource.line.matrixWorld);
        compositeLine.matrixWorldNeedsUpdate = false;
        compositeLine.visible = true;

        renderer.setRenderTarget(previousRenderTarget);
        renderer.autoClear = false;
        renderer.render(roiCompositeSceneRef.current!, camera);
      }

      renderer.setRenderTarget(previousRenderTarget);
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(previousClearColor, previousClearAlpha);

      prepassLine.visible = false;
      compositeLine.visible = false;
      roiCompositeUniformsRef.current.enabled.value = 0;
    },
    [ensureRoiPrepassHelpers, ensureRoiRenderTargets, resourcesRef, roiLinesRef]
  );

  const { computeFollowedVoxelPosition, resolveHoveredFollowTarget } = useVolumeViewerFollowTarget({
    layersRef,
    volumeRootGroupRef,
    hoveredVoxelRef,
  });

  const vrBridgeOptions = buildVolumeViewerVrBridgeOptions({
    vr,
    refs: {
      containerRef,
      rendererRef,
      cameraRef: cameraRef as unknown as MutableRefObject<THREE.PerspectiveCamera | null>,
      controlsRef,
      sceneRef,
      volumeRootGroupRef,
      currentDimensionsRef,
      volumeRootBaseOffsetRef,
      volumeRootCenterOffsetRef,
      volumeRootCenterUnscaledRef,
      volumeRootHalfExtentsRef,
      volumeNormalizationScaleRef,
      volumeAnisotropyScaleRef,
      volumeUserScaleRef,
      volumeRootRotatedCenterTempRef,
      volumeStepScaleRef,
      volumeYawRef,
      volumePitchRef,
      trackGroupRef,
      resourcesRef,
      timeIndexRef,
      movementStateRef,
      trackLinesRef,
      followTargetOffsetRef,
      hasActive3DLayerRef,
    },
    playbackState,
    vrState: {
      isVrPassthroughSupported,
      channelPanels,
      activeChannelPanelId,
      trackChannels,
      activeTrackChannelId,
    },
    trackState: {
      tracks: vr?.isVrActive ? tracks : [],
      trackSetStates,
      trackOpacityByTrackSet,
      trackLineWidthByTrackSet,
      trackColorModesByTrackSet,
      selectedTrackIds,
      followedTrackId,
    },
    callbacks: {
      updateHoverState,
      clearHoverState,
      onResetVolume: requestVolumeReset,
      onResetHudPlacement: requestHudPlacementReset,
      onTrackFollowRequest: handleTrackFollowRequest,
      vrLog,
        onAfterSessionEnd: handleResize,
    },
  });
  const { vrApi, vrParams, vrIntegration, setVrIntegration } = useVolumeViewerVrBridge(vrBridgeOptions);
  const {
    callOnRegisterVrSession,
    requestVrSession,
    endVrSession,
    vrPlaybackHudRef,
    vrChannelsHudRef,
    vrTracksHudRef,
    vrPlaybackHudPlacementRef,
    vrChannelsHudPlacementRef,
    vrTracksHudPlacementRef,
    vrTranslationHandleRef,
    vrVolumeScaleHandleRef,
    vrVolumeYawHandlesRef,
    vrVolumePitchHandleRef,
    playbackStateRef,
    playbackLoopRef,
    vrHoverStateRef,
    controllersRef,
    setControllerVisibility,
    raycasterRef,
    xrSessionRef,
    sessionCleanupRef,
    applyVrPlaybackHoverState,
    updateVrPlaybackHud,
    createVrPlaybackHud,
    createVrChannelsHud,
    createVrTracksHud,
    updateVrChannelsHud,
    updateVrTracksHud,
    updateVolumeHandles,
    updateHudGroupFromPlacement,
    resetVrPlaybackHudPlacement,
    resetVrChannelsHudPlacement,
    resetVrTracksHudPlacement,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    restoreVrFoveation,
    onRendererInitialized,
    endVrSessionRequestRef,
    updateControllerRays,
  } = vrApi;

  useEffect(() => {
    registerPlaybackRefs({
      playbackStateRef,
      playbackLoopRef,
      vrHoverStateRef,
      updateVrPlaybackHud,
      vrIntegration,
    });
  }, [
    playbackLoopRef,
    playbackStateRef,
    registerPlaybackRefs,
    updateVrPlaybackHud,
    vrHoverStateRef,
    vrIntegration,
  ]);
  const { handleContainerRef } = useVolumeViewerSurfaceBinding({
    containerRef,
    containerNode,
    setContainerNode,
    onRegisterCaptureTarget,
    setHoverNotReady,
    hasActive3DLayer,
    hasActive3DLayerRef,
    updateVolumeHandles,
  });
  const { performPropHitTest, resolvePropDragPosition, refreshWorldProps } = useViewerPropsRendering({
    viewerPropsConfig,
    renderContextRevision,
    volumeRootGroupRef,
    rendererRef,
    cameraRef,
    hoverRaycasterRef,
  });
  const { getPlaybackWarmupStatus } = useVolumeViewerResources({
    layers,
    timeIndex: clampedTimeIndex,
    playbackWarmupLayers,
    playbackWarmupFrames,
    primaryVolume,
    isAdditiveBlending,
    zClipFrontFraction,
    projectionMode,
    renderContextRevision,
    rendererRef,
    sceneRef,
    cameraRef,
    controlsRef,
    rotationTargetRef,
    defaultViewStateRef,
    projectionViewStateRef,
    trackGroupRef,
    roiBlOcclusionAlphaSceneRef,
    roiBlOcclusionDepthSceneRef,
    resourcesRef,
    currentDimensionsRef,
    colormapCacheRef,
    volumeRootGroupRef,
    volumeRootBaseOffsetRef,
    volumeRootCenterOffsetRef,
    volumeRootCenterUnscaledRef,
    volumeRootHalfExtentsRef,
    volumeNormalizationScaleRef,
    volumeUserScaleRef,
    volumeStepScaleRef,
    volumeYawRef,
    volumePitchRef,
    volumeRootRotatedCenterTempRef,
    applyTrackGroupTransform,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    applyHoverHighlightToResources,
  });
  useEffect(() => {
    getPlaybackWarmupStatusRef.current = getPlaybackWarmupStatus;
  }, [getPlaybackWarmupStatus]);
  useEffect(() => {
    if (!isPlaybackStartPending || playbackDisabled) {
      return;
    }
    const startupStartedAt = playbackStartupBufferStartedAtRef.current ?? Date.now();
    playbackStartupBufferStartedAtRef.current = startupStartedAt;
    const requiredLayerKeys = playbackRequiredLayerKeys;
    if (requiredLayerKeys.length === 0 || playbackBufferFrames <= 0) {
      playbackStartupBufferStartedAtRef.current = null;
      onBufferedPlaybackStart?.();
      return;
    }

    const startupGateFrameCount = Math.min(1, playbackBufferFrames);
    const targetIndices: number[] = [];
    let candidate = clampedTimeIndex;
    const seen = new Set<number>([clampedTimeIndex]);
    for (let bufferIndex = 0; bufferIndex < startupGateFrameCount; bufferIndex += 1) {
      candidate = computeLoopedNextTimeIndex(candidate, totalTimepoints, playbackWindow);
      if (seen.has(candidate)) {
        break;
      }
      seen.add(candidate);
      targetIndices.push(candidate);
    }

    const warmupStatuses = targetIndices.map((timeIndex) =>
      getPlaybackWarmupStatusRef.current(timeIndex, requiredLayerKeys)
    );
    if (warmupStatuses.every((status) => status === 'ready')) {
      playbackStartupBufferStartedAtRef.current = null;
      onBufferedPlaybackStart?.();
      return;
    }

    const waitMs = resolvePlaybackWarmupGateWaitMs(fps);
    const elapsedMs = Math.max(0, Date.now() - startupStartedAt);
    if (elapsedMs >= waitMs) {
      playbackStartupBufferStartedAtRef.current = null;
      onBufferedPlaybackStart?.();
      return;
    }

    const timeout = window.setTimeout(() => {
      playbackStartupBufferStartedAtRef.current = null;
      onBufferedPlaybackStart?.();
    }, Math.max(0, waitMs - elapsedMs));
    return () => window.clearTimeout(timeout);
  }, [
    clampedTimeIndex,
    fps,
    getPlaybackWarmupStatus,
    isPlaying,
    isPlaybackStartPending,
    onBufferedPlaybackStart,
    playbackBufferFrames,
    playbackDisabled,
    playbackRequiredLayerKeys,
    playbackWarmupFrames,
    playbackWindow,
    totalTimepoints,
  ]);
  const {
    updateVoxelHover,
    resetHoverState,
    markHoverInitializationFailed,
    markHoverInitialized,
    teardownHover,
  } = useVolumeHover({
    layersRef,
    resourcesRef,
    hoverRaycasterRef,
    volumeRootGroupRef,
    volumeStepScaleRef,
    hoveredVoxelRef,
    rendererRef,
    cameraRef,
    applyHoverHighlightToResources,
    emitHoverVoxel,
    clearVoxelHover,
    reportVoxelHoverAbort,
    clearVoxelHoverDebug,
    setHoverNotReady,
    isAdditiveBlending,
    zClipFrontFraction,
    hoverSettings: resolvedHoverSettings,
  });
  useVolumeViewerResets({
    projectionMode,
    rendererRef,
    cameraRef,
    controlsRef,
    defaultViewStateRef,
    projectionViewStateRef,
    rotationTargetRef,
    currentDimensionsRef,
    volumeRootBaseOffsetRef,
    volumeYawRef,
    volumePitchRef,
    volumeUserScaleRef,
    volumeStepScaleBaseRef,
    volumeStepScaleRatioRef,
    volumeStepScaleRef,
    resetVolumeCallbackRef,
    resetHudPlacementCallbackRef,
    applyVolumeRootTransform,
    applyVolumeStepScaleToResources,
    resetVrPlaybackHudPlacement,
    resetVrChannelsHudPlacement,
    resetVrTracksHudPlacement,
    onRegisterVolumeStepScaleChange,
    onRegisterReset,
    hasRenderableLayer,
  });
  const {
    applyVolumeRootTransformRef,
    applyTrackGroupTransformRef,
    refreshVrHudPlacementsRef,
  } = useVolumeViewerTransformBindings({
    updateHudGroupFromPlacement,
    vrPlaybackHudRef,
    vrChannelsHudRef,
    vrTracksHudRef,
    vrPlaybackHudPlacementRef,
    vrChannelsHudPlacementRef,
    vrTracksHudPlacementRef,
    applyVolumeRootTransform,
    applyTrackGroupTransform,
    currentDimensionsRef,
    applyVolumeStepScaleToResources,
    volumeStepScaleRef,
    anisotropyStepRatio,
    resolvedAnisotropyScale,
  });

  useEffect(() => {
    const backgroundScene = backgroundPassSceneRef.current;
    if (!backgroundScene) {
      return undefined;
    }

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms: backgroundPassUniformsRef.current,
      vertexShader: `
        varying vec2 v_ndc;

        void main() {
          v_ndc = position.xy;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        uniform mat4 projectionInverse;
        uniform mat4 cameraWorldMatrix;
        uniform vec3 cameraWorldPosition;
        uniform mat4 volumeRootWorldInverse;
        uniform vec3 planePointWorld;
        uniform vec3 planeNormalWorld;
        uniform vec3 floorColor;
        uniform vec3 gridColor;
        uniform float gridSpacing;
        uniform float gridStrength;
        uniform vec2 gridOriginOffset;
        uniform vec3 farGridColor;
        uniform float farGridSpacing;
        uniform float farGridStrength;
        uniform vec2 farGridOriginOffset;

        varying vec2 v_ndc;

        float grid_band_visibility(vec2 coords, float spacing) {
          vec2 cell = coords / max(spacing, 1e-6);
          vec2 cellDerivatives = fwidth(cell);
          float cellsPerPixel = max(cellDerivatives.x, cellDerivatives.y);
          return 1.0 - smoothstep(0.35, 1.0, cellsPerPixel);
        }

        float grid_line_mask(vec2 coords, float spacing, float lineWidth) {
          vec2 cell = coords / max(spacing, 1e-6);
          vec2 distanceToLine = abs(fract(cell - 0.5) - 0.5);
          vec2 aa = max(fwidth(cell), vec2(1e-4));
          vec2 mask = 1.0 - smoothstep(vec2(lineWidth) - aa, vec2(lineWidth) + aa, distanceToLine);
          return max(mask.x, mask.y);
        }

        void main() {
          vec4 viewFar = projectionInverse * vec4(v_ndc, 1.0, 1.0);
          viewFar /= max(viewFar.w, 1e-6);
          vec3 worldFar = (cameraWorldMatrix * vec4(viewFar.xyz, 1.0)).xyz;
          vec3 rayDirection = normalize(worldFar - cameraWorldPosition);
          float denominator = dot(rayDirection, planeNormalWorld);
          if (abs(denominator) < 1e-5) {
            discard;
          }
          float t = dot(planePointWorld - cameraWorldPosition, planeNormalWorld) / denominator;
          if (t <= 0.0) {
            discard;
          }
          vec3 hitWorld = cameraWorldPosition + rayDirection * t;
          vec3 hitLocal = (volumeRootWorldInverse * vec4(hitWorld, 1.0)).xyz;
          vec2 nearGridCoords = hitLocal.xz - gridOriginOffset;
          vec2 farGridCoords = hitLocal.xz - farGridOriginOffset;
          float nearVisibility = grid_band_visibility(nearGridCoords, gridSpacing);
          float farVisibility = grid_band_visibility(farGridCoords, farGridSpacing);
          float nearGridMask = grid_line_mask(nearGridCoords, gridSpacing, 0.045) * nearVisibility * gridStrength;
          float farGridMask = grid_line_mask(farGridCoords, farGridSpacing, 0.05) *
            farVisibility *
            (1.0 - nearVisibility) *
            farGridStrength;
          vec3 color = mix(floorColor, farGridColor, clamp(farGridMask, 0.0, 1.0));
          color = mix(color, gridColor, clamp(nearGridMask, 0.0, 1.0));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
    });
    material.extensions = { ...material.extensions, clipCullDistance: false };
    (material.extensions as { derivatives?: boolean }).derivatives = true;
    material.toneMapped = false;
    material.name = BACKGROUND_FLOOR_SHADER_KEY;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    backgroundScene.add(mesh);
    backgroundPassMeshRef.current = mesh;

    return () => {
      if (backgroundPassMeshRef.current === mesh) {
        backgroundPassMeshRef.current = null;
      }
      backgroundScene.remove(mesh);
      geometry.dispose();
      material.dispose();
    };
  }, [renderContextRevision]);

  const updateCameraFrustum = useCallback((camera: DesktopViewerCamera | null) => {
    if (!camera) {
      return;
    }
    const bounds = resolveSceneWorldBounds(currentDimensionsRef.current, volumeRootGroupRef.current);
    if (!bounds) {
      return;
    }
    const { near, far } = resolveAdaptiveCameraFrustum(camera, bounds);
    if (Math.abs(camera.near - near) <= 1e-6 && Math.abs(camera.far - far) <= 1e-4) {
      return;
    }
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }, [currentDimensionsRef, volumeRootGroupRef]);

  const renderBackgroundPass = useCallback((renderer: THREE.WebGLRenderer, camera: DesktopViewerCamera | null) => {
    renderer.clear(true, true, true);

    if (
      !camera ||
      !(camera instanceof THREE.PerspectiveCamera) ||
      projectionMode !== 'perspective' ||
      !background?.floorEnabled ||
      !hasActive3DLayer ||
      !backgroundReferenceDimensions
    ) {
      return;
    }

    const backgroundScene = backgroundPassSceneRef.current;
    const backgroundMesh = backgroundPassMeshRef.current;
    const volumeRootGroup = volumeRootGroupRef.current;
    if (!backgroundScene || !backgroundMesh || !volumeRootGroup) {
      return;
    }

    camera.updateMatrixWorld(true);
    const { width, height, depth } = backgroundReferenceDimensions;
    const maxDimension = Math.max(width, height, depth, 1);
    const floorGap = Math.max(1, maxDimension * 0.03);
    const floorY = height - 0.5 + floorGap;
    const planePointLocal = backgroundPassPlanePointLocalRef.current.set(width / 2 - 0.5, floorY, depth / 2 - 0.5);
    volumeRootGroup.updateMatrixWorld(true);
    const planePointWorld = volumeRootGroup.localToWorld(backgroundPassPlanePointWorldRef.current.copy(planePointLocal));
    const planeNormalWorld = backgroundPassPlaneNormalWorldRef.current.set(0, 1, 0).transformDirection(volumeRootGroup.matrixWorld).normalize();

    const uniforms = backgroundPassUniformsRef.current;
    const gridStyle = resolveBackgroundGridStyle({
      floorColor: background.floorColor,
      maxDimension,
    });
    const safeGridSpacing = Math.max(gridStyle.gridSpacing, 1e-6);
    const safeFarGridSpacing = Math.max(gridStyle.farGridSpacing, 1e-6);
    uniforms.volumeRootWorldInverse.value.copy(volumeRootGroup.matrixWorld).invert();
    uniforms.planePointWorld.value.copy(planePointWorld);
    uniforms.planeNormalWorld.value.copy(planeNormalWorld);
    uniforms.floorColor.value.set(background.floorColor);
    uniforms.gridColor.value.set(gridStyle.gridColor);
    uniforms.gridSpacing.value = gridStyle.gridSpacing;
    uniforms.gridStrength.value = gridStyle.gridLineStrength;
    uniforms.farGridColor.value.set(gridStyle.farGridColor);
    uniforms.farGridSpacing.value = gridStyle.farGridSpacing;
    uniforms.farGridStrength.value = gridStyle.farGridLineStrength;

    backgroundMesh.onBeforeRender = (_renderer, _scene, renderCamera) => {
      const renderCameraPosition = backgroundPassCameraLocalRef.current.setFromMatrixPosition(renderCamera.matrixWorld);
      const cameraLocalPosition = volumeRootGroup.worldToLocal(renderCameraPosition);
      uniforms.gridOriginOffset.value.set(
        Math.floor(cameraLocalPosition.x / safeGridSpacing) * safeGridSpacing,
        Math.floor(cameraLocalPosition.z / safeGridSpacing) * safeGridSpacing,
      );
      uniforms.farGridOriginOffset.value.set(
        Math.floor(cameraLocalPosition.x / safeFarGridSpacing) * safeFarGridSpacing,
        Math.floor(cameraLocalPosition.z / safeFarGridSpacing) * safeFarGridSpacing,
      );
      uniforms.projectionInverse.value.copy(renderCamera.projectionMatrixInverse);
      uniforms.cameraWorldMatrix.value.copy(renderCamera.matrixWorld);
      uniforms.cameraWorldPosition.value.setFromMatrixPosition(renderCamera.matrixWorld);
    };

    renderer.render(backgroundScene, camera);
  }, [
    background?.floorColor,
    background?.floorEnabled,
    backgroundReferenceDimensions,
    hasActive3DLayer,
    projectionMode,
    volumeRootGroupRef,
  ]);

  const captureVolumeScreenshot = useCallback(async (): Promise<Blob | null> => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera || renderer.xr?.isPresenting) {
      return null;
    }

    const bufferSize = new THREE.Vector2();
    renderer.getDrawingBufferSize(bufferSize);
    const width = Math.max(1, Math.floor(bufferSize.x));
    const height = Math.max(1, Math.floor(bufferSize.y));
    const renderTarget = ensureScreenshotRenderTarget(screenshotRenderTargetRef, renderer, width, height);
    const readbackBuffer = ensureScreenshotReadbackBuffer(screenshotReadbackBufferRef, width, height);
    const screenshotCanvasResource = ensureScreenshotCanvasResource(
      screenshotCanvasResourceRef,
      width,
      height,
    );
    if (!screenshotCanvasResource) {
      return null;
    }

    const previousRenderTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousClearColor = new THREE.Color();
    renderer.getClearColor(previousClearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    const roiGroup = roiGroupRef.current;
    const previousRoiVisibility = roiGroup?.visible ?? false;

    const captureTimestamp =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? performance.now()
        : Date.now();

    try {
      updateOverlayAppearance(captureTimestamp);
      refreshWorldProps();
      updateCameraFrustum(camera);

      renderer.setRenderTarget(renderTarget);
      renderer.autoClear = false;
      renderBackgroundPass(renderer, camera);

      if (roiGroup) {
        roiGroup.visible = false;
      }
      renderer.render(scene, camera);
      if (roiGroup) {
        roiGroup.visible = previousRoiVisibility;
      }

      renderRoiBlOcclusionPass(renderer, camera);

      renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, readbackBuffer);
      copyRenderTargetPixelsToImageData(
        readbackBuffer,
        screenshotCanvasResource.imageData,
        width,
        height,
      );
      screenshotCanvasResource.context.putImageData(screenshotCanvasResource.imageData, 0, 0);
      return captureCanvasPng(screenshotCanvasResource.canvas);
    } finally {
      if (roiGroup) {
        roiGroup.visible = previousRoiVisibility;
      }
      renderer.setRenderTarget(previousRenderTarget);
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(previousClearColor, previousClearAlpha);
    }
  }, [
    refreshWorldProps,
    renderRoiBlOcclusionPass,
    renderBackgroundPass,
    rendererRef,
    roiGroupRef,
    sceneRef,
    cameraRef,
    updateCameraFrustum,
    updateOverlayAppearance,
  ]);
  useEffect(() => {
    onRegisterCaptureTarget?.(() => {
      const renderer = rendererRef.current;
      if (!renderer) {
        return null;
      }
      const target: VolumeViewerCaptureTarget = {
        canvas: renderer.domElement,
        captureImage: captureVolumeScreenshot,
      };
      return target;
    });

    return () => {
      onRegisterCaptureTarget?.(null);
    };
  }, [captureVolumeScreenshot, onRegisterCaptureTarget, renderContextRevision, rendererRef]);

  const lifecycleParams = buildVolumeViewerLifecycleParams({
    core: {
      containerNode,
      onRegisterCaptureTarget,
      initializeRenderContext,
      createPointerLookHandlers,
      handleResize,
    },
    renderLoop: {
      applyKeyboardRotation,
      applyKeyboardMovement,
      updateTrackAppearance: updateOverlayAppearance,
      renderRoiBlOcclusionPass,
      refreshViewerProps: refreshWorldProps,
      updateCameraFrustum,
      renderBackgroundPass,
      advancePlaybackFrame,
      updateControllerRays,
      controllersRef,
      vrLog,
      followTargetActiveRef,
      followTargetOffsetRef,
      resourcesRef,
      onCameraNavigationSample,
      emitCameraWindowState: captureCameraWindowState,
      onCameraWindowStateChange,
      rotationTargetRef,
      refreshVrHudPlacementsRef,
      currentDimensionsRef,
      rendererRef,
      sceneRef,
      cameraRef,
      controlsRef,
      raycasterRef,
      volumeRootGroupRef,
      trackGroupRef,
      roiGroupRef,
      applyVolumeRootTransformRef,
      applyTrackGroupTransformRef,
      preservedViewStateRef,
      currentProjectionModeRef,
      setRenderContextRevision,
      refreshTrackOverlay,
    },
    interaction: {
      layersRef,
      paintbrushRef,
      paintStrokePointerIdRef,
      hoverIntensityRef,
      followedTrackIdRef,
      updateVoxelHover,
      isRoiDrawToolActiveRef: isDrawToolActiveRef,
      isRoiDrawPreviewActiveRef: isDrawPreviewActiveRef,
      isRoiMoveInteractionActiveRef,
      isRoiMoveActiveRef,
      handleRoiPointerDown,
      handleRoiPointerMove,
      handleRoiPointerUp,
      handleRoiPointerLeave,
      performRoiHitTest,
      performPropHitTest,
      resolveWorldPropDragPosition: resolvePropDragPosition,
      performHoverHitTest,
      clearHoverState,
      clearVoxelHover,
      resolveHoveredFollowTarget,
      onPropSelect: viewerPropsConfig?.onSelectProp ?? (() => {}),
      onWorldPropPositionChange: viewerPropsConfig?.onUpdateWorldPosition ?? (() => {}),
      onTrackSelectionToggle,
      onVoxelFollowRequest,
    },
    hoverLifecycle: {
      resetHoverState,
      markHoverInitializationFailed,
      markHoverInitialized,
      teardownHover,
      setHoverNotReady,
    },
    vrLifecycle: {
      restoreVrFoveation,
      applyVolumeStepScaleToResources,
      setControllerVisibility,
      xrSessionRef,
      sessionCleanupRef,
      endVrSessionRequestRef,
      applyVrPlaybackHoverState,
      createVrPlaybackHud,
      createVrChannelsHud,
      createVrTracksHud,
      vrPlaybackHudRef,
      vrChannelsHudRef,
      vrTracksHudRef,
      vrPlaybackHudPlacementRef,
      vrChannelsHudPlacementRef,
      vrTracksHudPlacementRef,
      resetVrPlaybackHudPlacement,
      resetVrChannelsHudPlacement,
      resetVrTracksHudPlacement,
      updateVrPlaybackHud,
      updateVrChannelsHud,
      updateVrTracksHud,
      onRendererInitialized,
      vrTranslationHandleRef,
      vrVolumeScaleHandleRef,
      vrVolumeYawHandlesRef,
      vrVolumePitchHandleRef,
      disposeTrackResources,
      disposeRoiResources,
    },
  });
  useVolumeViewerLifecycle(lifecycleParams);

  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!renderer || !scene) {
      return;
    }

    scene.background = null;

    if (isDesktopBackgroundDisabled || !background?.clearColor || !background.surfaceColor) {
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.background = 'transparent';
      return;
    }

    renderer.setClearColor(background.clearColor, 1);
    renderer.domElement.style.background = background.surfaceColor;
  }, [
    background,
    isDesktopBackgroundDisabled,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !import.meta.env?.DEV) {
      return;
    }

    const captureRoiOcclusionMetrics = () => {
      const renderer = rendererRef.current;
      const alphaTarget = roiBlOcclusionAlphaTargetRef.current;
      const prepassTarget = roiPrepassTargetRef.current;
      if (!renderer || !alphaTarget || !prepassTarget) {
        return null;
      }

      const width = alphaTarget.width;
      const height = alphaTarget.height;
      const alphaPixels = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(alphaTarget, 0, 0, width, height, alphaPixels);

      let alphaNonWhite = 0;
      for (let offset = 0; offset < alphaPixels.length; offset += 4) {
        const r = alphaPixels[offset] ?? 255;
        if (r < 250) {
          alphaNonWhite += 1;
        }
      }

      const prepassPixels = new Float32Array(prepassTarget.width * prepassTarget.height * 4);
      renderer.readRenderTargetPixels(
        prepassTarget,
        0,
        0,
        prepassTarget.width,
        prepassTarget.height,
        prepassPixels
      );
      let prepassNonBlack = 0;
      let sampleX = -1;
      let sampleY = -1;
      let sampleDepthValue = 0;
      for (let offset = 0; offset < prepassPixels.length; offset += 4) {
        const r = prepassPixels[offset] ?? 0;
        const g = prepassPixels[offset + 1] ?? 0;
        const b = prepassPixels[offset + 2] ?? 0;
        const a = prepassPixels[offset + 3] ?? 0;
        if (r > 1e-5 || g > 1e-5 || b > 1e-5 || a > 1e-5) {
          prepassNonBlack += 1;
          if (sampleX < 0) {
            const pixelIndex = Math.floor(offset / 4);
            sampleX = pixelIndex % prepassTarget.width;
            sampleY = Math.floor(pixelIndex / prepassTarget.width);
            sampleDepthValue = r;
          }
        }
      }

      let sampledTransmittance = 0;
      if (sampleX >= 0 && sampleY >= 0) {
        const sampleOffset = (sampleY * width + sampleX) * 4;
        sampledTransmittance = alphaPixels[sampleOffset] ?? 0;
      }

      return {
        width,
        height,
        alphaNonWhite,
        prepassNonBlack,
        sampleX,
        sampleY,
        sampleDepthValue,
        sampledTransmittance,
      };
    };

    (window as Window & { __LLSM_CAPTURE_ROI_OCCLUSION_METRICS__?: (() => unknown) | null }).__LLSM_CAPTURE_ROI_OCCLUSION_METRICS__ =
      captureRoiOcclusionMetrics;

    return () => {
      const target = window as Window & { __LLSM_CAPTURE_ROI_OCCLUSION_METRICS__?: (() => unknown) | null };
      if (target.__LLSM_CAPTURE_ROI_OCCLUSION_METRICS__ === captureRoiOcclusionMetrics) {
        delete target.__LLSM_CAPTURE_ROI_OCCLUSION_METRICS__;
      }
    };
  }, [rendererRef]);

  useEffect(() => {
    return () => {
      emitHoverVoxel(null);
      screenshotRenderTargetRef.current?.dispose();
      screenshotRenderTargetRef.current = null;
      screenshotReadbackBufferRef.current = null;
      screenshotCanvasResourceRef.current = null;
      roiBlOcclusionAlphaTargetRef.current?.dispose();
      roiBlOcclusionDepthTargetRef.current?.dispose();
      roiPrepassTargetRef.current?.dispose();
    };
  }, [emitHoverVoxel]);

  return (
    <div className="volume-viewer">
      <TrackCameraPresenter
        followedTrackId={followedTrackId}
        followedVoxel={followedVoxel}
        clampedTimeIndex={clampedTimeIndex}
        computeTrackCentroid={computeTrackCentroid}
        computeVoxelWorldPosition={computeFollowedVoxelPosition}
        movementStateRef={movementStateRef}
        controlsRef={controlsRef}
        cameraRef={cameraRef}
        rotationTargetRef={rotationTargetRef}
        followTargetOffsetRef={followTargetOffsetRef}
        previousFollowTargetKeyRef={previousFollowTargetKeyRef}
        endPointerLookRef={endPointerLookRef}
        rotationLocked={rotationLocked}
      />
      <VolumeViewerVrAdapter
        vrParams={vrParams}
        onRegisterVrSession={onRegisterVrSession}
        setVrIntegration={setVrIntegration}
        callOnRegisterVrSession={callOnRegisterVrSession}
        requestVrSession={requestVrSession}
        endVrSession={endVrSession}
      />
      <section className="viewer-surface" style={viewerSurfaceBackgroundStyle}>
        <LoadingOverlay visible={showLoadingOverlay} />
        <div
          className={`render-surface${hasMeasured ? ' is-ready' : ''}`}
          ref={handleContainerRef}
          style={viewerSurfaceBackgroundStyle}
        >
          <ViewerPropsOverlay surfaceNode={containerNode} viewerPropsConfig={viewerPropsConfig} />
          <TrackTooltip label={hoveredTrackLabel} position={tooltipPosition} />
          <HoverDebug message={isDevMode ? voxelHoverDebug : null} />
        </div>
        {isDiagnosticsWindowOpen && runtimeDiagnostics ? (
          <FloatingWindow
            title="Diagnostics"
            className="floating-window--runtime-diagnostics"
            bodyClassName="runtime-diagnostics-window"
            width={RUNTIME_DIAGNOSTICS_WINDOW_WIDTH}
            initialPosition={runtimeDiagnosticsWindowInitialPosition}
            resetSignal={windowResetSignal}
            onClose={onCloseDiagnosticsWindow}
          >
            <ul className="runtime-diagnostics-list">
              <li className="runtime-diagnostics-item">
                <span className="runtime-diagnostics-label">Cache pressure</span>
                <span className="runtime-diagnostics-value">
                  V {formatPercentage(runtimeDiagnostics.cachePressure.volume)} / C{' '}
                  {formatPercentage(runtimeDiagnostics.cachePressure.chunk)}
                </span>
              </li>
              <li className="runtime-diagnostics-item">
                <span className="runtime-diagnostics-label">Miss rate</span>
                <span className="runtime-diagnostics-value">
                  V {formatPercentage(runtimeDiagnostics.missRates.volume)} / C{' '}
                  {formatPercentage(runtimeDiagnostics.missRates.chunk)}
                </span>
              </li>
              <li className="runtime-diagnostics-item">
                <span className="runtime-diagnostics-label">Residency</span>
                <span className="runtime-diagnostics-value">
                  Vol {runtimeDiagnostics.residency.cachedVolumes} +{runtimeDiagnostics.residency.inFlightVolumes} / Ch{' '}
                  {runtimeDiagnostics.residency.cachedChunks} +{runtimeDiagnostics.residency.inFlightChunks}
                </span>
              </li>
              <li className="runtime-diagnostics-item">
                <span className="runtime-diagnostics-label">Chunk bytes</span>
                <span className="runtime-diagnostics-value">
                  {formatChunkBytesAsMb(runtimeDiagnostics.residency.chunkBytes)}
                </span>
              </li>
              <li className="runtime-diagnostics-item">
                <span className="runtime-diagnostics-label">Prefetch</span>
                <span className="runtime-diagnostics-value">
                  {runtimeDiagnostics.activePrefetchRequests.length} active
                </span>
              </li>
              {lodPolicyDiagnostics ? (
                <li className="runtime-diagnostics-item">
                  <span className="runtime-diagnostics-label">LOD policy</span>
                  <span className="runtime-diagnostics-value">
                    {lodPolicyDiagnostics.promotedLayers}/{lodPolicyDiagnostics.layerCount} promoted,{' '}
                    {lodPolicyDiagnostics.warmingLayers} warming
                  </span>
                </li>
              ) : null}
              {lodPolicyDiagnostics ? (
                <li className="runtime-diagnostics-item">
                  <span className="runtime-diagnostics-label">LOD thrash</span>
                  <span className="runtime-diagnostics-value">
                    {lodPolicyDiagnostics.thrashEventsPerMinute.toFixed(2)} / min
                  </span>
                </li>
              ) : null}
              {lodPolicyDiagnostics?.adaptivePolicyDisabled ? (
                <li className="runtime-diagnostics-item">
                  <span className="runtime-diagnostics-label">LOD fallback</span>
                  <span className="runtime-diagnostics-value">adaptive selector auto-disabled</span>
                </li>
              ) : null}
              {residencyDecisionSummary ? (
                <li className="runtime-diagnostics-item">
                  <span className="runtime-diagnostics-label">Residency policy</span>
                  <span className="runtime-diagnostics-value">{residencyDecisionSummary}</span>
                </li>
              ) : null}
              {residencyRationaleSummary ? (
                <li className="runtime-diagnostics-item">
                  <span className="runtime-diagnostics-label">Residency reason</span>
                  <span className="runtime-diagnostics-value">{residencyRationaleSummary}</span>
                </li>
              ) : null}
              {gpuResidencySummary ? (
                <li className="runtime-diagnostics-item">
                  <span className="runtime-diagnostics-label">GPU bricks</span>
                  <span className="runtime-diagnostics-value">
                    {gpuResidencySummary.residentBricks}/{gpuResidencySummary.totalBricks} (
                    {gpuResidencySummary.layerCount} layers)
                  </span>
                </li>
              ) : null}
              {gpuResidencySummary ? (
                <li className="runtime-diagnostics-item">
                  <span className="runtime-diagnostics-label">GPU budget</span>
                  <span className="runtime-diagnostics-value">
                    {formatChunkBytesAsMb(gpuResidencySummary.residentBytes)} /{' '}
                    {formatChunkBytesAsMb(gpuResidencySummary.budgetBytes)}
                  </span>
                </li>
              ) : null}
              {gpuResidencySummary ? (
                <li className="runtime-diagnostics-item">
                  <span className="runtime-diagnostics-label">GPU scheduler</span>
                  <span className="runtime-diagnostics-value">
                    up {gpuResidencySummary.uploads} ev {gpuResidencySummary.evictions} p{' '}
                    {gpuResidencySummary.pendingBricks} / sched {gpuResidencySummary.scheduledUploads}
                  </span>
                </li>
              ) : null}
            </ul>
          </FloatingWindow>
        ) : null}
      </section>
    </div>
  );
}

export default VolumeViewer;
