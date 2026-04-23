import type { VolumeBrickPageTable } from '../../../core/volumeProvider';
import type { ViewerProjectionMode } from '../../../hooks/useVolumeRenderSetup';
import type { LoadedDatasetLayer } from '../../../hooks/dataset';
import { shouldPreferDirectVolumeSampling } from '../../../shared/utils/lod0Residency';
import type { PreprocessedLayerScaleManifestEntry } from '../../../shared/utils/preprocessedDataset/types';

export type ResidencyMode = 'atlas' | 'volume';

export type ResidencyDecision = {
  mode: ResidencyMode;
  scaleLevel: number;
  rationale: string;
};

export type LayerResidencyPreference = {
  mode: ResidencyMode;
  rationale: string;
};

const MAX_BRICK_ATLAS_DEPTH_HINT = 2048;
const MAX_BRICK_ATLAS_BYTES_HINT = 384 * 1024 * 1024;
const MAX_VOLUME_BYTES_HINT = 384 * 1024 * 1024;

function normalizeTextureChannelCount(sourceChannels: number): number {
  if (sourceChannels <= 1) {
    return 1;
  }
  if (sourceChannels === 2) {
    return 2;
  }
  return 4;
}

function estimateManifestAtlasBytes(scale: PreprocessedLayerScaleManifestEntry): number | null {
  const zarr = (scale as { zarr?: PreprocessedLayerScaleManifestEntry['zarr'] }).zarr;
  const chunkShape = zarr?.data?.chunkShape ?? null;
  const leafGridShape = zarr?.skipHierarchy?.levels?.find((level) => level.level === 0)?.gridShape ?? null;
  if (
    !Array.isArray(chunkShape) ||
    chunkShape.length < 4 ||
    !Array.isArray(leafGridShape) ||
    leafGridShape.length < 3
  ) {
    return null;
  }
  const chunkDepth = Math.max(1, Math.floor(chunkShape[1] ?? 0));
  const chunkHeight = Math.max(1, Math.floor(chunkShape[2] ?? 0));
  const chunkWidth = Math.max(1, Math.floor(chunkShape[3] ?? 0));
  const totalBricks =
    Math.max(1, Math.floor(leafGridShape[0] ?? 0)) *
    Math.max(1, Math.floor(leafGridShape[1] ?? 0)) *
    Math.max(1, Math.floor(leafGridShape[2] ?? 0));
  const textureChannels = normalizeTextureChannelCount(scale.channels ?? 1);
  return chunkDepth * chunkHeight * chunkWidth * totalBricks * textureChannels;
}

export function buildLayerResidencyPreferenceMap({
  channelLayersMap,
  preferBrickResidency,
  canUseAtlas,
}: {
  channelLayersMap: Map<string, LoadedDatasetLayer[]>;
  preferBrickResidency: boolean;
  canUseAtlas: boolean;
  projectionMode: ViewerProjectionMode;
}): Map<string, LayerResidencyPreference> {
  const decisionByKey = new Map<string, LayerResidencyPreference>();

  for (const layers of channelLayersMap.values()) {
    for (const layer of layers) {
      let mode: ResidencyMode = 'volume';
      let rationale = 'direct-volume-default';

      if (!preferBrickResidency) {
        rationale = 'brick-residency-disabled';
      } else if (!canUseAtlas) {
        rationale = 'atlas-provider-unavailable';
      } else if (layer.depth <= 1) {
        rationale = 'single-slice-layer';
      } else if (layer.isSegmentation) {
        rationale = 'segmentation-direct-volume';
      } else {
        mode = 'atlas';
        rationale = 'atlas-eligible';
      }

      decisionByKey.set(layer.key, {
        mode,
        rationale,
      });
    }
  }

  return decisionByKey;
}

