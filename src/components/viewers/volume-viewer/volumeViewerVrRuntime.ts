import type { VolumeViewerVrProps } from '../VolumeViewer.types';

export type VolumeViewerVrRuntime = {
  isVrPassthroughSupported: boolean;
  trackChannels: NonNullable<VolumeViewerVrProps['trackChannels']>;
  activeTrackChannelId: VolumeViewerVrProps['activeTrackChannelId'];
  channelPanels: NonNullable<VolumeViewerVrProps['channelPanels']>;
  activeChannelPanelId: VolumeViewerVrProps['activeChannelPanelId'];
  onRegisterVrSession: VolumeViewerVrProps['onRegisterVrSession'];
};

export function resolveVolumeViewerVrRuntime(vr: VolumeViewerVrProps | undefined): VolumeViewerVrRuntime {
  return {
    isVrPassthroughSupported: vr?.isVrPassthroughSupported ?? false,
    trackChannels: vr?.trackChannels ?? [],
    activeTrackChannelId: vr?.activeTrackChannelId ?? null,
    channelPanels: vr?.channelPanels ?? [],
    activeChannelPanelId: vr?.activeChannelPanelId ?? null,
    onRegisterVrSession: vr?.onRegisterVrSession,
  };
}
