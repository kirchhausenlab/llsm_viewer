const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const DEFAULT_WINDOW_MIN = 0;
export const DEFAULT_WINDOW_MAX = 1;
export const MIN_WINDOW_WIDTH = 0.0001;

export type SliderKey = 'min' | 'max' | 'brightness' | 'contrast';

export type SliderIndices = {
  minSliderIndex: number;
  maxSliderIndex: number;
  brightnessSliderIndex: number;
  contrastSliderIndex: number;
};

export type WindowBounds = {
  windowMin: number;
  windowMax: number;
};

export type BrightnessContrastState = WindowBounds &
  SliderIndices & {
    sliderRange: number;
  };

export class BrightnessContrastModel {
  readonly defaultMin: number;
  readonly defaultMax: number;
  readonly sliderRange: number;

  constructor(
    defaultMin: number,
    defaultMax: number,
    initialWindow: WindowBounds | null = null
  ) {
    this.defaultMin = defaultMin;
    this.defaultMax = defaultMax;
    const initial = initialWindow ?? { windowMin: defaultMin, windowMax: defaultMax };
    this.sliderRange = this.computeSliderRange(initial.windowMin, initial.windowMax);
  }

  createState(windowMin?: number, windowMax?: number): BrightnessContrastState {
    const min = windowMin ?? this.defaultMin;
    const max = windowMax ?? this.defaultMax;
    return this.syncState({ windowMin: min, windowMax: max });
  }

  applyWindow(windowMin: number, windowMax: number): BrightnessContrastState {
    return this.syncState({ windowMin, windowMax });
  }

  applyMin(
    state: BrightnessContrastState,
    sliderIndex: number
  ): BrightnessContrastState {
    const clampedIndex = this.clampSliderIndex(sliderIndex, 'min');
    const range = this.defaultMax - this.defaultMin;
    const denom = Math.max(this.sliderRange - 1, 1);
    let windowMin = this.defaultMin;
    if (range > 0) {
      windowMin = this.defaultMin + (clampedIndex * range) / denom;
    }
    let windowMax = state.windowMax;
    if (windowMax > this.defaultMax) {
      windowMax = this.defaultMax;
    }
    if (windowMin > windowMax) {
      windowMax = windowMin;
    }
    return this.syncState({ windowMin, windowMax });
  }

  applyMax(
    state: BrightnessContrastState,
    sliderIndex: number
  ): BrightnessContrastState {
    const clampedIndex = this.clampSliderIndex(sliderIndex, 'max');
    const range = this.defaultMax - this.defaultMin;
    const denom = Math.max(this.sliderRange - 1, 1);
    let windowMax = this.defaultMin;
    if (range > 0) {
      windowMax = this.defaultMin + (clampedIndex * range) / denom;
    }
    let windowMin = state.windowMin;
    if (windowMin < this.defaultMin) {
      windowMin = this.defaultMin;
    }
    if (windowMax < windowMin) {
      windowMin = windowMax;
    }
    return this.syncState({ windowMin, windowMax });
  }

  applyBrightness(
    state: BrightnessContrastState,
    sliderIndex: number
  ): BrightnessContrastState {
    const clampedIndex = this.clampSliderIndex(sliderIndex, 'brightness');
    const range = this.defaultMax - this.defaultMin;
    const normalized = this.sliderRange > 0 ? (this.sliderRange - clampedIndex) / this.sliderRange : 0;
    const center = this.defaultMin + range * normalized;
    const width = state.windowMax - state.windowMin;
    const halfWidth = width / 2;
    const windowMin = center - halfWidth;
    const windowMax = center + halfWidth;
    return this.syncState(
      { windowMin, windowMax },
      { brightnessSliderIndex: clampedIndex }
    );
  }

