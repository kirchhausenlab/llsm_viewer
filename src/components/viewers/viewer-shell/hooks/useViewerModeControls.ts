import type { ModeControlsProps } from '../types';

export type ModeToggleState = {
  is3dModeAvailable: boolean;
  isVrActive: boolean;
  isVrRequesting: boolean;
  resetViewHandler: (() => void) | null;
  onVrButtonClick: () => void;
  vrButtonDisabled: boolean;
  vrButtonTitle?: string;
  vrButtonLabel: string;
};

export type ViewerSettingsControls = {
  samplingMode: ModeControlsProps['samplingMode'];
  onSamplingModeToggle: ModeControlsProps['onSamplingModeToggle'];
  blendingMode: ModeControlsProps['blendingMode'];
  onBlendingModeToggle: ModeControlsProps['onBlendingModeToggle'];
  showRenderingQualityControl: boolean;
  renderingQuality: number;
  onRenderingQualityChange: (value: number) => void;
  hasVolumeData: boolean;
};

export function useViewerModeControls({
  modeControls,
  showRenderingQualityControl,
  renderingQuality,
  onRenderingQualityChange,
  hasVolumeData
}: {
  modeControls: ModeControlsProps;
  showRenderingQualityControl: boolean;
  renderingQuality: number;
  onRenderingQualityChange: (value: number) => void;
  hasVolumeData: boolean;
}): { modeToggle: ModeToggleState; viewerSettings: ViewerSettingsControls } {
  const modeToggle: ModeToggleState = {
    is3dModeAvailable: modeControls.is3dModeAvailable,
    isVrActive: modeControls.isVrActive,
    isVrRequesting: modeControls.isVrRequesting,
    resetViewHandler: modeControls.resetViewHandler,
    onVrButtonClick: modeControls.onVrButtonClick,
    vrButtonDisabled: modeControls.vrButtonDisabled,
    vrButtonLabel: modeControls.vrButtonLabel,
    vrButtonTitle: modeControls.vrButtonTitle
  };

  const viewerSettings: ViewerSettingsControls = {
    samplingMode: modeControls.samplingMode,
    onSamplingModeToggle: modeControls.onSamplingModeToggle,
    blendingMode: modeControls.blendingMode,
    onBlendingModeToggle: modeControls.onBlendingModeToggle,
    showRenderingQualityControl,
    renderingQuality,
    onRenderingQualityChange,
    hasVolumeData
  };

  return { modeToggle, viewerSettings };
}
