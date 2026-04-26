import assert from 'node:assert/strict';

import { renderHook } from './hooks/renderHook.ts';
import { useAnnotate } from '../src/hooks/annotation/useAnnotate.ts';
import {
  buildEditableSegmentationBrickAtlas,
  createEditableSegmentationChannel,
  getEditableTimepointLabels,
  getOrCreateEditableTimepointLabels,
} from '../src/shared/utils/annotation/editableSegmentationState.ts';

console.log('Starting useAnnotate tests');

const defaultOptions = {
  available: true,
  dimensions: { width: 3, height: 3, depth: 2 },
  volumeCount: 2,
  currentTimepoint: 0,
  resetSignal: 0,
  baseChannelNames: [] as string[],
  regularSegmentationSources: [],
  loadRegularSegmentationSource: async () => {
    throw new Error('Unexpected regular segmentation load.');
  },
  saveEditableChannel: async () => {},
};

async function createActiveChannel() {
  const hook = renderHook(() => useAnnotate(defaultOptions));
  hook.act(() => {
    hook.result.setCreationName('Annotation');
  });
  await hook.act(async () => {
    await hook.result.createChannel();
  });
  hook.rerender();
  assert.equal(hook.result.channels.length, 1);
  assert.equal(hook.result.activeChannel?.labels.length, 1);
  return hook;
}

function readLabel(hook: Awaited<ReturnType<typeof createActiveChannel>>, x: number, y: number, z: number) {
  const channel = hook.result.activeChannel;
  assert.ok(channel);
  const labels = getEditableTimepointLabels(channel, 0);
  const index = (z * channel.dimensions.height + y) * channel.dimensions.width + x;
  return labels?.[index] ?? 0;
}

(() => {
  const channel = createEditableSegmentationChannel({
    channelId: 'annotate-1',
    layerKey: 'annotate-layer-1',
    name: 'Annotation',
    dimensions: { width: 33, height: 33, depth: 33 },
    volumeCount: 1,
    createdFrom: { kind: 'empty' },
  });
  const labels = getOrCreateEditableTimepointLabels(channel, 0);
  labels[(32 * 33 + 32) * 33 + 32] = 1;

  const atlas = buildEditableSegmentationBrickAtlas({ channel, timepoint: 0 });
  const levels = atlas.pageTable.skipHierarchy.levels;
  assert.deepEqual(levels[0]?.gridShape, [2, 2, 2]);
  assert.deepEqual(levels[levels.length - 1]?.gridShape, [1, 1, 1]);
  for (const level of levels) {
    const expectedLength = level.gridShape[0] * level.gridShape[1] * level.gridShape[2];
    assert.equal(level.occupancy.length, expectedLength);
    assert.equal(level.min.length, expectedLength);
    assert.equal(level.max.length, expectedLength);
  }
  assert.equal(levels[levels.length - 1]?.occupancy[0], 255);
})();

(() => {
  const hook = renderHook(() =>
    useAnnotate({
      ...defaultOptions,
      available: false,
      unavailableReason: 'No write access.',
    })
  );

  hook.act(() => {
    void hook.result.createChannel();
  });
  hook.rerender();

  assert.equal(hook.result.channels.length, 0);
  assert.equal(hook.result.message, 'No write access.');
  hook.unmount();
})();

await (async () => {
  const hook = await createActiveChannel();

  hook.act(() => {
    hook.result.setEnabled(true);
    hook.result.setMode('2d');
    hook.result.setRadius(1);
  });
  hook.rerender();

  hook.act(() => {
    hook.result.beginStroke();
    hook.result.applyStrokeAt({ x: 1, y: 1, z: 0 });
    hook.result.endStroke();
  });
  hook.rerender();

  assert.equal(readLabel(hook, 1, 1, 0), 1);
  assert.equal(readLabel(hook, 1, 1, 1), 0);
  assert.equal(hook.result.hasDirtyChannels, true);
  assert.equal(hook.result.canUndo, true);

  hook.act(() => hook.result.undo());
  hook.rerender();
  assert.equal(readLabel(hook, 1, 1, 0), 0);
  assert.equal(hook.result.canRedo, true);

  hook.act(() => hook.result.redo());
  hook.rerender();
  assert.equal(readLabel(hook, 1, 1, 0), 1);

  hook.act(() => {
    hook.result.setBrushMode('eraser');
    hook.result.beginStroke();
    hook.result.applyStrokeAt({ x: 1, y: 1, z: 0 });
    hook.result.endStroke();
  });
  hook.rerender();
  assert.equal(readLabel(hook, 1, 1, 0), 0);

  hook.unmount();
})();

await (async () => {
  const hook = await createActiveChannel();
  const previousPrompt = globalThis.prompt;
  (globalThis as { prompt?: (message?: string, defaultValue?: string) => string | null }).prompt = () => 'Nucleus';

  try {
    hook.act(() => {
      hook.result.addLabel();
      hook.result.renameActiveLabel();
    });
    hook.rerender();
  } finally {
    globalThis.prompt = previousPrompt;
  }

  assert.equal(hook.result.activeChannel?.labels.length, 2);
  assert.equal(hook.result.activeChannel?.labels[1]?.name, 'Nucleus');
  assert.equal(hook.result.activeChannel?.activeLabelIndex, 1);
  assert.equal(hook.result.canUndo, true);

  hook.act(() => hook.result.undo());
  hook.rerender();
  assert.equal(hook.result.activeChannel?.labels[1]?.name, '');

  hook.act(() => hook.result.undo());
  hook.rerender();
  assert.equal(hook.result.activeChannel?.labels.length, 1);

  hook.act(() => hook.result.redo());
  hook.rerender();
  assert.equal(hook.result.activeChannel?.labels.length, 2);

  hook.unmount();
})();

console.log('useAnnotate tests passed');
