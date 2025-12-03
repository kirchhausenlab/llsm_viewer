import assert from 'node:assert/strict';
import { useRef, useState } from 'react';

import { useDatasetLaunch } from '../../../src/ui/app/hooks/useDatasetLaunch.ts';
import type { DatasetErrorContext } from '../../../src/hooks/useDatasetErrors.ts';
import { renderHook } from '../../hooks/renderHook.ts';

console.log('Starting useDatasetLaunch tests');

await (async () => {
  const stubbedLoadSelectedDataset = async ({
    setStatus,
    setLoadProgress,
    setLoadedCount,
    setExpectedVolumeCount
  }: any) => {
    setStatus('loading');
    setExpectedVolumeCount(3);
    setLoadedCount(1);
    setLoadProgress(0.25);
    setStatus('loaded');
    return [];
  };

  const hook = renderHook(() => {
    const [datasetError, setDatasetError] = useState<string | null>(null);
    const [datasetErrorContext, setDatasetErrorContext] = useState<DatasetErrorContext | null>(null);
    const resetCounterRef = useRef(0);

    const launch = useDatasetLaunch({
      voxelResolution: { x: 1, y: 1, z: 1, unit: 'μm', correctAnisotropy: false },
      anisotropyScale: { x: 1, y: 1, z: 1 },
      experimentDimension: '3d',
      loadSelectedDataset: stubbedLoadSelectedDataset as any,
      clearDatasetError: () => {
        setDatasetError(null);
        setDatasetErrorContext(null);
      },
      reportDatasetError: (message, context) => {
        setDatasetError(message);
        setDatasetErrorContext(context);
      },
      bumpDatasetErrorResetSignal: () => {
        resetCounterRef.current += 1;
      },
      datasetError,
      datasetErrorContext,
      setSelectedIndex: () => {},
      setIsPlaying: () => {},
      setActiveChannelTabId: () => {}
    });

    return { launch, setDatasetError, setDatasetErrorContext, resetCounterRef };
  });

  const { act } = hook;

  await act(async () => {
    await hook.result.launch.loadDataset();
  });

  assert.equal(hook.result.launch.status, 'loaded');
  assert.equal(hook.result.launch.loadProgress, 0.25);
  assert.equal(hook.result.launch.expectedVolumeCount, 3);

  act(() => {
    hook.result.setDatasetError('example error');
    hook.result.setDatasetErrorContext('launch');
  });

  assert.equal(hook.result.resetCounterRef.current, 1);
})();

console.log('useDatasetLaunch tests passed');
