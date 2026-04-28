import * as THREE from 'three';

import type { VolumeBrickPageTable } from '../../../core/volumeProvider';
import type { VolumeResources } from '../VolumeViewer.types';
import type { SparseSegmentationRenderStrategy } from './sparseSegmentationRenderPlanner';
import { FALLBACK_BRICK_ATLAS_DATA_TEXTURE } from './fallbackTextures';

type TextureFormat = THREE.Data3DTexture['format'];

type SparseSegmentationExactBatchPlan = Extract<
  SparseSegmentationRenderStrategy,
  { kind: 'exact-batched' }
>;

type SparseSegmentationExactBatchSource = {
  pageTable: VolumeBrickPageTable;
  sourceAtlasData: Uint8Array;
  sourceAtlasSize: { width: number; height: number; depth: number };
  sourceSlotGrid: { x: number; y: number; z: number };
  textureFormat: TextureFormat;
  plan: SparseSegmentationExactBatchPlan;
};

export type SparseSegmentationExactBatchRenderState = SparseSegmentationExactBatchSource & {
  occupiedSourceIndices: number[];
  sourceIndexToFlatBrickIndices: Map<number, number[]>;
  batchAtlasData: Uint8Array;
  batchAtlasIndexData: Float32Array;
  batchAtlasBaseData: Float32Array;
  batchAtlasTexture: THREE.Data3DTexture | null;
  batchAtlasIndexTexture: THREE.Data3DTexture | null;
  batchAtlasBaseTexture: THREE.Data3DTexture | null;
  batchMaterial: THREE.ShaderMaterial | null;
  batchMaterialSourceVertexShader: string | null;
  batchMaterialSourceFragmentShader: string | null;
  proxyScene: THREE.Scene | null;
  proxyMesh: THREE.Mesh | null;
};

function textureComponentCount(format: TextureFormat): number {
  switch (format) {
    case THREE.RedFormat:
      return 1;
    case THREE.RGFormat:
      return 2;
    case THREE.RGBFormat:
      return 3;
    case THREE.RGBAFormat:
      return 4;
    default:
      return 4;
  }
}

function normalizeSlotGrid(slotGrid: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return {
    x: Math.max(1, Math.floor(slotGrid.x)),
    y: Math.max(1, Math.floor(slotGrid.y)),
    z: Math.max(1, Math.floor(slotGrid.z)),
  };
}

function resolveSlotCopyGeometry({
  slotGrid,
  atlasSize,
  pageTable,
}: {
  slotGrid: { x: number; y: number; z: number };
  atlasSize: { width: number; height: number; depth: number };
  pageTable: VolumeBrickPageTable;
}) {
  const safeSlotGrid = normalizeSlotGrid(slotGrid);
  const cellWidth = Math.max(1, atlasSize.width / safeSlotGrid.x);
  const cellHeight = Math.max(1, atlasSize.height / safeSlotGrid.y);
  const cellDepth = Math.max(1, atlasSize.depth / safeSlotGrid.z);
  const brickWidth = Math.max(1, pageTable.chunkShape[2]);
  const brickHeight = Math.max(1, pageTable.chunkShape[1]);
  const brickDepth = Math.max(1, pageTable.chunkShape[0]);
  return {
    slotGrid: safeSlotGrid,
    cellWidth,
    cellHeight,
    cellDepth,
    brickWidth,
    brickHeight,
    brickDepth,
    offsetX: Math.max(Math.floor((cellWidth - brickWidth) * 0.5), 0),
    offsetY: Math.max(Math.floor((cellHeight - brickHeight) * 0.5), 0),
    offsetZ: Math.max(Math.floor((cellDepth - brickDepth) * 0.5), 0),
  };
}

