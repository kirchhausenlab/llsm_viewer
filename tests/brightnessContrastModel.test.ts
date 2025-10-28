import assert from 'node:assert/strict';

import {
  BrightnessContrastModel,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  MIN_WINDOW_WIDTH
} from '../src/state/brightnessContrastModel.ts';

console.log('Starting brightness/contrast model tests');

try {
  const model = new BrightnessContrastModel(DEFAULT_WINDOW_MIN, DEFAULT_WINDOW_MAX);
  const initialState = model.createState();

  const initialWidth = initialState.windowMax - initialState.windowMin;

  const brightnessTarget = model.sliderRange + 50;
  const brightnessResult = model.applyBrightness(initialState, brightnessTarget);
  const expectedBrightness = Math.min(
    Math.max(Math.round(brightnessTarget), 0),
    model.sliderRange
  );

  assert.equal(brightnessResult.brightnessSliderIndex, expectedBrightness);
  assert.equal(brightnessResult.windowMax - brightnessResult.windowMin, initialWidth);
  assert(brightnessResult.windowMin < DEFAULT_WINDOW_MIN);
  assert(brightnessResult.windowMax < DEFAULT_WINDOW_MAX);
  assert.equal(brightnessResult.minSliderIndex, 0);

  const brightenResult = model.applyBrightness(initialState, 0);
  assert.equal(brightenResult.brightnessSliderIndex, 0);
  assert.equal(brightenResult.windowMax - brightenResult.windowMin, initialWidth);
  assert(brightenResult.windowMin > DEFAULT_WINDOW_MIN);
  assert(brightenResult.windowMax > DEFAULT_WINDOW_MAX);
  assert.equal(brightenResult.maxSliderIndex, Math.max(model.sliderRange - 1, 0));

  const widenContrastTarget = Math.round(model.sliderRange * 0.25);
  const widenContrastResult = model.applyContrast(initialState, widenContrastTarget);
  const expectedWidenContrast = Math.min(
    Math.max(Math.round(widenContrastTarget), 0),
    model.sliderRange
  );

  assert.equal(widenContrastResult.contrastSliderIndex, expectedWidenContrast);
  const widenedWidth = widenContrastResult.windowMax - widenContrastResult.windowMin;
  assert(widenedWidth > initialWidth);
  assert(widenContrastResult.windowMin < DEFAULT_WINDOW_MIN);
  assert(widenContrastResult.windowMax > DEFAULT_WINDOW_MAX);
  assert.equal(widenContrastResult.minSliderIndex, 0);
  assert.equal(widenContrastResult.maxSliderIndex, Math.max(model.sliderRange - 1, 0));

  const narrowContrastTarget = Math.round(model.sliderRange * 0.75);
  const narrowContrastResult = model.applyContrast(initialState, narrowContrastTarget);
  const expectedNarrowContrast = Math.min(
    Math.max(Math.round(narrowContrastTarget), 0),
    model.sliderRange
  );

  assert.equal(narrowContrastResult.contrastSliderIndex, expectedNarrowContrast);
  const narrowedWidth = narrowContrastResult.windowMax - narrowContrastResult.windowMin;
  assert(narrowedWidth < initialWidth);

  const narrowedState = model.applyWindow(0.4, 0.6);
  const collapsedFromMax = model.applyWindow(narrowedState.windowMin, 0.4);
  assert(collapsedFromMax.windowMin > DEFAULT_WINDOW_MIN);
  assert(collapsedFromMax.windowMax < DEFAULT_WINDOW_MAX);
  assert(Math.abs(collapsedFromMax.windowMax - collapsedFromMax.windowMin - MIN_WINDOW_WIDTH) < 1e-6);

  const collapsedFromMin = model.applyWindow(0.6, narrowedState.windowMax);
  assert(collapsedFromMin.windowMax < DEFAULT_WINDOW_MAX);
  assert(collapsedFromMin.windowMin > DEFAULT_WINDOW_MIN);
  assert(Math.abs(collapsedFromMin.windowMax - collapsedFromMin.windowMin - MIN_WINDOW_WIDTH) < 1e-6);

  console.log('brightness/contrast model tests passed');
} catch (error) {
  console.error('brightness/contrast model tests failed');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
}