export function buildPreferredResidencyDecision({
  scaleLevel,
  preference,
  scale,
  playbackActive = false,
}: {
  scaleLevel: number;
  preference: LayerResidencyPreference | null | undefined;
  scale?: PreprocessedLayerScaleManifestEntry | null;
  playbackActive?: boolean;
}): ResidencyDecision {
  const hasPlaybackAtlas = Boolean(
    (scale as { zarr?: PreprocessedLayerScaleManifestEntry['zarr'] | undefined } | null | undefined)?.zarr?.playbackAtlas
  );
  if (preference?.mode === 'atlas' && playbackActive && hasPlaybackAtlas) {
    return {
      mode: 'atlas',
      scaleLevel,
      rationale: 'playback-atlas-preferred',
    };
  }
  if (preference?.mode === 'atlas' && scale) {
    const directVolumeBytes = scale.width * scale.height * scale.depth * Math.max(1, scale.channels);
    const estimatedPlaybackAtlasBytes =
      ((scale as { zarr?: PreprocessedLayerScaleManifestEntry['zarr'] }).zarr?.playbackAtlas?.data.sharding?.estimatedShardBytes) ??
      null;
    const estimatedManifestAtlasBytes = estimateManifestAtlasBytes(scale);
    if (
      Number.isFinite(estimatedPlaybackAtlasBytes) &&
      (estimatedPlaybackAtlasBytes as number) >= directVolumeBytes
    ) {
      return {
        mode: 'volume',
        scaleLevel,
        rationale: 'direct-volume-preferred-from-manifest',
      };
    }
    if (
      Number.isFinite(estimatedManifestAtlasBytes) &&
      (estimatedManifestAtlasBytes as number) >= directVolumeBytes
    ) {
      return {
        mode: 'volume',
        scaleLevel,
        rationale: 'direct-volume-preferred-from-manifest-upper-bound',
      };
    }
  }
  return {
    mode: preference?.mode ?? 'volume',
    scaleLevel,
    rationale: preference?.rationale ?? 'direct-volume-default',
  };
}

export function resolveScaleAwareResidencyDecision({
  preferredDecision,
  scale,
  pageTable,
  playbackActive = false,
}: {
  preferredDecision: ResidencyDecision;
  scale: PreprocessedLayerScaleManifestEntry | null;
  pageTable: VolumeBrickPageTable | null;
  playbackActive?: boolean;
}): ResidencyDecision {
  if (preferredDecision.mode !== 'atlas' || !pageTable) {
    return preferredDecision;
  }

  const sourceChannels = scale?.channels ?? 1;
  const textureChannels = normalizeTextureChannelCount(sourceChannels);
  const estimatedAtlasDepth = pageTable.chunkShape[0] * pageTable.occupiedBrickCount;
  const estimatedAtlasBytes =
    pageTable.chunkShape[2] *
    pageTable.chunkShape[1] *
    estimatedAtlasDepth *
    textureChannels;

  if (scale && !playbackActive) {
    const shouldUseDirectVolume = shouldPreferDirectVolumeSampling({
      scaleLevel: pageTable.scaleLevel,
      volumeWidth: scale.width,
      volumeHeight: scale.height,
      volumeDepth: scale.depth,
      textureChannels,
      gridShape: pageTable.gridShape,
      chunkShape: pageTable.chunkShape,
      occupiedBrickCount: pageTable.occupiedBrickCount,
      maxDirectVolumeBytes: MAX_VOLUME_BYTES_HINT,
    });
    if (shouldUseDirectVolume) {
      return {
        mode: 'volume',
        scaleLevel: preferredDecision.scaleLevel,
        rationale: 'direct-volume-preferred-for-scale',
      };
    }
  }

  if (estimatedAtlasDepth > MAX_BRICK_ATLAS_DEPTH_HINT) {
    return {
      mode: 'volume',
      scaleLevel: preferredDecision.scaleLevel,
      rationale: 'atlas-depth-limit',
    };
  }

  if (estimatedAtlasBytes > MAX_BRICK_ATLAS_BYTES_HINT) {
    return {
      mode: 'volume',
      scaleLevel: preferredDecision.scaleLevel,
      rationale: 'atlas-byte-limit',
    };
  }

  return preferredDecision;
}

export function collectResidencyDecisionSignature({
  layerKeys,
  residencyDecisionByLayerKey,
}: {
  layerKeys: readonly string[];
  residencyDecisionByLayerKey: Record<string, ResidencyDecision | null | undefined>;
}): string {
  return layerKeys
    .map((layerKey) => {
      const decision = residencyDecisionByLayerKey[layerKey] ?? null;
      const mode = decision?.mode ?? 'volume';
      const scaleLevel = decision?.scaleLevel ?? 0;
      return `${layerKey}:${scaleLevel}:${mode}`;
    })
    .join('|');
}
