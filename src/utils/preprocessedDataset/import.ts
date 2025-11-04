import { unzipSync } from 'fflate';

import type { LoadedLayer } from '../../types/layers';
import type { NormalizedVolume } from '../../volumeProcessing';

import { computeSha256Hex } from './hash';
import {
  type ImportPreprocessedDatasetResult,
  type PreprocessedChannelSummary,
  type PreprocessedLayerSummary,
  type PreprocessedManifest,
  type PreprocessedVolumeManifestEntry,
  MANIFEST_FILE_NAME
} from './types';

const textDecoder = new TextDecoder();

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

function validateManifest(manifest: PreprocessedManifest): void {
  if (manifest.format !== 'llsm-viewer-preprocessed') {
    throw new Error('Unsupported preprocessed dataset format.');
  }
  if (manifest.version !== 1) {
    throw new Error(`Unsupported preprocessed dataset version: ${manifest.version}`);
  }
}

function createNormalizedVolume(
  entry: PreprocessedVolumeManifestEntry,
  data: Uint8Array
): NormalizedVolume {
  if (data.byteLength !== entry.byteLength) {
    throw new Error(
      `Volume size mismatch for ${entry.path}. Expected ${entry.byteLength} bytes, received ${data.byteLength}.`
    );
  }

  return {
    width: entry.width,
    height: entry.height,
    depth: entry.depth,
    channels: entry.channels,
    dataType: entry.dataType,
    normalized: data,
    min: entry.min,
    max: entry.max
  };
}

export async function importPreprocessedDataset(
  source: ArrayBuffer | Uint8Array
): Promise<ImportPreprocessedDatasetResult> {
  const bytes = toUint8Array(source);
  const files = unzipSync(bytes);
  const manifestRaw = files[MANIFEST_FILE_NAME];
  if (!manifestRaw) {
    throw new Error('The archive does not contain a manifest.json file.');
  }

  const manifestText = textDecoder.decode(manifestRaw);
  let parsed: PreprocessedManifest;
  try {
    parsed = JSON.parse(manifestText) as PreprocessedManifest;
  } catch (error) {
    throw new Error('The manifest.json file is not valid JSON.');
  }

  validateManifest(parsed);

  const layers: LoadedLayer[] = [];
  const channelSummaries: PreprocessedChannelSummary[] = [];
  let actualVolumeCount = 0;

  for (const channel of parsed.dataset.channels) {
    const layerSummaries: PreprocessedLayerSummary[] = [];
    for (const layer of channel.layers) {
      const normalizedVolumes: NormalizedVolume[] = [];
      for (const volume of layer.volumes) {
        const entryData = files[volume.path];
        if (!entryData) {
          throw new Error(`Archive is missing volume data at ${volume.path}.`);
        }
        const digest = await computeSha256Hex(entryData);
        if (digest !== volume.digest) {
          throw new Error(`Digest mismatch for ${volume.path}. The file may be corrupted.`);
        }
        const owned = new Uint8Array(entryData); // copy to detach from fflate internal buffer
        normalizedVolumes.push(createNormalizedVolume(volume, owned));
        actualVolumeCount += 1;
      }
      layers.push({
        key: layer.key,
        label: layer.label,
        channelId: layer.channelId,
        volumes: normalizedVolumes,
        isSegmentation: layer.isSegmentation
      });

      const firstVolume = layer.volumes[0];
      layerSummaries.push({
        key: layer.key,
        label: layer.label,
        isSegmentation: layer.isSegmentation,
        volumeCount: layer.volumes.length,
        width: firstVolume?.width ?? 0,
        height: firstVolume?.height ?? 0,
        depth: firstVolume?.depth ?? 0,
        channels: firstVolume?.channels ?? 0,
        dataType: firstVolume?.dataType ?? 'uint8',
        min: firstVolume?.min ?? 0,
        max: firstVolume?.max ?? 0
      });
    }

    channelSummaries.push({
      id: channel.id,
      name: channel.name,
      trackEntries: channel.trackEntries,
      layers: layerSummaries
    });
  }

  if (actualVolumeCount !== parsed.dataset.totalVolumeCount) {
    throw new Error('Manifest volume count does not match the archive contents.');
  }

  return {
    manifest: parsed,
    layers,
    channelSummaries,
    totalVolumeCount: parsed.dataset.totalVolumeCount
  };
}
