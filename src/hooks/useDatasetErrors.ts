import { useCallback, useState } from 'react';

type DatasetErrorContext = 'launch' | 'interaction';

type DatasetErrorState = {
  datasetError: string | null;
  datasetErrorContext: DatasetErrorContext | null;
  datasetErrorResetSignal: number;
};

type DatasetErrorActions = {
  reportDatasetError: (message: string, context: DatasetErrorContext) => void;
  clearDatasetError: () => void;
  bumpDatasetErrorResetSignal: () => void;
};

export type DatasetErrorHook = DatasetErrorState & DatasetErrorActions;

export function useDatasetErrors(): DatasetErrorHook {
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [datasetErrorContext, setDatasetErrorContext] = useState<DatasetErrorContext | null>(null);
  const [datasetErrorResetSignal, setDatasetErrorResetSignal] = useState(0);

  const reportDatasetError = useCallback((message: string, context: DatasetErrorContext) => {
    setDatasetError(message);
    setDatasetErrorContext(context);
  }, []);

  const clearDatasetError = useCallback(() => {
    setDatasetError(null);
    setDatasetErrorContext(null);
    setDatasetErrorResetSignal((current) => current + 1);
  }, []);

  const bumpDatasetErrorResetSignal = useCallback(() => {
    setDatasetErrorResetSignal((current) => current + 1);
  }, []);

  return {
    datasetError,
    datasetErrorContext,
    datasetErrorResetSignal,
    reportDatasetError,
    clearDatasetError,
    bumpDatasetErrorResetSignal
  };
}

export type { DatasetErrorContext };
