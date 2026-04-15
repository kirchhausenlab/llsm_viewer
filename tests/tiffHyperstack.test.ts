import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseImagejHyperstackLayout, resolveImagejPageChannelLayout } from '../src/shared/utils/tiffHyperstack.ts';

test('parseImagejHyperstackLayout reads ImageJ hyperstack metadata', () => {
  const layout = parseImagejHyperstackLayout(
    'ImageJ=1.54f\nimages=477\nchannels=3\nslices=159\nhyperstack=true\nmode=composite\nloop=false\n'
  );
  assert.deepEqual(layout, {
    channels: 3,
    slices: 159,
    frames: 1,
    images: 477
  });
});

test('resolveImagejPageChannelLayout treats page-stored channels as logical channels', () => {
  const layout = resolveImagejPageChannelLayout({
    samplesPerPixel: 1,
    imageCount: 477,
    imageDescription: 'ImageJ=1.54f\nimages=477\nchannels=3\nslices=159\nhyperstack=true\n'
  });
  assert.deepEqual(layout, {
    channels: 3,
    slices: 159,
    frames: 1,
    images: 477
  });
});

test('resolveImagejPageChannelLayout ignores ordinary grayscale stacks', () => {
  const layout = resolveImagejPageChannelLayout({
    samplesPerPixel: 1,
    imageCount: 159,
    imageDescription: 'ImageJ=1.54f\nimages=159\nslices=159\nhyperstack=false\n'
  });
  assert.equal(layout, null);
});
