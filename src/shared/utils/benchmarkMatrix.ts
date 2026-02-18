export const BENCHMARK_LOAD_STEP_LABELS = [
  'volume_t0_cold',
  'volume_t0_chunk_warm',
  'volume_t1_mixed_cache'
] as const;

export type BenchmarkLoadStepLabel = (typeof BENCHMARK_LOAD_STEP_LABELS)[number];

export const BENCHMARK_ATLAS_STEP_LABELS = ['atlas_t0_scale0', 'atlas_t0_scale1'] as const;

export type BenchmarkAtlasStepLabel = (typeof BENCHMARK_ATLAS_STEP_LABELS)[number];

export type BenchmarkDatasetSpec = {
  width: number;
  height: number;
  depth: number;
  channels: number;
  timepoints: number;
  chunkShape: [number, number, number, number, number];
};

export type BenchmarkAcceptance = {
  generationMaxMs: number;
  loadStepMaxMs: Record<BenchmarkLoadStepLabel, number>;
  atlasStepMaxMs: Record<BenchmarkAtlasStepLabel, number>;
  chunkHitRateMin: number;
  scale1RequestMin: number;
};

export type BenchmarkMatrixCase = {
  id: string;
  name: string;
  tierId: string;
  dataset: BenchmarkDatasetSpec;
  acceptance: BenchmarkAcceptance;
};

export type BenchmarkHardwareTier = {
  id: string;
  label: string;
  notes?: string;
};

export type BenchmarkMatrixApprovalStatus = 'pending' | 'approved';

export type BenchmarkMatrixApproval = {
  status: BenchmarkMatrixApprovalStatus;
  approvedAt: string | null;
  approvedBy: string | null;
  notes?: string;
};

export type BenchmarkMatrixConfig = {
  version: string;
  updatedAt: string;
  approval: BenchmarkMatrixApproval;
  hardwareTiers: BenchmarkHardwareTier[];
  cases: BenchmarkMatrixCase[];
};

export function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0 || Math.floor(value) !== value) {
    throw new Error(`Invalid ${label}: expected positive integer, got ${value}`);
  }
}

function assertIsoDate(value: string, label: string): void {
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new Error(`Invalid ${label}: expected ISO date string.`);
  }
}

function assertBenchmarkDatasetSpec(dataset: BenchmarkDatasetSpec, caseId: string): void {
  assertPositiveInteger(dataset.width, `${caseId}.dataset.width`);
  assertPositiveInteger(dataset.height, `${caseId}.dataset.height`);
  assertPositiveInteger(dataset.depth, `${caseId}.dataset.depth`);
  assertPositiveInteger(dataset.channels, `${caseId}.dataset.channels`);
  assertPositiveInteger(dataset.timepoints, `${caseId}.dataset.timepoints`);
  if (!Array.isArray(dataset.chunkShape) || dataset.chunkShape.length !== 5) {
    throw new Error(`Invalid ${caseId}.dataset.chunkShape: expected 5 dimensions.`);
  }

  dataset.chunkShape.forEach((dim, index) => {
    assertPositiveInteger(dim, `${caseId}.dataset.chunkShape[${index}]`);
  });
  if (dataset.chunkShape[0] !== 1) {
    throw new Error(`Invalid ${caseId}.dataset.chunkShape[0]: expected 1 (time chunk).`);
  }
  if (dataset.chunkShape[4] !== dataset.channels) {
    throw new Error(
      `Invalid ${caseId}.dataset.chunkShape[4]: expected channels ${dataset.channels}, got ${dataset.chunkShape[4]}.`
    );
  }
  if (dataset.chunkShape[1] > dataset.depth) {
    throw new Error(
      `Invalid ${caseId}.dataset.chunkShape[1]: depth chunk ${dataset.chunkShape[1]} exceeds depth ${dataset.depth}.`
    );
  }
  if (dataset.chunkShape[2] > dataset.height) {
    throw new Error(
      `Invalid ${caseId}.dataset.chunkShape[2]: height chunk ${dataset.chunkShape[2]} exceeds height ${dataset.height}.`
    );
  }
  if (dataset.chunkShape[3] > dataset.width) {
    throw new Error(
      `Invalid ${caseId}.dataset.chunkShape[3]: width chunk ${dataset.chunkShape[3]} exceeds width ${dataset.width}.`
    );
  }
}

