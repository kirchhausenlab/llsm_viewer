import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../../../shared/colorMaps/layerColors';
import {
  createColormapTexture,
  disposeMaterial,
  getExpectedSliceBufferLength,
  prepareSliceTexture,
} from './rendering';
import { SliceRenderShader } from '../../../shaders/sliceRenderShader';
import { getVolumeRenderShaderVariantKey, VolumeRenderShaderVariants } from '../../../shaders/volumeRenderShader';
import { getCachedTextureData } from '../../../core/textureCache';
import type { NormalizedVolume } from '../../../core/volumeProcessing';
import type { VolumeResources } from '../VolumeViewer.types';
import { DESKTOP_VOLUME_STEP_SCALE } from './vr';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { VolumeBrickAtlas, VolumeBrickPageTable } from '../../../core/volumeProvider';
import {
  FALLBACK_BRICK_ATLAS_DATA_TEXTURE,
  FALLBACK_BRICK_ATLAS_INDEX_TEXTURE,
  FALLBACK_BRICK_MAX_TEXTURE,
  FALLBACK_BRICK_MIN_TEXTURE,
  FALLBACK_BRICK_OCCUPANCY_TEXTURE,
  FALLBACK_SEGMENTATION_LABEL_TEXTURE,
} from './fallbackTextures';
import { RENDER_STYLE_SLICED, type LayerSettings } from '../../../state/layerSettings';

type UseVolumeResourcesParams = {
  layers: import('../VolumeViewer.types').VolumeViewerProps['layers'];
  primaryVolume: NormalizedVolume | null;
  isAdditiveBlending: boolean;
  renderContextRevision: number;
  rendererRef?: MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  rotationTargetRef: MutableRefObject<THREE.Vector3>;
  defaultViewStateRef: MutableRefObject<{ position: THREE.Vector3; target: THREE.Vector3 } | null>;
  trackGroupRef: MutableRefObject<THREE.Group | null>;
  resourcesRef?: MutableRefObject<Map<string, VolumeResources>>;
  currentDimensionsRef?: MutableRefObject<{ width: number; height: number; depth: number } | null>;
  colormapCacheRef?: MutableRefObject<Map<string, THREE.DataTexture>>;
  volumeRootGroupRef?: MutableRefObject<THREE.Group | null>;
  volumeRootBaseOffsetRef?: MutableRefObject<THREE.Vector3>;
  volumeRootCenterOffsetRef?: MutableRefObject<THREE.Vector3>;
  volumeRootCenterUnscaledRef?: MutableRefObject<THREE.Vector3>;
  volumeRootHalfExtentsRef?: MutableRefObject<THREE.Vector3>;
  volumeNormalizationScaleRef?: MutableRefObject<number>;
  volumeUserScaleRef?: MutableRefObject<number>;
  volumeStepScaleRef?: MutableRefObject<number>;
  volumeYawRef?: MutableRefObject<number>;
  volumePitchRef?: MutableRefObject<number>;
  volumeRootRotatedCenterTempRef?: MutableRefObject<THREE.Vector3>;
  applyTrackGroupTransform: (dimensions: { width: number; height: number; depth: number } | null) => void;
  applyVolumeRootTransform: (dimensions: { width: number; height: number; depth: number } | null) => void;
  applyVolumeStepScaleToResources: (stepScale: number) => void;
  applyHoverHighlightToResources: () => void;
};

type ShaderUniformMap = Record<string, { value: unknown }>;
type TextureFormat = THREE.Data3DTexture['format'];
type ByteTextureFilterMode = 'nearest' | 'linear';
type SlicePlaneVectorLike = {
  x: number;
  y: number;
  z: number;
};
type SlicePlaneLayerState = {
  renderStyle: number;
  slicedPlanePoint?: SlicePlaneVectorLike | null;
  slicedPlaneNormal?: SlicePlaneVectorLike | null;
  slicedPlaneEnabled?: boolean;
};
type BrickAtlasBuildResult = {
  data: Uint8Array;
  width: number;
  height: number;
  depth: number;
  textureFormat: TextureFormat;
  enabled: boolean;
};

type BrickResidencyState = {
  sourceToken: object | null;
  pageTable: VolumeBrickPageTable | null;
  textureFormat: TextureFormat | null;
  textureComponents: number;
  chunkWidth: number;
  chunkHeight: number;
  chunkDepth: number;
  slotCapacity: number;
  slotSourceIndices: Int32Array;
  sourceToSlot: Map<number, number>;
  sourceLastUsedTick: Map<number, number>;
  residentAtlasData: Uint8Array;
  residentAtlasIndices: Float32Array;
  tick: number;
  uploads: number;
  evictions: number;
  residentBytes: number;
  budgetBytes: number;
  lastCameraDistance: number | null;
  scaleLevel: number;
  bootstrapUpdatesRemaining: number;
};

type BrickResidencyMetrics = {
  layerKey: string;
  timepoint: number;
  scaleLevel: number;
  residentBricks: number;
  totalBricks: number;
  residentBytes: number;
  budgetBytes: number;
  uploads: number;
  evictions: number;
  pendingBricks: number;
  prioritizedBricks: number;
  scheduledUploads: number;
  lastCameraDistance: number | null;
};

type BrickSkipDiagnostics = {
  enabled: boolean;
  reason:
    | 'enabled'
    | 'disabled-by-config'
    | 'missing-page-table'
    | 'invalid-page-table'
    | 'occupied-bricks-missing-from-atlas'
    | 'invalid-min-max-range'
    | 'occupancy-metadata-mismatch';
  totalBricks: number;
  emptyBricks: number;
  occupiedBricks: number;
  occupiedBricksMissingFromAtlas: number;
  invalidRangeBricks: number;
  occupancyMetadataMismatchBricks: number;
};

function createDisabledBrickSkipDiagnostics(
  reason: BrickSkipDiagnostics['reason'],
  totalBricks = 0,
): BrickSkipDiagnostics {
  return {
    enabled: false,
    reason,
    totalBricks,
    emptyBricks: 0,
    occupiedBricks: 0,
    occupiedBricksMissingFromAtlas: 0,
    invalidRangeBricks: 0,
    occupancyMetadataMismatchBricks: 0
  };
}

const FALLBACK_VOLUME_TEXTURE_DATA = new Uint8Array([0]);
const DEFAULT_MAX_GPU_BRICK_BYTES = 48 * 1024 * 1024;
const AUTO_EXPANDED_MAX_GPU_BRICK_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_BRICK_UPLOADS_PER_UPDATE = 24;
const BOOTSTRAP_UPLOAD_BURST_UPDATES = 3;
const BOOTSTRAP_UPLOAD_BURST_MULTIPLIER = 8;
const BOOTSTRAP_UPLOAD_BURST_MAX = 256;
const CAMERA_RESIDENCY_EPSILON_SQ = 0.25;
const gpuBrickResidencyStateByResource = new WeakMap<VolumeResources, BrickResidencyState>();

const isSlicedRenderStyle = (renderStyle: number | undefined): boolean =>
  renderStyle === RENDER_STYLE_SLICED;

function resolveSamplingModeForRenderStyle(
  renderStyle: number | undefined,
  samplingMode: 'linear' | 'nearest',
): 'linear' | 'nearest' {
  return isSlicedRenderStyle(renderStyle) ? 'nearest' : samplingMode;
}

function resolveLayerAdditiveEnabled(
  isAdditiveBlending: boolean,
  renderStyle: number | undefined,
): boolean {
  if (!isAdditiveBlending) {
    return false;
  }
  return !isSlicedRenderStyle(renderStyle);
}

function resolveFiniteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function applySlicePlaneUniforms(
  uniforms: ShaderUniformMap,
  layer: SlicePlaneLayerState,
): void {
  if (!('u_slicePlanePoint' in uniforms) || !('u_slicePlaneNormal' in uniforms) || !('u_slicePlaneEnabled' in uniforms)) {
    return;
  }

  const pointUniform = uniforms.u_slicePlanePoint.value as THREE.Vector3;
  const normalUniform = uniforms.u_slicePlaneNormal.value as THREE.Vector3;
  const point = layer.slicedPlanePoint;
  const normal = layer.slicedPlaneNormal;

  pointUniform.set(
    resolveFiniteNumber(point?.x, 0),
    resolveFiniteNumber(point?.y, 0),
    resolveFiniteNumber(point?.z, 0),
  );
  normalUniform.set(
    resolveFiniteNumber(normal?.x, 0),
    resolveFiniteNumber(normal?.y, 0),
    resolveFiniteNumber(normal?.z, 1),
  );
  if (normalUniform.lengthSq() <= 1e-8) {
    normalUniform.set(0, 0, 1);
  } else {
    normalUniform.normalize();
  }

  const defaultEnabled = isSlicedRenderStyle(layer.renderStyle);
  const enabled = layer.slicedPlaneEnabled ?? defaultEnabled;
  uniforms.u_slicePlaneEnabled.value = enabled ? 1 : 0;
}

function applyVolumeMaterialRenderStyle(
  material: THREE.ShaderMaterial,
  renderStyle: number | undefined,
  blendingForTransparentStyles: THREE.Blending,
): void {
  const sliced = isSlicedRenderStyle(renderStyle);
  const desiredTransparent = !sliced;
  const desiredDepthWrite = sliced;
  const desiredDepthTest = true;
  const desiredBlending = sliced ? THREE.NormalBlending : blendingForTransparentStyles;
  let needsUpdate = false;

  if (material.transparent !== desiredTransparent) {
    material.transparent = desiredTransparent;
    needsUpdate = true;
  }
  if (material.depthWrite !== desiredDepthWrite) {
    material.depthWrite = desiredDepthWrite;
    needsUpdate = true;
  }
  if (material.depthTest !== desiredDepthTest) {
    material.depthTest = desiredDepthTest;
    needsUpdate = true;
  }
  if (material.blending !== desiredBlending) {
    material.blending = desiredBlending;
    needsUpdate = true;
  }
  if (needsUpdate) {
    material.needsUpdate = true;
  }
}

function assignVolumeMeshOnBeforeRender(
  mesh: THREE.Mesh,
  layer: SlicePlaneLayerState,
): void {
  const worldCameraPosition = new THREE.Vector3();
  const localCameraPosition = new THREE.Vector3();
  mesh.onBeforeRender = (_renderer, _scene, renderCamera) => {
    const shaderMaterial = mesh.material as THREE.ShaderMaterial;
    const uniforms = shaderMaterial.uniforms as ShaderUniformMap | undefined;
    const cameraUniform = uniforms?.u_cameraPos?.value as THREE.Vector3 | undefined;
    if (cameraUniform) {
      worldCameraPosition.setFromMatrixPosition(renderCamera.matrixWorld);
      localCameraPosition.copy(worldCameraPosition);
      mesh.worldToLocal(localCameraPosition);
      cameraUniform.copy(localCameraPosition);
    }
    if (uniforms) {
      applySlicePlaneUniforms(uniforms, layer);
    }
  };
}

type LayerRenderSource = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  volume: NormalizedVolume | null;
  pageTable: VolumeBrickPageTable | null;
  brickAtlas: VolumeBrickAtlas | null;
};

function applyVolumeTextureSampling(
  texture: THREE.Data3DTexture,
  samplingMode: 'linear' | 'nearest',
): void {
  const nearest = samplingMode === 'nearest';
  texture.minFilter = nearest ? THREE.NearestFilter : THREE.LinearMipmapLinearFilter;
  texture.magFilter = nearest ? THREE.NearestFilter : THREE.LinearFilter;
  texture.generateMipmaps = !nearest;
}

