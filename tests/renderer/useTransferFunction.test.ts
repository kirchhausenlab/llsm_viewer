import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

import { useTransferFunctionCache } from '../../src/renderer/useTransferFunction.ts';

afterEach(() => {
  cleanup();
});

describe('useTransferFunctionCache', () => {
  it('caches colormap textures and notifies listeners', () => {
    const { result } = renderHook(() => useTransferFunctionCache());
    const listener = vi.fn();
    const unsubscribe = result.current.addListener(listener);

    const texture = result.current.getColormapTexture('#00ff00');
    expect(texture.image.width).toBe(256);
    expect(listener).toHaveBeenLastCalledWith({ type: 'miss', key: '#00ff00' });

    const cached = result.current.getColormapTexture('#00ff00');
    expect(cached).toBe(texture);
    expect(listener).toHaveBeenLastCalledWith({ type: 'hit', key: '#00ff00' });

    result.current.clearColormap('#00ff00');
    expect(listener).toHaveBeenLastCalledWith({ type: 'clear', key: '#00ff00' });

    const rehydrated = result.current.getColormapTexture('#00ff00');
    expect(rehydrated).not.toBe(texture);
    expect(listener).toHaveBeenLastCalledWith({ type: 'miss', key: '#00ff00' });

    unsubscribe();
    result.current.clearColormap();
    expect(listener).toHaveBeenCalledTimes(4);
  });
});
