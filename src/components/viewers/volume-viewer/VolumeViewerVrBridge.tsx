import { lazy, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { UseVolumeViewerVrParams, UseVolumeViewerVrResult } from './useVolumeViewerVr';

export type VolumeViewerVrBridgeProps = {
  params: UseVolumeViewerVrParams;
  onValue: Dispatch<SetStateAction<UseVolumeViewerVrResult | null>>;
};

function hasChangedVrIntegration(
  previous: UseVolumeViewerVrResult | null,
  next: UseVolumeViewerVrResult,
): boolean {
  if (!previous) {
    return true;
  }

  const previousKeys = Object.keys(previous) as Array<keyof UseVolumeViewerVrResult>;
  const nextKeys = Object.keys(next) as Array<keyof UseVolumeViewerVrResult>;
  if (previousKeys.length !== nextKeys.length) {
    return true;
  }

  for (const key of previousKeys) {
    if (previous[key] !== next[key]) {
      return true;
    }
  }

  return false;
}

export { hasChangedVrIntegration };

export const VolumeViewerVrBridge = lazy(async () => {
  const module = await import('./useVolumeViewerVr');
  const Bridge = ({ params, onValue }: VolumeViewerVrBridgeProps) => {
    const api = module.useVolumeViewerVr(params);
    useEffect(() => {
      onValue((previous) => (hasChangedVrIntegration(previous, api) ? api : previous));
    }, [api, onValue]);
    useEffect(
      () => () => {
        onValue(null);
      },
      [onValue],
    );
    return null;
  };
  return { default: Bridge };
});
