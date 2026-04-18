export function toUserFacingVoxelIndex(value: number): number {
  return Math.round(value) + 1;
}

export function fromUserFacingVoxelIndex(value: number): number {
  return Math.round(value) - 1;
}

export function getUserFacingVoxelIndexDigits(extent: number): number {
  return Math.max(1, String(Math.max(1, Math.floor(extent))).length);
}