function applyAdaptiveLodUniforms(
  uniforms: ShaderUniformMap,
  samplingMode: 'linear' | 'nearest',
): void {
  const adaptiveLodEnabled = samplingMode === 'linear' ? 1 : 0;
  if ('u_adaptiveLodEnabled' in uniforms) {
    uniforms.u_adaptiveLodEnabled.value = adaptiveLodEnabled;
  }
  if ('u_adaptiveLodScale' in uniforms) {
    uniforms.u_adaptiveLodScale.value = 1;
  }
  if ('u_adaptiveLodMax' in uniforms) {
    uniforms.u_adaptiveLodMax.value = 2;
  }
}

function applyBeerLambertUniforms(uniforms: ShaderUniformMap, layer: Pick<
  LayerSettings,
  'blDensityScale' | 'blBackgroundCutoff' | 'blOpacityScale' | 'blEarlyExitAlpha'
>): void {
  if ('u_blDensityScale' in uniforms) {
    uniforms.u_blDensityScale.value = layer.blDensityScale;
  }
  if ('u_blBackgroundCutoff' in uniforms) {
    uniforms.u_blBackgroundCutoff.value = layer.blBackgroundCutoff;
  }
  if ('u_blOpacityScale' in uniforms) {
    uniforms.u_blOpacityScale.value = layer.blOpacityScale;
  }
  if ('u_blEarlyExitAlpha' in uniforms) {
    uniforms.u_blEarlyExitAlpha.value = layer.blEarlyExitAlpha;
  }
}

function createByte3dTexture(
  data: Uint8Array,
  width: number,
  height: number,
  depth: number,
  format: TextureFormat = THREE.RedFormat,
  filterMode: ByteTextureFilterMode = 'nearest',
): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(data, width, height, depth);
  texture.format = format;
  texture.type = THREE.UnsignedByteType;
  applyByteTextureFilter(texture, filterMode);
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

function createFloat3dTexture(
  data: Float32Array,
  width: number,
  height: number,
  depth: number,
): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(data, width, height, depth);
  texture.format = THREE.RedFormat;
  texture.type = THREE.FloatType;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function getTextureComponentsFromFormat(format: TextureFormat): number | null {
  if (format === THREE.RedFormat) {
    return 1;
  }
  if (format === THREE.RGFormat) {
    return 2;
  }
  if (format === THREE.RGBAFormat) {
    return 4;
  }
  return null;
}

function getTextureFormatFromBrickAtlas(atlas: VolumeBrickAtlas): TextureFormat {
  if (atlas.textureFormat === 'red') {
    return THREE.RedFormat;
  }
  if (atlas.textureFormat === 'rg') {
    return THREE.RGFormat;
  }
  return THREE.RGBAFormat;
}

function getTextureDimensions(texture: THREE.Data3DTexture): {
  width: number;
  height: number;
  depth: number;
  data: unknown;
} {
  const image = texture.image as {
    width: number;
    height: number;
    depth: number;
    data: unknown;
  };
  return {
    width: image.width,
    height: image.height,
    depth: image.depth,
    data: image.data,
  };
}

function applyByteTextureFilter(texture: THREE.Data3DTexture, filterMode: ByteTextureFilterMode): void {
  const nextFilter = filterMode === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
  const needsFilterUpdate =
    texture.minFilter !== nextFilter || texture.magFilter !== nextFilter || texture.generateMipmaps;
  if (!needsFilterUpdate) {
    return;
  }
  texture.minFilter = nextFilter;
  texture.magFilter = nextFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
}

function updateOrCreateByte3dTexture(
  existing: THREE.Data3DTexture | null | undefined,
  source: Uint8Array,
  width: number,
  height: number,
  depth: number,
  format: TextureFormat = THREE.RedFormat,
  filterMode: ByteTextureFilterMode = 'nearest',
  forceNeedsUpdate = true,
): THREE.Data3DTexture {
  if (existing) {
    const { width: currentWidth, height: currentHeight, depth: currentDepth, data } =
      getTextureDimensions(existing);
    if (
      currentWidth === width &&
      currentHeight === height &&
      currentDepth === depth &&
      data instanceof Uint8Array &&
      data.length === source.length
    ) {
      const hasSharedBuffer = data === source;
      if (!hasSharedBuffer) {
        data.set(source);
      }
      const formatChanged = existing.format !== format;
      existing.format = format;
      applyByteTextureFilter(existing, filterMode);
      if (!hasSharedBuffer || formatChanged || forceNeedsUpdate) {
        existing.needsUpdate = true;
      }
      return existing;
    }
    existing.dispose();
  }
  return createByte3dTexture(source, width, height, depth, format, filterMode);
}

function updateOrCreateFloat3dTexture(
  existing: THREE.Data3DTexture | null | undefined,
  source: Float32Array,
  width: number,
  height: number,
  depth: number,
  forceNeedsUpdate = true,
): THREE.Data3DTexture {
  if (existing) {
    const { width: currentWidth, height: currentHeight, depth: currentDepth, data } =
      getTextureDimensions(existing);
    if (
      currentWidth === width &&
      currentHeight === height &&
      currentDepth === depth &&
      data instanceof Float32Array &&
      data.length === source.length
    ) {
      const hasSharedBuffer = data === source;
      if (!hasSharedBuffer) {
        data.set(source);
      }
      if (!hasSharedBuffer || forceNeedsUpdate) {
        existing.needsUpdate = true;
      }
      return existing;
    }
    existing.dispose();
  }
  return createFloat3dTexture(source, width, height, depth);
}

function createFallbackVolumeDataTexture(): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(FALLBACK_VOLUME_TEXTURE_DATA.slice(), 1, 1, 1);
  texture.format = THREE.RedFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function resolveNumericEnvValue(name: string): number {
  const fromImportMeta = Number((import.meta as { env?: Record<string, unknown> })?.env?.[name] ?? Number.NaN);
  if (Number.isFinite(fromImportMeta)) {
    return fromImportMeta;
  }
  const fromProcessEnv =
    typeof process !== 'undefined' && process?.env ? Number(process.env[name] ?? Number.NaN) : Number.NaN;
  return fromProcessEnv;
}

function resolveBrickSkipEnabledByConfig(): boolean {
  const configured = resolveNumericEnvValue('VITE_BRICK_SKIP_ENABLED');
  if (!Number.isFinite(configured)) {
    return true;
  }
  return configured > 0;
}

function analyzeBrickSkipDiagnostics({
  pageTable,
  atlasIndexData,
  enabledByConfig,
}: {
  pageTable: VolumeBrickPageTable | null | undefined;
  atlasIndexData: Float32Array | null;
  enabledByConfig: boolean;
}): BrickSkipDiagnostics {
  if (!pageTable) {
    return {
      enabled: false,
      reason: 'missing-page-table',
      totalBricks: 0,
      emptyBricks: 0,
      occupiedBricks: 0,
      occupiedBricksMissingFromAtlas: 0,
      invalidRangeBricks: 0,
      occupancyMetadataMismatchBricks: 0
    };
  }

  const totalBricks = pageTable.brickAtlasIndices.length;
  let emptyBricks = 0;
  let occupiedBricks = 0;
  let occupiedBricksMissingFromAtlas = 0;
  let invalidRangeBricks = 0;
  let occupancyMetadataMismatchBricks = 0;

  for (let brickIndex = 0; brickIndex < totalBricks; brickIndex += 1) {
    const occupancy = pageTable.chunkOccupancy[brickIndex] ?? 0;
    const min = pageTable.chunkMin[brickIndex] ?? 0;
    const max = pageTable.chunkMax[brickIndex] ?? 0;
    const atlasIndexValue = atlasIndexData ? atlasIndexData[brickIndex] ?? 0 : 0;
    const hasAtlasBrick = atlasIndexValue > 0;

    if (max < min) {
      invalidRangeBricks += 1;
    }
    if (occupancy <= 0) {
      emptyBricks += 1;
      if (max > 0 || min > 0) {
        occupancyMetadataMismatchBricks += 1;
      }
      continue;
    }

    occupiedBricks += 1;
    if (!hasAtlasBrick) {
      occupiedBricksMissingFromAtlas += 1;
    }
  }

  if (!enabledByConfig) {
    return {
      enabled: false,
      reason: 'disabled-by-config',
      totalBricks,
      emptyBricks,
      occupiedBricks,
      occupiedBricksMissingFromAtlas,
      invalidRangeBricks,
      occupancyMetadataMismatchBricks
    };
  }
  if (occupiedBricksMissingFromAtlas > 0) {
    return {
      enabled: false,
      reason: 'occupied-bricks-missing-from-atlas',
      totalBricks,
      emptyBricks,
      occupiedBricks,
      occupiedBricksMissingFromAtlas,
      invalidRangeBricks,
      occupancyMetadataMismatchBricks
    };
  }
  if (invalidRangeBricks > 0) {
    return {
      enabled: false,
      reason: 'invalid-min-max-range',
      totalBricks,
      emptyBricks,
      occupiedBricks,
      occupiedBricksMissingFromAtlas,
      invalidRangeBricks,
      occupancyMetadataMismatchBricks
    };
  }
  if (occupancyMetadataMismatchBricks > 0) {
    return {
      enabled: false,
      reason: 'occupancy-metadata-mismatch',
      totalBricks,
      emptyBricks,
      occupiedBricks,
      occupiedBricksMissingFromAtlas,
      invalidRangeBricks,
      occupancyMetadataMismatchBricks
    };
  }

  return {
    enabled: true,
    reason: 'enabled',
    totalBricks,
    emptyBricks,
    occupiedBricks,
    occupiedBricksMissingFromAtlas,
    invalidRangeBricks,
    occupancyMetadataMismatchBricks
  };
}

function resolveGpuBrickBudgetBytes(): number {
  const configured = resolveNumericEnvValue('VITE_MAX_GPU_BRICK_BYTES');
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_GPU_BRICK_BYTES;
  }
  return Math.max(1, Math.floor(configured));
}

function hasExplicitGpuBrickBudgetBytes(): boolean {
  const configured = resolveNumericEnvValue('VITE_MAX_GPU_BRICK_BYTES');
  return Number.isFinite(configured) && configured > 0;
}

function resolveMaxBrickUploadsPerUpdate(): number {
  const configured = resolveNumericEnvValue('VITE_MAX_BRICK_UPLOADS_PER_UPDATE');
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_MAX_BRICK_UPLOADS_PER_UPDATE;
  }
  return Math.max(1, Math.floor(configured));
}

function hasExplicitMaxBrickUploadsPerUpdate(): boolean {
  const configured = resolveNumericEnvValue('VITE_MAX_BRICK_UPLOADS_PER_UPDATE');
  return Number.isFinite(configured) && configured > 0;
}

function resolveRendererMax3DTextureSize(
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null> | undefined,
): number | null {
  const renderer = rendererRef?.current;
  if (!renderer || !renderer.capabilities?.isWebGL2) {
    return null;
  }
  const gl = renderer.getContext() as WebGL2RenderingContext | null;
  if (!gl) {
    return null;
  }
  const raw = Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE));
  if (!Number.isFinite(raw) || raw <= 0) {
    return null;
  }
  return Math.floor(raw);
}

function exceeds3DTextureSizeLimit(
  size: { width: number; height: number; depth: number },
  max3DTextureSize: number | null | undefined,
): boolean {
  if (!max3DTextureSize || !Number.isFinite(max3DTextureSize) || max3DTextureSize <= 0) {
    return false;
  }
  return size.width > max3DTextureSize || size.height > max3DTextureSize || size.depth > max3DTextureSize;
}

