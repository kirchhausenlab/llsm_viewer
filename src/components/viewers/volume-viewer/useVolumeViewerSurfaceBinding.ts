import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { VolumeViewerProps } from '../VolumeViewer.types';

type UseVolumeViewerSurfaceBindingParams = {
  containerRef: MutableRefObject<HTMLDivElement | null>;
  containerNode: HTMLDivElement | null;
  setContainerNode: Dispatch<SetStateAction<HTMLDivElement | null>>;
  onRegisterCaptureTarget: VolumeViewerProps['onRegisterCaptureTarget'];
  setHoverNotReady: (message: string) => void;
  hasActive3DLayer: boolean;
  hasActive3DLayerRef: MutableRefObject<boolean>;
  updateVolumeHandles: () => void;
};

export function useVolumeViewerSurfaceBinding({
  containerRef,
  containerNode,
  setContainerNode,
  onRegisterCaptureTarget,
  setHoverNotReady,
  hasActive3DLayer,
  hasActive3DLayerRef,
  updateVolumeHandles,
}: UseVolumeViewerSurfaceBindingParams) {
  const handleContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      if (!node) {
        onRegisterCaptureTarget?.(null);
        return;
      }
      setContainerNode((current) => (current === node ? current : node));
    },
    [containerRef, onRegisterCaptureTarget, setContainerNode],
  );

  useEffect(() => {
    const activeContainer = containerNode ?? containerRef.current;
    if (!activeContainer) {
      setHoverNotReady('Hover inactive: viewer container unavailable.');
      return;
    }
    if (!containerNode && activeContainer) {
      setContainerNode(activeContainer);
    }
  }, [containerNode, containerRef, setContainerNode, setHoverNotReady]);

  useEffect(() => {
    hasActive3DLayerRef.current = hasActive3DLayer;
    updateVolumeHandles();
  }, [hasActive3DLayer, hasActive3DLayerRef, updateVolumeHandles]);

  return { handleContainerRef } as const;
}
