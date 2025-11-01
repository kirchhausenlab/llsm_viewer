import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';

import VolumeScene from '../../src/renderer/VolumeScene.tsx';
import type { VolumeViewerProps } from '../../src/renderer/types.ts';
import type { NormalizedVolume } from '../../src/volumeProcessing.ts';
import { triggerResize } from '../utils/resizeObserver.ts';

afterEach(() => {
  cleanup();
});

describe('VolumeScene integration', () => {
  const volume: NormalizedVolume = {
    width: 4,
    height: 4,
    depth: 2,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(32).fill(100),
    min: 0,
    max: 255
  };

  const createLayer = () => ({
    key: 'layer-1',
    label: 'Layer 1',
    volume,
    visible: true,
    sliderRange: 1,
    minSliderIndex: 0,
    maxSliderIndex: 0,
    brightnessSliderIndex: 0,
    contrastSliderIndex: 0,
    windowMin: 0,
    windowMax: 1,
    color: '#00ff00',
    offsetX: 0,
    offsetY: 0,
    renderStyle: 0,
    invert: false,
    samplingMode: 'linear'
  });

  const createProps = (): VolumeViewerProps => ({
    layers: [createLayer()],
    timeIndex: 0,
    totalTimepoints: 1,
    isPlaying: false,
    playbackDisabled: false,
    playbackLabel: '1 / 1',
    fps: 1,
    isLoading: false,
    loadingProgress: 0,
    loadedVolumes: 1,
    expectedVolumes: 1,
    onTogglePlayback: vi.fn(),
    onTimeIndexChange: vi.fn(),
    onFpsChange: vi.fn(),
    onRegisterReset: vi.fn(),
    isVrPassthroughSupported: false,
    tracks: [],
    trackChannels: [],
    trackVisibility: {},
    trackOpacityByChannel: {},
    trackLineWidthByChannel: {},
    channelTrackColorModes: {},
    channelTrackOffsets: {},
    selectedTrackIds: new Set<string>(),
    activeTrackChannelId: null,
    onTrackChannelSelect: vi.fn(),
    onTrackVisibilityToggle: vi.fn(),
    onTrackVisibilityAllChange: vi.fn(),
    onTrackOpacityChange: vi.fn(),
    onTrackLineWidthChange: vi.fn(),
    onTrackColorSelect: vi.fn(),
    onTrackColorReset: vi.fn(),
    onStopTrackFollow: vi.fn(),
    channelPanels: [],
    activeChannelPanelId: null,
    onChannelPanelSelect: vi.fn(),
    onChannelVisibilityToggle: vi.fn(),
    onChannelReset: vi.fn(),
    onChannelLayerSelect: vi.fn(),
    onLayerContrastChange: vi.fn(),
    onLayerBrightnessChange: vi.fn(),
    onLayerWindowMinChange: vi.fn(),
    onLayerWindowMaxChange: vi.fn(),
    onLayerAutoContrast: vi.fn(),
    onLayerOffsetChange: vi.fn(),
    onLayerColorChange: vi.fn(),
    onLayerRenderStyleToggle: vi.fn(),
    onLayerSamplingModeToggle: vi.fn(),
    onLayerInvertToggle: vi.fn(),
    followedTrackId: null,
    onTrackSelectionToggle: vi.fn(),
    onTrackFollowRequest: vi.fn(),
    onRegisterVrSession: vi.fn(),
    onVrSessionStarted: vi.fn(),
    onVrSessionEnded: vi.fn()
  });

  it('composes renderer hooks and exposes VR session handlers', async () => {
    const props = createProps();
    const { container, unmount } = render(<VolumeScene {...props} />);

    const surface = container.querySelector('.render-surface') as HTMLDivElement;
    expect(surface).toBeTruthy();

    Object.defineProperty(surface, 'clientWidth', { value: 640, configurable: true });
    Object.defineProperty(surface, 'clientHeight', { value: 480, configurable: true });

    act(() => {
      triggerResize(surface);
    });

    await waitFor(() => {
      expect(surface.classList.contains('is-ready')).toBe(true);
    });

    const canvas = surface.querySelector('canvas');
    expect(canvas).not.toBeNull();

    const registerCalls = props.onRegisterVrSession.mock.calls;
    expect(registerCalls.length).toBeGreaterThan(0);
    const handlers = registerCalls[0][0];
    expect(handlers).toMatchObject({
      requestSession: expect.any(Function),
      endSession: expect.any(Function)
    });

    unmount();
    expect(props.onRegisterVrSession).toHaveBeenLastCalledWith(null);
  });
});