function copyBrickIntoResidentAtlas({
  sourceData,
  sourceIndex,
  destinationData,
  destinationSlot,
  chunkWidth,
  chunkHeight,
  chunkDepth,
  sourceDepth,
  destinationDepth,
  textureComponents
}: {
  sourceData: Uint8Array;
  sourceIndex: number;
  destinationData: Uint8Array;
  destinationSlot: number;
  chunkWidth: number;
  chunkHeight: number;
  chunkDepth: number;
  sourceDepth: number;
  destinationDepth: number;
  textureComponents: number;
}): void {
  const sourceZBase = sourceIndex * chunkDepth;
  const destinationZBase = destinationSlot * chunkDepth;
  for (let localZ = 0; localZ < chunkDepth; localZ += 1) {
    const sourceZ = sourceZBase + localZ;
    const destinationZ = destinationZBase + localZ;
    if (sourceZ >= sourceDepth || destinationZ >= destinationDepth) {
      continue;
    }
    for (let localY = 0; localY < chunkHeight; localY += 1) {
      for (let localX = 0; localX < chunkWidth; localX += 1) {
        const sourceVoxelOffset =
          ((sourceZ * chunkHeight + localY) * chunkWidth + localX) * textureComponents;
        const destinationVoxelOffset =
          ((destinationZ * chunkHeight + localY) * chunkWidth + localX) * textureComponents;
        for (let component = 0; component < textureComponents; component += 1) {
          destinationData[destinationVoxelOffset + component] = sourceData[sourceVoxelOffset + component] ?? 0;
        }
      }
    }
  }
}

function buildViewPrioritySourceIndices({
  pageTable,
  cameraPosition,
  fullResolutionSize
}: {
  pageTable: VolumeBrickPageTable;
  cameraPosition: THREE.Vector3 | null;
  fullResolutionSize: { width: number; height: number; depth: number };
}): Array<{ sourceIndex: number; distanceSq: number }> {
  const entries: Array<{ sourceIndex: number; distanceSq: number }> = [];
  const [gridZ, gridY, gridX] = pageTable.gridShape;
  const [chunkDepth, chunkHeight, chunkWidth] = pageTable.chunkShape;
  const [scaleDepth, scaleHeight, scaleWidth] = pageTable.volumeShape;
  const plane = gridY * gridX;
  const ratioX = fullResolutionSize.width > 0 ? scaleWidth / fullResolutionSize.width : 1;
  const ratioY = fullResolutionSize.height > 0 ? scaleHeight / fullResolutionSize.height : 1;
  const ratioZ = fullResolutionSize.depth > 0 ? scaleDepth / fullResolutionSize.depth : 1;
  const scaledCamera = cameraPosition
    ? new THREE.Vector3(cameraPosition.x * ratioX, cameraPosition.y * ratioY, cameraPosition.z * ratioZ)
    : null;

  for (let flatBrickIndex = 0; flatBrickIndex < pageTable.brickAtlasIndices.length; flatBrickIndex += 1) {
    const sourceIndex = pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
    if (sourceIndex < 0) {
      continue;
    }
    const brickZ = Math.floor(flatBrickIndex / plane);
    const withinPlane = flatBrickIndex % plane;
    const brickY = Math.floor(withinPlane / gridX);
    const brickX = withinPlane % gridX;
    if (brickZ < 0 || brickZ >= gridZ || brickY < 0 || brickY >= gridY || brickX < 0 || brickX >= gridX) {
      continue;
    }
    const centerX = brickX * chunkWidth + chunkWidth * 0.5;
    const centerY = brickY * chunkHeight + chunkHeight * 0.5;
    const centerZ = brickZ * chunkDepth + chunkDepth * 0.5;
    const distanceSq =
      scaledCamera
        ? (centerX - scaledCamera.x) * (centerX - scaledCamera.x) +
          (centerY - scaledCamera.y) * (centerY - scaledCamera.y) +
          (centerZ - scaledCamera.z) * (centerZ - scaledCamera.z)
        : sourceIndex;
    entries.push({ sourceIndex, distanceSq });
  }

  entries.sort((left, right) => {
    if (left.distanceSq !== right.distanceSq) {
      return left.distanceSq - right.distanceSq;
    }
    return left.sourceIndex - right.sourceIndex;
  });
  return entries;
}

function updateGpuBrickResidency({
  resource,
  pageTable,
  sourceData,
  sourceToken,
  textureFormat,
  cameraPosition,
  atlasSize,
  max3DTextureSize,
  layerKey,
  timepoint,
  maxUploadsPerUpdate,
  allowBootstrapUploadBurst,
  forceFullResidency
}: {
  resource: VolumeResources;
  pageTable: VolumeBrickPageTable;
  sourceData: Uint8Array;
  sourceToken: object | null;
  textureFormat: TextureFormat;
  cameraPosition: THREE.Vector3 | null;
  atlasSize: { width: number; height: number; depth: number };
  max3DTextureSize: number | null;
  layerKey: string;
  timepoint: number;
  maxUploadsPerUpdate: number;
  allowBootstrapUploadBurst: boolean;
  forceFullResidency: boolean;
}): {
  atlasData: Uint8Array;
  atlasSize: { width: number; height: number; depth: number };
  atlasIndices: Float32Array;
  metrics: BrickResidencyMetrics;
  texturesDirty: boolean;
} {
  const components = getTextureComponentsFromFormat(textureFormat);
  if (!components) {
    return {
      atlasData: new Uint8Array([0]),
      atlasSize: { width: 1, height: 1, depth: 1 },
      atlasIndices: new Float32Array(pageTable.brickAtlasIndices.length),
      metrics: {
        layerKey,
        timepoint,
        scaleLevel: pageTable.scaleLevel,
        residentBricks: 0,
        totalBricks: pageTable.occupiedBrickCount,
        residentBytes: 0,
        budgetBytes: resolveGpuBrickBudgetBytes(),
        uploads: 0,
        evictions: 0,
        pendingBricks: pageTable.occupiedBrickCount,
        prioritizedBricks: pageTable.occupiedBrickCount,
        scheduledUploads: 0,
        lastCameraDistance: null
      },
      texturesDirty: false,
    };
  }

  const chunkDepth = Math.max(1, pageTable.chunkShape[0]);
  const chunkHeight = Math.max(1, pageTable.chunkShape[1]);
  const chunkWidth = Math.max(1, pageTable.chunkShape[2]);
  const bytesPerBrick = chunkDepth * chunkHeight * chunkWidth * components;
  const configuredBudgetBytes = resolveGpuBrickBudgetBytes();
  const explicitBudget = hasExplicitGpuBrickBudgetBytes();
  const shouldForceFullResidency = forceFullResidency && !explicitBudget;
  const canAutoExpandBudget = !hasExplicitGpuBrickBudgetBytes() && pageTable.scaleLevel === 0;
  const targetBudgetBytes = shouldForceFullResidency
    ? Math.max(configuredBudgetBytes, bytesPerBrick * pageTable.occupiedBrickCount)
    : canAutoExpandBudget
      ? Math.min(
          AUTO_EXPANDED_MAX_GPU_BRICK_BYTES,
          Math.max(configuredBudgetBytes, bytesPerBrick * pageTable.occupiedBrickCount)
        )
      : configuredBudgetBytes;
  const budgetBytes = Math.max(1, targetBudgetBytes);
  const budgetLimitedSlotCapacity = Math.floor(budgetBytes / bytesPerBrick) || 1;
  const maxDepthLimitedSlotCapacity = max3DTextureSize ? Math.floor(max3DTextureSize / chunkDepth) : Number.POSITIVE_INFINITY;
  const slotCapacity = Math.max(
    1,
    Math.min(pageTable.occupiedBrickCount, budgetLimitedSlotCapacity, maxDepthLimitedSlotCapacity)
  );
  const residentDepth = chunkDepth * slotCapacity;
  const expectedResidentDataLength = chunkWidth * chunkHeight * residentDepth * components;
  const expectedResidentIndexLength = pageTable.brickAtlasIndices.length;
  const existing = gpuBrickResidencyStateByResource.get(resource);
  const shouldReset =
    !existing ||
    existing.sourceToken !== sourceToken ||
    existing.pageTable !== pageTable ||
    existing.textureFormat !== textureFormat ||
    existing.slotCapacity !== slotCapacity ||
    existing.chunkDepth !== chunkDepth ||
    existing.chunkHeight !== chunkHeight ||
    existing.chunkWidth !== chunkWidth;

  const state: BrickResidencyState =
    shouldReset || !existing
      ? {
          sourceToken,
          pageTable,
          textureFormat,
          textureComponents: components,
          chunkWidth,
          chunkHeight,
          chunkDepth,
          slotCapacity,
          slotSourceIndices: new Int32Array(slotCapacity).fill(-1),
          sourceToSlot: new Map<number, number>(),
          sourceLastUsedTick: new Map<number, number>(),
          residentAtlasData: new Uint8Array(expectedResidentDataLength),
          residentAtlasIndices: new Float32Array(expectedResidentIndexLength),
          tick: 1,
          uploads: 0,
          evictions: 0,
          residentBytes: slotCapacity * bytesPerBrick,
          budgetBytes,
          lastCameraDistance: null,
          scaleLevel: pageTable.scaleLevel,
          bootstrapUpdatesRemaining: BOOTSTRAP_UPLOAD_BURST_UPDATES
        }
      : existing;

  if (state.residentAtlasData.length !== expectedResidentDataLength) {
    state.residentAtlasData = new Uint8Array(expectedResidentDataLength);
  }
  if (state.residentAtlasIndices.length !== expectedResidentIndexLength) {
    state.residentAtlasIndices = new Float32Array(expectedResidentIndexLength);
  }
  state.budgetBytes = budgetBytes;
  state.residentBytes = slotCapacity * bytesPerBrick;
  state.scaleLevel = pageTable.scaleLevel;
  state.pageTable = pageTable;

  const priorityEntries = buildViewPrioritySourceIndices({
    pageTable,
    cameraPosition,
    fullResolutionSize: {
      width: resource.dimensions.width,
      height: resource.dimensions.height,
      depth: resource.dimensions.depth
    }
  });
  const desiredSources = new Set<number>(priorityEntries.slice(0, slotCapacity).map((entry) => entry.sourceIndex));
  state.tick += 1;

  const pendingSources = priorityEntries
    .map((entry) => entry.sourceIndex)
    .filter((sourceIndex) => desiredSources.has(sourceIndex) && !state.sourceToSlot.has(sourceIndex));
  const baseUploadBudget = Math.max(1, maxUploadsPerUpdate);
  const boostedUploadBudget =
    allowBootstrapUploadBurst && state.bootstrapUpdatesRemaining > 0
      ? Math.min(BOOTSTRAP_UPLOAD_BURST_MAX, baseUploadBudget * BOOTSTRAP_UPLOAD_BURST_MULTIPLIER)
      : baseUploadBudget;
  const forceImmediateUploads = shouldForceFullResidency && !hasExplicitMaxBrickUploadsPerUpdate();
  const pendingLimit = forceImmediateUploads
    ? pendingSources.length
    : Math.min(Math.max(baseUploadBudget, boostedUploadBudget), pendingSources.length);
  for (let pendingIndex = 0; pendingIndex < pendingLimit; pendingIndex += 1) {
    const sourceIndex = pendingSources[pendingIndex]!;
    let slot = state.sourceToSlot.get(sourceIndex);
    if (slot !== undefined) {
      state.sourceLastUsedTick.set(sourceIndex, state.tick);
      continue;
    }

    let replacementSlot = state.slotSourceIndices.indexOf(-1);
    if (replacementSlot < 0) {
      let oldestTick = Number.POSITIVE_INFINITY;
      for (let slotIndex = 0; slotIndex < state.slotSourceIndices.length; slotIndex += 1) {
        const residentSource = state.slotSourceIndices[slotIndex] ?? -1;
        if (residentSource < 0) {
          replacementSlot = slotIndex;
          break;
        }
        if (desiredSources.has(residentSource)) {
          continue;
        }
        const residentTick = state.sourceLastUsedTick.get(residentSource) ?? 0;
        if (residentTick < oldestTick) {
          oldestTick = residentTick;
          replacementSlot = slotIndex;
        }
      }
      if (replacementSlot < 0) {
        // All resident slots are currently desired; avoid churn.
        continue;
      }
    }

    const evictedSource = state.slotSourceIndices[replacementSlot] ?? -1;
    if (evictedSource >= 0) {
      state.sourceToSlot.delete(evictedSource);
      state.sourceLastUsedTick.delete(evictedSource);
      state.evictions += 1;
    }
    copyBrickIntoResidentAtlas({
      sourceData,
      sourceIndex,
      destinationData: state.residentAtlasData,
      destinationSlot: replacementSlot,
      chunkWidth,
      chunkHeight,
      chunkDepth,
      sourceDepth: atlasSize.depth,
      destinationDepth: residentDepth,
      textureComponents: components
    });
    state.slotSourceIndices[replacementSlot] = sourceIndex;
    state.sourceToSlot.set(sourceIndex, replacementSlot);
    state.sourceLastUsedTick.set(sourceIndex, state.tick);
    state.uploads += 1;
  }

  for (const sourceIndex of desiredSources) {
    if (state.sourceToSlot.has(sourceIndex)) {
      state.sourceLastUsedTick.set(sourceIndex, state.tick);
    }
  }

  for (let flatBrickIndex = 0; flatBrickIndex < pageTable.brickAtlasIndices.length; flatBrickIndex += 1) {
    const sourceIndex = pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
    const slot = sourceIndex >= 0 ? state.sourceToSlot.get(sourceIndex) : undefined;
    state.residentAtlasIndices[flatBrickIndex] = slot === undefined ? 0 : slot + 1;
  }

  const nearestDistanceSq = priorityEntries[0]?.distanceSq;
  state.lastCameraDistance =
    nearestDistanceSq !== undefined && Number.isFinite(nearestDistanceSq) ? Math.sqrt(nearestDistanceSq) : null;
  if (state.bootstrapUpdatesRemaining > 0) {
    state.bootstrapUpdatesRemaining -= 1;
  }
  gpuBrickResidencyStateByResource.set(resource, state);

  return {
    atlasData: state.residentAtlasData,
    atlasSize: { width: chunkWidth, height: chunkHeight, depth: residentDepth },
    atlasIndices: state.residentAtlasIndices,
    metrics: {
      layerKey,
      timepoint,
      scaleLevel: state.scaleLevel,
      residentBricks: state.sourceToSlot.size,
      totalBricks: pageTable.occupiedBrickCount,
      residentBytes: state.residentBytes,
      budgetBytes: state.budgetBytes,
      uploads: state.uploads,
      evictions: state.evictions,
      pendingBricks: pendingSources.length,
      prioritizedBricks: priorityEntries.length,
      scheduledUploads: pendingLimit,
      lastCameraDistance: state.lastCameraDistance
    },
    texturesDirty: pendingLimit > 0,
  };
}