function assertBenchmarkAcceptance(acceptance: BenchmarkAcceptance, caseId: string): void {
  if (!Number.isFinite(acceptance.generationMaxMs) || acceptance.generationMaxMs <= 0) {
    throw new Error(`Invalid ${caseId}.acceptance.generationMaxMs`);
  }

  const loadStepKeys = Object.keys(acceptance.loadStepMaxMs);
  if (loadStepKeys.length !== BENCHMARK_LOAD_STEP_LABELS.length) {
    throw new Error(
      `Invalid ${caseId}.acceptance.loadStepMaxMs: expected ${BENCHMARK_LOAD_STEP_LABELS.length} labeled thresholds.`
    );
  }
  for (const label of BENCHMARK_LOAD_STEP_LABELS) {
    const maxMs = acceptance.loadStepMaxMs[label];
    if (!Number.isFinite(maxMs) || maxMs <= 0) {
      throw new Error(`Invalid ${caseId}.acceptance.loadStepMaxMs.${label}`);
    }
  }

  const atlasStepKeys = Object.keys(acceptance.atlasStepMaxMs);
  if (atlasStepKeys.length !== BENCHMARK_ATLAS_STEP_LABELS.length) {
    throw new Error(
      `Invalid ${caseId}.acceptance.atlasStepMaxMs: expected ${BENCHMARK_ATLAS_STEP_LABELS.length} labeled thresholds.`
    );
  }
  for (const label of BENCHMARK_ATLAS_STEP_LABELS) {
    const maxMs = acceptance.atlasStepMaxMs[label];
    if (!Number.isFinite(maxMs) || maxMs <= 0) {
      throw new Error(`Invalid ${caseId}.acceptance.atlasStepMaxMs.${label}`);
    }
  }

  if (!Number.isFinite(acceptance.chunkHitRateMin) || acceptance.chunkHitRateMin < 0 || acceptance.chunkHitRateMin > 1) {
    throw new Error(`Invalid ${caseId}.acceptance.chunkHitRateMin`);
  }

  if (!Number.isFinite(acceptance.scale1RequestMin) || acceptance.scale1RequestMin < 0) {
    throw new Error(`Invalid ${caseId}.acceptance.scale1RequestMin`);
  }
}

function normalizeBenchmarkMatrixApproval(raw: unknown): BenchmarkMatrixApproval {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid benchmark matrix config: missing approval object.');
  }

  const candidate = raw as Partial<BenchmarkMatrixApproval>;
  if (candidate.status !== 'pending' && candidate.status !== 'approved') {
    throw new Error('Invalid benchmark matrix config: approval.status must be "pending" or "approved".');
  }

  const approvedAt =
    candidate.approvedAt === null || candidate.approvedAt === undefined ? null : String(candidate.approvedAt);
  const approvedBy =
    candidate.approvedBy === null || candidate.approvedBy === undefined ? null : String(candidate.approvedBy);
  const notes =
    candidate.notes === undefined
      ? undefined
      : typeof candidate.notes === 'string'
        ? candidate.notes
        : String(candidate.notes);

  if (candidate.status === 'approved') {
    if (!approvedAt) {
      throw new Error('Invalid benchmark matrix config: approval.approvedAt is required when status is "approved".');
    }
    if (!approvedBy || approvedBy.trim().length === 0) {
      throw new Error('Invalid benchmark matrix config: approval.approvedBy is required when status is "approved".');
    }
    assertIsoDate(approvedAt, 'benchmark matrix approval.approvedAt');
  }

  if (approvedAt) {
    assertIsoDate(approvedAt, 'benchmark matrix approval.approvedAt');
  }

  return {
    status: candidate.status,
    approvedAt,
    approvedBy: approvedBy && approvedBy.trim().length > 0 ? approvedBy : null,
    ...(notes !== undefined ? { notes } : {})
  };
}

