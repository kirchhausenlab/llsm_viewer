import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import * as THREE from 'three';

import { useVolumeTextures } from '../../src/renderer/useVolumeTextures.ts';
import type { ViewerLayer } from '../../src/renderer/types.ts';
import type { NormalizedVolume } from '../../src/volumeProcessing.ts';

afterEach(() => {
  cleanup();
});

describe('useVolumeTextures', () => {
  const baseVolume: NormalizedVolume = {
    width: 2,
    height: 2,
    depth: 2,
    channels: 1,
    dataType: 'uint8',
    normalized: new Uint8Array(8).fill(128),
    min: 0,
    max: 255
  };

  const createLayer = (overrides: Partial<ViewerLayer> = {}): ViewerLayer => ({
    key: 'layer-3d',
    label: 'Layer 3D',
    volume: baseVolume,
    visible: true,
    sliderRange: 1,
    minSliderIndex: 0,
    maxSliderIndex: 1,
    brightnessSliderIndex: 0,
    contrastSliderIndex: 0,
    windowMin: 0,
    windowMax: 1,
    color: '#00ff00',
    offsetX: 0,
    offsetY: 0,
    renderStyle: 0,
    invert: false,
    samplingMode: 'linear',
    ...overrides
  });

  it('upserts and removes 3D and slice layers while reporting invalidations', () => {
    const scene = new THREE.Scene();
    const volumeRoot = new THREE.Group();
    const volumeStepScaleRef = { current: 1 };

    const { result } = renderHook(() =>
      useVolumeTextures({ scene, volumeRoot, volumeStepScaleRef })
    );

    const listener = vi.fn();
    const unsubscribe = result.current.addInvalidationListener(listener);

    const layer3d = createLayer();
    act(() => {
      result.current.upsertLayer({ layer: layer3d, index: 0 });
    });

    const resource3d = result.current.resourcesRef.current.get('layer-3d');
    expect(resource3d).toBeDefined();
    expect(resource3d!.mode).toBe('3d');
    expect(resource3d!.mesh.parent).toBe(volumeRoot);
    expect(resource3d!.texture).toBeInstanceOf(THREE.Data3DTexture);
    expect(listener).not.toHaveBeenCalled();

    act(() => {
      result.current.upsertLayer({
        layer: { ...layer3d, color: '#ff0000' },
        index: 1
      });
    });
    expect(listener).toHaveBeenCalledWith({
      type: 'colormap',
      layerKey: 'layer-3d',
      previousKey: '#00ff00',
      nextKey: '#ff0000'
    });

    act(() => {
      result.current.removeLayer('layer-3d');
    });
    expect(result.current.resourcesRef.current.has('layer-3d')).toBe(false);
    expect(volumeRoot.children.length).toBe(0);

    const layerSlice = createLayer({
      key: 'layer-slice',
      label: 'Layer Slice',
      mode: 'slice',
      sliceIndex: 0
    });

    act(() => {
      result.current.upsertLayer({ layer: layerSlice, index: 0 });
    });

    const sliceResource = result.current.resourcesRef.current.get('layer-slice');
    expect(sliceResource).toBeDefined();
    expect(sliceResource!.mode).toBe('slice');
    expect(sliceResource!.texture).toBeInstanceOf(THREE.DataTexture);

    act(() => {
      result.current.removeAllLayers();
    });

    expect(result.current.resourcesRef.current.size).toBe(0);
    expect(volumeRoot.children.length).toBe(0);

    unsubscribe();
  });
});
