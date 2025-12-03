import { lazy, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import type { UseVolumeViewerVrParams, UseVolumeViewerVrResult } from './useVolumeViewerVr';

export type VolumeViewerVrBridgeProps = {
  params: UseVolumeViewerVrParams;
  onValue: Dispatch<SetStateAction<UseVolumeViewerVrResult | null>>;
};

export const VolumeViewerVrBridge = lazy(async () => {
  const module = await import('./useVolumeViewerVr');
  const Bridge = ({ params, onValue }: VolumeViewerVrBridgeProps) => {
    const api = module.useVolumeViewerVr(params);
    useEffect(() => {
      onValue((previous) =>
        previous?.playbackLoopRef === api.playbackLoopRef ? previous : api,
      );
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
