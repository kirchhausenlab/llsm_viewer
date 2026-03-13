import { Vector2, Vector3, Vector4 } from 'three';
import type { Data3DTexture, DataTexture } from 'three';
import {
  RENDER_STYLE_BL,
  RENDER_STYLE_ISO,
  type RenderStyle
} from '../state/layerSettings';

export type BrickSkipDecisionArgs = {
  skipEnabled: boolean;
  occupancy: number;
  brickMinRaw: number;
  brickMaxRaw: number;
  currentMax: number;
  isoLowThreshold: number;
  invert: boolean;
  windowMin: number;
  windowMax: number;
};

export type AdaptiveLodDecisionArgs = {
  adaptiveLodEnabled: boolean;
  nearestSampling: boolean;
  step: [number, number, number];
  size: [number, number, number];
  projectedFootprint?: number;
  lodScale: number;
  lodMax: number;
  mode: 'mip' | 'iso' | 'bl';
  currentMax?: number;
};

export type SkipHierarchyNodeBoundsArgs = {
  voxelCoords: [number, number, number];
  hierarchyLevel: number;
  grid: [number, number, number];
  chunkSize: [number, number, number];
  volumeSize: [number, number, number];
};

export type SkipHierarchyNodeBounds = {
  nodeCoords: [number, number, number];
  nodeSize: [number, number, number];
  nodeMin: [number, number, number];
  nodeMax: [number, number, number];
};

export type LinearAtlasSamplingAnalysisArgs = {
  texcoords: [number, number, number];
  size: [number, number, number];
  chunkSize: [number, number, number];
};

export type LinearAtlasSamplingAnalysis = {
  baseBrick: [number, number, number];
  farBrick: [number, number, number];
  spans: [boolean, boolean, boolean];
  sameBrickFastPath: boolean;
  atlasIndexLookupCount: number;
  atlasDataSampleCount: number;
};

export type AtlasLinearLodBand = {
  useCoarseSampling: boolean;
  lowLevel: number;
  highLevel: number;
  blend: number;
};

export type HierarchyNodeExitArgs = {
  rayVoxelCoords: [number, number, number];
  voxelStep: [number, number, number];
  nodeMin: [number, number, number];
  nodeMax: [number, number, number];
};

export type NearestEntryStartArgs = {
  front: [number, number, number];
  size: [number, number, number];
  traversalSize: [number, number, number];
  rayDir: [number, number, number];
};

export type NearestEntryStart = {
  voxelCoords: [number, number, number];
  texcoords: [number, number, number];
};

export type NearestDdaAxisInit = {
  axisStep: number;
  tMax: number;
  tDelta: number;
};

export type SegmentationFieldSampleArgs = {
  labels: Uint16Array;
  size: [number, number, number];
  texcoords: [number, number, number];
  samplingMode: 'linear' | 'nearest';
};

export type SegmentationNearestLabelArgs = {
  labels: Uint16Array;
  size: [number, number, number];
  texcoords: [number, number, number];
};

function normalizeWindowValue(value: number, windowMin: number, windowMax: number): number {
  const range = Math.max(windowMax - windowMin, 1e-5);
  const normalized = (value - windowMin) / range;
  return Math.min(1, Math.max(0, normalized));
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampAtLeastOne(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, value);
}

function clampVoxelCoordinate(value: number, size: number): number {
  const safeSize = clampAtLeastOne(size);
  return Math.min(Math.max(value, 0), Math.max(safeSize - 1, 0));
}

function brickCoordForVoxelCpu(voxelCoord: number, size: number, chunkSize: number): number {
  const safeSize = clampAtLeastOne(size);
  const safeChunk = clampAtLeastOne(chunkSize);
  const clampedVoxel = clampVoxelCoordinate(voxelCoord, safeSize);
  const brickCoord = Math.floor(clampedVoxel / safeChunk);
  const maxBrickCoord = Math.max(0, Math.ceil(safeSize / safeChunk) - 1);
  return Math.min(Math.max(brickCoord, 0), maxBrickCoord);
}

export function analyzeLinearAtlasSamplingCpu(
  args: LinearAtlasSamplingAnalysisArgs,
): LinearAtlasSamplingAnalysis {
  const safeTexcoords: [number, number, number] = [
    clampUnit(Number.isFinite(args.texcoords[0]) ? args.texcoords[0] : 0),
    clampUnit(Number.isFinite(args.texcoords[1]) ? args.texcoords[1] : 0),
    clampUnit(Number.isFinite(args.texcoords[2]) ? args.texcoords[2] : 0),
  ];
  const safeSize: [number, number, number] = [
    clampAtLeastOne(args.size[0]),
    clampAtLeastOne(args.size[1]),
    clampAtLeastOne(args.size[2]),
  ];
  const safeChunkSize: [number, number, number] = [
    clampAtLeastOne(args.chunkSize[0]),
    clampAtLeastOne(args.chunkSize[1]),
    clampAtLeastOne(args.chunkSize[2]),
  ];

  const baseVoxel: [number, number, number] = [
    Math.floor(safeTexcoords[0] * safeSize[0] - 0.5),
    Math.floor(safeTexcoords[1] * safeSize[1] - 0.5),
    Math.floor(safeTexcoords[2] * safeSize[2] - 0.5),
  ];
  const farVoxel: [number, number, number] = [
    baseVoxel[0] + 1,
    baseVoxel[1] + 1,
    baseVoxel[2] + 1,
  ];

  const baseBrick: [number, number, number] = [
    brickCoordForVoxelCpu(baseVoxel[0], safeSize[0], safeChunkSize[0]),
    brickCoordForVoxelCpu(baseVoxel[1], safeSize[1], safeChunkSize[1]),
    brickCoordForVoxelCpu(baseVoxel[2], safeSize[2], safeChunkSize[2]),
  ];
  const farBrick: [number, number, number] = [
    brickCoordForVoxelCpu(farVoxel[0], safeSize[0], safeChunkSize[0]),
    brickCoordForVoxelCpu(farVoxel[1], safeSize[1], safeChunkSize[1]),
    brickCoordForVoxelCpu(farVoxel[2], safeSize[2], safeChunkSize[2]),
  ];

  const spans: [boolean, boolean, boolean] = [
    baseBrick[0] !== farBrick[0],
    baseBrick[1] !== farBrick[1],
    baseBrick[2] !== farBrick[2],
  ];
  const sameBrickFastPath = !spans[0] && !spans[1] && !spans[2];
  const atlasIndexLookupCount =
    (spans[0] ? 2 : 1) * (spans[1] ? 2 : 1) * (spans[2] ? 2 : 1);
  const atlasDataSampleCount = sameBrickFastPath ? 1 : 8;

  return {
    baseBrick,
    farBrick,
    spans,
    sameBrickFastPath,
    atlasIndexLookupCount,
    atlasDataSampleCount,
  };
}

export function computeAdaptiveLodCpu(args: AdaptiveLodDecisionArgs): number {
  if (!args.adaptiveLodEnabled || args.nearestSampling) {
    return 0;
  }

  const stepX = Number.isFinite(args.step[0]) ? args.step[0] : 0;
  const stepY = Number.isFinite(args.step[1]) ? args.step[1] : 0;
  const stepZ = Number.isFinite(args.step[2]) ? args.step[2] : 0;
  const sizeX = Number.isFinite(args.size[0]) ? args.size[0] : 0;
  const sizeY = Number.isFinite(args.size[1]) ? args.size[1] : 0;
  const sizeZ = Number.isFinite(args.size[2]) ? args.size[2] : 0;
  const voxelStep = Math.sqrt(
    (stepX * sizeX) * (stepX * sizeX) +
      (stepY * sizeY) * (stepY * sizeY) +
      (stepZ * sizeZ) * (stepZ * sizeZ),
  );
  const projectedFootprint = Number.isFinite(args.projectedFootprint) ? Math.max(0, args.projectedFootprint as number) : 0;
  const footprintVoxels = Math.max(voxelStep, projectedFootprint, 1);
  const baseLod = Math.log2(footprintVoxels);
  const lodScale = Math.max(0, Number.isFinite(args.lodScale) ? args.lodScale : 0);
  const lodMax = Math.max(0, Number.isFinite(args.lodMax) ? args.lodMax : 0);
  const clampedBase = Math.min(Math.max(baseLod * lodScale, 0), lodMax);
  if (args.mode === 'iso') {
    return Math.min(Math.max(clampedBase * 0.95, 0), lodMax);
  }
  if (args.mode === 'bl') {
    const alphaConfidence = clampUnit(Number.isFinite(args.currentMax) ? (args.currentMax as number) : 0);
    const refined = clampedBase * (0.7 - alphaConfidence * 0.25);
    return Math.min(Math.max(refined, 0), lodMax);
  }
  const confidence = clampUnit(Number.isFinite(args.currentMax) ? (args.currentMax as number) : 0);
  return Math.min(Math.max(clampedBase * (1 - confidence), 0), lodMax);
}

export function resolveAtlasLinearLodBandCpu(lod: number, lodMax: number): AtlasLinearLodBand {
  const safeMax = Math.max(0, Number.isFinite(lodMax) ? lodMax : 0);
  const safeLod = Math.min(Math.max(Number.isFinite(lod) ? lod : 0, 0), safeMax);
  if (safeLod < 1) {
    return {
      useCoarseSampling: false,
      lowLevel: 0,
      highLevel: 0,
      blend: 0,
    };
  }
  const lowLevel = Math.floor(safeLod);
  const maxSupportedLevel = Math.floor(safeMax);
  const highLevel = Math.min(lowLevel + 1, maxSupportedLevel);
  const blend = highLevel > lowLevel ? clampUnit(safeLod - lowLevel) : 0;
  return {
    useCoarseSampling: true,
    lowLevel,
    highLevel,
    blend,
  };
}

export function computeSkipHierarchyNodeBoundsCpu(args: SkipHierarchyNodeBoundsArgs): SkipHierarchyNodeBounds {
  const safeVolumeSize: [number, number, number] = [
    clampAtLeastOne(args.volumeSize[0]),
    clampAtLeastOne(args.volumeSize[1]),
    clampAtLeastOne(args.volumeSize[2]),
  ];
  const safeGrid: [number, number, number] = [
    clampAtLeastOne(args.grid[0]),
    clampAtLeastOne(args.grid[1]),
    clampAtLeastOne(args.grid[2]),
  ];
  const safeChunkSize: [number, number, number] = [
    clampAtLeastOne(args.chunkSize[0]),
    clampAtLeastOne(args.chunkSize[1]),
    clampAtLeastOne(args.chunkSize[2]),
  ];
  const safeLevel = Math.max(0, Math.floor(Number.isFinite(args.hierarchyLevel) ? args.hierarchyLevel : 0));
  const levelScale = 2 ** safeLevel;
  const nodeSize: [number, number, number] = [
    Math.max(1, safeChunkSize[0] * levelScale),
    Math.max(1, safeChunkSize[1] * levelScale),
    Math.max(1, safeChunkSize[2] * levelScale),
  ];

  const nodeCoords: [number, number, number] = [0, 0, 0];
  const nodeMin: [number, number, number] = [0, 0, 0];
  const nodeMax: [number, number, number] = [0, 0, 0];

  for (let axis = 0; axis < 3; axis += 1) {
    const maxVoxel = Math.max(safeVolumeSize[axis] - 1e-3, 0);
    const voxel = Math.min(Math.max(args.voxelCoords[axis], 0), maxVoxel);
    const maxGridCoord = Math.max(0, Math.floor(safeGrid[axis]) - 1);
    const coord = Math.min(Math.max(Math.floor(voxel / nodeSize[axis]), 0), maxGridCoord);
    nodeCoords[axis] = coord;
    const minCoord = coord * nodeSize[axis];
    nodeMin[axis] = minCoord;
    nodeMax[axis] = Math.min(minCoord + nodeSize[axis], safeVolumeSize[axis]);
  }

  return {
    nodeCoords,
    nodeSize,
    nodeMin,
    nodeMax,
  };
}

export function shouldSkipWithBrickStatsCpu(args: BrickSkipDecisionArgs): boolean {
  if (!args.skipEnabled) {
    return false;
  }
  if (args.occupancy <= 0) {
    return true;
  }
  if (args.brickMaxRaw < args.brickMinRaw) {
    return false;
  }

  const rawCandidate = args.invert ? args.brickMinRaw : args.brickMaxRaw;
  const normalized = normalizeWindowValue(rawCandidate, args.windowMin, args.windowMax);
  const candidate = args.invert ? 1 - normalized : normalized;
  if (candidate <= args.currentMax + 1e-5) {
    return true;
  }
  if (args.isoLowThreshold > -0.5 && candidate <= args.isoLowThreshold + 1e-5) {
    return true;
  }
  return false;
}

export function computeHierarchyNodeExitCpu(args: HierarchyNodeExitArgs): number {
  let exitSteps = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 3; axis += 1) {
    const step = Number.isFinite(args.voxelStep[axis]) ? args.voxelStep[axis] : 0;
    const rayVoxel = Number.isFinite(args.rayVoxelCoords[axis]) ? args.rayVoxelCoords[axis] : 0;
    const nodeMin = Number.isFinite(args.nodeMin[axis]) ? args.nodeMin[axis] : 0;
    const nodeMax = Number.isFinite(args.nodeMax[axis]) ? args.nodeMax[axis] : 0;
    if (step > 1e-6) {
      exitSteps = Math.min(exitSteps, (nodeMax - rayVoxel) / step);
    } else if (step < -1e-6) {
      exitSteps = Math.min(exitSteps, (nodeMin - rayVoxel) / step);
    }
  }
  return exitSteps;
}

function resolveNearestEntryAxisNudge(direction: number): number {
  if (!Number.isFinite(direction) || Math.abs(direction) <= 1e-6) {
    return 0;
  }
  return direction > 0 ? 1e-4 : -1e-4;
}

export function resolveNearestEntryStartCpu(args: NearestEntryStartArgs): NearestEntryStart {
  const safeSize: [number, number, number] = [
    clampAtLeastOne(args.size[0]),
    clampAtLeastOne(args.size[1]),
    clampAtLeastOne(args.size[2]),
  ];
  const safeTraversalSize: [number, number, number] = [
    clampAtLeastOne(args.traversalSize[0]),
    clampAtLeastOne(args.traversalSize[1]),
    clampAtLeastOne(args.traversalSize[2]),
  ];
  const voxelCoords: [number, number, number] = [0, 0, 0];
  const texcoords: [number, number, number] = [0, 0, 0];

  for (let axis = 0; axis < 3; axis += 1) {
    const front = Number.isFinite(args.front[axis]) ? args.front[axis] : -0.5;
    const entryVoxel =
      ((front + 0.5) / safeSize[axis]) * safeTraversalSize[axis] +
      resolveNearestEntryAxisNudge(args.rayDir[axis]);
    const maxVoxel = Math.max(safeTraversalSize[axis] - 1e-4, 0);
    const clampedVoxel = Math.min(Math.max(entryVoxel, 0), maxVoxel);
    voxelCoords[axis] = clampedVoxel;
    texcoords[axis] = clampedVoxel / safeTraversalSize[axis];
  }

  return {
    voxelCoords,
    texcoords,
  };
}