function disposeBrickAtlasDataTexture(resource: VolumeResources): void {
  resource.brickAtlasDataTexture?.dispose();
  resource.brickAtlasDataTexture = null;
  resource.brickAtlasSourceToken = null;
  resource.brickAtlasSourceData = null;
  resource.brickAtlasSourceFormat = null;
  resource.brickAtlasSourcePageTable = null;
  resource.brickAtlasBuildVersion = 0;
  resource.gpuBrickResidencyMetrics = null;
  gpuBrickResidencyStateByResource.delete(resource);
}

function disposeBrickPageTableTextures(resource: VolumeResources): void {
  resource.brickOccupancyTexture?.dispose();
  resource.brickMinTexture?.dispose();
  resource.brickMaxTexture?.dispose();
  resource.brickAtlasIndexTexture?.dispose();
  disposeBrickAtlasDataTexture(resource);
  resource.brickOccupancyTexture = null;
  resource.brickMinTexture = null;
  resource.brickMaxTexture = null;
  resource.brickAtlasIndexTexture = null;
  resource.brickMetadataSourcePageTable = null;
}

function occupancyMaskFromPageTable(pageTable: VolumeBrickPageTable): Uint8Array {
  const mask = new Uint8Array(pageTable.chunkOccupancy.length);
  for (let index = 0; index < pageTable.chunkOccupancy.length; index += 1) {
    mask[index] = pageTable.chunkOccupancy[index] > 0 ? 255 : 0;
  }
  return mask;
}

function atlasIndexTextureDataFromPageTable(pageTable: VolumeBrickPageTable): Float32Array {
  const data = new Float32Array(pageTable.brickAtlasIndices.length);
  for (let index = 0; index < pageTable.brickAtlasIndices.length; index += 1) {
    const atlasIndex = pageTable.brickAtlasIndices[index] ?? -1;
    data[index] = atlasIndex >= 0 ? atlasIndex + 1 : 0;
  }
  return data;
}

function buildBrickAtlasDataTexture({
  pageTable,
  textureData,
  textureFormat,
}: {
  pageTable: VolumeBrickPageTable;
  textureData: Uint8Array;
  textureFormat: TextureFormat;
}): BrickAtlasBuildResult | null {
  const components = getTextureComponentsFromFormat(textureFormat);
  if (components === null) {
    return null;
  }

  const chunkDepth = pageTable.chunkShape[0];
  const chunkHeight = pageTable.chunkShape[1];
  const chunkWidth = pageTable.chunkShape[2];
  if (chunkDepth <= 0 || chunkHeight <= 0 || chunkWidth <= 0) {
    return null;
  }

  const occupiedBrickCount = pageTable.occupiedBrickCount;
  if (occupiedBrickCount <= 0) {
    return null;
  }

  const volumeDepth = pageTable.volumeShape[0];
  const volumeHeight = pageTable.volumeShape[1];
  const volumeWidth = pageTable.volumeShape[2];
  if (volumeDepth <= 0 || volumeHeight <= 0 || volumeWidth <= 0) {
    return null;
  }

  const expectedSourceLength = volumeWidth * volumeHeight * volumeDepth * components;
  if (textureData.length !== expectedSourceLength) {
    return null;
  }

  const atlasWidth = chunkWidth;
  const atlasHeight = chunkHeight;
  const atlasDepth = chunkDepth * occupiedBrickCount;
  const atlasData = new Uint8Array(atlasWidth * atlasHeight * atlasDepth * components);
  const gridZ = pageTable.gridShape[0];
  const gridY = pageTable.gridShape[1];
  const gridX = pageTable.gridShape[2];
  const planeChunks = gridY * gridX;

  for (let flatBrickIndex = 0; flatBrickIndex < pageTable.brickAtlasIndices.length; flatBrickIndex += 1) {
    const atlasIndex = pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
    if (atlasIndex < 0 || atlasIndex >= occupiedBrickCount) {
      continue;
    }

    const brickZ = Math.floor(flatBrickIndex / planeChunks);
    const withinPlane = flatBrickIndex % planeChunks;
    const brickY = Math.floor(withinPlane / gridX);
    const brickX = withinPlane % gridX;
    if (brickZ < 0 || brickZ >= gridZ || brickY < 0 || brickY >= gridY || brickX < 0 || brickX >= gridX) {
      continue;
    }

    const sourceZBase = brickZ * chunkDepth;
    const sourceYBase = brickY * chunkHeight;
    const sourceXBase = brickX * chunkWidth;
    const atlasZBase = atlasIndex * chunkDepth;

    for (let localZ = 0; localZ < chunkDepth; localZ += 1) {
      const sourceZ = sourceZBase + localZ;
      if (sourceZ >= volumeDepth) {
        continue;
      }
      for (let localY = 0; localY < chunkHeight; localY += 1) {
        const sourceY = sourceYBase + localY;
        if (sourceY >= volumeHeight) {
          continue;
        }
        for (let localX = 0; localX < chunkWidth; localX += 1) {
          const sourceX = sourceXBase + localX;
          if (sourceX >= volumeWidth) {
            continue;
          }

          const sourceVoxelIndex =
            ((sourceZ * volumeHeight + sourceY) * volumeWidth + sourceX) * components;
          const atlasVoxelIndex =
            (((atlasZBase + localZ) * atlasHeight + localY) * atlasWidth + localX) * components;
          for (let component = 0; component < components; component += 1) {
            atlasData[atlasVoxelIndex + component] = textureData[sourceVoxelIndex + component] ?? 0;
          }
        }
      }
    }
  }

  return {
    data: atlasData,
    width: atlasWidth,
    height: atlasHeight,
    depth: atlasDepth,
    textureFormat,
    enabled: true,
  };
}

function resolveAtlasTextureFilterMode(uniforms: ShaderUniformMap): ByteTextureFilterMode {
  if (!('u_nearestSampling' in uniforms)) {
    return 'linear';
  }
  const nearestSampling = Number(uniforms.u_nearestSampling.value);
  if (Number.isFinite(nearestSampling) && nearestSampling > 0.5) {
    return 'nearest';
  }
  return 'linear';
}

