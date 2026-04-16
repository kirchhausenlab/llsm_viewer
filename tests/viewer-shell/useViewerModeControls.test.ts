import assert from 'node:assert/strict';
import { useState } from 'react';
import { test } from 'node:test';

import { useViewerModeControls } from '../../src/components/viewers/viewer-shell/hooks/useViewerModeControls.ts';
import { renderHook } from '../hooks/renderHook.ts';

test('useViewerModeControls forwards projection mode state and handlers', () => {
  const hook = renderHook(() => {
    const [projectionMode, setProjectionMode] = useState<'perspective' | 'orthographic'>('orthographic');

    return useViewerModeControls({
      modeControls: {
        is3dModeAvailable: true,
        isVrActive: false,
        isVrRequesting: false,
        resetViewHandler: null,
        onVrButtonClick: () => {},
        vrButtonDisabled: false,
        vrButtonTitle: undefined,
        vrButtonLabel: 'Enter VR',
        projectionMode,
        onProjectionModeChange: setProjectionMode,
        samplingMode: 'linear',
        onSamplingModeToggle: () => {},
        blendingMode: 'alpha',
        onBlendingModeToggle: () => {}
      },
      showRenderingQualityControl: true,
      renderingQuality: 1,
      onRenderingQualityChange: () => {},
      hasVolumeData: true
    });
  });

  assert.equal(hook.result.modeToggle.projectionMode, 'orthographic');

  hook.act(() => {
    hook.result.modeToggle.onProjectionModeChange('perspective');
  });

  assert.equal(hook.result.modeToggle.projectionMode, 'perspective');
});
