import assert from 'node:assert/strict';
import * as THREE from 'three';

import { useVolumeResources } from '../src/components/viewers/volume-viewer/useVolumeResources.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';
import type { VolumeBrickAtlas, VolumeBrickPageTable } from '../src/core/volumeProvider.ts';
import type { ViewerLayer, VolumeResources } from '../src/components/viewers/VolumeViewer.types.ts';
import {
  FALLBACK_BRICK_ATLAS_DATA_TEXTURE,
  FALLBACK_BRICK_ATLAS_INDEX_TEXTURE,
  FALLBACK_BRICK_MAX_TEXTURE,
  FALLBACK_BRICK_MIN_TEXTURE,
  FALLBACK_BRICK_OCCUPANCY_TEXTURE,
  FALLBACK_SEGMENTATION_LABEL_TEXTURE,
} from '../src/components/viewers/volume-viewer/fallbackTextures.ts';
import { RENDER_STYLE_SLICE } from '../src/state/layerSettings.ts';
import { renderHook } from './hooks/renderHook.ts';

console.log('Starting useVolumeResources tests');

const createFakeResource = (): VolumeResources => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const texture = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.LuminanceFormat);
  return {
    mesh,
    texture,
    dimensions: { width: 1, height: 1, depth: 1 },
    channels: 1,
    mode: 'slice',
    samplingMode: 'linear',
  };
};

type PageTableWithoutHierarchy = Omit<VolumeBrickPageTable, 'skipHierarchy'> & {
  skipHierarchy?: VolumeBrickPageTable['skipHierarchy'];
};

type HierarchyLevelBuffers = {
  gridShape: [number, number, number];
  min: Uint8Array;
  max: Uint8Array;
  occupancy: Uint8Array;
};

function reduceHierarchyLevel(child: HierarchyLevelBuffers): HierarchyLevelBuffers {
  const [childZ, childY, childX] = child.gridShape;
  const parentGridShape: [number, number, number] = [
    Math.max(1, Math.ceil(childZ / 2)),
    Math.max(1, Math.ceil(childY / 2)),
    Math.max(1, Math.ceil(childX / 2)),
  ];
  const [parentZ, parentY, parentX] = parentGridShape;
  const parentCount = parentZ * parentY * parentX;
  const parentMin = new Uint8Array(parentCount);
  const parentMax = new Uint8Array(parentCount);
  const parentOccupancy = new Uint8Array(parentCount);
  const childPlane = childY * childX;
  const parentPlane = parentY * parentX;

  for (let z = 0; z < parentZ; z += 1) {
    for (let y = 0; y < parentY; y += 1) {
      for (let x = 0; x < parentX; x += 1) {
        const parentIndex = z * parentPlane + y * parentX + x;
        const childZStart = z * 2;
        const childYStart = y * 2;
        const childXStart = x * 2;
        let occupied = false;
        let localMin = 255;
        let localMax = 0;

        for (let localZ = 0; localZ < 2; localZ += 1) {
          const sourceZ = childZStart + localZ;
          if (sourceZ >= childZ) {
            continue;
          }
          for (let localY = 0; localY < 2; localY += 1) {
            const sourceY = childYStart + localY;
            if (sourceY >= childY) {
              continue;
            }
            for (let localX = 0; localX < 2; localX += 1) {
              const sourceX = childXStart + localX;
              if (sourceX >= childX) {
                continue;
              }
              const childIndex = sourceZ * childPlane + sourceY * childX + sourceX;
              if ((child.occupancy[childIndex] ?? 0) === 0) {
                continue;
              }
              occupied = true;
              const childMin = child.min[childIndex] ?? 0;
              const childMax = child.max[childIndex] ?? 0;
              if (childMin < localMin) {
                localMin = childMin;
              }
              if (childMax > localMax) {
                localMax = childMax;
              }
            }
          }
        }

        if (!occupied) {
          parentOccupancy[parentIndex] = 0;
          parentMin[parentIndex] = 0;
          parentMax[parentIndex] = 0;
          continue;
        }

        parentOccupancy[parentIndex] = 255;
        parentMin[parentIndex] = localMin;
        parentMax[parentIndex] = localMax;
      }
    }
  }

  return {
    gridShape: parentGridShape,
    min: parentMin,
    max: parentMax,
    occupancy: parentOccupancy,
  };
}

function withSyntheticSkipHierarchy(pageTable: PageTableWithoutHierarchy): VolumeBrickPageTable {
  if (pageTable.skipHierarchy?.levels?.length) {
    return pageTable as VolumeBrickPageTable;
  }
  const [gridZ, gridY, gridX] = pageTable.gridShape;
  const leafCount = gridZ * gridY * gridX;
  const leafMin = new Uint8Array(leafCount);
  const leafMax = new Uint8Array(leafCount);
  const leafOccupancy = new Uint8Array(leafCount);
  for (let index = 0; index < leafCount; index += 1) {
    leafMin[index] = pageTable.chunkMin[index] ?? 0;
    leafMax[index] = pageTable.chunkMax[index] ?? 0;
    leafOccupancy[index] = (pageTable.chunkOccupancy[index] ?? 0) > 0 ? 255 : 0;
  }

  const levels: VolumeBrickPageTable['skipHierarchy']['levels'] = [];
  let level = 0;
  let current: HierarchyLevelBuffers = {
    gridShape: [gridZ, gridY, gridX],
    min: leafMin,
    max: leafMax,
    occupancy: leafOccupancy,
  };
  while (true) {
    levels.push({
      level,
      gridShape: current.gridShape,
      min: current.min,
      max: current.max,
      occupancy: current.occupancy,
    });
    if (current.gridShape[0] === 1 && current.gridShape[1] === 1 && current.gridShape[2] === 1) {
      break;
    }
    current = reduceHierarchyLevel(current);
    level += 1;
  }

  return {
    ...pageTable,
    skipHierarchy: { levels },
  };
}

function createSyntheticPageTableFromVolume(volume: NormalizedVolume): VolumeBrickPageTable {
  let min = 255;
  let max = 0;
  let occupied = 0;
  const normalized = volume.normalized;
  for (let index = 0; index < normalized.length; index += 1) {
    const value = normalized[index] ?? 0;
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
    if (value > 0) {
      occupied += 1;
    }
  }
  if (normalized.length === 0) {
    min = 0;
    max = 0;
  }

  return withSyntheticSkipHierarchy({
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    gridShape: [1, 1, 1],
    chunkShape: [Math.max(1, volume.depth), Math.max(1, volume.height), Math.max(1, volume.width)],
    volumeShape: [Math.max(1, volume.depth), Math.max(1, volume.height), Math.max(1, volume.width)],
    brickAtlasIndices: new Int32Array([0]),
    chunkMin: new Uint8Array([min]),
    chunkMax: new Uint8Array([max]),
    chunkOccupancy: new Float32Array([occupied > 0 ? 1 : 0]),
    occupiedBrickCount: occupied > 0 ? 1 : 0,
  });
}

