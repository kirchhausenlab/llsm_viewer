import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  benchmarkDatasetExists,
  DEFAULT_REAL_DATASET_BASELINE_PATH,
  REAL_DATASET_BENCHMARK_CASES,
  runRealDatasetBenchmarkCase,
  type RealDatasetBaselineReport,
  type RealDatasetBenchmarkCaseConfig,
} from './realDatasetBenchmarkHarness.ts';

function loadBaselineReport(): RealDatasetBaselineReport {
  const baselinePath = path.resolve(process.cwd(), DEFAULT_REAL_DATASET_BASELINE_PATH);
  if (!fs.existsSync(baselinePath)) {
    throw new Error(
      `Missing real dataset benchmark baseline at ${baselinePath}. Run "npm run benchmark:real-datasets" first.`
    );
  }
  const payload = fs.readFileSync(baselinePath, 'utf8');
  return JSON.parse(payload) as RealDatasetBaselineReport;
}

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`;
}

function compareCaseToBaseline({
  benchmarkCase,
  baseline,
}: {
  benchmarkCase: RealDatasetBenchmarkCaseConfig;
  baseline: RealDatasetBaselineReport;
}) {
  const baselineEntry = baseline.cases[benchmarkCase.id];
  assert.ok(baselineEntry, `Missing baseline entry for case "${benchmarkCase.id}".`);

  return test(
    `performance: ${benchmarkCase.id} remains within baseline thresholds`,
    {
      skip: !benchmarkDatasetExists(benchmarkCase.datasetPath)
        ? `Dataset missing: ${benchmarkCase.datasetPath}`
        : false,
    },
    async () => {
      const result = await runRealDatasetBenchmarkCase(benchmarkCase);
      const thresholds = baselineEntry.thresholds;

      assert.equal(
        result.metrics.selectedResidencyMode,
        thresholds.selectedResidencyMode,
        `[${benchmarkCase.id}] residency mode changed: expected ${thresholds.selectedResidencyMode}, observed ${result.metrics.selectedResidencyMode}`
      );
      assert.equal(
        result.metrics.selectedScaleLevel,
        thresholds.selectedScaleLevel,
        `[${benchmarkCase.id}] selected scale changed: expected L${thresholds.selectedScaleLevel}, observed L${result.metrics.selectedScaleLevel}`
      );
      assert.ok(
        result.metrics.coldLoadMs <= thresholds.coldLoadMsMax,
        `[${benchmarkCase.id}] cold load regression: ${formatMs(result.metrics.coldLoadMs)} > ${formatMs(thresholds.coldLoadMsMax)}`
      );
      assert.ok(
        result.metrics.warmLoadMs <= thresholds.warmLoadMsMax,
        `[${benchmarkCase.id}] warm load regression: ${formatMs(result.metrics.warmLoadMs)} > ${formatMs(thresholds.warmLoadMsMax)}`
      );
      if (thresholds.transitionLoadMsMax !== null) {
        assert.ok(
          result.metrics.transitionLoadMs !== null,
          `[${benchmarkCase.id}] transition load metric missing while baseline expects one.`
        );
        assert.ok(
          (result.metrics.transitionLoadMs ?? Number.POSITIVE_INFINITY) <= thresholds.transitionLoadMsMax,
          `[${benchmarkCase.id}] transition load regression: ${formatMs(
            result.metrics.transitionLoadMs ?? Number.POSITIVE_INFINITY
          )} > ${formatMs(thresholds.transitionLoadMsMax)}`
        );
      }
      if (thresholds.sweepLoadMsMax !== null) {
        assert.ok(
          result.metrics.sweepLoadMs !== null,
          `[${benchmarkCase.id}] sweep load metric missing while baseline expects one.`
        );
        assert.ok(
          (result.metrics.sweepLoadMs ?? Number.POSITIVE_INFINITY) <= thresholds.sweepLoadMsMax,
          `[${benchmarkCase.id}] sweep load regression: ${formatMs(
            result.metrics.sweepLoadMs ?? Number.POSITIVE_INFINITY
          )} > ${formatMs(thresholds.sweepLoadMsMax)}`
        );
      }
      assert.ok(
        result.metrics.chunkHitRate >= thresholds.chunkHitRateMin,
        `[${benchmarkCase.id}] chunk hit rate regression: ${result.metrics.chunkHitRate.toFixed(3)} < ${thresholds.chunkHitRateMin.toFixed(3)}`
      );
    }
  );
}

const baseline = loadBaselineReport();
for (const benchmarkCase of REAL_DATASET_BENCHMARK_CASES) {
  compareCaseToBaseline({ benchmarkCase, baseline });
}