function resolveSlotOrigin({
  slotIndex,
  slotGrid,
  cellWidth,
  cellHeight,
  cellDepth,
  offsetX,
  offsetY,
  offsetZ,
}: {
  slotIndex: number;
  slotGrid: { x: number; y: number; z: number };
  cellWidth: number;
  cellHeight: number;
  cellDepth: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
}) {
  const slotsPerLayer = Math.max(1, slotGrid.x * slotGrid.y);
  const slotZ = Math.floor(slotIndex / slotsPerLayer);
  const withinLayer = slotIndex - slotZ * slotsPerLayer;
  const slotY = Math.floor(withinLayer / slotGrid.x);
  const slotX = withinLayer - slotY * slotGrid.x;
  return {
    x: Math.floor(slotX * cellWidth + offsetX),
    y: Math.floor(slotY * cellHeight + offsetY),
    z: Math.floor(slotZ * cellDepth + offsetZ),
  };
}

export function collectSparseSegmentationOccupiedSourceIndices(
  pageTable: Pick<VolumeBrickPageTable, 'brickAtlasIndices'>
): number[] {
  const sourceIndices = new Set<number>();
  for (let index = 0; index < pageTable.brickAtlasIndices.length; index += 1) {
    const sourceIndex = pageTable.brickAtlasIndices[index] ?? -1;
    if (sourceIndex >= 0) {
      sourceIndices.add(sourceIndex);
    }
  }
  return Array.from(sourceIndices).sort((left, right) => left - right);
}

function buildSourceIndexToFlatBrickIndices(pageTable: VolumeBrickPageTable): Map<number, number[]> {
  const mapping = new Map<number, number[]>();
  for (let flatBrickIndex = 0; flatBrickIndex < pageTable.brickAtlasIndices.length; flatBrickIndex += 1) {
    const sourceIndex = pageTable.brickAtlasIndices[flatBrickIndex] ?? -1;
    if (sourceIndex < 0) {
      continue;
    }
    const existing = mapping.get(sourceIndex);
    if (existing) {
      existing.push(flatBrickIndex);
    } else {
      mapping.set(sourceIndex, [flatBrickIndex]);
    }
  }
  return mapping;
}

export function buildSparseSegmentationExactBatchAtlasData({
  pageTable,
  sourceAtlasData,
  sourceAtlasSize,
  sourceSlotGrid,
  batchSourceIndices,
  batchSlotGrid,
  batchAtlasSize,
  textureFormat,
  target,
}: {
  pageTable: VolumeBrickPageTable;
  sourceAtlasData: Uint8Array;
  sourceAtlasSize: { width: number; height: number; depth: number };
  sourceSlotGrid: { x: number; y: number; z: number };
  batchSourceIndices: readonly number[];
  batchSlotGrid: { x: number; y: number; z: number };
  batchAtlasSize: { width: number; height: number; depth: number };
  textureFormat: TextureFormat;
  target?: Uint8Array | null;
}): Uint8Array {
  const components = textureComponentCount(textureFormat);
  const expectedLength = Math.max(1, batchAtlasSize.width * batchAtlasSize.height * batchAtlasSize.depth * components);
  const output = target && target.length === expectedLength ? target : new Uint8Array(expectedLength);
  output.fill(0);

  const source = resolveSlotCopyGeometry({ slotGrid: sourceSlotGrid, atlasSize: sourceAtlasSize, pageTable });
  const batch = resolveSlotCopyGeometry({ slotGrid: batchSlotGrid, atlasSize: batchAtlasSize, pageTable });
  const copyWidth = Math.min(source.brickWidth, batch.brickWidth);
  const copyHeight = Math.min(source.brickHeight, batch.brickHeight);
  const copyDepth = Math.min(source.brickDepth, batch.brickDepth);

  for (let batchSlot = 0; batchSlot < batchSourceIndices.length; batchSlot += 1) {
    const sourceSlot = batchSourceIndices[batchSlot] ?? -1;
    if (sourceSlot < 0) {
      continue;
    }
    const sourceOrigin = resolveSlotOrigin({
      slotIndex: sourceSlot,
      slotGrid: source.slotGrid,
      cellWidth: source.cellWidth,
      cellHeight: source.cellHeight,
      cellDepth: source.cellDepth,
      offsetX: source.offsetX,
      offsetY: source.offsetY,
      offsetZ: source.offsetZ,
    });
    const batchOrigin = resolveSlotOrigin({
      slotIndex: batchSlot,
      slotGrid: batch.slotGrid,
      cellWidth: batch.cellWidth,
      cellHeight: batch.cellHeight,
      cellDepth: batch.cellDepth,
      offsetX: batch.offsetX,
      offsetY: batch.offsetY,
      offsetZ: batch.offsetZ,
    });

    for (let localZ = 0; localZ < copyDepth; localZ += 1) {
      const sourceZ = sourceOrigin.z + localZ;
      const batchZ = batchOrigin.z + localZ;
      if (sourceZ < 0 || sourceZ >= sourceAtlasSize.depth || batchZ < 0 || batchZ >= batchAtlasSize.depth) {
        continue;
      }
      for (let localY = 0; localY < copyHeight; localY += 1) {
        const sourceY = sourceOrigin.y + localY;
        const batchY = batchOrigin.y + localY;
        if (sourceY < 0 || sourceY >= sourceAtlasSize.height || batchY < 0 || batchY >= batchAtlasSize.height) {
          continue;
        }
        for (let localX = 0; localX < copyWidth; localX += 1) {
          const sourceX = sourceOrigin.x + localX;
          const batchX = batchOrigin.x + localX;
          if (sourceX < 0 || sourceX >= sourceAtlasSize.width || batchX < 0 || batchX >= batchAtlasSize.width) {
            continue;
          }
          const sourceOffset = ((sourceZ * sourceAtlasSize.height + sourceY) * sourceAtlasSize.width + sourceX) * components;
          const batchOffset = ((batchZ * batchAtlasSize.height + batchY) * batchAtlasSize.width + batchX) * components;
          for (let component = 0; component < components; component += 1) {
            output[batchOffset + component] = sourceAtlasData[sourceOffset + component] ?? 0;
          }
        }
      }
    }
  }

  return output;
}

