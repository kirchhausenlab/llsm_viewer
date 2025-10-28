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

  const brightnessTarget = model.sliderRange + 50;
  const brightnessResult = model.applyBrightness(initialState, brightnessTarget);
  const expectedBrightness = Math.min(
    Math.max(Math.round(brightnessTarget), 0),
    model.sliderRange
  );

  assert.equal(brightnessResult.brightnessSliderIndex, expectedBrightness);
  const initialWidth = initialState.windowMax - initialState.windowMin;
  const expectedWindowMaxAfterDarken = Math.min(
    DEFAULT_WINDOW_MAX,
    DEFAULT_WINDOW_MIN + initialWidth / 2
  );
  assert.equal(brightnessResult.windowMin, DEFAULT_WINDOW_MIN);
  assert.equal(brightnessResult.windowMax, expectedWindowMaxAfterDarken);

  const brightenResult = model.applyBrightness(initialState, 0);
  assert.equal(brightenResult.brightnessSliderIndex, 0);
  const expectedWindowMinAfterBrighten = Math.max(
    DEFAULT_WINDOW_MIN,
    DEFAULT_WINDOW_MAX - initialWidth / 2
  );
  assert.equal(brightenResult.windowMin, expectedWindowMinAfterBrighten);
  assert.equal(brightenResult.windowMax, DEFAULT_WINDOW_MAX);

  const contrastTarget = model.sliderRange + 50;
  const contrastResult = model.applyContrast(initialState, contrastTarget);
  const expectedContrast = Math.min(Math.max(Math.round(contrastTarget), 0), model.sliderRange);

  assert.equal(contrastResult.contrastSliderIndex, expectedContrast);
  assert.equal(contrastResult.windowMin, DEFAULT_WINDOW_MIN);
  assert.equal(contrastResult.windowMax, DEFAULT_WINDOW_MAX);

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
