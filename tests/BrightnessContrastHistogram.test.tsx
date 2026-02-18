import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import BrightnessContrastHistogram from '../src/components/viewers/BrightnessContrastHistogram.tsx';
import type { NormalizedVolume } from '../src/core/volumeProcessing.ts';

console.log('Starting BrightnessContrastHistogram tests');

const createVolume = (): NormalizedVolume => {
  const histogram = new Uint32Array(256);
  histogram[128] = 16;

  return {
    width: 4,
    height: 4,
    depth: 1,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(16).fill(128),
    histogram,
    min: 0,
    max: 255
  };
};

const baseProps = {
  windowMin: 0,
  windowMax: 1,
  defaultMin: 0,
  defaultMax: 1,
  sliderRange: 100
};

const countHistogramAreas = (renderer: TestRenderer.ReactTestRenderer): number =>
  renderer.root.findAll(
    (node) => node.type === 'path' && node.props.className === 'brightness-contrast-histogram__area'
  ).length;

const flushTimers = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

await (async () => {
  const volume = createVolume();
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(
      <BrightnessContrastHistogram volume={volume} isPlaying={false} {...baseProps} />
    );
  });

  await flushTimers();
  assert.equal(countHistogramAreas(renderer!), 1);
  renderer!.unmount();
})();

await (async () => {
  const volume = createVolume();
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(
      <BrightnessContrastHistogram volume={volume} isPlaying={false} {...baseProps} />
    );
  });

  act(() => {
    renderer!.update(<BrightnessContrastHistogram volume={volume} isPlaying {...baseProps} />);
  });

  act(() => {
    renderer!.update(
      <BrightnessContrastHistogram volume={volume} isPlaying={false} {...baseProps} />
    );
  });

  await flushTimers();
  assert.equal(countHistogramAreas(renderer!), 1);
  renderer!.unmount();
})();

await (async () => {
  const histogram = new Uint32Array(256);
  histogram[64] = 7;
  let renderer: TestRenderer.ReactTestRenderer;

  act(() => {
    renderer = TestRenderer.create(
      <BrightnessContrastHistogram
        volume={null}
        histogram={histogram}
        isPlaying={false}
        {...baseProps}
      />
    );
  });

  await flushTimers();
  assert.equal(countHistogramAreas(renderer!), 1);
  renderer!.unmount();
})();

console.log('BrightnessContrastHistogram tests passed');
