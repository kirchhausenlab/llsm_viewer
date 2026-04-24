export type GpuBrickResidencyPackPageTableSnapshot = {
  gridShape: [number, number, number];
  chunkShape: [number, number, number];
  volumeShape: [number, number, number];
  occupiedBrickCount: number;
  scaleLevel: number;
  brickAtlasIndices: ArrayBuffer;
};

export type GpuBrickResidencyPackRequestMessage = {
  type: 'build-full-resident-atlas';
  id: number;
  textureComponents: number;
  max3DTextureSize: number | null;
  pageTable: GpuBrickResidencyPackPageTableSnapshot;
  sourceData: ArrayBuffer;
};

export type GpuBrickResidencyPackSuccessMessage = {
  type: 'built';
  id: number;
  atlasData: ArrayBuffer;
  atlasIndices: ArrayBuffer;
  atlasWidth: number;
  atlasHeight: number;
  atlasDepth: number;
  slotGrid: { x: number; y: number; z: number };
  residentBytes: number;
};

export type GpuBrickResidencyPackErrorMessage = {
  type: 'error';
  id: number;
  message: string;
};

export type GpuBrickResidencyPackInboundMessage = GpuBrickResidencyPackRequestMessage;

export type GpuBrickResidencyPackOutboundMessage =
  | GpuBrickResidencyPackSuccessMessage
  | GpuBrickResidencyPackErrorMessage;
