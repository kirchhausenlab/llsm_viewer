import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const TEST_ROOT = path.resolve('tests');
const DEFAULT_EXCLUDED_DIRECTORIES = new Set(['e2e', 'perf', 'visual', 'fixtures', 'helpers']);
const COMPATIBILITY_IGNORED_ARGS = new Set(['--runInBand']);

function collectDefaultTestFiles(rootDir) {
  const discovered = [];

  const visit = (currentDir) => {
    const entries = readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const resolvedPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(rootDir, resolvedPath);
      const segments = relativePath.split(path.sep).filter(Boolean);

      if (entry.isDirectory()) {
        if (DEFAULT_EXCLUDED_DIRECTORIES.has(entry.name)) {
          continue;
        }
        visit(resolvedPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (!relativePath.endsWith('.test.ts') && !relativePath.endsWith('.test.tsx')) {
        continue;
      }

      if (segments.some((segment) => DEFAULT_EXCLUDED_DIRECTORIES.has(segment))) {
        continue;
      }

      discovered.push(path.join('tests', relativePath).split(path.sep).join('/'));
    }
  };

  if (statSync(rootDir).isDirectory()) {
    visit(rootDir);
  }

  return discovered;
}

const forwardedArgs = process.argv.slice(2).filter((arg) => !COMPATIBILITY_IGNORED_ARGS.has(arg));
const hasExplicitTargets = forwardedArgs.some((arg) => !arg.startsWith('-'));
const nodeArgs = ['--import', 'tsx', '--test', ...forwardedArgs];

if (!hasExplicitTargets) {
  nodeArgs.push(...collectDefaultTestFiles(TEST_ROOT));
}

const child = spawn(process.execPath, nodeArgs, {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
