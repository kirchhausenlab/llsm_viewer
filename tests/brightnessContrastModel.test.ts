import { describe, expect, it } from 'vitest';

import {
  BrightnessContrastModel,
  DEFAULT_WINDOW_MAX,
  DEFAULT_WINDOW_MIN,
  MIN_WINDOW_WIDTH
} from '../src/state/brightnessContrastModel.ts';

describe('BrightnessContrastModel', () => {
  it('adjusts brightness while preserving contrast bounds', () => {
    const model = new BrightnessContrastModel(DEFAULT_WINDOW_MIN, DEFAULT_WINDOW_MAX);
    const initialState = model.createState();
    const initialWidth = initialState.windowMax - initialState.windowMin;

    const brightnessTarget = model.sliderRange + 50;
    const adjusted = model.applyBrightness(initialState, brightnessTarget);

    expect(adjusted.brightnessSliderIndex).toBe(
      Math.min(Math.max(Math.round(brightnessTarget), 0), model.sliderRange)
    );
    expect(adjusted.windowMax - adjusted.windowMin).toBe(initialWidth);
    expect(adjusted.windowMin).toBeLessThan(DEFAULT_WINDOW_MIN);
    expect(adjusted.windowMax).toBeLessThan(DEFAULT_WINDOW_MAX);

    const darkened = model.applyBrightness(initialState, 0);
    expect(darkened.brightnessSliderIndex).toBe(0);
    expect(darkened.windowMax - darkened.windowMin).toBe(initialWidth);
    expect(darkened.windowMin).toBeGreaterThan(DEFAULT_WINDOW_MIN);
    expect(darkened.windowMax).toBeGreaterThan(DEFAULT_WINDOW_MAX);
  });

  it('adjusts contrast symmetrically around the midpoint', () => {
    const model = new BrightnessContrastModel(DEFAULT_WINDOW_MIN, DEFAULT_WINDOW_MAX);
    const initialState = model.createState();
    const initialWidth = initialState.windowMax - initialState.windowMin;

    const widenTarget = Math.round(model.sliderRange * 0.25);
    const widened = model.applyContrast(initialState, widenTarget);
    expect(widened.contrastSliderIndex).toBe(
      Math.min(Math.max(Math.round(widenTarget), 0), model.sliderRange)
    );
    expect(widened.windowMax - widened.windowMin).toBeGreaterThan(initialWidth);
    expect(widened.windowMin).toBeLessThan(DEFAULT_WINDOW_MIN);
    expect(widened.windowMax).toBeGreaterThan(DEFAULT_WINDOW_MAX);

    const narrowTarget = Math.round(model.sliderRange * 0.75);
    const narrowed = model.applyContrast(initialState, narrowTarget);
    expect(narrowed.contrastSliderIndex).toBe(
      Math.min(Math.max(Math.round(narrowTarget), 0), model.sliderRange)
    );
    expect(narrowed.windowMax - narrowed.windowMin).toBeLessThan(initialWidth);
  });

  it('enforces minimum window width when endpoints collapse', () => {
    const model = new BrightnessContrastModel(DEFAULT_WINDOW_MIN, DEFAULT_WINDOW_MAX);
    const narrowed = model.applyWindow(0.4, 0.6);

    const collapseFromMax = model.applyWindow(narrowed.windowMin, 0.4);
    expect(collapseFromMax.windowMin).toBeGreaterThan(DEFAULT_WINDOW_MIN);
    expect(collapseFromMax.windowMax).toBeLessThan(DEFAULT_WINDOW_MAX);
    expect(Math.abs(collapseFromMax.windowMax - collapseFromMax.windowMin - MIN_WINDOW_WIDTH)).toBeLessThan(1e-6);

    const collapseFromMin = model.applyWindow(0.6, narrowed.windowMax);
    expect(collapseFromMin.windowMax).toBeLessThan(DEFAULT_WINDOW_MAX);
    expect(collapseFromMin.windowMin).toBeGreaterThan(DEFAULT_WINDOW_MIN);
    expect(Math.abs(collapseFromMin.windowMax - collapseFromMin.windowMin - MIN_WINDOW_WIDTH)).toBeLessThan(1e-6);
  });
});