export function initializeNearestDdaAxisCpu(voxelCoord: number, voxelStep: number): NearestDdaAxisInit {
  if (voxelStep > 1e-6) {
    const axisStep = 1;
    const nextBoundary = Math.floor(voxelCoord) + 1;
    return {
      axisStep,
      tMax: Math.max((nextBoundary - voxelCoord) / voxelStep, 0),
      tDelta: 1 / voxelStep,
    };
  }
  if (voxelStep < -1e-6) {
    const axisStep = -1;
    const previousBoundary = Math.floor(voxelCoord);
    return {
      axisStep,
      tMax: Math.max((previousBoundary - voxelCoord) / voxelStep, 0),
      tDelta: 1 / Math.abs(voxelStep),
    };
  }
  return {
    axisStep: 0,
    tMax: Number.POSITIVE_INFINITY,
    tDelta: Number.POSITIVE_INFINITY,
  };
}

function segmentationLabelAtVoxelCpu(
  labels: Uint16Array,
  size: [number, number, number],
  voxelCoords: [number, number, number],
): number {
  const safeSize: [number, number, number] = [
    clampAtLeastOne(size[0]),
    clampAtLeastOne(size[1]),
    clampAtLeastOne(size[2]),
  ];
  const x = Math.min(Math.max(Math.floor(voxelCoords[0]), 0), safeSize[0] - 1);
  const y = Math.min(Math.max(Math.floor(voxelCoords[1]), 0), safeSize[1] - 1);
  const z = Math.min(Math.max(Math.floor(voxelCoords[2]), 0), safeSize[2] - 1);
  const index = x + safeSize[0] * (y + safeSize[1] * z);
  return labels[index] ?? 0;
}

export function sampleSegmentationNearestLabelCpu(args: SegmentationNearestLabelArgs): number {
  const safeTexcoords: [number, number, number] = [
    clampUnit(Number.isFinite(args.texcoords[0]) ? args.texcoords[0] : 0),
    clampUnit(Number.isFinite(args.texcoords[1]) ? args.texcoords[1] : 0),
    clampUnit(Number.isFinite(args.texcoords[2]) ? args.texcoords[2] : 0),
  ];
  const safeSize: [number, number, number] = [
    clampAtLeastOne(args.size[0]),
    clampAtLeastOne(args.size[1]),
    clampAtLeastOne(args.size[2]),
  ];
  return segmentationLabelAtVoxelCpu(args.labels, safeSize, [
    Math.floor(safeTexcoords[0] * safeSize[0]),
    Math.floor(safeTexcoords[1] * safeSize[1]),
    Math.floor(safeTexcoords[2] * safeSize[2]),
  ]);
}

export function sampleSegmentationOccupancyCpu(args: SegmentationFieldSampleArgs): number {
  if (args.samplingMode === 'nearest') {
    return sampleSegmentationNearestLabelCpu(args) > 0 ? 1 : 0;
  }

  const safeTexcoords: [number, number, number] = [
    clampUnit(Number.isFinite(args.texcoords[0]) ? args.texcoords[0] : 0),
    clampUnit(Number.isFinite(args.texcoords[1]) ? args.texcoords[1] : 0),
    clampUnit(Number.isFinite(args.texcoords[2]) ? args.texcoords[2] : 0),
  ];
  const safeSize: [number, number, number] = [
    clampAtLeastOne(args.size[0]),
    clampAtLeastOne(args.size[1]),
    clampAtLeastOne(args.size[2]),
  ];
  const linearVoxel: [number, number, number] = [
    safeTexcoords[0] * safeSize[0] - 0.5,
    safeTexcoords[1] * safeSize[1] - 0.5,
    safeTexcoords[2] * safeSize[2] - 0.5,
  ];
  const baseVoxel: [number, number, number] = [
    Math.floor(linearVoxel[0]),
    Math.floor(linearVoxel[1]),
    Math.floor(linearVoxel[2]),
  ];
  const frac: [number, number, number] = [
    clampUnit(linearVoxel[0] - baseVoxel[0]),
    clampUnit(linearVoxel[1] - baseVoxel[1]),
    clampUnit(linearVoxel[2] - baseVoxel[2]),
  ];
  let occupancy = 0;
  for (let dz = 0; dz <= 1; dz += 1) {
    for (let dy = 0; dy <= 1; dy += 1) {
      for (let dx = 0; dx <= 1; dx += 1) {
        const label = segmentationLabelAtVoxelCpu(args.labels, safeSize, [
          baseVoxel[0] + dx,
          baseVoxel[1] + dy,
          baseVoxel[2] + dz,
        ]);
        const wx = dx === 0 ? 1 - frac[0] : frac[0];
        const wy = dy === 0 ? 1 - frac[1] : frac[1];
        const wz = dz === 0 ? 1 - frac[2] : frac[2];
        occupancy += (label > 0 ? 1 : 0) * wx * wy * wz;
      }
    }
  }
  return occupancy;
}

type VolumeUniforms = {
  u_size: { value: Vector3 };
  u_renderstyle: { value: number };
  u_blDensityScale: { value: number };
  u_blBackgroundCutoff: { value: number };
  u_blOpacityScale: { value: number };
  u_blEarlyExitAlpha: { value: number };
  u_blRefinementEnabled: { value: number };
  u_mipEarlyExitThreshold: { value: number };
  u_renderthreshold: { value: number };
  u_clim: { value: Vector2 };
  u_data: { value: Data3DTexture | null };
  u_cmdata: { value: DataTexture | null };
  u_isSegmentation: { value: number };
  u_segmentationPalette: { value: DataTexture | null };
  u_channels: { value: number };
  u_additive: { value: number };
  u_cameraPos: { value: Vector3 };
  u_windowMin: { value: number };
  u_windowMax: { value: number };
  u_invert: { value: number };
  u_stepScale: { value: number };
  u_zClipFront: { value: number };
  u_nearestSampling: { value: number };
  u_hoverPos: { value: Vector3 };
  u_hoverScale: { value: Vector3 };
  u_hoverRadius: { value: number };
  u_hoverActive: { value: number };
  u_hoverPulse: { value: number };
  u_hoverLabel: { value: number };
  u_hoverSegmentationMode: { value: number };
  u_segmentationLabels: { value: Data3DTexture | null };
  u_segmentationVolumeSize: { value: Vector3 };
  u_segmentationBrickAtlasData: { value: Data3DTexture | null };
  u_backgroundMaskEnabled: { value: number };
  u_backgroundMask: { value: Data3DTexture | null };
  u_backgroundMaskSize: { value: Vector3 };
  u_backgroundMaskVisibleBoundsEnabled: { value: number };
  u_backgroundMaskVisibleBoxMin: { value: Vector3 };
  u_backgroundMaskVisibleBoxMax: { value: Vector3 };
  u_brickSkipEnabled: { value: number };
  u_skipHierarchyData: { value: Data3DTexture | null };
  u_skipHierarchyTextureSize: { value: Vector3 };
  u_skipHierarchyLevelCount: { value: number };
  u_skipHierarchyLevelMeta: { value: Vector4[] };
  u_brickGridSize: { value: Vector3 };
  u_brickChunkSize: { value: Vector3 };
  u_brickVolumeSize: { value: Vector3 };
  u_brickOccupancy: { value: Data3DTexture | null };
  u_brickMin: { value: Data3DTexture | null };
  u_brickMax: { value: Data3DTexture | null };
  u_brickAtlasIndices: { value: Data3DTexture | null };
  u_brickAtlasBase: { value: Data3DTexture | null };
  u_brickAtlasEnabled: { value: number };
  u_brickAtlasData: { value: Data3DTexture | null };
  u_brickAtlasSize: { value: Vector3 };
  u_brickAtlasSlotGrid: { value: Vector3 };
  u_brickSubcellData: { value: Data3DTexture | null };
  u_brickSubcellGrid: { value: Vector3 };
  u_adaptiveLodEnabled: { value: number };
  u_adaptiveLodScale: { value: number };
  u_adaptiveLodMax: { value: number };
};

const uniforms = {
  u_size: { value: new Vector3(1, 1, 1) },
  u_renderstyle: { value: 0 },
  u_blDensityScale: { value: 1 },
  u_blBackgroundCutoff: { value: 0.08 },
  u_blOpacityScale: { value: 1 },
  u_blEarlyExitAlpha: { value: 0.98 },
  u_blRefinementEnabled: { value: 1 },
  u_mipEarlyExitThreshold: { value: 0.999 },
  u_renderthreshold: { value: 0.5 },
  u_clim: { value: new Vector2(1, 1) },
  u_data: { value: null as Data3DTexture | null },
  u_cmdata: { value: null as DataTexture | null },
  u_isSegmentation: { value: 0 },
  u_segmentationPalette: { value: null as DataTexture | null },
  u_channels: { value: 1 },
  u_additive: { value: 0 },
  u_cameraPos: { value: new Vector3() },
  u_windowMin: { value: 0 },
  u_windowMax: { value: 1 },
  u_invert: { value: 0 },
  u_stepScale: { value: 1 },
  u_zClipFront: { value: 0 },
  u_nearestSampling: { value: 0 },
  u_hoverPos: { value: new Vector3() },
  u_hoverScale: { value: new Vector3() },
  u_hoverRadius: { value: 0 },
  u_hoverActive: { value: 0 },
  u_hoverPulse: { value: 0 },
  u_hoverLabel: { value: 0 },
  u_hoverSegmentationMode: { value: 0 },
  u_segmentationLabels: { value: null as Data3DTexture | null },
  u_segmentationVolumeSize: { value: new Vector3(1, 1, 1) },
  u_segmentationBrickAtlasData: { value: null as Data3DTexture | null },
  u_backgroundMaskEnabled: { value: 0 },
  u_backgroundMask: { value: null as Data3DTexture | null },
  u_backgroundMaskSize: { value: new Vector3(1, 1, 1) },
  u_backgroundMaskVisibleBoundsEnabled: { value: 0 },
  u_backgroundMaskVisibleBoxMin: { value: new Vector3(-0.5, -0.5, -0.5) },
  u_backgroundMaskVisibleBoxMax: { value: new Vector3(0.5, 0.5, 0.5) },
  u_brickSkipEnabled: { value: 0 },
  u_skipHierarchyData: { value: null as Data3DTexture | null },
  u_skipHierarchyTextureSize: { value: new Vector3(1, 1, 1) },
  u_skipHierarchyLevelCount: { value: 0 },
  u_skipHierarchyLevelMeta: { value: Array.from({ length: 12 }, () => new Vector4(1, 1, 1, 0)) },
  u_brickGridSize: { value: new Vector3(1, 1, 1) },
  u_brickChunkSize: { value: new Vector3(1, 1, 1) },
  u_brickVolumeSize: { value: new Vector3(1, 1, 1) },
  u_brickOccupancy: { value: null as Data3DTexture | null },
  u_brickMin: { value: null as Data3DTexture | null },
  u_brickMax: { value: null as Data3DTexture | null },
  u_brickAtlasIndices: { value: null as Data3DTexture | null },
  u_brickAtlasBase: { value: null as Data3DTexture | null },
  u_brickAtlasEnabled: { value: 0 },
  u_brickAtlasData: { value: null as Data3DTexture | null },
  u_brickAtlasSize: { value: new Vector3(1, 1, 1) },
  u_brickAtlasSlotGrid: { value: new Vector3(1, 1, 1) },
  u_brickSubcellData: { value: null as Data3DTexture | null },
  u_brickSubcellGrid: { value: new Vector3(1, 1, 1) },
  u_adaptiveLodEnabled: { value: 1 },
  u_adaptiveLodScale: { value: 1 },
  u_adaptiveLodMax: { value: 2 }
} satisfies VolumeUniforms;

const volumeRenderVertexShader = /* glsl */ `
    varying vec4 v_nearpos;
    varying vec4 v_farpos;
    varying vec3 v_position;

    void main() {
      mat4 viewtransformf = modelViewMatrix;
      mat4 viewtransformi = inverse(modelViewMatrix);

      vec4 position4 = vec4(position, 1.0);
      vec4 pos_in_cam = viewtransformf * position4;

      pos_in_cam.z = -pos_in_cam.w;
      v_nearpos = viewtransformi * pos_in_cam;

      pos_in_cam.z = pos_in_cam.w;
      v_farpos = viewtransformi * pos_in_cam;

      v_position = position;
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * position4;
    }
  `;

