import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import * as THREE from 'three';

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

  it('updates hover and selection state through volume pointer interactions', async () => {
    const props = createProps();
    const track = {
      id: 'track-1',
      channelId: 'channel-1',
      channelName: 'Channel 1',
      trackNumber: 1,
      sourceTrackId: 101,
      points: [
        { time: 0, x: 0, y: 0, z: 0, amplitude: 1 },
        { time: 1, x: 1, y: 1, z: 1, amplitude: 1 }
      ]
    };

    props.tracks = [track];
    props.onTrackSelectionToggle = vi.fn();

    const intersectSpy = vi
      .spyOn(THREE.Raycaster.prototype, 'intersectObjects')
      .mockImplementation(function (objects: THREE.Object3D[]) {
        const target = objects.find((object) => {
          const userData = (object as { userData?: { trackId?: string } }).userData;
          return userData?.trackId === track.id;
        });
        return target ? [{ object: target }] : [];
      });

    const createPointerEvent = (type: string, init: PointerEventInit): PointerEvent => {
      const options: PointerEventInit = { bubbles: true, cancelable: true, ...init };
      if (typeof window.PointerEvent === 'function') {
        return new window.PointerEvent(type, options);
      }
      const fallback = new window.MouseEvent(type, options);
      Object.defineProperty(fallback, 'pointerId', {
        value: options.pointerId ?? 1,
        configurable: true
      });
      Object.defineProperty(fallback, 'ctrlKey', {
        value: !!options.ctrlKey,
        configurable: true
      });
      Object.defineProperty(fallback, 'metaKey', {
        value: !!options.metaKey,
        configurable: true
      });
      Object.defineProperty(fallback, 'altKey', {
        value: !!options.altKey,
        configurable: true
      });
      Object.defineProperty(fallback, 'shiftKey', {
        value: !!options.shiftKey,
        configurable: true
      });
      return fallback as unknown as PointerEvent;
    };

    try {
      const { container } = render(<VolumeScene {...props} />);
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

      const canvas = surface.querySelector('canvas') as HTMLCanvasElement;
      expect(canvas).toBeTruthy();

      Object.defineProperty(canvas, 'getBoundingClientRect', {
        value: () => ({ left: 0, top: 0, width: 640, height: 480, right: 640, bottom: 480 }),
        configurable: true
      });
      Object.defineProperty(canvas, 'setPointerCapture', {
        value: vi.fn(),
        configurable: true
      });
      Object.defineProperty(canvas, 'releasePointerCapture', {
        value: vi.fn(),
        configurable: true
      });

      await act(async () => {
        canvas.dispatchEvent(
          createPointerEvent('pointermove', {
            clientX: 160,
            clientY: 120,
            pointerId: 1
          })
        );
      });

      await waitFor(() => {
        const tooltip = container.querySelector('.track-tooltip');
        expect(tooltip?.textContent).toBe('Channel 1 · track-1');
      });

      expect(props.onTrackSelectionToggle).not.toHaveBeenCalled();

      await act(async () => {
        canvas.dispatchEvent(
          createPointerEvent('pointerdown', {
            clientX: 160,
            clientY: 120,
            pointerId: 2,
            button: 0
          })
        );
      });

      await act(async () => {
        canvas.dispatchEvent(
          createPointerEvent('pointerup', {
            clientX: 160,
            clientY: 120,
            pointerId: 2,
            button: 0
          })
        );
      });

      await waitFor(() => {
        expect(props.onTrackSelectionToggle).toHaveBeenCalledWith('track-1');
      });
    } finally {
      intersectSpy.mockRestore();
    }
  });
});