export function buildSparseSegmentationExactBatchAtlasIndexData({
  pageTable,
  batchSourceIndices,
  sourceIndexToFlatBrickIndices,
  target,
}: {
  pageTable: VolumeBrickPageTable;
  batchSourceIndices: readonly number[];
  sourceIndexToFlatBrickIndices?: Map<number, number[]> | null;
  target?: Float32Array | null;
}): Float32Array {
  const output =
    target && target.length === pageTable.brickAtlasIndices.length
      ? target
      : new Float32Array(pageTable.brickAtlasIndices.length);
  output.fill(0);
  const mapping = sourceIndexToFlatBrickIndices ?? buildSourceIndexToFlatBrickIndices(pageTable);
  for (let batchSlot = 0; batchSlot < batchSourceIndices.length; batchSlot += 1) {
    const sourceIndex = batchSourceIndices[batchSlot] ?? -1;
    const flatBrickIndices = sourceIndex >= 0 ? mapping.get(sourceIndex) : null;
    if (!flatBrickIndices) {
      continue;
    }
    for (const flatBrickIndex of flatBrickIndices) {
      output[flatBrickIndex] = batchSlot + 1;
    }
  }
  return output;
}

export function buildSparseSegmentationExactBatchAtlasBaseData({
  pageTable,
  atlasIndices,
  slotGrid,
  atlasSize,
  target,
}: {
  pageTable: VolumeBrickPageTable;
  atlasIndices: Float32Array;
  slotGrid: { x: number; y: number; z: number };
  atlasSize: { width: number; height: number; depth: number };
  target?: Float32Array | null;
}): Float32Array {
  const gridX = Math.max(1, pageTable.gridShape[2]);
  const gridY = Math.max(1, pageTable.gridShape[1]);
  const gridZ = Math.max(1, pageTable.gridShape[0]);
  const safeSlotGrid = normalizeSlotGrid(slotGrid);
  const atlasGeometry = resolveSlotCopyGeometry({ slotGrid: safeSlotGrid, atlasSize, pageTable });
  const slotsPerLayer = Math.max(1, safeSlotGrid.x * safeSlotGrid.y);
  const output = target && target.length === gridX * gridY * gridZ * 4 ? target : new Float32Array(gridX * gridY * gridZ * 4);
  output.fill(0);

  for (let index = 0; index < atlasIndices.length; index += 1) {
    const atlasIndex = Math.floor((atlasIndices[index] ?? 0) - 1 + 0.5);
    if (atlasIndex < 0) {
      continue;
    }
    const slotZ = Math.floor(atlasIndex / slotsPerLayer);
    const withinLayer = atlasIndex - slotZ * slotsPerLayer;
    const slotY = Math.floor(withinLayer / safeSlotGrid.x);
    const slotX = withinLayer - slotY * safeSlotGrid.x;
    const targetOffset = index * 4;
    output[targetOffset] = slotX * atlasGeometry.cellWidth + atlasGeometry.offsetX;
    output[targetOffset + 1] = slotY * atlasGeometry.cellHeight + atlasGeometry.offsetY;
    output[targetOffset + 2] = slotZ * atlasGeometry.cellDepth + atlasGeometry.offsetZ;
    output[targetOffset + 3] = 1;
  }

  return output;
}

