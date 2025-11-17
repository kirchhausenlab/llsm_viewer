import { useCallback, useState } from 'react';
import { downloadStream, sanitizeExportFileName } from '../../utils/downloads';
import {
  canUseFileSystemSavePicker,
  exportPreprocessedDatasetInWorker,
  requestFileSystemSaveHandle,
  type FileSystemFileHandleLike
} from '../../workers/exportPreprocessedDatasetClient';
import type { ChannelExportMetadata } from '../../utils/preprocessedDataset';
import type { LoadedLayer } from '../../types/layers';
import type { ChannelSource, StagedPreprocessedExperiment } from '../../App';
import type { VoxelResolutionValues } from '../../types/voxelResolution';

export type UsePreprocessedExportOptions = {
  channels: ChannelSource[];
  preprocessedExperiment: StagedPreprocessedExperiment | null;
  loadSelectedDataset: () => Promise<LoadedLayer[] | null>;
  clearDatasetError: () => void;
  showInteractionWarning: (message: string) => void;
  isLaunchingViewer: boolean;
  voxelResolution: VoxelResolutionValues | null;
};

export type UsePreprocessedExportResult = {
  isExportingPreprocessed: boolean;
  handleExportPreprocessedExperiment: () => Promise<void>;
};

export function usePreprocessedExport({
  channels,
  preprocessedExperiment,
  loadSelectedDataset,
  clearDatasetError,
  showInteractionWarning,
  isLaunchingViewer,
  voxelResolution
}: UsePreprocessedExportOptions): UsePreprocessedExportResult {
  const [isExportingPreprocessed, setIsExportingPreprocessed] = useState(false);

  const handleExportPreprocessedExperiment = useCallback(async () => {
    if (isExportingPreprocessed || isLaunchingViewer) {
      return;
    }

    const hasAnyLayers = preprocessedExperiment
      ? preprocessedExperiment.layers.length > 0
      : channels.some((channel) => channel.layers.length > 0);

    if (!hasAnyLayers) {
      showInteractionWarning('There are no volumes available to export.');
      return;
    }

    const resolvedVoxelResolution =
      preprocessedExperiment?.manifest.dataset.voxelResolution ?? voxelResolution;

    if (!resolvedVoxelResolution) {
      showInteractionWarning('Fill in all voxel resolution fields before exporting.');
      return;
    }

    setIsExportingPreprocessed(true);
    try {
      const suggestionSource =
        preprocessedExperiment?.sourceName ?? channels[0]?.name ?? 'preprocessed-experiment';
      const suggestionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const suggestionBase = sanitizeExportFileName(suggestionSource);
      const suggestedFileName = `${suggestionBase}-${suggestionTimestamp}.zip`;

      let fileHandle: FileSystemFileHandleLike | null = null;
      if (canUseFileSystemSavePicker()) {
        try {
          fileHandle = await requestFileSystemSaveHandle(suggestedFileName);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') {
            console.info('Preprocessed dataset export cancelled by user');
            return;
          }
          throw error;
        }
      }

      let layersToExport: LoadedLayer[];
      let channelsMetadata: ChannelExportMetadata[];

      if (preprocessedExperiment) {
        layersToExport = preprocessedExperiment.layers;
        channelsMetadata = preprocessedExperiment.channelSummaries.map((summary) => ({
          id: summary.id,
          name: summary.name.trim() || 'Untitled channel',
          trackEntries: summary.trackEntries
        }));
      } else {
        const normalizedLayers = await loadSelectedDataset();
        if (!normalizedLayers) {
          return;
        }
        layersToExport = normalizedLayers;
        channelsMetadata = channels.map<ChannelExportMetadata>((channel) => ({
          id: channel.id,
          name: channel.name.trim() || 'Untitled channel',
          trackEntries: channel.trackEntries
        }));
      }

      if (layersToExport.length === 0) {
        showInteractionWarning('There are no volumes available to export.');
        return;
      }

      const { manifest, stream } = await exportPreprocessedDatasetInWorker({
        layers: layersToExport,
        channels: channelsMetadata,
        voxelResolution: resolvedVoxelResolution
      });

      const baseNameSource =
        preprocessedExperiment?.sourceName ?? channelsMetadata[0]?.name ?? 'preprocessed-experiment';
      const fileBase = sanitizeExportFileName(baseNameSource);
      const timestamp = manifest.generatedAt.replace(/[:.]/g, '-');
      const fileName = `${fileBase}-${timestamp}.zip`;

      await downloadStream(stream, fileName, fileHandle);
      clearDatasetError();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.info('Preprocessed dataset export cancelled by user');
      } else {
        console.error('Failed to export preprocessed dataset', error);
        const message = error instanceof Error ? error.message : 'Failed to export preprocessed dataset.';
        showInteractionWarning(message);
      }
    } finally {
      setIsExportingPreprocessed(false);
    }
  }, [
    channels,
    clearDatasetError,
    isExportingPreprocessed,
    isLaunchingViewer,
    loadSelectedDataset,
    preprocessedExperiment,
    showInteractionWarning,
    voxelResolution
  ]);

  return {
    isExportingPreprocessed,
    handleExportPreprocessedExperiment
  };
}
