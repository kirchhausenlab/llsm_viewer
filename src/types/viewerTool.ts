import type { AnnotateBrushMode, AnnotateDimensionMode } from './annotation';
import type { RoiDimensionMode, RoiTool } from './roi';

export type ViewerTool = 'hand' | RoiTool | AnnotateBrushMode;
export type ViewerToolDimensionMode = RoiDimensionMode & AnnotateDimensionMode;

export function isRoiViewerTool(tool: ViewerTool): tool is RoiTool {
  return tool === 'line' || tool === 'rectangle' || tool === 'ellipse';
}

export function isAnnotationViewerTool(tool: ViewerTool): tool is AnnotateBrushMode {
  return tool === 'brush' || tool === 'eraser';
}
