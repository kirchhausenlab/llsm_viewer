import assert from 'node:assert/strict';
import { Vector3 } from 'three';

type ClipmapLevel = {
  origin: Vector3;
  scale: number;
  sample: (local: Vector3) => [number, number, number, number];
};

type ClipmapConfig = {
  clipmapSize: number;
  levels: ClipmapLevel[];
  levelCount: number;
  minLevel: number;
};

const isWithinClipmapBounds = (local: Vector3) =>
  local.x >= 0 && local.y >= 0 && local.z >= 0 && local.x < 1 && local.y < 1 && local.z < 1;

function sampleClipmap(voxelPos: Vector3, config: ClipmapConfig) {
  let sampled: [number, number, number, number] = [0, 0, 0, 0];
  let levelScale = 1;
  let chosenLevel = -1;

  for (let level = 0; level < Math.min(config.levels.length, config.levelCount); level += 1) {
    if (level < config.minLevel) {
      continue;
    }
    const { scale, origin, sample } = config.levels[level];
    const extent = config.clipmapSize * scale;
    const local = voxelPos.clone().sub(origin).divideScalar(extent);
    if (isWithinClipmapBounds(local)) {
      sampled = sample(local);
      levelScale = scale;
      chosenLevel = level;
      break;
    }
  }

  if (chosenLevel === -1) {
    const fallback = Math.min(Math.max(config.levelCount - 1, 0), config.levels.length - 1);
    const { scale, origin, sample } = config.levels[fallback];
    const extent = config.clipmapSize * scale;
    const local = voxelPos.clone().sub(origin).divideScalar(extent);
    if (isWithinClipmapBounds(local)) {
      sampled = sample(local);
      levelScale = scale;
      chosenLevel = fallback;
    }
  }

  return { sampled, levelScale, chosenLevel };
}

const redSample: [number, number, number, number] = [1, 0, 0, 1];
const blueSample: [number, number, number, number] = [0, 0, 1, 1];

const clipmapConfig: ClipmapConfig = {
  clipmapSize: 4,
  levels: [
    { origin: new Vector3(), scale: 1, sample: () => redSample },
    { origin: new Vector3(), scale: 2, sample: () => blueSample },
  ],
  levelCount: 2,
  minLevel: 0,
};

{
  const insideFineLevel = sampleClipmap(new Vector3(1, 1, 1), clipmapConfig);
  assert.deepEqual(insideFineLevel.sampled, redSample);
  assert.equal(insideFineLevel.levelScale, 1);
  assert.equal(insideFineLevel.chosenLevel, 0);
}

{
  const onlyCoarseLevelAvailable = sampleClipmap(new Vector3(6, 6, 6), clipmapConfig);
  assert.deepEqual(onlyCoarseLevelAvailable.sampled, blueSample);
  assert.equal(onlyCoarseLevelAvailable.levelScale, 2);
  assert.equal(onlyCoarseLevelAvailable.chosenLevel, 1);
}

{
  const outsideAllClipmaps = sampleClipmap(new Vector3(20, 20, 20), clipmapConfig);
  assert.deepEqual(outsideAllClipmaps.sampled, [0, 0, 0, 0]);
  assert.equal(outsideAllClipmaps.levelScale, 1);
  assert.equal(outsideAllClipmaps.chosenLevel, -1);
}
