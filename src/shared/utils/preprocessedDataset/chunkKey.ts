export function createZarrChunkKeyFromCoords(coords: readonly number[]): string {
  if (coords.length === 0) {
    throw new Error('Chunk coordinates cannot be empty.');
  }

  const normalized = coords.map((coord, index) => {
    if (!Number.isFinite(coord) || coord < 0 || Math.floor(coord) !== coord) {
      throw new Error(`Invalid chunk coordinate at index ${index}: ${coord}`);
    }
    return coord;
  });

  return `c/${normalized.join('/')}`;
}
