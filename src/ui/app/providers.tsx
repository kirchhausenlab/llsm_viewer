import type { PropsWithChildren } from 'react';
import { ChannelLayerStateProvider } from '../../hooks/useChannelLayerState';

export default function AppProviders({ children }: PropsWithChildren) {
  return <ChannelLayerStateProvider>{children}</ChannelLayerStateProvider>;
}
