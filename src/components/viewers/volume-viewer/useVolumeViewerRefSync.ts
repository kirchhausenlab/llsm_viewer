import { useCallback, useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { FollowedVoxelTarget, VolumeViewerProps } from '../VolumeViewer.types';

type UseVolumeViewerRefSyncParams = {
  annotation: VolumeViewerProps['annotation'];
  annotationRef: MutableRefObject<VolumeViewerProps['annotation']>;
  layers: VolumeViewerProps['layers'];
  layersRef: MutableRefObject<VolumeViewerProps['layers']>;
  followedTrackId: string | null;
  followedTrackIdRef: MutableRefObject<string | null>;
  followedVoxel: FollowedVoxelTarget | null;
  followedVoxelRef: MutableRefObject<FollowedVoxelTarget | null>;
  followTargetActiveRef: MutableRefObject<boolean>;
  trackFollowRequestCallbackRef: MutableRefObject<(trackId: string) => void>;
  onTrackFollowRequest: (trackId: string) => void;
  resetVolumeCallbackRef: MutableRefObject<() => void>;
  resetHudPlacementCallbackRef: MutableRefObject<() => void>;
};

export function useVolumeViewerRefSync({
  annotation,
  annotationRef,
  layers,
  layersRef,
  followedTrackId,
  followedTrackIdRef,
  followedVoxel,
  followedVoxelRef,
  followTargetActiveRef,
  trackFollowRequestCallbackRef,
  onTrackFollowRequest,
  resetVolumeCallbackRef,
  resetHudPlacementCallbackRef,
}: UseVolumeViewerRefSyncParams) {
  trackFollowRequestCallbackRef.current = onTrackFollowRequest;

  useEffect(() => {
    annotationRef.current = annotation;
  }, [annotation, annotationRef]);

  useEffect(() => {
    layersRef.current = layers;
  }, [layers, layersRef]);

  useEffect(() => {
    followedTrackIdRef.current = followedTrackId ?? null;
  }, [followedTrackId, followedTrackIdRef]);

  useEffect(() => {
    followedVoxelRef.current = followedVoxel;
    followTargetActiveRef.current = followedTrackId !== null || followedVoxel !== null;
  }, [followTargetActiveRef, followedTrackId, followedVoxel, followedVoxelRef]);

  const requestVolumeReset = useCallback(() => {
    resetVolumeCallbackRef.current?.();
  }, [resetVolumeCallbackRef]);

  const requestHudPlacementReset = useCallback(() => {
    resetHudPlacementCallbackRef.current?.();
  }, [resetHudPlacementCallbackRef]);

  const handleTrackFollowRequest = useCallback((trackId: string) => {
    trackFollowRequestCallbackRef.current?.(trackId);
  }, [trackFollowRequestCallbackRef]);

  return {
    requestVolumeReset,
    requestHudPlacementReset,
    handleTrackFollowRequest,
  } as const;
}
