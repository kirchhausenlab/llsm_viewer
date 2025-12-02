import { useCallback, useMemo } from 'react';
import useVrLifecycle from './useVrLifecycle';
import { useViewerPlayback } from './useViewerPlayback';

export type ViewerMode = '3d' | '2d';

export type UseViewerControlsParams = {
  viewerMode: ViewerMode;
  is3dViewerAvailable: boolean;
  onBeforeEnterVr: () => void;
};

export type UseViewerControlsResult = {
  playback: ReturnType<typeof useViewerPlayback>;
  vr: ReturnType<typeof useVrLifecycle> & {
    vrButtonDisabled: boolean;
    vrButtonTitle: string | undefined;
    handleVrButtonClick: () => void;
  };
};

export const useViewerControls = ({
  viewerMode,
  is3dViewerAvailable,
  onBeforeEnterVr
}: UseViewerControlsParams): UseViewerControlsResult => {
  const playback = useViewerPlayback();
  const vrLifecycle = useVrLifecycle({ viewerMode, onBeforeEnter: onBeforeEnterVr });

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
    if (viewerMode !== '3d') {
      return 'Switch to the 3D view to enable VR.';
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
    vrLifecycle.isVrSupported,
    viewerMode
  ]);

  return {
    playback,
    vr: {
      ...vrLifecycle,
      vrButtonDisabled,
      vrButtonTitle,
      handleVrButtonClick
    }
  };
};
