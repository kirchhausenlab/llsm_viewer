import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SNAPSHOT_DIR = path.resolve(process.cwd(), 'tests/visual/snapshots');

function ensureSnapshotDirectory() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

export function assertVisualSnapshot(snapshotName: string, serializedTree: string) {
  ensureSnapshotDirectory();
  const snapshotPath = path.join(SNAPSHOT_DIR, `${snapshotName}.json`);
  const shouldUpdate = process.env.UPDATE_VISUAL_SNAPSHOTS === '1';

  if (shouldUpdate || !fs.existsSync(snapshotPath)) {
    fs.writeFileSync(snapshotPath, serializedTree);
    return;
  }

  const expected = fs.readFileSync(snapshotPath, 'utf8');
  assert.equal(
    serializedTree,
    expected,
    `Visual snapshot mismatch for "${snapshotName}". Run: npm run test:visual:update`
  );
}
