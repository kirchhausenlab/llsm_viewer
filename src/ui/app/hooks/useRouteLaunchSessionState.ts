import { useCallback, useState } from 'react';

type LaunchStatus = 'idle' | 'loading' | 'loaded' | 'error';

type UseRouteLaunchSessionStateOptions = {
  stopPlayback: () => void;
};

type SetLaunchProgressOptions = {
  loadedCount: number;
  totalCount: number;
};

export type RouteLaunchSessionState = {
  status: LaunchStatus;
  error: string | null;
  loadProgress: number;
  loadedCount: number;
  expectedVolumeCount: number;
  isViewerLaunched: boolean;
  isLaunchingViewer: boolean;
  isLoading: boolean;
  resetLaunchState: () => void;
  beginLaunchSession: () => void;
  setLaunchExpectedVolumeCount: (count: number) => void;
  setLaunchProgress: (options: SetLaunchProgressOptions) => void;
  completeLaunchSession: (totalCount: number) => void;
  failLaunchSession: (message: string) => void;
  finishLaunchSessionAttempt: () => void;
  endViewerSession: () => void;
};

export function useRouteLaunchSessionState({
  stopPlayback
}: UseRouteLaunchSessionStateOptions): RouteLaunchSessionState {
  const [status, setStatus] = useState<LaunchStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [expectedVolumeCount, setExpectedVolumeCount] = useState(0);
  const [isViewerLaunched, setIsViewerLaunched] = useState(false);
  const [isLaunchingViewer, setIsLaunchingViewer] = useState(false);

  const resetLaunchState = useCallback(() => {
    setStatus('idle');
    setError(null);
    setLoadProgress(0);
    setLoadedCount(0);
    setExpectedVolumeCount(0);
    stopPlayback();
    setIsViewerLaunched(false);
    setIsLaunchingViewer(false);
  }, [stopPlayback]);

  const beginLaunchSession = useCallback(() => {
    setIsLaunchingViewer(true);
    setStatus('loading');
    setError(null);
    setLoadProgress(0);
    setLoadedCount(0);
  }, []);

  const setLaunchExpectedVolumeCount = useCallback((count: number) => {
    setExpectedVolumeCount(count);
  }, []);

  const setLaunchProgress = useCallback(({ loadedCount, totalCount }: SetLaunchProgressOptions) => {
    setLoadedCount(loadedCount);
    setLoadProgress(totalCount === 0 ? 0 : loadedCount / totalCount);
  }, []);

  const completeLaunchSession = useCallback((totalCount: number) => {
    setIsViewerLaunched(true);
    setStatus('loaded');
    setLoadedCount(totalCount);
    setLoadProgress(totalCount === 0 ? 0 : 1);
  }, []);

  const failLaunchSession = useCallback((message: string) => {
    setStatus('error');
    setError(message);
    setIsViewerLaunched(false);
  }, []);

  const finishLaunchSessionAttempt = useCallback(() => {
    setIsLaunchingViewer(false);
  }, []);

  const endViewerSession = useCallback(() => {
    stopPlayback();
    setIsViewerLaunched(false);
  }, [stopPlayback]);

  return {
    status,
    error,
    loadProgress,
    loadedCount,
    expectedVolumeCount,
    isViewerLaunched,
    isLaunchingViewer,
    isLoading: status === 'loading',
    resetLaunchState,
    beginLaunchSession,
    setLaunchExpectedVolumeCount,
    setLaunchProgress,
    completeLaunchSession,
    failLaunchSession,
    finishLaunchSessionAttempt,
    endViewerSession
  };
}
