import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  assertBenchmarkMatrixApprovedForThresholdEnforcement,
  normalizeBenchmarkMatrixConfig
} from '../../src/shared/utils/benchmarkMatrix.ts';

const MATRIX_PATH = path.resolve(process.cwd(), 'docs/refactor-nextgen-volume/BENCHMARK_MATRIX.json');

function loadRawMatrix(): unknown {
  const content = fs.readFileSync(MATRIX_PATH, 'utf8');
  return JSON.parse(content) as unknown;
}

function cloneRaw<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

test('benchmark matrix config parses and approval allows threshold enforcement', () => {
  const config = normalizeBenchmarkMatrixConfig(loadRawMatrix());
  assert.equal(config.approval.status, 'approved');
  assert.doesNotThrow(() =>
    assertBenchmarkMatrixApprovedForThresholdEnforcement({
      config,
      enforceThresholds: true,
      allowUnapprovedMatrix: false
    })
  );
});

test('benchmark matrix config rejects invalid chunk channels', () => {
  const raw = cloneRaw(loadRawMatrix()) as any;
  raw.cases[0].dataset.chunkShape[4] = (raw.cases[0].dataset.channels as number) + 1;

  assert.throws(() => normalizeBenchmarkMatrixConfig(raw), /chunkShape\[4\]/);
});

test('benchmark matrix config rejects invalid atlas thresholds and scale1 request targets', () => {
  const rawAtlas = cloneRaw(loadRawMatrix()) as any;
  rawAtlas.cases[0].acceptance.atlasStepMaxMs.atlas_t0_scale1 = 0;
  assert.throws(() => normalizeBenchmarkMatrixConfig(rawAtlas), /atlasStepMaxMs\.atlas_t0_scale1/);

  const rawScale1 = cloneRaw(loadRawMatrix()) as any;
  rawScale1.cases[0].acceptance.scale1RequestMin = -1;
  assert.throws(() => normalizeBenchmarkMatrixConfig(rawScale1), /scale1RequestMin/);
});

test('benchmark matrix approval enforcement rejects unapproved config unless override is enabled', () => {
  const raw = cloneRaw(loadRawMatrix()) as any;
  raw.approval = {
    status: 'pending',
    approvedAt: null,
    approvedBy: null
  };
  const config = normalizeBenchmarkMatrixConfig(raw);

  assert.throws(
    () =>
      assertBenchmarkMatrixApprovedForThresholdEnforcement({
        config,
        enforceThresholds: true,
        allowUnapprovedMatrix: false
      }),
    /approval is not complete/
  );
  assert.doesNotThrow(() =>
    assertBenchmarkMatrixApprovedForThresholdEnforcement({
      config,
      enforceThresholds: true,
      allowUnapprovedMatrix: true
    })
  );
  assert.doesNotThrow(() =>
    assertBenchmarkMatrixApprovedForThresholdEnforcement({
      config,
      enforceThresholds: false,
      allowUnapprovedMatrix: false
    })
  );
});