const volumeRenderFragmentShader = /* glsl */ `
    precision highp float;
    precision mediump sampler3D;
    precision mediump usampler3D;

    uniform vec3 u_size;
    uniform int u_renderstyle;
    uniform float u_blDensityScale;
    uniform float u_blBackgroundCutoff;
    uniform float u_blOpacityScale;
    uniform float u_blEarlyExitAlpha;
    uniform float u_blRefinementEnabled;
    uniform float u_mipEarlyExitThreshold;
    uniform float u_renderthreshold;
    uniform vec2 u_clim;
    uniform float u_isSegmentation;
    uniform int u_channels;
    uniform float u_additive;
    uniform float u_windowMin;
    uniform float u_windowMax;
    uniform float u_invert;
    uniform float u_stepScale;
    uniform float u_zClipFront;
    uniform float u_nearestSampling;
    uniform vec3 u_hoverPos;
    uniform vec3 u_hoverScale;
    uniform float u_hoverRadius;
    uniform float u_hoverActive;
    uniform float u_hoverPulse;
    uniform float u_hoverLabel;
    uniform float u_hoverSegmentationMode;
    uniform sampler3D u_segmentationLabels;
    uniform vec3 u_segmentationVolumeSize;
    uniform sampler3D u_segmentationBrickAtlasData;
    uniform sampler2D u_segmentationPalette;
    uniform float u_backgroundMaskEnabled;
    uniform sampler3D u_backgroundMask;
    uniform vec3 u_backgroundMaskSize;
    uniform float u_backgroundMaskVisibleBoundsEnabled;
    uniform vec3 u_backgroundMaskVisibleBoxMin;
    uniform vec3 u_backgroundMaskVisibleBoxMax;
    uniform float u_brickSkipEnabled;
    uniform sampler3D u_skipHierarchyData;
    uniform vec3 u_skipHierarchyTextureSize;
    uniform float u_skipHierarchyLevelCount;
    uniform vec4 u_skipHierarchyLevelMeta[12];
    uniform vec3 u_brickGridSize;
    uniform vec3 u_brickChunkSize;
    uniform vec3 u_brickVolumeSize;
    uniform sampler3D u_brickOccupancy;
    uniform sampler3D u_brickMin;
    uniform sampler3D u_brickMax;
    uniform sampler3D u_brickAtlasIndices;
    uniform sampler3D u_brickAtlasBase;
    uniform float u_brickAtlasEnabled;
    uniform sampler3D u_brickAtlasData;
    uniform vec3 u_brickAtlasSize;
    uniform vec3 u_brickAtlasSlotGrid;
    uniform sampler3D u_brickSubcellData;
    uniform vec3 u_brickSubcellGrid;
    uniform float u_adaptiveLodEnabled;
    uniform float u_adaptiveLodScale;
    uniform float u_adaptiveLodMax;

    uniform sampler3D u_data;
    uniform sampler2D u_cmdata;
    uniform vec3 u_cameraPos;

    varying vec3 v_position;
    varying vec4 v_nearpos;
    varying vec4 v_farpos;

    const int MAX_STEPS = 887;
    const int MAX_SEGMENTATION_STEPS = 4096;
    const int MAX_SKIP_HIERARCHY_LEVELS = 12;
    const int REFINEMENT_STEPS = 4;
    const int SEGMENTATION_SURFACE_REFINEMENT_STEPS = 5;
    const float NEAREST_DDA_CLOSEUP_MAX_FOOTPRINT = 0.85;
    const float NEAREST_DDA_ADVANCE_EPSILON = 1e-4;
    const float EPSILON = 1e-6;
    const float LARGE = 1e20;
    const vec2 SEGMENTATION_PALETTE_DIMENSIONS = vec2(256.0, 256.0);
    const float shininess = 40.0;
    const float ambientStrength = 0.2;
    const float diffuseStrength = 0.8;
    const vec3 specularColor = vec3(1.0);

    #if defined(VOLUME_STYLE_ISO)
      vec4 add_lighting(float val, vec3 loc, vec3 step, vec3 view_ray, vec4 sampleColor);
    #endif
    #if defined(VOLUME_STYLE_MIP)
      void cast_mip(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray);
    #endif
    void cast_segmentation(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray);
    #if defined(VOLUME_STYLE_ISO)
      void cast_iso(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray);
    #endif
    #if defined(VOLUME_STYLE_BL)
      void cast_bl(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray);
    #endif
    float normalize_intensity(float value);
    float apply_inversion(float normalized);

    bool should_skip_with_brick_stats_values(
      float occupancy,
      float brickMinRaw,
      float brickMaxRaw,
      float currentMax,
      float isoLowThreshold
    ) {
      if (occupancy <= 0.0) {
        return true;
      }
      if (brickMaxRaw < brickMinRaw) {
        return false;
      }

      float brickCandidateMax = u_invert > 0.5
        ? apply_inversion(normalize_intensity(brickMinRaw))
        : apply_inversion(normalize_intensity(brickMaxRaw));
      if (brickCandidateMax <= currentMax + 1e-5) {
        return true;
      }
      if (isoLowThreshold > -0.5 && brickCandidateMax <= isoLowThreshold + 1e-5) {
        return true;
      }
      return false;
    }

    bool hierarchy_voxel_within_node_bounds(vec3 voxelCoords, vec3 nodeMin, vec3 nodeMax) {
      vec3 safeNodeMax = max(nodeMin, nodeMax - vec3(1e-4));
      return all(greaterThanEqual(voxelCoords, nodeMin)) && all(lessThanEqual(voxelCoords, safeNodeMax));
    }

    float hierarchy_node_exit_t(vec3 voxelCoords, vec3 voxelStep, vec3 nodeMin, vec3 nodeMax) {
      float exitSteps = LARGE;
      if (voxelStep.x > EPSILON) {
        exitSteps = min(exitSteps, (nodeMax.x - voxelCoords.x) / voxelStep.x);
      } else if (voxelStep.x < -EPSILON) {
        exitSteps = min(exitSteps, (nodeMin.x - voxelCoords.x) / voxelStep.x);
      }
      if (voxelStep.y > EPSILON) {
        exitSteps = min(exitSteps, (nodeMax.y - voxelCoords.y) / voxelStep.y);
      } else if (voxelStep.y < -EPSILON) {
        exitSteps = min(exitSteps, (nodeMin.y - voxelCoords.y) / voxelStep.y);
      }
      if (voxelStep.z > EPSILON) {
        exitSteps = min(exitSteps, (nodeMax.z - voxelCoords.z) / voxelStep.z);
      } else if (voxelStep.z < -EPSILON) {
        exitSteps = min(exitSteps, (nodeMin.z - voxelCoords.z) / voxelStep.z);
      }
      return exitSteps;
    }

    int hierarchy_skip_steps_to_node_exit(vec3 voxelCoords, vec3 voxelStep, vec3 nodeMin, vec3 nodeMax) {
      float exitSteps = hierarchy_node_exit_t(voxelCoords, voxelStep, nodeMin, nodeMax);
      if (exitSteps > 1e-4 && exitSteps < LARGE * 0.5) {
        int skipSteps = int(clamp(floor(exitSteps + 1e-4) + 1.0, 1.0, float(MAX_STEPS)));
        return max(skipSteps, 1);
      }
      return 1;
    }

    int hierarchy_skip_step_advance_from_voxel_state(
      vec3 voxelCoords,
      vec3 voxelStep,
      vec3 hierarchyTextureSize,
      vec3 safeVolumeSize,
      vec3 safeChunkSize,
      int levelCount,
      float currentMax,
      float isoLowThreshold,
      inout float traversalCacheValid,
      inout vec3 traversalNodeMin,
      inout vec3 traversalNodeMax,
      inout float traversalNodeSkippable,
      inout float traversalNodeCurrentMax,
      inout float traversalNodeIsoLowThreshold
    ) {
      bool cachedTraversalValid = traversalCacheValid > 0.5;
      if (cachedTraversalValid) {
        bool insideCachedNode = hierarchy_voxel_within_node_bounds(voxelCoords, traversalNodeMin, traversalNodeMax);
        bool thresholdChanged =
          abs(traversalNodeCurrentMax - currentMax) > 1e-5 ||
          abs(traversalNodeIsoLowThreshold - isoLowThreshold) > 1e-5;
        if (insideCachedNode) {
          if (traversalNodeSkippable > 0.5) {
            int cachedSkipSteps = hierarchy_skip_steps_to_node_exit(
              voxelCoords,
              voxelStep,
              traversalNodeMin,
              traversalNodeMax
            );
            if (cachedSkipSteps > 1) {
              return cachedSkipSteps;
            }
            traversalCacheValid = 0.0;
          } else if (!thresholdChanged) {
            return 1;
          } else {
            traversalCacheValid = 0.0;
          }
        } else {
          traversalCacheValid = 0.0;
        }
      }

      for (int hierarchyLevel = MAX_SKIP_HIERARCHY_LEVELS - 1; hierarchyLevel >= 0; hierarchyLevel--) {
        if (hierarchyLevel >= levelCount) {
          continue;
        }
        vec4 levelMeta = u_skipHierarchyLevelMeta[hierarchyLevel];
        vec3 grid = max(levelMeta.xyz, vec3(1.0));
        float zBase = levelMeta.w;
        float levelScale = exp2(float(hierarchyLevel));
        vec3 nodeSize = max(vec3(1.0), safeChunkSize * levelScale);
        vec3 nodeCoords = floor(voxelCoords / nodeSize);
        nodeCoords = clamp(nodeCoords, vec3(0.0), grid - vec3(1.0));
        vec3 nodeMin = nodeCoords * nodeSize;
        vec3 nodeMax = min(nodeMin + nodeSize, safeVolumeSize);
        vec4 hierarchyStats = texelFetch(
          u_skipHierarchyData,
          ivec3(nodeCoords.x, nodeCoords.y, zBase + nodeCoords.z),
          0
        );
        if (!should_skip_with_brick_stats_values(
          hierarchyStats.r,
          hierarchyStats.g,
          hierarchyStats.b,
          currentMax,
          isoLowThreshold
        )) {
          if (hierarchyLevel == 0) {
            traversalCacheValid = 1.0;
            traversalNodeMin = nodeMin;
            traversalNodeMax = nodeMax;
            traversalNodeSkippable = 0.0;
            traversalNodeCurrentMax = currentMax;
            traversalNodeIsoLowThreshold = isoLowThreshold;
          }
          continue;
        }
        traversalCacheValid = 1.0;
        traversalNodeMin = nodeMin;
        traversalNodeMax = nodeMax;
        traversalNodeSkippable = 1.0;
        traversalNodeCurrentMax = currentMax;
        traversalNodeIsoLowThreshold = isoLowThreshold;
        return hierarchy_skip_steps_to_node_exit(voxelCoords, voxelStep, nodeMin, nodeMax);
      }
      return 1;
    }

    int hierarchy_skip_step_advance(
      vec3 texcoords,
      vec3 step,
      float currentMax,
      float isoLowThreshold,
      inout float traversalCacheValid,
      inout vec3 traversalNodeMin,
      inout vec3 traversalNodeMax,
      inout float traversalNodeSkippable,
      inout float traversalNodeCurrentMax,
      inout float traversalNodeIsoLowThreshold
    ) {
      if (u_brickSkipEnabled <= 0.5) {
        return 1;
      }
      int levelCount = int(clamp(floor(u_skipHierarchyLevelCount + 0.5), 0.0, float(MAX_SKIP_HIERARCHY_LEVELS)));
      if (levelCount <= 0) {
        return 1;
      }
      vec3 hierarchyTextureSize = max(u_skipHierarchyTextureSize, vec3(1.0));
      vec3 safeVolumeSize = max(u_brickVolumeSize, vec3(1.0));
      vec3 safeChunkSize = max(u_brickChunkSize, vec3(1.0));
      vec3 voxelCoords = clamp(
        texcoords * safeVolumeSize,
        vec3(0.0),
        max(safeVolumeSize - vec3(1e-3), vec3(0.0))
      );
      vec3 voxelStep = step * safeVolumeSize;
      return hierarchy_skip_step_advance_from_voxel_state(
        voxelCoords,
        voxelStep,
        hierarchyTextureSize,
        safeVolumeSize,
        safeChunkSize,
        levelCount,
        currentMax,
        isoLowThreshold,
        traversalCacheValid,
        traversalNodeMin,
        traversalNodeMax,
        traversalNodeSkippable,
        traversalNodeCurrentMax,
        traversalNodeIsoLowThreshold
      );
    }

    int hierarchy_skip_step_advance_voxel(
      vec3 sampleVoxelCoords,
      vec3 sampleToHierarchyScale,
      vec3 hierarchyVoxelStep,
      vec3 hierarchyTextureSize,
      vec3 hierarchyVolumeSize,
      vec3 hierarchyChunkSize,
      int levelCount,
      float currentMax,
      float isoLowThreshold,
      inout float traversalCacheValid,
      inout vec3 traversalNodeMin,
      inout vec3 traversalNodeMax,
      inout float traversalNodeSkippable,
      inout float traversalNodeCurrentMax,
      inout float traversalNodeIsoLowThreshold
    ) {
      if (levelCount <= 0) {
        return 1;
      }
      vec3 voxelCoords = clamp(
        (sampleVoxelCoords + vec3(0.5)) * sampleToHierarchyScale,
        vec3(0.0),
        max(hierarchyVolumeSize - vec3(1e-3), vec3(0.0))
      );
      return hierarchy_skip_step_advance_from_voxel_state(
        voxelCoords,
        hierarchyVoxelStep,
        hierarchyTextureSize,
        hierarchyVolumeSize,
        hierarchyChunkSize,
        levelCount,
        currentMax,
        isoLowThreshold,
        traversalCacheValid,
        traversalNodeMin,
        traversalNodeMax,
        traversalNodeSkippable,
        traversalNodeCurrentMax,
        traversalNodeIsoLowThreshold
      );
    }

    vec3 clamp_voxel_coords(vec3 voxelCoords, vec3 atlasVolumeSize) {
      return clamp(voxelCoords, vec3(0.0), max(atlasVolumeSize - vec3(1.0), vec3(0.0)));
    }

    vec3 brick_coords_for_voxel(vec3 voxelCoords, vec3 safeGrid, vec3 safeChunk, vec3 atlasVolumeSize) {
      vec3 clampedVoxel = clamp_voxel_coords(voxelCoords, atlasVolumeSize);
      vec3 brickCoords = floor(clampedVoxel / safeChunk);
      return clamp(brickCoords, vec3(0.0), safeGrid - vec3(1.0));
    }

    ivec3 brick_texture_coords(vec3 brickCoords, vec3 safeGrid) {
      vec3 clampedBrickCoords = clamp(
        floor(brickCoords + vec3(0.5)),
        vec3(0.0),
        max(safeGrid - vec3(1.0), vec3(0.0))
      );
      return ivec3(clampedBrickCoords);
    }

    float atlas_index_for_brick(vec3 brickCoords, vec3 safeGrid) {
      return texelFetch(u_brickAtlasIndices, brick_texture_coords(brickCoords, safeGrid), 0).r - 1.0;
    }

    vec4 atlas_base_for_brick(vec3 brickCoords, vec3 safeGrid) {
      return texelFetch(u_brickAtlasBase, brick_texture_coords(brickCoords, safeGrid), 0);
    }

    vec4 sample_brick_atlas_voxel_known_base(
      vec3 voxelCoords,
      vec3 brickCoords,
      vec3 atlasBaseTexel,
      vec3 safeChunk,
      vec3 atlasVolumeSize
    ) {
      vec3 clampedVoxel = clamp_voxel_coords(voxelCoords, atlasVolumeSize);
      vec3 localVoxel = clampedVoxel - brickCoords * safeChunk;
      vec3 atlasVoxel = localVoxel + atlasBaseTexel;
      vec3 atlasSize = max(u_brickAtlasSize, vec3(1.0));
      ivec3 maxAtlasTexel = ivec3(max(atlasSize - vec3(1.0), vec3(0.0)));
      ivec3 atlasTexel = ivec3(
        clamp(
          floor(atlasVoxel + vec3(0.5)),
          vec3(0.0),
          vec3(maxAtlasTexel)
        )
      );
      return texelFetch(u_brickAtlasData, atlasTexel, 0);
    }

    bool brick_coords_equal(vec3 a, vec3 b) {
      return all(lessThan(abs(a - b), vec3(0.5)));
    }

    vec3 brick_corner_coords(vec3 lowBrick, vec3 highBrick, vec3 cornerMask) {
      return mix(lowBrick, highBrick, cornerMask);
    }

    vec4 sample_brick_atlas_voxel_or_missing_base(
      vec3 voxelCoords,
      vec3 brickCoords,
      vec4 atlasBaseInfo,
      vec3 safeChunk,
      vec3 atlasVolumeSize
    ) {
      if (atlasBaseInfo.a < 0.5) {
        return vec4(0.0);
      }
      return sample_brick_atlas_voxel_known_base(
        voxelCoords,
        brickCoords,
        atlasBaseInfo.rgb,
        safeChunk,
        atlasVolumeSize
      );
    }

    vec4 sample_brick_atlas_voxel_with(vec3 voxelCoords, vec3 safeGrid, vec3 safeChunk) {
      vec3 atlasVolumeSize = max(u_brickVolumeSize, vec3(1.0));
      vec3 brickCoords = brick_coords_for_voxel(voxelCoords, safeGrid, safeChunk, atlasVolumeSize);
      vec4 atlasBaseInfo = atlas_base_for_brick(brickCoords, safeGrid);
      return sample_brick_atlas_voxel_or_missing_base(
        voxelCoords,
        brickCoords,
        atlasBaseInfo,
        safeChunk,
        atlasVolumeSize
      );
    }

    vec4 sample_brick_atlas_voxel(vec3 voxelCoords) {
      vec3 safeGrid = max(u_brickGridSize, vec3(1.0));
      vec3 safeChunk = max(u_brickChunkSize, vec3(1.0));
      return sample_brick_atlas_voxel_with(voxelCoords, safeGrid, safeChunk);
    }

    vec4 sample_brick_atlas_linear_same_brick_base(
      vec3 texcoords,
      vec3 brickCoords,
      vec3 atlasBaseTexel,
      vec3 safeChunk,
      vec3 atlasVolumeSize
    ) {
      vec3 safeTexcoords = clamp(texcoords, vec3(0.0), vec3(1.0));
      vec3 linearVoxel = safeTexcoords * atlasVolumeSize - vec3(0.5);
      vec3 clampedLinearVoxel = clamp_voxel_coords(linearVoxel, atlasVolumeSize);
      vec3 localLinearVoxel = clampedLinearVoxel - brickCoords * safeChunk;
      vec3 atlasLinearVoxel = localLinearVoxel + atlasBaseTexel;
      vec3 atlasSize = max(u_brickAtlasSize, vec3(1.0));
      vec3 atlasTexcoords = (atlasLinearVoxel + vec3(0.5)) / atlasSize;
      return texture(u_brickAtlasData, atlasTexcoords);
    }

    vec4 sample_brick_atlas_linear(vec3 texcoords) {
      vec3 safeTexcoords = clamp(texcoords, vec3(0.0), vec3(1.0));
      vec3 atlasVolumeSize = max(u_brickVolumeSize, vec3(1.0));
      vec3 linearCoord = safeTexcoords * atlasVolumeSize - vec3(0.5);
      vec3 baseVoxel = floor(linearCoord);
      vec3 frac = clamp(linearCoord - baseVoxel, vec3(0.0), vec3(1.0));
      vec3 safeGrid = max(u_brickGridSize, vec3(1.0));
      vec3 safeChunk = max(u_brickChunkSize, vec3(1.0));
      vec3 atlasSize = max(u_brickAtlasSize, vec3(1.0));
      vec3 safeSlotGrid = max(u_brickAtlasSlotGrid, vec3(1.0));
      vec3 atlasChunk = max(atlasSize / safeSlotGrid, vec3(1.0));
      bool hasAtlasHalo = any(greaterThan(atlasChunk - safeChunk, vec3(0.5)));
      vec3 voxel000 = baseVoxel + vec3(0.0, 0.0, 0.0);
      vec3 voxel100 = baseVoxel + vec3(1.0, 0.0, 0.0);
      vec3 voxel010 = baseVoxel + vec3(0.0, 1.0, 0.0);
      vec3 voxel110 = baseVoxel + vec3(1.0, 1.0, 0.0);
      vec3 voxel001 = baseVoxel + vec3(0.0, 0.0, 1.0);
      vec3 voxel101 = baseVoxel + vec3(1.0, 0.0, 1.0);
      vec3 voxel011 = baseVoxel + vec3(0.0, 1.0, 1.0);
      vec3 voxel111 = baseVoxel + vec3(1.0, 1.0, 1.0);

      // Degenerate trilinear case: exact voxel-center sampling.
      if (frac.x <= 0.0 && frac.y <= 0.0 && frac.z <= 0.0) {
        return sample_brick_atlas_voxel_with(voxel000, safeGrid, safeChunk);
      }

      // Fast path: if all trilinear corner samples stay in one brick, resolve atlas index once.
      vec3 baseBrick = brick_coords_for_voxel(voxel000, safeGrid, safeChunk, atlasVolumeSize);
      vec3 farBrick = brick_coords_for_voxel(voxel111, safeGrid, safeChunk, atlasVolumeSize);
      if (hasAtlasHalo) {
        vec4 atlasBaseInfo = atlas_base_for_brick(baseBrick, safeGrid);
        if (atlasBaseInfo.a >= 0.5) {
          return sample_brick_atlas_linear_same_brick_base(
            safeTexcoords,
            baseBrick,
            atlasBaseInfo.rgb,
            safeChunk,
            atlasVolumeSize
          );
        }
      }
      if (brick_coords_equal(baseBrick, farBrick)) {
        vec4 atlasBaseInfo = atlas_base_for_brick(baseBrick, safeGrid);
        if (atlasBaseInfo.a < 0.5) {
          return vec4(0.0);
        }
        // Within one brick we can use the hardware trilinear filter directly.
        return sample_brick_atlas_linear_same_brick_base(
          safeTexcoords,
          baseBrick,
          atlasBaseInfo.rgb,
          safeChunk,
          atlasVolumeSize
        );
      }

      vec3 spanMask = step(vec3(0.5), abs(farBrick - baseBrick));
      vec3 brick000 = baseBrick;
      vec3 brick100 = brick_corner_coords(baseBrick, farBrick, vec3(1.0, 0.0, 0.0));
      vec3 brick010 = brick_corner_coords(baseBrick, farBrick, vec3(0.0, 1.0, 0.0));
      vec3 brick110 = brick_corner_coords(baseBrick, farBrick, vec3(1.0, 1.0, 0.0));
      vec3 brick001 = brick_corner_coords(baseBrick, farBrick, vec3(0.0, 0.0, 1.0));
      vec3 brick101 = brick_corner_coords(baseBrick, farBrick, vec3(1.0, 0.0, 1.0));
      vec3 brick011 = brick_corner_coords(baseBrick, farBrick, vec3(0.0, 1.0, 1.0));
      vec3 brick111 = farBrick;
      float spanX = spanMask.x;
      float spanY = spanMask.y;
      float spanZ = spanMask.z;

      vec4 atlas000 = atlas_base_for_brick(brick000, safeGrid);
      vec4 atlas100 = spanX > 0.5 ? atlas_base_for_brick(brick100, safeGrid) : atlas000;
      vec4 atlas010 = spanY > 0.5 ? atlas_base_for_brick(brick010, safeGrid) : atlas000;
      vec4 atlas001 = spanZ > 0.5 ? atlas_base_for_brick(brick001, safeGrid) : atlas000;
      vec4 atlas110 = atlas000;
      if (spanX > 0.5 && spanY > 0.5) {
        atlas110 = atlas_base_for_brick(brick110, safeGrid);
      } else if (spanX > 0.5) {
        atlas110 = atlas100;
      } else if (spanY > 0.5) {
        atlas110 = atlas010;
      }
      vec4 atlas101 = atlas000;
      if (spanX > 0.5 && spanZ > 0.5) {
        atlas101 = atlas_base_for_brick(brick101, safeGrid);
      } else if (spanX > 0.5) {
        atlas101 = atlas100;
      } else if (spanZ > 0.5) {
        atlas101 = atlas001;
      }
      vec4 atlas011 = atlas000;
      if (spanY > 0.5 && spanZ > 0.5) {
        atlas011 = atlas_base_for_brick(brick011, safeGrid);
      } else if (spanY > 0.5) {
        atlas011 = atlas010;
      } else if (spanZ > 0.5) {
        atlas011 = atlas001;
      }
      vec4 atlas111 = atlas000;
      if (spanX > 0.5) {
        atlas111 = atlas100;
      }
      if (spanY > 0.5) {
        atlas111 = spanX > 0.5 ? atlas110 : atlas010;
      }
      if (spanZ > 0.5) {
        if (spanX > 0.5 && spanY > 0.5) {
          atlas111 = atlas_base_for_brick(brick111, safeGrid);
        } else if (spanX > 0.5) {
          atlas111 = atlas101;
        } else if (spanY > 0.5) {
          atlas111 = atlas011;
        } else {
          atlas111 = atlas001;
        }
      }

      vec4 c000 = sample_brick_atlas_voxel_or_missing_base(
        voxel000,
        brick000,
        atlas000,
        safeChunk,
        atlasVolumeSize
      );
      vec4 c100 = sample_brick_atlas_voxel_or_missing_base(
        voxel100,
        brick100,
        atlas100,
        safeChunk,
        atlasVolumeSize
      );
      vec4 c010 = sample_brick_atlas_voxel_or_missing_base(
        voxel010,
        brick010,
        atlas010,
        safeChunk,
        atlasVolumeSize
      );
      vec4 c110 = sample_brick_atlas_voxel_or_missing_base(
        voxel110,
        brick110,
        atlas110,
        safeChunk,
        atlasVolumeSize
      );
      vec4 c001 = sample_brick_atlas_voxel_or_missing_base(
        voxel001,
        brick001,
        atlas001,
        safeChunk,
        atlasVolumeSize
      );
      vec4 c101 = sample_brick_atlas_voxel_or_missing_base(
        voxel101,
        brick101,
        atlas101,
        safeChunk,
        atlasVolumeSize
      );
      vec4 c011 = sample_brick_atlas_voxel_or_missing_base(
        voxel011,
        brick011,
        atlas011,
        safeChunk,
        atlasVolumeSize
      );
      vec4 c111 = sample_brick_atlas_voxel_or_missing_base(
        voxel111,
        brick111,
        atlas111,
        safeChunk,
        atlasVolumeSize
      );

      float wx0 = 1.0 - frac.x;
      float wy0 = 1.0 - frac.y;
      float wz0 = 1.0 - frac.z;
      float wx1 = frac.x;
      float wy1 = frac.y;
      float wz1 = frac.z;

      float w000 = wx0 * wy0 * wz0;
      float w100 = wx1 * wy0 * wz0;
      float w010 = wx0 * wy1 * wz0;
      float w110 = wx1 * wy1 * wz0;
      float w001 = wx0 * wy0 * wz1;
      float w101 = wx1 * wy0 * wz1;
      float w011 = wx0 * wy1 * wz1;
      float w111 = wx1 * wy1 * wz1;

      float m000 = atlas000.a < 0.5 ? 0.0 : 1.0;
      float m100 = atlas100.a < 0.5 ? 0.0 : 1.0;
      float m010 = atlas010.a < 0.5 ? 0.0 : 1.0;
      float m110 = atlas110.a < 0.5 ? 0.0 : 1.0;
      float m001 = atlas001.a < 0.5 ? 0.0 : 1.0;
      float m101 = atlas101.a < 0.5 ? 0.0 : 1.0;
      float m011 = atlas011.a < 0.5 ? 0.0 : 1.0;
      float m111 = atlas111.a < 0.5 ? 0.0 : 1.0;

      float ww000 = w000 * m000;
      float ww100 = w100 * m100;
      float ww010 = w010 * m010;
      float ww110 = w110 * m110;
      float ww001 = w001 * m001;
      float ww101 = w101 * m101;
      float ww011 = w011 * m011;
      float ww111 = w111 * m111;
      float weightSum = ww000 + ww100 + ww010 + ww110 + ww001 + ww101 + ww011 + ww111;

      if (weightSum <= 1e-6) {
        return vec4(0.0);
      }

      vec4 weighted =
        c000 * ww000 +
        c100 * ww100 +
        c010 * ww010 +
        c110 * ww110 +
        c001 * ww001 +
        c101 * ww101 +
        c011 * ww011 +
        c111 * ww111;
      return weighted / weightSum;
    }

    vec4 sample_brick_atlas_linear_lod(vec3 texcoords, float lod) {
      vec3 safeTexcoords = clamp(texcoords, vec3(0.0), vec3(1.0));
      float safeMaxLod = max(u_adaptiveLodMax, 0.0);
      float safeLod = clamp(lod, 0.0, safeMaxLod);
      if (safeLod < 1.0) {
        // Keep sub-voxel LOD in native trilinear space to avoid distance shimmer.
        return sample_brick_atlas_linear(safeTexcoords);
      }

      float lowLod = floor(safeLod);
      float maxSupportedLod = floor(safeMaxLod);
      float highLod = min(lowLod + 1.0, maxSupportedLod);
      float lodBlend = highLod > lowLod ? clamp(safeLod - lowLod, 0.0, 1.0) : 0.0;

      vec3 atlasVolumeSize = max(u_brickVolumeSize, vec3(1.0));
      float lowVoxelScale = exp2(lowLod);
      vec3 lowVoxel = floor((safeTexcoords * atlasVolumeSize) / lowVoxelScale) * lowVoxelScale;
      vec4 lowSample = sample_brick_atlas_voxel(lowVoxel);
      if (lodBlend <= 1e-3) {
        return lowSample;
      }

      float highVoxelScale = exp2(highLod);
      vec3 highVoxel = floor((safeTexcoords * atlasVolumeSize) / highVoxelScale) * highVoxelScale;
      vec4 highSample = sample_brick_atlas_voxel(highVoxel);
      return mix(lowSample, highSample, lodBlend);
    }

    vec3 brick_subcell_coords_for_local_voxel(vec3 localVoxel, vec3 safeChunk, vec3 subcellGrid) {
      vec3 safeSubcellGrid = max(subcellGrid, vec3(1.0));
      return clamp(
        floor((localVoxel * safeSubcellGrid) / max(safeChunk, vec3(1.0))),
        vec3(0.0),
        safeSubcellGrid - vec3(1.0)
      );
    }

    vec3 brick_subcell_local_min(vec3 subcellCoords, vec3 safeChunk, vec3 subcellGrid) {
      return floor((subcellCoords * safeChunk) / max(subcellGrid, vec3(1.0)));
    }

    vec3 brick_subcell_local_max(vec3 subcellCoords, vec3 safeChunk, vec3 subcellGrid) {
      return min(
        floor(((subcellCoords + vec3(1.0)) * safeChunk) / max(subcellGrid, vec3(1.0))),
        safeChunk
      );
    }

    vec4 brick_subcell_stats_for_coords(vec3 brickCoords, vec3 subcellCoords, vec3 subcellGrid) {
      vec3 textureCoords = brickCoords * subcellGrid + subcellCoords;
      return texelFetch(u_brickSubcellData, ivec3(textureCoords), 0);
    }

    vec4 sample_full_volume_color(vec3 texcoords, float lod) {
      vec3 safeTexcoords = clamp(texcoords, vec3(0.0), vec3(1.0));
      if (u_adaptiveLodEnabled > 0.5 && u_nearestSampling <= 0.5) {
        float safeLod = clamp(lod, 0.0, max(u_adaptiveLodMax, 0.0));
        if (safeLod > 1e-3) {
          return textureLod(u_data, safeTexcoords, safeLod);
        }
      }
      return texture(u_data, safeTexcoords);
    }

    bool is_background_masked(vec3 texcoords) {
      if (u_backgroundMaskEnabled <= 0.5) {
        return false;
      }
      vec3 safeTexcoords = clamp(texcoords, vec3(0.0), vec3(1.0));
      vec3 maskSize = max(u_backgroundMaskSize, vec3(1.0));
      ivec3 maskTexel = ivec3(
        clamp(
          floor(safeTexcoords * maskSize),
          vec3(0.0),
          max(maskSize - vec3(1.0), vec3(0.0))
        )
      );
      return texelFetch(u_backgroundMask, maskTexel, 0).r > 0.5;
    }

    vec4 sample_color_lod(vec3 texcoords, float lod) {
      vec3 safeTexcoords = clamp(texcoords, vec3(0.0), vec3(1.0));
      if (is_background_masked(safeTexcoords)) {
        return vec4(0.0);
      }
      #if defined(VOLUME_NEAREST_VARIANT)
        if (u_brickAtlasEnabled > 0.5) {
          vec3 nearestVoxel = floor(safeTexcoords * max(u_brickVolumeSize, vec3(1.0)));
          return sample_brick_atlas_voxel(nearestVoxel);
        }
        return texture(u_data, safeTexcoords);
      #else
      if (u_brickAtlasEnabled > 0.5) {
        if (u_nearestSampling > 0.5) {
          vec3 nearestVoxel = floor(safeTexcoords * max(u_brickVolumeSize, vec3(1.0)));
          return sample_brick_atlas_voxel(nearestVoxel);
        }
        return sample_brick_atlas_linear_lod(texcoords, lod);
      }
      return sample_full_volume_color(texcoords, lod);
      #endif
    }

    vec4 sample_color(vec3 texcoords) {
      return sample_color_lod(texcoords, 0.0);
    }

    float decode_segmentation_label(vec4 packedLabelSample) {
      float lowByte = floor(clamp(packedLabelSample.r, 0.0, 1.0) * 255.0 + 0.5);
      float highByte = floor(clamp(packedLabelSample.g, 0.0, 1.0) * 255.0 + 0.5);
      return lowByte + highByte * 256.0;
    }

    vec4 segmentation_color_from_label(float labelValue) {
      if (labelValue < 0.5) {
        return vec4(0.0);
      }
      float paletteX = mod(labelValue, SEGMENTATION_PALETTE_DIMENSIONS.x);
      float paletteY = floor(labelValue / SEGMENTATION_PALETTE_DIMENSIONS.x);
      vec2 uv = (vec2(paletteX, paletteY) + vec2(0.5)) / SEGMENTATION_PALETTE_DIMENSIONS;
      return texture2D(u_segmentationPalette, uv);
    }

    float sample_segmentation_brick_atlas_voxel_known_base(
      vec3 voxelCoords,
      vec3 brickCoords,
      vec3 atlasBaseTexel,
      vec3 safeChunk,
      vec3 atlasVolumeSize
    ) {
      vec3 clampedVoxel = clamp_voxel_coords(voxelCoords, atlasVolumeSize);
      vec3 localVoxel = clampedVoxel - brickCoords * safeChunk;
      vec3 atlasVoxel = localVoxel + atlasBaseTexel;
      vec3 atlasSize = max(u_brickAtlasSize, vec3(1.0));
      ivec3 maxAtlasTexel = ivec3(max(atlasSize - vec3(1.0), vec3(0.0)));
      ivec3 atlasTexel = ivec3(
        clamp(
          floor(atlasVoxel + vec3(0.5)),
          vec3(0.0),
          vec3(maxAtlasTexel)
        )
      );
      return decode_segmentation_label(texelFetch(u_segmentationBrickAtlasData, atlasTexel, 0));
    }

    float sample_segmentation_brick_atlas_voxel_or_missing_base(
      vec3 voxelCoords,
      vec3 brickCoords,
      vec4 atlasBaseInfo,
      vec3 safeChunk,
      vec3 atlasVolumeSize
    ) {
      if (atlasBaseInfo.a < 0.5) {
        return 0.0;
      }
      return sample_segmentation_brick_atlas_voxel_known_base(
        voxelCoords,
        brickCoords,
        atlasBaseInfo.rgb,
        safeChunk,
        atlasVolumeSize
      );
    }

    float sample_segmentation_brick_atlas_voxel(vec3 voxelCoords) {
      vec3 safeGrid = max(u_brickGridSize, vec3(1.0));
      vec3 safeChunk = max(u_brickChunkSize, vec3(1.0));
      vec3 atlasVolumeSize = max(u_brickVolumeSize, vec3(1.0));
      vec3 brickCoords = brick_coords_for_voxel(voxelCoords, safeGrid, safeChunk, atlasVolumeSize);
      vec4 atlasBaseInfo = atlas_base_for_brick(brickCoords, safeGrid);
      return sample_segmentation_brick_atlas_voxel_or_missing_base(
        voxelCoords,
        brickCoords,
        atlasBaseInfo,
        safeChunk,
        atlasVolumeSize
      );
    }

    vec3 segmentation_sample_volume_size() {
      if (u_brickAtlasEnabled > 0.5) {
        return max(u_brickVolumeSize, vec3(1.0));
      }
      return max(u_segmentationVolumeSize, vec3(1.0));
    }

    float sample_segmentation_full_volume_label(vec3 texcoords) {
      vec3 safeTexcoords = clamp(texcoords, vec3(0.0), vec3(1.0));
      vec3 safeVolumeSize = max(u_segmentationVolumeSize, vec3(1.0));
      ivec3 labelTexel = ivec3(
        clamp(
          floor(safeTexcoords * safeVolumeSize),
          vec3(0.0),
          max(safeVolumeSize - vec3(1.0), vec3(0.0))
        )
      );
      return decode_segmentation_label(texelFetch(u_segmentationLabels, labelTexel, 0));
    }

    float sample_segmentation_label_at_voxel(vec3 voxelCoords) {
      if (u_brickAtlasEnabled > 0.5) {
        return sample_segmentation_brick_atlas_voxel(voxelCoords);
      }
      vec3 safeVolumeSize = max(u_segmentationVolumeSize, vec3(1.0));
      vec3 clampedVoxel = clamp(floor(voxelCoords + vec3(0.5)), vec3(0.0), safeVolumeSize - vec3(1.0));
      vec3 texcoords = (clampedVoxel + vec3(0.5)) / safeVolumeSize;
      return sample_segmentation_full_volume_label(texcoords);
    }

    float sample_segmentation_label(vec3 texcoords) {
      vec3 safeTexcoords = clamp(texcoords, vec3(0.0), vec3(1.0));
      if (u_brickAtlasEnabled > 0.5) {
        vec3 nearestVoxel = floor(safeTexcoords * max(u_brickVolumeSize, vec3(1.0)));
        return sample_segmentation_brick_atlas_voxel(nearestVoxel);
      }
      return sample_segmentation_full_volume_label(safeTexcoords);
    }

    bool segmentation_texcoords_in_bounds(vec3 texcoords) {
      return all(greaterThanEqual(texcoords, vec3(0.0))) && all(lessThanEqual(texcoords, vec3(1.0)));
    }

    float segmentation_label_to_occupancy(float labelValue) {
      return labelValue > 0.5 ? 1.0 : 0.0;
    }

    float sample_segmentation_occupancy(vec3 texcoords) {
      if (!segmentation_texcoords_in_bounds(texcoords)) {
        return 0.0;
      }
      vec3 safeTexcoords = texcoords;
      if (is_background_masked(safeTexcoords)) {
        return 0.0;
      }
      if (u_nearestSampling > 0.5) {
        return segmentation_label_to_occupancy(sample_segmentation_label(safeTexcoords));
      }

      vec3 sampleVolumeSize = segmentation_sample_volume_size();
      vec3 linearVoxel = safeTexcoords * sampleVolumeSize - vec3(0.5);
      vec3 baseVoxel = floor(linearVoxel);
      vec3 frac = clamp(linearVoxel - baseVoxel, vec3(0.0), vec3(1.0));

      vec3 voxel000 = baseVoxel + vec3(0.0, 0.0, 0.0);
      vec3 voxel100 = baseVoxel + vec3(1.0, 0.0, 0.0);
      vec3 voxel010 = baseVoxel + vec3(0.0, 1.0, 0.0);
      vec3 voxel110 = baseVoxel + vec3(1.0, 1.0, 0.0);
      vec3 voxel001 = baseVoxel + vec3(0.0, 0.0, 1.0);
      vec3 voxel101 = baseVoxel + vec3(1.0, 0.0, 1.0);
      vec3 voxel011 = baseVoxel + vec3(0.0, 1.0, 1.0);
      vec3 voxel111 = baseVoxel + vec3(1.0, 1.0, 1.0);

      float o000 = segmentation_label_to_occupancy(sample_segmentation_label_at_voxel(voxel000));
      float o100 = segmentation_label_to_occupancy(sample_segmentation_label_at_voxel(voxel100));
      float o010 = segmentation_label_to_occupancy(sample_segmentation_label_at_voxel(voxel010));
      float o110 = segmentation_label_to_occupancy(sample_segmentation_label_at_voxel(voxel110));
      float o001 = segmentation_label_to_occupancy(sample_segmentation_label_at_voxel(voxel001));
      float o101 = segmentation_label_to_occupancy(sample_segmentation_label_at_voxel(voxel101));
      float o011 = segmentation_label_to_occupancy(sample_segmentation_label_at_voxel(voxel011));
      float o111 = segmentation_label_to_occupancy(sample_segmentation_label_at_voxel(voxel111));

      float wx0 = 1.0 - frac.x;
      float wy0 = 1.0 - frac.y;
      float wz0 = 1.0 - frac.z;
      float wx1 = frac.x;
      float wy1 = frac.y;
      float wz1 = frac.z;

      return
        o000 * wx0 * wy0 * wz0 +
        o100 * wx1 * wy0 * wz0 +
        o010 * wx0 * wy1 * wz0 +
        o110 * wx1 * wy1 * wz0 +
        o001 * wx0 * wy0 * wz1 +
        o101 * wx1 * wy0 * wz1 +
        o011 * wx0 * wy1 * wz1 +
        o111 * wx1 * wy1 * wz1;
    }

    vec3 segmentation_surface_gradient(vec3 texcoords) {
      vec3 delta = vec3(0.75) / segmentation_sample_volume_size();
      float negX = sample_segmentation_occupancy(texcoords - vec3(delta.x, 0.0, 0.0));
      float posX = sample_segmentation_occupancy(texcoords + vec3(delta.x, 0.0, 0.0));
      float negY = sample_segmentation_occupancy(texcoords - vec3(0.0, delta.y, 0.0));
      float posY = sample_segmentation_occupancy(texcoords + vec3(0.0, delta.y, 0.0));
      float negZ = sample_segmentation_occupancy(texcoords - vec3(0.0, 0.0, delta.z));
      float posZ = sample_segmentation_occupancy(texcoords + vec3(0.0, 0.0, delta.z));
      return vec3(posX - negX, posY - negY, posZ - negZ);
    }

    vec3 segmentation_surface_normal(vec3 texcoords, vec3 view_ray) {
      vec3 gradient = segmentation_surface_gradient(texcoords);
      float gradientMagnitude = length(gradient);
      if (gradientMagnitude <= EPSILON) {
        return vec3(0.0);
      }
      vec3 V = normalize(view_ray);
      if (length(V) <= EPSILON) {
        V = vec3(0.0, 0.0, 1.0);
      }
      vec3 N = normalize(-gradient);
      if (dot(N, V) < 0.0) {
        N = -N;
      }
      return N;
    }

    vec3 segmentation_refine_surface_hit(vec3 outsideLoc, vec3 insideLoc) {
      vec3 low = clamp(outsideLoc, vec3(0.0), vec3(1.0));
      vec3 high = clamp(insideLoc, vec3(0.0), vec3(1.0));
      for (int refineIndex = 0; refineIndex < SEGMENTATION_SURFACE_REFINEMENT_STEPS; refineIndex++) {
        vec3 mid = mix(low, high, 0.5);
        if (sample_segmentation_occupancy(mid) > 0.5) {
          high = mid;
        } else {
          low = mid;
        }
      }
      return high;
    }

    float resolve_segmentation_surface_label(vec3 hitLoc, vec3 step) {
      vec3 stepDir = length(step) > EPSILON ? normalize(step) : vec3(0.0, 0.0, 1.0);
      vec3 sampleVolumeSize = segmentation_sample_volume_size();
      float insideNudge = max(
        length(step) * 1.5,
        0.75 / max(max(sampleVolumeSize.x, sampleVolumeSize.y), sampleVolumeSize.z)
      );
      vec3 insideLoc = clamp(hitLoc + stepDir * insideNudge, vec3(0.0), vec3(1.0));
      float label = sample_segmentation_label(insideLoc);
      if (label <= 0.5) {
        vec3 deeperLoc = clamp(hitLoc + stepDir * insideNudge * 2.0, vec3(0.0), vec3(1.0));
        label = sample_segmentation_label(deeperLoc);
      }
      if (label <= 0.5) {
        label = sample_segmentation_label(hitLoc);
      }
      return label;
    }

    vec4 sample_color_voxel(vec3 voxelCoord) {
      vec3 safeVolumeSize = max(u_size, vec3(1.0));
      vec3 clampedVoxel = clamp(floor(voxelCoord + vec3(0.5)), vec3(0.0), safeVolumeSize - vec3(1.0));
      vec3 texcoords = (clampedVoxel + vec3(0.5)) / safeVolumeSize;
      if (is_background_masked(texcoords)) {
        return vec4(0.0);
      }
      if (u_brickAtlasEnabled > 0.5) {
        vec3 atlasVolumeSize = max(u_brickVolumeSize, vec3(1.0));
        vec3 atlasVoxel = floor(clamp(texcoords, vec3(0.0), vec3(1.0)) * atlasVolumeSize);
        return sample_brick_atlas_voxel(atlasVoxel);
      }
      return texture(u_data, texcoords);
    }

    bool nearest_voxel_in_bounds(vec3 voxelCoords, vec3 volumeSize) {
      return all(greaterThanEqual(voxelCoords, vec3(0.0))) && all(lessThan(voxelCoords, volumeSize));
    }

    void nearest_dda_init_axis(
      float voxelCoord,
      float voxelStep,
      out float axisStep,
      out float tMax,
      out float tDelta
    ) {
      if (voxelStep > EPSILON) {
        axisStep = 1.0;
        float nextBoundary = floor(voxelCoord) + 1.0;
        tMax = max((nextBoundary - voxelCoord) / voxelStep, 0.0);
        tDelta = 1.0 / voxelStep;
        return;
      }
      if (voxelStep < -EPSILON) {
        axisStep = -1.0;
        float previousBoundary = floor(voxelCoord);
        tMax = max((previousBoundary - voxelCoord) / voxelStep, 0.0);
        tDelta = 1.0 / abs(voxelStep);
        return;
      }
      axisStep = 0.0;
      tMax = LARGE;
      tDelta = LARGE;
    }

    void nearest_dda_advance_axis_to_target(
      float targetT,
      inout float voxelCoord,
      float axisStep,
      inout float tMax,
      float tDelta
    ) {
      if (axisStep == 0.0 || tDelta >= LARGE * 0.5) {
        return;
      }
      float adjustedTarget = targetT + 1e-5;
      if (tMax > adjustedTarget) {
        return;
      }
      float crossings = floor((adjustedTarget - tMax) / tDelta) + 1.0;
      if (!(crossings > 0.0)) {
        return;
      }
      voxelCoord += axisStep * crossings;
      tMax += tDelta * crossings;
    }

    void nearest_dda_advance_to_target(
      float targetT,
      inout vec3 voxelCoords,
      float axisStepX,
      float axisStepY,
      float axisStepZ,
      inout float tMaxX,
      inout float tMaxY,
      inout float tMaxZ,
      float tDeltaX,
      float tDeltaY,
      float tDeltaZ
    ) {
      nearest_dda_advance_axis_to_target(targetT, voxelCoords.x, axisStepX, tMaxX, tDeltaX);
      nearest_dda_advance_axis_to_target(targetT, voxelCoords.y, axisStepY, tMaxY, tDeltaY);
      nearest_dda_advance_axis_to_target(targetT, voxelCoords.z, axisStepZ, tMaxZ, tDeltaZ);
    }

    vec4 sample_nearest_full_volume_voxel(vec3 voxelCoords) {
      return texelFetch(u_data, ivec3(voxelCoords), 0);
    }

    vec3 nearest_ray_voxel_position(
      vec3 startVoxelCoords,
      vec3 voxelStep,
      float traversedDistance,
      vec3 volumeSize
    ) {
      return clamp(
        startVoxelCoords + voxelStep * traversedDistance,
        vec3(0.0),
        max(volumeSize - vec3(1e-4), vec3(0.0))
      );
    }

    vec3 resolve_nearest_sampling_volume_size() {
      if (u_brickAtlasEnabled > 0.5) {
        return max(u_brickVolumeSize, vec3(1.0));
      }
      return max(u_size, vec3(1.0));
    }

    vec3 resolve_nearest_entry_voxel_coords(vec3 front, vec3 traversalSize, vec3 rayDir) {
      vec3 safeSize = max(u_size, vec3(1.0));
      vec3 entryVoxel = ((front + vec3(0.5)) / safeSize) * traversalSize;
      vec3 inwardNudge = sign(rayDir) * 1e-4;
      return clamp(
        entryVoxel + inwardNudge,
        vec3(0.0),
        max(traversalSize - vec3(1e-4), vec3(0.0))
      );
    }

    float nearest_axis_steps_to_boundary(float voxelCoord, float voxelStep) {
      if (voxelStep > EPSILON) {
        float nextBoundary = floor(voxelCoord) + 1.0;
        return (nextBoundary - voxelCoord) / voxelStep;
      }
      if (voxelStep < -EPSILON) {
        float previousBoundary = ceil(voxelCoord) - 1.0;
        return (previousBoundary - voxelCoord) / voxelStep;
      }
      return LARGE;
    }

    int nearest_steps_until_voxel_change(vec3 texcoords, vec3 step, int remainingSteps) {
      if (u_nearestSampling <= 0.5 || remainingSteps <= 1) {
        return 1;
      }
      vec3 safeVolumeSize = resolve_nearest_sampling_volume_size();
      vec3 voxelCoords = clamp(
        texcoords * safeVolumeSize,
        vec3(0.0),
        max(safeVolumeSize - vec3(1e-4), vec3(0.0))
      );
      vec3 voxelStep = step * safeVolumeSize;
      float stepsX = nearest_axis_steps_to_boundary(voxelCoords.x, voxelStep.x);
      float stepsY = nearest_axis_steps_to_boundary(voxelCoords.y, voxelStep.y);
      float stepsZ = nearest_axis_steps_to_boundary(voxelCoords.z, voxelStep.z);
      float stepsToBoundary = min(stepsX, min(stepsY, stepsZ));
      if (!(stepsToBoundary > 0.0) || stepsToBoundary >= LARGE * 0.5) {
        return 1;
      }
      int steps = int(clamp(ceil(max(stepsToBoundary - 1e-4, 1e-4)), 1.0, float(remainingSteps)));
      return max(steps, 1);
    }

    float nearest_projected_footprint_voxels(vec3 texcoords) {
      vec3 safeVolumeSize = resolve_nearest_sampling_volume_size();
      return length(fwidth(clamp(texcoords, vec3(0.0), vec3(1.0)) * safeVolumeSize));
    }

    bool should_use_voxel_exact_nearest(vec3 texcoords, vec3 step, int nsteps) {
      if (u_nearestSampling <= 0.5 || nsteps <= 0) {
        return false;
      }
      float projectedFootprint = nearest_projected_footprint_voxels(texcoords);
      if (projectedFootprint > NEAREST_DDA_CLOSEUP_MAX_FOOTPRINT) {
        return false;
      }
      vec3 safeVolumeSize = resolve_nearest_sampling_volume_size();
      vec3 voxelStep = abs(step * safeVolumeSize);
      float crossingsPerStep = voxelStep.x + voxelStep.y + voxelStep.z;
      float estimatedVoxelVisits = crossingsPerStep * float(nsteps) + 1.0;
      return estimatedVoxelVisits <= float(MAX_STEPS);
    }

    float normalize_window(float value) {
      float range = max(u_windowMax - u_windowMin, 1e-5);
      float normalized = (value - u_windowMin) / range;
      return clamp(normalized, 0.0, 1.0);
    }

    float apply_inversion(float normalized) {
      return u_invert > 0.5 ? 1.0 - normalized : normalized;
    }

    float normalize_intensity(float value) {
      return normalize_window(value);
    }

    float compute_adaptive_lod_base(vec3 step, vec3 texcoords) {
      if (u_adaptiveLodEnabled <= 0.5 || u_nearestSampling > 0.5) {
        return 0.0;
      }
      float voxelStep = length(step * u_size);
      vec3 safeVolumeSize = max(u_size, vec3(1.0));
      float projectedFootprint = length(fwidth(clamp(texcoords, vec3(0.0), vec3(1.0)) * safeVolumeSize));
      float baseLod = max(log2(max(max(voxelStep, projectedFootprint), 1.0)), 0.0);
      float scaledLod = baseLod * max(u_adaptiveLodScale, 0.0);
      return clamp(scaledLod, 0.0, max(u_adaptiveLodMax, 0.0));
    }

    float adaptive_lod_for_mip(float baseLod, float currentMax) {
      if (baseLod <= 0.0) {
        return 0.0;
      }
      float confidence = clamp(currentMax, 0.0, 1.0);
      return clamp(baseLod * (1.0 - confidence), 0.0, max(u_adaptiveLodMax, 0.0));
    }

    float adaptive_lod_for_iso(float baseLod) {
      return clamp(baseLod * 0.95, 0.0, max(u_adaptiveLodMax, 0.0));
    }

    float adaptive_lod_for_bl(float baseLod, float accumulatedAlpha) {
      float alphaConfidence = clamp(accumulatedAlpha, 0.0, 1.0);
      float refined = baseLod * (0.7 - alphaConfidence * 0.25);
      return clamp(refined, 0.0, max(u_adaptiveLodMax, 0.0));
    }

    float adjust_intensity(float value) {
      return apply_inversion(normalize_intensity(value));
    }

    vec3 adjust_color(vec3 value) {
      float range = max(u_windowMax - u_windowMin, 1e-5);
      vec3 normalized = (value - vec3(u_windowMin)) / range;
      normalized = clamp(normalized, 0.0, 1.0);
      if (u_invert > 0.5) {
        normalized = vec3(1.0) - normalized;
      }
      return normalized;
    }

    float luminance(vec4 colorSample) {
      if (u_channels == 1) {
        return colorSample.r;
      }
      if (u_channels == 2) {
        return 0.5 * (colorSample.r + colorSample.g);
      }
      if (u_channels == 3) {
        return dot(colorSample.rgb, vec3(0.2126, 0.7152, 0.0722));
      }
      return max(max(colorSample.r, colorSample.g), max(colorSample.b, colorSample.a));
    }

    float sample1(vec3 texcoords) {
      if (is_background_masked(texcoords)) {
        return 0.0;
      }
      vec4 colorSample = sample_color_lod(texcoords, 0.0);
      float intensity = luminance(colorSample);
      return adjust_intensity(intensity);
    }

    float sample1_lod(vec3 texcoords, float lod) {
      if (is_background_masked(texcoords)) {
        return 0.0;
      }
      vec4 colorSample = sample_color_lod(texcoords, lod);
      float intensity = luminance(colorSample);
      return adjust_intensity(intensity);
    }

    vec4 apply_colormap(float val) {
      float normalized = (val - u_clim[0]) / (u_clim[1] - u_clim[0]);
      return texture2D(u_cmdata, vec2(normalized, 0.5));
    }

    vec4 compose_color(float normalizedIntensity, vec4 colorSample) {
      float adjustedIntensity = apply_inversion(normalizedIntensity);
      if (u_channels == 1) {
        return apply_colormap(adjustedIntensity);
      }
      vec3 baseColor;
      if (u_channels == 2) {
        baseColor = vec3(colorSample.r, colorSample.g, 0.0);
      } else {
        baseColor = colorSample.rgb;
      }
      vec3 adjustedColor = adjust_color(baseColor);
      if (u_channels == 2) {
        adjustedColor.z = 0.0;
      }
      float alpha = clamp(adjustedIntensity, 0.0, 1.0);
      return vec4(adjustedColor, alpha);
    }

    vec4 apply_blending_mode(vec4 color) {
      if (u_additive > 0.5) {
        color.rgb *= color.a;
        color.a = color.a > 0.0 ? 1.0 : 0.0;
      }
      return color;
    }

    vec2 compute_crosshair_axis_event(
      vec2 startPerp,
      vec2 dirPerp,
      vec2 scalePerp,
      float lineRadiusVoxels,
      float lineDensity,
      float raySpeed
    ) {
      if (lineRadiusVoxels <= 0.0 || lineDensity <= 0.0 || raySpeed <= 0.0) {
        return vec2(0.0, 0.0);
      }

      vec2 weightedStart = startPerp * scalePerp;
      vec2 weightedDir = dirPerp * scalePerp;
      float a = dot(weightedDir, weightedDir);
      float eventT = 0.0;
      if (a > 1e-8) {
        eventT = -dot(weightedStart, weightedDir) / a;
      }
      eventT = clamp(eventT, 0.0, 1.0);

      vec2 closest = weightedStart + weightedDir * eventT;
      float distancePerp = length(closest);
      float feather = max(lineRadiusVoxels * 0.2, 0.08);
      float outerRadius = lineRadiusVoxels + feather;
      if (distancePerp > outerRadius) {
        return vec2(eventT, 0.0);
      }

      float coverage = 1.0 - smoothstep(lineRadiusVoxels, outerRadius, distancePerp);
      float chordHalf = sqrt(max(outerRadius * outerRadius - distancePerp * distancePerp, 0.0));
      float perpSpeed = length(weightedDir);
      float dtThrough = perpSpeed > 1e-5 ? (2.0 * chordHalf / perpSpeed) : 1.0;
      float pathLength = dtThrough * raySpeed;
      float opticalDepth = coverage * max(pathLength, 0.0);
      float alpha = 1.0 - exp(-lineDensity * opticalDepth);
      return vec2(eventT, clamp(alpha, 0.0, 1.0));
    }

    void main() {
      vec3 farpos = v_farpos.xyz / v_farpos.w;
      vec3 nearpos = v_nearpos.xyz / v_nearpos.w;

      vec3 rayOrigin = u_cameraPos;
      vec3 rawDir = v_position - rayOrigin;
      float rawDirLength = length(rawDir);
      if (rawDirLength < EPSILON) {
        discard;
      }
      vec3 rayDir = rawDir / rawDirLength;

      vec3 boxMin = vec3(-0.5);
      vec3 boxMax = u_size - 0.5;
      float clippedFrontFraction = clamp(u_zClipFront, 0.0, 1.0);
      float clippedFrontPlanes = clippedFrontFraction * max(u_size.z - 1.0, 0.0);
      boxMin.z += clippedFrontPlanes;
      if (u_backgroundMaskVisibleBoundsEnabled > 0.5) {
        boxMin = max(boxMin, u_backgroundMaskVisibleBoxMin);
        boxMax = min(boxMax, u_backgroundMaskVisibleBoxMax);
      }

      vec3 tLower;
      vec3 tUpper;

      if (abs(rayDir.x) < EPSILON) {
        if (rayOrigin.x < boxMin.x || rayOrigin.x > boxMax.x) {
          discard;
        }
        tLower.x = -LARGE;
        tUpper.x = LARGE;
      } else {
        float tx1 = (boxMin.x - rayOrigin.x) / rayDir.x;
        float tx2 = (boxMax.x - rayOrigin.x) / rayDir.x;
        tLower.x = min(tx1, tx2);
        tUpper.x = max(tx1, tx2);
      }

      if (abs(rayDir.y) < EPSILON) {
        if (rayOrigin.y < boxMin.y || rayOrigin.y > boxMax.y) {
          discard;
        }
        tLower.y = -LARGE;
        tUpper.y = LARGE;
      } else {
        float ty1 = (boxMin.y - rayOrigin.y) / rayDir.y;
        float ty2 = (boxMax.y - rayOrigin.y) / rayDir.y;
        tLower.y = min(ty1, ty2);
        tUpper.y = max(ty1, ty2);
      }

      if (abs(rayDir.z) < EPSILON) {
        if (rayOrigin.z < boxMin.z || rayOrigin.z > boxMax.z) {
          discard;
        }
        tLower.z = -LARGE;
        tUpper.z = LARGE;
      } else {
        float tz1 = (boxMin.z - rayOrigin.z) / rayDir.z;
        float tz2 = (boxMax.z - rayOrigin.z) / rayDir.z;
        tLower.z = min(tz1, tz2);
        tUpper.z = max(tz1, tz2);
      }

      float entry = max(max(tLower.x, tLower.y), tLower.z);
      float exit = min(min(tUpper.x, tUpper.y), tUpper.z);

      if (exit <= entry) {
        discard;
      }

      float tStart = max(entry, 0.0);
      float tEnd = exit;

      if (tEnd <= tStart) {
        discard;
      }

      vec3 front = rayOrigin + rayDir * tStart;
      vec3 back = rayOrigin + rayDir * tEnd;

      float travelDistance = tEnd - tStart;
      int nsteps;
      vec3 step;
      vec3 start_loc;

      if (u_isSegmentation > 0.5) {
        float safeStepScale = max(u_stepScale, 2.0);
        nsteps = int(travelDistance * safeStepScale + 0.5);
        nsteps = clamp(nsteps, 1, MAX_SEGMENTATION_STEPS);
        step = ((back - front) / u_size) / float(nsteps);
        start_loc = (front + vec3(0.5)) / u_size;
      } else if (u_nearestSampling > 0.5) {
        vec3 nearestTraversalSize = resolve_nearest_sampling_volume_size();
        vec3 nearestEntryVoxelCoords = resolve_nearest_entry_voxel_coords(
          front,
          nearestTraversalSize,
          rayDir
        );
        start_loc = nearestEntryVoxelCoords / nearestTraversalSize;
        step = rayDir / nearestTraversalSize;
        nsteps = clamp(int(travelDistance) + 1, 1, MAX_STEPS);
      } else {
        float safeStepScale = max(u_stepScale, 1e-3);
        nsteps = int(travelDistance * safeStepScale + 0.5);
        nsteps = clamp(nsteps, 1, MAX_STEPS);
        step = ((back - front) / u_size) / float(nsteps);
        start_loc = (front + vec3(0.5)) / u_size;
      }
      vec3 view_ray = -rayDir;

      if (u_isSegmentation > 0.5) {
        cast_segmentation(start_loc, step, nsteps, view_ray);
      } else {
        #if defined(VOLUME_STYLE_MIP)
          cast_mip(start_loc, step, nsteps, view_ray);
        #elif defined(VOLUME_STYLE_ISO)
          cast_iso(start_loc, step, nsteps, view_ray);
        #elif defined(VOLUME_STYLE_BL)
          cast_bl(start_loc, step, nsteps, view_ray);
        #else
          cast_mip(start_loc, step, nsteps, view_ray);
        #endif
      }

      if (gl_FragColor.a < 0.05) {
        discard;
      }
    }

    #if defined(VOLUME_STYLE_MIP)
    void cast_mip(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {
      float max_val = -1e6;
      vec4 max_color = vec4(0.0);
      vec3 loc = start_loc;
      vec3 max_loc = start_loc;
      bool hasVisibleSample = false;
      float safeHighWaterMark = clamp(u_mipEarlyExitThreshold, 0.0, 1.0);
      float hierarchyTraversalCacheValid = 0.0;
      vec3 hierarchyTraversalNodeMin = vec3(0.0);
      vec3 hierarchyTraversalNodeMax = vec3(0.0);
      float hierarchyTraversalNodeSkippable = 0.0;
      float hierarchyTraversalNodeCurrentMax = -2.0;
      float hierarchyTraversalNodeIsoLowThreshold = -2.0;
      int hierarchyLevelCount = int(clamp(floor(u_skipHierarchyLevelCount + 0.5), 0.0, float(MAX_SKIP_HIERARCHY_LEVELS)));
      bool skipTraversalEnabled = u_brickSkipEnabled > 0.5 && hierarchyLevelCount > 0;
      bool useVoxelExactNearest = should_use_voxel_exact_nearest(start_loc, step, nsteps);

      if (useVoxelExactNearest) {
        vec3 safeVolumeSize = resolve_nearest_sampling_volume_size();
        vec3 invSafeVolumeSize = vec3(1.0) / safeVolumeSize;
        vec3 startVoxelCoords = clamp(
          start_loc * safeVolumeSize,
          vec3(0.0),
          max(safeVolumeSize - vec3(1e-4), vec3(0.0))
        );
        vec3 voxelStep = step * safeVolumeSize;
        vec3 voxelCoords = floor(startVoxelCoords);
        bool useBrickAtlas = u_brickAtlasEnabled > 0.5;
        vec3 safeGrid = max(u_brickGridSize, vec3(1.0));
        vec3 safeChunk = max(u_brickChunkSize, vec3(1.0));
        vec3 atlasVolumeSize = safeVolumeSize;
        if (useBrickAtlas) {
          atlasVolumeSize = max(u_brickVolumeSize, vec3(1.0));
        }
        vec3 hierarchyTextureSize = vec3(1.0);
        vec3 hierarchyVolumeSize = vec3(1.0);
        vec3 hierarchyChunkSize = vec3(1.0);
        vec3 hierarchyVoxelStep = vec3(0.0);
        vec3 sampleToHierarchyScale = vec3(1.0);
        if (skipTraversalEnabled) {
          hierarchyTextureSize = max(u_skipHierarchyTextureSize, vec3(1.0));
          hierarchyVolumeSize = max(u_brickVolumeSize, vec3(1.0));
          hierarchyChunkSize = max(u_brickChunkSize, vec3(1.0));
          hierarchyVoxelStep = step * hierarchyVolumeSize;
          sampleToHierarchyScale = hierarchyVolumeSize * invSafeVolumeSize;
        }
        float traversedDistance = 0.0;
        float axisStepX;
        float axisStepY;
        float axisStepZ;
        float tMaxX;
        float tMaxY;
        float tMaxZ;
        float tDeltaX;
        float tDeltaY;
        float tDeltaZ;
        nearest_dda_init_axis(startVoxelCoords.x, voxelStep.x, axisStepX, tMaxX, tDeltaX);
        nearest_dda_init_axis(startVoxelCoords.y, voxelStep.y, axisStepY, tMaxY, tDeltaY);
        nearest_dda_init_axis(startVoxelCoords.z, voxelStep.z, axisStepZ, tMaxZ, tDeltaZ);
        tMaxX += traversedDistance;
        tMaxY += traversedDistance;
        tMaxZ += traversedDistance;
        for (int guard = 0; guard < MAX_STEPS; guard++) {
          if (traversedDistance >= float(nsteps) - NEAREST_DDA_ADVANCE_EPSILON) {
            break;
          }
          if (!nearest_voxel_in_bounds(voxelCoords, safeVolumeSize)) {
            break;
          }
          if (skipTraversalEnabled) {
            int stepAdvance = hierarchy_skip_step_advance_voxel(
              voxelCoords,
              sampleToHierarchyScale,
              hierarchyVoxelStep,
              hierarchyTextureSize,
              hierarchyVolumeSize,
              hierarchyChunkSize,
              hierarchyLevelCount,
              max_val,
              -1.0,
              hierarchyTraversalCacheValid,
              hierarchyTraversalNodeMin,
              hierarchyTraversalNodeMax,
              hierarchyTraversalNodeSkippable,
              hierarchyTraversalNodeCurrentMax,
              hierarchyTraversalNodeIsoLowThreshold
            );
            if (stepAdvance > 1) {
              float targetT = min(
                traversedDistance + float(stepAdvance),
                float(nsteps)
              );
              nearest_dda_advance_to_target(
                targetT,
                voxelCoords,
                axisStepX,
                axisStepY,
                axisStepZ,
                tMaxX,
                tMaxY,
                tMaxZ,
                tDeltaX,
                tDeltaY,
                tDeltaZ
              );
              traversedDistance = targetT;
              continue;
            }
          }
          vec3 sampleTexcoords = (voxelCoords + vec3(0.5)) * invSafeVolumeSize;
          if (is_background_masked(sampleTexcoords)) {
            float nextBoundaryT = min(tMaxX, min(tMaxY, tMaxZ));
            float targetT;
            if (!(nextBoundaryT > traversedDistance + 1e-6) || nextBoundaryT >= LARGE * 0.5) {
              targetT = min(
                traversedDistance + 1.0,
                float(nsteps)
              );
            } else {
              targetT = min(nextBoundaryT + NEAREST_DDA_ADVANCE_EPSILON, float(nsteps));
            }
            nearest_dda_advance_to_target(
              targetT,
              voxelCoords,
              axisStepX,
              axisStepY,
              axisStepZ,
              tMaxX,
              tMaxY,
              tMaxZ,
              tDeltaX,
              tDeltaY,
              tDeltaZ
            );
            traversedDistance = targetT;
            continue;
          }
          vec4 colorSample = vec4(0.0);
          if (useBrickAtlas) {
            vec3 brickCoords = brick_coords_for_voxel(
              voxelCoords,
              safeGrid,
              safeChunk,
              atlasVolumeSize
            );
            vec4 atlasBaseInfo = atlas_base_for_brick(brickCoords, safeGrid);
            colorSample = sample_brick_atlas_voxel_or_missing_base(
              voxelCoords,
              brickCoords,
              atlasBaseInfo,
              safeChunk,
              atlasVolumeSize
            );
          } else {
            colorSample = sample_nearest_full_volume_voxel(voxelCoords);
          }
          float rawVal = luminance(colorSample);
          float normalizedVal = normalize_intensity(rawVal);
          hasVisibleSample = true;
          if (normalizedVal > max_val) {
            max_val = normalizedVal;
            max_color = colorSample;
            max_loc = sampleTexcoords;
            if (max_val >= safeHighWaterMark) {
              break;
            }
          }
          float nextBoundaryT = min(tMaxX, min(tMaxY, tMaxZ));
          float targetT;
          if (!(nextBoundaryT > traversedDistance + 1e-6) || nextBoundaryT >= LARGE * 0.5) {
            targetT = min(
              traversedDistance + 1.0,
              float(nsteps)
            );
          } else {
            targetT = min(nextBoundaryT + NEAREST_DDA_ADVANCE_EPSILON, float(nsteps));
          }
          nearest_dda_advance_to_target(
            targetT,
            voxelCoords,
            axisStepX,
            axisStepY,
            axisStepZ,
            tMaxX,
            tMaxY,
            tMaxZ,
            tDeltaX,
            tDeltaY,
            tDeltaZ
          );
          traversedDistance = targetT;
          if (max_val >= safeHighWaterMark) {
            break;
          }
        }
      } else {
        float baseAdaptiveLod = compute_adaptive_lod_base(step, start_loc);
        int max_i = 100;
        int traversedSteps = 0;
        for (int guard = 0; guard < MAX_STEPS; guard++) {
          if (traversedSteps >= nsteps) {
            break;
          }
          int stepAdvance = 1;
          if (skipTraversalEnabled) {
            stepAdvance = hierarchy_skip_step_advance(
              loc,
              step,
              max_val,
              -1.0,
              hierarchyTraversalCacheValid,
              hierarchyTraversalNodeMin,
              hierarchyTraversalNodeMax,
              hierarchyTraversalNodeSkippable,
              hierarchyTraversalNodeCurrentMax,
              hierarchyTraversalNodeIsoLowThreshold
            );
          }
          if (stepAdvance > 1) {
            loc += step * float(stepAdvance);
            traversedSteps += stepAdvance;
            continue;
          }
          if (is_background_masked(loc)) {
            int stepDelta = 1;
            if (u_nearestSampling > 0.5) {
              stepDelta = nearest_steps_until_voxel_change(loc, step, nsteps - traversedSteps);
            }
            loc += step * float(stepDelta);
            traversedSteps += stepDelta;
            continue;
          }
          float adaptiveLod = adaptive_lod_for_mip(baseAdaptiveLod, max_val);
          vec4 colorSample = sample_color_lod(loc, adaptiveLod);
          float rawVal = luminance(colorSample);
          float normalizedVal = normalize_intensity(rawVal);
          hasVisibleSample = true;
          if (normalizedVal > max_val) {
            max_val = normalizedVal;
            max_i = traversedSteps;
            max_color = colorSample;
            max_loc = loc;

            if (max_val >= safeHighWaterMark) {
              break;
            }
          }
          int stepDelta = 1;
          if (u_nearestSampling > 0.5) {
            stepDelta = nearest_steps_until_voxel_change(loc, step, nsteps - traversedSteps);
          }
          loc += step * float(stepDelta);
          traversedSteps += stepDelta;
        }

        if (hasVisibleSample) {
          vec3 iloc = start_loc + step * (float(max_i) - 0.5);
          vec3 istep = step / float(REFINEMENT_STEPS);
          for (int i = 0; i < REFINEMENT_STEPS; i++) {
            if (is_background_masked(iloc)) {
              iloc += istep;
              continue;
            }
            vec4 colorSample = sample_color(iloc);
            float refinedRaw = luminance(colorSample);
            float refined = normalize_intensity(refinedRaw);
            if (refined > max_val) {
              max_val = refined;
              max_color = colorSample;
              max_loc = iloc;
            }
            iloc += istep;
          }
        }
      }

      if (!hasVisibleSample) {
        gl_FragColor = vec4(0.0);
        return;
      }

      vec4 color = compose_color(max_val, max_color);

      if (u_hoverActive > 0.5 && length(u_hoverScale) > 0.0) {
        float pulse = clamp(u_hoverPulse, 0.0, 1.0);
        bool segmentationHover = u_hoverSegmentationMode > 0.5;
        if (segmentationHover) {
          float sampleLabel = sample_segmentation_label(max_loc);
          if (abs(sampleLabel - u_hoverLabel) <= 0.5) {
            color.rgb = mix(color.rgb, vec3(1.0), pulse * 0.6);
          }
        } else if (u_hoverRadius > 0.0) {
          vec3 delta = (max_loc - u_hoverPos) * u_hoverScale;
          float falloff = smoothstep(0.0, u_hoverRadius, length(delta));
          float highlight = (1.0 - falloff) * pulse;
          color.rgb = mix(color.rgb, vec3(1.0), highlight * 0.6);
        }
      }

      gl_FragColor = apply_blending_mode(color);
    }
    #endif

    void cast_segmentation(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {
      vec3 loc = start_loc;
      vec3 hitLoc = start_loc;
      float hitLabel = 0.0;
      bool hasHit = false;
      vec3 lastOutsideLoc = start_loc;
      bool hasOutsideSample = false;
      int traversedSteps = 0;
      float hierarchyTraversalCacheValid = 0.0;
      vec3 hierarchyTraversalNodeMin = vec3(0.0);
      vec3 hierarchyTraversalNodeMax = vec3(0.0);
      float hierarchyTraversalNodeSkippable = 0.0;
      float hierarchyTraversalNodeCurrentMax = -2.0;
      float hierarchyTraversalNodeIsoLowThreshold = -2.0;
      int hierarchyLevelCount = int(clamp(floor(u_skipHierarchyLevelCount + 0.5), 0.0, float(MAX_SKIP_HIERARCHY_LEVELS)));
      bool skipTraversalEnabled = u_brickSkipEnabled > 0.5 && hierarchyLevelCount > 0;
      for (int guard = 0; guard < MAX_SEGMENTATION_STEPS; guard++) {
        if (traversedSteps >= nsteps) {
          break;
        }
        int stepAdvance = 1;
        if (skipTraversalEnabled) {
          stepAdvance = hierarchy_skip_step_advance(
            loc,
            step,
            -1.0,
            -1.0,
            hierarchyTraversalCacheValid,
            hierarchyTraversalNodeMin,
            hierarchyTraversalNodeMax,
            hierarchyTraversalNodeSkippable,
            hierarchyTraversalNodeCurrentMax,
            hierarchyTraversalNodeIsoLowThreshold
          );
        }
        if (stepAdvance > 1) {
          lastOutsideLoc = clamp(loc + step * float(stepAdvance - 1), vec3(0.0), vec3(1.0));
          hasOutsideSample = true;
          loc += step * float(stepAdvance);
          traversedSteps += stepAdvance;
          continue;
        }

        float occupancy = sample_segmentation_occupancy(loc);
        if (occupancy > 0.5) {
          hitLoc = hasOutsideSample ? segmentation_refine_surface_hit(lastOutsideLoc, loc) : loc;
          hitLabel = resolve_segmentation_surface_label(hitLoc, step);
          hasHit = hitLabel > 0.5;
          break;
        }

        lastOutsideLoc = loc;
        hasOutsideSample = true;
        loc += step;
        traversedSteps += 1;
      }

      if (!hasHit) {
        gl_FragColor = vec4(0.0);
        return;
      }

      vec4 color = segmentation_color_from_label(hitLabel);
      vec3 V = normalize(view_ray);
      if (length(V) <= EPSILON) {
        V = vec3(0.0, 0.0, 1.0);
      }
      vec3 N = segmentation_surface_normal(hitLoc, view_ray);
      if (length(N) > EPSILON) {
        vec3 L = V;
        vec3 H = normalize(L + V);
        float lambertTerm = clamp(dot(N, L), 0.0, 1.0);
        float specularTerm = pow(max(dot(H, N), 0.0), shininess);
        color.rgb = color.rgb * (ambientStrength + diffuseStrength * lambertTerm) + specularTerm * specularColor;
      }
      if (u_hoverActive > 0.5 && length(u_hoverScale) > 0.0) {
        float pulse = clamp(u_hoverPulse, 0.0, 1.0);
        bool segmentationHover = u_hoverSegmentationMode > 0.5;
        if (segmentationHover) {
          if (abs(hitLabel - u_hoverLabel) <= 0.5) {
            color.rgb = mix(color.rgb, vec3(1.0), pulse * 0.6);
          }
        } else if (u_hoverRadius > 0.0) {
          vec3 delta = (hitLoc - u_hoverPos) * u_hoverScale;
          float falloff = smoothstep(0.0, u_hoverRadius, length(delta));
          float highlight = (1.0 - falloff) * pulse;
          color.rgb = mix(color.rgb, vec3(1.0), highlight * 0.6);
        }
      }

      gl_FragColor = apply_blending_mode(color);
    }

    #if defined(VOLUME_STYLE_ISO)
    void cast_iso(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {
      vec4 hitColor = vec4(0.0);
      vec3 dstep = 1.5 / u_size;
      vec3 loc = start_loc;
      float baseAdaptiveLod = compute_adaptive_lod_base(step, start_loc);

      float low_threshold = u_renderthreshold - 0.02 * (u_clim[1] - u_clim[0]);
      bool hasHit = false;
      int traversedSteps = 0;
      float hierarchyTraversalCacheValid = 0.0;
      vec3 hierarchyTraversalNodeMin = vec3(0.0);
      vec3 hierarchyTraversalNodeMax = vec3(0.0);
      float hierarchyTraversalNodeSkippable = 0.0;
      float hierarchyTraversalNodeCurrentMax = -2.0;
      float hierarchyTraversalNodeIsoLowThreshold = -2.0;
      int hierarchyLevelCount = int(clamp(floor(u_skipHierarchyLevelCount + 0.5), 0.0, float(MAX_SKIP_HIERARCHY_LEVELS)));
      bool skipTraversalEnabled = u_brickSkipEnabled > 0.5 && hierarchyLevelCount > 0;

      for (int guard = 0; guard < MAX_STEPS; guard++) {
        if (traversedSteps >= nsteps) {
          break;
        }
        int stepAdvance = 1;
        if (skipTraversalEnabled) {
          stepAdvance = hierarchy_skip_step_advance(
            loc,
            step,
            -1.0,
            low_threshold,
            hierarchyTraversalCacheValid,
            hierarchyTraversalNodeMin,
            hierarchyTraversalNodeMax,
            hierarchyTraversalNodeSkippable,
            hierarchyTraversalNodeCurrentMax,
            hierarchyTraversalNodeIsoLowThreshold
          );
        }
        if (stepAdvance > 1) {
          loc += step * float(stepAdvance);
          traversedSteps += stepAdvance;
          continue;
        }

        float val = sample1_lod(loc, adaptive_lod_for_iso(baseAdaptiveLod));

        if (!hasHit && val > low_threshold) {
          vec3 iloc = loc - 0.5 * step;
          vec3 istep = step / float(REFINEMENT_STEPS);
          for (int i = 0; i < REFINEMENT_STEPS; i++) {
            if (is_background_masked(iloc)) {
              iloc += istep;
              continue;
            }
            vec4 colorSample = sample_color(iloc);
            float refinedRaw = luminance(colorSample);
            float refined = normalize_intensity(refinedRaw);
            float adjustedRefined = apply_inversion(refined);
            if (adjustedRefined > u_renderthreshold) {
              hitColor = add_lighting(refined, iloc, dstep, view_ray, colorSample);
              hasHit = true;
              break;
            }
            iloc += istep;
          }
          if (hasHit) {
            break;
          }
        }

        int stepDelta = 1;
        if (u_nearestSampling > 0.5) {
          stepDelta = nearest_steps_until_voxel_change(loc, step, nsteps - traversedSteps);
        }
        loc += step * float(stepDelta);
        traversedSteps += stepDelta;
      }

      gl_FragColor = apply_blending_mode(hitColor);
    }
    #endif

    #if defined(VOLUME_STYLE_BL)
    void cast_bl(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {
      vec3 loc = start_loc;
      vec3 accumulatedColor = vec3(0.0);
      float transmittance = 1.0;
      float accumulatedAlpha = 0.0;
      float safeEarlyExit = clamp(u_blEarlyExitAlpha, 0.0, 1.0);
      float safeBackgroundCutoff = clamp(u_blBackgroundCutoff, 0.0, 1.0);
      float safeDensity = max(u_blDensityScale, 0.0);
      float safeOpacity = max(u_blOpacityScale, 0.0);
      float stepDistance = max(length(step * u_size), 1e-5);
      float baseAdaptiveLod = compute_adaptive_lod_base(step, start_loc);
      bool hoverActive = u_hoverActive > 0.5 && length(u_hoverScale) > 0.0;
      float hoverPulse = clamp(u_hoverPulse, 0.0, 1.0);
      float hoverLineRadius = max(u_hoverRadius * 0.45, 0.55);
      float hoverAxisDensity = mix(2.6, 3.4, hoverPulse);
      vec3 rayDelta = step * float(nsteps);
      float raySpeed = length(rayDelta * u_hoverScale);

      vec2 axisXEvent = vec2(0.0);
      vec2 axisYEvent = vec2(0.0);
      vec2 axisZEvent = vec2(0.0);
      bool axisXPending = false;
      bool axisYPending = false;
      bool axisZPending = false;
      int traversedSteps = 0;
      float hierarchyTraversalCacheValid = 0.0;
      vec3 hierarchyTraversalNodeMin = vec3(0.0);
      vec3 hierarchyTraversalNodeMax = vec3(0.0);
      float hierarchyTraversalNodeSkippable = 0.0;
      float hierarchyTraversalNodeCurrentMax = -2.0;
      float hierarchyTraversalNodeIsoLowThreshold = -2.0;
      int hierarchyLevelCount = int(clamp(floor(u_skipHierarchyLevelCount + 0.5), 0.0, float(MAX_SKIP_HIERARCHY_LEVELS)));
      bool skipTraversalEnabled = u_brickSkipEnabled > 0.5 && hierarchyLevelCount > 0;
      if (hoverActive && u_hoverRadius > 0.0 && raySpeed > 0.0) {
        axisXEvent = compute_crosshair_axis_event(
          vec2(start_loc.y - u_hoverPos.y, start_loc.z - u_hoverPos.z),
          vec2(rayDelta.y, rayDelta.z),
          vec2(u_hoverScale.y, u_hoverScale.z),
          hoverLineRadius,
          hoverAxisDensity,
          raySpeed
        );
        axisYEvent = compute_crosshair_axis_event(
          vec2(start_loc.x - u_hoverPos.x, start_loc.z - u_hoverPos.z),
          vec2(rayDelta.x, rayDelta.z),
          vec2(u_hoverScale.x, u_hoverScale.z),
          hoverLineRadius,
          hoverAxisDensity,
          raySpeed
        );
        axisZEvent = compute_crosshair_axis_event(
          vec2(start_loc.x - u_hoverPos.x, start_loc.y - u_hoverPos.y),
          vec2(rayDelta.x, rayDelta.y),
          vec2(u_hoverScale.x, u_hoverScale.y),
          hoverLineRadius,
          hoverAxisDensity,
          raySpeed
        );
        axisXPending = axisXEvent.y > 1e-4;
        axisYPending = axisYEvent.y > 1e-4;
        axisZPending = axisZEvent.y > 1e-4;
      }
      float safeSteps = max(float(nsteps), 1.0);

      for (int guard = 0; guard < MAX_STEPS; guard++) {
        if (traversedSteps >= nsteps) {
          break;
        }
        int stepAdvance = 1;
        if (skipTraversalEnabled) {
          stepAdvance = hierarchy_skip_step_advance(
            loc,
            step,
            -1.0,
            safeBackgroundCutoff,
            hierarchyTraversalCacheValid,
            hierarchyTraversalNodeMin,
            hierarchyTraversalNodeMax,
            hierarchyTraversalNodeSkippable,
            hierarchyTraversalNodeCurrentMax,
            hierarchyTraversalNodeIsoLowThreshold
          );
        }
        float stepAlpha = 0.0;
        vec3 stepPremultipliedColor = vec3(0.0);
        float sampleT = (float(traversedSteps) + 0.5) / safeSteps;
        if (axisXPending && sampleT >= axisXEvent.x) {
          stepPremultipliedColor += (1.0 - stepAlpha) * axisXEvent.y * vec3(1.0, 0.0, 0.0);
          stepAlpha = 1.0 - (1.0 - stepAlpha) * (1.0 - axisXEvent.y);
          axisXPending = false;
        }
        if (axisYPending && sampleT >= axisYEvent.x) {
          stepPremultipliedColor += (1.0 - stepAlpha) * axisYEvent.y * vec3(0.0, 1.0, 0.0);
          stepAlpha = 1.0 - (1.0 - stepAlpha) * (1.0 - axisYEvent.y);
          axisYPending = false;
        }
        if (axisZPending && sampleT >= axisZEvent.x) {
          stepPremultipliedColor += (1.0 - stepAlpha) * axisZEvent.y * vec3(0.0, 0.0, 1.0);
          stepAlpha = 1.0 - (1.0 - stepAlpha) * (1.0 - axisZEvent.y);
          axisZPending = false;
        }

        bool skipVolumeSample = stepAdvance > 1;

        if (!skipVolumeSample) {
          float adaptiveLod = adaptive_lod_for_bl(baseAdaptiveLod, accumulatedAlpha);
          vec4 colorSample = sample_color_lod(loc, adaptiveLod);
          float rawIntensity = luminance(colorSample);
          float normalizedIntensity = normalize_intensity(rawIntensity);

          if (u_blRefinementEnabled > 0.5 && adaptiveLod > 0.25 && normalizedIntensity > safeBackgroundCutoff + 0.05) {
            vec3 refineLoc = loc - 0.5 * step;
            vec3 refineStep = step / float(REFINEMENT_STEPS);
            float refinedRawIntensity = rawIntensity;
            vec4 refinedColorSample = colorSample;
            for (int refineIndex = 0; refineIndex < REFINEMENT_STEPS; refineIndex++) {
              vec4 localRefineSample = sample_color(refineLoc);
              float localRefineRaw = luminance(localRefineSample);
              if (localRefineRaw > refinedRawIntensity) {
                refinedRawIntensity = localRefineRaw;
                refinedColorSample = localRefineSample;
              }
              refineLoc += refineStep;
            }
            rawIntensity = refinedRawIntensity;
            colorSample = refinedColorSample;
            normalizedIntensity = normalize_intensity(rawIntensity);
          }

          if (normalizedIntensity > safeBackgroundCutoff) {
            float cutoffAdjustedIntensity = safeBackgroundCutoff >= 1.0
              ? 0.0
              : clamp(
                (normalizedIntensity - safeBackgroundCutoff) / max(1.0 - safeBackgroundCutoff, 1e-5),
                0.0,
                1.0
              );
            float sigmaT = cutoffAdjustedIntensity * safeDensity * safeOpacity;
            float alphaStep = 1.0 - exp(-sigmaT * stepDistance);
            vec4 sampleColor = compose_color(normalizedIntensity, colorSample);
            float remainingStepAlpha = 1.0 - stepAlpha;
            stepPremultipliedColor += remainingStepAlpha * alphaStep * sampleColor.rgb;
            stepAlpha = 1.0 - (1.0 - stepAlpha) * (1.0 - alphaStep);
          }
        }

        if (stepAlpha > 0.0) {
          accumulatedColor += transmittance * stepPremultipliedColor;
          transmittance *= max(0.0, 1.0 - stepAlpha);
          accumulatedAlpha = 1.0 - transmittance;
        }

        if (accumulatedAlpha >= safeEarlyExit) {
          break;
        }

        loc += step * float(stepAdvance);
        traversedSteps += stepAdvance;
      }

      if (axisXPending) {
        accumulatedColor += transmittance * axisXEvent.y * vec3(1.0, 0.0, 0.0);
        transmittance *= max(0.0, 1.0 - axisXEvent.y);
        accumulatedAlpha = 1.0 - transmittance;
      }
      if (axisYPending) {
        accumulatedColor += transmittance * axisYEvent.y * vec3(0.0, 1.0, 0.0);
        transmittance *= max(0.0, 1.0 - axisYEvent.y);
        accumulatedAlpha = 1.0 - transmittance;
      }
      if (axisZPending) {
        accumulatedColor += transmittance * axisZEvent.y * vec3(0.0, 0.0, 1.0);
        transmittance *= max(0.0, 1.0 - axisZEvent.y);
        accumulatedAlpha = 1.0 - transmittance;
      }

      gl_FragColor = apply_blending_mode(vec4(accumulatedColor, accumulatedAlpha));
    }
    #endif

    #if defined(VOLUME_STYLE_ISO)
    vec4 add_lighting(float val, vec3 loc, vec3 step, vec3 view_ray, vec4 colorSample) {
      vec3 V = normalize(view_ray);

      vec3 N;
      float val1 = normalize_intensity(luminance(sample_color(loc + vec3(-step[0], 0.0, 0.0))));
      float val2 = normalize_intensity(luminance(sample_color(loc + vec3(+step[0], 0.0, 0.0))));
      N[0] = val1 - val2;
      val = max(max(val1, val2), val);
      val1 = normalize_intensity(luminance(sample_color(loc + vec3(0.0, -step[1], 0.0))));
      val2 = normalize_intensity(luminance(sample_color(loc + vec3(0.0, +step[1], 0.0))));
      N[1] = val1 - val2;
      val = max(max(val1, val2), val);
      val1 = normalize_intensity(luminance(sample_color(loc + vec3(0.0, 0.0, -step[2]))));
      val2 = normalize_intensity(luminance(sample_color(loc + vec3(0.0, 0.0, +step[2]))));
      N[2] = val1 - val2;
      val = max(max(val1, val2), val);

      float gm = length(N);
      if (gm > 0.0) {
        N = normalize(N);
      }

      float Nselect = float(dot(N, V) > 0.0);
      N = (2.0 * Nselect - 1.0) * N;

      vec3 L = normalize(view_ray);
      if (length(L) == 0.0) {
        L = vec3(0.0, 0.0, 1.0);
      }
      float lambertTerm = clamp(dot(N, L), 0.0, 1.0);
      vec3 H = normalize(L + V);
      float specularTerm = pow(max(dot(H, N), 0.0), shininess);

      vec4 baseColor = compose_color(val, colorSample);
      vec3 litColor = baseColor.rgb * (ambientStrength + diffuseStrength * lambertTerm) + specularTerm * specularColor;
      return vec4(litColor, baseColor.a);
    }
    #endif
  `;

