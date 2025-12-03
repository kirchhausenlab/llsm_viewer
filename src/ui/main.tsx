import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '@fontsource/inter';
import '../styles.css';
import { ensureExportServiceWorkerRegistered } from '../shared/utils/exportServiceWorker';

ensureExportServiceWorkerRegistered();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
