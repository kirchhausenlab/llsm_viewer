import { globalCoordForLocalOffset } from './brickCoordinates';
import type {
  DecodedSparseSegmentationBrick,
  SparseSegmentationBrickDirectoryRecord,
  SparseSegmentationField,
  SparseSegmentationSlice
} from './types';

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const hueSector = hue / 60;
  const intermediate = chroma * (1 - Math.abs((hueSector % 2) - 1));
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (hueSector >= 0 && hueSector < 1) {
    r1 = chroma;
    g1 = intermediate;
  } else if (hueSector >= 1 && hueSector < 2) {
    r1 = intermediate;
    g1 = chroma;
  } else if (hueSector >= 2 && hueSector < 3) {
    g1 = chroma;
    b1 = intermediate;
  } else if (hueSector >= 3 && hueSector < 4) {
    g1 = intermediate;
    b1 = chroma;
  } else if (hueSector >= 4 && hueSector < 5) {
    r1 = intermediate;
    b1 = chroma;
  } else {
    r1 = chroma;
    b1 = intermediate;
  }
  const match = v - chroma;
  const toByte = (value: number) => Math.round(Math.max(0, Math.min(1, value + match)) * 255);
  return [toByte(r1), toByte(g1), toByte(b1)];
}

export function hashSparseSegmentationLabelColor(label: number, seed: number): [number, number, number, number] {
  if (label === 0) {
    return [0, 0, 0, 0];
  }
  const scalar =
    (label & 0xff) * 1 +
    ((label >>> 8) & 0xff) * 257 +
    ((label >>> 16) & 0xff) * 65537 +
    Math.floor(label / 0x1000000) * 16777619 +
    (seed & 0xff) * 3 +
    ((seed >>> 8) & 0xff) * 769 +
    ((seed >>> 16) & 0xff) * 196613 +
    Math.floor(seed / 0x1000000) * 1000003;
  const hash = Math.sin(scalar) * 43758.5453123;
  const hue = (hash - Math.floor(hash)) * 360;
  const [r, g, b] = hsvToRgb(hue, 0.78, 1);
  return [r, g, b, 255];
}

export async function extractSparseSegmentationSliceFromField({
  field,
  axis,
  index,
  loadBrick
}: {
  field: SparseSegmentationField;
  axis: 'x' | 'y' | 'z';
  index: number;
  loadBrick(record: SparseSegmentationBrickDirectoryRecord): Promise<DecodedSparseSegmentationBrick>;
}): Promise<SparseSegmentationSlice> {
  if (
    (axis === 'z' && (index < 0 || index >= field.depth)) ||
    (axis === 'y' && (index < 0 || index >= field.height)) ||
    (axis === 'x' && (index < 0 || index >= field.width))
  ) {
    throw new Error(`Sparse segmentation slice index ${index} is out of bounds for ${axis}.`);
  }
  const width = axis === 'x' ? field.depth : field.width;
  const height = axis === 'z' ? field.height : axis === 'y' ? field.depth : field.height;
  const rgba = new Uint8Array(width * height * 4);
  const records = field.directory.recordsIntersectingSlice(field.timepoint, axis, index);
  for (const record of records) {
    const brick = await loadBrick(record);
    brick.forEachNonzero((offset, label) => {
      const global = globalCoordForLocalOffset(record.brickCoord, offset, field.brickSize);
      if (global.z >= field.depth || global.y >= field.height || global.x >= field.width) {
        return;
      }
      if (
        (axis === 'z' && global.z !== index) ||
        (axis === 'y' && global.y !== index) ||
        (axis === 'x' && global.x !== index)
      ) {
        return;
      }
      const outputX = axis === 'x' ? global.z : global.x;
      const outputY = axis === 'z' ? global.y : axis === 'y' ? global.z : global.y;
      const target = (outputY * width + outputX) * 4;
      const color = hashSparseSegmentationLabelColor(label, field.colorSeed);
      rgba[target] = color[0];
      rgba[target + 1] = color[1];
      rgba[target + 2] = color[2];
      rgba[target + 3] = color[3];
    });
  }
  return {
    kind: 'sparse-segmentation-slice',
    axis,
    index,
    width,
    height,
    rgba
  };
}
