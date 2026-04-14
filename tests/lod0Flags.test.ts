import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_LOD0_FEATURE_FLAGS,
  resolveLod0FeatureFlags
} from '../src/config/lod0Flags.ts';

test('resolveLod0FeatureFlags applies env and runtime overrides in order', () => {
  const flags = resolveLod0FeatureFlags({
    env: {
      VITE_LOD0_WORKERIZED_RUNTIME_DECODE: 'off',
      VITE_LOD0_BL_REFINEMENT: 'false'
    },
    runtimeOverrides: {
      workerizedRuntimeDecode: true
    }
  });

  assert.equal(flags.blRefinement, false);
  assert.equal(flags.workerizedRuntimeDecode, true);
});

test('resolveLod0FeatureFlags rejects invalid env override values', () => {
  assert.throws(
    () =>
      resolveLod0FeatureFlags({
        env: {
          VITE_LOD0_WORKERIZED_RUNTIME_DECODE: 'definitely'
        }
      }),
    /Invalid LOD0 feature flag override for VITE_LOD0_WORKERIZED_RUNTIME_DECODE/
  );
});

test('resolveLod0FeatureFlags rejects invalid runtime override values', () => {
  assert.throws(
    () =>
      resolveLod0FeatureFlags({
        runtimeOverrides: {
          workerizedRuntimeDecode: 'sometimes'
        }
      }),
    /Invalid LOD0 feature flag override for __LLSM_LOD0_FLAGS__\.workerizedRuntimeDecode/
  );
});

test('resolveLod0FeatureFlags preserves defaults when no overrides are provided', () => {
  assert.deepEqual(resolveLod0FeatureFlags(), DEFAULT_LOD0_FEATURE_FLAGS);
});
