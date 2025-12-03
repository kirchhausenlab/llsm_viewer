import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ChannelLayerStateProvider } from './hooks/useChannelLayerState';
import '@fontsource/inter';
import './styles.css';
import { ensureExportServiceWorkerRegistered } from './utils/exportServiceWorker';

ensureExportServiceWorkerRegistered();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ChannelLayerStateProvider>
      <App />
    </ChannelLayerStateProvider>
  </React.StrictMode>
);
