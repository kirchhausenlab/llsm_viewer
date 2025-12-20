import type { ViewerMode, ModeControlsProps } from '../types';

export type ModeToggleState = {
  viewerMode: ViewerMode;
  is3dModeAvailable: boolean;
  isVrActive: boolean;
  isVrRequesting: boolean;
  resetViewHandler: (() => void) | null;
  onToggleViewerMode: () => void;
  onVrButtonClick: () => void;
  vrButtonDisabled: boolean;
  vrButtonTitle?: string;
  vrButtonLabel: string;
};

export type ViewerSettingsControls = {
  renderStyle: ModeControlsProps['renderStyle'];
  samplingMode: ModeControlsProps['samplingMode'];
  onRenderStyleToggle: ModeControlsProps['onRenderStyleToggle'];
  onSamplingModeToggle: ModeControlsProps['onSamplingModeToggle'];
  blendingMode: ModeControlsProps['blendingMode'];
  onBlendingModeToggle: ModeControlsProps['onBlendingModeToggle'];
  showRenderingQualityControl: boolean;
  renderingQuality: number;
  onRenderingQualityChange: (value: number) => void;
  hasVolumeData: boolean;
  viewerMode: ViewerMode;
};

export function useViewerModeControls({
  viewerMode,
  modeControls,
  showRenderingQualityControl,
  renderingQuality,
  onRenderingQualityChange,
  hasVolumeData
}: {
  viewerMode: ViewerMode;
  modeControls: ModeControlsProps;
  showRenderingQualityControl: boolean;
  renderingQuality: number;
  onRenderingQualityChange: (value: number) => void;
  hasVolumeData: boolean;
}): { modeToggle: ModeToggleState; viewerSettings: ViewerSettingsControls } {
  const modeToggle: ModeToggleState = {
    viewerMode,
    is3dModeAvailable: modeControls.is3dModeAvailable,
    isVrActive: modeControls.isVrActive,
    isVrRequesting: modeControls.isVrRequesting,
    resetViewHandler: modeControls.resetViewHandler,
    onToggleViewerMode: modeControls.onToggleViewerMode,
    onVrButtonClick: modeControls.onVrButtonClick,
    vrButtonDisabled: modeControls.vrButtonDisabled,
    vrButtonLabel: modeControls.vrButtonLabel,
    vrButtonTitle: modeControls.vrButtonTitle
  };

  const viewerSettings: ViewerSettingsControls = {
    renderStyle: modeControls.renderStyle,
    samplingMode: modeControls.samplingMode,
    onRenderStyleToggle: modeControls.onRenderStyleToggle,
    onSamplingModeToggle: modeControls.onSamplingModeToggle,
    blendingMode: modeControls.blendingMode,
    onBlendingModeToggle: modeControls.onBlendingModeToggle,
    showRenderingQualityControl,
    renderingQuality,
    onRenderingQualityChange,
    hasVolumeData,
    viewerMode
  };

  return { modeToggle, viewerSettings };
}
