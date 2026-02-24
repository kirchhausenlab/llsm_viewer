import { Vector2, Vector3 } from 'three';
import type { Data3DTexture, DataTexture } from 'three';
import {
  RENDER_STYLE_BL,
  RENDER_STYLE_ISO,
  type RenderStyle
} from '../state/layerSettings';

export type BrickSkipDecisionArgs = {
  skipEnabled: boolean;
  atlasIndex: number;
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
  lodScale: number;
  lodMax: number;
  mode: 'mip' | 'iso';
  currentMax?: number;
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
  const baseLod = Math.log2(Math.max(voxelStep, 1));
  const lodScale = Math.max(0, Number.isFinite(args.lodScale) ? args.lodScale : 0);
  const lodMax = Math.max(0, Number.isFinite(args.lodMax) ? args.lodMax : 0);
  const clampedBase = Math.min(Math.max(baseLod * lodScale, 0), lodMax);
  if (args.mode === 'iso') {
    return clampedBase;
  }
  const confidence = clampUnit(Number.isFinite(args.currentMax) ? (args.currentMax as number) : 0);
  return Math.min(Math.max(clampedBase * (1 - confidence), 0), lodMax);
}

export function shouldSkipWithBrickStatsCpu(args: BrickSkipDecisionArgs): boolean {
  if (!args.skipEnabled) {
    return false;
  }
  if (args.atlasIndex < -0.5) {
    return true;
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

type VolumeUniforms = {
  u_size: { value: Vector3 };
  u_renderstyle: { value: number };
  u_blDensityScale: { value: number };
  u_blBackgroundCutoff: { value: number };
  u_blOpacityScale: { value: number };
  u_blEarlyExitAlpha: { value: number };
  u_renderthreshold: { value: number };
  u_clim: { value: Vector2 };
  u_data: { value: Data3DTexture | null };
  u_cmdata: { value: DataTexture | null };
  u_channels: { value: number };
  u_additive: { value: number };
  u_cameraPos: { value: Vector3 };
  u_windowMin: { value: number };
  u_windowMax: { value: number };
  u_invert: { value: number };
  u_stepScale: { value: number };
  u_nearestSampling: { value: number };
  u_hoverPos: { value: Vector3 };
  u_hoverScale: { value: Vector3 };
  u_hoverRadius: { value: number };
  u_hoverActive: { value: number };
  u_hoverPulse: { value: number };
  u_hoverLabel: { value: number };
  u_hoverSegmentationMode: { value: number };
  u_segmentationLabels: { value: Data3DTexture | null };
  u_brickSkipEnabled: { value: number };
  u_brickGridSize: { value: Vector3 };
  u_brickChunkSize: { value: Vector3 };
  u_brickVolumeSize: { value: Vector3 };
  u_brickOccupancy: { value: Data3DTexture | null };
  u_brickMin: { value: Data3DTexture | null };
  u_brickMax: { value: Data3DTexture | null };
  u_brickAtlasIndices: { value: Data3DTexture | null };
  u_brickAtlasEnabled: { value: number };
  u_brickAtlasData: { value: Data3DTexture | null };
  u_brickAtlasSize: { value: Vector3 };
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
  u_renderthreshold: { value: 0.5 },
  u_clim: { value: new Vector2(1, 1) },
  u_data: { value: null as Data3DTexture | null },
  u_cmdata: { value: null as DataTexture | null },
  u_channels: { value: 1 },
  u_additive: { value: 0 },
  u_cameraPos: { value: new Vector3() },
  u_windowMin: { value: 0 },
  u_windowMax: { value: 1 },
  u_invert: { value: 0 },
  u_stepScale: { value: 1 },
  u_nearestSampling: { value: 0 },
  u_hoverPos: { value: new Vector3() },
  u_hoverScale: { value: new Vector3() },
  u_hoverRadius: { value: 0 },
  u_hoverActive: { value: 0 },
  u_hoverPulse: { value: 0 },
  u_hoverLabel: { value: 0 },
  u_hoverSegmentationMode: { value: 0 },
  u_segmentationLabels: { value: null as Data3DTexture | null },
  u_brickSkipEnabled: { value: 0 },
  u_brickGridSize: { value: new Vector3(1, 1, 1) },
  u_brickChunkSize: { value: new Vector3(1, 1, 1) },
  u_brickVolumeSize: { value: new Vector3(1, 1, 1) },
  u_brickOccupancy: { value: null as Data3DTexture | null },
  u_brickMin: { value: null as Data3DTexture | null },
  u_brickMax: { value: null as Data3DTexture | null },
  u_brickAtlasIndices: { value: null as Data3DTexture | null },
  u_brickAtlasEnabled: { value: 0 },
  u_brickAtlasData: { value: null as Data3DTexture | null },
  u_brickAtlasSize: { value: new Vector3(1, 1, 1) },
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
    uniform float u_renderthreshold;
    uniform vec2 u_clim;
    uniform int u_channels;
    uniform float u_additive;
    uniform float u_windowMin;
    uniform float u_windowMax;
    uniform float u_invert;
    uniform float u_stepScale;
    uniform float u_nearestSampling;
    uniform vec3 u_hoverPos;
    uniform vec3 u_hoverScale;
    uniform float u_hoverRadius;
    uniform float u_hoverActive;
    uniform float u_hoverPulse;
    uniform float u_hoverLabel;
    uniform float u_hoverSegmentationMode;
    uniform usampler3D u_segmentationLabels;
    uniform float u_brickSkipEnabled;
    uniform vec3 u_brickGridSize;
    uniform vec3 u_brickChunkSize;
    uniform vec3 u_brickVolumeSize;
    uniform sampler3D u_brickOccupancy;
    uniform sampler3D u_brickMin;
    uniform sampler3D u_brickMax;
    uniform sampler3D u_brickAtlasIndices;
    uniform float u_brickAtlasEnabled;
    uniform sampler3D u_brickAtlasData;
    uniform vec3 u_brickAtlasSize;
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
    const int REFINEMENT_STEPS = 4;
    const float EPSILON = 1e-6;
    const float LARGE = 1e20;
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
    #if defined(VOLUME_STYLE_ISO)
      void cast_iso(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray);
    #endif
    #if defined(VOLUME_STYLE_BL)
      void cast_bl(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray);
    #endif
    float normalize_intensity(float value);
    float apply_inversion(float normalized);

    vec3 brick_lookup_coord(vec3 texcoords) {
      vec3 safeGrid = max(u_brickGridSize, vec3(1.0));
      vec3 safeChunk = max(u_brickChunkSize, vec3(1.0));
      vec3 atlasVolumeSize = max(u_brickVolumeSize, vec3(1.0));
      vec3 voxelCoords = clamp(
        texcoords * atlasVolumeSize,
        vec3(0.0),
        max(atlasVolumeSize - vec3(1e-3), vec3(0.0))
      );
      vec3 brickCoords = floor(voxelCoords / safeChunk);
      brickCoords = clamp(brickCoords, vec3(0.0), safeGrid - vec3(1.0));
      return (brickCoords + vec3(0.5)) / safeGrid;
    }

    bool should_skip_with_brick_stats_values(
      float atlasIndex,
      float occupancy,
      float brickMinRaw,
      float brickMaxRaw,
      float currentMax,
      float isoLowThreshold
    ) {
      if (atlasIndex < -0.5) {
        return true;
      }
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

    bool should_skip_with_brick_stats(vec3 texcoords, float currentMax, float isoLowThreshold) {
      if (u_brickSkipEnabled <= 0.5) {
        return false;
      }

      vec3 brickCoord = brick_lookup_coord(texcoords);
      float atlasIndex = texture(u_brickAtlasIndices, brickCoord).r - 1.0;
      float occupancy = texture(u_brickOccupancy, brickCoord).r;
      float brickMinRaw = texture(u_brickMin, brickCoord).r;
      float brickMaxRaw = texture(u_brickMax, brickCoord).r;
      return should_skip_with_brick_stats_values(
        atlasIndex,
        occupancy,
        brickMinRaw,
        brickMaxRaw,
        currentMax,
        isoLowThreshold
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

    float atlas_index_for_brick(vec3 brickCoords, vec3 safeGrid) {
      vec3 brickLookup = (brickCoords + vec3(0.5)) / safeGrid;
      return texture(u_brickAtlasIndices, brickLookup).r - 1.0;
    }

    vec4 sample_brick_atlas_voxel_known(
      vec3 voxelCoords,
      vec3 brickCoords,
      float atlasIndex,
      vec3 safeChunk,
      vec3 atlasSize,
      vec3 atlasVolumeSize
    ) {
      vec3 clampedVoxel = clamp_voxel_coords(voxelCoords, atlasVolumeSize);
      vec3 localVoxel = clampedVoxel - brickCoords * safeChunk;
      vec3 atlasVoxel = vec3(localVoxel.x, localVoxel.y, localVoxel.z + atlasIndex * safeChunk.z);
      vec3 atlasTexcoords = (atlasVoxel + vec3(0.5)) / atlasSize;
      return texture(u_brickAtlasData, atlasTexcoords);
    }

    bool brick_coords_equal(vec3 a, vec3 b) {
      return all(lessThan(abs(a - b), vec3(0.5)));
    }

    vec3 brick_corner_coords(vec3 lowBrick, vec3 highBrick, vec3 cornerMask) {
      return mix(lowBrick, highBrick, cornerMask);
    }

    vec4 sample_brick_atlas_voxel_or_missing(
      vec3 voxelCoords,
      vec3 brickCoords,
      float atlasIndex,
      vec3 safeChunk,
      vec3 atlasSize,
      vec3 atlasVolumeSize
    ) {
      if (atlasIndex < -0.5) {
        return vec4(0.0);
      }
      return sample_brick_atlas_voxel_known(
        voxelCoords,
        brickCoords,
        atlasIndex,
        safeChunk,
        atlasSize,
        atlasVolumeSize
      );
    }

    vec4 sample_brick_atlas_voxel_with(vec3 voxelCoords, vec3 safeGrid, vec3 safeChunk) {
      vec3 atlasVolumeSize = max(u_brickVolumeSize, vec3(1.0));
      vec3 brickCoords = brick_coords_for_voxel(voxelCoords, safeGrid, safeChunk, atlasVolumeSize);
      float atlasIndex = atlas_index_for_brick(brickCoords, safeGrid);
      if (atlasIndex < -0.5) {
        return vec4(0.0);
      }
      vec3 atlasSize = max(u_brickAtlasSize, vec3(1.0));
      return sample_brick_atlas_voxel_known(
        voxelCoords,
        brickCoords,
        atlasIndex,
        safeChunk,
        atlasSize,
        atlasVolumeSize
      );
    }

    vec4 sample_brick_atlas_voxel(vec3 voxelCoords) {
      vec3 safeGrid = max(u_brickGridSize, vec3(1.0));
      vec3 safeChunk = max(u_brickChunkSize, vec3(1.0));
      return sample_brick_atlas_voxel_with(voxelCoords, safeGrid, safeChunk);
    }

    vec4 sample_brick_atlas_linear_same_brick(
      vec3 texcoords,
      vec3 brickCoords,
      float atlasIndex,
      vec3 safeChunk,
      vec3 atlasSize,
      vec3 atlasVolumeSize
    ) {
      vec3 safeTexcoords = clamp(texcoords, vec3(0.0), vec3(1.0));
      vec3 linearVoxel = safeTexcoords * atlasVolumeSize - vec3(0.5);
      vec3 clampedLinearVoxel = clamp_voxel_coords(linearVoxel, atlasVolumeSize);
      vec3 localLinearVoxel = clampedLinearVoxel - brickCoords * safeChunk;
      vec3 atlasLinearVoxel = vec3(
        localLinearVoxel.x,
        localLinearVoxel.y,
        localLinearVoxel.z + atlasIndex * safeChunk.z
      );
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
      if (brick_coords_equal(baseBrick, farBrick)) {
        float atlasIndex = atlas_index_for_brick(baseBrick, safeGrid);
        if (atlasIndex < -0.5) {
          return vec4(0.0);
        }
        // Within one brick we can use the hardware trilinear filter directly.
        return sample_brick_atlas_linear_same_brick(
          safeTexcoords,
          baseBrick,
          atlasIndex,
          safeChunk,
          atlasSize,
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

      float atlas000 = atlas_index_for_brick(brick000, safeGrid);
      float atlas100 = spanX > 0.5 ? atlas_index_for_brick(brick100, safeGrid) : atlas000;
      float atlas010 = spanY > 0.5 ? atlas_index_for_brick(brick010, safeGrid) : atlas000;
      float atlas001 = spanZ > 0.5 ? atlas_index_for_brick(brick001, safeGrid) : atlas000;
      float atlas110 = atlas000;
      if (spanX > 0.5 && spanY > 0.5) {
        atlas110 = atlas_index_for_brick(brick110, safeGrid);
      } else if (spanX > 0.5) {
        atlas110 = atlas100;
      } else if (spanY > 0.5) {
        atlas110 = atlas010;
      }
      float atlas101 = atlas000;
      if (spanX > 0.5 && spanZ > 0.5) {
        atlas101 = atlas_index_for_brick(brick101, safeGrid);
      } else if (spanX > 0.5) {
        atlas101 = atlas100;
      } else if (spanZ > 0.5) {
        atlas101 = atlas001;
      }
      float atlas011 = atlas000;
      if (spanY > 0.5 && spanZ > 0.5) {
        atlas011 = atlas_index_for_brick(brick011, safeGrid);
      } else if (spanY > 0.5) {
        atlas011 = atlas010;
      } else if (spanZ > 0.5) {
        atlas011 = atlas001;
      }
      float atlas111 = atlas000;
      if (spanX > 0.5) {
        atlas111 = atlas100;
      }
      if (spanY > 0.5) {
        atlas111 = spanX > 0.5 ? atlas110 : atlas010;
      }
      if (spanZ > 0.5) {
        if (spanX > 0.5 && spanY > 0.5) {
          atlas111 = atlas_index_for_brick(brick111, safeGrid);
        } else if (spanX > 0.5) {
          atlas111 = atlas101;
        } else if (spanY > 0.5) {
          atlas111 = atlas011;
        } else {
          atlas111 = atlas001;
        }
      }

      if (
        atlas000 < -0.5 ||
        atlas100 < -0.5 ||
        atlas010 < -0.5 ||
        atlas110 < -0.5 ||
        atlas001 < -0.5 ||
        atlas101 < -0.5 ||
        atlas011 < -0.5 ||
        atlas111 < -0.5
      ) {
        return vec4(0.0);
      }

      vec4 c000 = sample_brick_atlas_voxel_or_missing(
        voxel000,
        brick000,
        atlas000,
        safeChunk,
        atlasSize,
        atlasVolumeSize
      );
      vec4 c100 = sample_brick_atlas_voxel_or_missing(
        voxel100,
        brick100,
        atlas100,
        safeChunk,
        atlasSize,
        atlasVolumeSize
      );
      vec4 c010 = sample_brick_atlas_voxel_or_missing(
        voxel010,
        brick010,
        atlas010,
        safeChunk,
        atlasSize,
        atlasVolumeSize
      );
      vec4 c110 = sample_brick_atlas_voxel_or_missing(
        voxel110,
        brick110,
        atlas110,
        safeChunk,
        atlasSize,
        atlasVolumeSize
      );
      vec4 c001 = sample_brick_atlas_voxel_or_missing(
        voxel001,
        brick001,
        atlas001,
        safeChunk,
        atlasSize,
        atlasVolumeSize
      );
      vec4 c101 = sample_brick_atlas_voxel_or_missing(
        voxel101,
        brick101,
        atlas101,
        safeChunk,
        atlasSize,
        atlasVolumeSize
      );
      vec4 c011 = sample_brick_atlas_voxel_or_missing(
        voxel011,
        brick011,
        atlas011,
        safeChunk,
        atlasSize,
        atlasVolumeSize
      );
      vec4 c111 = sample_brick_atlas_voxel_or_missing(
        voxel111,
        brick111,
        atlas111,
        safeChunk,
        atlasSize,
        atlasVolumeSize
      );

      vec4 c00 = mix(c000, c100, frac.x);
      vec4 c10 = mix(c010, c110, frac.x);
      vec4 c01 = mix(c001, c101, frac.x);
      vec4 c11 = mix(c011, c111, frac.x);
      vec4 c0 = mix(c00, c10, frac.y);
      vec4 c1 = mix(c01, c11, frac.y);
      return mix(c0, c1, frac.z);
    }

    vec4 sample_brick_atlas_linear_lod(vec3 texcoords, float lod) {
      if (lod <= 1e-3) {
        return sample_brick_atlas_linear(texcoords);
      }
      vec3 safeTexcoords = clamp(texcoords, vec3(0.0), vec3(1.0));
      float safeLod = clamp(lod, 0.0, max(u_adaptiveLodMax, 0.0));
      float voxelScale = exp2(safeLod);
      vec3 atlasVolumeSize = max(u_brickVolumeSize, vec3(1.0));
      vec3 coarseVoxel = floor((safeTexcoords * atlasVolumeSize) / voxelScale) * voxelScale;
      return sample_brick_atlas_voxel(coarseVoxel);
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

    vec4 sample_color_lod(vec3 texcoords, float lod) {
      if (u_brickAtlasEnabled > 0.5) {
        if (u_nearestSampling > 0.5) {
          vec3 safeTexcoords = clamp(texcoords, vec3(0.0), vec3(1.0));
          vec3 nearestVoxel = floor(safeTexcoords * max(u_brickVolumeSize, vec3(1.0)));
          return sample_brick_atlas_voxel(nearestVoxel);
        }
        return sample_brick_atlas_linear_lod(texcoords, lod);
      }
      return sample_full_volume_color(texcoords, lod);
    }

    vec4 sample_color(vec3 texcoords) {
      return sample_color_lod(texcoords, 0.0);
    }

    vec4 sample_color_voxel(vec3 voxelCoord) {
      vec3 safeVolumeSize = max(u_size, vec3(1.0));
      vec3 clampedVoxel = clamp(floor(voxelCoord + vec3(0.5)), vec3(0.0), safeVolumeSize - vec3(1.0));
      vec3 texcoords = (clampedVoxel + vec3(0.5)) / safeVolumeSize;
      if (u_brickAtlasEnabled > 0.5) {
        vec3 atlasVolumeSize = max(u_brickVolumeSize, vec3(1.0));
        vec3 atlasVoxel = floor(clamp(texcoords, vec3(0.0), vec3(1.0)) * atlasVolumeSize);
        return sample_brick_atlas_voxel(atlasVoxel);
      }
      return texture(u_data, texcoords);
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

    float compute_adaptive_lod_base(vec3 step) {
      if (u_adaptiveLodEnabled <= 0.5 || u_nearestSampling > 0.5) {
        return 0.0;
      }
      float voxelStep = length(step * u_size);
      float baseLod = max(log2(max(voxelStep, 1.0)), 0.0);
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
      return clamp(baseLod, 0.0, max(u_adaptiveLodMax, 0.0));
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
      vec4 colorSample = sample_color_lod(texcoords, 0.0);
      float intensity = luminance(colorSample);
      return adjust_intensity(intensity);
    }

    float sample1_lod(vec3 texcoords, float lod) {
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

      if (u_nearestSampling > 0.5) {
        vec3 frontCenter = floor(front) + vec3(0.5);
        start_loc = frontCenter / u_size;
        step = rayDir / u_size;
        nsteps = clamp(int(travelDistance) + 1, 1, MAX_STEPS);
      } else {
        float safeStepScale = max(u_stepScale, 1e-3);
        nsteps = int(travelDistance * safeStepScale + 0.5);
        nsteps = clamp(nsteps, 1, MAX_STEPS);
        step = ((back - front) / u_size) / float(nsteps);
        start_loc = front / u_size;
      }
      vec3 view_ray = -rayDir;

      #if defined(VOLUME_STYLE_MIP)
        cast_mip(start_loc, step, nsteps, view_ray);
      #elif defined(VOLUME_STYLE_ISO)
        cast_iso(start_loc, step, nsteps, view_ray);
      #elif defined(VOLUME_STYLE_BL)
        cast_bl(start_loc, step, nsteps, view_ray);
      #else
        cast_mip(start_loc, step, nsteps, view_ray);
      #endif

      if (gl_FragColor.a < 0.05) {
        discard;
      }
    }

    #if defined(VOLUME_STYLE_MIP)
    void cast_mip(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {
      float max_val = -1e6;
      int max_i = 100;
      vec4 max_color = vec4(0.0);
      vec3 loc = start_loc;
      vec3 max_loc = start_loc;
      float baseAdaptiveLod = compute_adaptive_lod_base(step);
      vec3 cachedBrickCoord = vec3(-1.0);
      float cachedAtlasIndex = -1.0;
      float cachedOccupancy = 0.0;
      float cachedBrickMinRaw = 0.0;
      float cachedBrickMaxRaw = 0.0;
      bool hasCachedBrick = false;

      const float HIGH_WATER_MARK = 0.999;

      for (int iter = 0; iter < MAX_STEPS; iter++) {
        if (iter >= nsteps) {
          break;
        }
        if (u_brickSkipEnabled > 0.5) {
          vec3 brickCoord = brick_lookup_coord(loc);
          if (!hasCachedBrick || !brick_coords_equal(brickCoord, cachedBrickCoord)) {
            cachedBrickCoord = brickCoord;
            cachedAtlasIndex = texture(u_brickAtlasIndices, brickCoord).r - 1.0;
            cachedOccupancy = texture(u_brickOccupancy, brickCoord).r;
            cachedBrickMinRaw = texture(u_brickMin, brickCoord).r;
            cachedBrickMaxRaw = texture(u_brickMax, brickCoord).r;
            hasCachedBrick = true;
          }
          if (should_skip_with_brick_stats_values(
            cachedAtlasIndex,
            cachedOccupancy,
            cachedBrickMinRaw,
            cachedBrickMaxRaw,
            max_val,
            -1.0
          )) {
            loc += step;
            continue;
          }
        }
        float adaptiveLod = adaptive_lod_for_mip(baseAdaptiveLod, max_val);
        vec4 colorSample = sample_color_lod(loc, adaptiveLod);
        float rawVal = luminance(colorSample);
        float normalizedVal = normalize_intensity(rawVal);
        if (normalizedVal > max_val) {
          max_val = normalizedVal;
          max_i = iter;
          max_color = colorSample;
          max_loc = loc;

          if (max_val >= HIGH_WATER_MARK) {
            break;
          }
        }
        loc += step;
      }

      vec3 iloc = start_loc + step * (float(max_i) - 0.5);
      vec3 istep = step / float(REFINEMENT_STEPS);
      for (int i = 0; i < REFINEMENT_STEPS; i++) {
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

      vec4 color = compose_color(max_val, max_color);

      if (u_hoverActive > 0.5 && length(u_hoverScale) > 0.0) {
        float pulse = clamp(u_hoverPulse, 0.0, 1.0);
        bool segmentationHover = u_hoverSegmentationMode > 0.5;
        if (segmentationHover) {
          uint sampleLabel = texture(u_segmentationLabels, max_loc).r;
          if (abs(float(sampleLabel) - u_hoverLabel) <= 0.5) {
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

    #if defined(VOLUME_STYLE_ISO)
    void cast_iso(vec3 start_loc, vec3 step, int nsteps, vec3 view_ray) {
      vec4 hitColor = vec4(0.0);
      vec3 dstep = 1.5 / u_size;
      vec3 loc = start_loc;
      float baseAdaptiveLod = compute_adaptive_lod_base(step);
      vec3 cachedBrickCoord = vec3(-1.0);
      float cachedAtlasIndex = -1.0;
      float cachedOccupancy = 0.0;
      float cachedBrickMinRaw = 0.0;
      float cachedBrickMaxRaw = 0.0;
      bool hasCachedBrick = false;

      float low_threshold = u_renderthreshold - 0.02 * (u_clim[1] - u_clim[0]);
      bool hasHit = false;

      for (int iter = 0; iter < MAX_STEPS; iter++) {
        if (iter >= nsteps) {
          break;
        }
        if (u_brickSkipEnabled > 0.5) {
          vec3 brickCoord = brick_lookup_coord(loc);
          if (!hasCachedBrick || !brick_coords_equal(brickCoord, cachedBrickCoord)) {
            cachedBrickCoord = brickCoord;
            cachedAtlasIndex = texture(u_brickAtlasIndices, brickCoord).r - 1.0;
            cachedOccupancy = texture(u_brickOccupancy, brickCoord).r;
            cachedBrickMinRaw = texture(u_brickMin, brickCoord).r;
            cachedBrickMaxRaw = texture(u_brickMax, brickCoord).r;
            hasCachedBrick = true;
          }
          if (should_skip_with_brick_stats_values(
            cachedAtlasIndex,
            cachedOccupancy,
            cachedBrickMinRaw,
            cachedBrickMaxRaw,
            -1.0,
            low_threshold
          )) {
            loc += step;
            continue;
          }
        }

        float val = sample1_lod(loc, adaptive_lod_for_iso(baseAdaptiveLod));

        if (!hasHit && val > low_threshold) {
          vec3 iloc = loc - 0.5 * step;
          vec3 istep = step / float(REFINEMENT_STEPS);
          for (int i = 0; i < REFINEMENT_STEPS; i++) {
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

        loc += step;
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
      float baseAdaptiveLod = compute_adaptive_lod_base(step);
      vec3 cachedBrickCoord = vec3(-1.0);
      float cachedAtlasIndex = -1.0;
      float cachedOccupancy = 0.0;
      float cachedBrickMinRaw = 0.0;
      float cachedBrickMaxRaw = 0.0;
      bool hasCachedBrick = false;
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

      for (int iter = 0; iter < MAX_STEPS; iter++) {
        if (iter >= nsteps) {
          break;
        }
        float stepAlpha = 0.0;
        vec3 stepPremultipliedColor = vec3(0.0);
        float sampleT = (float(iter) + 0.5) / safeSteps;
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

        bool skipVolumeSample = false;
        if (u_brickSkipEnabled > 0.5) {
          vec3 brickCoord = brick_lookup_coord(loc);
          if (!hasCachedBrick || !brick_coords_equal(brickCoord, cachedBrickCoord)) {
            cachedBrickCoord = brickCoord;
            cachedAtlasIndex = texture(u_brickAtlasIndices, brickCoord).r - 1.0;
            cachedOccupancy = texture(u_brickOccupancy, brickCoord).r;
            cachedBrickMinRaw = texture(u_brickMin, brickCoord).r;
            cachedBrickMaxRaw = texture(u_brickMax, brickCoord).r;
            hasCachedBrick = true;
          }
          if (should_skip_with_brick_stats_values(
            cachedAtlasIndex,
            cachedOccupancy,
            cachedBrickMinRaw,
            cachedBrickMaxRaw,
            -1.0,
            -1.0
          )) {
            skipVolumeSample = true;
          }
        }

        if (!skipVolumeSample) {
          float adaptiveLod = adaptive_lod_for_iso(baseAdaptiveLod);
          vec4 colorSample = sample_color_lod(loc, adaptiveLod);
          float rawIntensity = luminance(colorSample);
          float normalizedIntensity = normalize_intensity(rawIntensity);

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

        loc += step;
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

export type VolumeRenderShaderVariantKey = 'mip' | 'iso' | 'bl';

const createVariantFragmentShader = (variant: VolumeRenderShaderVariantKey): string => {
  if (variant === 'iso') {
    return `#define VOLUME_STYLE_ISO\n${volumeRenderFragmentShader}`;
  }
  if (variant === 'bl') {
    return `#define VOLUME_STYLE_BL\n${volumeRenderFragmentShader}`;
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
  iso: createVolumeRenderShaderVariant('iso'),
  bl: createVolumeRenderShaderVariant('bl')
} as const;

export const getVolumeRenderShaderVariantKey = (renderStyle: RenderStyle): VolumeRenderShaderVariantKey => {
  if (renderStyle === RENDER_STYLE_ISO) {
    return 'iso';
  }
  if (renderStyle === RENDER_STYLE_BL) {
    return 'bl';
  }
  return 'mip';
};

export const getVolumeRenderShaderVariant = (renderStyle: RenderStyle) =>
  VolumeRenderShaderVariants[getVolumeRenderShaderVariantKey(renderStyle)];

// Backward-compatible default variant for existing imports.
export const VolumeRenderShader = VolumeRenderShaderVariants.mip;

export type VolumeRenderShaderType = typeof VolumeRenderShader;
