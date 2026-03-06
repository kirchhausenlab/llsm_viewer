import type { PropsWithChildren } from 'react';
import { ChannelLayerStateProvider } from '../../hooks/useChannelLayerState';
import { UiThemeProvider } from './providers/UiThemeProvider';

export default function AppProviders({ children }: PropsWithChildren) {
  return (
    <UiThemeProvider>
      <ChannelLayerStateProvider>{children}</ChannelLayerStateProvider>
    </UiThemeProvider>
  );
}
