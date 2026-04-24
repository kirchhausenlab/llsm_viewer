const MIN_DIRECT_VOLUME_TEXTURE_BYTES = 8 * 1024 * 1024;
const DIRECT_ATLAS_TO_VOLUME_BYTE_RATIO_THRESHOLD = 0.6;
const DIRECT_OCCUPIED_BRICK_RATIO_THRESHOLD = 0.5;

function normalizePositiveInteger(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.max(1, Math.floor(value));
}

export function shouldPreferDirectVolumeSampling(args: {
  scaleLevel: number;
  volumeWidth: number;
  volumeHeight: number;
  volumeDepth: number;
  textureChannels: number;
  gridShape: [number, number, number];
  chunkShape: [number, number, number];
  occupiedBrickCount: number;
  maxDirectVolumeBytes?: number | null;
  max3DTextureSize?: number | null;
}): boolean {
  const volumeWidth = normalizePositiveInteger(args.volumeWidth);
  const volumeHeight = normalizePositiveInteger(args.volumeHeight);
  const volumeDepth = normalizePositiveInteger(args.volumeDepth);
  const textureChannels = normalizePositiveInteger(args.textureChannels);
  const gridZ = normalizePositiveInteger(args.gridShape[0]);
  const gridY = normalizePositiveInteger(args.gridShape[1]);
  const gridX = normalizePositiveInteger(args.gridShape[2]);
  const chunkDepth = normalizePositiveInteger(args.chunkShape[0]);
  const chunkHeight = normalizePositiveInteger(args.chunkShape[1]);
  const chunkWidth = normalizePositiveInteger(args.chunkShape[2]);
  const occupiedBrickCount = normalizePositiveInteger(args.occupiedBrickCount);

  if (
    volumeWidth === null ||
    volumeHeight === null ||
    volumeDepth === null ||
    textureChannels === null ||
    gridZ === null ||
    gridY === null ||
    gridX === null ||
    chunkDepth === null ||
    chunkHeight === null ||
    chunkWidth === null ||
    occupiedBrickCount === null
  ) {
    return false;
  }

  if (
    Number.isFinite(args.max3DTextureSize) &&
    (args.max3DTextureSize as number) > 0 &&
    (volumeWidth > (args.max3DTextureSize as number) ||
      volumeHeight > (args.max3DTextureSize as number) ||
      volumeDepth > (args.max3DTextureSize as number))
  ) {
    return false;
  }

  const estimatedVolumeBytes = volumeWidth * volumeHeight * volumeDepth * textureChannels;
  if (
    Number.isFinite(args.maxDirectVolumeBytes) &&
    (args.maxDirectVolumeBytes as number) > 0 &&
    estimatedVolumeBytes > (args.maxDirectVolumeBytes as number)
  ) {
    return false;
  }

  const totalBricks = gridZ * gridY * gridX;
  if (totalBricks <= 1 || occupiedBrickCount > totalBricks) {
    return false;
  }

  const estimatedAtlasBytes = chunkDepth * chunkHeight * chunkWidth * occupiedBrickCount * textureChannels;
  if (estimatedAtlasBytes <= 0) {
    return false;
  }

  const occupiedBrickRatio = occupiedBrickCount / totalBricks;
  const atlasToVolumeByteRatio = estimatedAtlasBytes / estimatedVolumeBytes;
  const atlasIsNotSmallerThanVolume = estimatedAtlasBytes >= estimatedVolumeBytes;

  if (
    occupiedBrickRatio >= DIRECT_OCCUPIED_BRICK_RATIO_THRESHOLD &&
    atlasIsNotSmallerThanVolume
  ) {
    return true;
  }

  if (estimatedVolumeBytes < MIN_DIRECT_VOLUME_TEXTURE_BYTES) {
    return false;
  }

  return (
    occupiedBrickRatio >= DIRECT_OCCUPIED_BRICK_RATIO_THRESHOLD &&
    atlasToVolumeByteRatio >= DIRECT_ATLAS_TO_VOLUME_BYTE_RATIO_THRESHOLD
  );
}