  applyContrast(
    state: BrightnessContrastState,
    sliderIndex: number
  ): BrightnessContrastState {
    const clampedIndex = this.clampSliderIndex(sliderIndex, 'contrast');
    const range = this.defaultMax - this.defaultMin;
    const mid = this.sliderRange / 2;
    const center = state.windowMin + (state.windowMax - state.windowMin) / 2;
    let slope = 0;
    if (clampedIndex <= mid) {
      slope = mid === 0 ? 0 : clampedIndex / mid;
    } else {
      const denom = this.sliderRange - clampedIndex;
      slope = denom === 0 ? Number.POSITIVE_INFINITY : mid / denom;
    }
    if (!(slope > 0) || !Number.isFinite(slope)) {
      return this.syncState(
        { windowMin: state.windowMin, windowMax: state.windowMax },
        { contrastSliderIndex: clampedIndex }
      );
    }
    const halfRange = (0.5 * range) / slope;
    const windowMin = center - halfRange;
    const windowMax = center + halfRange;
    return this.syncState(
      { windowMin, windowMax },
      { contrastSliderIndex: clampedIndex }
    );
  }

  computeSliderIndices(windowMin: number, windowMax: number): SliderIndices {
    const clamped = this.clampWindow(windowMin, windowMax);
    const { windowMin: safeMin, windowMax: safeMax } = clamped;
    const range = this.defaultMax - this.defaultMin;
    const denom = Math.max(this.sliderRange - 1, 1);
    const width = safeMax - safeMin;
    const level = safeMin + width / 2;
    const minIndex = this.clampSliderIndex(
      range > 0 ? ((safeMin - this.defaultMin) / range) * denom : 0,
      'min'
    );
    const maxIndex = this.clampSliderIndex(
      range > 0 ? ((safeMax - this.defaultMin) / range) * denom : 0,
      'max'
    );
    const brightnessIndex = this.clampSliderIndex(
      range > 0 ? ((this.defaultMax - level) / range) * this.sliderRange : 0,
      'brightness'
    );
    let contrastIndex = this.sliderRange;
    if (range > 0 && width > 0) {
      const mid = this.sliderRange / 2;
      let c = (range / width) * mid;
      if (!Number.isFinite(c)) {
        c = this.sliderRange;
      } else if (c > mid) {
        c = this.sliderRange - (width / range) * mid;
      }
      contrastIndex = this.clampSliderIndex(c, 'contrast');
    }
    return {
      minSliderIndex: minIndex,
      maxSliderIndex: maxIndex,
      brightnessSliderIndex: brightnessIndex,
      contrastSliderIndex: contrastIndex
    };
  }

  private computeSliderRange(windowMin: number, windowMax: number): number {
    const defaultRange = Math.max(this.defaultMax - this.defaultMin, 0);
    const displayRange = Math.max(windowMax - windowMin, 0);
    let sliderRange = Math.round(defaultRange);
    if (!Number.isFinite(sliderRange) || sliderRange <= 0) {
      sliderRange = 256;
    }
    if (sliderRange > 640 && sliderRange < 1280) {
      sliderRange = Math.round(sliderRange / 2);
    } else if (sliderRange >= 1280) {
      sliderRange = Math.round(sliderRange / 5);
    }
    if (defaultRange >= 1280 && defaultRange !== 0 && displayRange / defaultRange < 0.25) {
      sliderRange = Math.round(sliderRange * 1.6666);
    }
    if (sliderRange < 256) {
      sliderRange = 256;
    }
    if (sliderRange > 1024) {
      sliderRange = 1024;
    }
    return sliderRange;
  }

  private clampSliderIndex(value: number, key: SliderKey): number {
    const rounded = Math.round(Number.isFinite(value) ? value : 0);
    if (key === 'min' || key === 'max') {
      const max = Math.max(this.sliderRange - 1, 0);
      return clamp(rounded, 0, max);
    }
    return clamp(rounded, 0, this.sliderRange);
  }

