import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import * as THREE from 'three';

import { useRayMarchMaterial } from '../../src/renderer/useRayMarchMaterial.ts';

afterEach(() => {
  cleanup();
});

describe('useRayMarchMaterial', () => {
  it('creates materials with reactive uniform setters', () => {
    const colormapTexture = new THREE.DataTexture(new Uint8Array(4), 2, 2, THREE.RGBAFormat);
    const getColormapTexture = vi.fn().mockReturnValue(colormapTexture);
    const clearColormap = vi.fn();

    const { result } = renderHook(() =>
      useRayMarchMaterial({
        getColormapTexture,
        clearColormap,
        addListener: () => () => {}
      })
    );

    const controls = result.current.createRayMarchMaterial({
      color: '#ff00ff',
      channels: 3,
      dimensions: { width: 10, height: 8, depth: 6 },
      renderStyle: 1,
      windowMin: 0.1,
      windowMax: 0.9,
      invert: false,
      stepScale: 0.5
    });

    expect(getColormapTexture).toHaveBeenCalledWith('#ff00ff');
    expect(controls.uniforms.u_size.value.toArray()).toEqual([10, 8, 6]);
    expect(controls.uniforms.u_channels.value).toBe(3);
    expect(controls.uniforms.u_renderstyle.value).toBe(1);
    expect(controls.uniforms.u_windowMin.value).toBeCloseTo(0.1);
    expect(controls.uniforms.u_windowMax.value).toBeCloseTo(0.9);
    expect(controls.uniforms.u_invert.value).toBe(0);
    expect(controls.uniforms.u_stepScale.value).toBeCloseTo(0.5);
    expect(controls.uniforms.u_cmdata.value).toBe(colormapTexture);

    controls.setWindowMin(0.2);
    controls.setWindowMax(1.2);
    controls.setChannels(4);
    controls.setRenderStyle(0);
    controls.setInvert(true);
    controls.setStepScale(2);

    expect(controls.uniforms.u_windowMin.value).toBeCloseTo(0.2);
    expect(controls.uniforms.u_windowMax.value).toBeCloseTo(1.2);
    expect(controls.uniforms.u_channels.value).toBe(4);
    expect(controls.uniforms.u_renderstyle.value).toBe(0);
    expect(controls.uniforms.u_invert.value).toBe(1);
    expect(controls.uniforms.u_stepScale.value).toBeCloseTo(2);

    const dataTexture = new THREE.Data3DTexture(new Uint8Array(8), 2, 2, 2);
    controls.setDataTexture(dataTexture);
    expect(controls.uniforms.u_data.value).toBe(dataTexture);

    const normalized = controls.setColormap('#f0f');
    expect(normalized).toBe('#ff00ff');
    expect(controls.getColormapKey()).toBe('#ff00ff');

    result.current.clearColormap('#ff00ff');
    expect(clearColormap).toHaveBeenCalledWith('#ff00ff');
  });
});