function applyBrickPageTableUniforms(
  uniforms: ShaderUniformMap,
  resource: VolumeResources,
  pageTable: VolumeBrickPageTable | null | undefined,
  options?: {
    textureDataToken?: object;
    textureData?: Uint8Array;
    textureFormat?: TextureFormat;
    atlasDataToken?: object;
    atlasData?: Uint8Array;
    atlasFormat?: TextureFormat;
    atlasSize?: { width: number; height: number; depth: number };
    max3DTextureSize?: number | null;
    cameraPosition?: THREE.Vector3 | null;
    forceFullResidency?: boolean;
  },
): void {
  if (
    !('u_brickSkipEnabled' in uniforms) ||
    !('u_brickGridSize' in uniforms) ||
    !('u_brickChunkSize' in uniforms) ||
    !('u_brickVolumeSize' in uniforms) ||
    !('u_brickOccupancy' in uniforms) ||
    !('u_brickMin' in uniforms) ||
    !('u_brickMax' in uniforms) ||
    !('u_brickAtlasIndices' in uniforms) ||
    !('u_brickAtlasEnabled' in uniforms) ||
    !('u_brickAtlasData' in uniforms) ||
    !('u_brickAtlasSize' in uniforms)
  ) {
    resource.brickSkipDiagnostics = null;
    return;
  }

  const disableBrickSkipping = (
    reason: BrickSkipDiagnostics['reason'],
    totalBricks = 0,
  ) => {
    console.warn(`[brick-residency] Disabling brick metadata textures: ${reason}`);
    disposeBrickPageTableTextures(resource);
    uniforms.u_brickSkipEnabled.value = 0;
    (uniforms.u_brickGridSize.value as THREE.Vector3).set(1, 1, 1);
    (uniforms.u_brickChunkSize.value as THREE.Vector3).set(1, 1, 1);
    (uniforms.u_brickVolumeSize.value as THREE.Vector3).set(1, 1, 1);
    uniforms.u_brickOccupancy.value = FALLBACK_BRICK_OCCUPANCY_TEXTURE;
    uniforms.u_brickMin.value = FALLBACK_BRICK_MIN_TEXTURE;
    uniforms.u_brickMax.value = FALLBACK_BRICK_MAX_TEXTURE;
    uniforms.u_brickAtlasIndices.value = FALLBACK_BRICK_ATLAS_INDEX_TEXTURE;
    uniforms.u_brickAtlasEnabled.value = 0;
    uniforms.u_brickAtlasData.value = FALLBACK_BRICK_ATLAS_DATA_TEXTURE;
    (uniforms.u_brickAtlasSize.value as THREE.Vector3).set(1, 1, 1);
    resource.gpuBrickResidencyMetrics = null;
    resource.brickSkipDiagnostics = createDisabledBrickSkipDiagnostics(reason, totalBricks);
  };

  if (!pageTable) {
    disableBrickSkipping('missing-page-table');
    return;
  }

  const gridX = pageTable.gridShape[2];
  const gridY = pageTable.gridShape[1];
  const gridZ = pageTable.gridShape[0];
  const expectedBrickCount = gridX * gridY * gridZ;
  if (
    pageTable.brickAtlasIndices.length !== expectedBrickCount ||
    pageTable.chunkMin.length !== expectedBrickCount ||
    pageTable.chunkMax.length !== expectedBrickCount ||
    pageTable.chunkOccupancy.length !== expectedBrickCount
  ) {
    disableBrickSkipping('invalid-page-table', expectedBrickCount);
    return;
  }

  const hasMetadataTextures =
    resource.brickOccupancyTexture !== null &&
    resource.brickOccupancyTexture !== undefined &&
    resource.brickMinTexture !== null &&
    resource.brickMinTexture !== undefined &&
    resource.brickMaxTexture !== null &&
    resource.brickMaxTexture !== undefined;
  const canReuseMetadataTextures =
    hasMetadataTextures && resource.brickMetadataSourcePageTable === pageTable;
  if (!canReuseMetadataTextures) {
    const occupancyMask = occupancyMaskFromPageTable(pageTable);
    resource.brickOccupancyTexture = updateOrCreateByte3dTexture(
      resource.brickOccupancyTexture,
      occupancyMask,
      gridX,
      gridY,
      gridZ,
    );
    resource.brickMinTexture = updateOrCreateByte3dTexture(
      resource.brickMinTexture,
      pageTable.chunkMin,
      gridX,
      gridY,
      gridZ,
    );
    resource.brickMaxTexture = updateOrCreateByte3dTexture(
      resource.brickMaxTexture,
      pageTable.chunkMax,
      gridX,
      gridY,
      gridZ,
    );
    resource.brickMetadataSourcePageTable = pageTable;
  }

  const atlasSourceToken =
    options?.atlasDataToken ??
    options?.textureDataToken ??
    options?.atlasData ??
    options?.textureData ??
    null;
  const atlasTextureFilterMode = resolveAtlasTextureFilterMode(uniforms);
  const atlasFormat = options?.atlasFormat ?? options?.textureFormat;
  const shouldUseGpuResidency =
    Boolean(options?.atlasData && atlasFormat && options.atlasSize);

  let atlasIndexData = atlasIndexTextureDataFromPageTable(pageTable);
  let atlasBuild: BrickAtlasBuildResult | null = null;
  let atlasTexturesDirty = true;

  if (shouldUseGpuResidency && options?.atlasData && atlasFormat && options.atlasSize) {
    const components = getTextureComponentsFromFormat(atlasFormat);
    const expectedLength =
      options.atlasSize.width * options.atlasSize.height * options.atlasSize.depth * (components ?? 0);
    if (
      components &&
      options.atlasSize.width > 0 &&
      options.atlasSize.height > 0 &&
      options.atlasSize.depth > 0 &&
      expectedLength > 0 &&
      options.atlasData.length === expectedLength
    ) {
      const residency = updateGpuBrickResidency({
        resource,
        pageTable,
        sourceData: options.atlasData,
        sourceToken: typeof atlasSourceToken === 'object' && atlasSourceToken !== null ? atlasSourceToken : null,
        textureFormat: atlasFormat,
        cameraPosition: options.cameraPosition ?? null,
        atlasSize: options.atlasSize,
        max3DTextureSize: options.max3DTextureSize ?? null,
        layerKey: pageTable.layerKey,
        timepoint: pageTable.timepoint,
        maxUploadsPerUpdate: resolveMaxBrickUploadsPerUpdate(),
        allowBootstrapUploadBurst: !hasExplicitMaxBrickUploadsPerUpdate(),
        forceFullResidency: options.forceFullResidency ?? false
      });
      atlasIndexData = residency.atlasIndices;
      atlasBuild = {
        data: residency.atlasData,
        width: residency.atlasSize.width,
        height: residency.atlasSize.height,
        depth: residency.atlasSize.depth,
        textureFormat: atlasFormat,
        enabled: true
      };
      atlasTexturesDirty = residency.texturesDirty;
      resource.gpuBrickResidencyMetrics = residency.metrics;
    } else {
      resource.gpuBrickResidencyMetrics = null;
    }
  } else {
    resource.gpuBrickResidencyMetrics = null;
  }

  resource.brickAtlasIndexTexture = updateOrCreateFloat3dTexture(
    resource.brickAtlasIndexTexture,
    atlasIndexData,
    gridX,
    gridY,
    gridZ,
    atlasTexturesDirty,
  );

  const brickSkipDiagnostics = analyzeBrickSkipDiagnostics({
    pageTable,
    atlasIndexData,
    enabledByConfig: resolveBrickSkipEnabledByConfig()
  });
  resource.brickSkipDiagnostics = brickSkipDiagnostics.enabled
    ? {
        ...brickSkipDiagnostics,
        enabled: false,
        reason: 'disabled-by-config'
      }
    : brickSkipDiagnostics;
  uniforms.u_brickSkipEnabled.value = 0;
  (uniforms.u_brickGridSize.value as THREE.Vector3).set(gridX, gridY, gridZ);
  (uniforms.u_brickChunkSize.value as THREE.Vector3).set(
    pageTable.chunkShape[2],
    pageTable.chunkShape[1],
    pageTable.chunkShape[0],
  );
  (uniforms.u_brickVolumeSize.value as THREE.Vector3).set(
    pageTable.volumeShape[2],
    pageTable.volumeShape[1],
    pageTable.volumeShape[0]
  );
  uniforms.u_brickOccupancy.value = resource.brickOccupancyTexture;
  uniforms.u_brickMin.value = resource.brickMinTexture;
  uniforms.u_brickMax.value = resource.brickMaxTexture;
  uniforms.u_brickAtlasIndices.value = resource.brickAtlasIndexTexture;

  const canReuseAtlasTexture =
    !shouldUseGpuResidency &&
    resource.brickAtlasDataTexture !== null &&
    resource.brickAtlasDataTexture !== undefined &&
    resource.brickAtlasSourcePageTable === pageTable &&
    resource.brickAtlasSourceToken === atlasSourceToken &&
    resource.brickAtlasSourceFormat === atlasFormat;
  if (canReuseAtlasTexture) {
    const atlasTexture = resource.brickAtlasDataTexture;
    if (!atlasTexture) {
      return;
    }
    const { width, height, depth } = getTextureDimensions(atlasTexture);
    if (exceeds3DTextureSizeLimit({ width, height, depth }, options?.max3DTextureSize)) {
      disposeBrickAtlasDataTexture(resource);
    } else {
      applyByteTextureFilter(atlasTexture, atlasTextureFilterMode);
      uniforms.u_brickAtlasEnabled.value = 1;
      uniforms.u_brickAtlasData.value = atlasTexture;
      (uniforms.u_brickAtlasSize.value as THREE.Vector3).set(width, height, depth);
      return;
    }
  }

  if (!atlasBuild) {
    atlasBuild = (() => {
      if (options?.atlasData && atlasFormat && options.atlasSize) {
        const components = getTextureComponentsFromFormat(atlasFormat);
        const expectedLength =
          options.atlasSize.width * options.atlasSize.height * options.atlasSize.depth * (components ?? 0);
        if (
          components &&
          options.atlasSize.width > 0 &&
          options.atlasSize.height > 0 &&
          options.atlasSize.depth > 0 &&
          expectedLength > 0 &&
          options.atlasData.length === expectedLength
        ) {
          return {
            data: options.atlasData,
            width: options.atlasSize.width,
            height: options.atlasSize.height,
            depth: options.atlasSize.depth,
            textureFormat: atlasFormat,
            enabled: true,
          } satisfies BrickAtlasBuildResult;
        }
        return null;
      }

      if (options?.textureData && options.textureFormat) {
        return buildBrickAtlasDataTexture({
          pageTable,
          textureData: options.textureData,
          textureFormat: options.textureFormat,
        });
      }

      return null;
    })();
  }

  if (!atlasBuild || !atlasBuild.enabled) {
    disposeBrickAtlasDataTexture(resource);
    uniforms.u_brickAtlasEnabled.value = 0;
    uniforms.u_brickAtlasData.value = FALLBACK_BRICK_ATLAS_DATA_TEXTURE;
    (uniforms.u_brickAtlasSize.value as THREE.Vector3).set(1, 1, 1);
    return;
  }

  if (
    exceeds3DTextureSizeLimit(
      { width: atlasBuild.width, height: atlasBuild.height, depth: atlasBuild.depth },
      options?.max3DTextureSize
    )
  ) {
    disposeBrickAtlasDataTexture(resource);
    uniforms.u_brickAtlasEnabled.value = 0;
    uniforms.u_brickAtlasData.value = FALLBACK_BRICK_ATLAS_DATA_TEXTURE;
    (uniforms.u_brickAtlasSize.value as THREE.Vector3).set(1, 1, 1);
    return;
  }

  resource.brickAtlasDataTexture = updateOrCreateByte3dTexture(
    resource.brickAtlasDataTexture,
    atlasBuild.data,
    atlasBuild.width,
    atlasBuild.height,
    atlasBuild.depth,
    atlasBuild.textureFormat,
    atlasTextureFilterMode,
    atlasTexturesDirty,
  );
  resource.brickAtlasSourceToken = atlasSourceToken;
  resource.brickAtlasSourceData = options?.atlasData ?? options?.textureData ?? null;
  resource.brickAtlasSourceFormat = atlasFormat ?? null;
  resource.brickAtlasSourcePageTable = pageTable;
  resource.brickAtlasBuildVersion = (resource.brickAtlasBuildVersion ?? 0) + 1;
  uniforms.u_brickAtlasEnabled.value = 1;
  uniforms.u_brickAtlasData.value = resource.brickAtlasDataTexture;
  (uniforms.u_brickAtlasSize.value as THREE.Vector3).set(
    atlasBuild.width,
    atlasBuild.height,
    atlasBuild.depth,
  );
}

