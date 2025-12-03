import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useVrLifecycle from './useVrLifecycle';
import { useViewerPlayback, type ViewerPlaybackHook } from './useViewerPlayback';

export type ViewerMode = '3d' | '2d';

export type UseViewerControlsParams = {
  playback?: ViewerPlaybackHook;
  initialViewerMode?: ViewerMode;
  is3dViewerAvailable: boolean;
  maxSliceDepth: number;
  onBeforeEnterVr: () => void;
  onViewerModeToggle?: (nextMode: ViewerMode) => void;
};

export type UseViewerControlsResult = {
  viewerMode: ViewerMode;
  setViewerMode: React.Dispatch<React.SetStateAction<ViewerMode>>;
  toggleViewerMode: () => void;
  sliceIndex: number;
  handleSliceIndexChange: (index: number) => void;
  orthogonalViewsEnabled: boolean;
  toggleOrthogonalViews: () => void;
  orthogonalViewsAvailable: boolean;
  playback: ViewerPlaybackHook;
  vr: ReturnType<typeof useVrLifecycle> & {
    vrButtonDisabled: boolean;
    vrButtonTitle: string | undefined;
    handleVrButtonClick: () => void;
  };
};

export const useViewerControls = ({
  playback: providedPlayback,
  initialViewerMode = '3d',
  is3dViewerAvailable,
  maxSliceDepth,
  onBeforeEnterVr,
  onViewerModeToggle
}: UseViewerControlsParams): UseViewerControlsResult => {
  const playback = providedPlayback ?? useViewerPlayback();

  const [viewerMode, setViewerMode] = useState<ViewerMode>(initialViewerMode);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [orthogonalViewsEnabled, setOrthogonalViewsEnabled] = useState(false);
  const hasInitializedSliceIndexRef = useRef(false);

  useEffect(() => {
    if (!is3dViewerAvailable && viewerMode === '3d') {
      setViewerMode('2d');
    }
  }, [is3dViewerAvailable, viewerMode]);

  useEffect(() => {
    if (hasInitializedSliceIndexRef.current) {
      return;
    }
    if (maxSliceDepth > 0) {
      const middleIndex = Math.floor(maxSliceDepth / 2);
      setSliceIndex(middleIndex);
      hasInitializedSliceIndexRef.current = true;
    }
  }, [maxSliceDepth]);

  useEffect(() => {
    if (maxSliceDepth <= 0) {
      if (sliceIndex !== 0) {
        setSliceIndex(0);
      }
      return;
    }
    if (sliceIndex >= maxSliceDepth) {
      setSliceIndex(maxSliceDepth - 1);
    }
    if (sliceIndex < 0) {
      setSliceIndex(0);
    }
  }, [maxSliceDepth, sliceIndex]);

  useEffect(() => {
    if (maxSliceDepth <= 1 && orthogonalViewsEnabled) {
      setOrthogonalViewsEnabled(false);
    }
  }, [maxSliceDepth, orthogonalViewsEnabled]);

  const toggleViewerMode = useCallback(() => {
    if (!is3dViewerAvailable) {
      return;
    }
    setViewerMode((current) => {
      const nextMode: ViewerMode = current === '3d' ? '2d' : '3d';
      onViewerModeToggle?.(nextMode);
      return nextMode;
    });
  }, [is3dViewerAvailable, onViewerModeToggle]);

  const handleSliceIndexChange = useCallback((index: number) => {
    setSliceIndex(index);
  }, []);

  const toggleOrthogonalViews = useCallback(() => {
    setOrthogonalViewsEnabled((current) => !current);
  }, []);

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

  const orthogonalViewsAvailable = useMemo(() => {
    return viewerMode === '2d' && maxSliceDepth > 1;
  }, [maxSliceDepth, viewerMode]);

  return {
    viewerMode,
    setViewerMode,
    toggleViewerMode,
    sliceIndex,
    handleSliceIndexChange,
    orthogonalViewsEnabled,
    toggleOrthogonalViews,
    orthogonalViewsAvailable,
    playback,
    vr: {
      ...vrLifecycle,
      vrButtonDisabled,
      vrButtonTitle,
      handleVrButtonClick
    }
  };
};