export function normalizeBenchmarkMatrixConfig(raw: unknown): BenchmarkMatrixConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid benchmark matrix config: expected object.');
  }
  const candidate = raw as Partial<BenchmarkMatrixConfig>;
  if (!candidate.version || typeof candidate.version !== 'string') {
    throw new Error('Invalid benchmark matrix config: missing version.');
  }
  if (!candidate.updatedAt || typeof candidate.updatedAt !== 'string') {
    throw new Error('Invalid benchmark matrix config: missing updatedAt.');
  }
  assertIsoDate(candidate.updatedAt, 'benchmark matrix updatedAt');

  const approval = normalizeBenchmarkMatrixApproval(candidate.approval);

  if (!Array.isArray(candidate.hardwareTiers) || candidate.hardwareTiers.length === 0) {
    throw new Error('Invalid benchmark matrix config: hardwareTiers must be non-empty.');
  }
  if (!Array.isArray(candidate.cases) || candidate.cases.length === 0) {
    throw new Error('Invalid benchmark matrix config: cases must be non-empty.');
  }

  const tierIds = new Set<string>();
  for (const tier of candidate.hardwareTiers) {
    if (!tier || typeof tier !== 'object') {
      throw new Error('Invalid benchmark matrix config: bad hardware tier entry.');
    }
    const id = (tier as Partial<BenchmarkHardwareTier>).id;
    const label = (tier as Partial<BenchmarkHardwareTier>).label;
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid benchmark matrix config: hardware tier missing id.');
    }
    if (!label || typeof label !== 'string') {
      throw new Error(`Invalid benchmark matrix config: hardware tier "${id}" missing label.`);
    }
    if (tierIds.has(id)) {
      throw new Error(`Invalid benchmark matrix config: duplicate hardware tier id "${id}".`);
    }
    tierIds.add(id);
  }

  const caseIds = new Set<string>();
  for (const caseEntry of candidate.cases) {
    if (!caseEntry || typeof caseEntry !== 'object') {
      throw new Error('Invalid benchmark matrix config: bad case entry.');
    }
    const benchmarkCase = caseEntry as Partial<BenchmarkMatrixCase>;
    if (!benchmarkCase.id || typeof benchmarkCase.id !== 'string') {
      throw new Error('Invalid benchmark matrix config: case missing id.');
    }
    if (caseIds.has(benchmarkCase.id)) {
      throw new Error(`Invalid benchmark matrix config: duplicate case id "${benchmarkCase.id}".`);
    }
    caseIds.add(benchmarkCase.id);

    if (!benchmarkCase.name || typeof benchmarkCase.name !== 'string') {
      throw new Error(`Invalid benchmark matrix config: case "${benchmarkCase.id}" missing name.`);
    }
    if (!benchmarkCase.tierId || typeof benchmarkCase.tierId !== 'string') {
      throw new Error(`Invalid benchmark matrix config: case "${benchmarkCase.id}" missing tierId.`);
    }
    if (!tierIds.has(benchmarkCase.tierId)) {
      throw new Error(
        `Invalid benchmark matrix config: case "${benchmarkCase.id}" references unknown tier "${benchmarkCase.tierId}".`
      );
    }
    if (!benchmarkCase.dataset) {
      throw new Error(`Invalid benchmark matrix config: case "${benchmarkCase.id}" missing dataset.`);
    }
    if (!benchmarkCase.acceptance) {
      throw new Error(`Invalid benchmark matrix config: case "${benchmarkCase.id}" missing acceptance.`);
    }
    assertBenchmarkDatasetSpec(benchmarkCase.dataset, benchmarkCase.id);
    assertBenchmarkAcceptance(benchmarkCase.acceptance, benchmarkCase.id);
  }

  return {
    version: candidate.version,
    updatedAt: candidate.updatedAt,
    approval,
    hardwareTiers: candidate.hardwareTiers,
    cases: candidate.cases
  };
}

export function assertBenchmarkMatrixApprovedForThresholdEnforcement({
  config,
  enforceThresholds,
  allowUnapprovedMatrix
}: {
  config: BenchmarkMatrixConfig;
  enforceThresholds: boolean;
  allowUnapprovedMatrix: boolean;
}): void {
  if (!enforceThresholds || allowUnapprovedMatrix) {
    return;
  }

  if (config.approval.status !== 'approved') {
    throw new Error(
      'Benchmark matrix thresholds are enforced, but matrix approval is not complete (approval.status !== "approved").'
    );
  }
}
