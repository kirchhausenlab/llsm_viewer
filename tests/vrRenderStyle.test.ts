import assert from 'node:assert/strict';

import {
  RENDER_STYLE_BL,
  RENDER_STYLE_MIP,
  RENDER_STYLE_SLICE,
  createDefaultLayerSettings,
} from '../src/state/layerSettings.ts';
import {
  getNextVrCompatibleRenderStyle,
  normalizeLayerSettingsForVr,
} from '../src/shared/utils/vrRenderStyle.ts';

(() => {
  const sliceSettings = {
    ...createDefaultLayerSettings(),
    renderStyle: RENDER_STYLE_SLICE,
    samplingMode: 'nearest' as const,
  };

  const normalized = normalizeLayerSettingsForVr(sliceSettings, false);

  assert.equal(normalized.renderStyle, RENDER_STYLE_MIP);
  assert.equal(normalized.samplingMode, 'nearest');
})();

(() => {
  const segmentationSliceSettings = {
    ...createDefaultLayerSettings(),
    renderStyle: RENDER_STYLE_SLICE,
    samplingMode: 'nearest' as const,
  };

  const normalized = normalizeLayerSettingsForVr(segmentationSliceSettings, true);

  assert.equal(normalized.renderStyle, RENDER_STYLE_MIP);
  assert.equal(normalized.samplingMode, 'linear');
})();

(() => {
  const blSettings = {
    ...createDefaultLayerSettings(),
    renderStyle: RENDER_STYLE_BL,
    samplingMode: 'linear' as const,
  };

  const next = getNextVrCompatibleRenderStyle(blSettings, false);

  assert.deepEqual(next, {
    renderStyle: RENDER_STYLE_MIP,
    samplingMode: 'linear',
  });
})();

(() => {
  const segmentationSettings = {
    ...createDefaultLayerSettings(),
    renderStyle: RENDER_STYLE_MIP,
    samplingMode: 'linear' as const,
  };

  assert.equal(getNextVrCompatibleRenderStyle(segmentationSettings, true), null);
})();