  private clampWindow(windowMin: number, windowMax: number): WindowBounds {
    let min = Math.min(windowMin, windowMax);
    let max = Math.max(windowMin, windowMax);
    if (min < this.defaultMin) {
      min = this.defaultMin;
    }
    if (max > this.defaultMax) {
      max = this.defaultMax;
    }
    min = clamp(min, this.defaultMin, this.defaultMax);
    max = clamp(max, this.defaultMin, this.defaultMax);
    const minimumWidth = Math.min(
      Math.max(MIN_WINDOW_WIDTH, 0),
      Math.max(this.defaultMax - this.defaultMin, 0)
    );
    if (max - min < minimumWidth) {
      const center = clamp((min + max) / 2, this.defaultMin, this.defaultMax);
      const halfWidth = minimumWidth / 2;
      min = center - halfWidth;
      max = center + halfWidth;
      if (min < this.defaultMin) {
        const shift = this.defaultMin - min;
        min += shift;
        max += shift;
      }
      if (max > this.defaultMax) {
        const shift = max - this.defaultMax;
        min -= shift;
        max -= shift;
      }
      min = clamp(min, this.defaultMin, this.defaultMax);
      max = clamp(max, this.defaultMin, this.defaultMax);
      if (minimumWidth > 0) {
        const width = max - min;
        const tolerance = Math.max(minimumWidth * 1e-6, Number.EPSILON * 16);
        if (width + tolerance < minimumWidth) {
          const span = Math.max(this.defaultMax - this.defaultMin, 0);
          if (span <= 0) {
            min = this.defaultMin;
            max = this.defaultMin;
          } else if (span <= minimumWidth) {
            min = this.defaultMin;
            max = this.defaultMax;
          } else {
            const clampedMin = clamp(
              center - minimumWidth / 2,
              this.defaultMin,
              this.defaultMax - minimumWidth
            );
            min = clampedMin;
            max = clampedMin + minimumWidth;
          }
        } else if (width < minimumWidth) {
          const clampedMax = Math.min(this.defaultMax, min + minimumWidth);
          min = Math.max(this.defaultMin, clampedMax - minimumWidth);
          max = clampedMax;
        }
      }
    }
    return { windowMin: min, windowMax: max };
  }

  private syncState(
    bounds: WindowBounds,
    sliderOverrides?: Partial<SliderIndices>
  ): BrightnessContrastState {
    const clamped = this.clampWindow(bounds.windowMin, bounds.windowMax);
    const sliders = this.computeSliderIndices(clamped.windowMin, clamped.windowMax);
    const overrides = this.sanitizeSliderOverrides(sliderOverrides);
    return {
      sliderRange: this.sliderRange,
      windowMin: clamped.windowMin,
      windowMax: clamped.windowMax,
      ...sliders,
      ...overrides
    };
  }

  private sanitizeSliderOverrides(
    overrides?: Partial<SliderIndices>
  ): Partial<SliderIndices> | undefined {
    if (!overrides) {
      return undefined;
    }
    const sanitized: Partial<SliderIndices> = {};
    if (overrides.minSliderIndex !== undefined) {
      sanitized.minSliderIndex = this.clampSliderIndex(overrides.minSliderIndex, 'min');
    }
    if (overrides.maxSliderIndex !== undefined) {
      sanitized.maxSliderIndex = this.clampSliderIndex(overrides.maxSliderIndex, 'max');
    }
    if (overrides.brightnessSliderIndex !== undefined) {
      sanitized.brightnessSliderIndex = this.clampSliderIndex(
        overrides.brightnessSliderIndex,
        'brightness'
      );
    }
    if (overrides.contrastSliderIndex !== undefined) {
      sanitized.contrastSliderIndex = this.clampSliderIndex(
        overrides.contrastSliderIndex,
        'contrast'
      );
    }
    return sanitized;
  }
}

export const DEFAULT_BRIGHTNESS_CONTRAST_MODEL = new BrightnessContrastModel(
  DEFAULT_WINDOW_MIN,
  DEFAULT_WINDOW_MAX
);
