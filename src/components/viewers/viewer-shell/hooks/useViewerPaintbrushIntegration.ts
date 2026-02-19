import { useCallback, useMemo } from 'react';

import { usePaintbrush, type PaintbrushController } from '../../../../hooks/paintbrush/usePaintbrush';
import { encodeRgbTiffStack } from '../../../../shared/utils/tiffWriter';
import type { ViewerShellProps } from '../types';

type CaptureTargetRegistration = (
  target: HTMLCanvasElement | (() => HTMLCanvasElement | null) | null
) => void;

type UseViewerPaintbrushIntegrationOptions = {
  volumeViewerProps: ViewerShellProps['volumeViewerProps'];
  planarViewerProps: ViewerShellProps['planarViewerProps'];
  resetToken: number;
  onVolumeCaptureTarget: CaptureTargetRegistration;
  onPlanarCaptureTarget: CaptureTargetRegistration;
};

type UseViewerPaintbrushIntegrationResult = {
  paintbrushController: PaintbrushController;
  volumeViewerProps: ViewerShellProps['volumeViewerProps'];
  planarViewerProps: ViewerShellProps['planarViewerProps'];
  handleSavePainting: () => void;
};

export function useViewerPaintbrushIntegration({
  volumeViewerProps,
  planarViewerProps,
  resetToken,
  onVolumeCaptureTarget,
  onPlanarCaptureTarget
}: UseViewerPaintbrushIntegrationOptions): UseViewerPaintbrushIntegrationResult {
  const primaryVolume = useMemo(() => {
    for (const layer of volumeViewerProps.layers) {
      if (layer.volume) {
        return layer.volume;
      }
    }
    return null;
  }, [volumeViewerProps.layers]);

  const paintbrushController = usePaintbrush({ primaryVolume, resetSignal: resetToken });

  const paintbrushStrokeHandlers = useMemo(() => {
    return {
      enabled: paintbrushController.enabled,
      onStrokeStart: paintbrushController.beginStroke,
      onStrokeApply: paintbrushController.applyStrokeAt,
      onStrokeEnd: paintbrushController.endStroke
    };
  }, [
    paintbrushController.applyStrokeAt,
    paintbrushController.beginStroke,
    paintbrushController.enabled,
    paintbrushController.endStroke
  ]);

  const paintOverlayVolumeLayer = useMemo(() => {
    const volume = paintbrushController.paintVolume;
    if (!volume) {
      return null;
    }

    return {
      key: 'paintbrush-overlay',
      label: 'Painting',
      channelName: 'Painting',
      volume,
      fullResolutionWidth: volume.width,
      fullResolutionHeight: volume.height,
      fullResolutionDepth: volume.depth,
      visible: paintbrushController.overlayVisible,
      isHoverTarget: false,
      sliderRange: 1,
      minSliderIndex: 0,
      maxSliderIndex: 0,
      brightnessSliderIndex: 0,
      contrastSliderIndex: 0,
      windowMin: 0,
      windowMax: 1,
      color: '#ffffff',
      offsetX: 0,
      offsetY: 0,
      renderStyle: 0 as const,
      blDensityScale: 1,
      blBackgroundCutoff: 0.08,
      blOpacityScale: 1,
      blEarlyExitAlpha: 0.98,
      invert: false,
      samplingMode: 'nearest' as const,
      mode: '3d' as const
    } satisfies ViewerShellProps['volumeViewerProps']['layers'][number];
  }, [paintbrushController.overlayVisible, paintbrushController.paintVolume, paintbrushController.revision]);

  const paintOverlayPlanarLayer = useMemo(() => {
    const volume = paintbrushController.paintVolume;
    if (!volume) {
      return null;
    }

    return {
      key: 'paintbrush-overlay',
      label: 'Painting',
      channelId: 'paintbrush',
      channelName: 'Painting',
      volume,
      fullResolutionWidth: volume.width,
      fullResolutionHeight: volume.height,
      fullResolutionDepth: volume.depth,
      visible: paintbrushController.overlayVisible,
      isHoverTarget: false,
      minAlpha: 0,
      sliderRange: 1,
      minSliderIndex: 0,
      maxSliderIndex: 0,
      brightnessSliderIndex: 0,
      contrastSliderIndex: 0,
      windowMin: 0,
      windowMax: 1,
      color: '#ffffff',
      offsetX: 0,
      offsetY: 0,
      renderStyle: 0 as const,
      blDensityScale: 1,
      blBackgroundCutoff: 0.08,
      blOpacityScale: 1,
      blEarlyExitAlpha: 0.98,
      invert: false,
      samplingMode: 'nearest' as const,
      isSegmentation: false,
      scaleLevel: 0,
      brickPageTable: null,
      brickAtlas: null
    } satisfies ViewerShellProps['planarViewerProps']['layers'][number];
  }, [paintbrushController.overlayVisible, paintbrushController.paintVolume, paintbrushController.revision]);

  const volumeViewerLayers = useMemo(() => {
    if (!paintOverlayVolumeLayer) {
      return volumeViewerProps.layers;
    }
    return [...volumeViewerProps.layers, paintOverlayVolumeLayer];
  }, [paintOverlayVolumeLayer, volumeViewerProps.layers]);

  const planarViewerLayers = useMemo(() => {
    if (!paintOverlayPlanarLayer) {
      return planarViewerProps.layers;
    }
    return [...planarViewerProps.layers, paintOverlayPlanarLayer];
  }, [paintOverlayPlanarLayer, planarViewerProps.layers]);

  const volumeViewerWithPaintbrush = useMemo(
    () =>
      ({
        ...volumeViewerProps,
        layers: volumeViewerLayers,
        onRegisterCaptureTarget: onVolumeCaptureTarget,
        paintbrush: paintbrushStrokeHandlers
      }) satisfies ViewerShellProps['volumeViewerProps'],
    [onVolumeCaptureTarget, paintbrushStrokeHandlers, volumeViewerLayers, volumeViewerProps]
  );

  const planarViewerWithPaintbrush = useMemo(
    () =>
      ({
        ...planarViewerProps,
        layers: planarViewerLayers,
        onRegisterCaptureTarget: onPlanarCaptureTarget,
        paintbrush: paintbrushStrokeHandlers
      }) satisfies ViewerShellProps['planarViewerProps'],
    [onPlanarCaptureTarget, paintbrushStrokeHandlers, planarViewerLayers, planarViewerProps]
  );

  const handleSavePainting = useCallback(() => {
    const payload = paintbrushController.getPaintRgbBytes();
    if (!payload) {
      return;
    }

    const fileName = paintbrushController.getSuggestedSaveName();
    const { dimensions, rgb } = payload;

    const buffer = encodeRgbTiffStack({
      width: dimensions.width,
      height: dimensions.height,
      depth: dimensions.depth,
      rgb
    });

    if (typeof document === 'undefined') {
      return;
    }

    const blob = new Blob([buffer], { type: 'image/tiff' });
    if (blob.size <= 0) {
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    requestAnimationFrame(() => URL.revokeObjectURL(url));
  }, [paintbrushController]);

  return {
    paintbrushController,
    volumeViewerProps: volumeViewerWithPaintbrush,
    planarViewerProps: planarViewerWithPaintbrush,
    handleSavePainting
  };
}
