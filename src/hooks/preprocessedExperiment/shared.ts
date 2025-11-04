import type { MutableRefObject } from 'react';

export type PreprocessedDropboxCallbacks = {
  onResetLoader: () => void;
  onImportStart: () => void;
};

export type PreprocessedDropboxCallbacksRef = MutableRefObject<PreprocessedDropboxCallbacks>;
