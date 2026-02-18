import { Dispatch, SetStateAction, Suspense, useEffect } from 'react';

import type { VolumeViewerVrProps } from '../VolumeViewer.types';
import type { UseVolumeViewerVrParams, UseVolumeViewerVrResult } from './useVolumeViewerVr';
import { VolumeViewerVrBridge } from './VolumeViewerVrBridge';

export type VolumeViewerVrAdapterProps = {
  vrParams: UseVolumeViewerVrParams | null;
  onRegisterVrSession?: VolumeViewerVrProps['onRegisterVrSession'];
  setVrIntegration: Dispatch<SetStateAction<UseVolumeViewerVrResult | null>>;
  callOnRegisterVrSession: (
    handlers:
      | {
          requestSession: () => Promise<XRSession | null>;
          endSession: () => Promise<void> | void;
        }
      | null,
  ) => void;
  requestVrSession: () => Promise<XRSession | null>;
  endVrSession: () => Promise<void> | void;
};

export function VolumeViewerVrAdapter({
  vrParams,
  onRegisterVrSession,
  setVrIntegration,
  callOnRegisterVrSession,
  requestVrSession,
  endVrSession,
}: VolumeViewerVrAdapterProps) {
  useEffect(() => {
    if (!onRegisterVrSession) {
      callOnRegisterVrSession(null);
      return;
    }
    callOnRegisterVrSession({
      requestSession: () => requestVrSession(),
      endSession: () => endVrSession(),
    });
    return () => {
      callOnRegisterVrSession(null);
    };
  }, [callOnRegisterVrSession, endVrSession, onRegisterVrSession, requestVrSession]);

  if (!vrParams) {
    return null;
  }

  return (
    <Suspense fallback={<div role="status">Loading VR bridge…</div>}>
      <VolumeViewerVrBridge params={vrParams} onValue={setVrIntegration} />
    </Suspense>
  );
}
