export type LOD0FeatureFlags = {
  adaptiveScaleSelector: boolean;
  promotionStateMachine: boolean;
  advancedPrefetchScheduler: boolean;
  residencyTuning: boolean;
  projectedFootprintShaderLod: boolean;
  blRefinement: boolean;
  workerizedRuntimeDecode: boolean;
};

export const DEFAULT_LOD0_FEATURE_FLAGS: LOD0FeatureFlags = {
  adaptiveScaleSelector: true,
  promotionStateMachine: true,
  advancedPrefetchScheduler: true,
  residencyTuning: true,
  projectedFootprintShaderLod: true,
  blRefinement: true,
  workerizedRuntimeDecode: true
};

type LOD0FeatureFlagOverrides = Partial<LOD0FeatureFlags>;

function readBooleanLike(value: unknown): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    throw new Error(`Expected a boolean-like LOD0 feature flag override, got ${String(value)}.`);
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') {
    return false;
  }
  throw new Error(`Invalid boolean-like LOD0 feature flag override: ${value}.`);
}

function readOverrideValue(
  value: unknown,
  label: string
): boolean | undefined {
  try {
    return readBooleanLike(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid override value.';
    throw new Error(`Invalid LOD0 feature flag override for ${label}: ${message}`);
  }
}

function readEnvOverrides(env: Record<string, unknown>): LOD0FeatureFlagOverrides {
  const resolveEnvFlag = (key: string): boolean | undefined =>
    Object.prototype.hasOwnProperty.call(env, key) ? readOverrideValue(env[key], key) : undefined;
  return {
    adaptiveScaleSelector: resolveEnvFlag('VITE_LOD0_ADAPTIVE_SCALE_SELECTOR'),
    promotionStateMachine: resolveEnvFlag('VITE_LOD0_PROMOTION_STATE_MACHINE'),
    advancedPrefetchScheduler: resolveEnvFlag('VITE_LOD0_ADVANCED_PREFETCH_SCHEDULER'),
    residencyTuning: resolveEnvFlag('VITE_LOD0_RESIDENCY_TUNING'),
    projectedFootprintShaderLod: resolveEnvFlag('VITE_LOD0_PROJECTED_FOOTPRINT_SHADER_LOD'),
    blRefinement: resolveEnvFlag('VITE_LOD0_BL_REFINEMENT'),
    workerizedRuntimeDecode: resolveEnvFlag('VITE_LOD0_WORKERIZED_RUNTIME_DECODE')
  };
}

function readRuntimeOverrides(runtimeOverrides: unknown): LOD0FeatureFlagOverrides {
  if (!runtimeOverrides) {
    return {};
  }
  if (typeof runtimeOverrides !== 'object' || Array.isArray(runtimeOverrides)) {
    throw new Error('Invalid LOD0 runtime overrides: expected an object.');
  }
  const overrides = runtimeOverrides as Record<string, unknown>;
  return {
    adaptiveScaleSelector: readOverrideValue(overrides.adaptiveScaleSelector, '__LLSM_LOD0_FLAGS__.adaptiveScaleSelector'),
    promotionStateMachine: readOverrideValue(overrides.promotionStateMachine, '__LLSM_LOD0_FLAGS__.promotionStateMachine'),
    advancedPrefetchScheduler: readOverrideValue(
      overrides.advancedPrefetchScheduler,
      '__LLSM_LOD0_FLAGS__.advancedPrefetchScheduler'
    ),
    residencyTuning: readOverrideValue(overrides.residencyTuning, '__LLSM_LOD0_FLAGS__.residencyTuning'),
    projectedFootprintShaderLod: readOverrideValue(
      overrides.projectedFootprintShaderLod,
      '__LLSM_LOD0_FLAGS__.projectedFootprintShaderLod'
    ),
    blRefinement: readOverrideValue(overrides.blRefinement, '__LLSM_LOD0_FLAGS__.blRefinement'),
    workerizedRuntimeDecode: readOverrideValue(
      overrides.workerizedRuntimeDecode,
      '__LLSM_LOD0_FLAGS__.workerizedRuntimeDecode'
    )
  };
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

export function resolveLod0FeatureFlags({
  env,
  runtimeOverrides
}: {
  env?: Record<string, unknown>;
  runtimeOverrides?: unknown;
} = {}): LOD0FeatureFlags {
  const withEnvOverrides = applyDefinedOverrides(DEFAULT_LOD0_FEATURE_FLAGS, readEnvOverrides(env ?? {}));
  return applyDefinedOverrides(withEnvOverrides, readRuntimeOverrides(runtimeOverrides));
}

export function getLod0FeatureFlags(): LOD0FeatureFlags {
  return resolveLod0FeatureFlags({
    env: ((import.meta as unknown as { env?: Record<string, unknown> }).env ?? {}) as Record<string, unknown>,
    runtimeOverrides: (globalThis as { __LLSM_LOD0_FLAGS__?: LOD0FeatureFlagOverrides }).__LLSM_LOD0_FLAGS__
  });
}
