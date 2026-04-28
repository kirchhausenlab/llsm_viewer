import type { NormalizedVolume } from '../core/volumeProcessing';
import type { VolumeBrickAtlas } from '../core/volumeProvider';
import type {
  SparseSegmentationBrickCoord,
  SparseSegmentationBrickSize,
} from '../shared/utils/preprocessedDataset/sparseSegmentation';

export type AnnotateBrushMode = 'brush' | 'eraser';
export type AnnotateDimensionMode = '2d' | '3d';

export type AnnotationStrokeHandlers = {
  enabled: boolean;
  onStrokeStart: () => void;
  onStrokeApply: (coords: { x: number; y: number; z: number }) => void;
  onStrokeEnd: () => void;
};

export type EditableSegmentationLabel = {
  name: string;
};

export type EditableSegmentationCreatedFrom =
  | { kind: 'empty' }
  | {
      kind: 'copy';
      sourceChannelId: string;
      sourceLayerKey: string;
      sourceWasEditable: boolean;
    };

export type EditableSegmentationBrick = {
  coord: SparseSegmentationBrickCoord;
  labels: Uint32Array;
  nonzeroCount: number;
  minLabel: number;
  maxLabel: number;
  localBounds: {
    min: { z: number; y: number; x: number };
    max: { z: number; y: number; x: number };
  } | null;
  revision: number;
  dirty: boolean;
  statsDirty: boolean;
};

export type EditableSegmentationTimepointState = {
  brickSize: SparseSegmentationBrickSize;
  bricks: Map<string, EditableSegmentationBrick>;
  revision: number;
  dirtyBrickKeys: Set<string>;
  deletedBrickKeys: Set<string>;
  renderAtlas: VolumeBrickAtlas | null;
  renderAtlasRevision: number;
};

export type EditableSegmentationChannel = {
  channelId: string;
  layerKey: string;
  name: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
  };
  volumeCount: number;
  labels: EditableSegmentationLabel[];
  activeLabelIndex: number;
  mode: AnnotateDimensionMode;
  brushMode: AnnotateBrushMode;
  radius: number;
  overlayVisible: boolean;
  enabled: boolean;
  dirty: boolean;
  revision: number;
  savedRevision: number;
  createdFrom: EditableSegmentationCreatedFrom;
  timepoints: Map<number, EditableSegmentationTimepointState>;
};

export type AnnotateSourceOption =
  | { id: 'empty'; kind: 'empty'; label: 'Empty' }
  | {
      id: string;
      kind: 'regular-segmentation';
      label: string;
      channelId: string;
      layerKey: string;
      volumeCount: number;
      dimensions: { width: number; height: number; depth: number };
      editableLabelNames?: string[] | null;
    }
  | {
      id: string;
      kind: 'editable-segmentation';
      label: string;
      channelId: string;
      layerKey: string;
    };

export type LoadedEditableSegmentationCopy = {
  labels: EditableSegmentationLabel[];
  timepoints: Map<number, EditableSegmentationTimepointState>;
};

export type EditableSegmentationRenderPayload = {
  volume: NormalizedVolume | null;
  brickAtlas: VolumeBrickAtlas | null;
};
