import type { NormalizedVolume } from '../volumeProcessing';
import type {
  SerializedChannelState,
  SerializedDataset,
  SerializedLayer,
  SerializedLayerSettings,
  SerializedTrackState,
  SerializedViewerState,
  SerializedVolume
} from './types';

export type HydratedLayer = {
  key: string;
  label: string;
  channelId: string;
  channelName: string;
  isSegmentation: boolean;
  volumes: NormalizedVolume[];
};

export type HydratedDataset = {
  layers: HydratedLayer[];
  layerSettings: Record<string, SerializedLayerSettings>;
  channels: SerializedChannelState[];
  tracks: SerializedDataset['tracks'];
  trackStates: SerializedTrackState[];
  viewerState: SerializedViewerState;
  createdAt: number;
};

const CHUNK_SIZE = 0x8000;
const hasNodeBuffer = typeof globalThis !== 'undefined' && Boolean((globalThis as any).Buffer);

function encodeBinary(data: Uint8Array): string {
  if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
    let binary = '';
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.subarray(i, Math.min(i + CHUNK_SIZE, data.length));
      binary += String.fromCharCode(...chunk);
    }
    return window.btoa(binary);
  }
  if (hasNodeBuffer) {
    return (globalThis as any).Buffer.from(data).toString('base64');
  }
  throw new Error('Base64 encoding is not supported in this environment');
}

function decodeBinary(payload: string): Uint8Array {
  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    const binary = window.atob(payload);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      buffer[i] = binary.charCodeAt(i);
    }
    return buffer;
  }
  if (hasNodeBuffer) {
    return Uint8Array.from((globalThis as any).Buffer.from(payload, 'base64'));
  }
  throw new Error('Base64 decoding is not supported in this environment');
}

export function serializeVolume(volume: NormalizedVolume): SerializedVolume {
  return {
    width: volume.width,
    height: volume.height,
    depth: volume.depth,
    channels: volume.channels,
    min: volume.min,
    max: volume.max,
    data: encodeBinary(volume.normalized)
  };
}

export function deserializeVolume(serialized: SerializedVolume): NormalizedVolume {
  const normalized = decodeBinary(serialized.data);
  return {
    width: serialized.width,
    height: serialized.height,
    depth: serialized.depth,
    channels: serialized.channels,
    min: serialized.min,
    max: serialized.max,
    normalized
  };
}

export function serializeLayer(
  layer: HydratedLayer
): SerializedLayer {
  return {
    key: layer.key,
    label: layer.label,
    channelId: layer.channelId,
    channelName: layer.channelName,
    isSegmentation: layer.isSegmentation,
    volumes: layer.volumes.map(serializeVolume)
  };
}

export function deserializeLayer(layer: SerializedLayer): HydratedLayer {
  return {
    key: layer.key,
    label: layer.label,
    channelId: layer.channelId,
    channelName: layer.channelName,
    isSegmentation: layer.isSegmentation,
    volumes: layer.volumes.map(deserializeVolume)
  };
}

export function serializeDataset(dataset: HydratedDataset): SerializedDataset {
  return {
    layers: dataset.layers.map(serializeLayer),
    layerSettings: dataset.layerSettings,
    channels: dataset.channels,
    tracks: dataset.tracks,
    trackStates: dataset.trackStates,
    viewerState: dataset.viewerState,
    createdAt: dataset.createdAt
  };
}

export function deserializeDataset(dataset: SerializedDataset): HydratedDataset {
  return {
    layers: dataset.layers.map(deserializeLayer),
    layerSettings: dataset.layerSettings,
    channels: dataset.channels,
    tracks: dataset.tracks,
    trackStates: dataset.trackStates,
    viewerState: dataset.viewerState,
    createdAt: dataset.createdAt
  };
}
