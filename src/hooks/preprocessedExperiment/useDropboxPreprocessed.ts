import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent, MutableRefObject } from 'react';
import {
  chooseDropboxFiles,
  DropboxConfigurationError,
  getDropboxAppKeyInfo,
  setDropboxAppKey,
  type DropboxAppKeySource
} from '../../integrations/dropbox';
import type { PreprocessedDropboxCallbacksRef } from './shared';

export type UseDropboxPreprocessedOptions = {
  importPreprocessedFile: (file: File) => Promise<void>;
  isPreprocessedImporting: boolean;
  isPreprocessedLoaderOpen: boolean;
  dropboxImportingRef: MutableRefObject<boolean>;
  dropboxCallbacksRef: PreprocessedDropboxCallbacksRef;
};

export type UseDropboxPreprocessedResult = {
  preprocessedDropboxImporting: boolean;
  preprocessedDropboxError: string | null;
  preprocessedDropboxInfo: string | null;
  isPreprocessedDropboxConfigOpen: boolean;
  preprocessedDropboxAppKeyInput: string;
  preprocessedDropboxAppKeySource: DropboxAppKeySource | null;
  handlePreprocessedDropboxImport: () => Promise<void>;
  handlePreprocessedDropboxConfigSubmit: (event: FormEvent<HTMLFormElement>) => void;
  handlePreprocessedDropboxConfigInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  handlePreprocessedDropboxConfigClear: () => void;
  handlePreprocessedDropboxConfigCancel: () => void;
};

export function useDropboxPreprocessed({
  importPreprocessedFile,
  isPreprocessedImporting,
  isPreprocessedLoaderOpen,
  dropboxImportingRef,
  dropboxCallbacksRef
}: UseDropboxPreprocessedOptions): UseDropboxPreprocessedResult {
  const [preprocessedDropboxImporting, setPreprocessedDropboxImporting] = useState(false);
  const [preprocessedDropboxError, setPreprocessedDropboxError] = useState<string | null>(null);
  const [preprocessedDropboxInfo, setPreprocessedDropboxInfo] = useState<string | null>(null);
  const [isPreprocessedDropboxConfigOpen, setIsPreprocessedDropboxConfigOpen] = useState(false);
  const [preprocessedDropboxAppKeyInput, setPreprocessedDropboxAppKeyInput] = useState('');
  const [preprocessedDropboxAppKeySource, setPreprocessedDropboxAppKeySource] =
    useState<DropboxAppKeySource | null>(null);

  const syncPreprocessedDropboxConfig = useCallback(() => {
    const info = getDropboxAppKeyInfo();
    setPreprocessedDropboxAppKeyInput(info.appKey ?? '');
    setPreprocessedDropboxAppKeySource(info.source);
  }, []);

  const handleResetDropboxState = useCallback(() => {
    setPreprocessedDropboxError(null);
    setPreprocessedDropboxInfo(null);
    setIsPreprocessedDropboxConfigOpen(false);
  }, []);

  const handleDropboxImportStart = useCallback(() => {
    setPreprocessedDropboxError(null);
    setPreprocessedDropboxInfo(null);
  }, []);

  useEffect(() => {
    dropboxCallbacksRef.current = {
      onResetLoader: handleResetDropboxState,
      onImportStart: handleDropboxImportStart
    };
  }, [dropboxCallbacksRef, handleDropboxImportStart, handleResetDropboxState]);

  useEffect(() => {
    dropboxImportingRef.current = preprocessedDropboxImporting;
  }, [dropboxImportingRef, preprocessedDropboxImporting]);

  useEffect(() => {
    if (isPreprocessedLoaderOpen) {
      syncPreprocessedDropboxConfig();
    }
  }, [isPreprocessedLoaderOpen, syncPreprocessedDropboxConfig]);

  const handlePreprocessedDropboxConfigInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setPreprocessedDropboxAppKeyInput(event.target.value);
      if (preprocessedDropboxInfo) {
        setPreprocessedDropboxInfo(null);
      }
    },
    [preprocessedDropboxInfo]
  );

  const handlePreprocessedDropboxConfigSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (preprocessedDropboxAppKeySource === 'env') {
        setIsPreprocessedDropboxConfigOpen(false);
        return;
      }
      const trimmed = preprocessedDropboxAppKeyInput.trim();
      setDropboxAppKey(trimmed ? trimmed : null);
      syncPreprocessedDropboxConfig();
      setIsPreprocessedDropboxConfigOpen(false);
      setPreprocessedDropboxError(null);
      setPreprocessedDropboxInfo(
        trimmed ? 'Dropbox app key saved. Try importing from Dropbox again.' : 'Saved Dropbox app key cleared.'
      );
    },
    [preprocessedDropboxAppKeyInput, preprocessedDropboxAppKeySource, syncPreprocessedDropboxConfig]
  );

  const handlePreprocessedDropboxConfigClear = useCallback(() => {
    setDropboxAppKey(null);
    syncPreprocessedDropboxConfig();
    setPreprocessedDropboxInfo('Saved Dropbox app key cleared.');
    setPreprocessedDropboxError(null);
  }, [syncPreprocessedDropboxConfig]);

  const handlePreprocessedDropboxConfigCancel = useCallback(() => {
    setIsPreprocessedDropboxConfigOpen(false);
  }, []);

  const handlePreprocessedDropboxImport = useCallback(async () => {
    if (isPreprocessedImporting || preprocessedDropboxImporting) {
      return;
    }
    handleDropboxImportStart();
    setPreprocessedDropboxImporting(true);
    try {
      const files = await chooseDropboxFiles({
        extensions: ['.zip', '.llsm', '.llsmz', '.json'],
        multiselect: false
      });
      const [file] = files;
      if (file) {
        await importPreprocessedFile(file);
      }
    } catch (error) {
      console.error('Failed to import preprocessed experiment from Dropbox', error);
      if (error instanceof DropboxConfigurationError) {
        syncPreprocessedDropboxConfig();
        setIsPreprocessedDropboxConfigOpen(true);
        setPreprocessedDropboxError(
          'Dropbox is not configured yet. Add your Dropbox app key below to connect your account.'
        );
      } else {
        const message = error instanceof Error ? error.message : 'Failed to import from Dropbox.';
        setPreprocessedDropboxError(message);
      }
    } finally {
      setPreprocessedDropboxImporting(false);
    }
  }, [
    handleDropboxImportStart,
    importPreprocessedFile,
    isPreprocessedImporting,
    preprocessedDropboxImporting,
    syncPreprocessedDropboxConfig
  ]);

  return {
    preprocessedDropboxImporting,
    preprocessedDropboxError,
    preprocessedDropboxInfo,
    isPreprocessedDropboxConfigOpen,
    preprocessedDropboxAppKeyInput,
    preprocessedDropboxAppKeySource,
    handlePreprocessedDropboxImport,
    handlePreprocessedDropboxConfigSubmit,
    handlePreprocessedDropboxConfigInputChange,
    handlePreprocessedDropboxConfigClear,
    handlePreprocessedDropboxConfigCancel
  };
}
