import type { NormalizedVolume } from '../core/volumeProcessing';
import type { VolumeBrickAtlas } from '../core/volumeProvider';

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
  timepointLabels: Map<number, Uint32Array>;
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
  timepointLabels: Map<number, Uint32Array>;
};

export type EditableSegmentationRenderPayload = {
  volume: NormalizedVolume | null;
  brickAtlas: VolumeBrickAtlas | null;
};