const createLayer = (
  volume: NormalizedVolume | null,
  brickPageTable: VolumeBrickPageTable | null,
  brickAtlas: VolumeBrickAtlas | null = null,
  samplingMode: 'linear' | 'nearest' = 'linear',
): ViewerLayer => {
  const resolvedPageTable = brickPageTable
    ? withSyntheticSkipHierarchy(brickPageTable as unknown as PageTableWithoutHierarchy)
    : brickAtlas?.pageTable
      ? withSyntheticSkipHierarchy(brickAtlas.pageTable as unknown as PageTableWithoutHierarchy)
      : volume
        ? createSyntheticPageTableFromVolume(volume)
        : null;
  const resolvedBrickAtlas = brickAtlas
    ? {
        ...brickAtlas,
        pageTable: resolvedPageTable ?? brickAtlas.pageTable,
      }
    : null;

  return {
  key: 'layer-3d',
  label: 'Layer 3D',
  channelName: 'channel-a',
  fullResolutionWidth: volume?.width ?? resolvedPageTable?.volumeShape[2] ?? resolvedBrickAtlas?.pageTable.volumeShape[2] ?? 1,
  fullResolutionHeight: volume?.height ?? resolvedPageTable?.volumeShape[1] ?? resolvedBrickAtlas?.pageTable.volumeShape[1] ?? 1,
  fullResolutionDepth: volume?.depth ?? resolvedPageTable?.volumeShape[0] ?? resolvedBrickAtlas?.pageTable.volumeShape[0] ?? 1,
  volume,
  visible: true,
  sliderRange: 100,
  minSliderIndex: 0,
  maxSliderIndex: 100,
  brightnessSliderIndex: 50,
  contrastSliderIndex: 50,
  windowMin: 0,
  windowMax: 1,
  color: '#ffffff',
  offsetX: 0,
  offsetY: 0,
  renderStyle: 0,
  blDensityScale: 1,
  blBackgroundCutoff: 0.08,
  blOpacityScale: 1,
  blEarlyExitAlpha: 0.98,
  invert: false,
  samplingMode,
  mode: '3d',
  brickPageTable: resolvedPageTable,
  brickAtlas: resolvedBrickAtlas,
  };
};

