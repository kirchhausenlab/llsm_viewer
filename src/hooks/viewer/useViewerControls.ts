import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import useVrLifecycle from './useVrLifecycle';
import { useViewerPlayback, type ViewerPlaybackHook } from './useViewerPlayback';

export type ViewerMode = '3d';

export type UseViewerControlsParams = {
  playback?: ViewerPlaybackHook;
  is3dViewerAvailable: boolean;
  onBeforeEnterVr: () => void;
};

export type UseViewerControlsResult = {
  viewerMode: ViewerMode;
  setViewerMode: React.Dispatch<React.SetStateAction<ViewerMode>>;
  playback: ViewerPlaybackHook;
  vr: ReturnType<typeof useVrLifecycle> & {
    vrButtonDisabled: boolean;
    vrButtonTitle: string | undefined;
    handleVrButtonClick: () => void;
  };
};

export const useViewerControls = ({
  playback: providedPlayback,
  is3dViewerAvailable,
  onBeforeEnterVr
}: UseViewerControlsParams): UseViewerControlsResult => {
  const playback = providedPlayback ?? useViewerPlayback();

  const [viewerMode, setViewerMode] = useState<ViewerMode>('3d');

  const vrLifecycle = useVrLifecycle({ onBeforeEnter: onBeforeEnterVr });

  const handleVrButtonClick = useCallback(() => {
    if (vrLifecycle.isVrActive) {
      void vrLifecycle.exitVr();
    } else {
      void vrLifecycle.enterVr();
    }
  }, [vrLifecycle]);

  const vrButtonDisabled = useMemo(() => {
    return !is3dViewerAvailable
      ? !vrLifecycle.isVrActive
      : vrLifecycle.isVrActive
        ? false
        : !vrLifecycle.isVrAvailable || !vrLifecycle.hasVrSessionHandlers || vrLifecycle.isVrRequesting;
  }, [is3dViewerAvailable, vrLifecycle]);

  const vrButtonTitle = useMemo(() => {
    if (!is3dViewerAvailable) {
      return 'VR is only available for 3D datasets.';
    }
    if (vrLifecycle.isVrActive) {
      return 'Exit immersive VR session.';
    }
    if (!vrLifecycle.isVrSupportChecked) {
      return 'Checking WebXR capabilities…';
    }
    if (!vrLifecycle.isVrSupported) {
      return 'WebXR immersive VR is not supported in this browser.';
    }
    if (!vrLifecycle.hasVrSessionHandlers) {
      return 'Viewer is still initializing.';
    }
    if (vrLifecycle.isVrRequesting) {
      return 'Starting VR session…';
    }
    return undefined;
  }, [
    is3dViewerAvailable,
    vrLifecycle.hasVrSessionHandlers,
    vrLifecycle.isVrActive,
    vrLifecycle.isVrRequesting,
    vrLifecycle.isVrSupportChecked,
    vrLifecycle.isVrSupported
  ]);

  return {
    viewerMode,
    setViewerMode,
    playback,
    vr: {
      ...vrLifecycle,
      vrButtonDisabled,
      vrButtonTitle,
      handleVrButtonClick
    }
  };
};
