import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import * as THREE from 'three';

import VolumeScene from '../../src/renderer/VolumeScene.tsx';
import type { VolumeViewerProps } from '../../src/renderer/types.ts';
import type { NormalizedVolume } from '../../src/volumeProcessing.ts';
import { triggerResize } from '../utils/resizeObserver.ts';
import { OrbitControls as MockOrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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

  it('centers the camera using the combined bounds of all volumes', async () => {
    const props = createProps();

    const wideVolume: NormalizedVolume = {
      width: 6,
      height: 4,
      depth: 3,
      channels: 1,
      dataType: 'uint8',
      normalized: new Uint8Array(6 * 4 * 3).fill(90),
      min: 0,
      max: 255
    };

    props.layers = [
      createLayer(),
      {
        ...createLayer(),
        key: 'layer-2',
        label: 'Layer 2',
        volume: wideVolume,
        offsetX: 10,
        offsetY: -4
      }
    ];

    const controlsClass = MockOrbitControls as unknown as {
      instances: Array<{
        target: THREE.Vector3;
        camera: THREE.PerspectiveCamera;
      }>;
    };
    controlsClass.instances.length = 0;

    const { container } = render(<VolumeScene {...props} />);
    const surface = container.querySelector('.render-surface') as HTMLDivElement;
    expect(surface).toBeTruthy();

    Object.defineProperty(surface, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(surface, 'clientHeight', { value: 600, configurable: true });

    act(() => {
      triggerResize(surface);
    });

    await waitFor(() => {
      expect(surface.classList.contains('is-ready')).toBe(true);
    });

    const resetHandler = props.onRegisterReset.mock.calls[0]?.[0];
    expect(resetHandler).toBeTypeOf('function');

    const computeBounds = (layers: VolumeViewerProps['layers']) => {
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;

      for (const layer of layers) {
        const vol = layer.volume;
        if (!vol) {
          continue;
        }
        const offsetX = layer.offsetX ?? 0;
        const offsetY = layer.offsetY ?? 0;
        minX = Math.min(minX, offsetX - 0.5);
        maxX = Math.max(maxX, offsetX + vol.width - 0.5);
        minY = Math.min(minY, offsetY - 0.5);
        maxY = Math.max(maxY, offsetY + vol.height - 0.5);
        minZ = Math.min(minZ, -0.5);
        maxZ = Math.max(maxZ, vol.depth - 0.5);
      }

      const extentX = Math.max(maxX - minX, 0);
      const extentY = Math.max(maxY - minY, 0);
      const extentZ = Math.max(maxZ - minZ, 0);
      const maxExtent = Math.max(extentX, extentY, extentZ);
      const scale = 1 / Math.max(maxExtent, 1);
      const centerX = minX + extentX * 0.5;
      const centerY = minY + extentY * 0.5;
      const centerZ = minZ + extentZ * 0.5;
      const halfX = extentX * 0.5;
      const halfY = extentY * 0.5;
      const halfZ = extentZ * 0.5;
      const radius = Math.sqrt(halfX * halfX + halfY * halfY + halfZ * halfZ);
      return { centerX, centerY, centerZ, scale, radius };
    };

    const expected = computeBounds(props.layers);
    const expectedCenter = {
      x: expected.centerX * expected.scale,
      y: expected.centerY * expected.scale,
      z: expected.centerZ * expected.scale
    };
    const expectedRadiusWorld = Math.max(expected.radius * expected.scale, 0.1);
    const expectedNear = Math.max(expectedRadiusWorld * 0.02, 0.001);
    const offsetDistance = expectedRadiusWorld * 2.4 + 0.4;
    const expectedFar = Math.max(offsetDistance * 4, expectedRadiusWorld * 8, expectedNear + 5);

    act(() => {
      resetHandler?.();
    });

    const controlsInstance = controlsClass.instances[0];
    expect(controlsInstance).toBeDefined();

    const target = controlsInstance.target;
    expect(target.x).toBeCloseTo(expectedCenter.x, 5);
    expect(target.y).toBeCloseTo(expectedCenter.y, 5);
    expect(target.z).toBeCloseTo(expectedCenter.z, 5);

    const camera = controlsInstance.camera as THREE.PerspectiveCamera;
    expect(camera.position.x).toBeCloseTo(expectedCenter.x, 5);
    expect(camera.position.y).toBeCloseTo(expectedCenter.y, 5);
    expect(camera.position.z).toBeCloseTo(expectedCenter.z + offsetDistance, 5);
    expect(camera.near).toBeCloseTo(expectedNear, 5);
    expect(camera.far).toBeCloseTo(expectedFar, 5);
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
