import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const DEFAULT_TEST_PATTERNS = ['tests/**/*.test.ts', 'tests/**/*.test.tsx'];

const hasGlobSyntax = (value) => /[*?[\]{}()!+@]/.test(value);

const normalizePosixPath = (value) => value.replace(/\\/g, '/');

const resolvePatternInputs = (inputs) => {
  if (inputs.length === 0) {
    return DEFAULT_TEST_PATTERNS;
  }

  const patterns = [];

  for (const input of inputs) {
    if (!input) {
      continue;
    }

    if (hasGlobSyntax(input)) {
      patterns.push(input);
      continue;
    }

    const absoluteCandidate = path.resolve(process.cwd(), input);
    if (fs.existsSync(absoluteCandidate) && fs.statSync(absoluteCandidate).isDirectory()) {
      const normalized = normalizePosixPath(input).replace(/\/+$/, '');
      patterns.push(`${normalized}/**/*.test.ts`);
      patterns.push(`${normalized}/**/*.test.tsx`);
      continue;
    }

    patterns.push(input);
  }

  return patterns.length > 0 ? patterns : DEFAULT_TEST_PATTERNS;
};

const args = process.argv.slice(2);
const runnerFlags = [];
const patternInputs = [];

for (const arg of args) {
  if (arg.startsWith('-')) {
    runnerFlags.push(arg);
  } else {
    patternInputs.push(arg);
  }
}

const patterns = resolvePatternInputs(patternInputs);
const nodeArgs = ['--import', 'tsx', '--test', ...runnerFlags, ...patterns];
const result = spawnSync(process.execPath, nodeArgs, {
  env: process.env,
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}
if (result.error) {
  throw result.error;
}
process.exit(1);
