export type MultiscaleGeometryLevel = {
  level: number;
  width: number;
  height: number;
  depth: number;
  downsampleFactor: [number, number, number];
};

export function computeMultiscaleGeometryLevels({
  width,
  height,
  depth
}: {
  width: number;
  height: number;
  depth: number;
}): MultiscaleGeometryLevel[] {
  const levels: MultiscaleGeometryLevel[] = [];

  let currentWidth = Math.max(1, Math.floor(width));
  let currentHeight = Math.max(1, Math.floor(height));
  let currentDepth = Math.max(1, Math.floor(depth));
  let downsampleFactor: [number, number, number] = [1, 1, 1];
  let level = 0;

  while (true) {
    levels.push({
      level,
      width: currentWidth,
      height: currentHeight,
      depth: currentDepth,
      downsampleFactor
    });

    if (currentDepth <= 1 && currentHeight <= 1 && currentWidth <= 1) {
      break;
    }

    const nextDepth = Math.max(1, Math.ceil(currentDepth / 2));
    const nextHeight = Math.max(1, Math.ceil(currentHeight / 2));
    const nextWidth = Math.max(1, Math.ceil(currentWidth / 2));
    if (nextDepth === currentDepth && nextHeight === currentHeight && nextWidth === currentWidth) {
      break;
    }

    downsampleFactor = [
      downsampleFactor[0] * (nextDepth < currentDepth ? 2 : 1),
      downsampleFactor[1] * (nextHeight < currentHeight ? 2 : 1),
      downsampleFactor[2] * (nextWidth < currentWidth ? 2 : 1)
    ];
    currentDepth = nextDepth;
    currentHeight = nextHeight;
    currentWidth = nextWidth;
    level += 1;
  }

  return levels;
}