function createByte3dTexture(
  source: Uint8Array,
  width: number,
  height: number,
  depth: number,
  format: TextureFormat,
): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(source, width, height, depth);
  texture.format = format;
  texture.type = THREE.UnsignedByteType;
  texture.internalFormat = null;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function updateOrCreateByte3dTexture(
  existing: THREE.Data3DTexture | null,
  source: Uint8Array,
  width: number,
  height: number,
  depth: number,
  format: TextureFormat,
): THREE.Data3DTexture {
  if (existing) {
    const image = existing.image as { data?: unknown; width?: number; height?: number; depth?: number } | undefined;
    if (
      image?.data instanceof Uint8Array &&
      image.data.length === source.length &&
      image.width === width &&
      image.height === height &&
      image.depth === depth &&
      existing.format === format &&
      existing.type === THREE.UnsignedByteType &&
      existing.internalFormat === null
    ) {
      if (image.data !== source) {
        image.data.set(source);
      }
      existing.minFilter = THREE.NearestFilter;
      existing.magFilter = THREE.NearestFilter;
      existing.colorSpace = THREE.NoColorSpace;
      existing.needsUpdate = true;
      return existing;
    }
    existing.dispose();
  }
  return createByte3dTexture(source, width, height, depth, format);
}

function createFloat3dTexture(
  source: Float32Array,
  width: number,
  height: number,
  depth: number,
  format: TextureFormat,
): THREE.Data3DTexture {
  const texture = new THREE.Data3DTexture(source, width, height, depth);
  texture.format = format;
  texture.type = THREE.FloatType;
  texture.internalFormat = null;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function updateOrCreateFloat3dTexture(
  existing: THREE.Data3DTexture | null,
  source: Float32Array,
  width: number,
  height: number,
  depth: number,
  format: TextureFormat,
): THREE.Data3DTexture {
  if (existing) {
    const image = existing.image as { data?: unknown; width?: number; height?: number; depth?: number } | undefined;
    if (
      image?.data instanceof Float32Array &&
      image.data.length === source.length &&
      image.width === width &&
      image.height === height &&
      image.depth === depth &&
      existing.format === format &&
      existing.type === THREE.FloatType &&
      existing.internalFormat === null
    ) {
      if (image.data !== source) {
        image.data.set(source);
      }
      existing.needsUpdate = true;
      return existing;
    }
    existing.dispose();
  }
  return createFloat3dTexture(source, width, height, depth, format);
}

export function createSparseSegmentationExactBatchRenderState(
  source: SparseSegmentationExactBatchSource
): SparseSegmentationExactBatchRenderState {
  const components = textureComponentCount(source.textureFormat);
  const batchBytes =
    source.plan.batchAtlasSize.width *
    source.plan.batchAtlasSize.height *
    source.plan.batchAtlasSize.depth *
    components;
  return {
    ...source,
    occupiedSourceIndices: collectSparseSegmentationOccupiedSourceIndices(source.pageTable),
    sourceIndexToFlatBrickIndices: buildSourceIndexToFlatBrickIndices(source.pageTable),
    batchAtlasData: new Uint8Array(Math.max(1, batchBytes)),
    batchAtlasIndexData: new Float32Array(source.pageTable.brickAtlasIndices.length),
    batchAtlasBaseData: new Float32Array(source.pageTable.brickAtlasIndices.length * 4),
    batchAtlasTexture: null,
    batchAtlasIndexTexture: null,
    batchAtlasBaseTexture: null,
    batchMaterial: null,
    batchMaterialSourceVertexShader: null,
    batchMaterialSourceFragmentShader: null,
    proxyScene: null,
    proxyMesh: null,
  };
}

export function disposeSparseSegmentationExactBatchRenderState(
  state: SparseSegmentationExactBatchRenderState | null | undefined
): void {
  state?.batchAtlasTexture?.dispose();
  state?.batchAtlasIndexTexture?.dispose();
  state?.batchAtlasBaseTexture?.dispose();
  state?.batchMaterial?.dispose();
  state?.proxyScene?.clear();
  if (state) {
    state.batchAtlasTexture = null;
    state.batchAtlasIndexTexture = null;
    state.batchAtlasBaseTexture = null;
    state.batchMaterial = null;
    state.batchMaterialSourceVertexShader = null;
    state.batchMaterialSourceFragmentShader = null;
    state.proxyScene = null;
    state.proxyMesh = null;
  }
}

export function areSparseSegmentationExactBatchStatesEquivalent(
  left: SparseSegmentationExactBatchRenderState | null | undefined,
  right: SparseSegmentationExactBatchSource
): boolean {
  return Boolean(
    left &&
      left.pageTable === right.pageTable &&
      left.sourceAtlasData === right.sourceAtlasData &&
      left.sourceAtlasSize.width === right.sourceAtlasSize.width &&
      left.sourceAtlasSize.height === right.sourceAtlasSize.height &&
      left.sourceAtlasSize.depth === right.sourceAtlasSize.depth &&
      left.sourceSlotGrid.x === right.sourceSlotGrid.x &&
      left.sourceSlotGrid.y === right.sourceSlotGrid.y &&
      left.sourceSlotGrid.z === right.sourceSlotGrid.z &&
      left.textureFormat === right.textureFormat &&
      left.plan.batchSlotCapacity === right.plan.batchSlotCapacity &&
      left.plan.batchSlotGrid.x === right.plan.batchSlotGrid.x &&
      left.plan.batchSlotGrid.y === right.plan.batchSlotGrid.y &&
      left.plan.batchSlotGrid.z === right.plan.batchSlotGrid.z &&
      left.plan.batchAtlasSize.width === right.plan.batchAtlasSize.width &&
      left.plan.batchAtlasSize.height === right.plan.batchAtlasSize.height &&
      left.plan.batchAtlasSize.depth === right.plan.batchAtlasSize.depth
  );
}

function resolveBatchSourceIndices(
  state: SparseSegmentationExactBatchRenderState,
  batchIndex: number
): number[] {
  const start = Math.max(0, batchIndex * state.plan.batchSlotCapacity);
  const end = Math.min(state.occupiedSourceIndices.length, start + state.plan.batchSlotCapacity);
  return state.occupiedSourceIndices.slice(start, end);
}

export function prepareSparseSegmentationExactBatch(
  state: SparseSegmentationExactBatchRenderState,
  batchIndex: number,
): void {
  const batchSourceIndices = resolveBatchSourceIndices(state, batchIndex);
  state.batchAtlasData = buildSparseSegmentationExactBatchAtlasData({
    pageTable: state.pageTable,
    sourceAtlasData: state.sourceAtlasData,
    sourceAtlasSize: state.sourceAtlasSize,
    sourceSlotGrid: state.sourceSlotGrid,
    batchSourceIndices,
    batchSlotGrid: state.plan.batchSlotGrid,
    batchAtlasSize: state.plan.batchAtlasSize,
    textureFormat: state.textureFormat,
    target: state.batchAtlasData,
  });
  state.batchAtlasIndexData = buildSparseSegmentationExactBatchAtlasIndexData({
    pageTable: state.pageTable,
    batchSourceIndices,
    sourceIndexToFlatBrickIndices: state.sourceIndexToFlatBrickIndices,
    target: state.batchAtlasIndexData,
  });
  state.batchAtlasBaseData = buildSparseSegmentationExactBatchAtlasBaseData({
    pageTable: state.pageTable,
    atlasIndices: state.batchAtlasIndexData,
    slotGrid: state.plan.batchSlotGrid,
    atlasSize: state.plan.batchAtlasSize,
    target: state.batchAtlasBaseData,
  });
  state.batchAtlasTexture = updateOrCreateByte3dTexture(
    state.batchAtlasTexture,
    state.batchAtlasData,
    state.plan.batchAtlasSize.width,
    state.plan.batchAtlasSize.height,
    state.plan.batchAtlasSize.depth,
    state.textureFormat,
  );
  state.batchAtlasIndexTexture = updateOrCreateFloat3dTexture(
    state.batchAtlasIndexTexture,
    state.batchAtlasIndexData,
    Math.max(1, state.pageTable.gridShape[2]),
    Math.max(1, state.pageTable.gridShape[1]),
    Math.max(1, state.pageTable.gridShape[0]),
    THREE.RedFormat,
  );
  state.batchAtlasBaseTexture = updateOrCreateFloat3dTexture(
    state.batchAtlasBaseTexture,
    state.batchAtlasBaseData,
    Math.max(1, state.pageTable.gridShape[2]),
    Math.max(1, state.pageTable.gridShape[1]),
    Math.max(1, state.pageTable.gridShape[0]),
    THREE.RGBAFormat,
  );
}

export function hasSparseSegmentationExactBatchRenderState(resource: VolumeResources): boolean {
  return Boolean(resource.sparseSegmentationExactBatchState);
}

export function hideSparseSegmentationExactBatchResources(
  resources: Iterable<VolumeResources>
): () => void {
  const restoreEntries: Array<{ mesh: THREE.Mesh; visible: boolean }> = [];
  for (const resource of resources) {
    if (!resource.sparseSegmentationExactBatchState || !resource.mesh.visible) {
      continue;
    }
    restoreEntries.push({ mesh: resource.mesh, visible: resource.mesh.visible });
    resource.mesh.visible = false;
  }
  return () => {
    for (const entry of restoreEntries) {
      entry.mesh.visible = entry.visible;
    }
  };
}

function ensureProxySceneAndMesh(
  resource: VolumeResources,
  state: SparseSegmentationExactBatchRenderState,
): THREE.Mesh {
  if (!state.proxyScene) {
    state.proxyScene = new THREE.Scene();
  }
  if (!state.proxyMesh) {
    const proxyMesh = new THREE.Mesh(resource.mesh.geometry, resource.mesh.material);
    proxyMesh.frustumCulled = false;
    proxyMesh.matrixAutoUpdate = false;
    state.proxyScene.add(proxyMesh);
    state.proxyMesh = proxyMesh;
  }
  state.proxyMesh.geometry = resource.mesh.geometry;
  state.proxyMesh.material = state.batchMaterial ?? resource.mesh.material;
  state.proxyMesh.visible = true;
  state.proxyMesh.renderOrder = resource.mesh.renderOrder;
  state.proxyMesh.matrix.copy(resource.mesh.matrixWorld);
  state.proxyMesh.matrixWorld.copy(resource.mesh.matrixWorld);
  state.proxyMesh.matrixWorldNeedsUpdate = false;
  return state.proxyMesh;
}

export function convertVolumeVertexShaderToGlsl3(source: string): string {
  return source
    .replace(/\battribute\b/gu, 'in')
    .replace(/\bvarying\b/gu, 'out')
    .replace(/\btexture2D\s*\(/gu, 'texture(')
    .replace(/\btexture3D\s*\(/gu, 'texture(');
}

export function convertVolumeFragmentShaderToGlsl3(source: string): string {
  const converted = source
    .replace(/\bvarying\b/gu, 'in')
    .replace(/\btexture2D\s*\(/gu, 'texture(')
    .replace(/\btexture3D\s*\(/gu, 'texture(')
    .replace(/\bgl_FragColor\b/gu, 'out_FragColor');
  const precisionBlock = /^(\s*(?:precision\s+\w+\s+\w+\s*;\s*)+)/u.exec(converted);
  if (precisionBlock?.[0]) {
    return `${precisionBlock[0]}out vec4 out_FragColor;\n${converted.slice(precisionBlock[0].length)}`;
  }
  return `precision highp float;\nout vec4 out_FragColor;\n${converted}`;
}

const cameraWorldPosition = new THREE.Vector3();
const localCameraPosition = new THREE.Vector3();
const modelViewMatrix = new THREE.Matrix4();
const modelViewProjectionMatrix = new THREE.Matrix4();

function updateVolumeCameraUniforms(mesh: THREE.Mesh, camera: THREE.Camera): void {
  const material = mesh.material as THREE.ShaderMaterial;
  const uniforms = material.uniforms as Record<string, { value: unknown }> | undefined;
  if (!uniforms) {
    return;
  }
  modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
  const cameraUniform = uniforms.u_cameraPos?.value;
  if (cameraUniform instanceof THREE.Vector3) {
    cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
    localCameraPosition.copy(cameraWorldPosition);
    mesh.worldToLocal(localCameraPosition);
    cameraUniform.copy(localCameraPosition);
  }
  const modelViewProjectionUniform = uniforms.u_modelViewProjectionMatrix?.value;
  if (modelViewProjectionUniform instanceof THREE.Matrix4) {
    modelViewProjectionMatrix.multiplyMatrices(camera.projectionMatrix, modelViewMatrix);
    modelViewProjectionUniform.copy(modelViewProjectionMatrix);
  }
  const modelViewUniform = uniforms.u_modelViewMatrixVolume?.value;
  if (modelViewUniform instanceof THREE.Matrix4) {
    modelViewUniform.copy(modelViewMatrix);
  }
  const nearFarUniform = uniforms.u_cameraNearFar?.value;
  const cameraWithClipPlanes = camera as THREE.Camera & { near?: number; far?: number };
  if (nearFarUniform instanceof THREE.Vector2) {
    nearFarUniform.set(
      Math.max(1e-6, Number(cameraWithClipPlanes.near ?? 0.1)),
      Math.max(Number(cameraWithClipPlanes.far ?? 1000), Number(cameraWithClipPlanes.near ?? 0.1) + 1e-6),
    );
  }
}

function bindBatchUniforms(
  resource: VolumeResources,
  state: SparseSegmentationExactBatchRenderState,
): void {
  const material = resource.mesh.material as THREE.ShaderMaterial;
  const uniforms = material.uniforms as Record<string, { value: unknown }> | undefined;
  if (!uniforms || !state.batchAtlasTexture || !state.batchAtlasIndexTexture || !state.batchAtlasBaseTexture) {
    return;
  }
  if (uniforms.u_brickAtlasEnabled) {
    uniforms.u_brickAtlasEnabled.value = 1;
  }
  if (uniforms.u_brickAtlasData) {
    uniforms.u_brickAtlasData.value = FALLBACK_BRICK_ATLAS_DATA_TEXTURE;
  }
  if (uniforms.u_segmentationBrickAtlasData) {
    uniforms.u_segmentationBrickAtlasData.value = state.batchAtlasTexture;
  }
  if (uniforms.u_brickAtlasIndices) {
    uniforms.u_brickAtlasIndices.value = state.batchAtlasIndexTexture;
  }
  if (uniforms.u_brickAtlasBase) {
    uniforms.u_brickAtlasBase.value = state.batchAtlasBaseTexture;
  }
  if (uniforms.u_brickAtlasSize?.value instanceof THREE.Vector3) {
    uniforms.u_brickAtlasSize.value.set(
      state.plan.batchAtlasSize.width,
      state.plan.batchAtlasSize.height,
      state.plan.batchAtlasSize.depth,
    );
  }
  if (uniforms.u_brickAtlasSlotGrid?.value instanceof THREE.Vector3) {
    uniforms.u_brickAtlasSlotGrid.value.set(
      state.plan.batchSlotGrid.x,
      state.plan.batchSlotGrid.y,
      state.plan.batchSlotGrid.z,
    );
  }
}

function ensureExactBatchMaterialState(
  resource: VolumeResources,
  state: SparseSegmentationExactBatchRenderState,
): void {
  const material = resource.mesh.material;
  if (!(material instanceof THREE.ShaderMaterial)) {
    return;
  }
  if (
    state.batchMaterial &&
    state.batchMaterialSourceVertexShader === material.vertexShader &&
    state.batchMaterialSourceFragmentShader === material.fragmentShader
  ) {
    return;
  }
  state.batchMaterial?.dispose();
  state.batchMaterial = new THREE.ShaderMaterial({
    uniforms: material.uniforms,
    vertexShader: convertVolumeVertexShaderToGlsl3(material.vertexShader),
    fragmentShader: convertVolumeFragmentShaderToGlsl3(material.fragmentShader),
    defines: {
      ...(material.defines ?? {}),
      VOLUME_SEGMENTATION_EXACT_BATCH_PASS: 1,
    },
    glslVersion: THREE.GLSL3,
    side: material.side,
    transparent: true,
    depthTest: true,
    depthWrite: true,
    blending: THREE.NormalBlending,
  });
  state.batchMaterial.toneMapped = material.toneMapped;
  state.batchMaterialSourceVertexShader = material.vertexShader;
  state.batchMaterialSourceFragmentShader = material.fragmentShader;
}

export function renderSparseSegmentationExactBatches({
  renderer,
  camera,
  resources,
}: {
  renderer: THREE.WebGLRenderer;
  camera: THREE.Camera;
  resources: Iterable<VolumeResources>;
}): void {
  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  try {
    for (const resource of resources) {
      const state = resource.sparseSegmentationExactBatchState ?? null;
      if (!state || !resource.mesh.visible) {
        continue;
      }
      ensureExactBatchMaterialState(resource, state);
      const proxyMesh = ensureProxySceneAndMesh(resource, state);
      proxyMesh.updateMatrixWorld(true);
      resource.sparseSegmentationRenderDiagnostics = {
        strategy: 'exact-batched',
        reason: state.plan.reason,
        scaleLevel: state.pageTable.scaleLevel,
        occupiedBrickCount: state.pageTable.occupiedBrickCount,
        requiredBrickCount: state.pageTable.occupiedBrickCount,
        residentBrickCount: 0,
        missingOccupiedBrickCount: state.pageTable.occupiedBrickCount,
        slotGrid: state.plan.batchSlotGrid,
        atlasSize: state.plan.batchAtlasSize,
        atlasBytes: state.plan.estimatedBytesPerBatch,
        max3DTextureSize: resource.sparseSegmentationRenderDiagnostics?.max3DTextureSize ?? null,
        maxTextureSize: resource.sparseSegmentationRenderDiagnostics?.maxTextureSize ?? null,
        budgetBytes: resource.sparseSegmentationRenderDiagnostics?.budgetBytes ?? state.plan.estimatedBytesPerBatch,
        batchCount: state.plan.batchCount,
        currentBatchIndex: 0,
        presentationState: 'loading',
      };
      for (let batchIndex = 0; batchIndex < state.plan.batchCount; batchIndex += 1) {
        resource.sparseSegmentationRenderDiagnostics.currentBatchIndex = batchIndex;
        prepareSparseSegmentationExactBatch(state, batchIndex);
        bindBatchUniforms(resource, state);
        updateVolumeCameraUniforms(proxyMesh, camera);
        renderer.render(state.proxyScene!, camera);
      }
      resource.sparseSegmentationRenderDiagnostics.residentBrickCount = state.pageTable.occupiedBrickCount;
      resource.sparseSegmentationRenderDiagnostics.missingOccupiedBrickCount = 0;
      resource.sparseSegmentationRenderDiagnostics.currentBatchIndex = null;
      resource.sparseSegmentationRenderDiagnostics.presentationState = 'complete';
    }
  } finally {
    renderer.autoClear = previousAutoClear;
  }
}
