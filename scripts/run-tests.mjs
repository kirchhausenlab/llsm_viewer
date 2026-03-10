import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['--import', 'tsx', 'tests/runTests.ts'], {
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
