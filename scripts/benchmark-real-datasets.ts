import fs from 'node:fs/promises';
import path from 'node:path';

import {
  benchmarkDatasetExists,
  buildBaselineReport,
  DEFAULT_REAL_DATASET_BASELINE_PATH,
  REAL_DATASET_BENCHMARK_CASES,
  runRealDatasetBenchmarks,
} from '../tests/perf/realDatasetBenchmarkHarness.ts';

async function main(): Promise<void> {
  const outputPath = path.resolve(
    process.cwd(),
    process.env.REAL_DATASET_BASELINE_OUTPUT?.trim() || DEFAULT_REAL_DATASET_BASELINE_PATH
  );

  const missingDatasets = REAL_DATASET_BENCHMARK_CASES.filter(
    (benchmarkCase) => !benchmarkDatasetExists(benchmarkCase.datasetPath)
  );
  if (missingDatasets.length > 0) {
    throw new Error(
      `Missing benchmark datasets: ${missingDatasets
        .map((benchmarkCase) => benchmarkCase.datasetPath)
        .join(', ')}`
    );
  }

  const results = await runRealDatasetBenchmarks();
  for (const result of results) {
    console.log(
      `[${result.id}] layer=${result.layerKey} scale=${result.metrics.selectedScaleLevel} mode=${result.metrics.selectedResidencyMode} cold=${result.metrics.coldLoadMs.toFixed(2)}ms warm=${result.metrics.warmLoadMs.toFixed(2)}ms transition=${result.metrics.transitionLoadMs === null ? 'n/a' : `${result.metrics.transitionLoadMs.toFixed(2)}ms`} sweep=${result.metrics.sweepLoadMs === null ? 'n/a' : `${result.metrics.sweepLoadMs.toFixed(2)}ms`} lod0Selection=${result.metrics.lod0SelectionRatio.toFixed(3)} lod0ReadyP95=${result.metrics.lod0ReadinessP95Ms === null ? 'n/a' : `${result.metrics.lod0ReadinessP95Ms.toFixed(2)}ms`} thrashPerMin=${result.metrics.scaleThrashEventsPerMinute.toFixed(3)} chunkHitRate=${result.metrics.chunkHitRate.toFixed(3)}`
    );
  }

  const report = buildBaselineReport(results);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote real dataset benchmark baseline: ${outputPath}`);
}

void main();
