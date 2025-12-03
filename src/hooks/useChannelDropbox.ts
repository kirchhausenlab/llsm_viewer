import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  chooseDropboxFiles,
  DropboxConfigurationError,
  getDropboxAppKeyInfo,
  setDropboxAppKey,
  type DropboxAppKeySource,
  type DropboxChooserRequestOptions
} from '../integrations/dropbox';
import type { DropboxTarget } from '../components/ChannelDropboxSection';

type UseChannelDropboxParams = {
  disabled: boolean;
};

type DropboxImportRequest = {
  target: DropboxTarget;
  options: DropboxChooserRequestOptions;
  onImported: (files: File[]) => void;
};

export type ChannelDropboxState = {
  importTarget: DropboxTarget | null;
  error: string | null;
  errorContext: DropboxTarget | null;
  info: string | null;
  isConfigOpen: boolean;
  appKeyInput: string;
  appKeySource: DropboxAppKeySource | null;
};

type ChannelDropboxControls = {
  importFromDropbox: (request: DropboxImportRequest) => Promise<void>;
  setDropboxConfigOpen: (open: boolean) => void;
  updateAppKeyInput: (value: string) => void;
  submitDropboxConfig: () => void;
  cancelDropboxConfig: () => void;
  clearDropboxConfig: () => void;
};

export default function useChannelDropbox({ disabled }: UseChannelDropboxParams): {
  state: ChannelDropboxState;
  controls: ChannelDropboxControls;
} {
  const [importTarget, setImportTarget] = useState<DropboxTarget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorContext, setErrorContext] = useState<DropboxTarget | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [appKeyInput, setAppKeyInput] = useState('');
  const [appKeySource, setAppKeySource] = useState<DropboxAppKeySource | null>(null);

  const syncDropboxConfigState = useCallback(() => {
    const appKeyInfo = getDropboxAppKeyInfo();
    setAppKeyInput(appKeyInfo.appKey ?? '');
    setAppKeySource(appKeyInfo.source);
  }, []);

  useEffect(() => {
    syncDropboxConfigState();
  }, [syncDropboxConfigState]);

  useEffect(() => {
    if (disabled) {
      setImportTarget(null);
      setError(null);
      setErrorContext(null);
      setInfo(null);
      setIsConfigOpen(false);
    }
  }, [disabled]);

  const importFromDropbox = useCallback(
    async ({ target, options, onImported }: DropboxImportRequest) => {
      if (disabled || importTarget !== null) {
        return;
      }
      setError(null);
      setErrorContext(null);
      setInfo(null);
      setImportTarget(target);
      try {
        const files = await chooseDropboxFiles(options);
        if (files.length > 0) {
          onImported(files);
        }
      } catch (importError) {
        console.error('Failed to import from Dropbox', importError);
        setErrorContext(target);
        if (importError instanceof DropboxConfigurationError) {
          syncDropboxConfigState();
          setIsConfigOpen(true);
          setError('Dropbox is not configured yet. Add your Dropbox app key below to connect your account.');
        } else {
          const message =
            importError instanceof Error ? importError.message : 'Failed to import files from Dropbox.';
          setError(message);
        }
      } finally {
        setImportTarget(null);
      }
    },
    [disabled, importTarget, syncDropboxConfigState]
  );

  const updateAppKeyInput = useCallback(
    (value: string) => {
      setAppKeyInput(value);
      if (info) {
        setInfo(null);
      }
    },
    [info]
  );

  const submitDropboxConfig = useCallback(() => {
    if (appKeySource === 'env') {
      setIsConfigOpen(false);
      return;
    }
    const trimmed = appKeyInput.trim();
    setDropboxAppKey(trimmed ? trimmed : null);
    syncDropboxConfigState();
    setIsConfigOpen(false);
    setError(null);
    setErrorContext(null);
    setInfo(trimmed ? 'Dropbox app key saved. Try importing from Dropbox again.' : 'Saved Dropbox app key cleared.');
  }, [appKeyInput, appKeySource, syncDropboxConfigState]);

  const cancelDropboxConfig = useCallback(() => {
    setIsConfigOpen(false);
  }, []);

  const clearDropboxConfig = useCallback(() => {
    setDropboxAppKey(null);
    syncDropboxConfigState();
    setInfo('Saved Dropbox app key cleared.');
    setError(null);
    setErrorContext(null);
  }, [syncDropboxConfigState]);

  const state = useMemo(
    () => ({
      importTarget,
      error,
      errorContext,
      info,
      isConfigOpen,
      appKeyInput,
      appKeySource
    }),
    [appKeyInput, appKeySource, error, errorContext, importTarget, info, isConfigOpen]
  );

  const controls = useMemo(
    () => ({
      importFromDropbox,
      setDropboxConfigOpen: setIsConfigOpen,
      updateAppKeyInput,
      submitDropboxConfig,
      cancelDropboxConfig,
      clearDropboxConfig
    }),
    [cancelDropboxConfig, clearDropboxConfig, importFromDropbox, submitDropboxConfig, updateAppKeyInput]
  );

  return { state, controls };
}