(() => {
  const resourcesRef = { current: new Map<string, VolumeResources>([['resource', createFakeResource()]]) };
  const currentDimensionsRef = { current: { width: 1, height: 1, depth: 1 } };
  const applyVolumeRootTransformArgs: Array<{ width: number; height: number; depth: number } | null> = [];
  const trackGroupRef = { current: new THREE.Group() };
  let renderListDisposeCalls = 0;
  const rendererRef = {
    current: {
      renderLists: {
        dispose: () => {
          renderListDisposeCalls += 1;
        }
      }
    } as unknown as THREE.WebGLRenderer
  };

  renderHook(() =>
    useVolumeResources({
      layers: [],
      primaryVolume: null,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      rendererRef,
      sceneRef: { current: null },
      cameraRef: { current: null },
      controlsRef: { current: null },
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef,
      resourcesRef,
      currentDimensionsRef,
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 2 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: (dimensions) => {
        applyVolumeRootTransformArgs.push(dimensions);
      },
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  assert.strictEqual(resourcesRef.current.size, 0);
  assert.strictEqual(currentDimensionsRef.current, null);
  assert.deepStrictEqual(applyVolumeRootTransformArgs, [null]);
  assert.ok(renderListDisposeCalls >= 1);
})();

(() => {
  const volume: NormalizedVolume = {
    width: 2,
    height: 2,
    depth: 2,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(8),
    min: 0,
    max: 1,
  };

  const resourcesRef = { current: new Map<string, VolumeResources>([['resource', createFakeResource()]]) };
  const currentDimensionsRef = { current: { width: 1, height: 1, depth: 1 } };
  const volumeUserScaleRef = { current: 3 };

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 10);
  const controls = {
    target: new THREE.Vector3(),
    update: () => {},
    saveState: () => {},
  } as unknown as THREE.OrbitControls;

  renderHook(() =>
    useVolumeResources({
      layers: [],
      primaryVolume: volume,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      sceneRef: { current: new THREE.Scene() },
      cameraRef: { current: camera },
      controlsRef: { current: controls },
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef: { current: new THREE.Group() },
      resourcesRef,
      currentDimensionsRef,
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef,
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  assert.strictEqual(resourcesRef.current.size, 0);
  assert.deepStrictEqual(currentDimensionsRef.current, { width: 2, height: 2, depth: 2 });
  assert.strictEqual(volumeUserScaleRef.current, 1);
})();

(() => {
  const volume: NormalizedVolume = {
    width: 2,
    height: 2,
    depth: 2,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(8),
    min: 0,
    max: 1,
  };
  const sceneRef = { current: new THREE.Scene() };
  const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
  const controlsRef = {
    current: {
      target: new THREE.Vector3(),
      update: () => {},
      saveState: () => {},
    } as unknown as THREE.OrbitControls,
  };

  const resourcesRef = { current: new Map<string, VolumeResources>() };
  let layers: ViewerLayer[] = [createLayer(volume, null, null, 'linear')];
  let isAdditiveBlending = false;

  const hook = renderHook(() =>
    useVolumeResources({
      layers,
      primaryVolume: volume,
      isAdditiveBlending,
      renderContextRevision: 0,
      sceneRef,
      cameraRef,
      controlsRef,
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef: { current: new THREE.Group() },
      resourcesRef,
      currentDimensionsRef: { current: null },
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  const mipResource = resourcesRef.current.get('layer-3d');
  assert.ok(mipResource);
  const mipMaterial = mipResource.mesh.material as THREE.ShaderMaterial;
  assert.ok(mipMaterial.fragmentShader.includes('#define VOLUME_STYLE_MIP'));

  layers = [{ ...layers[0], renderStyle: 1 }];
  hook.rerender();
  const isoResource = resourcesRef.current.get('layer-3d');
  assert.ok(isoResource);
  const isoMaterial = isoResource.mesh.material as THREE.ShaderMaterial;
  assert.notStrictEqual(isoMaterial, mipMaterial);
  assert.ok(isoMaterial.fragmentShader.includes('#define VOLUME_STYLE_ISO'));

  layers = [
    {
      ...layers[0],
      renderStyle: 2,
      blDensityScale: 2.5,
      blBackgroundCutoff: 0.15,
      blOpacityScale: 1.7,
      blEarlyExitAlpha: 0.91,
    },
  ];
  hook.rerender();

  const blResource = resourcesRef.current.get('layer-3d');
  assert.ok(blResource);
  const blMaterial = blResource.mesh.material as THREE.ShaderMaterial;
  const blUniforms = blMaterial.uniforms as Record<string, { value: unknown }>;
  assert.notStrictEqual(blMaterial, isoMaterial);
  assert.ok(blMaterial.fragmentShader.includes('#define VOLUME_STYLE_BL'));
  assert.ok(blMaterial.fragmentShader.includes('compute_crosshair_axis_event'));
  assert.ok(blMaterial.fragmentShader.includes('axisXEvent = compute_crosshair_axis_event'));
  assert.ok(blMaterial.fragmentShader.includes('sampleT >= axisXEvent.x'));
  assert.ok(blMaterial.fragmentShader.includes('vec3(1.0, 0.0, 0.0)'));
  assert.ok(blMaterial.fragmentShader.includes('vec3(0.0, 1.0, 0.0)'));
  assert.ok(blMaterial.fragmentShader.includes('vec3(0.0, 0.0, 1.0)'));
  assert.equal(blUniforms.u_blDensityScale?.value, 2.5);
  assert.equal(blUniforms.u_blBackgroundCutoff?.value, 0.15);
  assert.equal(blUniforms.u_blOpacityScale?.value, 1.7);
  assert.equal(blUniforms.u_blEarlyExitAlpha?.value, 0.91);

  layers = [
    {
      ...layers[0],
      blDensityScale: 3.25,
      blBackgroundCutoff: 0.2,
      blOpacityScale: 1.3,
      blEarlyExitAlpha: 0.95,
    },
  ];
  hook.rerender();
  const updatedBlResource = resourcesRef.current.get('layer-3d');
  assert.ok(updatedBlResource);
  const updatedBlMaterial = updatedBlResource.mesh.material as THREE.ShaderMaterial;
  const updatedBlUniforms = updatedBlMaterial.uniforms as Record<string, { value: unknown }>;
  assert.ok(updatedBlMaterial.fragmentShader.includes('#define VOLUME_STYLE_BL'));
  assert.equal(updatedBlUniforms.u_blDensityScale?.value, 3.25);
  assert.equal(updatedBlUniforms.u_blBackgroundCutoff?.value, 0.2);
  assert.equal(updatedBlUniforms.u_blOpacityScale?.value, 1.3);
  assert.equal(updatedBlUniforms.u_blEarlyExitAlpha?.value, 0.95);

  isAdditiveBlending = true;
  hook.rerender();
  const additiveBlResource = resourcesRef.current.get('layer-3d');
  assert.ok(additiveBlResource);
  const additiveBlMaterial = additiveBlResource.mesh.material as THREE.ShaderMaterial;
  const additiveBlUniforms = additiveBlMaterial.uniforms as Record<string, { value: unknown }>;
  assert.equal(additiveBlMaterial.blending, THREE.AdditiveBlending);
  assert.equal(additiveBlMaterial.transparent, true);
  assert.equal(additiveBlMaterial.depthWrite, false);
  assert.equal(additiveBlUniforms.u_additive?.value, 1);

  layers = [
    {
      ...layers[0],
      samplingMode: 'nearest',
    },
  ];
  isAdditiveBlending = false;
  hook.rerender();

  const nearestResource = resourcesRef.current.get('layer-3d');
  assert.ok(nearestResource);
  const nearestMaterial = nearestResource.mesh.material as THREE.ShaderMaterial;
  const nearestUniforms = nearestMaterial.uniforms as Record<string, { value: unknown }>;
  assert.equal(nearestMaterial.transparent, true);
  assert.equal(nearestMaterial.depthWrite, false);
  assert.equal(nearestMaterial.depthTest, true);
  assert.equal(nearestMaterial.blending, THREE.NormalBlending);
  assert.equal(nearestUniforms.u_nearestSampling?.value, 1);
  assert.equal(nearestUniforms.u_adaptiveLodEnabled?.value, 0);
  assert.equal(nearestUniforms.u_additive?.value, 0);
  assert.equal((nearestResource.texture as THREE.Data3DTexture).minFilter, THREE.NearestFilter);
  assert.equal((nearestResource.texture as THREE.Data3DTexture).magFilter, THREE.NearestFilter);
  assert.equal(nearestResource.samplingMode, 'nearest');
})();

(() => {
  const volume: NormalizedVolume = {
    width: 4,
    height: 4,
    depth: 2,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(4 * 4 * 2),
    min: 0,
    max: 1,
  };
  const pageTable: VolumeBrickPageTable = {
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    gridShape: [1, 2, 2],
    chunkShape: [2, 2, 2],
    volumeShape: [2, 4, 4],
    brickAtlasIndices: new Int32Array([0, 1, -1, -1]),
    chunkMin: new Uint8Array([5, 10, 15, 20]),
    chunkMax: new Uint8Array([50, 100, 150, 200]),
    chunkOccupancy: new Float32Array([1, 0.25, 0, 0]),
    occupiedBrickCount: 2,
  };

  const sceneRef = { current: new THREE.Scene() };
  const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
  const controlsRef = {
    current: {
      target: new THREE.Vector3(),
      update: () => {},
      saveState: () => {},
    } as unknown as THREE.OrbitControls,
  };

  const resourcesRef = { current: new Map<string, VolumeResources>() };
  let layers: ViewerLayer[] = [createLayer(volume, pageTable, null, 'nearest')];

  const hook = renderHook(() =>
    useVolumeResources({
      layers,
      primaryVolume: volume,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      sceneRef,
      cameraRef,
      controlsRef,
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef: { current: new THREE.Group() },
      resourcesRef,
      currentDimensionsRef: { current: null },
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  const firstResource = resourcesRef.current.get('layer-3d');
  assert.ok(firstResource);
  const firstUniforms = (firstResource.mesh.material as THREE.ShaderMaterial).uniforms as Record<
    string,
    { value: unknown }
  >;
  assert.equal(firstUniforms.u_brickSkipEnabled?.value, 1);
  assert.deepEqual(firstResource.brickSkipDiagnostics, {
    enabled: true,
    reason: 'enabled',
    totalBricks: 4,
    emptyBricks: 2,
    occupiedBricks: 2,
    occupiedBricksMissingFromAtlas: 0,
    invalidRangeBricks: 0,
    occupancyMetadataMismatchBricks: 2
  });
  assert.equal(firstUniforms.u_adaptiveLodEnabled?.value, 0);
  assert.deepEqual((firstUniforms.u_brickGridSize?.value as THREE.Vector3).toArray(), [2, 2, 1]);
  assert.deepEqual((firstUniforms.u_brickChunkSize?.value as THREE.Vector3).toArray(), [2, 2, 2]);
  const occupancyData = (
    firstResource.brickOccupancyTexture?.image as { data: Uint8Array } | undefined
  )?.data;
  assert.deepEqual(Array.from(occupancyData ?? []), [255, 255, 0, 0]);
  const minData = (firstResource.brickMinTexture?.image as { data: Uint8Array } | undefined)?.data;
  assert.deepEqual(Array.from(minData ?? []), [5, 10, 15, 20]);
  const maxData = (firstResource.brickMaxTexture?.image as { data: Uint8Array } | undefined)?.data;
  assert.deepEqual(Array.from(maxData ?? []), [50, 100, 150, 200]);
  const atlasData = (
    firstResource.brickAtlasIndexTexture?.image as { data: Float32Array } | undefined
  )?.data;
  assert.deepEqual(Array.from(atlasData ?? []), [1, 2, 0, 0]);
  assert.equal(firstUniforms.u_brickAtlasEnabled?.value, 1);
  assert.ok(firstResource.brickAtlasDataTexture);
  assert.equal(firstResource.brickAtlasBuildVersion, 1);
  assert.strictEqual(firstResource.brickMetadataSourcePageTable, layers[0]?.brickPageTable);
  const atlasTextureShape = firstResource.brickAtlasDataTexture?.image as
    | { width: number; height: number; depth: number }
    | undefined;
  assert.deepEqual(
    [atlasTextureShape?.width ?? 0, atlasTextureShape?.height ?? 0, atlasTextureShape?.depth ?? 0],
    [2, 2, 4],
  );
  const updatedPageTable: VolumeBrickPageTable = {
    ...pageTable,
    chunkMin: new Uint8Array([8, 12, 16, 24]),
    chunkMax: new Uint8Array([80, 120, 160, 240]),
    chunkOccupancy: new Float32Array([1, 0, 0.8, 0]),
  };
  layers = [createLayer(volume, updatedPageTable, null, 'nearest')];
  hook.rerender();

  const updatedResource = resourcesRef.current.get('layer-3d');
  assert.ok(updatedResource);
  assert.ok(updatedResource.brickOccupancyTexture);
  assert.ok(updatedResource.brickMinTexture);
  assert.ok(updatedResource.brickMaxTexture);
  const updatedOccupancyData = (
    updatedResource.brickOccupancyTexture?.image as { data: Uint8Array } | undefined
  )?.data;
  assert.deepEqual(Array.from(updatedOccupancyData ?? []), [255, 0, 255, 0]);
  const updatedMinData = (
    updatedResource.brickMinTexture?.image as { data: Uint8Array } | undefined
  )?.data;
  assert.deepEqual(Array.from(updatedMinData ?? []), [8, 12, 16, 24]);
  const updatedMaxData = (
    updatedResource.brickMaxTexture?.image as { data: Uint8Array } | undefined
  )?.data;
  assert.deepEqual(Array.from(updatedMaxData ?? []), [80, 120, 160, 240]);
  const updatedAtlasData = (
    updatedResource.brickAtlasIndexTexture?.image as { data: Float32Array } | undefined
  )?.data;
  assert.deepEqual(Array.from(updatedAtlasData ?? []), [1, 2, 0, 0]);
  assert.deepEqual(updatedResource.brickSkipDiagnostics, {
    enabled: true,
    reason: 'enabled',
    totalBricks: 4,
    emptyBricks: 2,
    occupiedBricks: 2,
    occupiedBricksMissingFromAtlas: 1,
    invalidRangeBricks: 0,
    occupancyMetadataMismatchBricks: 2
  });
  assert.ok((updatedResource.brickAtlasBuildVersion ?? 0) >= 1);
  assert.strictEqual(updatedResource.brickMetadataSourcePageTable, layers[0]?.brickPageTable);

  const invalidPageTable: VolumeBrickPageTable = {
    ...pageTable,
    chunkMin: new Uint8Array([1, 2, 3]),
    chunkMax: new Uint8Array([4, 5, 6]),
    chunkOccupancy: new Float32Array([1, 0, 0]),
  };
  layers = [createLayer(volume, invalidPageTable, null, 'nearest')];
  assert.throws(() => hook.rerender(), /hard-cutover violation: invalid-page-table/);
})();

(() => {
  const volume: NormalizedVolume = {
    width: 4,
    height: 1,
    depth: 1,
    channels: 2,
    dataType: 'uint8',
    normalized: new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]),
    min: 0,
    max: 1,
  };
  const pageTable: VolumeBrickPageTable = {
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    gridShape: [1, 1, 2],
    chunkShape: [1, 1, 2],
    volumeShape: [1, 1, 4],
    brickAtlasIndices: new Int32Array([1, 0]),
    chunkMin: new Uint8Array([0, 0]),
    chunkMax: new Uint8Array([255, 255]),
    chunkOccupancy: new Float32Array([1, 1]),
    occupiedBrickCount: 2,
  };

  const sceneRef = { current: new THREE.Scene() };
  const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
  const controlsRef = {
    current: {
      target: new THREE.Vector3(),
      update: () => {},
      saveState: () => {},
    } as unknown as THREE.OrbitControls,
  };

  const resourcesRef = { current: new Map<string, VolumeResources>() };
  const baseLayer = createLayer(volume, pageTable, null, 'linear');
  let layers: ViewerLayer[] = [{ ...baseLayer, windowMin: 0.1, windowMax: 0.9, invert: false }];

  const hook = renderHook(() =>
    useVolumeResources({
      layers,
      primaryVolume: volume,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      sceneRef,
      cameraRef,
      controlsRef,
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef: { current: new THREE.Group() },
      resourcesRef,
      currentDimensionsRef: { current: null },
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  const resource = resourcesRef.current.get('layer-3d');
  assert.ok(resource);
  assert.ok(resource.brickAtlasDataTexture);
  const initialAtlasBuildVersion = resource.brickAtlasBuildVersion ?? 0;
  const initialMetadataSourcePageTable = resource.brickMetadataSourcePageTable;
  assert.ok(initialAtlasBuildVersion >= 1);
  assert.strictEqual(initialMetadataSourcePageTable, baseLayer.brickPageTable);
  assert.equal(resource.brickAtlasDataTexture?.format, THREE.RGFormat);
  const atlasImage = resource.brickAtlasDataTexture?.image as
    | { width: number; height: number; depth: number; data: Uint8Array }
    | undefined;
  assert.deepEqual([atlasImage?.width ?? 0, atlasImage?.height ?? 0, atlasImage?.depth ?? 0], [2, 1, 2]);
  assert.deepEqual(Array.from(atlasImage?.data ?? []), [50, 60, 70, 80, 10, 20, 30, 40]);

  const uniforms = (resource.mesh.material as THREE.ShaderMaterial).uniforms as Record<
    string,
    { value: unknown }
  >;
  assert.equal(uniforms.u_brickSkipEnabled?.value, 1);
  assert.deepEqual(resource.brickSkipDiagnostics, {
    enabled: true,
    reason: 'enabled',
    totalBricks: 2,
    emptyBricks: 0,
    occupiedBricks: 2,
    occupiedBricksMissingFromAtlas: 0,
    invalidRangeBricks: 0,
    occupancyMetadataMismatchBricks: 0
  });
  assert.equal(uniforms.u_adaptiveLodEnabled?.value, 1);
  assert.equal(uniforms.u_adaptiveLodScale?.value, 0.35);
  assert.equal(uniforms.u_adaptiveLodMax?.value, 0.75);
  assert.equal(uniforms.u_brickAtlasEnabled?.value, 1);
  assert.equal(uniforms.u_nearestSampling?.value, 0);
  assert.equal(uniforms.u_windowMin?.value, 0.1);
  assert.equal(uniforms.u_windowMax?.value, 0.9);
  assert.equal(uniforms.u_invert?.value, 0);

  layers = [{ ...baseLayer, windowMin: 0.2, windowMax: 0.7, invert: true }];
  hook.rerender();

  const updated = resourcesRef.current.get('layer-3d');
  assert.ok(updated);
  const updatedUniforms = (updated.mesh.material as THREE.ShaderMaterial).uniforms as Record<
    string,
    { value: unknown }
  >;
  assert.equal(updatedUniforms.u_brickAtlasEnabled?.value, 1);
  assert.equal(updatedUniforms.u_adaptiveLodEnabled?.value, 1);
  assert.equal(updatedUniforms.u_windowMin?.value, 0.2);
  assert.equal(updatedUniforms.u_windowMax?.value, 0.7);
  assert.equal(updatedUniforms.u_invert?.value, 1);
  assert.ok(updated.brickAtlasDataTexture);
  assert.ok((updated.brickAtlasBuildVersion ?? 0) >= initialAtlasBuildVersion);
  assert.strictEqual(updated.brickAtlasSourceToken, volume.normalized);
  assert.strictEqual(updated.brickAtlasSourcePageTable, baseLayer.brickPageTable);
  assert.strictEqual(updated.brickMetadataSourcePageTable, initialMetadataSourcePageTable);
  assert.equal(updated.brickAtlasDataTexture?.format, THREE.RGFormat);
})();

(() => {
  const volume: NormalizedVolume = {
    width: 2,
    height: 2,
    depth: 2,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array([0, 20, 40, 60, 80, 100, 120, 140]),
    segmentationLabels: new Uint32Array([0, 1, 1, 0, 2, 2, 0, 3]),
    segmentationLabelDataType: 'uint32',
    min: 0,
    max: 1,
  };
  const pageTable: VolumeBrickPageTable = {
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    gridShape: [1, 1, 1],
    chunkShape: [2, 2, 2],
    volumeShape: [2, 2, 2],
    brickAtlasIndices: new Int32Array([0]),
    chunkMin: new Uint8Array([0]),
    chunkMax: new Uint8Array([255]),
    chunkOccupancy: new Float32Array([1]),
    occupiedBrickCount: 1,
  };

  const sceneRef = { current: new THREE.Scene() };
  const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
  const controlsRef = {
    current: {
      target: new THREE.Vector3(),
      update: () => {},
      saveState: () => {},
    } as unknown as THREE.OrbitControls,
  };
  const resourcesRef = { current: new Map<string, VolumeResources>() };
  const baseLayer = {
    ...createLayer(volume, pageTable, null, 'linear'),
    isSegmentation: true,
  };
  let layers: ViewerLayer[] = [{ ...baseLayer, windowMin: 0.1, windowMax: 0.8, invert: false }];

  const hook = renderHook(() =>
    useVolumeResources({
      layers,
      primaryVolume: volume,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      sceneRef,
      cameraRef,
      controlsRef,
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef: { current: new THREE.Group() },
      resourcesRef,
      currentDimensionsRef: { current: null },
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  const initial = resourcesRef.current.get('layer-3d');
  assert.ok(initial);
  assert.ok(initial.labelTexture);
  const initialUniforms = (initial.mesh.material as THREE.ShaderMaterial).uniforms as Record<
    string,
    { value: unknown }
  >;
  assert.notStrictEqual(initialUniforms.u_segmentationLabels?.value, FALLBACK_SEGMENTATION_LABEL_TEXTURE);
  assert.strictEqual(initialUniforms.u_segmentationLabels?.value, initial.labelTexture);
  assert.equal(initialUniforms.u_brickAtlasEnabled?.value, 1);
  assert.equal(initial.brickAtlasDataTexture?.minFilter, THREE.LinearFilter);
  assert.equal(initial.brickAtlasDataTexture?.magFilter, THREE.LinearFilter);

  layers = [{ ...baseLayer, windowMin: 0.2, windowMax: 0.7, invert: true }];
  hook.rerender();

  const updated = resourcesRef.current.get('layer-3d');
  assert.ok(updated);
  assert.ok(updated.labelTexture);
  const updatedUniforms = (updated.mesh.material as THREE.ShaderMaterial).uniforms as Record<
    string,
    { value: unknown }
  >;
  assert.strictEqual(updatedUniforms.u_segmentationLabels?.value, updated.labelTexture);
  assert.equal(updatedUniforms.u_windowMin?.value, 0.2);
  assert.equal(updatedUniforms.u_windowMax?.value, 0.7);
  assert.equal(updatedUniforms.u_invert?.value, 1);
  assert.equal(updatedUniforms.u_brickAtlasEnabled?.value, 1);

  layers = [{ ...baseLayer, samplingMode: 'nearest', windowMin: 0.15, windowMax: 0.85, invert: false }];
  hook.rerender();

  const nearest = resourcesRef.current.get('layer-3d');
  assert.ok(nearest);
  assert.ok(nearest.labelTexture);
  const nearestUniforms = (nearest.mesh.material as THREE.ShaderMaterial).uniforms as Record<
    string,
    { value: unknown }
  >;
  assert.strictEqual(nearestUniforms.u_segmentationLabels?.value, nearest.labelTexture);
  assert.equal(nearestUniforms.u_windowMin?.value, 0.15);
  assert.equal(nearestUniforms.u_windowMax?.value, 0.85);
  assert.equal(nearestUniforms.u_invert?.value, 0);
  assert.equal(nearestUniforms.u_nearestSampling?.value, 1);
  assert.equal(nearestUniforms.u_adaptiveLodEnabled?.value, 0);
  assert.equal(nearestUniforms.u_brickAtlasEnabled?.value, 1);
  assert.equal(nearest.brickAtlasDataTexture?.minFilter, THREE.NearestFilter);
  assert.equal(nearest.brickAtlasDataTexture?.magFilter, THREE.NearestFilter);

  layers = [{ ...baseLayer, volume: { ...volume, segmentationLabels: undefined } }];
  hook.rerender();
  const fallback = resourcesRef.current.get('layer-3d');
  assert.ok(fallback);
  const fallbackUniforms = (fallback.mesh.material as THREE.ShaderMaterial).uniforms as Record<
    string,
    { value: unknown }
  >;
  assert.strictEqual(fallbackUniforms.u_segmentationLabels?.value, FALLBACK_SEGMENTATION_LABEL_TEXTURE);
})();

(() => {
  const pageTable: VolumeBrickPageTable = {
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    gridShape: [1, 1, 1],
    chunkShape: [2, 2, 2],
    volumeShape: [2, 2, 2],
    brickAtlasIndices: new Int32Array([0]),
    chunkMin: new Uint8Array([0]),
    chunkMax: new Uint8Array([255]),
    chunkOccupancy: new Float32Array([1]),
    occupiedBrickCount: 1,
  };
  const brickAtlas: VolumeBrickAtlas = {
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    pageTable,
    width: 2,
    height: 2,
    depth: 2,
    textureFormat: 'red',
    sourceChannels: 1,
    data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
    enabled: true,
  };

  const sceneRef = { current: new THREE.Scene() };
  const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
  const controlsRef = {
    current: {
      target: new THREE.Vector3(),
      update: () => {},
      saveState: () => {},
    } as unknown as THREE.OrbitControls,
  };
  const resourcesRef = { current: new Map<string, VolumeResources>() };
  const layer = createLayer(null, pageTable, brickAtlas, 'linear');

  renderHook(() =>
    useVolumeResources({
      layers: [layer],
      primaryVolume: null,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      sceneRef,
      cameraRef,
      controlsRef,
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef: { current: new THREE.Group() },
      resourcesRef,
      currentDimensionsRef: { current: null },
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  const resource = resourcesRef.current.get('layer-3d');
  assert.ok(resource);
  assert.equal(resource.mode, '3d');
  assert.deepEqual(resource.dimensions, { width: 2, height: 2, depth: 2 });
  const uniforms = (resource.mesh.material as THREE.ShaderMaterial).uniforms as Record<
    string,
    { value: unknown }
  >;
  assert.equal(uniforms.u_brickAtlasEnabled?.value, 1);
  const size = uniforms.u_size?.value as THREE.Vector3;
  assert.ok(size instanceof THREE.Vector3);
  assert.deepEqual([size.x, size.y, size.z], [2, 2, 2]);
  const texture = resource.texture as THREE.Data3DTexture;
  const image = texture.image as { width: number; height: number; depth: number; data: Uint8Array };
  assert.deepEqual([image.width, image.height, image.depth], [1, 1, 1]);
  assert.equal(image.data.length, 1);
})();

(() => {
  const pageTable: VolumeBrickPageTable = {
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    gridShape: [1, 1, 4],
    chunkShape: [1, 1, 1],
    volumeShape: [1, 1, 4],
    brickAtlasIndices: new Int32Array([0, 1, 2, 3]),
    chunkMin: new Uint8Array([0, 0, 0, 0]),
    chunkMax: new Uint8Array([255, 255, 255, 255]),
    chunkOccupancy: new Float32Array([1, 1, 1, 1]),
    occupiedBrickCount: 4,
  };
  const brickAtlas: VolumeBrickAtlas = {
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    pageTable,
    width: 1,
    height: 1,
    depth: 4,
    textureFormat: 'red',
    sourceChannels: 1,
    data: new Uint8Array([10, 40, 80, 120]),
    enabled: true,
  };

  const sceneRef = { current: new THREE.Scene() };
  const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
  const controlsRef = {
    current: {
      target: new THREE.Vector3(),
      update: () => {},
      saveState: () => {},
    } as unknown as THREE.OrbitControls,
  };
  const resourcesRef = { current: new Map<string, VolumeResources>() };
  const rendererRef = {
    current: {
      capabilities: { isWebGL2: true },
      getContext: () =>
        ({
          MAX_3D_TEXTURE_SIZE: 0x8073,
          getParameter: (parameter: number) => (parameter === 0x8073 ? 8 : 0),
        }) as unknown as WebGL2RenderingContext,
    } as unknown as THREE.WebGLRenderer,
  };
  const layer = createLayer(null, pageTable, brickAtlas, 'linear');

  renderHook(() =>
    useVolumeResources({
      layers: [layer],
      primaryVolume: null,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      rendererRef,
      sceneRef,
      cameraRef,
      controlsRef,
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef: { current: new THREE.Group() },
      resourcesRef,
      currentDimensionsRef: { current: null },
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  const resource = resourcesRef.current.get('layer-3d');
  assert.ok(resource);
  assert.equal(resource.gpuBrickResidencyMetrics, null);
  const atlasImage = resource.brickAtlasDataTexture?.image as
    | { width: number; height: number; depth: number }
    | undefined;
  assert.deepEqual([atlasImage?.width ?? 0, atlasImage?.height ?? 0, atlasImage?.depth ?? 0], [1, 1, 4]);
  const uniforms = (resource.mesh.material as THREE.ShaderMaterial).uniforms as Record<
    string,
    { value: unknown }
  >;
  assert.equal(uniforms.u_brickAtlasEnabled?.value, 1);
  assert.deepEqual((uniforms.u_brickAtlasSize?.value as THREE.Vector3).toArray(), [1, 1, 4]);
  assert.deepEqual((uniforms.u_brickAtlasSlotGrid?.value as THREE.Vector3).toArray(), [1, 1, 4]);
})();

(() => {
  const previousBudget = process.env.VITE_MAX_GPU_BRICK_BYTES;
  const previousMaxUploads = process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE;
  process.env.VITE_MAX_GPU_BRICK_BYTES = '2';
  process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE = '1';

  try {
    const pageTable: VolumeBrickPageTable = {
      layerKey: 'layer-3d',
      timepoint: 0,
      scaleLevel: 1,
      gridShape: [1, 1, 2],
      chunkShape: [1, 1, 2],
      volumeShape: [1, 1, 4],
      brickAtlasIndices: new Int32Array([0, 1]),
      chunkMin: new Uint8Array([0, 0]),
      chunkMax: new Uint8Array([255, 255]),
      chunkOccupancy: new Float32Array([1, 1]),
      occupiedBrickCount: 2
    };
    const brickAtlas: VolumeBrickAtlas = {
      layerKey: 'layer-3d',
      timepoint: 0,
      scaleLevel: 1,
      pageTable,
      width: 2,
      height: 1,
      depth: 2,
      textureFormat: 'red',
      sourceChannels: 1,
      data: new Uint8Array([11, 12, 21, 22]),
      enabled: true
    };
    const layer = createLayer(null, pageTable, brickAtlas, 'linear');

    const sceneRef = { current: new THREE.Scene() };
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 20);
    camera.position.set(-10, 0, 6);
    camera.updateMatrixWorld(true);
    const cameraRef = { current: camera };
    const controlsRef = {
      current: {
        target: new THREE.Vector3(),
        update: () => {},
        saveState: () => {}
      } as unknown as THREE.OrbitControls
    };
    const resourcesRef = { current: new Map<string, VolumeResources>() };
    const renderContextRevision = 0;

    const hook = renderHook(() =>
      useVolumeResources({
        layers: [layer],
        primaryVolume: null,
        isAdditiveBlending: false,
        renderContextRevision,
        sceneRef,
        cameraRef,
        controlsRef,
        rotationTargetRef: { current: new THREE.Vector3() },
        defaultViewStateRef: { current: null },
        trackGroupRef: { current: new THREE.Group() },
        resourcesRef,
        currentDimensionsRef: { current: { width: 4, height: 1, depth: 1 } },
        colormapCacheRef: { current: new Map() },
        volumeRootGroupRef: { current: new THREE.Group() },
        volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
        volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
        volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
        volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
        volumeNormalizationScaleRef: { current: 1 },
        volumeUserScaleRef: { current: 1 },
        volumeStepScaleRef: { current: 1 },
        volumeYawRef: { current: 0 },
        volumePitchRef: { current: 0 },
        volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
        applyTrackGroupTransform: () => {},
        applyVolumeRootTransform: () => {},
        applyVolumeStepScaleToResources: () => {},
        applyHoverHighlightToResources: () => {}
      })
    );

    const initial = resourcesRef.current.get('layer-3d');
    assert.ok(initial);
    assert.ok(initial.gpuBrickResidencyMetrics);
    assert.equal(initial.gpuBrickResidencyMetrics?.budgetBytes, 72);
    assert.equal(initial.gpuBrickResidencyMetrics?.residentBricks, 2);
    assert.equal(initial.gpuBrickResidencyMetrics?.totalBricks, 2);
    assert.ok((initial.gpuBrickResidencyMetrics?.scheduledUploads ?? 0) <= 2);
    assert.equal(initial.gpuBrickResidencyMetrics?.prioritizedBricks, 2);
    assert.equal(initial.gpuBrickResidencyMetrics?.residentBytes, 72);
    const initialIndexData = (
      initial.brickAtlasIndexTexture?.image as { data: Float32Array } | undefined
    )?.data;
    const initialIndices = Array.from(initialIndexData ?? []);
    assert.equal(initialIndices.filter((value) => value > 0).length, 2);
    const initialAtlasImage = initial.brickAtlasDataTexture?.image as
      | { width: number; height: number; depth: number; data: Uint8Array }
      | undefined;
    assert.deepEqual(
      [initialAtlasImage?.width ?? 0, initialAtlasImage?.height ?? 0, initialAtlasImage?.depth ?? 0],
      [4, 3, 6]
    );
    const initialAtlasPayload = Array.from(initialAtlasImage?.data ?? []);
    const uniqueValues = new Set(initialAtlasPayload);
    assert.ok(uniqueValues.has(11));
    assert.ok(uniqueValues.has(12));
    assert.ok(uniqueValues.has(21));
    assert.ok(uniqueValues.has(22));

    const refreshResidency = initial.updateGpuBrickResidencyForCamera;
    assert.equal(typeof refreshResidency, 'function');
    const initialUploads = initial.gpuBrickResidencyMetrics?.uploads ?? 0;
    const initialEvictions = initial.gpuBrickResidencyMetrics?.evictions ?? 0;
    const initialAtlasDataVersion = initial.brickAtlasDataTexture?.version ?? 0;
    const initialAtlasIndexVersion = initial.brickAtlasIndexTexture?.version ?? 0;

    // Stable camera: residency should converge and remain stable (no upload/eviction churn).
    refreshResidency?.(new THREE.Vector3(camera.position.x, 0, camera.position.z));

    const stable = resourcesRef.current.get('layer-3d');
    assert.ok(stable);
    assert.ok(stable.gpuBrickResidencyMetrics);
    assert.equal(stable.gpuBrickResidencyMetrics?.uploads, initialUploads);
    assert.equal(stable.gpuBrickResidencyMetrics?.evictions, initialEvictions);
    const stableIndexData = (
      stable.brickAtlasIndexTexture?.image as { data: Float32Array } | undefined
    )?.data;
    const stableIndices = Array.from(stableIndexData ?? []);
    assert.deepEqual(stableIndices, initialIndices);
    assert.equal(stable.brickAtlasDataTexture?.version ?? 0, initialAtlasDataVersion);
    assert.equal(stable.brickAtlasIndexTexture?.version ?? 0, initialAtlasIndexVersion);

    refreshResidency?.(new THREE.Vector3(10, 0, camera.position.z));

    const updated = resourcesRef.current.get('layer-3d');
    assert.ok(updated);
    assert.ok(updated.gpuBrickResidencyMetrics);
    assert.equal(updated.gpuBrickResidencyMetrics?.residentBricks, 2);
    assert.equal(updated.gpuBrickResidencyMetrics?.totalBricks, 2);
    assert.equal(updated.gpuBrickResidencyMetrics?.uploads, initialUploads);
    assert.equal(updated.gpuBrickResidencyMetrics?.evictions, initialEvictions);
    const updatedIndexData = (
      updated.brickAtlasIndexTexture?.image as { data: Float32Array } | undefined
    )?.data;
    const updatedIndices = Array.from(updatedIndexData ?? []);
    assert.equal(updatedIndices.filter((value) => value > 0).length, 2);
    assert.deepEqual(updatedIndices, initialIndices);
    const updatedAtlasImage = updated.brickAtlasDataTexture?.image as
      | { width: number; height: number; depth: number; data: Uint8Array }
      | undefined;
    const updatedAtlasPayload = Array.from(updatedAtlasImage?.data ?? []);
    assert.deepEqual(updatedAtlasPayload, initialAtlasPayload);
    hook.unmount();
  } finally {
    if (previousBudget === undefined) {
      delete process.env.VITE_MAX_GPU_BRICK_BYTES;
    } else {
      process.env.VITE_MAX_GPU_BRICK_BYTES = previousBudget;
    }
    if (previousMaxUploads === undefined) {
      delete process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE;
    } else {
      process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE = previousMaxUploads;
    }
  }
})();

(() => {
  const previousBudget = process.env.VITE_MAX_GPU_BRICK_BYTES;
  const previousMaxUploads = process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE;
  delete process.env.VITE_MAX_GPU_BRICK_BYTES;
  delete process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE;

  try {
    const brickCount = 40;
    const pageTable: VolumeBrickPageTable = {
      layerKey: 'layer-3d',
      timepoint: 0,
      scaleLevel: 1,
      gridShape: [1, 1, brickCount],
      chunkShape: [1, 1, 1],
      volumeShape: [1, 1, brickCount],
      brickAtlasIndices: Int32Array.from({ length: brickCount }, (_value, index) => index),
      chunkMin: new Uint8Array(brickCount),
      chunkMax: new Uint8Array(brickCount).fill(255),
      chunkOccupancy: new Float32Array(brickCount).fill(1),
      occupiedBrickCount: brickCount
    };
    const brickAtlas: VolumeBrickAtlas = {
      layerKey: 'layer-3d',
      timepoint: 0,
      scaleLevel: 1,
      pageTable,
      width: 1,
      height: 1,
      depth: brickCount,
      textureFormat: 'red',
      sourceChannels: 1,
      data: Uint8Array.from({ length: brickCount }, (_value, index) => 10 + index),
      enabled: true
    };
    const layer = createLayer(null, pageTable, brickAtlas, 'linear');

    const sceneRef = { current: new THREE.Scene() };
    const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
    const controlsRef = {
      current: {
        target: new THREE.Vector3(),
        update: () => {},
        saveState: () => {}
      } as unknown as THREE.OrbitControls
    };
    const resourcesRef = { current: new Map<string, VolumeResources>() };

    renderHook(() =>
      useVolumeResources({
        layers: [layer],
        primaryVolume: null,
        isAdditiveBlending: false,
        renderContextRevision: 0,
        sceneRef,
        cameraRef,
        controlsRef,
        rotationTargetRef: { current: new THREE.Vector3() },
        defaultViewStateRef: { current: null },
        trackGroupRef: { current: new THREE.Group() },
        resourcesRef,
        currentDimensionsRef: { current: null },
        colormapCacheRef: { current: new Map() },
        volumeRootGroupRef: { current: new THREE.Group() },
        volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
        volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
        volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
        volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
        volumeNormalizationScaleRef: { current: 1 },
        volumeUserScaleRef: { current: 1 },
        volumeStepScaleRef: { current: 1 },
        volumeYawRef: { current: 0 },
        volumePitchRef: { current: 0 },
        volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
        applyTrackGroupTransform: () => {},
        applyVolumeRootTransform: () => {},
        applyVolumeStepScaleToResources: () => {},
        applyHoverHighlightToResources: () => {},
      })
    );

    const resource = resourcesRef.current.get('layer-3d');
    assert.ok(resource);
    assert.ok(resource.gpuBrickResidencyMetrics);
    assert.equal(resource.gpuBrickResidencyMetrics?.totalBricks, brickCount);
    assert.equal(resource.gpuBrickResidencyMetrics?.residentBricks, brickCount);
    assert.ok((resource.gpuBrickResidencyMetrics?.uploads ?? 0) >= brickCount);
    const atlasIndices = (
      resource.brickAtlasIndexTexture?.image as { data: Float32Array } | undefined
    )?.data;
    assert.equal(Array.from(atlasIndices ?? []).filter((value) => value > 0).length, brickCount);
  } finally {
    if (previousBudget === undefined) {
      delete process.env.VITE_MAX_GPU_BRICK_BYTES;
    } else {
      process.env.VITE_MAX_GPU_BRICK_BYTES = previousBudget;
    }
    if (previousMaxUploads === undefined) {
      delete process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE;
    } else {
      process.env.VITE_MAX_BRICK_UPLOADS_PER_UPDATE = previousMaxUploads;
    }
  }
})();

(() => {
  const volume: NormalizedVolume = {
    width: 2,
    height: 2,
    depth: 3,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array([
      1, 2, 3, 4,
      11, 12, 13, 14,
      21, 22, 23, 24,
    ]),
    min: 0,
    max: 1,
  };
  const pageTable: VolumeBrickPageTable = {
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    gridShape: [1, 1, 1],
    chunkShape: [3, 2, 2],
    volumeShape: [3, 2, 2],
    brickAtlasIndices: new Int32Array([0]),
    chunkMin: new Uint8Array([0]),
    chunkMax: new Uint8Array([255]),
    chunkOccupancy: new Float32Array([1]),
    occupiedBrickCount: 1,
  };
  const brickAtlas: VolumeBrickAtlas = {
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    pageTable,
    width: 2,
    height: 2,
    depth: 3,
    textureFormat: 'red',
    sourceChannels: 1,
    data: new Uint8Array([
      100, 101, 102, 103,
      110, 111, 112, 113,
      120, 121, 122, 123,
    ]),
    enabled: true,
  };
  const layer: ViewerLayer = {
    ...createLayer(volume, pageTable, brickAtlas, 'linear'),
    renderStyle: RENDER_STYLE_SLICE,
  };

  const sceneRef = { current: new THREE.Scene() };
  const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
  const controlsRef = {
    current: {
      target: new THREE.Vector3(),
      update: () => {},
      saveState: () => {},
    } as unknown as THREE.OrbitControls,
  };
  const resourcesRef = { current: new Map<string, VolumeResources>() };

  renderHook(() =>
    useVolumeResources({
      layers: [layer],
      primaryVolume: volume,
      isAdditiveBlending: false,
      zClipFrontFraction: 0.5,
      renderContextRevision: 0,
      sceneRef,
      cameraRef,
      controlsRef,
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef: { current: new THREE.Group() },
      resourcesRef,
      currentDimensionsRef: { current: null },
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  const resource = resourcesRef.current.get('layer-3d');
  assert.ok(resource);
  assert.equal(resource.mode, 'slice');
  assert.equal(resource.samplingMode, 'nearest');
  assert.equal(resource.brickAtlasDataTexture, null);
  assert.ok(resource.texture instanceof THREE.DataTexture);
  assert.equal((resource.texture as THREE.DataTexture).minFilter, THREE.NearestFilter);
  assert.equal((resource.texture as THREE.DataTexture).magFilter, THREE.NearestFilter);
  const material = resource.mesh.material as THREE.ShaderMaterial;
  assert.equal(material.uniforms.u_brickAtlasEnabled, undefined);
  const data = Array.from((resource.texture as THREE.DataTexture).image.data as Uint8Array);
  assert.deepEqual(
    data,
    [
      11, 11, 11, 255,
      12, 12, 12, 255,
      13, 13, 13, 255,
      14, 14, 14, 255,
    ],
  );
})();

(() => {
  const pageTable: VolumeBrickPageTable = {
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    gridShape: [3, 1, 1],
    chunkShape: [1, 2, 2],
    volumeShape: [3, 2, 2],
    brickAtlasIndices: new Int32Array([0, 1, 2]),
    chunkMin: new Uint8Array([0, 0, 0]),
    chunkMax: new Uint8Array([255, 255, 255]),
    chunkOccupancy: new Float32Array([1, 1, 1]),
    occupiedBrickCount: 3,
  };
  const brickAtlas: VolumeBrickAtlas = {
    layerKey: 'layer-3d',
    timepoint: 0,
    scaleLevel: 0,
    pageTable,
    width: 2,
    height: 2,
    depth: 3,
    textureFormat: 'red',
    sourceChannels: 1,
    data: new Uint8Array([
      10, 11, 12, 13,
      20, 21, 22, 23,
      30, 31, 32, 33,
    ]),
    enabled: true,
  };
  const layer: ViewerLayer = {
    ...createLayer(null, pageTable, brickAtlas, 'linear'),
    renderStyle: RENDER_STYLE_SLICE,
  };

  const sceneRef = { current: new THREE.Scene() };
  const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
  const controlsRef = {
    current: {
      target: new THREE.Vector3(),
      update: () => {},
      saveState: () => {},
    } as unknown as THREE.OrbitControls,
  };
  const resourcesRef = { current: new Map<string, VolumeResources>() };

  renderHook(() =>
    useVolumeResources({
      layers: [layer],
      primaryVolume: null,
      isAdditiveBlending: false,
      zClipFrontFraction: 0.5,
      renderContextRevision: 0,
      sceneRef,
      cameraRef,
      controlsRef,
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef: { current: new THREE.Group() },
      resourcesRef,
      currentDimensionsRef: { current: null },
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  const resource = resourcesRef.current.get('layer-3d');
  assert.ok(resource);
  assert.equal(resource.mode, 'slice');
  assert.equal(resource.samplingMode, 'nearest');
  assert.ok(resource.texture instanceof THREE.DataTexture);
  const texture = resource.texture as THREE.DataTexture;
  assert.equal(texture.minFilter, THREE.NearestFilter);
  assert.equal(texture.magFilter, THREE.NearestFilter);
  const data = Array.from(texture.image.data as Uint8Array);
  assert.deepEqual(
    data,
    [
      20, 20, 20, 255,
      21, 21, 21, 255,
      22, 22, 22, 255,
      23, 23, 23, 255,
    ],
  );
})();

(() => {
  const stalePageTable: VolumeBrickPageTable = withSyntheticSkipHierarchy({
    layerKey: 'layer-3d',
    timepoint: 1,
    scaleLevel: 0,
    gridShape: [1, 1, 1],
    chunkShape: [1, 1, 1],
    volumeShape: [1, 1, 1],
    brickAtlasIndices: new Int32Array([0]),
    chunkMin: new Uint8Array([0]),
    chunkMax: new Uint8Array([255]),
    chunkOccupancy: new Float32Array([1]),
    occupiedBrickCount: 1,
  } satisfies PageTableWithoutHierarchy);
  const atlasPageTable: VolumeBrickPageTable = withSyntheticSkipHierarchy({
    layerKey: 'layer-3d',
    timepoint: 2,
    scaleLevel: 0,
    gridShape: [1, 1, 1],
    chunkShape: [1, 1, 1],
    volumeShape: [2, 2, 2],
    brickAtlasIndices: new Int32Array([0]),
    chunkMin: new Uint8Array([0]),
    chunkMax: new Uint8Array([255]),
    chunkOccupancy: new Float32Array([1]),
    occupiedBrickCount: 1,
  } satisfies PageTableWithoutHierarchy);
  const brickAtlas: VolumeBrickAtlas = {
    layerKey: 'layer-3d',
    timepoint: 2,
    scaleLevel: 0,
    pageTable: atlasPageTable,
    width: 1,
    height: 1,
    depth: 1,
    textureFormat: 'red',
    sourceChannels: 1,
    data: new Uint8Array([200]),
    enabled: true,
  };
  const layer: ViewerLayer = {
    ...createLayer(null, stalePageTable, null, 'linear'),
    brickPageTable: stalePageTable,
    brickAtlas,
    fullResolutionWidth: 2,
    fullResolutionHeight: 2,
    fullResolutionDepth: 2,
  };

  const sceneRef = { current: new THREE.Scene() };
  const cameraRef = { current: new THREE.PerspectiveCamera(75, 1, 0.1, 10) };
  const controlsRef = {
    current: {
      target: new THREE.Vector3(),
      update: () => {},
      saveState: () => {},
    } as unknown as THREE.OrbitControls,
  };
  const resourcesRef = { current: new Map<string, VolumeResources>() };

  renderHook(() =>
    useVolumeResources({
      layers: [layer],
      primaryVolume: null,
      isAdditiveBlending: false,
      renderContextRevision: 0,
      sceneRef,
      cameraRef,
      controlsRef,
      rotationTargetRef: { current: new THREE.Vector3() },
      defaultViewStateRef: { current: null },
      trackGroupRef: { current: new THREE.Group() },
      resourcesRef,
      currentDimensionsRef: { current: null },
      colormapCacheRef: { current: new Map() },
      volumeRootGroupRef: { current: new THREE.Group() },
      volumeRootBaseOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterOffsetRef: { current: new THREE.Vector3() },
      volumeRootCenterUnscaledRef: { current: new THREE.Vector3() },
      volumeRootHalfExtentsRef: { current: new THREE.Vector3() },
      volumeNormalizationScaleRef: { current: 1 },
      volumeUserScaleRef: { current: 1 },
      volumeStepScaleRef: { current: 1 },
      volumeYawRef: { current: 0 },
      volumePitchRef: { current: 0 },
      volumeRootRotatedCenterTempRef: { current: new THREE.Vector3() },
      applyTrackGroupTransform: () => {},
      applyVolumeRootTransform: () => {},
      applyVolumeStepScaleToResources: () => {},
      applyHoverHighlightToResources: () => {},
    }),
  );

  const resource = resourcesRef.current.get('layer-3d');
  assert.ok(resource);
  assert.strictEqual(resource.brickMetadataSourcePageTable, atlasPageTable);
  assert.strictEqual(resource.brickAtlasSourcePageTable, atlasPageTable);
  const uniforms = (resource.mesh.material as THREE.ShaderMaterial).uniforms as Record<string, { value: unknown }>;
  assert.deepEqual(
    (uniforms.u_brickVolumeSize?.value as THREE.Vector3).toArray(),
    [atlasPageTable.volumeShape[2], atlasPageTable.volumeShape[1], atlasPageTable.volumeShape[0]]
  );
})();

console.log('useVolumeResources tests passed');
