import assert from 'node:assert/strict';

import { renderHook } from './hooks/renderHook.ts';
import { usePaintbrush } from '../src/hooks/paintbrush/usePaintbrush.ts';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';

console.log('Starting usePaintbrush tests');

const createPrimaryVolume = ({ width, height, depth }: { width: number; height: number; depth: number }) => {
  const voxelCount = width * height * depth;
  const normalized = new Uint8Array(voxelCount);
  const volume: NormalizedVolume = {
    width,
    height,
    depth,
    channels: 1,
    dataType: 'uint8',
    normalized,
    min: 0,
    max: 255,
  };
  return volume;
};

const readVoxelRgba = (volume: NormalizedVolume, x: number, y: number, z: number) => {
  const width = volume.width;
  const height = volume.height;
  const index = z * width * height + y * width + x;
  const base = index * 4;
  const data = volume.normalized;
  return {
    r: data[base] ?? 0,
    g: data[base + 1] ?? 0,
    b: data[base + 2] ?? 0,
    a: data[base + 3] ?? 0,
  };
};

(() => {
  const primary = createPrimaryVolume({ width: 3, height: 3, depth: 2 });
  const hook = renderHook(() => usePaintbrush({ primaryVolume: primary, resetSignal: 0 }));

  hook.act(() => {
    hook.result.setColor('#ff0000');
    hook.result.setRadius(1);
    hook.result.setMode('brush');
  });
  hook.rerender();

  hook.act(() => {
    hook.result.beginStroke();
    hook.result.applyStrokeAt({ x: 1, y: 1, z: 0 });
    hook.result.endStroke();
  });

  const paintVolume = hook.result.paintVolume;
  assert.ok(paintVolume);
  const voxel = readVoxelRgba(paintVolume, 1, 1, 0);
  assert.deepStrictEqual(voxel, { r: 255, g: 0, b: 0, a: 255 });
  assert.strictEqual(hook.result.labelCount, 1);
  assert.strictEqual(hook.result.canUndo, true);
  assert.strictEqual(hook.result.canRedo, false);

  hook.act(() => hook.result.undo());
  const cleared = readVoxelRgba(paintVolume, 1, 1, 0);
  assert.deepStrictEqual(cleared, { r: 0, g: 0, b: 0, a: 0 });
  assert.strictEqual(hook.result.labelCount, 0);
  assert.strictEqual(hook.result.canRedo, true);

  hook.act(() => hook.result.redo());
  const restored = readVoxelRgba(paintVolume, 1, 1, 0);
  assert.deepStrictEqual(restored, { r: 255, g: 0, b: 0, a: 255 });
  assert.strictEqual(hook.result.labelCount, 1);

  hook.act(() => hook.result.clear());
  const clearedAgain = readVoxelRgba(paintVolume, 1, 1, 0);
  assert.deepStrictEqual(clearedAgain, { r: 0, g: 0, b: 0, a: 0 });
  assert.strictEqual(hook.result.canUndo, false);
  assert.strictEqual(hook.result.canRedo, false);
})();

(() => {
  const primary = createPrimaryVolume({ width: 3, height: 3, depth: 1 });
  const hook = renderHook(() => usePaintbrush({ primaryVolume: primary, resetSignal: 0 }));

  hook.act(() => {
    hook.result.setColor('#00ff00');
    hook.result.setRadius(1);
  });
  hook.rerender();

  hook.act(() => {
    hook.result.beginStroke();
    hook.result.applyStrokeAt({ x: 0, y: 0, z: 0 });
    hook.result.endStroke();
  });

  hook.act(() => {
    hook.result.setMode('eraser');
  });
  hook.rerender();

  hook.act(() => {
    hook.result.beginStroke();
    hook.result.applyStrokeAt({ x: 0, y: 0, z: 0 });
    hook.result.endStroke();
  });

  const paintVolume = hook.result.paintVolume;
  assert.ok(paintVolume);
  const voxel = readVoxelRgba(paintVolume, 0, 0, 0);
  assert.deepStrictEqual(voxel, { r: 0, g: 0, b: 0, a: 0 });
  assert.strictEqual(hook.result.labelCount, 0);
})();

(() => {
  const primary = createPrimaryVolume({ width: 2, height: 2, depth: 1 });
  const hook = renderHook(() => usePaintbrush({ primaryVolume: primary, resetSignal: 0 }));

  hook.act(() => {
    hook.result.setColor('#000000');
  });
  hook.rerender();

  hook.act(() => {
    hook.result.beginStroke();
    hook.result.applyStrokeAt({ x: 0, y: 0, z: 0 });
    hook.result.endStroke();
  });

  assert.strictEqual(hook.result.color, '#000001');
  assert.strictEqual(hook.result.labelCount, 1);

  const originalRandom = Math.random;
  let calls = 0;
  Math.random = () => {
    calls += 1;
    if (calls === 1) {
      return 1 / 0xffffff; // candidate #000001 is already used
    }
    return 2 / 0xffffff; // candidate #000002
  };

  try {
    hook.act(() => hook.result.pickRandomUnusedColor());
  } finally {
    Math.random = originalRandom;
  }

  assert.strictEqual(hook.result.color, '#000002');
})();

console.log('usePaintbrush tests passed');
