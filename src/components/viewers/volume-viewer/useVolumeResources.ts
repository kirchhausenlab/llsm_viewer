import { useCallback, useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

import { DEFAULT_LAYER_COLOR, normalizeHexColor } from '../../../shared/colorMaps/layerColors';
import {
  createColormapTexture,
  disposeMaterial,
  getExpectedSliceBufferLength,
  prepareSliceTexture,
  prepareSliceTextureFromBrickAtlas,
} from './rendering';
import { SliceRenderShader } from '../../../shaders/sliceRenderShader';
import { getVolumeRenderShaderVariantKey, VolumeRenderShaderVariants } from '../../../shaders/volumeRenderShader';
import { getCachedTextureData } from '../../../core/textureCache';
import {
  createSegmentationColorTable,
  isIntensityVolume,
  isSegmentationVolume,
  type IntensityVolume,
  type NormalizedVolume
} from '../../../core/volumeProcessing';
import type { VolumeResources } from '../VolumeViewer.types';
import { DESKTOP_VOLUME_STEP_SCALE } from './vr';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import type { VolumeBrickAtlas, VolumeBrickPageTable } from '../../../core/volumeProvider';
import { getLod0FeatureFlags } from '../../../config/lod0Flags';
import {
  buildBrickSubcellChunkData,
  buildBrickSubcellTextureSize,
  resolveBrickSubcellGrid,
  writeBrickSubcellChunkData
} from '../../../shared/utils/brickSubcell';
import { shouldPreferDirectVolumeSampling } from '../../../shared/utils/lod0Residency';
import {
  FALLBACK_BACKGROUND_MASK_TEXTURE,
  FALLBACK_BRICK_ATLAS_BASE_TEXTURE,
  FALLBACK_BRICK_ATLAS_DATA_TEXTURE,
  FALLBACK_BRICK_ATLAS_INDEX_TEXTURE,
  FALLBACK_BRICK_MAX_TEXTURE,
  FALLBACK_BRICK_MIN_TEXTURE,
  FALLBACK_BRICK_OCCUPANCY_TEXTURE,
  FALLBACK_BRICK_SUBCELL_TEXTURE,
  FALLBACK_SEGMENTATION_LABEL_TEXTURE,
  FALLBACK_SEGMENTATION_PALETTE_TEXTURE,
} from './fallbackTextures';
import {
  RENDER_STYLE_SLICE,
  type LayerSettings,
  type RenderStyle,
} from '../../../state/layerSettings';
import { createSegmentationSeed } from '../../../shared/utils/appHelpers';

type UseVolumeResourcesParams = {
  layers: import('../VolumeViewer.types').VolumeViewerProps['layers'];
  playbackWarmupLayers?: import('../VolumeViewer.types').VolumeViewerProps['playbackWarmupLayers'];
  primaryVolume: NormalizedVolume | null;
  isAdditiveBlending: boolean;
  zClipFrontFraction: number;
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

type ManagedViewerLayer = UseVolumeResourcesParams['layers'][number];

type ShaderUniformMap = Record<string, { value: unknown }>;
type TextureFormat = THREE.Data3DTexture['format'];
type TextureSourceArray = Uint8Array | Uint16Array;
type ByteTextureFilterMode = 'nearest' | 'linear';
type BrickAtlasBuildResult = {
  data: TextureSourceArray;
  width: number;
  height: number;
  depth: number;
  textureFormat: TextureFormat;
  enabled: boolean;
};

type BrickSubcellTextureBuildResult = {
  data: Uint8Array;
  width: number;
  height: number;
  depth: number;
  subcellGrid: { x: number; y: number; z: number };
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
  slotGridX: number;
  slotGridY: number;
  slotGridZ: number;
  allocatedSlotCapacity: number;
  atlasWidth: number;
  atlasHeight: number;
  atlasDepth: number;
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
    | 'disabled-for-direct-volume-linear'
    | 'missing-page-table'
    | 'invalid-page-table'
    | 'invalid-min-max-range'
    | 'invalid-hierarchy-shape'
    | 'invalid-hierarchy-level-order';
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
const ADAPTIVE_LOD_SCALE_LINEAR = 0.35;
const ADAPTIVE_LOD_MAX_LINEAR = 0.75;
const BOOTSTRAP_UPLOAD_BURST_UPDATES = 3;
const BOOTSTRAP_UPLOAD_BURST_MULTIPLIER = 8;
const BOOTSTRAP_UPLOAD_BURST_MAX = 256;
const RESIDENCY_STICKINESS_TICKS = 4;
const CAMERA_RESIDENCY_EPSILON_SQ = 0.25;
const MAX_SKIP_HIERARCHY_LEVELS = 12;
const BRICK_ATLAS_HALO_VOXELS = 1;
const LOD0_FLAGS = getLod0FeatureFlags();
const gpuBrickResidencyStateByResource = new WeakMap<VolumeResources, BrickResidencyState>();
const sharedBackgroundMaskTextureCache = new WeakMap<object, {
  texture: THREE.Data3DTexture;
  refCount: number;
}>();
const brickAtlasIndexDataCache = new WeakMap<VolumeBrickPageTable, Float32Array>();
const segmentationPaletteTextureCache = new Map<string, THREE.DataTexture>();
const packedSegmentationTextureDataCache = new WeakMap<Uint16Array, Uint8Array>();

function resolveSamplingModeForRenderStyle(
  samplingMode: 'linear' | 'nearest',
  renderStyle: RenderStyle,
  isSegmentation = false,
): 'linear' | 'nearest' {
  if (isSegmentation) {
    return 'nearest';
  }
  if (renderStyle === RENDER_STYLE_SLICE) {
    return 'nearest';
  }
  return samplingMode;
}

function resolveLayerAdditiveEnabled(
  isAdditiveBlending: boolean,
): boolean {
  return isAdditiveBlending;
}

function applyVolumeMaterialState(
  material: THREE.ShaderMaterial,
  blending: THREE.Blending,
): void {
  let needsUpdate = false;
  if (material.transparent !== true) {
    material.transparent = true;
    needsUpdate = true;
  }
  if (material.depthWrite !== false) {
    material.depthWrite = false;
    needsUpdate = true;
  }
  if (material.depthTest !== true) {
    material.depthTest = true;
    needsUpdate = true;
  }
  if (material.blending !== blending) {
    material.blending = blending;
    needsUpdate = true;
  }
  if (needsUpdate) {
    material.needsUpdate = true;
  }
}

function assignVolumeMeshOnBeforeRender(
  mesh: THREE.Mesh,
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
  const adaptiveLodEnabled =
    samplingMode === 'linear' && LOD0_FLAGS.projectedFootprintShaderLod ? 1 : 0;
  if ('u_adaptiveLodEnabled' in uniforms) {
    uniforms.u_adaptiveLodEnabled.value = adaptiveLodEnabled;
  }
  if ('u_adaptiveLodScale' in uniforms) {
    uniforms.u_adaptiveLodScale.value = ADAPTIVE_LOD_SCALE_LINEAR;
  }
  if ('u_adaptiveLodMax' in uniforms) {
    uniforms.u_adaptiveLodMax.value = ADAPTIVE_LOD_MAX_LINEAR;
  }
  if ('u_blRefinementEnabled' in uniforms) {
    uniforms.u_blRefinementEnabled.value = LOD0_FLAGS.blRefinement ? 1 : 0;
  }
}

function applyBeerLambertUniforms(uniforms: ShaderUniformMap, layer: Pick<
  LayerSettings,
  'blDensityScale' | 'blBackgroundCutoff' | 'blOpacityScale' | 'blEarlyExitAlpha' | 'mipEarlyExitThreshold'
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
  if ('u_mipEarlyExitThreshold' in uniforms) {
    uniforms.u_mipEarlyExitThreshold.value = layer.mipEarlyExitThreshold;
  }
}

function createByte3dTexture(
  data: TextureSourceArray,
  width: number,
  height: number,
  depth: number,
  format: TextureFormat = THREE.RedFormat,
  filterMode: ByteTextureFilterMode = 'nearest',
): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(data, width, height, depth);
  texture.format = format;
  texture.type = data instanceof Uint16Array ? THREE.UnsignedShortType : THREE.UnsignedByteType;
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
  format: TextureFormat = THREE.RedFormat,
): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(data, width, height, depth);
  texture.format = format;
  texture.type = THREE.FloatType;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function acquireSharedBackgroundMaskTexture(mask: {
  data: Uint8Array;
  width: number;
  height: number;
  depth: number;
}): THREE.Data3DTexture {
  const key = mask as object;
  const cached = sharedBackgroundMaskTextureCache.get(key);
  if (cached) {
    cached.refCount += 1;
    return cached.texture;
  }
  const texture = createByte3dTexture(
    mask.data,
    mask.width,
    mask.height,
    mask.depth,
    THREE.RedFormat,
    'nearest',
  );
  sharedBackgroundMaskTextureCache.set(key, {
    texture,
    refCount: 1,
  });
  return texture;
}

function getSegmentationPaletteTexture(layerKey: string): THREE.DataTexture {
  const cached = segmentationPaletteTextureCache.get(layerKey);
  if (cached) {
    return cached;
  }
  const seed = createSegmentationSeed(layerKey);
  const paletteData = createSegmentationColorTable(seed);
  const texture = new THREE.DataTexture(paletteData, 256, 256, THREE.RGBAFormat);
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  segmentationPaletteTextureCache.set(layerKey, texture);
  return texture;
}

function packSegmentationLabelTextureData(labels: Uint16Array): Uint8Array {
  const cached = packedSegmentationTextureDataCache.get(labels);
  if (cached) {
    return cached;
  }
  const packed = new Uint8Array(labels.length * 2);
  for (let index = 0; index < labels.length; index += 1) {
    const label = labels[index] ?? 0;
    const targetOffset = index * 2;
    packed[targetOffset] = label & 0xff;
    packed[targetOffset + 1] = (label >>> 8) & 0xff;
  }
  packedSegmentationTextureDataCache.set(labels, packed);
  return packed;
}

function normalizeSegmentationTextureUpload({
  data,
  format,
  isSegmentation,
}: {
  data: TextureSourceArray | null | undefined;
  format: TextureFormat | null | undefined;
  isSegmentation: boolean;
}): {
  data: TextureSourceArray | null | undefined;
  format: TextureFormat | null | undefined;
} {
  if (!isSegmentation || !(data instanceof Uint16Array) || format !== THREE.RedFormat) {
    return { data, format };
  }
  return {
    data: packSegmentationLabelTextureData(data),
    format: THREE.RGFormat,
  };
}

function releaseSharedBackgroundMaskTexture(sourceToken: object | null | undefined): void {
  if (!sourceToken) {
    return;
  }
  const cached = sharedBackgroundMaskTextureCache.get(sourceToken);
  if (!cached) {
    return;
  }
  cached.refCount -= 1;
  if (cached.refCount > 0) {
    return;
  }
  cached.texture.dispose();
  sharedBackgroundMaskTextureCache.delete(sourceToken);
}

function applyBackgroundMaskUniforms(
  uniforms: ShaderUniformMap,
  resource: VolumeResources,
  backgroundMask: UseVolumeResourcesParams['layers'][number]['backgroundMask'],
): void {
  const previousSourceToken = resource.backgroundMaskSourceToken ?? null;
  const nextSourceToken = backgroundMask ?? null;
  if (previousSourceToken !== nextSourceToken) {
    releaseSharedBackgroundMaskTexture(previousSourceToken);
    resource.backgroundMaskTexture = nextSourceToken
      ? acquireSharedBackgroundMaskTexture(nextSourceToken)
      : null;
    resource.backgroundMaskSourceToken = nextSourceToken;
  }

  if (!backgroundMask || !resource.backgroundMaskTexture) {
    if ('u_backgroundMaskEnabled' in uniforms) {
      uniforms.u_backgroundMaskEnabled.value = 0;
    }
    if ('u_backgroundMask' in uniforms) {
      uniforms.u_backgroundMask.value = FALLBACK_BACKGROUND_MASK_TEXTURE;
    }
    if ('u_backgroundMaskSize' in uniforms) {
      (uniforms.u_backgroundMaskSize.value as THREE.Vector3).set(1, 1, 1);
    }
    if ('u_backgroundMaskVisibleBoundsEnabled' in uniforms) {
      uniforms.u_backgroundMaskVisibleBoundsEnabled.value = 0;
    }
    if ('u_backgroundMaskVisibleBoxMin' in uniforms) {
      (uniforms.u_backgroundMaskVisibleBoxMin.value as THREE.Vector3).set(-0.5, -0.5, -0.5);
    }
    if ('u_backgroundMaskVisibleBoxMax' in uniforms) {
      const { width, height, depth } = resource.dimensions;
      (uniforms.u_backgroundMaskVisibleBoxMax.value as THREE.Vector3).set(
        Math.max(width - 0.5, -0.5),
        Math.max(height - 0.5, -0.5),
        Math.max(depth - 0.5, -0.5),
      );
    }
    return;
  }

  if ('u_backgroundMaskEnabled' in uniforms) {
    uniforms.u_backgroundMaskEnabled.value = 1;
  }
  if ('u_backgroundMask' in uniforms) {
    uniforms.u_backgroundMask.value = resource.backgroundMaskTexture;
  }
  if ('u_backgroundMaskSize' in uniforms) {
    (uniforms.u_backgroundMaskSize.value as THREE.Vector3).set(
      backgroundMask.width,
      backgroundMask.height,
      backgroundMask.depth,
    );
  }
  const visibleBox = resolveBackgroundMaskVisibleBox(backgroundMask, resource.dimensions);
  if ('u_backgroundMaskVisibleBoundsEnabled' in uniforms) {
    uniforms.u_backgroundMaskVisibleBoundsEnabled.value = visibleBox.enabled ? 1 : 0;
  }
  if ('u_backgroundMaskVisibleBoxMin' in uniforms) {
    (uniforms.u_backgroundMaskVisibleBoxMin.value as THREE.Vector3).set(...visibleBox.min);
  }
  if ('u_backgroundMaskVisibleBoxMax' in uniforms) {
    (uniforms.u_backgroundMaskVisibleBoxMax.value as THREE.Vector3).set(...visibleBox.max);
  }
}

function resolveBackgroundMaskVisibleBox(
  backgroundMask: UseVolumeResourcesParams['layers'][number]['backgroundMask'],
  dimensions: { width: number; height: number; depth: number },
): {
  enabled: boolean;
  min: [number, number, number];
  max: [number, number, number];
  signature: string;
} {
  const fullMin: [number, number, number] = [-0.5, -0.5, -0.5];
  const fullMax: [number, number, number] = [
    Math.max(dimensions.width - 0.5, -0.5),
    Math.max(dimensions.height - 0.5, -0.5),
    Math.max(dimensions.depth - 0.5, -0.5),
  ];
  const visibleRegion = backgroundMask?.visibleRegion ?? null;
  if (!visibleRegion?.hasVisibleVoxels) {
    return {
      enabled: false,
      min: fullMin,
      max: fullMax,
      signature: `full:${dimensions.width}:${dimensions.height}:${dimensions.depth}`,
    };
  }
  const min: [number, number, number] = [
    -0.5 + visibleRegion.minFaceFractions[0] * dimensions.width,
    -0.5 + visibleRegion.minFaceFractions[1] * dimensions.height,
    -0.5 + visibleRegion.minFaceFractions[2] * dimensions.depth,
  ];
  const max: [number, number, number] = [
    -0.5 + visibleRegion.maxFaceFractions[0] * dimensions.width,
    -0.5 + visibleRegion.maxFaceFractions[1] * dimensions.height,
    -0.5 + visibleRegion.maxFaceFractions[2] * dimensions.depth,
  ];
  return {
    enabled: true,
    min,
    max,
    signature: `visible:${min.join(',')}:${max.join(',')}`,
  };
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
  source: TextureSourceArray,
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
      ((data instanceof Uint8Array && source instanceof Uint8Array) ||
        (data instanceof Uint16Array && source instanceof Uint16Array)) &&
      data.length === source.length
    ) {
      const hasSharedBuffer = data === source;
      if (!hasSharedBuffer) {
        data.set(source);
      }
      const formatChanged = existing.format !== format;
      const nextType = source instanceof Uint16Array ? THREE.UnsignedShortType : THREE.UnsignedByteType;
      const typeChanged = existing.type !== nextType;
      existing.format = format;
      existing.type = nextType;
      applyByteTextureFilter(existing, filterMode);
      if (!hasSharedBuffer || formatChanged || typeChanged || forceNeedsUpdate) {
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
  format: TextureFormat = THREE.RedFormat,
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
      const formatChanged = existing.format !== format;
      existing.format = format;
      if (!hasSharedBuffer || formatChanged || forceNeedsUpdate) {
        existing.needsUpdate = true;
      }
      return existing;
    }
    existing.dispose();
  }
  return createFloat3dTexture(source, width, height, depth, format);
}

function buildBrickAtlasBaseTextureData({
  pageTable,
  atlasIndices,
  slotGrid,
  atlasSize,
}: {
  pageTable: VolumeBrickPageTable;
  atlasIndices: Float32Array;
  slotGrid: { x: number; y: number; z: number };
  atlasSize: { width: number; height: number; depth: number };
}): Float32Array {
  const gridX = Math.max(1, pageTable.gridShape[2]);
  const gridY = Math.max(1, pageTable.gridShape[1]);
  const gridZ = Math.max(1, pageTable.gridShape[0]);
  const safeSlotGridX = Math.max(1, slotGrid.x);
  const safeSlotGridY = Math.max(1, slotGrid.y);
  const safeSlotGridZ = Math.max(1, slotGrid.z);
  const safeAtlasWidth = Math.max(1, atlasSize.width);
  const safeAtlasHeight = Math.max(1, atlasSize.height);
  const safeAtlasDepth = Math.max(1, atlasSize.depth);
  const atlasChunkWidth = safeAtlasWidth / safeSlotGridX;
  const atlasChunkHeight = safeAtlasHeight / safeSlotGridY;
  const atlasChunkDepth = safeAtlasDepth / safeSlotGridZ;
  const atlasChunkOffsetX = Math.max((atlasChunkWidth - Math.max(1, pageTable.chunkShape[2])) * 0.5, 0);
  const atlasChunkOffsetY = Math.max((atlasChunkHeight - Math.max(1, pageTable.chunkShape[1])) * 0.5, 0);
  const atlasChunkOffsetZ = Math.max((atlasChunkDepth - Math.max(1, pageTable.chunkShape[0])) * 0.5, 0);
  const slotsPerLayer = Math.max(1, safeSlotGridX * safeSlotGridY);
  const data = new Float32Array(gridX * gridY * gridZ * 4);

  for (let index = 0; index < atlasIndices.length; index += 1) {
    const atlasIndex = (atlasIndices[index] ?? 0) - 1;
    if (atlasIndex < 0) {
      continue;
    }
    const safeAtlasIndex = Math.max(0, Math.floor(atlasIndex + 0.5));
    const slotZ = Math.floor(safeAtlasIndex / slotsPerLayer);
    const withinLayer = safeAtlasIndex - slotZ * slotsPerLayer;
    const slotY = Math.floor(withinLayer / safeSlotGridX);
    const slotX = withinLayer - slotY * safeSlotGridX;
    const targetOffset = index * 4;
    data[targetOffset] = slotX * atlasChunkWidth + atlasChunkOffsetX;
    data[targetOffset + 1] = slotY * atlasChunkHeight + atlasChunkOffsetY;
    data[targetOffset + 2] = slotZ * atlasChunkDepth + atlasChunkOffsetZ;
    data[targetOffset + 3] = 1;
  }

  return data;
}

function buildBrickSubcellTextureData({
  pageTable,
  components,
  max3DTextureSize,
  readVoxelComponent,
}: {
  pageTable: VolumeBrickPageTable;
  components: number;
  max3DTextureSize: number | null | undefined;
  readVoxelComponent: (
    flatBrickIndex: number,
    localZ: number,
    localY: number,
    localX: number,
    component: number,
  ) => number;
}): BrickSubcellTextureBuildResult | null {
  if (components <= 0) {
    return null;
  }

  const chunkDepth = Math.max(1, pageTable.chunkShape[0]);
  const chunkHeight = Math.max(1, pageTable.chunkShape[1]);
  const chunkWidth = Math.max(1, pageTable.chunkShape[2]);
  const subcellGrid = resolveBrickSubcellGrid([chunkDepth, chunkHeight, chunkWidth]);
  if (!subcellGrid) {
    return null;
  }

  const widthHeightDepth = buildBrickSubcellTextureSize({
    gridShape: pageTable.gridShape,
    subcellGrid
  });
  const { width, height, depth } = widthHeightDepth;
  if (exceeds3DTextureSizeLimit({ width, height, depth }, max3DTextureSize)) {
    return null;
  }

  const data = new Uint8Array(width * height * depth * 4);
  const gridX = Math.max(1, pageTable.gridShape[2]);
  const gridY = Math.max(1, pageTable.gridShape[1]);
  const planeSize = gridX * gridY;

  for (let flatBrickIndex = 0; flatBrickIndex < pageTable.brickAtlasIndices.length; flatBrickIndex += 1) {
    if ((pageTable.chunkOccupancy[flatBrickIndex] ?? 0) <= 0) {
      continue;
    }
    const brickSubcellData = buildBrickSubcellChunkData({
      chunkShape: [chunkDepth, chunkHeight, chunkWidth],
      components,
      readVoxelComponent: (localZ, localY, localX, component) =>
        readVoxelComponent(flatBrickIndex, localZ, localY, localX, component)
    });
    if (!brickSubcellData) {
      return null;
    }
    if (
      brickSubcellData.subcellGrid.x !== subcellGrid.x ||
      brickSubcellData.subcellGrid.y !== subcellGrid.y ||
      brickSubcellData.subcellGrid.z !== subcellGrid.z
    ) {
      return null;
    }

    const brickZ = Math.floor(flatBrickIndex / planeSize);
    const withinPlane = flatBrickIndex % planeSize;
    const brickY = Math.floor(withinPlane / gridX);
    const brickX = withinPlane % gridX;
    writeBrickSubcellChunkData({
      targetData: data,
      targetSize: widthHeightDepth,
      brickCoords: { x: brickX, y: brickY, z: brickZ },
      chunkData: brickSubcellData.data,
      subcellGrid: brickSubcellData.subcellGrid
    });
  }

  return {
    data,
    width,
    height,
    depth,
    subcellGrid,
  };
}

function buildBrickSubcellTextureDataFromVolume({
  pageTable,
  textureData,
  textureFormat,
  max3DTextureSize,
}: {
  pageTable: VolumeBrickPageTable;
  textureData: TextureSourceArray;
  textureFormat: TextureFormat;
  max3DTextureSize: number | null | undefined;
}): BrickSubcellTextureBuildResult | null {
  const components = getTextureComponentsFromFormat(textureFormat);
  if (!components) {
    return null;
  }
  const volumeDepth = Math.max(1, pageTable.volumeShape[0]);
  const volumeHeight = Math.max(1, pageTable.volumeShape[1]);
  const volumeWidth = Math.max(1, pageTable.volumeShape[2]);
  const expectedLength = volumeWidth * volumeHeight * volumeDepth * components;
  if (textureData.length !== expectedLength) {
    return null;
  }

  return buildBrickSubcellTextureData({
    pageTable,
    components,
    max3DTextureSize,
    readVoxelComponent: (flatBrickIndex, localZ, localY, localX, component) => {
      const gridX = Math.max(1, pageTable.gridShape[2]);
      const gridY = Math.max(1, pageTable.gridShape[1]);
      const planeSize = gridX * gridY;
      const brickZ = Math.floor(flatBrickIndex / planeSize);
      const withinPlane = flatBrickIndex % planeSize;
      const brickY = Math.floor(withinPlane / gridX);
      const brickX = withinPlane % gridX;
      const globalZ = brickZ * Math.max(1, pageTable.chunkShape[0]) + localZ;
      const globalY = brickY * Math.max(1, pageTable.chunkShape[1]) + localY;
      const globalX = brickX * Math.max(1, pageTable.chunkShape[2]) + localX;
      if (
        globalZ < 0 || globalZ >= volumeDepth ||
        globalY < 0 || globalY >= volumeHeight ||
        globalX < 0 || globalX >= volumeWidth
      ) {
        return 0;
      }
      const sourceIndex =
        (((globalZ * volumeHeight + globalY) * volumeWidth + globalX) * components) + component;
      return textureData[sourceIndex] ?? 0;
    },
  });
}

function buildBrickSubcellTextureDataFromAtlas({
  pageTable,
  atlasData,
  atlasSize,
  textureFormat,
  max3DTextureSize,
}: {
  pageTable: VolumeBrickPageTable;
  atlasData: TextureSourceArray;
  atlasSize: { width: number; height: number; depth: number };
  textureFormat: TextureFormat;
  max3DTextureSize: number | null | undefined;
}): BrickSubcellTextureBuildResult | null {
  const components = getTextureComponentsFromFormat(textureFormat);
  if (!components) {
    return null;
  }
  const atlasWidth = Math.max(1, atlasSize.width);
  const atlasHeight = Math.max(1, atlasSize.height);
  const atlasDepth = Math.max(1, atlasSize.depth);
  const expectedLength = atlasWidth * atlasHeight * atlasDepth * components;
  if (atlasData.length !== expectedLength) {
    return null;
  }

  const chunkDepth = Math.max(1, pageTable.chunkShape[0]);
  const chunkHeight = Math.max(1, pageTable.chunkShape[1]);
  const chunkWidth = Math.max(1, pageTable.chunkShape[2]);
  return buildBrickSubcellTextureData({
    pageTable,
    components,
    max3DTextureSize,
    readVoxelComponent: (flatBrickIndex, localZ, localY, localX, component) => {
      const sourceIndex = pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
      if (sourceIndex < 0) {
        return 0;
      }
      const atlasZ = sourceIndex * chunkDepth + localZ;
      if (
        atlasZ < 0 || atlasZ >= atlasDepth ||
        localY < 0 || localY >= chunkHeight ||
        localX < 0 || localX >= chunkWidth
      ) {
        return 0;
      }
      const sourceOffset =
        (((atlasZ * atlasHeight + localY) * atlasWidth + localX) * components) + component;
      return atlasData[sourceOffset] ?? 0;
    },
  });
}

function bindBrickAtlasBaseTexture({
  resource,
  uniforms,
  pageTable,
  atlasIndices,
  slotGrid,
  atlasSize,
  forceRebuild = false,
}: {
  resource: VolumeResources;
  uniforms: ShaderUniformMap;
  pageTable: VolumeBrickPageTable;
  atlasIndices: Float32Array;
  slotGrid: { x: number; y: number; z: number };
  atlasSize: { width: number; height: number; depth: number };
  forceRebuild?: boolean;
}): void {
  const sourceSignature = `${slotGrid.x}:${slotGrid.y}:${slotGrid.z}|${atlasSize.width}:${atlasSize.height}:${atlasSize.depth}`;
  const canReuseExistingTexture =
    !forceRebuild &&
    resource.brickAtlasBaseTexture !== null &&
    resource.brickAtlasBaseTexture !== undefined &&
    resource.brickAtlasBaseSourcePageTable === pageTable &&
    resource.brickAtlasBaseSourceSignature === sourceSignature;
  if (canReuseExistingTexture) {
    uniforms.u_brickAtlasBase.value = resource.brickAtlasBaseTexture;
    return;
  }
  const atlasBaseData = buildBrickAtlasBaseTextureData({
    pageTable,
    atlasIndices,
    slotGrid,
    atlasSize,
  });
  resource.brickAtlasBaseTexture = updateOrCreateFloat3dTexture(
    resource.brickAtlasBaseTexture,
    atlasBaseData,
    Math.max(1, pageTable.gridShape[2]),
    Math.max(1, pageTable.gridShape[1]),
    Math.max(1, pageTable.gridShape[0]),
    THREE.RGBAFormat,
  );
  resource.brickAtlasBaseSourcePageTable = pageTable;
  resource.brickAtlasBaseSourceSignature = sourceSignature;
  uniforms.u_brickAtlasBase.value = resource.brickAtlasBaseTexture;
}

function pageTableExpectsSubcellTexture(pageTable: VolumeBrickPageTable | null | undefined): boolean {
  if (!pageTable) {
    return false;
  }
  return resolveBrickSubcellGrid(pageTable.chunkShape) !== null;
}

function resolvePlaybackWarmupReady(resource: VolumeResources): boolean {
  const pageTable = resource.brickPageTable ?? null;
  const metrics = resource.gpuBrickResidencyMetrics;
  if (!pageTable || !metrics) {
    return false;
  }
  const hasPendingResidencyWork = (metrics.pendingBricks ?? 0) > 0 || (metrics.scheduledUploads ?? 0) > 0;
  if (hasPendingResidencyWork) {
    return false;
  }
  const expectsSubcellTexture = pageTableExpectsSubcellTexture(pageTable);
  const hasReadySubcellTexture = expectsSubcellTexture
    ? resource.brickSubcellTexture !== null &&
      resource.brickSubcellTexture !== undefined &&
      resource.brickSubcellSourcePageTable === pageTable
    : true;

  return Boolean(
    resource.brickMetadataSourcePageTable === pageTable &&
      resource.skipHierarchySourcePageTable === pageTable &&
      resource.brickAtlasIndexTexture !== null &&
      resource.brickAtlasIndexTexture !== undefined &&
      resource.brickAtlasIndexSourcePageTable === pageTable &&
      resource.brickAtlasBaseTexture !== null &&
      resource.brickAtlasBaseTexture !== undefined &&
      resource.brickAtlasBaseSourcePageTable === pageTable &&
      resource.brickAtlasDataTexture !== null &&
      resource.brickAtlasDataTexture !== undefined &&
      resource.brickAtlasSourcePageTable === pageTable &&
      hasReadySubcellTexture
  );
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

function analyzeBrickSkipDiagnostics({
  pageTable,
}: {
  pageTable: VolumeBrickPageTable | null | undefined;
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

  const hierarchyLevels = pageTable.skipHierarchy?.levels ?? [];
  if (hierarchyLevels.length === 0) {
    return {
      enabled: false,
      reason: 'invalid-hierarchy-shape',
      totalBricks: pageTable.brickAtlasIndices.length,
      emptyBricks: 0,
      occupiedBricks: 0,
      occupiedBricksMissingFromAtlas: 0,
      invalidRangeBricks: 0,
      occupancyMetadataMismatchBricks: 0
    };
  }

  let previousLevel = -1;
  for (let levelIndex = 0; levelIndex < hierarchyLevels.length; levelIndex += 1) {
    const hierarchy = hierarchyLevels[levelIndex];
    if (!hierarchy) {
      return {
        enabled: false,
        reason: 'invalid-hierarchy-shape',
        totalBricks: pageTable.brickAtlasIndices.length,
        emptyBricks: 0,
        occupiedBricks: 0,
        occupiedBricksMissingFromAtlas: 0,
        invalidRangeBricks: 0,
        occupancyMetadataMismatchBricks: 0
      };
    }
    if (hierarchy.level !== previousLevel + 1) {
      return {
        enabled: false,
        reason: 'invalid-hierarchy-level-order',
        totalBricks: pageTable.brickAtlasIndices.length,
        emptyBricks: 0,
        occupiedBricks: 0,
        occupiedBricksMissingFromAtlas: 0,
        invalidRangeBricks: 0,
        occupancyMetadataMismatchBricks: 0
      };
    }
    previousLevel = hierarchy.level;
    const [gridZ, gridY, gridX] = hierarchy.gridShape;
    const expectedCount = gridZ * gridY * gridX;
    if (
      expectedCount <= 0 ||
      hierarchy.occupancy.length !== expectedCount ||
      hierarchy.min.length !== expectedCount ||
      hierarchy.max.length !== expectedCount
    ) {
      return {
        enabled: false,
        reason: 'invalid-hierarchy-shape',
        totalBricks: pageTable.brickAtlasIndices.length,
        emptyBricks: 0,
        occupiedBricks: 0,
        occupiedBricksMissingFromAtlas: 0,
        invalidRangeBricks: 0,
        occupancyMetadataMismatchBricks: 0
      };
    }
  }

  const root = hierarchyLevels[hierarchyLevels.length - 1];
  if (!root || root.gridShape[0] !== 1 || root.gridShape[1] !== 1 || root.gridShape[2] !== 1) {
    return {
      enabled: false,
      reason: 'invalid-hierarchy-shape',
      totalBricks: pageTable.brickAtlasIndices.length,
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
  let occupiedBricksMissingFromAtlas = 0; // diagnostics only; not a gating condition.
  let invalidRangeBricks = 0;
  let occupancyMetadataMismatchBricks = 0;

  for (let brickIndex = 0; brickIndex < totalBricks; brickIndex += 1) {
    const occupancy = pageTable.chunkOccupancy[brickIndex] ?? 0;
    const min = pageTable.chunkMin[brickIndex] ?? 0;
    const max = pageTable.chunkMax[brickIndex] ?? 0;
    const atlasIndex = pageTable.brickAtlasIndices[brickIndex] ?? -1;

    if (occupancy <= 0) {
      emptyBricks += 1;
      if (max > 0 || min > 0) {
        occupancyMetadataMismatchBricks += 1;
      }
      continue;
    }

    occupiedBricks += 1;
    if (max < min) {
      invalidRangeBricks += 1;
    }
    if (atlasIndex < 0) {
      occupiedBricksMissingFromAtlas += 1;
    }
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

type BrickAtlasSlotLayout = {
  slotGridX: number;
  slotGridY: number;
  slotGridZ: number;
  allocatedSlotCapacity: number;
  atlasWidth: number;
  atlasHeight: number;
  atlasDepth: number;
};

function resolveBrickAtlasSlotLayout({
  slotCapacity,
  chunkWidth,
  chunkHeight,
  chunkDepth,
  max3DTextureSize,
  allowWidePacking
}: {
  slotCapacity: number;
  chunkWidth: number;
  chunkHeight: number;
  chunkDepth: number;
  max3DTextureSize: number | null;
  allowWidePacking: boolean;
}): BrickAtlasSlotLayout {
  const normalizedSlotCapacity = Math.max(1, Math.floor(slotCapacity));
  const safeChunkWidth = Math.max(1, Math.floor(chunkWidth));
  const safeChunkHeight = Math.max(1, Math.floor(chunkHeight));
  const safeChunkDepth = Math.max(1, Math.floor(chunkDepth));
  const safeMax3D =
    max3DTextureSize && Number.isFinite(max3DTextureSize) && max3DTextureSize > 0
      ? Math.max(1, Math.floor(max3DTextureSize))
      : null;

  if (!allowWidePacking || !safeMax3D) {
    const slotGridX = 1;
    const slotGridY = 1;
    const slotGridZ = normalizedSlotCapacity;
    return {
      slotGridX,
      slotGridY,
      slotGridZ,
      allocatedSlotCapacity: slotGridX * slotGridY * slotGridZ,
      atlasWidth: safeChunkWidth,
      atlasHeight: safeChunkHeight,
      atlasDepth: safeChunkDepth * slotGridZ
    };
  }

  const maxSlotsX = Math.max(1, Math.floor(safeMax3D / safeChunkWidth));
  const maxSlotsY = Math.max(1, Math.floor(safeMax3D / safeChunkHeight));
  const maxSlotsZ = Math.max(1, Math.floor(safeMax3D / safeChunkDepth));
  let slotGridX = Math.min(maxSlotsX, normalizedSlotCapacity);
  let slotGridY = Math.min(maxSlotsY, Math.max(1, Math.ceil(normalizedSlotCapacity / slotGridX)));
  let slotGridZ = Math.max(1, Math.ceil(normalizedSlotCapacity / (slotGridX * slotGridY)));
  if (slotGridZ > maxSlotsZ) {
    slotGridZ = maxSlotsZ;
    const requiredPlaneSlots = Math.max(1, Math.ceil(normalizedSlotCapacity / slotGridZ));
    slotGridX = Math.min(maxSlotsX, requiredPlaneSlots);
    slotGridY = Math.min(maxSlotsY, Math.max(1, Math.ceil(requiredPlaneSlots / slotGridX)));
  }
  const allocatedSlotCapacity = Math.max(1, slotGridX * slotGridY * slotGridZ);

  return {
    slotGridX,
    slotGridY,
    slotGridZ,
    allocatedSlotCapacity,
    atlasWidth: safeChunkWidth * slotGridX,
    atlasHeight: safeChunkHeight * slotGridY,
    atlasDepth: safeChunkDepth * slotGridZ
  };
}

function resolveBrickAtlasSlotCoordinates(
  slotIndex: number,
  slotGridX: number,
  slotGridY: number
): { slotX: number; slotY: number; slotZ: number } {
  const safeSlotIndex = Math.max(0, Math.floor(slotIndex));
  const safeSlotGridX = Math.max(1, Math.floor(slotGridX));
  const safeSlotGridY = Math.max(1, Math.floor(slotGridY));
  const slotsPerPlane = safeSlotGridX * safeSlotGridY;
  const slotZ = Math.floor(safeSlotIndex / slotsPerPlane);
  const withinPlane = safeSlotIndex % slotsPerPlane;
  const slotY = Math.floor(withinPlane / safeSlotGridX);
  const slotX = withinPlane % safeSlotGridX;
  return { slotX, slotY, slotZ };
}

function resolveBrickGridCoordinatesFromFlatIndex(
  flatIndex: number,
  gridX: number,
  gridY: number,
): { brickX: number; brickY: number; brickZ: number } {
  const safeFlatIndex = Math.max(0, Math.floor(flatIndex));
  const safeGridX = Math.max(1, Math.floor(gridX));
  const safeGridY = Math.max(1, Math.floor(gridY));
  const plane = safeGridY * safeGridX;
  const brickZ = Math.floor(safeFlatIndex / plane);
  const withinPlane = safeFlatIndex % plane;
  const brickY = Math.floor(withinPlane / safeGridX);
  const brickX = withinPlane % safeGridX;
  return { brickX, brickY, brickZ };
}

function flattenBrickGridCoordinates(
  brickX: number,
  brickY: number,
  brickZ: number,
  gridX: number,
  gridY: number,
): number {
  return (brickZ * gridY + brickY) * gridX + brickX;
}

function resolveLocalVoxelForCoreAndHalo(
  coordinate: number,
  coreSize: number,
): { brickOffset: -1 | 0 | 1; local: number } {
  const safeCoreSize = Math.max(1, Math.floor(coreSize));
  if (coordinate < 0) {
    return {
      brickOffset: -1,
      local: Math.min(Math.max(coordinate + safeCoreSize, 0), safeCoreSize - 1)
    };
  }
  if (coordinate >= safeCoreSize) {
    return {
      brickOffset: 1,
      local: Math.min(Math.max(coordinate - safeCoreSize, 0), safeCoreSize - 1)
    };
  }
  return { brickOffset: 0, local: coordinate };
}

function copyBrickIntoResidentAtlas({
  sourceData,
  sourceIndex,
  destinationData,
  destinationSlot,
  coreChunkWidth,
  coreChunkHeight,
  coreChunkDepth,
  haloVoxels,
  sourceBrickWidth,
  sourceBrickHeight,
  sourceBrickDepth,
  sourceIndexToFlatBrick,
  brickAtlasIndices,
  gridX,
  gridY,
  gridZ,
  slotGridX,
  slotGridY,
  destinationWidth,
  destinationHeight,
  destinationDepth,
  textureComponents
}: {
  sourceData: Uint8Array;
  sourceIndex: number;
  destinationData: Uint8Array;
  destinationSlot: number;
  coreChunkWidth: number;
  coreChunkHeight: number;
  coreChunkDepth: number;
  haloVoxels: number;
  sourceBrickWidth: number;
  sourceBrickHeight: number;
  sourceBrickDepth: number;
  sourceIndexToFlatBrick: Int32Array;
  brickAtlasIndices: Int32Array;
  gridX: number;
  gridY: number;
  gridZ: number;
  slotGridX: number;
  slotGridY: number;
  destinationWidth: number;
  destinationHeight: number;
  destinationDepth: number;
  textureComponents: number;
}): void {
  const paddedChunkWidth = coreChunkWidth + haloVoxels * 2;
  const paddedChunkHeight = coreChunkHeight + haloVoxels * 2;
  const paddedChunkDepth = coreChunkDepth + haloVoxels * 2;
  const { slotX, slotY, slotZ } = resolveBrickAtlasSlotCoordinates(destinationSlot, slotGridX, slotGridY);
  const destinationXBase = slotX * paddedChunkWidth;
  const destinationYBase = slotY * paddedChunkHeight;
  const destinationZBase = slotZ * paddedChunkDepth;
  const destinationRowStride = destinationWidth * textureComponents;
  const destinationSliceStride = destinationHeight * destinationRowStride;
  const sourceRowStride = sourceBrickWidth * textureComponents;
  const sourceSliceStride = sourceBrickHeight * sourceRowStride;
  const sourceBrickStride = sourceBrickDepth * sourceSliceStride;

  if (haloVoxels <= 0) {
    const sourceBrickBaseOffset = sourceIndex * sourceBrickStride;
    for (let localZ = 0; localZ < coreChunkDepth; localZ += 1) {
      const destinationZ = destinationZBase + localZ;
      if (destinationZ >= destinationDepth) {
        continue;
      }
      const sourceZOffset = sourceBrickBaseOffset + localZ * sourceSliceStride;
      const destinationZOffset = destinationZ * destinationSliceStride;
      for (let localY = 0; localY < coreChunkHeight; localY += 1) {
        const destinationY = destinationYBase + localY;
        if (destinationY >= destinationHeight) {
          continue;
        }
        const sourceYOffset = sourceZOffset + localY * sourceRowStride;
        const destinationYOffset = destinationZOffset + destinationY * destinationRowStride;
        for (let localX = 0; localX < coreChunkWidth; localX += 1) {
          const destinationX = destinationXBase + localX;
          if (destinationX >= destinationWidth) {
            continue;
          }
          const sourceVoxelOffset =
            sourceYOffset + localX * textureComponents;
          const destinationVoxelOffset =
            destinationYOffset + destinationX * textureComponents;
          for (let component = 0; component < textureComponents; component += 1) {
            destinationData[destinationVoxelOffset + component] = sourceData[sourceVoxelOffset + component] ?? 0;
          }
        }
      }
    }
    return;
  }

  const sourceFlatBrickIndex = sourceIndexToFlatBrick[sourceIndex] ?? -1;
  if (sourceFlatBrickIndex < 0) {
    return;
  }
  const { brickX: sourceBrickX, brickY: sourceBrickY, brickZ: sourceBrickZ } = resolveBrickGridCoordinatesFromFlatIndex(
    sourceFlatBrickIndex,
    gridX,
    gridY,
  );

  const xOffsets = new Int8Array(paddedChunkWidth);
  const yOffsets = new Int8Array(paddedChunkHeight);
  const zOffsets = new Int8Array(paddedChunkDepth);
  const xLocals = new Int16Array(paddedChunkWidth);
  const yLocals = new Int16Array(paddedChunkHeight);
  const zLocals = new Int16Array(paddedChunkDepth);
  const xClamped = new Int16Array(paddedChunkWidth);
  const yClamped = new Int16Array(paddedChunkHeight);
  const zClamped = new Int16Array(paddedChunkDepth);

  for (let localX = 0; localX < paddedChunkWidth; localX += 1) {
    const sourceCoreX = localX - haloVoxels;
    const localXInfo = resolveLocalVoxelForCoreAndHalo(sourceCoreX, coreChunkWidth);
    xOffsets[localX] = localXInfo.brickOffset;
    xLocals[localX] = localXInfo.local;
    xClamped[localX] = Math.min(Math.max(sourceCoreX, 0), coreChunkWidth - 1);
  }
  for (let localY = 0; localY < paddedChunkHeight; localY += 1) {
    const sourceCoreY = localY - haloVoxels;
    const localYInfo = resolveLocalVoxelForCoreAndHalo(sourceCoreY, coreChunkHeight);
    yOffsets[localY] = localYInfo.brickOffset;
    yLocals[localY] = localYInfo.local;
    yClamped[localY] = Math.min(Math.max(sourceCoreY, 0), coreChunkHeight - 1);
  }
  for (let localZ = 0; localZ < paddedChunkDepth; localZ += 1) {
    const sourceCoreZ = localZ - haloVoxels;
    const localZInfo = resolveLocalVoxelForCoreAndHalo(sourceCoreZ, coreChunkDepth);
    zOffsets[localZ] = localZInfo.brickOffset;
    zLocals[localZ] = localZInfo.local;
    zClamped[localZ] = Math.min(Math.max(sourceCoreZ, 0), coreChunkDepth - 1);
  }

  const neighborSourceIndexByOffset = new Int32Array(27).fill(-1);
  for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
    const candidateBrickZ = sourceBrickZ + offsetZ;
    const zInBounds = candidateBrickZ >= 0 && candidateBrickZ < gridZ;
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const candidateBrickY = sourceBrickY + offsetY;
      const yInBounds = candidateBrickY >= 0 && candidateBrickY < gridY;
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const key = (offsetZ + 1) * 9 + (offsetY + 1) * 3 + (offsetX + 1);
        const candidateBrickX = sourceBrickX + offsetX;
        const inBounds = zInBounds && yInBounds && candidateBrickX >= 0 && candidateBrickX < gridX;
        if (!inBounds) {
          neighborSourceIndexByOffset[key] = -1;
          continue;
        }
        neighborSourceIndexByOffset[key] =
          brickAtlasIndices[
            flattenBrickGridCoordinates(candidateBrickX, candidateBrickY, candidateBrickZ, gridX, gridY)
          ] ?? -1;
      }
    }
  }

  for (let localZ = 0; localZ < paddedChunkDepth; localZ += 1) {
    const destinationZ = destinationZBase + localZ;
    if (destinationZ >= destinationDepth) {
      continue;
    }
    const zOffset = zOffsets[localZ] ?? 0;
    const zLocal = zLocals[localZ] ?? 0;
    const zLocalClamped = zClamped[localZ] ?? 0;
    const destinationZOffset = destinationZ * destinationSliceStride;
    const zOffsetKeyBase = (zOffset + 1) * 9;
    for (let localY = 0; localY < paddedChunkHeight; localY += 1) {
      const destinationY = destinationYBase + localY;
      if (destinationY >= destinationHeight) {
        continue;
      }
      const yOffset = yOffsets[localY] ?? 0;
      const yLocal = yLocals[localY] ?? 0;
      const yLocalClamped = yClamped[localY] ?? 0;
      const destinationYOffset = destinationZOffset + destinationY * destinationRowStride;
      const yzOffsetKeyBase = zOffsetKeyBase + (yOffset + 1) * 3;
      for (let localX = 0; localX < paddedChunkWidth; localX += 1) {
        const destinationX = destinationXBase + localX;
        if (destinationX >= destinationWidth) {
          continue;
        }
        const xOffset = xOffsets[localX] ?? 0;
        const xLocal = xLocals[localX] ?? 0;
        const xLocalClamped = xClamped[localX] ?? 0;
        const candidateSourceIndex = neighborSourceIndexByOffset[yzOffsetKeyBase + (xOffset + 1)] ?? -1;
        const selectedSourceIndex = candidateSourceIndex >= 0 ? candidateSourceIndex : sourceIndex;
        const selectedLocalX =
          candidateSourceIndex >= 0
            ? xLocal
            : xLocalClamped;
        const selectedLocalY =
          candidateSourceIndex >= 0
            ? yLocal
            : yLocalClamped;
        const selectedLocalZ =
          candidateSourceIndex >= 0
            ? zLocal
            : zLocalClamped;
        const sourceVoxelOffset =
          selectedSourceIndex * sourceBrickStride +
          selectedLocalZ * sourceSliceStride +
          selectedLocalY * sourceRowStride +
          selectedLocalX * textureComponents;
        const destinationVoxelOffset =
          destinationYOffset + destinationX * textureComponents;
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
  slotGrid: { x: number; y: number; z: number };
  atlasIndices: Float32Array;
  metrics: BrickResidencyMetrics;
  texturesDirty: boolean;
} {
  const components = getTextureComponentsFromFormat(textureFormat);
  if (!components) {
    return {
      atlasData: new Uint8Array([0]),
      atlasSize: { width: 1, height: 1, depth: 1 },
      slotGrid: { x: 1, y: 1, z: 1 },
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

  const coreChunkDepth = Math.max(1, pageTable.chunkShape[0]);
  const coreChunkHeight = Math.max(1, pageTable.chunkShape[1]);
  const coreChunkWidth = Math.max(1, pageTable.chunkShape[2]);
  const haloVoxels = pageTable.scaleLevel > 0 ? Math.max(0, BRICK_ATLAS_HALO_VOXELS) : 0;
  const residentChunkDepth = coreChunkDepth + haloVoxels * 2;
  const residentChunkHeight = coreChunkHeight + haloVoxels * 2;
  const residentChunkWidth = coreChunkWidth + haloVoxels * 2;
  const bytesPerBrick = residentChunkDepth * residentChunkHeight * residentChunkWidth * components;
  const configuredBudgetBytes = resolveGpuBrickBudgetBytes();
  const explicitBudget = hasExplicitGpuBrickBudgetBytes();
  const shouldForceFullResidency = forceFullResidency;
  const canAutoExpandBudget = !shouldForceFullResidency && !explicitBudget;
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
  const safeMax3DTextureSize =
    max3DTextureSize && Number.isFinite(max3DTextureSize) && max3DTextureSize > 0
      ? Math.max(1, Math.floor(max3DTextureSize))
      : null;
  const maxDepthLimitedSlotCapacity =
    safeMax3DTextureSize ? Math.floor(safeMax3DTextureSize / residentChunkDepth) : Number.POSITIVE_INFINITY;
  const allowWidePacking = shouldForceFullResidency;
  const maxDimensionLimitedSlotCapacity = (() => {
    if (!allowWidePacking) {
      return maxDepthLimitedSlotCapacity;
    }
    if (!safeMax3DTextureSize) {
      return Number.POSITIVE_INFINITY;
    }
    const maxSlotsX = Math.floor(safeMax3DTextureSize / residentChunkWidth);
    const maxSlotsY = Math.floor(safeMax3DTextureSize / residentChunkHeight);
    const maxSlotsZ = Math.floor(safeMax3DTextureSize / residentChunkDepth);
    if (maxSlotsX <= 0 || maxSlotsY <= 0 || maxSlotsZ <= 0) {
      return 0;
    }
    return maxSlotsX * maxSlotsY * maxSlotsZ;
  })();
  const existing = gpuBrickResidencyStateByResource.get(resource);
  const requestedSlotCapacity = Math.max(
    1,
    Math.min(pageTable.occupiedBrickCount, budgetLimitedSlotCapacity, maxDimensionLimitedSlotCapacity)
  );
  const canPreserveExistingSlotCapacity =
    !explicitBudget &&
    Boolean(
      existing &&
      existing.sourceToken === sourceToken &&
      existing.pageTable === pageTable &&
      existing.textureFormat === textureFormat
    );
  const provisionalSlotCapacity = canPreserveExistingSlotCapacity
    ? Math.max(requestedSlotCapacity, existing?.slotCapacity ?? requestedSlotCapacity)
    : requestedSlotCapacity;
  const slotLayout = resolveBrickAtlasSlotLayout({
    slotCapacity: provisionalSlotCapacity,
    chunkWidth: residentChunkWidth,
    chunkHeight: residentChunkHeight,
    chunkDepth: residentChunkDepth,
    max3DTextureSize: safeMax3DTextureSize,
    allowWidePacking
  });
  const slotCapacity = Math.max(1, Math.min(provisionalSlotCapacity, slotLayout.allocatedSlotCapacity));
  const expectedResidentDataLength =
    slotLayout.atlasWidth * slotLayout.atlasHeight * slotLayout.atlasDepth * components;
  const expectedResidentIndexLength = pageTable.brickAtlasIndices.length;
  const shouldReset =
    !existing ||
    existing.sourceToken !== sourceToken ||
    existing.pageTable !== pageTable ||
    existing.textureFormat !== textureFormat ||
    existing.slotCapacity !== slotCapacity ||
    existing.slotGridX !== slotLayout.slotGridX ||
    existing.slotGridY !== slotLayout.slotGridY ||
    existing.slotGridZ !== slotLayout.slotGridZ ||
    existing.allocatedSlotCapacity !== slotLayout.allocatedSlotCapacity ||
    existing.atlasWidth !== slotLayout.atlasWidth ||
    existing.atlasHeight !== slotLayout.atlasHeight ||
    existing.atlasDepth !== slotLayout.atlasDepth ||
    existing.chunkDepth !== residentChunkDepth ||
    existing.chunkHeight !== residentChunkHeight ||
    existing.chunkWidth !== residentChunkWidth;

  const state: BrickResidencyState =
    shouldReset || !existing
      ? {
          sourceToken,
          pageTable,
          textureFormat,
          textureComponents: components,
          chunkWidth: residentChunkWidth,
          chunkHeight: residentChunkHeight,
          chunkDepth: residentChunkDepth,
          slotCapacity,
          slotGridX: slotLayout.slotGridX,
          slotGridY: slotLayout.slotGridY,
          slotGridZ: slotLayout.slotGridZ,
          allocatedSlotCapacity: slotLayout.allocatedSlotCapacity,
          atlasWidth: slotLayout.atlasWidth,
          atlasHeight: slotLayout.atlasHeight,
          atlasDepth: slotLayout.atlasDepth,
          slotSourceIndices: new Int32Array(slotCapacity).fill(-1),
          sourceToSlot: new Map<number, number>(),
          sourceLastUsedTick: new Map<number, number>(),
          residentAtlasData: new Uint8Array(expectedResidentDataLength),
          residentAtlasIndices: new Float32Array(expectedResidentIndexLength),
          tick: 1,
          uploads: 0,
          evictions: 0,
          residentBytes: slotLayout.allocatedSlotCapacity * bytesPerBrick,
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
  state.slotGridX = slotLayout.slotGridX;
  state.slotGridY = slotLayout.slotGridY;
  state.slotGridZ = slotLayout.slotGridZ;
  state.allocatedSlotCapacity = slotLayout.allocatedSlotCapacity;
  state.atlasWidth = slotLayout.atlasWidth;
  state.atlasHeight = slotLayout.atlasHeight;
  state.atlasDepth = slotLayout.atlasDepth;
  state.budgetBytes = budgetBytes;
  state.residentBytes = slotLayout.allocatedSlotCapacity * bytesPerBrick;
  state.scaleLevel = pageTable.scaleLevel;
  state.pageTable = pageTable;

  const canHoldAllSources = slotCapacity >= pageTable.occupiedBrickCount;
  const isFullyResident = canHoldAllSources && state.sourceToSlot.size >= pageTable.occupiedBrickCount;
  if (shouldForceFullResidency && isFullyResident) {
    gpuBrickResidencyStateByResource.set(resource, state);
    return {
      atlasData: state.residentAtlasData,
      atlasSize: { width: state.atlasWidth, height: state.atlasHeight, depth: state.atlasDepth },
      slotGrid: { x: state.slotGridX, y: state.slotGridY, z: state.slotGridZ },
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
        pendingBricks: 0,
        prioritizedBricks: pageTable.occupiedBrickCount,
        scheduledUploads: 0,
        lastCameraDistance: state.lastCameraDistance
      },
      texturesDirty: false,
    };
  }

  const sourceIndexToFlatBrick = new Int32Array(Math.max(1, pageTable.occupiedBrickCount)).fill(-1);
  for (let flatBrickIndex = 0; flatBrickIndex < pageTable.brickAtlasIndices.length; flatBrickIndex += 1) {
    const sourceIndex = pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
    if (sourceIndex < 0 || sourceIndex >= sourceIndexToFlatBrick.length) {
      continue;
    }
    sourceIndexToFlatBrick[sourceIndex] = flatBrickIndex;
  }
  const [gridZ, gridY, gridX] = pageTable.gridShape;

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
  const pendingPressureRatio = slotCapacity > 0 ? pendingSources.length / slotCapacity : 0;
  const adaptiveBurstMultiplier =
    LOD0_FLAGS.residencyTuning
      ? pendingPressureRatio >= 0.85
        ? BOOTSTRAP_UPLOAD_BURST_MULTIPLIER
        : pendingPressureRatio >= 0.55
          ? Math.max(2, Math.floor(BOOTSTRAP_UPLOAD_BURST_MULTIPLIER / 2))
          : 1
      : BOOTSTRAP_UPLOAD_BURST_MULTIPLIER;
  const boostedUploadBudget =
    allowBootstrapUploadBurst && state.bootstrapUpdatesRemaining > 0
      ? Math.min(BOOTSTRAP_UPLOAD_BURST_MAX, baseUploadBudget * adaptiveBurstMultiplier)
      : baseUploadBudget;
  const forceImmediateUploads = shouldForceFullResidency;
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
      const pickReplacementSlot = (respectStickiness: boolean): number => {
        let selectedSlot = -1;
        let oldestTick = Number.POSITIVE_INFINITY;
        for (let slotIndex = 0; slotIndex < state.slotSourceIndices.length; slotIndex += 1) {
          const residentSource = state.slotSourceIndices[slotIndex] ?? -1;
          if (residentSource < 0) {
            return slotIndex;
          }
          if (desiredSources.has(residentSource)) {
            continue;
          }
          const residentTick = state.sourceLastUsedTick.get(residentSource) ?? 0;
          if (
            respectStickiness &&
            LOD0_FLAGS.residencyTuning &&
            state.tick - residentTick < RESIDENCY_STICKINESS_TICKS
          ) {
            continue;
          }
          if (residentTick < oldestTick) {
            oldestTick = residentTick;
            selectedSlot = slotIndex;
          }
        }
        return selectedSlot;
      };

      replacementSlot = pickReplacementSlot(LOD0_FLAGS.residencyTuning);
      if (replacementSlot < 0 && LOD0_FLAGS.residencyTuning) {
        replacementSlot = pickReplacementSlot(false);
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
      coreChunkWidth,
      coreChunkHeight,
      coreChunkDepth,
      haloVoxels,
      sourceBrickWidth: atlasSize.width,
      sourceBrickHeight: atlasSize.height,
      sourceBrickDepth: coreChunkDepth,
      sourceIndexToFlatBrick,
      brickAtlasIndices: pageTable.brickAtlasIndices,
      gridX,
      gridY,
      gridZ,
      slotGridX: state.slotGridX,
      slotGridY: state.slotGridY,
      destinationWidth: state.atlasWidth,
      destinationHeight: state.atlasHeight,
      destinationDepth: state.atlasDepth,
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
    atlasSize: { width: state.atlasWidth, height: state.atlasHeight, depth: state.atlasDepth },
    slotGrid: { x: state.slotGridX, y: state.slotGridY, z: state.slotGridZ },
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
  resource.brickAtlasBaseTexture?.dispose();
  resource.brickAtlasDataTexture?.dispose();
  resource.brickAtlasBaseTexture = null;
  resource.brickAtlasDataTexture = null;
  resource.brickAtlasSlotGrid = null;
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
  resource.brickSubcellTexture?.dispose();
  resource.brickAtlasIndexTexture?.dispose();
  resource.skipHierarchyTexture?.dispose();
  disposeBrickAtlasDataTexture(resource);
  resource.brickOccupancyTexture = null;
  resource.brickMinTexture = null;
  resource.brickMaxTexture = null;
  resource.brickSubcellTexture = null;
  resource.brickAtlasIndexTexture = null;
  resource.skipHierarchyTexture = null;
  resource.skipHierarchySourcePageTable = null;
  resource.skipHierarchyLevelCount = 0;
  resource.brickMetadataSourcePageTable = null;
  resource.brickAtlasIndexSourcePageTable = null;
  resource.brickAtlasBaseSourcePageTable = null;
  resource.brickAtlasBaseSourceSignature = null;
  resource.brickSubcellSourcePageTable = null;
  resource.brickSubcellSourceToken = null;
  resource.brickSubcellGrid = null;
  resource.playbackWarmupReady = null;
}

function occupancyMaskFromPageTable(pageTable: VolumeBrickPageTable): Uint8Array {
  const mask = new Uint8Array(pageTable.chunkOccupancy.length);
  for (let index = 0; index < pageTable.chunkOccupancy.length; index += 1) {
    mask[index] = pageTable.chunkOccupancy[index] > 0 ? 255 : 0;
  }
  return mask;
}

function atlasIndexTextureDataFromPageTable(pageTable: VolumeBrickPageTable): Float32Array {
  const cached = brickAtlasIndexDataCache.get(pageTable);
  if (cached) {
    return cached;
  }
  const data = new Float32Array(pageTable.brickAtlasIndices.length);
  for (let index = 0; index < pageTable.brickAtlasIndices.length; index += 1) {
    const atlasIndex = pageTable.brickAtlasIndices[index] ?? -1;
    data[index] = atlasIndex >= 0 ? atlasIndex + 1 : 0;
  }
  brickAtlasIndexDataCache.set(pageTable, data);
  return data;
}

type SkipHierarchyTextureBuildResult = {
  data: Uint8Array;
  width: number;
  height: number;
  depth: number;
  levelCount: number;
  levelMeta: THREE.Vector4[];
};

function buildSkipHierarchyTextureDataFromPageTable(
  pageTable: VolumeBrickPageTable
): SkipHierarchyTextureBuildResult | null {
  const hierarchyLevels = [...(pageTable.skipHierarchy?.levels ?? [])].sort((left, right) => left.level - right.level);
  if (hierarchyLevels.length === 0) {
    return null;
  }
  if (hierarchyLevels.length > MAX_SKIP_HIERARCHY_LEVELS) {
    return null;
  }

  let maxGridX = 1;
  let maxGridY = 1;
  let totalGridZ = 0;
  for (const level of hierarchyLevels) {
    const [gridZ, gridY, gridX] = level.gridShape;
    if (gridZ <= 0 || gridY <= 0 || gridX <= 0) {
      return null;
    }
    const expectedCount = gridZ * gridY * gridX;
    if (
      level.occupancy.length !== expectedCount ||
      level.min.length !== expectedCount ||
      level.max.length !== expectedCount
    ) {
      return null;
    }
    maxGridX = Math.max(maxGridX, gridX);
    maxGridY = Math.max(maxGridY, gridY);
    totalGridZ += gridZ;
  }
  if (totalGridZ <= 0) {
    return null;
  }

  const width = maxGridX;
  const height = maxGridY;
  const depth = totalGridZ;
  const data = new Uint8Array(width * height * depth * 4);
  const levelMeta: THREE.Vector4[] = Array.from({ length: MAX_SKIP_HIERARCHY_LEVELS }, () => new THREE.Vector4(1, 1, 1, 0));

  let zBase = 0;
  for (let hierarchyIndex = 0; hierarchyIndex < hierarchyLevels.length; hierarchyIndex += 1) {
    const hierarchy = hierarchyLevels[hierarchyIndex];
    if (!hierarchy) {
      continue;
    }
    const [gridZ, gridY, gridX] = hierarchy.gridShape;
    levelMeta[hierarchyIndex]?.set(gridX, gridY, gridZ, zBase);
    const planeSize = gridY * gridX;

    for (let z = 0; z < gridZ; z += 1) {
      for (let y = 0; y < gridY; y += 1) {
        for (let x = 0; x < gridX; x += 1) {
          const sourceIndex = (z * planeSize) + (y * gridX) + x;
          const targetIndex = ((((zBase + z) * height) + y) * width + x) * 4;
          data[targetIndex] = hierarchy.occupancy[sourceIndex] ?? 0;
          data[targetIndex + 1] = hierarchy.min[sourceIndex] ?? 0;
          data[targetIndex + 2] = hierarchy.max[sourceIndex] ?? 0;
          data[targetIndex + 3] = 255;
        }
      }
    }
    zBase += gridZ;
  }

  return {
    data,
    width,
    height,
    depth,
    levelCount: hierarchyLevels.length,
    levelMeta
  };
}

function buildBrickAtlasDataTexture({
  pageTable,
  textureData,
  textureFormat,
}: {
  pageTable: VolumeBrickPageTable;
  textureData: TextureSourceArray;
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
  const atlasData = textureData instanceof Uint16Array
    ? new Uint16Array(atlasWidth * atlasHeight * atlasDepth * components)
    : new Uint8Array(atlasWidth * atlasHeight * atlasDepth * components);
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

function resolveAtlasTokenPageTable(token: unknown): VolumeBrickPageTable | null {
  if (!token || typeof token !== 'object') {
    return null;
  }
  const candidate = token as { pageTable?: unknown };
  const pageTable = candidate.pageTable;
  if (!pageTable || typeof pageTable !== 'object') {
    return null;
  }
  const typedPageTable = pageTable as Partial<VolumeBrickPageTable>;
  if (!Array.isArray(typedPageTable.gridShape) || typedPageTable.gridShape.length !== 3) {
    return null;
  }
  if (!Array.isArray(typedPageTable.chunkShape) || typedPageTable.chunkShape.length !== 3) {
    return null;
  }
  if (!Array.isArray(typedPageTable.volumeShape) || typedPageTable.volumeShape.length !== 3) {
    return null;
  }
  return pageTable as VolumeBrickPageTable;
}

function applyBrickPageTableUniforms(
  uniforms: ShaderUniformMap,
  resource: VolumeResources,
  pageTable: VolumeBrickPageTable | null | undefined,
  options?: {
    textureDataToken?: object;
    textureData?: TextureSourceArray;
    textureFormat?: TextureFormat;
    atlasDataToken?: object;
    atlasData?: TextureSourceArray;
    atlasFormat?: TextureFormat;
    atlasSize?: { width: number; height: number; depth: number };
    max3DTextureSize?: number | null;
    cameraPosition?: THREE.Vector3 | null;
    forceFullResidency?: boolean;
    preferDirectVolumeSampling?: boolean;
    disableBrickPageTableSampling?: boolean;
    isSegmentation?: boolean;
  },
): void {
  if (
    !('u_brickSkipEnabled' in uniforms) ||
    !('u_skipHierarchyData' in uniforms) ||
    !('u_skipHierarchyTextureSize' in uniforms) ||
    !('u_skipHierarchyLevelCount' in uniforms) ||
    !('u_skipHierarchyLevelMeta' in uniforms) ||
    !('u_brickGridSize' in uniforms) ||
    !('u_brickChunkSize' in uniforms) ||
    !('u_brickVolumeSize' in uniforms) ||
    !('u_brickOccupancy' in uniforms) ||
    !('u_brickMin' in uniforms) ||
    !('u_brickMax' in uniforms) ||
    !('u_brickAtlasIndices' in uniforms) ||
    !('u_brickAtlasBase' in uniforms) ||
    !('u_brickAtlasEnabled' in uniforms) ||
    !('u_brickAtlasData' in uniforms) ||
    !('u_brickAtlasSize' in uniforms) ||
    !('u_brickAtlasSlotGrid' in uniforms) ||
    !('u_brickSubcellData' in uniforms) ||
    !('u_brickSubcellGrid' in uniforms)
  ) {
    resource.brickSkipDiagnostics = null;
    return;
  }

  const disableBrickPageTableUniforms = (
    reason: BrickSkipDiagnostics['reason'],
    totalBricks = 0,
  ): void => {
    disposeBrickPageTableTextures(resource);
    uniforms.u_brickSkipEnabled.value = 0;
    (uniforms.u_brickGridSize.value as THREE.Vector3).set(1, 1, 1);
    (uniforms.u_brickChunkSize.value as THREE.Vector3).set(1, 1, 1);
    (uniforms.u_brickVolumeSize.value as THREE.Vector3).set(1, 1, 1);
    uniforms.u_brickOccupancy.value = FALLBACK_BRICK_OCCUPANCY_TEXTURE;
    uniforms.u_brickMin.value = FALLBACK_BRICK_MIN_TEXTURE;
    uniforms.u_brickMax.value = FALLBACK_BRICK_MAX_TEXTURE;
    uniforms.u_brickAtlasIndices.value = FALLBACK_BRICK_ATLAS_INDEX_TEXTURE;
    uniforms.u_brickAtlasBase.value = FALLBACK_BRICK_ATLAS_BASE_TEXTURE;
    uniforms.u_brickAtlasEnabled.value = 0;
    uniforms.u_brickAtlasData.value = FALLBACK_BRICK_ATLAS_DATA_TEXTURE;
    if ('u_segmentationBrickAtlasData' in uniforms) {
      uniforms.u_segmentationBrickAtlasData.value = FALLBACK_SEGMENTATION_LABEL_TEXTURE;
    }
    (uniforms.u_brickAtlasSize.value as THREE.Vector3).set(1, 1, 1);
    (uniforms.u_brickAtlasSlotGrid.value as THREE.Vector3).set(1, 1, 1);
    uniforms.u_brickSubcellData.value = FALLBACK_BRICK_SUBCELL_TEXTURE;
    (uniforms.u_brickSubcellGrid.value as THREE.Vector3).set(1, 1, 1);
    uniforms.u_skipHierarchyData.value = FALLBACK_BRICK_ATLAS_DATA_TEXTURE;
    (uniforms.u_skipHierarchyTextureSize.value as THREE.Vector3).set(1, 1, 1);
    uniforms.u_skipHierarchyLevelCount.value = 0;
    const levelMetaUniform = uniforms.u_skipHierarchyLevelMeta.value;
    if (Array.isArray(levelMetaUniform)) {
      for (let index = 0; index < levelMetaUniform.length; index += 1) {
        const vector = levelMetaUniform[index];
        if (vector && typeof vector === 'object' && 'set' in vector && typeof vector.set === 'function') {
          vector.set(1, 1, 1, 0);
        }
      }
    }
    resource.gpuBrickResidencyMetrics = null;
    resource.brickSkipDiagnostics = createDisabledBrickSkipDiagnostics(reason, totalBricks);
  };

  const failBrickSkipping = (
    reason: BrickSkipDiagnostics['reason'],
    totalBricks = 0,
  ): never => {
    disableBrickPageTableUniforms(reason, totalBricks);
    throw new Error(`[brick-skip] hard-cutover violation: ${reason}`);
  };

  const bindBrickAtlasDataUniform = (texture: THREE.Data3DTexture): void => {
    if (options?.isSegmentation) {
      uniforms.u_brickAtlasData.value = FALLBACK_BRICK_ATLAS_DATA_TEXTURE;
      if ('u_segmentationBrickAtlasData' in uniforms) {
        uniforms.u_segmentationBrickAtlasData.value = texture;
      }
      return;
    }
    uniforms.u_brickAtlasData.value = texture;
    if ('u_segmentationBrickAtlasData' in uniforms) {
      uniforms.u_segmentationBrickAtlasData.value = FALLBACK_SEGMENTATION_LABEL_TEXTURE;
    }
  };

  if (options?.disableBrickPageTableSampling) {
    disableBrickPageTableUniforms('disabled-for-direct-volume-linear');
    return;
  }

  const atlasTokenPageTable = resolveAtlasTokenPageTable(options?.atlasDataToken);
  const resolvedPageTable = atlasTokenPageTable ?? pageTable ?? null;
  if (!resolvedPageTable) {
    disableBrickPageTableUniforms('missing-page-table');
    return;
  }
  if (
    atlasTokenPageTable &&
    pageTable &&
    atlasTokenPageTable !== pageTable &&
    (
      atlasTokenPageTable.timepoint !== pageTable.timepoint ||
      atlasTokenPageTable.scaleLevel !== pageTable.scaleLevel ||
      atlasTokenPageTable.layerKey !== pageTable.layerKey
    )
  ) {
    console.error(
      '[brick-skip] mismatched page-table arguments detected; forcing atlas token page-table binding',
      {
        atlas: {
          layerKey: atlasTokenPageTable.layerKey,
          timepoint: atlasTokenPageTable.timepoint,
          scaleLevel: atlasTokenPageTable.scaleLevel
        },
        provided: {
          layerKey: pageTable.layerKey,
          timepoint: pageTable.timepoint,
          scaleLevel: pageTable.scaleLevel
        }
      }
    );
  }

  const gridX = resolvedPageTable.gridShape[2];
  const gridY = resolvedPageTable.gridShape[1];
  const gridZ = resolvedPageTable.gridShape[0];
  const expectedBrickCount = gridX * gridY * gridZ;
  if (
    resolvedPageTable.brickAtlasIndices.length !== expectedBrickCount ||
    resolvedPageTable.chunkMin.length !== expectedBrickCount ||
    resolvedPageTable.chunkMax.length !== expectedBrickCount ||
    resolvedPageTable.chunkOccupancy.length !== expectedBrickCount
  ) {
    failBrickSkipping('invalid-page-table', expectedBrickCount);
  }

  const hasMetadataTextures =
    resource.brickOccupancyTexture !== null &&
    resource.brickOccupancyTexture !== undefined &&
    resource.brickMinTexture !== null &&
    resource.brickMinTexture !== undefined &&
    resource.brickMaxTexture !== null &&
    resource.brickMaxTexture !== undefined;
  const canReuseMetadataTextures =
    hasMetadataTextures && resource.brickMetadataSourcePageTable === resolvedPageTable;
  if (!canReuseMetadataTextures) {
    const occupancyMask = occupancyMaskFromPageTable(resolvedPageTable);
    resource.brickOccupancyTexture = updateOrCreateByte3dTexture(
      resource.brickOccupancyTexture,
      occupancyMask,
      gridX,
      gridY,
      gridZ,
    );
    resource.brickMinTexture = updateOrCreateByte3dTexture(
      resource.brickMinTexture,
      resolvedPageTable.chunkMin,
      gridX,
      gridY,
      gridZ,
    );
    resource.brickMaxTexture = updateOrCreateByte3dTexture(
      resource.brickMaxTexture,
      resolvedPageTable.chunkMax,
      gridX,
      gridY,
      gridZ,
    );
    resource.brickMetadataSourcePageTable = resolvedPageTable;
  }

  const canReuseHierarchyTexture =
    resource.skipHierarchyTexture !== null &&
    resource.skipHierarchyTexture !== undefined &&
    resource.skipHierarchySourcePageTable === resolvedPageTable;
  if (!canReuseHierarchyTexture) {
    const hierarchyBuild =
      buildSkipHierarchyTextureDataFromPageTable(resolvedPageTable) ??
      failBrickSkipping('invalid-hierarchy-shape', expectedBrickCount);
    resource.skipHierarchyTexture = updateOrCreateByte3dTexture(
      resource.skipHierarchyTexture,
      hierarchyBuild.data,
      hierarchyBuild.width,
      hierarchyBuild.height,
      hierarchyBuild.depth,
      THREE.RGBAFormat,
      'nearest',
      true
    );
    resource.skipHierarchySourcePageTable = resolvedPageTable;
    resource.skipHierarchyLevelCount = hierarchyBuild.levelCount;
    uniforms.u_skipHierarchyData.value = resource.skipHierarchyTexture;
    (uniforms.u_skipHierarchyTextureSize.value as THREE.Vector3).set(
      hierarchyBuild.width,
      hierarchyBuild.height,
      hierarchyBuild.depth
    );
    uniforms.u_skipHierarchyLevelCount.value = hierarchyBuild.levelCount;
    const levelMetaUniform = uniforms.u_skipHierarchyLevelMeta.value;
    if (Array.isArray(levelMetaUniform)) {
      for (let index = 0; index < levelMetaUniform.length; index += 1) {
        const target = levelMetaUniform[index];
        const source = hierarchyBuild.levelMeta[index] ?? new THREE.Vector4(1, 1, 1, 0);
        if (target && typeof target === 'object' && 'set' in target && typeof target.set === 'function') {
          target.set(source.x, source.y, source.z, source.w);
        }
      }
    }
  } else {
    uniforms.u_skipHierarchyData.value = resource.skipHierarchyTexture;
    const hierarchyTexture = resource.skipHierarchyTexture;
    if (hierarchyTexture) {
      const { width: hierarchyWidth, height: hierarchyHeight, depth: hierarchyDepth } = getTextureDimensions(hierarchyTexture);
      (uniforms.u_skipHierarchyTextureSize.value as THREE.Vector3).set(
        hierarchyWidth,
        hierarchyHeight,
        hierarchyDepth
      );
    }
    uniforms.u_skipHierarchyLevelCount.value = resource.skipHierarchyLevelCount ?? 0;
  }

  const normalizedAtlasUpload = normalizeSegmentationTextureUpload({
    data: options?.atlasData,
    format: options?.atlasFormat ?? options?.textureFormat,
    isSegmentation: Boolean(options?.isSegmentation),
  });
  const normalizedTextureUpload = normalizeSegmentationTextureUpload({
    data: options?.textureData,
    format: options?.textureFormat,
    isSegmentation: Boolean(options?.isSegmentation),
  });

  const atlasSourceToken =
    options?.atlasDataToken ??
    options?.textureDataToken ??
    options?.atlasData ??
    options?.textureData ??
    null;
  const atlasTextureFilterMode = resolveAtlasTextureFilterMode(uniforms);
  const atlasFormat = normalizedAtlasUpload.format ?? normalizedTextureUpload.format;
  const atlasSize = options?.atlasSize;
  const max3DTextureSize = options?.max3DTextureSize ?? null;
  const cameraPosition = options?.cameraPosition ?? null;
  const forceFullResidency = options?.forceFullResidency ?? false;
  const byteAtlasData = normalizedAtlasUpload.data instanceof Uint8Array ? normalizedAtlasUpload.data : null;
  const shouldUseGpuResidency =
    Boolean(
      byteAtlasData &&
      atlasFormat &&
      atlasSize &&
      resolvedPageTable.scaleLevel > 0
    );

  let atlasIndexData = atlasIndexTextureDataFromPageTable(resolvedPageTable);
  let atlasBuild: BrickAtlasBuildResult | null = null;
  let atlasTexturesDirty = false;
  let atlasSlotGrid = { x: 1, y: 1, z: Math.max(1, resolvedPageTable.occupiedBrickCount) };

  if (shouldUseGpuResidency && byteAtlasData && atlasFormat && atlasSize) {
    const components = getTextureComponentsFromFormat(atlasFormat);
    const expectedLength =
      atlasSize.width * atlasSize.height * atlasSize.depth * (components ?? 0);
    if (
      components &&
      atlasSize.width > 0 &&
      atlasSize.height > 0 &&
      atlasSize.depth > 0 &&
      expectedLength > 0 &&
      byteAtlasData.length === expectedLength
    ) {
      const residency = updateGpuBrickResidency({
        resource,
        pageTable: resolvedPageTable,
        sourceData: byteAtlasData,
        sourceToken: typeof atlasSourceToken === 'object' && atlasSourceToken !== null ? atlasSourceToken : null,
        textureFormat: atlasFormat,
        cameraPosition,
        atlasSize,
        max3DTextureSize,
        layerKey: resolvedPageTable.layerKey,
        timepoint: resolvedPageTable.timepoint,
        maxUploadsPerUpdate: resolveMaxBrickUploadsPerUpdate(),
        allowBootstrapUploadBurst: !hasExplicitMaxBrickUploadsPerUpdate(),
        forceFullResidency
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
      atlasSlotGrid = residency.slotGrid;
      atlasTexturesDirty = residency.texturesDirty;
      resource.gpuBrickResidencyMetrics = residency.metrics;
    } else {
      resource.gpuBrickResidencyMetrics = null;
    }
  } else {
    resource.gpuBrickResidencyMetrics = null;
  }

  const shouldUpdateAtlasIndexTexture =
    resource.brickAtlasIndexTexture === null ||
    resource.brickAtlasIndexTexture === undefined ||
    resource.brickAtlasIndexSourcePageTable !== resolvedPageTable ||
    atlasTexturesDirty;
  if (shouldUpdateAtlasIndexTexture) {
    resource.brickAtlasIndexTexture = updateOrCreateFloat3dTexture(
      resource.brickAtlasIndexTexture,
      atlasIndexData,
      gridX,
      gridY,
      gridZ,
      THREE.RedFormat,
      atlasTexturesDirty,
    );
    resource.brickAtlasIndexSourcePageTable = resolvedPageTable;
  }

  const precomputedSubcell = resolvedPageTable.subcell ?? null;
  const allowSubcellTexture = !options?.isSegmentation;
  const canUsePrecomputedSubcell =
    allowSubcellTexture &&
    precomputedSubcell !== null &&
    !exceeds3DTextureSizeLimit(
      {
        width: precomputedSubcell.width,
        height: precomputedSubcell.height,
        depth: precomputedSubcell.depth
      },
      options?.max3DTextureSize
    );
  const subcellSourceToken = canUsePrecomputedSubcell ? precomputedSubcell.data : atlasSourceToken;
  const canReuseSubcellTexture =
    resource.brickSubcellTexture !== null &&
    resource.brickSubcellTexture !== undefined &&
    resource.brickSubcellSourcePageTable === resolvedPageTable &&
    resource.brickSubcellSourceToken === subcellSourceToken;
  if (!canReuseSubcellTexture) {
    const subcellBuild = !allowSubcellTexture
      ? null
      : canUsePrecomputedSubcell
      ? {
          data: precomputedSubcell.data,
          width: precomputedSubcell.width,
          height: precomputedSubcell.height,
          depth: precomputedSubcell.depth,
          subcellGrid: {
            x: precomputedSubcell.gridShape[2],
            y: precomputedSubcell.gridShape[1],
            z: precomputedSubcell.gridShape[0]
          }
        }
      : options?.atlasData && atlasFormat && options.atlasSize
        ? buildBrickSubcellTextureDataFromAtlas({
            pageTable: resolvedPageTable,
            atlasData: options.atlasData,
            atlasSize: options.atlasSize,
            textureFormat: atlasFormat,
            max3DTextureSize: options.max3DTextureSize,
          })
        : options?.textureData && options.textureFormat
          ? buildBrickSubcellTextureDataFromVolume({
              pageTable: resolvedPageTable,
              textureData: options.textureData,
              textureFormat: options.textureFormat,
              max3DTextureSize: options.max3DTextureSize,
            })
          : null;
    if (subcellBuild) {
      resource.brickSubcellTexture = updateOrCreateByte3dTexture(
        resource.brickSubcellTexture,
        subcellBuild.data,
        subcellBuild.width,
        subcellBuild.height,
        subcellBuild.depth,
        THREE.RGBAFormat,
        'nearest',
        true,
      );
      resource.brickSubcellSourcePageTable = resolvedPageTable;
      resource.brickSubcellSourceToken =
        subcellSourceToken !== null &&
        (typeof subcellSourceToken === 'object' || ArrayBuffer.isView(subcellSourceToken))
          ? (subcellSourceToken as object | Uint8Array)
          : null;
      resource.brickSubcellGrid = subcellBuild.subcellGrid;
    } else {
      resource.brickSubcellTexture?.dispose();
      resource.brickSubcellTexture = null;
      resource.brickSubcellSourcePageTable = null;
      resource.brickSubcellSourceToken = null;
      resource.brickSubcellGrid = null;
    }
  }

  const brickSkipDiagnostics = analyzeBrickSkipDiagnostics({
    pageTable: resolvedPageTable
  });
  resource.brickSkipDiagnostics = brickSkipDiagnostics;
  if (!brickSkipDiagnostics.enabled) {
    failBrickSkipping(brickSkipDiagnostics.reason, brickSkipDiagnostics.totalBricks);
  }
  uniforms.u_brickSkipEnabled.value = 1;
  (uniforms.u_brickGridSize.value as THREE.Vector3).set(gridX, gridY, gridZ);
  (uniforms.u_brickChunkSize.value as THREE.Vector3).set(
    resolvedPageTable.chunkShape[2],
    resolvedPageTable.chunkShape[1],
    resolvedPageTable.chunkShape[0],
  );
  (uniforms.u_brickVolumeSize.value as THREE.Vector3).set(
    resolvedPageTable.volumeShape[2],
    resolvedPageTable.volumeShape[1],
    resolvedPageTable.volumeShape[0]
  );
  uniforms.u_brickOccupancy.value = resource.brickOccupancyTexture;
  uniforms.u_brickMin.value = resource.brickMinTexture;
  uniforms.u_brickMax.value = resource.brickMaxTexture;
  uniforms.u_brickAtlasIndices.value = resource.brickAtlasIndexTexture;
  uniforms.u_brickSubcellData.value = resource.brickSubcellTexture ?? FALLBACK_BRICK_SUBCELL_TEXTURE;
  const brickSubcellGridUniform = uniforms.u_brickSubcellGrid.value as THREE.Vector3;
  const brickSubcellGrid = resource.brickSubcellGrid ?? { x: 1, y: 1, z: 1 };
  brickSubcellGridUniform.set(brickSubcellGrid.x, brickSubcellGrid.y, brickSubcellGrid.z);
  resource.playbackWarmupReady = null;

  if (options?.preferDirectVolumeSampling) {
    disposeBrickAtlasDataTexture(resource);
    uniforms.u_brickAtlasBase.value = FALLBACK_BRICK_ATLAS_BASE_TEXTURE;
    uniforms.u_brickAtlasEnabled.value = 0;
    uniforms.u_brickAtlasData.value = FALLBACK_BRICK_ATLAS_DATA_TEXTURE;
    if ('u_segmentationBrickAtlasData' in uniforms) {
      uniforms.u_segmentationBrickAtlasData.value = FALLBACK_SEGMENTATION_LABEL_TEXTURE;
    }
    (uniforms.u_brickAtlasSize.value as THREE.Vector3).set(1, 1, 1);
    (uniforms.u_brickAtlasSlotGrid.value as THREE.Vector3).set(1, 1, 1);
    resource.playbackWarmupReady = resolvePlaybackWarmupReady(resource);
    return;
  }

  const canReuseAtlasTexture =
    !shouldUseGpuResidency &&
    resource.brickAtlasDataTexture !== null &&
    resource.brickAtlasDataTexture !== undefined &&
    resource.brickAtlasSourcePageTable === resolvedPageTable &&
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
      const cachedSlotGrid = resource.brickAtlasSlotGrid;
      const atlasImage = atlasTexture.image as { width?: number; height?: number; depth?: number } | undefined;
      bindBrickAtlasBaseTexture({
        resource,
        uniforms,
        pageTable: resolvedPageTable,
        atlasIndices: atlasIndexData,
        slotGrid:
          cachedSlotGrid ??
          {
            x: 1,
            y: 1,
            z: Math.max(1, Math.ceil((atlasImage?.depth ?? 1) / Math.max(1, resolvedPageTable.chunkShape[0]))),
          },
        atlasSize: {
          width: Math.max(1, atlasImage?.width ?? 1),
          height: Math.max(1, atlasImage?.height ?? 1),
          depth: Math.max(1, atlasImage?.depth ?? 1),
        },
        forceRebuild: atlasTexturesDirty,
      });
      uniforms.u_brickAtlasEnabled.value = 1;
      bindBrickAtlasDataUniform(atlasTexture);
      (uniforms.u_brickAtlasSize.value as THREE.Vector3).set(width, height, depth);
      if (cachedSlotGrid) {
        (uniforms.u_brickAtlasSlotGrid.value as THREE.Vector3).set(cachedSlotGrid.x, cachedSlotGrid.y, cachedSlotGrid.z);
      } else {
        const fallbackSlotGridZ = Math.max(1, Math.ceil(depth / Math.max(1, resolvedPageTable.chunkShape[0])));
        (uniforms.u_brickAtlasSlotGrid.value as THREE.Vector3).set(1, 1, fallbackSlotGridZ);
      }
      resource.playbackWarmupReady = resolvePlaybackWarmupReady(resource);
      return;
    }
  }

  if (!atlasBuild) {
    atlasBuild = (() => {
      if (normalizedAtlasUpload.data && atlasFormat && atlasSize) {
        const components = getTextureComponentsFromFormat(atlasFormat);
        const expectedLength =
          atlasSize.width * atlasSize.height * atlasSize.depth * (components ?? 0);
        if (
          components &&
          atlasSize.width > 0 &&
          atlasSize.height > 0 &&
          atlasSize.depth > 0 &&
          expectedLength > 0 &&
          normalizedAtlasUpload.data.length === expectedLength
        ) {
          return {
            data: normalizedAtlasUpload.data,
            width: atlasSize.width,
            height: atlasSize.height,
            depth: atlasSize.depth,
            textureFormat: atlasFormat,
            enabled: true,
          } satisfies BrickAtlasBuildResult;
        }
        return null;
      }

      if (normalizedTextureUpload.data && normalizedTextureUpload.format) {
        return buildBrickAtlasDataTexture({
          pageTable: resolvedPageTable,
          textureData: normalizedTextureUpload.data,
          textureFormat: normalizedTextureUpload.format,
        });
      }

      return null;
    })();
  }

  if (!shouldUseGpuResidency && atlasBuild && atlasBuild.enabled) {
    const chunkDepth = Math.max(1, resolvedPageTable.chunkShape[0]);
    const slotGridZ = Math.max(1, Math.ceil(atlasBuild.depth / chunkDepth));
    atlasSlotGrid = { x: 1, y: 1, z: slotGridZ };
  }

  if (!atlasBuild || !atlasBuild.enabled) {
    disposeBrickAtlasDataTexture(resource);
    uniforms.u_brickAtlasBase.value = FALLBACK_BRICK_ATLAS_BASE_TEXTURE;
    uniforms.u_brickAtlasEnabled.value = 0;
    uniforms.u_brickAtlasData.value = FALLBACK_BRICK_ATLAS_DATA_TEXTURE;
    if ('u_segmentationBrickAtlasData' in uniforms) {
      uniforms.u_segmentationBrickAtlasData.value = FALLBACK_SEGMENTATION_LABEL_TEXTURE;
    }
    (uniforms.u_brickAtlasSize.value as THREE.Vector3).set(1, 1, 1);
    (uniforms.u_brickAtlasSlotGrid.value as THREE.Vector3).set(1, 1, 1);
    return;
  }

  if (
    exceeds3DTextureSizeLimit(
      { width: atlasBuild.width, height: atlasBuild.height, depth: atlasBuild.depth },
      options?.max3DTextureSize
    )
  ) {
    disposeBrickAtlasDataTexture(resource);
    uniforms.u_brickAtlasBase.value = FALLBACK_BRICK_ATLAS_BASE_TEXTURE;
    uniforms.u_brickAtlasEnabled.value = 0;
    uniforms.u_brickAtlasData.value = FALLBACK_BRICK_ATLAS_DATA_TEXTURE;
    if ('u_segmentationBrickAtlasData' in uniforms) {
      uniforms.u_segmentationBrickAtlasData.value = FALLBACK_SEGMENTATION_LABEL_TEXTURE;
    }
    (uniforms.u_brickAtlasSize.value as THREE.Vector3).set(1, 1, 1);
    (uniforms.u_brickAtlasSlotGrid.value as THREE.Vector3).set(1, 1, 1);
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
  resource.brickAtlasSourceData = normalizedAtlasUpload.data ?? normalizedTextureUpload.data ?? null;
  resource.brickAtlasSourceFormat = atlasFormat ?? null;
  resource.brickAtlasSourcePageTable = resolvedPageTable;
  resource.brickAtlasSlotGrid = atlasSlotGrid;
  resource.brickAtlasBuildVersion = (resource.brickAtlasBuildVersion ?? 0) + 1;
  bindBrickAtlasBaseTexture({
    resource,
    uniforms,
    pageTable: resolvedPageTable,
    atlasIndices: atlasIndexData,
    slotGrid: atlasSlotGrid,
    atlasSize: { width: atlasBuild.width, height: atlasBuild.height, depth: atlasBuild.depth },
    forceRebuild: atlasTexturesDirty,
  });
  uniforms.u_brickAtlasEnabled.value = 1;
  bindBrickAtlasDataUniform(resource.brickAtlasDataTexture);
  (uniforms.u_brickAtlasSize.value as THREE.Vector3).set(
    atlasBuild.width,
    atlasBuild.height,
    atlasBuild.depth,
  );
  (uniforms.u_brickAtlasSlotGrid.value as THREE.Vector3).set(
    atlasSlotGrid.x,
    atlasSlotGrid.y,
    atlasSlotGrid.z,
  );
  resource.playbackWarmupReady = resolvePlaybackWarmupReady(resource);
}

function resolveLayerRenderSource(
  layer: UseVolumeResourcesParams['layers'][number]
): LayerRenderSource | null {
  const volume = layer.volume ?? null;
  const brickAtlas = layer.brickAtlas ?? null;
  const atlasPageTable = brickAtlas?.pageTable ?? null;
  const standalonePageTable = layer.brickPageTable ?? null;
  const pageTable = atlasPageTable ?? standalonePageTable;
  if (
    atlasPageTable &&
    standalonePageTable &&
    atlasPageTable !== standalonePageTable &&
    (
      atlasPageTable.timepoint !== standalonePageTable.timepoint ||
      atlasPageTable.scaleLevel !== standalonePageTable.scaleLevel ||
      atlasPageTable.layerKey !== standalonePageTable.layerKey
    )
  ) {
    // Keep atlas + page-table source coherent; mismatched pairs can map valid
    // atlas slots to unrelated bricks and manifest as random brick artifacts.
    console.error(
      '[brick-skip] mismatched layer page-table and atlas page-table; forcing atlas page-table binding',
      {
        layerKey: layer.key,
        atlas: {
          layerKey: atlasPageTable.layerKey,
          timepoint: atlasPageTable.timepoint,
          scaleLevel: atlasPageTable.scaleLevel
        },
        standalone: {
          layerKey: standalonePageTable.layerKey,
          timepoint: standalonePageTable.timepoint,
          scaleLevel: standalonePageTable.scaleLevel
        }
      }
    );
  }
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

function isPlaybackWarmupLayer(layer: ManagedViewerLayer): boolean {
  return typeof layer.playbackWarmupForLayerKey === 'string' && layer.playbackWarmupForLayerKey.length > 0;
}

function isPlaybackPinnedLayer(layer: ManagedViewerLayer): boolean {
  return layer.playbackRole === 'warmup' || layer.playbackRole === 'active';
}

function doesWarmupResourceMatchSource(
  resource: VolumeResources,
  layer: ManagedViewerLayer,
  source: LayerRenderSource,
): boolean {
  if (resource.playbackWarmupForLayerKey !== layer.key) {
    return false;
  }
  const sourcePageTable = source.pageTable;
  const resourcePageTable = resource.brickPageTable;
  if (!source.brickAtlas || !sourcePageTable || !resourcePageTable) {
    return false;
  }
  if (resource.brickAtlasSourceToken === source.brickAtlas && resourcePageTable === sourcePageTable) {
    return true;
  }
  return (
    resourcePageTable.layerKey === sourcePageTable.layerKey &&
    resourcePageTable.timepoint === sourcePageTable.timepoint &&
    resourcePageTable.scaleLevel === sourcePageTable.scaleLevel
  );
}

function findPromotableWarmupResource(
  resources: Map<string, VolumeResources>,
  layer: ManagedViewerLayer,
  source: LayerRenderSource,
): { key: string; resource: VolumeResources } | null {
  for (const [resourceKey, resource] of resources.entries()) {
    if (!resource.playbackWarmupForLayerKey) {
      continue;
    }
    if (!doesWarmupResourceMatchSource(resource, layer, source)) {
      continue;
    }
    return { key: resourceKey, resource };
  }
  return null;
}

export function useVolumeResources({
  layers,
  playbackWarmupLayers = [],
  primaryVolume,
  isAdditiveBlending,
  zClipFrontFraction,
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
      const additiveEnabled = resolveLayerAdditiveEnabled(isAdditive);
      const materialBlending = additiveEnabled ? THREE.AdditiveBlending : THREE.NormalBlending;
      const applyToMaterial = (material: THREE.Material) => {
        const shaderMaterial = material as THREE.ShaderMaterial | THREE.RawShaderMaterial;
        const uniforms = shaderMaterial.uniforms;
        if (uniforms?.u_additive) {
          uniforms.u_additive.value = additiveEnabled ? 1 : 0;
        }
        if (material instanceof THREE.ShaderMaterial) {
          if (resource.mode === '3d') {
            applyVolumeMaterialState(material, materialBlending);
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
      releaseSharedBackgroundMaskTexture(resource.backgroundMaskSourceToken ?? null);
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
    const safeZClipFront =
      Number.isFinite(zClipFrontFraction)
        ? Math.min(1, Math.max(0, zClipFrontFraction))
        : 0;
    const managedLayers = playbackWarmupLayers.length > 0 ? [...layers, ...playbackWarmupLayers] : layers;

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
      if (!pageTable || !brickAtlas || !directAtlasFormat || pageTable.scaleLevel <= 0) {
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
        const fullyResident =
          (resource.gpuBrickResidencyMetrics?.residentBricks ?? 0) >=
          (resource.gpuBrickResidencyMetrics?.totalBricks ?? Number.POSITIVE_INFINITY);
        if (fullyResident) {
          return;
        }
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
          forceFullResidency: Boolean(resource.playbackPinnedResidency),
          isSegmentation: brickAtlas.dataType === 'uint16',
        });
      };
    };

    managedLayers.forEach((layer, index) => {
      const isPlaybackWarmup = isPlaybackWarmupLayer(layer);
      const playbackPinnedResidency = isPlaybackWarmup || isPlaybackPinnedLayer(layer);
      const source = resolveLayerRenderSource(layer);
      if (!source) {
        removeResource(layer.key);
        return;
      }
      const { volume, pageTable, brickAtlas, width, height, depth, channels } = source;
      const sourceUsesVolume = Boolean(volume);
      const directVolumeTextureChannels = channels <= 1 ? 1 : channels === 2 ? 2 : 4;
      const preferDirectVolumeSampling =
        !brickAtlas &&
        Boolean(volume && pageTable) &&
        shouldPreferDirectVolumeSampling({
          scaleLevel: pageTable?.scaleLevel ?? volume?.scaleLevel ?? 0,
          volumeWidth: width,
          volumeHeight: height,
          volumeDepth: depth,
          textureChannels: directVolumeTextureChannels,
          gridShape: pageTable?.gridShape ?? [1, 1, 1],
          chunkShape: pageTable?.chunkShape ?? [1, 1, 1],
          occupiedBrickCount: pageTable?.occupiedBrickCount ?? 0,
          max3DTextureSize,
        });
      let cachedPreparation: ReturnType<typeof getCachedTextureData> | null = null;

      const isGrayscale = channels === 1;
      const colormapTexture = getColormapTexture(isGrayscale ? layer.color : DEFAULT_LAYER_COLOR);

      const existingVisibleResource = resourcesRef.current.get(layer.key) ?? null;
      let resources: VolumeResources | null = existingVisibleResource;
      let promotedFromWarmup = false;
      if (!isPlaybackWarmup) {
        const promotableWarmup = findPromotableWarmupResource(resourcesRef.current, layer, source);
        if (promotableWarmup) {
          resourcesRef.current.delete(promotableWarmup.key);
          if (existingVisibleResource && existingVisibleResource !== promotableWarmup.resource) {
            resourcesRef.current.delete(layer.key);
            existingVisibleResource.mesh.visible = false;
            existingVisibleResource.playbackWarmupForLayerKey = layer.key;
            existingVisibleResource.playbackWarmupTimeIndex = null;
            resourcesRef.current.set(promotableWarmup.key, existingVisibleResource);
          } else if (existingVisibleResource) {
            removeResource(layer.key);
          }
          promotableWarmup.resource.playbackWarmupForLayerKey = null;
          promotableWarmup.resource.playbackWarmupTimeIndex = null;
          promotableWarmup.resource.preferIncrementalResidency = false;
          promotableWarmup.resource.playbackPinnedResidency = playbackPinnedResidency;
          resourcesRef.current.set(layer.key, promotableWarmup.resource);
          resources = promotableWarmup.resource;
          promotedFromWarmup = true;
        }
      }

      const viewerMode =
        layer.renderStyle === RENDER_STYLE_SLICE
          ? 'slice'
          : layer.mode === 'slice' || layer.mode === '3d'
            ? layer.mode
            : depth > 1
              ? '3d'
              : 'slice';
      const hasExplicitSliceIndex = Number.isFinite(layer.sliceIndex);
      const defaultDisplayIndex = Math.round(safeZClipFront * Math.max(depth - 1, 0));
      const zIndex = hasExplicitSliceIndex
        ? Number(layer.sliceIndex)
        : defaultDisplayIndex;
      const dataDepthForSlice = volume?.depth ?? pageTable?.volumeShape[0] ?? depth;
      const sliceDataIndex = hasExplicitSliceIndex
        ? Number(layer.sliceIndex)
        : Math.round(safeZClipFront * Math.max(dataDepthForSlice - 1, 0));
      const intensityVolume = volume && isIntensityVolume(volume) ? volume : null;
      const segmentationVolume = volume && isSegmentationVolume(volume) ? volume : null;
      const segmentationPaletteTexture = layer.isSegmentation
        ? getSegmentationPaletteTexture(layer.key)
        : null;
      const effectiveSamplingMode = resolveSamplingModeForRenderStyle(
        layer.samplingMode,
        layer.renderStyle,
        Boolean(layer.isSegmentation),
      );
      const shouldDisableDirectVolumeBrickPageTableSampling =
        preferDirectVolumeSampling && effectiveSamplingMode === 'linear';
      const layerAdditiveEnabled = resolveLayerAdditiveEnabled(
        additiveBlendingRef.current,
      );
      const layerMaterialBlending = layerAdditiveEnabled
        ? THREE.AdditiveBlending
        : THREE.NormalBlending;

      if (viewerMode === '3d') {
        if (intensityVolume) {
          cachedPreparation = getCachedTextureData(intensityVolume);
        }
        const packedSegmentationTextureData = segmentationVolume
          ? packSegmentationLabelTextureData(segmentationVolume.labels)
          : null;
        const textureData = intensityVolume
          ? (cachedPreparation?.data ?? FALLBACK_VOLUME_TEXTURE_DATA)
          : segmentationVolume
            ? (packedSegmentationTextureData ?? new Uint8Array([0, 0]))
            : FALLBACK_VOLUME_TEXTURE_DATA;
        const textureFormat = intensityVolume
          ? (cachedPreparation?.format ?? THREE.RedFormat)
          : segmentationVolume
            ? THREE.RGFormat
            : THREE.RedFormat;
        const textureType = THREE.UnsignedByteType;
        const directAtlasFormat = brickAtlas ? getTextureFormatFromBrickAtlas(brickAtlas) : null;
        const proxyVisibleBox = resolveBackgroundMaskVisibleBox(layer.backgroundMask ?? null, {
          width,
          height,
          depth,
        });

        const needsRebuild =
          !resources ||
          resources.mode !== viewerMode ||
          resources.renderStyle !== layer.renderStyle ||
          resources.samplingMode !== effectiveSamplingMode ||
          resources.dimensions.width !== width ||
          resources.dimensions.height !== height ||
          resources.dimensions.depth !== depth ||
          resources.channels !== channels ||
          resources.proxyGeometrySignature !== proxyVisibleBox.signature ||
          !(resources.texture instanceof THREE.Data3DTexture) ||
          resources.texture.image.data.length !== textureData.length ||
          resources.texture.format !== textureFormat ||
          resources.texture.type !== textureType;

        if (needsRebuild) {
          removeResource(layer.key);

          const texture = sourceUsesVolume
            ? new THREE.Data3DTexture(textureData, width, height, depth)
            : createFallbackVolumeDataTexture();
          texture.format = sourceUsesVolume ? textureFormat : THREE.RedFormat;
          texture.type = sourceUsesVolume ? textureType : THREE.UnsignedByteType;
          applyVolumeTextureSampling(texture, effectiveSamplingMode);
          texture.unpackAlignment = 1;
          if (!layer.isSegmentation) {
            texture.colorSpace = THREE.LinearSRGBColorSpace;
          }
          texture.needsUpdate = true;

          const shader = VolumeRenderShaderVariants[getVolumeRenderShaderVariantKey(layer.renderStyle, effectiveSamplingMode)];
          const uniforms = THREE.UniformsUtils.clone(shader.uniforms);
          uniforms.u_data.value = texture;
          if (uniforms.u_isSegmentation) {
            uniforms.u_isSegmentation.value = layer.isSegmentation ? 1 : 0;
          }
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
          if (uniforms.u_zClipFront) {
            uniforms.u_zClipFront.value = safeZClipFront;
          }
          uniforms.u_nearestSampling.value = effectiveSamplingMode === 'nearest' ? 1 : 0;
          applyAdaptiveLodUniforms(uniforms as ShaderUniformMap, effectiveSamplingMode);
          applyBeerLambertUniforms(uniforms as ShaderUniformMap, layer);
          if (uniforms.u_segmentationLabels) {
            uniforms.u_segmentationLabels.value = layer.isSegmentation ? texture : FALLBACK_SEGMENTATION_LABEL_TEXTURE;
          }
          if (uniforms.u_segmentationBrickAtlasData) {
            uniforms.u_segmentationBrickAtlasData.value = FALLBACK_SEGMENTATION_LABEL_TEXTURE;
          }
          if (uniforms.u_segmentationPalette) {
            uniforms.u_segmentationPalette.value =
              segmentationPaletteTexture ?? FALLBACK_SEGMENTATION_PALETTE_TEXTURE;
          }
          if (uniforms.u_additive) {
            uniforms.u_additive.value = layerAdditiveEnabled ? 1 : 0;
          }

          const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: THREE.BackSide,
            transparent: true,
            blending: layerMaterialBlending,
          });
          material.depthWrite = false;
          material.depthTest = true;
          applyVolumeMaterialState(material, layerMaterialBlending);

          const proxyWidth = Math.max(proxyVisibleBox.max[0] - proxyVisibleBox.min[0], 1e-3);
          const proxyHeight = Math.max(proxyVisibleBox.max[1] - proxyVisibleBox.min[1], 1e-3);
          const proxyDepth = Math.max(proxyVisibleBox.max[2] - proxyVisibleBox.min[2], 1e-3);
          const proxyCenterX = (proxyVisibleBox.min[0] + proxyVisibleBox.max[0]) * 0.5;
          const proxyCenterY = (proxyVisibleBox.min[1] + proxyVisibleBox.max[1]) * 0.5;
          const proxyCenterZ = (proxyVisibleBox.min[2] + proxyVisibleBox.max[2]) * 0.5;
          const geometry = new THREE.BoxGeometry(proxyWidth, proxyHeight, proxyDepth);
          geometry.translate(proxyCenterX, proxyCenterY, proxyCenterZ);

          const mesh = new THREE.Mesh(geometry, material);
          mesh.visible = isPlaybackWarmup ? false : layer.visible;
          mesh.renderOrder = index;
          mesh.position.set(layer.offsetX, layer.offsetY, 0);
          assignVolumeMeshOnBeforeRender(mesh);

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
            labelTexture: null,
            paletteTexture: segmentationPaletteTexture,
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
            brickAtlasBaseTexture: null,
            brickAtlasDataTexture: null,
            backgroundMaskTexture: null,
            brickSubcellTexture: null,
            skipHierarchyTexture: null,
            skipHierarchySourcePageTable: null,
            skipHierarchyLevelCount: 0,
            brickMetadataSourcePageTable: null,
            brickAtlasIndexSourcePageTable: null,
            brickAtlasBaseSourcePageTable: null,
            brickAtlasBaseSourceSignature: null,
            brickSubcellSourcePageTable: null,
            brickSubcellSourceToken: null,
            brickSubcellGrid: null,
            brickAtlasSourceToken: null,
            brickAtlasSourceData: null,
            brickAtlasSourceFormat: null,
            brickAtlasSourcePageTable: null,
            brickAtlasSlotGrid: null,
            brickAtlasBuildVersion: 0,
            backgroundMaskSourceToken: null,
            proxyGeometrySignature: proxyVisibleBox.signature,
            playbackWarmupForLayerKey: layer.playbackWarmupForLayerKey ?? null,
            playbackWarmupTimeIndex: layer.playbackWarmupTimeIndex ?? null,
            preferIncrementalResidency: isPlaybackWarmup && !playbackPinnedResidency,
            playbackPinnedResidency,
            playbackWarmupReady: null,
            updateGpuBrickResidencyForCamera: null,
          };
          applyBackgroundMaskUniforms(
            uniforms as ShaderUniformMap,
            nextResource,
            layer.backgroundMask ?? null,
          );
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
                    forceFullResidency: playbackPinnedResidency || !isPlaybackWarmup,
                    isSegmentation: layer.isSegmentation,
                  }
              : intensityVolume
                ? {
                    textureDataToken: intensityVolume.normalized,
                    textureData,
                    textureFormat,
                    max3DTextureSize,
                    preferDirectVolumeSampling,
                    disableBrickPageTableSampling: shouldDisableDirectVolumeBrickPageTableSampling,
                    isSegmentation: false,
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
        const maxDisplayIndex = Math.max(0, depth - 1);
        const clampedIndex = Math.min(Math.max(zIndex, 0), maxDisplayIndex);
        const maxSliceDataIndex = Math.max(0, dataDepthForSlice - 1);
        const clampedSliceDataIndex = Math.min(Math.max(sliceDataIndex, 0), maxSliceDataIndex);
        const expectedLength =
          volume
            ? getExpectedSliceBufferLength(volume)
            : pageTable
              ? Math.max(1, pageTable.volumeShape[1]) * Math.max(1, pageTable.volumeShape[2]) * 4
              : 0;

        const needsRebuild =
          !resources ||
          resources.mode !== viewerMode ||
          resources.dimensions.width !== width ||
          resources.dimensions.height !== height ||
          resources.dimensions.depth !== depth ||
          resources.channels !== channels ||
          !(resources.texture instanceof THREE.DataTexture) ||
          (expectedLength > 0 && (resources.sliceBuffer?.length ?? 0) !== expectedLength);

        if (needsRebuild) {
          removeResource(layer.key);

          const sliceTexture = (() => {
            const isNearestSampling = effectiveSamplingMode === 'nearest';
            if (volume) {
              const sliceInfo = prepareSliceTexture(
                volume,
                clampedSliceDataIndex,
                null,
                segmentationPaletteTexture ? (segmentationPaletteTexture.image.data as Uint8Array) : null,
              );
              const texture = new THREE.DataTexture(
                sliceInfo.data,
                volume.width,
                volume.height,
                sliceInfo.format,
              );
              texture.type = THREE.UnsignedByteType;
              texture.minFilter = isNearestSampling ? THREE.NearestFilter : THREE.LinearFilter;
              texture.magFilter = isNearestSampling ? THREE.NearestFilter : THREE.LinearFilter;
              texture.unpackAlignment = 1;
              texture.colorSpace = THREE.LinearSRGBColorSpace;
              texture.needsUpdate = true;
              return { texture, sliceBuffer: sliceInfo.data };
            }
            if (pageTable && brickAtlas?.enabled) {
              const sliceInfo = prepareSliceTextureFromBrickAtlas(
                {
                  pageTable,
                  atlasData: brickAtlas.data,
                  textureFormat: brickAtlas.textureFormat,
                  sourceChannels: brickAtlas.sourceChannels,
                  dataType: brickAtlas.dataType,
                },
                clampedSliceDataIndex,
                null,
                segmentationPaletteTexture ? (segmentationPaletteTexture.image.data as Uint8Array) : null,
              );
              const texture = new THREE.DataTexture(
                sliceInfo.data,
                sliceInfo.width,
                sliceInfo.height,
                sliceInfo.format,
              );
              texture.type = THREE.UnsignedByteType;
              texture.minFilter = isNearestSampling ? THREE.NearestFilter : THREE.LinearFilter;
              texture.magFilter = isNearestSampling ? THREE.NearestFilter : THREE.LinearFilter;
              texture.unpackAlignment = 1;
              texture.colorSpace = THREE.LinearSRGBColorSpace;
              texture.needsUpdate = true;
              return { texture, sliceBuffer: sliceInfo.data };
            }
            {
              const fallbackTexture = new THREE.DataTexture(
                FALLBACK_VOLUME_TEXTURE_DATA.slice(),
                1,
                1,
                THREE.RedFormat,
              );
              fallbackTexture.type = THREE.UnsignedByteType;
              fallbackTexture.minFilter = isNearestSampling ? THREE.NearestFilter : THREE.LinearFilter;
              fallbackTexture.magFilter = isNearestSampling ? THREE.NearestFilter : THREE.LinearFilter;
              fallbackTexture.unpackAlignment = 1;
              fallbackTexture.colorSpace = THREE.LinearSRGBColorSpace;
              fallbackTexture.needsUpdate = true;
              return { texture: fallbackTexture, sliceBuffer: null as Uint8Array | null };
            }
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
            sliceUniforms.u_sliceIndex.value = clampedSliceDataIndex;
          }
          if ('u_sliceSize' in sliceUniforms) {
            const image = texture.image as { width?: number; height?: number };
            const sliceWidth = Math.max(1, Number(image.width ?? width));
            const sliceHeight = Math.max(1, Number(image.height ?? height));
            (sliceUniforms.u_sliceSize.value as THREE.Vector2).set(sliceWidth, sliceHeight);
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
          mesh.visible = isPlaybackWarmup ? false : layer.visible;
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
            labelTexture: null,
            paletteTexture: segmentationPaletteTexture,
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
            brickAtlasBaseTexture: null,
            brickAtlasDataTexture: null,
            backgroundMaskTexture: null,
            brickSubcellTexture: null,
            skipHierarchyTexture: null,
            skipHierarchySourcePageTable: null,
            skipHierarchyLevelCount: 0,
            brickMetadataSourcePageTable: null,
            brickAtlasIndexSourcePageTable: null,
            brickAtlasBaseSourcePageTable: null,
            brickAtlasBaseSourceSignature: null,
            brickSubcellSourcePageTable: null,
            brickSubcellSourceToken: null,
            brickSubcellGrid: null,
            brickAtlasSourceToken: null,
            brickAtlasSourceData: null,
            brickAtlasSourceFormat: null,
            brickAtlasSourcePageTable: null,
            brickAtlasSlotGrid: null,
            brickAtlasBuildVersion: 0,
            backgroundMaskSourceToken: null,
            playbackWarmupForLayerKey: layer.playbackWarmupForLayerKey ?? null,
            playbackWarmupTimeIndex: layer.playbackWarmupTimeIndex ?? null,
            preferIncrementalResidency: isPlaybackWarmup && !playbackPinnedResidency,
            playbackPinnedResidency,
            playbackWarmupReady: null,
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
                  forceFullResidency: playbackPinnedResidency || !isPlaybackWarmup,
                  isSegmentation: layer.isSegmentation,
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
        resources.playbackWarmupForLayerKey = layer.playbackWarmupForLayerKey ?? null;
        resources.playbackWarmupTimeIndex = layer.playbackWarmupTimeIndex ?? null;
        resources.playbackPinnedResidency = playbackPinnedResidency;
        resources.preferIncrementalResidency =
          (isPlaybackWarmup || promotedFromWarmup) && !playbackPinnedResidency;
        resources.paletteTexture = segmentationPaletteTexture;
        mesh.visible = isPlaybackWarmup ? false : layer.visible;
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
        const shaderMaterial = mesh.material as THREE.ShaderMaterial;
        const desiredBlending = layerMaterialBlending;
        if (resources.mode === '3d') {
          applyVolumeMaterialState(shaderMaterial, desiredBlending);
        } else if (shaderMaterial.blending !== desiredBlending) {
          shaderMaterial.blending = desiredBlending;
          shaderMaterial.needsUpdate = true;
        }
        if (materialUniforms.u_stepScale) {
          materialUniforms.u_stepScale.value = volumeStepScaleRef.current;
        }
        if (materialUniforms.u_zClipFront) {
          materialUniforms.u_zClipFront.value = safeZClipFront;
        }
        if (materialUniforms.u_nearestSampling) {
          materialUniforms.u_nearestSampling.value = effectiveSamplingMode === 'nearest' ? 1 : 0;
        }
        applyAdaptiveLodUniforms(materialUniforms, effectiveSamplingMode);
        applyBeerLambertUniforms(materialUniforms, layer);
        applyBackgroundMaskUniforms(materialUniforms, resources, layer.backgroundMask ?? null);

        if (resources.mode === '3d') {
          assignVolumeMeshOnBeforeRender(mesh);
          const preparation = intensityVolume ? cachedPreparation ?? getCachedTextureData(intensityVolume) : null;
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
                  forceFullResidency:
                    Boolean(resources.playbackPinnedResidency) ||
                    !(resources.preferIncrementalResidency ?? false),
                  isSegmentation: layer.isSegmentation,
                }
              : intensityVolume && preparation
                ? {
                    textureDataToken: intensityVolume.normalized,
                    textureData: preparation.data,
                    textureFormat: preparation.format,
                    max3DTextureSize,
                    preferDirectVolumeSampling,
                    disableBrickPageTableSampling: shouldDisableDirectVolumeBrickPageTableSampling,
                    isSegmentation: false,
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
          const nextTextureData = preparation
            ? preparation.data
            : segmentationVolume
              ? packSegmentationLabelTextureData(segmentationVolume.labels)
              : FALLBACK_VOLUME_TEXTURE_DATA;
          const nextTextureWidth = preparation || segmentationVolume ? width : 1;
          const nextTextureHeight = preparation || segmentationVolume ? height : 1;
          const nextTextureDepth = preparation || segmentationVolume ? depth : 1;
          const nextTextureFormat = preparation
            ? preparation.format
            : segmentationVolume
              ? THREE.RGFormat
              : THREE.RedFormat;
          const nextTextureType = THREE.UnsignedByteType;
          const textureSourceChanged =
            dataTexture.image.data !== nextTextureData ||
            dataTexture.image.width !== nextTextureWidth ||
            dataTexture.image.height !== nextTextureHeight ||
            dataTexture.image.depth !== nextTextureDepth ||
            dataTexture.format !== nextTextureFormat ||
            dataTexture.type !== nextTextureType;
          if (textureSourceChanged) {
            dataTexture.image.data = nextTextureData;
            dataTexture.image.width = nextTextureWidth;
            dataTexture.image.height = nextTextureHeight;
            dataTexture.image.depth = nextTextureDepth;
            dataTexture.format = nextTextureFormat;
            dataTexture.type = nextTextureType;
            dataTexture.needsUpdate = true;
          }
          if (materialUniforms.u_data.value !== dataTexture) {
            materialUniforms.u_data.value = dataTexture;
          }
          if (materialUniforms.u_isSegmentation) {
            materialUniforms.u_isSegmentation.value = layer.isSegmentation ? 1 : 0;
          }
          if (materialUniforms.u_segmentationPalette) {
            materialUniforms.u_segmentationPalette.value =
              segmentationPaletteTexture ?? FALLBACK_SEGMENTATION_PALETTE_TEXTURE;
          }
          if (materialUniforms.u_size) {
            const sizeUniform = materialUniforms.u_size.value as THREE.Vector3;
            if (sizeUniform.x !== width || sizeUniform.y !== height || sizeUniform.z !== depth) {
              sizeUniform.set(width, height, depth);
            }
          }
          resources.paletteTexture = segmentationPaletteTexture;
          resources.labelTexture = null;
          if (materialUniforms.u_segmentationLabels) {
            materialUniforms.u_segmentationLabels.value =
              layer.isSegmentation ? dataTexture : FALLBACK_SEGMENTATION_LABEL_TEXTURE;
          }
          if (materialUniforms.u_segmentationBrickAtlasData && !brickAtlas) {
            materialUniforms.u_segmentationBrickAtlasData.value = FALLBACK_SEGMENTATION_LABEL_TEXTURE;
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
          const maxDisplayIndex = Math.max(0, depth - 1);
          const clampedIndex = Math.min(Math.max(zIndex, 0), maxDisplayIndex);
          const maxSliceDataIndex = Math.max(0, dataDepthForSlice - 1);
          const clampedSliceDataIndex = Math.min(Math.max(sliceDataIndex, 0), maxSliceDataIndex);
          if (materialUniforms.u_size) {
            (materialUniforms.u_size.value as THREE.Vector3).set(width, height, depth);
          }
          if (materialUniforms.u_sliceIndex) {
            materialUniforms.u_sliceIndex.value = clampedSliceDataIndex;
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
                  forceFullResidency:
                    Boolean(resources.playbackPinnedResidency) ||
                    !(resources.preferIncrementalResidency ?? false),
                  isSegmentation: layer.isSegmentation,
                }
                : undefined,
          );

          const dataTexture = resources.texture as THREE.DataTexture;
          const shouldUseNearestSampling = effectiveSamplingMode === 'nearest';
          if (
            dataTexture.minFilter !== (shouldUseNearestSampling ? THREE.NearestFilter : THREE.LinearFilter) ||
            dataTexture.magFilter !== (shouldUseNearestSampling ? THREE.NearestFilter : THREE.LinearFilter)
          ) {
            dataTexture.minFilter = shouldUseNearestSampling ? THREE.NearestFilter : THREE.LinearFilter;
            dataTexture.magFilter = shouldUseNearestSampling ? THREE.NearestFilter : THREE.LinearFilter;
            dataTexture.needsUpdate = true;
          }

          if (volume) {
            const existingBuffer = resources.sliceBuffer ?? null;
            const sliceInfo = prepareSliceTexture(
              volume,
              clampedSliceDataIndex,
              existingBuffer,
              segmentationPaletteTexture ? (segmentationPaletteTexture.image.data as Uint8Array) : null,
            );
            resources.sliceBuffer = sliceInfo.data;
            dataTexture.image.data = sliceInfo.data;
            dataTexture.image.width = volume.width;
            dataTexture.image.height = volume.height;
            dataTexture.format = sliceInfo.format;
            dataTexture.needsUpdate = true;
            materialUniforms.u_slice.value = dataTexture;
          } else if (pageTable && brickAtlas?.enabled) {
            const existingBuffer = resources.sliceBuffer ?? null;
            const sliceInfo = prepareSliceTextureFromBrickAtlas(
              {
                pageTable,
                atlasData: brickAtlas.data,
                textureFormat: brickAtlas.textureFormat,
                sourceChannels: brickAtlas.sourceChannels,
                dataType: brickAtlas.dataType,
              },
              clampedSliceDataIndex,
              existingBuffer,
              segmentationPaletteTexture ? (segmentationPaletteTexture.image.data as Uint8Array) : null,
            );
            resources.sliceBuffer = sliceInfo.data;
            dataTexture.image.data = sliceInfo.data;
            dataTexture.image.width = sliceInfo.width;
            dataTexture.image.height = sliceInfo.height;
            dataTexture.format = sliceInfo.format;
            dataTexture.needsUpdate = true;
            materialUniforms.u_slice.value = dataTexture;
          }
          if (materialUniforms.u_sliceSize) {
            const image = dataTexture.image as { width?: number; height?: number };
            const sliceWidth = Math.max(1, Number(image.width ?? width));
            const sliceHeight = Math.max(1, Number(image.height ?? height));
            (materialUniforms.u_sliceSize.value as THREE.Vector2).set(sliceWidth, sliceHeight);
          }

          resources.samplingMode = effectiveSamplingMode;

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
    playbackWarmupLayers,
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
    zClipFrontFraction,
  ]);

  useEffect(() => {
    return () => {
      for (const texture of colormapCacheRef.current.values()) {
        texture.dispose();
      }
      colormapCacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!import.meta.env?.DEV) {
      return;
    }

    const buildResourceSummary = () => {
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      const renderer = rendererRef?.current ?? null;
      const cameraDirection = new THREE.Vector3();
      const frustum = new THREE.Frustum();
      const projectionMatrix = new THREE.Matrix4();
      const cameraSummary = camera
        ? {
            position: [camera.position.x, camera.position.y, camera.position.z],
            direction: (() => {
              camera.getWorldDirection(cameraDirection);
              return [cameraDirection.x, cameraDirection.y, cameraDirection.z];
            })(),
            near: camera.near,
            far: camera.far,
            fov: camera.fov,
            target: controls ? [controls.target.x, controls.target.y, controls.target.z] : null
          }
        : null;
      if (camera) {
        camera.updateMatrixWorld(true);
        projectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(projectionMatrix);
      }
      const rendererSummary = renderer
        ? (() => {
            const viewport = new THREE.Vector4();
            const scissor = new THREE.Vector4();
            renderer.getViewport(viewport);
            renderer.getScissor(scissor);
            return {
              calls: renderer.info.render.calls,
              triangles: renderer.info.render.triangles,
              points: renderer.info.render.points,
              lines: renderer.info.render.lines,
              frame: renderer.info.render.frame,
              viewport: [viewport.x, viewport.y, viewport.z, viewport.w],
              scissor: [scissor.x, scissor.y, scissor.z, scissor.w],
              scissorTest: renderer.getScissorTest()
            };
          })()
        : null;
      const resources = Array.from(resourcesRef.current.entries()).map(([key, resource]) => {
        const compactTextureDimensions = (texture: THREE.Data3DTexture | null | undefined) => {
          if (!texture) {
            return null;
          }
          const { width, height, depth } = getTextureDimensions(texture);
          return { width, height, depth };
        };
        const material = resource.mesh.material;
        resource.mesh.updateMatrixWorld(true);
        const worldPosition = new THREE.Vector3();
        const worldQuaternion = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        resource.mesh.matrixWorld.decompose(worldPosition, worldQuaternion, worldScale);
        const shaderMaterial = material instanceof THREE.ShaderMaterial ? material : null;
        const uniforms = (shaderMaterial?.uniforms ?? null) as ShaderUniformMap | null;
        const fragmentHasForcedColor = Boolean(
          shaderMaterial?.fragmentShader?.includes('vec4(1.0, 0.0, 0.0, 1.0)')
        );
        const frustumIntersects = camera ? frustum.intersectsObject(resource.mesh) : null;
        const materialSummary =
          shaderMaterial
            ? {
                transparent: shaderMaterial.transparent,
                opacity: shaderMaterial.opacity,
                visible: shaderMaterial.visible,
                side: shaderMaterial.side,
                blending: shaderMaterial.blending,
                depthTest: shaderMaterial.depthTest,
                depthWrite: shaderMaterial.depthWrite,
                colorWrite: shaderMaterial.colorWrite
              }
            : null;
        const dataTexture =
          resource.texture instanceof THREE.Data3DTexture ? compactTextureDimensions(resource.texture) : null;
        const dataTextureSample = (() => {
          if (!(resource.texture instanceof THREE.Data3DTexture)) {
            return null;
          }
          const image = resource.texture.image as { data?: unknown };
          if (!(image.data instanceof Uint8Array)) {
            return null;
          }
          const sampleLength = Math.min(16, image.data.length);
          const firstValues = Array.from(image.data.subarray(0, sampleLength));
          const scanLength = Math.min(4096, image.data.length);
          let scanMax = 0;
          let scanNonZero = 0;
          for (let index = 0; index < scanLength; index += 1) {
            const value = image.data[index] ?? 0;
            if (value > scanMax) {
              scanMax = value;
            }
            if (value > 0) {
              scanNonZero += 1;
            }
          }
          return {
            firstValues,
            scanLength,
            scanMax,
            scanNonZero
          };
        })();
        const atlasTexture = compactTextureDimensions(resource.brickAtlasDataTexture);
        const hierarchyTexture = compactTextureDimensions(resource.skipHierarchyTexture);
        const occupancyTexture = compactTextureDimensions(resource.brickOccupancyTexture);
        const atlasIndexTexture = compactTextureDimensions(resource.brickAtlasIndexTexture);
        return {
          key,
          mode: resource.mode,
          visible: resource.mesh.visible,
          renderStyle: resource.renderStyle,
          channels: resource.channels,
          dimensions: resource.dimensions,
          localPosition: [resource.mesh.position.x, resource.mesh.position.y, resource.mesh.position.z],
          localScale: [resource.mesh.scale.x, resource.mesh.scale.y, resource.mesh.scale.z],
          worldPosition: [worldPosition.x, worldPosition.y, worldPosition.z],
          worldScale: [worldScale.x, worldScale.y, worldScale.z],
          frustumIntersects,
          fragmentHasForcedColor,
          materialSummary,
          dataTexture,
          dataTextureSample,
          atlasTexture,
          brickAtlasSlotGrid: resource.brickAtlasSlotGrid ?? null,
          hierarchyTexture,
          occupancyTexture,
          atlasIndexTexture,
          brickPageTable:
            resource.brickPageTable
              ? {
                  layerKey: resource.brickPageTable.layerKey,
                  timepoint: resource.brickPageTable.timepoint,
                  scaleLevel: resource.brickPageTable.scaleLevel,
                  gridShape: resource.brickPageTable.gridShape,
                  chunkShape: resource.brickPageTable.chunkShape,
                  volumeShape: resource.brickPageTable.volumeShape,
                  occupiedBrickCount: resource.brickPageTable.occupiedBrickCount
                }
              : null,
          brickAtlasSourcePageTable:
            resource.brickAtlasSourcePageTable
              ? {
                  layerKey: resource.brickAtlasSourcePageTable.layerKey,
                  timepoint: resource.brickAtlasSourcePageTable.timepoint,
                  scaleLevel: resource.brickAtlasSourcePageTable.scaleLevel,
                  gridShape: resource.brickAtlasSourcePageTable.gridShape,
                  chunkShape: resource.brickAtlasSourcePageTable.chunkShape,
                  volumeShape: resource.brickAtlasSourcePageTable.volumeShape,
                  occupiedBrickCount: resource.brickAtlasSourcePageTable.occupiedBrickCount
                }
              : null,
          gpuBrickResidencyMetrics: resource.gpuBrickResidencyMetrics ?? null,
          uniforms: uniforms
            ? {
                brickSkipEnabled: Number(uniforms.u_brickSkipEnabled?.value ?? 0),
                brickAtlasEnabled: Number(uniforms.u_brickAtlasEnabled?.value ?? 0),
                nearestSampling: Number(uniforms.u_nearestSampling?.value ?? 0),
                adaptiveLodEnabled: Number(uniforms.u_adaptiveLodEnabled?.value ?? 0),
                adaptiveLodMax: Number(uniforms.u_adaptiveLodMax?.value ?? 0),
                mipEarlyExitThreshold: Number(uniforms.u_mipEarlyExitThreshold?.value ?? 0),
                windowMin: Number(uniforms.u_windowMin?.value ?? 0),
                windowMax: Number(uniforms.u_windowMax?.value ?? 0),
                clim:
                  uniforms.u_clim?.value instanceof THREE.Vector2
                    ? [uniforms.u_clim.value.x, uniforms.u_clim.value.y]
                    : null,
                size:
                  uniforms.u_size?.value instanceof THREE.Vector3
                    ? [uniforms.u_size.value.x, uniforms.u_size.value.y, uniforms.u_size.value.z]
                    : null,
                brickAtlasSlotGrid:
                  uniforms.u_brickAtlasSlotGrid?.value instanceof THREE.Vector3
                    ? [
                        uniforms.u_brickAtlasSlotGrid.value.x,
                        uniforms.u_brickAtlasSlotGrid.value.y,
                        uniforms.u_brickAtlasSlotGrid.value.z
                      ]
                    : null
              }
            : null
        };
      });
      return {
        camera: cameraSummary,
        renderer: rendererSummary,
        resources
      };
    };

    window.__LLSM_VOLUME_RESOURCE_SUMMARY__ = buildResourceSummary;
    const forceRender = () => {
      const renderer = rendererRef?.current ?? null;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera) {
        return false;
      }
      renderer.render(scene, camera);
      return true;
    };
    const captureRenderTargetMetrics = () => {
      const renderer = rendererRef?.current ?? null;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera) {
        return null;
      }
      const bufferSize = new THREE.Vector2();
      renderer.getDrawingBufferSize(bufferSize);
      const width = Math.max(1, Math.floor(bufferSize.x));
      const height = Math.max(1, Math.floor(bufferSize.y));
      const target = new THREE.WebGLRenderTarget(width, height, {
        depthBuffer: true,
        stencilBuffer: false,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
      });
      const previousRenderTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      renderer.setRenderTarget(target);
      renderer.autoClear = true;
      renderer.clear(true, true, true);
      renderer.render(scene, camera);
      const pixels = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      renderer.setRenderTarget(previousRenderTarget);
      renderer.autoClear = previousAutoClear;
      target.dispose();

      const pixelCount = width * height;
      let nonBlackPixels = 0;
      let nonTransparentPixels = 0;
      let lumaSum = 0;
      for (let offset = 0; offset < pixels.length; offset += 4) {
        const r = pixels[offset] ?? 0;
        const g = pixels[offset + 1] ?? 0;
        const b = pixels[offset + 2] ?? 0;
        const a = pixels[offset + 3] ?? 0;
        if (a > 0) {
          nonTransparentPixels += 1;
        }
        const luma = r + g + b;
        lumaSum += luma;
        if (luma > 0) {
          nonBlackPixels += 1;
        }
      }
      return {
        width,
        height,
        nonBlackPixels,
        nonTransparentPixels,
        avgLuma: pixelCount > 0 ? lumaSum / (pixelCount * 3) : 0,
      };
    };
    const patchVolumeUniforms = (
      patch: Partial<{
        brickSkipEnabled: number;
        brickAtlasEnabled: number;
        nearestSampling: number;
        adaptiveLodEnabled: number;
        adaptiveLodMax: number;
        mipEarlyExitThreshold: number;
        windowMin: number;
        windowMax: number;
        renderThreshold: number;
        renderStyle: number;
        clim: [number, number];
      }>,
    ) => {
      let updatedResources = 0;
      for (const resource of resourcesRef.current.values()) {
        if (resource.mode !== '3d') {
          continue;
        }
        const material = resource.mesh.material;
        const materialList = Array.isArray(material) ? material : [material];
        let resourceUpdated = false;
        for (const entry of materialList) {
          if (!(entry instanceof THREE.ShaderMaterial)) {
            continue;
          }
          const uniforms = entry.uniforms as ShaderUniformMap | undefined;
          if (!uniforms) {
            continue;
          }
          const assignNumberUniform = (uniformName: string, value: unknown) => {
            if (!Object.prototype.hasOwnProperty.call(uniforms, uniformName)) {
              return;
            }
            if (typeof value !== 'number' || !Number.isFinite(value)) {
              return;
            }
            const uniform = uniforms[uniformName];
            if (!uniform || typeof uniform !== 'object' || !('value' in uniform)) {
              return;
            }
            if (uniform.value !== value) {
              uniform.value = value;
              resourceUpdated = true;
            }
          };
          assignNumberUniform('u_brickSkipEnabled', patch.brickSkipEnabled);
          assignNumberUniform('u_brickAtlasEnabled', patch.brickAtlasEnabled);
          assignNumberUniform('u_nearestSampling', patch.nearestSampling);
          assignNumberUniform('u_adaptiveLodEnabled', patch.adaptiveLodEnabled);
          assignNumberUniform('u_adaptiveLodMax', patch.adaptiveLodMax);
          assignNumberUniform('u_mipEarlyExitThreshold', patch.mipEarlyExitThreshold);
          assignNumberUniform('u_windowMin', patch.windowMin);
          assignNumberUniform('u_windowMax', patch.windowMax);
          assignNumberUniform('u_renderthreshold', patch.renderThreshold);
          assignNumberUniform('u_renderstyle', patch.renderStyle);
          if (patch.clim && uniforms.u_clim?.value instanceof THREE.Vector2) {
            const [nextMin, nextMax] = patch.clim;
            if (Number.isFinite(nextMin) && Number.isFinite(nextMax)) {
              const clim = uniforms.u_clim.value;
              if (clim.x !== nextMin || clim.y !== nextMax) {
                clim.set(nextMin, nextMax);
                resourceUpdated = true;
              }
            }
          }
        }
        if (resourceUpdated) {
          updatedResources += 1;
        }
      }
      return updatedResources;
    };
    const setCameraDistance = (distance: number) => {
      if (!Number.isFinite(distance) || distance <= 0) {
        return false;
      }
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!camera || !controls) {
        return false;
      }
      const cameraDirection = new THREE.Vector3().subVectors(camera.position, controls.target);
      if (!Number.isFinite(cameraDirection.lengthSq()) || cameraDirection.lengthSq() < 1e-12) {
        cameraDirection.set(0, 0, 1);
      }
      cameraDirection.normalize();
      camera.position.copy(controls.target).addScaledVector(cameraDirection, distance);
      camera.updateMatrixWorld(true);
      controls.update();
      return true;
    };
    window.__LLSM_FORCE_RENDER__ = forceRender;
    window.__LLSM_PATCH_VOLUME_UNIFORMS__ = patchVolumeUniforms;
    window.__LLSM_CAPTURE_RENDER_TARGET_METRICS__ = captureRenderTargetMetrics;
    window.__LLSM_SET_CAMERA_DISTANCE__ = setCameraDistance;
    return () => {
      if (window.__LLSM_VOLUME_RESOURCE_SUMMARY__ === buildResourceSummary) {
        delete window.__LLSM_VOLUME_RESOURCE_SUMMARY__;
      }
      if (window.__LLSM_FORCE_RENDER__ === forceRender) {
        delete window.__LLSM_FORCE_RENDER__;
      }
      if (window.__LLSM_PATCH_VOLUME_UNIFORMS__ === patchVolumeUniforms) {
        delete window.__LLSM_PATCH_VOLUME_UNIFORMS__;
      }
      if (window.__LLSM_CAPTURE_RENDER_TARGET_METRICS__ === captureRenderTargetMetrics) {
        delete window.__LLSM_CAPTURE_RENDER_TARGET_METRICS__;
      }
      if (window.__LLSM_SET_CAMERA_DISTANCE__ === setCameraDistance) {
        delete window.__LLSM_SET_CAMERA_DISTANCE__;
      }
    };
  }, [cameraRef, rendererRef, resourcesRef, sceneRef]);

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