function resolveLayerRenderSource(
  layer: UseVolumeResourcesParams['layers'][number]
): LayerRenderSource | null {
  const volume = layer.volume ?? null;
  const brickAtlas = layer.brickAtlas ?? null;
  const pageTable = layer.brickPageTable ?? brickAtlas?.pageTable ?? null;
  if (volume) {
    return {
      width: volume.width,
      height: volume.height,
      depth: volume.depth,
      channels: volume.channels,
      volume,
      pageTable,
      brickAtlas
    };
  }
  if (brickAtlas?.enabled && pageTable) {
    const depth = layer.fullResolutionDepth > 0 ? layer.fullResolutionDepth : pageTable.volumeShape[0];
    const height = layer.fullResolutionHeight > 0 ? layer.fullResolutionHeight : pageTable.volumeShape[1];
    const width = layer.fullResolutionWidth > 0 ? layer.fullResolutionWidth : pageTable.volumeShape[2];
    return {
      width,
      height,
      depth,
      channels: brickAtlas.sourceChannels,
      volume: null,
      pageTable,
      brickAtlas
    };
  }
  return null;
}

export function useVolumeResources({
  layers,
  primaryVolume,
  isAdditiveBlending,
  renderContextRevision,
  rendererRef,
  sceneRef,
  cameraRef,
  controlsRef,
  rotationTargetRef,
  defaultViewStateRef,
  trackGroupRef,
  resourcesRef: providedResourcesRef,
  currentDimensionsRef: providedCurrentDimensionsRef,
  colormapCacheRef: providedColormapCacheRef,
  volumeRootGroupRef: providedVolumeRootGroupRef,
  volumeRootBaseOffsetRef: providedVolumeRootBaseOffsetRef,
  volumeRootCenterOffsetRef: providedVolumeRootCenterOffsetRef,
  volumeRootCenterUnscaledRef: providedVolumeRootCenterUnscaledRef,
  volumeRootHalfExtentsRef: providedVolumeRootHalfExtentsRef,
  volumeNormalizationScaleRef: providedVolumeNormalizationScaleRef,
  volumeUserScaleRef: providedVolumeUserScaleRef,
  volumeStepScaleRef: providedVolumeStepScaleRef,
  volumeYawRef: providedVolumeYawRef,
  volumePitchRef: providedVolumePitchRef,
  volumeRootRotatedCenterTempRef: providedVolumeRootRotatedCenterTempRef,
  applyTrackGroupTransform,
  applyVolumeRootTransform,
  applyVolumeStepScaleToResources,
  applyHoverHighlightToResources,
}: UseVolumeResourcesParams) {
  const resourcesRef = providedResourcesRef ?? useRef<Map<string, VolumeResources>>(new Map());
  const additiveBlendingRef = useRef(isAdditiveBlending);
  const currentDimensionsRef =
    providedCurrentDimensionsRef ??
    useRef<{ width: number; height: number; depth: number } | null>(null);
  const colormapCacheRef = providedColormapCacheRef ?? useRef<Map<string, THREE.DataTexture>>(new Map());
  const volumeRootGroupRef = providedVolumeRootGroupRef ?? useRef<THREE.Group | null>(null);
  const volumeRootBaseOffsetRef = providedVolumeRootBaseOffsetRef ?? useRef(new THREE.Vector3());
  const volumeRootCenterOffsetRef = providedVolumeRootCenterOffsetRef ?? useRef(new THREE.Vector3());
  const volumeRootCenterUnscaledRef = providedVolumeRootCenterUnscaledRef ?? useRef(new THREE.Vector3());
  const volumeRootHalfExtentsRef = providedVolumeRootHalfExtentsRef ?? useRef(new THREE.Vector3());
  const volumeNormalizationScaleRef = providedVolumeNormalizationScaleRef ?? useRef(1);
  const volumeUserScaleRef = providedVolumeUserScaleRef ?? useRef(1);
  const volumeStepScaleRef = providedVolumeStepScaleRef ?? useRef(DESKTOP_VOLUME_STEP_SCALE);
  const volumeYawRef = providedVolumeYawRef ?? useRef(0);
  const volumePitchRef = providedVolumePitchRef ?? useRef(0);
  const volumeRootRotatedCenterTempRef =
    providedVolumeRootRotatedCenterTempRef ?? useRef(new THREE.Vector3());

  const getColormapTexture = useCallback((color: string) => {
    const normalized = normalizeHexColor(color, DEFAULT_LAYER_COLOR);
    const cache = colormapCacheRef.current;
    let texture = cache.get(normalized) ?? null;
    if (!texture) {
      texture = createColormapTexture(normalized);
      cache.set(normalized, texture);
    }
    return texture;
  }, []);

  const applyAdditiveBlendingToResources = useCallback(() => {
    const isAdditive = additiveBlendingRef.current;

    resourcesRef.current.forEach((resource) => {
      const additiveEnabled = resolveLayerAdditiveEnabled(isAdditive, resource.renderStyle);
      const materialBlending = additiveEnabled ? THREE.AdditiveBlending : THREE.NormalBlending;
      const applyToMaterial = (material: THREE.Material) => {
        const shaderMaterial = material as THREE.ShaderMaterial | THREE.RawShaderMaterial;
        const uniforms = shaderMaterial.uniforms;
        if (uniforms?.u_additive) {
          uniforms.u_additive.value = additiveEnabled ? 1 : 0;
        }
        if (material instanceof THREE.ShaderMaterial) {
          if (resource.mode === '3d') {
            applyVolumeMaterialRenderStyle(material, resource.renderStyle, materialBlending);
          } else if (material.blending !== materialBlending) {
            material.blending = materialBlending;
            material.needsUpdate = true;
          }
        } else {
          material.blending = materialBlending;
        }
      };

      const { material } = resource.mesh;
      if (Array.isArray(material)) {
        material.forEach(applyToMaterial);
      } else {
        applyToMaterial(material);
      }
    });

    applyHoverHighlightToResources();
  }, [applyHoverHighlightToResources, resourcesRef]);

  useEffect(() => {
    additiveBlendingRef.current = isAdditiveBlending;
    applyAdditiveBlendingToResources();
  }, [applyAdditiveBlendingToResources, isAdditiveBlending]);

  useEffect(() => {
    const flushRendererRenderLists = () => {
      rendererRef?.current?.renderLists?.dispose?.();
    };

    const removeResource = (key: string) => {
      const resource = resourcesRef.current.get(key);
      if (!resource) {
        return;
      }
      const parent = resource.mesh.parent;
      if (parent) {
        parent.remove(resource.mesh);
      } else {
        const activeScene = sceneRef.current;
        if (activeScene) {
          activeScene.remove(resource.mesh);
        }
      }
      resource.mesh.geometry.dispose();
      disposeMaterial(resource.mesh.material);
      resource.texture.dispose();
      resource.labelTexture?.dispose();
      disposeBrickPageTableTextures(resource);
      resourcesRef.current.delete(key);
      flushRendererRenderLists();
    };

    const removeAllResources = () => {
      for (const key of Array.from(resourcesRef.current.keys())) {
        removeResource(key);
      }
    };

    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) {
      removeAllResources();
      currentDimensionsRef.current = null;
      applyVolumeRootTransform(null);
      return;
    }

    const referenceSource =
      primaryVolume
        ? { width: primaryVolume.width, height: primaryVolume.height, depth: primaryVolume.depth }
        : (() => {
            for (const layer of layers) {
              const source = resolveLayerRenderSource(layer);
              if (source) {
                return { width: source.width, height: source.height, depth: source.depth };
              }
            }
            return null;
          })();

    if (!referenceSource) {
      removeAllResources();
      currentDimensionsRef.current = null;
      rotationTargetRef.current.set(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();
      defaultViewStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
      const trackGroup = trackGroupRef.current;
      if (trackGroup) {
        trackGroup.visible = false;
      }
      applyTrackGroupTransform(null);
      applyVolumeRootTransform(null);
      return;
    }

    const { width, height, depth } = referenceSource;
    const dimensionsChanged =
      !currentDimensionsRef.current ||
      currentDimensionsRef.current.width !== width ||
      currentDimensionsRef.current.height !== height ||
      currentDimensionsRef.current.depth !== depth;

    if (dimensionsChanged) {
      removeAllResources();
      currentDimensionsRef.current = { width, height, depth };
      volumeUserScaleRef.current = 1;

      const maxDimension = Math.max(width, height, depth);
      const scale = 1 / maxDimension;
      const boundingRadius = Math.sqrt(width * width + height * height + depth * depth) * scale * 0.5;
      const fovInRadians = THREE.MathUtils.degToRad(camera.fov * 0.5);
      const distance = boundingRadius / Math.sin(fovInRadians);
      const safeDistance = Number.isFinite(distance) ? distance * 1.2 : 2.5;
      const nearDistance = Math.max(0.0001, boundingRadius * 0.00025);
      const farDistance = Math.max(safeDistance * 5, boundingRadius * 10);
      if (camera.near !== nearDistance || camera.far !== farDistance) {
        camera.near = nearDistance;
        camera.far = farDistance;
        camera.updateProjectionMatrix();
      }
      camera.position.set(0, 0, safeDistance);
      const rotationTarget = rotationTargetRef.current;
      rotationTarget.set(0, 0, 0);
      controls.target.copy(rotationTarget);
      controls.update();
      defaultViewStateRef.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
      };
      controls.saveState();

      applyTrackGroupTransform({ width, height, depth });
      applyVolumeRootTransform({ width, height, depth });
    }

    const seenKeys = new Set<string>();
    const max3DTextureSize = resolveRendererMax3DTextureSize(rendererRef);

    const assignGpuResidencyUpdater = ({
      resource,
      mesh,
      uniforms,
      pageTable,
      brickAtlas,
      directAtlasFormat,
    }: {
      resource: VolumeResources;
      mesh: THREE.Mesh;
      uniforms: ShaderUniformMap;
      pageTable: VolumeBrickPageTable | null;
      brickAtlas: VolumeBrickAtlas | null;
      directAtlasFormat: TextureFormat | null;
    }) => {
      if (!pageTable || !brickAtlas || !directAtlasFormat) {
        resource.updateGpuBrickResidencyForCamera = null;
        return;
      }

      const atlasSize = {
        width: brickAtlas.width,
        height: brickAtlas.height,
        depth: brickAtlas.depth,
      };

      const localCameraPosition = new THREE.Vector3();
      const lastResidencyCameraPosition = new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN);
      resource.updateGpuBrickResidencyForCamera = (cameraWorldPosition: THREE.Vector3) => {
        localCameraPosition.copy(cameraWorldPosition);
        mesh.worldToLocal(localCameraPosition);
        const hasPendingResidencyWork = (resource.gpuBrickResidencyMetrics?.pendingBricks ?? 0) > 0;
        const hasLastResidencyCamera = Number.isFinite(lastResidencyCameraPosition.x);
        if (
          hasLastResidencyCamera &&
          !hasPendingResidencyWork &&
          lastResidencyCameraPosition.distanceToSquared(localCameraPosition) <= CAMERA_RESIDENCY_EPSILON_SQ
        ) {
          return;
        }
        lastResidencyCameraPosition.copy(localCameraPosition);
        applyBrickPageTableUniforms(uniforms, resource, pageTable, {
          atlasDataToken: brickAtlas,
          atlasData: brickAtlas.data,
          atlasFormat: directAtlasFormat,
          atlasSize,
          max3DTextureSize,
          cameraPosition: localCameraPosition,
          forceFullResidency: false,
        });
      };
    };

    layers.forEach((layer, index) => {
      const source = resolveLayerRenderSource(layer);
      if (!source) {
        removeResource(layer.key);
        return;
      }
      const { volume, pageTable, brickAtlas, width, height, depth, channels } = source;
      const sourceUsesVolume = Boolean(volume);

      let cachedPreparation: ReturnType<typeof getCachedTextureData> | null = null;

      const isGrayscale = channels === 1;
      const colormapTexture = getColormapTexture(isGrayscale ? layer.color : DEFAULT_LAYER_COLOR);

      let resources: VolumeResources | null = resourcesRef.current.get(layer.key) ?? null;

      const viewerMode =
        layer.mode === 'slice' || layer.mode === '3d'
          ? layer.mode
          : depth > 1
            ? '3d'
            : 'slice';
      const zIndex = Number.isFinite(layer.sliceIndex)
        ? Number(layer.sliceIndex)
        : Math.floor(depth / 2);
      const effectiveSamplingMode = resolveSamplingModeForRenderStyle(layer.renderStyle, layer.samplingMode);
      const layerAdditiveEnabled = resolveLayerAdditiveEnabled(
        additiveBlendingRef.current,
        layer.renderStyle,
      );
      const layerMaterialBlending = layerAdditiveEnabled
        ? THREE.AdditiveBlending
        : THREE.NormalBlending;
      const slicePlaneState: SlicePlaneLayerState = {
        renderStyle: layer.renderStyle,
        slicedPlanePoint: layer.slicedPlanePoint ?? null,
        slicedPlaneNormal: layer.slicedPlaneNormal ?? null,
        slicedPlaneEnabled: layer.slicedPlaneEnabled,
      };

      if (viewerMode === '3d') {
        if (volume) {
          cachedPreparation = getCachedTextureData(volume);
        }
        const textureData = cachedPreparation?.data ?? FALLBACK_VOLUME_TEXTURE_DATA;
        const textureFormat = cachedPreparation?.format ?? THREE.RedFormat;
        const directAtlasFormat = brickAtlas ? getTextureFormatFromBrickAtlas(brickAtlas) : null;

        let labelTexture: THREE.Data3DTexture | null = null;
        if (layer.isSegmentation && volume?.segmentationLabels) {
          labelTexture = new THREE.Data3DTexture(
            volume.segmentationLabels,
            volume.width,
            volume.height,
            volume.depth,
          );
          labelTexture.format = THREE.RedIntegerFormat;
          labelTexture.type = THREE.UnsignedIntType;
          labelTexture.minFilter = THREE.NearestFilter;
          labelTexture.magFilter = THREE.NearestFilter;
          labelTexture.unpackAlignment = 1;
          labelTexture.needsUpdate = true;
        }

        const needsRebuild =
          !resources ||
          resources.mode !== viewerMode ||
          resources.renderStyle !== layer.renderStyle ||
          resources.dimensions.width !== width ||
          resources.dimensions.height !== height ||
          resources.dimensions.depth !== depth ||
          resources.channels !== channels ||
          !(resources.texture instanceof THREE.Data3DTexture) ||
          resources.texture.image.data.length !== textureData.length ||
          resources.texture.format !== textureFormat;

        if (needsRebuild) {
          removeResource(layer.key);

          const texture = sourceUsesVolume
            ? new THREE.Data3DTexture(textureData, width, height, depth)
            : createFallbackVolumeDataTexture();
          texture.format = sourceUsesVolume ? textureFormat : THREE.RedFormat;
          texture.type = THREE.UnsignedByteType;
          applyVolumeTextureSampling(texture, effectiveSamplingMode);
          texture.unpackAlignment = 1;
          texture.colorSpace = THREE.LinearSRGBColorSpace;
          texture.needsUpdate = true;

          const shader = VolumeRenderShaderVariants[getVolumeRenderShaderVariantKey(layer.renderStyle)];
          const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
          uniforms.u_data.value = texture;
          uniforms.u_size.value.set(width, height, depth);
          uniforms.u_clim.value.set(0, 1);
          uniforms.u_renderstyle.value = layer.renderStyle;
          uniforms.u_renderthreshold.value = 0.5;
          uniforms.u_cmdata.value = colormapTexture;
          uniforms.u_channels.value = channels;
          uniforms.u_windowMin.value = layer.windowMin;
          uniforms.u_windowMax.value = layer.windowMax;
          uniforms.u_invert.value = layer.invert ? 1 : 0;
          uniforms.u_stepScale.value = volumeStepScaleRef.current;
          uniforms.u_nearestSampling.value = effectiveSamplingMode === 'nearest' ? 1 : 0;
          applyAdaptiveLodUniforms(uniforms as ShaderUniformMap, effectiveSamplingMode);
          applyBeerLambertUniforms(uniforms as ShaderUniformMap, layer);
          applySlicePlaneUniforms(uniforms as ShaderUniformMap, slicePlaneState);
          if (uniforms.u_segmentationLabels) {
            uniforms.u_segmentationLabels.value = labelTexture ?? FALLBACK_SEGMENTATION_LABEL_TEXTURE;
          }
          if (uniforms.u_additive) {
            uniforms.u_additive.value = layerAdditiveEnabled ? 1 : 0;
          }

          const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: THREE.BackSide,
            transparent: !isSlicedRenderStyle(layer.renderStyle),
            blending: layerMaterialBlending,
          });
          material.depthWrite = isSlicedRenderStyle(layer.renderStyle);
          material.depthTest = true;
          applyVolumeMaterialRenderStyle(material, layer.renderStyle, layerMaterialBlending);

          const geometry = new THREE.BoxGeometry(width, height, depth);
          geometry.translate(width / 2 - 0.5, height / 2 - 0.5, depth / 2 - 0.5);

          const mesh = new THREE.Mesh(geometry, material);
          mesh.visible = layer.visible;
          mesh.renderOrder = index;
          mesh.position.set(layer.offsetX, layer.offsetY, 0);
          assignVolumeMeshOnBeforeRender(mesh, slicePlaneState);

          const volumeRootGroup = volumeRootGroupRef.current;
          if (volumeRootGroup) {
            volumeRootGroup.add(mesh);
          } else {
            scene.add(mesh);
          }
          flushRendererRenderLists();
          mesh.updateMatrixWorld(true);
          const residencyCameraPosition = (() => {
            const activeCamera = cameraRef.current;
            if (!activeCamera) {
              return null;
            }
            const local = new THREE.Vector3();
            local.setFromMatrixPosition(activeCamera.matrixWorld);
            mesh.worldToLocal(local);
            return local;
          })();

          const nextResource: VolumeResources = {
            mesh,
            texture,
            labelTexture,
            dimensions: { width, height, depth },
            channels,
            mode: viewerMode,
            renderStyle: layer.renderStyle,
            samplingMode: effectiveSamplingMode,
            brickPageTable: pageTable,
            brickOccupancyTexture: null,
            brickMinTexture: null,
            brickMaxTexture: null,
            brickAtlasIndexTexture: null,
            brickAtlasDataTexture: null,
            brickMetadataSourcePageTable: null,
            brickAtlasSourceToken: null,
            brickAtlasSourceData: null,
            brickAtlasSourceFormat: null,
            brickAtlasSourcePageTable: null,
            brickAtlasBuildVersion: 0,
            updateGpuBrickResidencyForCamera: null,
          };
          applyBrickPageTableUniforms(
            uniforms as ShaderUniformMap,
            nextResource,
            pageTable,
            brickAtlas
                ? {
                    atlasDataToken: brickAtlas,
                    atlasData: brickAtlas.data,
                    atlasFormat: directAtlasFormat ?? undefined,
                    atlasSize: { width: brickAtlas.width, height: brickAtlas.height, depth: brickAtlas.depth },
                    max3DTextureSize,
                    cameraPosition: residencyCameraPosition,
                    forceFullResidency: true
                  }
              : volume
                ? {
                    textureDataToken: volume.normalized,
                    textureData,
                    textureFormat,
                    max3DTextureSize,
                  }
                : undefined,
          );
          assignGpuResidencyUpdater({
            resource: nextResource,
            mesh,
            uniforms: uniforms as ShaderUniformMap,
            pageTable,
            brickAtlas,
            directAtlasFormat,
          });
          resourcesRef.current.set(layer.key, nextResource);
        }

        resources = resourcesRef.current.get(layer.key) ?? null;
      } else {
        const maxIndex = Math.max(0, depth - 1);
        const clampedIndex = Math.min(Math.max(zIndex, 0), maxIndex);
        const expectedLength = volume ? getExpectedSliceBufferLength(volume) : 0;

        const needsRebuild =
          !resources ||
          resources.mode !== viewerMode ||
          resources.dimensions.width !== width ||
          resources.dimensions.height !== height ||
          resources.dimensions.depth !== depth ||
          resources.channels !== channels ||
          !(resources.texture instanceof THREE.DataTexture) ||
          (volume && (resources.sliceBuffer?.length ?? 0) !== expectedLength);

        if (needsRebuild) {
          removeResource(layer.key);

          const sliceTexture = (() => {
            if (!volume) {
              const fallbackTexture = new THREE.DataTexture(
                FALLBACK_VOLUME_TEXTURE_DATA.slice(),
                1,
                1,
                THREE.RedFormat,
              );
              fallbackTexture.type = THREE.UnsignedByteType;
              fallbackTexture.minFilter = THREE.LinearFilter;
              fallbackTexture.magFilter = THREE.LinearFilter;
              fallbackTexture.unpackAlignment = 1;
              fallbackTexture.colorSpace = THREE.LinearSRGBColorSpace;
              fallbackTexture.needsUpdate = true;
              return { texture: fallbackTexture, sliceBuffer: null as Uint8Array | null };
            }
            const sliceInfo = prepareSliceTexture(volume, clampedIndex, null);
            const texture = new THREE.DataTexture(
              sliceInfo.data,
              volume.width,
              volume.height,
              sliceInfo.format,
            );
            texture.type = THREE.UnsignedByteType;
            texture.minFilter = THREE.LinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.unpackAlignment = 1;
            texture.colorSpace = THREE.LinearSRGBColorSpace;
            texture.needsUpdate = true;
            return { texture, sliceBuffer: sliceInfo.data };
          })();

          const texture = sliceTexture.texture;
          const shader = SliceRenderShader;
          const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
          const sliceUniforms = uniforms as ShaderUniformMap;
          uniforms.u_slice.value = texture;
          if ('u_size' in sliceUniforms) {
            (sliceUniforms.u_size.value as THREE.Vector3).set(width, height, depth);
          }
          if ('u_sliceIndex' in sliceUniforms) {
            sliceUniforms.u_sliceIndex.value = clampedIndex;
          }
          uniforms.u_cmdata.value = colormapTexture;
          uniforms.u_channels.value = channels;
          uniforms.u_windowMin.value = layer.windowMin;
          uniforms.u_windowMax.value = layer.windowMax;
          uniforms.u_invert.value = layer.invert ? 1 : 0;
          if (uniforms.u_additive) {
            uniforms.u_additive.value = layerAdditiveEnabled ? 1 : 0;
          }

          const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            transparent: true,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
            blending: layerMaterialBlending,
          });

          const geometry = new THREE.PlaneGeometry(width, height);
          geometry.translate(width / 2 - 0.5, height / 2 - 0.5, 0);

          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(layer.offsetX, layer.offsetY, clampedIndex);
          mesh.visible = layer.visible;
          mesh.renderOrder = index;
          const volumeRootGroup = volumeRootGroupRef.current;
          if (volumeRootGroup) {
            volumeRootGroup.add(mesh);
          } else {
            scene.add(mesh);
          }
          flushRendererRenderLists();

          const nextResource: VolumeResources = {
            mesh,
            texture,
            dimensions: { width, height, depth },
            channels,
            mode: viewerMode,
            renderStyle: layer.renderStyle,
            samplingMode: effectiveSamplingMode,
            sliceBuffer: sliceTexture.sliceBuffer,
            brickPageTable: pageTable,
            brickOccupancyTexture: null,
            brickMinTexture: null,
            brickMaxTexture: null,
            brickAtlasIndexTexture: null,
            brickAtlasDataTexture: null,
            brickMetadataSourcePageTable: null,
            brickAtlasSourceToken: null,
            brickAtlasSourceData: null,
            brickAtlasSourceFormat: null,
            brickAtlasSourcePageTable: null,
            brickAtlasBuildVersion: 0,
            updateGpuBrickResidencyForCamera: null,
          };

          const directAtlasFormat = brickAtlas ? getTextureFormatFromBrickAtlas(brickAtlas) : null;
          applyBrickPageTableUniforms(
            uniforms as ShaderUniformMap,
            nextResource,
            volume ? null : pageTable,
            !volume && brickAtlas
              ? {
                  atlasDataToken: brickAtlas,
                  atlasData: brickAtlas.data,
                  atlasFormat: directAtlasFormat ?? undefined,
                  atlasSize: { width: brickAtlas.width, height: brickAtlas.height, depth: brickAtlas.depth },
                  max3DTextureSize,
                  forceFullResidency: true,
                }
                : undefined,
          );
          resourcesRef.current.set(layer.key, nextResource);
        }

        resources = resourcesRef.current.get(layer.key) ?? null;
      }

      if (resources) {
        const { mesh } = resources;
        resources.brickPageTable = pageTable;
        resources.renderStyle = layer.renderStyle;
        mesh.visible = layer.visible;
        mesh.renderOrder = index;

        const materialUniforms = (mesh.material as THREE.ShaderMaterial).uniforms as ShaderUniformMap;
        materialUniforms.u_channels.value = channels;
        materialUniforms.u_windowMin.value = layer.windowMin;
        materialUniforms.u_windowMax.value = layer.windowMax;
        materialUniforms.u_invert.value = layer.invert ? 1 : 0;
        materialUniforms.u_cmdata.value = colormapTexture;
        if (materialUniforms.u_additive) {
          materialUniforms.u_additive.value = layerAdditiveEnabled ? 1 : 0;
        }
        applySlicePlaneUniforms(materialUniforms, slicePlaneState);
        const shaderMaterial = mesh.material as THREE.ShaderMaterial;
        const desiredBlending = layerMaterialBlending;
        if (resources.mode === '3d') {
          applyVolumeMaterialRenderStyle(shaderMaterial, layer.renderStyle, desiredBlending);
        } else if (shaderMaterial.blending !== desiredBlending) {
          shaderMaterial.blending = desiredBlending;
          shaderMaterial.needsUpdate = true;
        }
        if (materialUniforms.u_stepScale) {
          materialUniforms.u_stepScale.value = volumeStepScaleRef.current;
        }
        if (materialUniforms.u_nearestSampling) {
          materialUniforms.u_nearestSampling.value = effectiveSamplingMode === 'nearest' ? 1 : 0;
        }
        applyAdaptiveLodUniforms(materialUniforms, effectiveSamplingMode);
        applyBeerLambertUniforms(materialUniforms, layer);

        if (resources.mode === '3d') {
          assignVolumeMeshOnBeforeRender(mesh, slicePlaneState);
          const preparation = volume ? cachedPreparation ?? getCachedTextureData(volume) : null;
          const directAtlasFormat = brickAtlas ? getTextureFormatFromBrickAtlas(brickAtlas) : null;
          const residencyCameraPosition = (() => {
            const activeCamera = cameraRef.current;
            if (!activeCamera) {
              return null;
            }
            const local = new THREE.Vector3();
            local.setFromMatrixPosition(activeCamera.matrixWorld);
            mesh.worldToLocal(local);
            return local;
          })();
          applyBrickPageTableUniforms(
            materialUniforms,
            resources,
            pageTable,
            brickAtlas
              ? {
                  atlasDataToken: brickAtlas,
                  atlasData: brickAtlas.data,
                  atlasFormat: directAtlasFormat ?? undefined,
                  atlasSize: { width: brickAtlas.width, height: brickAtlas.height, depth: brickAtlas.depth },
                  max3DTextureSize,
                  cameraPosition: residencyCameraPosition,
                  forceFullResidency: true
                }
              : volume && preparation
                ? {
                    textureDataToken: volume.normalized,
                    textureData: preparation.data,
                    textureFormat: preparation.format,
                    max3DTextureSize,
                  }
                : undefined
          );
          assignGpuResidencyUpdater({
            resource: resources,
            mesh,
            uniforms: materialUniforms,
            pageTable,
            brickAtlas,
            directAtlasFormat,
          });
          const dataTexture = resources.texture as THREE.Data3DTexture;
          if (resources.samplingMode !== effectiveSamplingMode) {
            applyVolumeTextureSampling(dataTexture, effectiveSamplingMode);
            dataTexture.needsUpdate = true;
            resources.samplingMode = effectiveSamplingMode;
          }
          const nextTextureData = preparation ? preparation.data : FALLBACK_VOLUME_TEXTURE_DATA;
          const nextTextureWidth = preparation ? width : 1;
          const nextTextureHeight = preparation ? height : 1;
          const nextTextureDepth = preparation ? depth : 1;
          const nextTextureFormat = preparation ? preparation.format : THREE.RedFormat;
          const textureSourceChanged =
            dataTexture.image.data !== nextTextureData ||
            dataTexture.image.width !== nextTextureWidth ||
            dataTexture.image.height !== nextTextureHeight ||
            dataTexture.image.depth !== nextTextureDepth ||
            dataTexture.format !== nextTextureFormat;
          if (textureSourceChanged) {
            dataTexture.image.data = nextTextureData;
            dataTexture.image.width = nextTextureWidth;
            dataTexture.image.height = nextTextureHeight;
            dataTexture.image.depth = nextTextureDepth;
            dataTexture.format = nextTextureFormat;
            dataTexture.needsUpdate = true;
          }
          if (materialUniforms.u_data.value !== dataTexture) {
            materialUniforms.u_data.value = dataTexture;
          }
          if (materialUniforms.u_size) {
            const sizeUniform = materialUniforms.u_size.value as THREE.Vector3;
            if (sizeUniform.x !== width || sizeUniform.y !== height || sizeUniform.z !== depth) {
              sizeUniform.set(width, height, depth);
            }
          }
          if (layer.isSegmentation && volume?.segmentationLabels) {
            const expectedLength = volume.segmentationLabels.length;
            let labelTexture = resources.labelTexture ?? null;
            const needsLabelTextureRebuild =
              !labelTexture ||
              !(labelTexture.image?.data instanceof Uint32Array) ||
              labelTexture.image.data.length !== expectedLength;

            if (needsLabelTextureRebuild) {
              labelTexture?.dispose();
              labelTexture = new THREE.Data3DTexture(
                volume.segmentationLabels,
                volume.width,
                volume.height,
                volume.depth,
              );
              labelTexture.format = THREE.RedIntegerFormat;
              labelTexture.type = THREE.UnsignedIntType;
              labelTexture.minFilter = THREE.NearestFilter;
              labelTexture.magFilter = THREE.NearestFilter;
              labelTexture.unpackAlignment = 1;
              labelTexture.needsUpdate = true;
            } else if (labelTexture) {
              const labelsChanged =
                labelTexture.image.data !== volume.segmentationLabels ||
                labelTexture.image.width !== volume.width ||
                labelTexture.image.height !== volume.height ||
                labelTexture.image.depth !== volume.depth;
              if (labelsChanged) {
                labelTexture.image.data = volume.segmentationLabels;
                labelTexture.image.width = volume.width;
                labelTexture.image.height = volume.height;
                labelTexture.image.depth = volume.depth;
                labelTexture.needsUpdate = true;
              }
            }
            resources.labelTexture = labelTexture;
            if (materialUniforms.u_segmentationLabels) {
              materialUniforms.u_segmentationLabels.value = labelTexture;
            }
          } else if (materialUniforms.u_segmentationLabels) {
            materialUniforms.u_segmentationLabels.value = FALLBACK_SEGMENTATION_LABEL_TEXTURE;
            resources.labelTexture?.dispose();
            resources.labelTexture = null;
          }
          if (materialUniforms.u_renderstyle) {
            materialUniforms.u_renderstyle.value = layer.renderStyle;
          }

          const desiredX = layer.offsetX;
          const desiredY = layer.offsetY;
          if (mesh.position.x !== desiredX || mesh.position.y !== desiredY) {
            mesh.position.set(desiredX, desiredY, mesh.position.z);
            mesh.updateMatrixWorld();
          }
        } else {
          resources.updateGpuBrickResidencyForCamera = null;
          const maxIndex = Math.max(0, depth - 1);
          const clampedIndex = Math.min(Math.max(zIndex, 0), maxIndex);
          if (materialUniforms.u_size) {
            (materialUniforms.u_size.value as THREE.Vector3).set(width, height, depth);
          }
          if (materialUniforms.u_sliceIndex) {
            materialUniforms.u_sliceIndex.value = clampedIndex;
          }

          const directAtlasFormat = brickAtlas ? getTextureFormatFromBrickAtlas(brickAtlas) : null;
          applyBrickPageTableUniforms(
            materialUniforms,
            resources,
            volume ? null : pageTable,
            !volume && brickAtlas
              ? {
                  atlasDataToken: brickAtlas,
                  atlasData: brickAtlas.data,
                  atlasFormat: directAtlasFormat ?? undefined,
                  atlasSize: { width: brickAtlas.width, height: brickAtlas.height, depth: brickAtlas.depth },
                  max3DTextureSize,
                  forceFullResidency: true,
                }
                : undefined,
          );

          if (volume) {
            const existingBuffer = resources.sliceBuffer ?? null;
            const sliceInfo = prepareSliceTexture(volume, clampedIndex, existingBuffer);
            resources.sliceBuffer = sliceInfo.data;
            const dataTexture = resources.texture as THREE.DataTexture;
            dataTexture.image.data = sliceInfo.data;
            dataTexture.image.width = volume.width;
            dataTexture.image.height = volume.height;
            dataTexture.format = sliceInfo.format;
            dataTexture.needsUpdate = true;
            materialUniforms.u_slice.value = dataTexture;
          }

          const desiredX = layer.offsetX;
          const desiredY = layer.offsetY;
          if (
            mesh.position.x !== desiredX ||
            mesh.position.y !== desiredY ||
            mesh.position.z !== clampedIndex
          ) {
            mesh.position.set(desiredX, desiredY, clampedIndex);
            mesh.updateMatrixWorld();
          }
        }
      }

      seenKeys.add(layer.key);
    });

    for (const key of Array.from(resourcesRef.current.keys())) {
      if (!seenKeys.has(key)) {
        removeResource(key);
      }
    }

    applyHoverHighlightToResources();
  }, [
    applyTrackGroupTransform,
    applyVolumeStepScaleToResources,
    getColormapTexture,
    layers,
    renderContextRevision,
    applyHoverHighlightToResources,
    applyVolumeRootTransform,
    primaryVolume,
    cameraRef,
    controlsRef,
    rotationTargetRef,
    defaultViewStateRef,
    trackGroupRef,
    rendererRef,
    sceneRef,
  ]);

  useEffect(() => {
    return () => {
      for (const texture of colormapCacheRef.current.values()) {
        texture.dispose();
      }
      colormapCacheRef.current.clear();
    };
  }, []);

  return {
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
    getColormapTexture,
    applyVolumeStepScaleToResources,
  };
}
