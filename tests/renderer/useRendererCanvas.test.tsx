import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as THREE from 'three';

import {
  useRendererCanvas,
  type TrackMaterialPair
} from '../../src/renderer/useRendererCanvas.ts';
import { triggerResize, resetResizeObservers } from '../utils/resizeObserver.ts';

function createContainer(width: number, height: number) {
  const node = document.createElement('div');
  Object.defineProperty(node, 'clientWidth', { value: width, configurable: true });
  Object.defineProperty(node, 'clientHeight', { value: height, configurable: true });
  return node;
}

afterEach(() => {
  cleanup();
  resetResizeObservers();
});

describe('useRendererCanvas', () => {
  it('initializes and tears down the renderer when the container changes', async () => {
    const container = createContainer(320, 240);

    const { result, rerender } = renderHook(
      ({ container }: { container: HTMLDivElement | null }) =>
        useRendererCanvas({ container })
    , { initialProps: { container } });

    await waitFor(() => {
      expect(result.current.renderer).not.toBeNull();
      expect(result.current.scene).not.toBeNull();
      expect(result.current.camera).not.toBeNull();
      expect(result.current.controls).not.toBeNull();
    });

    const renderer = result.current.renderer!;
    expect(container.contains(renderer.domElement)).toBe(true);

    rerender({ container: null });

    await waitFor(() => {
      expect(result.current.renderer).toBeNull();
      expect(result.current.scene).toBeNull();
      expect(result.current.camera).toBeNull();
      expect(result.current.controls).toBeNull();
    });

    expect(renderer.dispose).toHaveBeenCalledTimes(1);
    expect(container.contains(renderer.domElement)).toBe(false);
  });

  it('updates renderer size, camera aspect, and track materials on resize', async () => {
    const container = createContainer(200, 200);
    const trackMaterials: TrackMaterialPair[] = [
      {
        material: { resolution: new THREE.Vector2(), needsUpdate: false },
        outlineMaterial: { resolution: new THREE.Vector2(), needsUpdate: false }
      }
    ];
    const resizeSpy = vi.fn();

    const { result } = renderHook(() =>
      useRendererCanvas({
        container,
        maxPixelRatio: 1,
        onResize: resizeSpy,
        getTrackMaterials: () => trackMaterials
      })
    );

    await waitFor(() => {
      expect(result.current.renderer).not.toBeNull();
    });

    act(() => {
      Object.defineProperty(container, 'clientWidth', { value: 640, configurable: true });
      Object.defineProperty(container, 'clientHeight', { value: 360, configurable: true });
      triggerResize(container);
    });

    const renderer = result.current.renderer!;
    expect((renderer.setSize as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(640, 360);
    expect(resizeSpy).toHaveBeenLastCalledWith({ width: 640, height: 360 });

    const camera = result.current.camera!;
    expect(camera.aspect).toBeCloseTo(640 / 360);

    const [pair] = trackMaterials;
    expect(pair.material.resolution.x).toBe(640);
    expect(pair.material.resolution.y).toBe(360);
    expect(pair.material.needsUpdate).toBe(true);
    expect(pair.outlineMaterial?.resolution.x).toBe(640);
    expect(pair.outlineMaterial?.resolution.y).toBe(360);
    expect(pair.outlineMaterial?.needsUpdate).toBe(true);
  });
});
