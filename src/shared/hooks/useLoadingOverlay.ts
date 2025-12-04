import { useMemo } from 'react';

export type UseLoadingOverlayParams = {
  isLoading: boolean;
  loadingProgress: number;
  loadedVolumes: number;
  expectedVolumes: number;
};

export type UseLoadingOverlayResult = {
  normalizedProgress: number;
  hasStartedLoading: boolean;
  hasFinishedLoading: boolean;
  showLoadingOverlay: boolean;
  clampedLoadedVolumes: number;
  clampedExpectedVolumes: number;
};

export function useLoadingOverlay({
  isLoading,
  loadingProgress,
  loadedVolumes,
  expectedVolumes,
}: UseLoadingOverlayParams): UseLoadingOverlayResult {
  return useMemo(() => {
    const safeProgress = Math.min(1, Math.max(0, loadingProgress));
    const clampedLoadedVolumes = Math.max(0, loadedVolumes);
    const clampedExpectedVolumes = Math.max(0, expectedVolumes);
    const normalizedProgress =
      clampedExpectedVolumes > 0
        ? Math.min(1, clampedLoadedVolumes / clampedExpectedVolumes)
        : safeProgress;
    const hasStartedLoading = normalizedProgress > 0 || clampedLoadedVolumes > 0 || safeProgress > 0;
    const hasFinishedLoading =
      clampedExpectedVolumes > 0 ? clampedLoadedVolumes >= clampedExpectedVolumes : safeProgress >= 1;
    const showLoadingOverlay = isLoading || (hasStartedLoading && !hasFinishedLoading);

    return {
      normalizedProgress,
      hasStartedLoading,
      hasFinishedLoading,
      showLoadingOverlay,
      clampedLoadedVolumes,
      clampedExpectedVolumes,
    } as const;
  }, [expectedVolumes, isLoading, loadedVolumes, loadingProgress]);
}
