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

const runningWithCoverage = Boolean(process.env.NODE_V8_COVERAGE);

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
      skip: runningWithCoverage
        ? 'Skipped under coverage run; enforced by test:perf:real-datasets.'
        : !benchmarkDatasetExists(benchmarkCase.datasetPath)
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
        result.metrics.lod0SelectionRatio >= thresholds.lod0SelectionRatioMin,
        `[${benchmarkCase.id}] LOD0 selection ratio regression: ${result.metrics.lod0SelectionRatio.toFixed(
          3
        )} < ${thresholds.lod0SelectionRatioMin.toFixed(3)}`
      );
      if (thresholds.lod0ReadinessP95MsMax !== null) {
        assert.ok(
          result.metrics.lod0ReadinessP95Ms !== null,
          `[${benchmarkCase.id}] LOD0 readiness metric missing while baseline expects one.`
        );
        assert.ok(
          (result.metrics.lod0ReadinessP95Ms ?? Number.POSITIVE_INFINITY) <= thresholds.lod0ReadinessP95MsMax,
          `[${benchmarkCase.id}] LOD0 readiness regression: ${formatMs(
            result.metrics.lod0ReadinessP95Ms ?? Number.POSITIVE_INFINITY
          )} > ${formatMs(thresholds.lod0ReadinessP95MsMax)}`
        );
      }
      assert.ok(
        result.metrics.scaleThrashEventsPerMinute <= thresholds.scaleThrashEventsPerMinuteMax,
        `[${benchmarkCase.id}] scale thrash regression: ${result.metrics.scaleThrashEventsPerMinute.toFixed(
          3
        )} > ${thresholds.scaleThrashEventsPerMinuteMax.toFixed(3)}`
      );
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
