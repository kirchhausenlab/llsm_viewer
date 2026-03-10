export type LOD0FeatureFlags = {
  adaptiveScaleSelector: boolean;
  promotionStateMachine: boolean;
  advancedPrefetchScheduler: boolean;
  residencyTuning: boolean;
  projectedFootprintShaderLod: boolean;
  blRefinement: boolean;
  workerizedRuntimeDecode: boolean;
};

const DEFAULT_LOD0_FEATURE_FLAGS: LOD0FeatureFlags = {
  adaptiveScaleSelector: true,
  promotionStateMachine: true,
  advancedPrefetchScheduler: true,
  residencyTuning: true,
  projectedFootprintShaderLod: true,
  blRefinement: true,
  workerizedRuntimeDecode: true
};

type LOD0FeatureFlagOverrides = Partial<LOD0FeatureFlags>;

function readBooleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
    return false;
  }
  return null;
}

function readEnvOverrides(): LOD0FeatureFlagOverrides {
  const env = ((import.meta as unknown as { env?: Record<string, unknown> }).env ?? {}) as Record<string, unknown>;
  const resolveEnvFlag = (key: string): boolean | null => readBooleanLike(env[key]);
  return {
    adaptiveScaleSelector: resolveEnvFlag('VITE_LOD0_ADAPTIVE_SCALE_SELECTOR') ?? undefined,
    promotionStateMachine: resolveEnvFlag('VITE_LOD0_PROMOTION_STATE_MACHINE') ?? undefined,
    advancedPrefetchScheduler: resolveEnvFlag('VITE_LOD0_ADVANCED_PREFETCH_SCHEDULER') ?? undefined,
    residencyTuning: resolveEnvFlag('VITE_LOD0_RESIDENCY_TUNING') ?? undefined,
    projectedFootprintShaderLod: resolveEnvFlag('VITE_LOD0_PROJECTED_FOOTPRINT_SHADER_LOD') ?? undefined,
    blRefinement: resolveEnvFlag('VITE_LOD0_BL_REFINEMENT') ?? undefined,
    workerizedRuntimeDecode: resolveEnvFlag('VITE_LOD0_WORKERIZED_RUNTIME_DECODE') ?? undefined
  };
}

function readRuntimeOverrides(): LOD0FeatureFlagOverrides {
  const runtimeOverrides = (globalThis as { __LLSM_LOD0_FLAGS__?: LOD0FeatureFlagOverrides }).__LLSM_LOD0_FLAGS__;
  if (!runtimeOverrides) {
    return {};
  }
  return runtimeOverrides;
}

function applyDefinedOverrides(
  base: LOD0FeatureFlags,
  overrides: LOD0FeatureFlagOverrides
): LOD0FeatureFlags {
  const next: LOD0FeatureFlags = { ...base };
  (Object.keys(base) as Array<keyof LOD0FeatureFlags>).forEach((key) => {
    const override = overrides[key];
    if (typeof override === 'boolean') {
      next[key] = override;
    }
  });
  return next;
}

export function getLod0FeatureFlags(): LOD0FeatureFlags {
  const withEnvOverrides = applyDefinedOverrides(DEFAULT_LOD0_FEATURE_FLAGS, readEnvOverrides());
  return applyDefinedOverrides(withEnvOverrides, readRuntimeOverrides());
}
