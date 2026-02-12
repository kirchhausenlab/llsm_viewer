#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "[verify:nightly] starting at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
npm run verify:full
npm run test:e2e:nightly
echo "[verify:nightly] completed at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