export type VolumeRenderShaderVariantKey = 'mip' | 'mip-nearest' | 'iso' | 'bl';

const createVariantFragmentShader = (variant: VolumeRenderShaderVariantKey): string => {
  if (variant === 'iso') {
    return `#define VOLUME_STYLE_ISO\n${volumeRenderFragmentShader}`;
  }
  if (variant === 'bl') {
    return `#define VOLUME_STYLE_BL\n${volumeRenderFragmentShader}`;
  }
  if (variant === 'mip-nearest') {
    return `#define VOLUME_STYLE_MIP\n#define VOLUME_NEAREST_VARIANT\n${volumeRenderFragmentShader}`;
  }
  return `#define VOLUME_STYLE_MIP\n${volumeRenderFragmentShader}`;
};

const createVolumeRenderShaderVariant = (variant: VolumeRenderShaderVariantKey) => ({
  uniforms,
  vertexShader: volumeRenderVertexShader,
  fragmentShader: createVariantFragmentShader(variant)
});

export const VolumeRenderShaderVariants = {
  mip: createVolumeRenderShaderVariant('mip'),
  'mip-nearest': createVolumeRenderShaderVariant('mip-nearest'),
  iso: createVolumeRenderShaderVariant('iso'),
  bl: createVolumeRenderShaderVariant('bl')
} as const;

export const getVolumeRenderShaderVariantKey = (
  renderStyle: RenderStyle,
  samplingMode: 'linear' | 'nearest' = 'linear',
): VolumeRenderShaderVariantKey => {
  if (renderStyle === RENDER_STYLE_ISO) {
    return 'iso';
  }
  if (renderStyle === RENDER_STYLE_BL) {
    return 'bl';
  }
  if (samplingMode === 'nearest') {
    return 'mip-nearest';
  }
  return 'mip';
};

export const getVolumeRenderShaderVariant = (
  renderStyle: RenderStyle,
  samplingMode: 'linear' | 'nearest' = 'linear',
) => VolumeRenderShaderVariants[getVolumeRenderShaderVariantKey(renderStyle, samplingMode)];

// Backward-compatible default variant for existing imports.
export const VolumeRenderShader = VolumeRenderShaderVariants.mip;

export type VolumeRenderShaderType = typeof VolumeRenderShader;
