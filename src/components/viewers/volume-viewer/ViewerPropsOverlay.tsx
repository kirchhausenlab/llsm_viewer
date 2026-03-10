import { useEffect, useMemo, useRef, useState } from 'react';

import type { ViewerPropsConfig } from '../VolumeViewer.types';
import {
  isViewerPropVisibleAtTimepoint,
  resolveViewerPropDisplayText,
  resolveViewerPropTypefaceStack,
} from '../viewer-shell/viewerPropDefaults';

type ViewerPropsOverlayProps = {
  surfaceNode: HTMLDivElement | null;
  viewerPropsConfig?: ViewerPropsConfig;
};

type SurfaceSize = {
  width: number;
  height: number;
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const EMPTY_SURFACE_SIZE: SurfaceSize = { width: 0, height: 0 };

export function ViewerPropsOverlay({
  surfaceNode,
  viewerPropsConfig,
}: ViewerPropsOverlayProps) {
  const [surfaceSize, setSurfaceSize] = useState<SurfaceSize>(EMPTY_SURFACE_SIZE);
  const dragStateRef = useRef<{
    propId: string;
    pointerId: number;
    originX: number;
    originY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const editingEnabled = viewerPropsConfig?.isEditing ?? false;
  const renderedProps = useMemo(
    () => {
      const currentTimepoint = viewerPropsConfig?.currentTimepoint ?? 1;
      const totalTimepoints = viewerPropsConfig?.totalTimepoints ?? 1;

      return (viewerPropsConfig?.props ?? []).filter((prop) => {
        if (prop.dimension !== '2d' || prop.type === 'scalebar') {
          return false;
        }

        const contentVisible =
          prop.visible && isViewerPropVisibleAtTimepoint(prop, currentTimepoint, totalTimepoints);
        return editingEnabled || contentVisible;
      });
    },
    [
      editingEnabled,
      viewerPropsConfig?.currentTimepoint,
      viewerPropsConfig?.props,
      viewerPropsConfig?.totalTimepoints,
    ]
  );

  useEffect(() => {
    if (!surfaceNode) {
      setSurfaceSize(EMPTY_SURFACE_SIZE);
      return undefined;
    }

    const updateSurfaceSize = () => {
      const rect = surfaceNode.getBoundingClientRect();
      setSurfaceSize({
        width: Math.max(0, rect.width),
        height: Math.max(0, rect.height),
      });
    };

    updateSurfaceSize();

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(updateSurfaceSize);
      observer.observe(surfaceNode);
      return () => observer.disconnect();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateSurfaceSize);
      return () => window.removeEventListener('resize', updateSurfaceSize);
    }

    return undefined;
  }, [surfaceNode]);

  if (renderedProps.length === 0) {
    return null;
  }

  return (
    <div
      className={
        editingEnabled
          ? 'viewer-props-overlay viewer-props-overlay--editing'
          : 'viewer-props-overlay'
      }
      aria-hidden={!editingEnabled}
    >
      {renderedProps.map((prop) => {
        const contentVisible =
          prop.visible &&
          isViewerPropVisibleAtTimepoint(
            prop,
            viewerPropsConfig?.currentTimepoint ?? 1,
            viewerPropsConfig?.totalTimepoints ?? 1
          );
        const isSelected = prop.id === viewerPropsConfig?.selectedPropId;
        const outlineColor = isSelected
          ? 'rgba(247, 222, 111, 0.96)'
          : 'rgba(91, 140, 255, 0.96)';
        const fontSize = clampNumber(prop.screen.fontSize, 10, 160);
        const paddingY = Math.max(6, fontSize * 0.24);
        const paddingX = Math.max(10, fontSize * 0.34);
        const transform = [
          'translate(-50%, -50%)',
          `rotate(${prop.screen.rotation}deg)`,
          `scale(${prop.screen.flipX ? -1 : 1}, ${prop.screen.flipY ? -1 : 1})`,
        ].join(' ');
        const displayText = resolveViewerPropDisplayText(
          prop,
          viewerPropsConfig?.currentTimepoint ?? 1,
          viewerPropsConfig?.totalTimepoints ?? 1,
          viewerPropsConfig?.temporalResolution ?? null
        );

        return (
          <div
            key={prop.id}
            className={
              editingEnabled
                ? isSelected
                  ? contentVisible
                    ? 'viewer-prop viewer-prop--selected'
                    : 'viewer-prop viewer-prop--selected viewer-prop--content-hidden'
                  : contentVisible
                    ? 'viewer-prop'
                    : 'viewer-prop viewer-prop--content-hidden'
                : 'viewer-prop viewer-prop--display-only'
            }
            role={editingEnabled ? 'button' : undefined}
            tabIndex={editingEnabled ? 0 : -1}
            style={{
              left: `${prop.screen.x * 100}%`,
              top: `${prop.screen.y * 100}%`,
              color: prop.color,
              fontSize: `${fontSize}px`,
              fontFamily: resolveViewerPropTypefaceStack(prop.typeface),
              fontWeight: prop.bold ? 900 : 400,
              fontStyle: prop.italic ? 'italic' : 'normal',
              textDecorationLine: prop.underline ? 'underline' : 'none',
              textUnderlineOffset: prop.underline ? '0.14em' : undefined,
              maxWidth: `${Math.max(120, surfaceSize.width * 0.82)}px`,
              padding: `${paddingY}px ${paddingX}px`,
              transform,
              borderColor: editingEnabled ? outlineColor : 'transparent',
              pointerEvents: editingEnabled ? 'auto' : 'none',
            }}
            onPointerDown={(event) => {
              if (!editingEnabled || !viewerPropsConfig || surfaceSize.width <= 0 || surfaceSize.height <= 0) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              viewerPropsConfig.onSelectProp(prop.id);
              dragStateRef.current = {
                propId: prop.id,
                pointerId: event.pointerId,
                originX: event.clientX,
                originY: event.clientY,
                startX: prop.screen.x,
                startY: prop.screen.y,
              };
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                // Ignore unsupported pointer capture environments.
              }
            }}
            onPointerMove={(event) => {
              const dragState = dragStateRef.current;
              if (
                !editingEnabled ||
                !viewerPropsConfig ||
                !dragState ||
                dragState.propId !== prop.id ||
                dragState.pointerId !== event.pointerId ||
                surfaceSize.width <= 0 ||
                surfaceSize.height <= 0
              ) {
                return;
              }
              event.preventDefault();
              event.stopPropagation();
              const nextX = dragState.startX + (event.clientX - dragState.originX) / surfaceSize.width;
              const nextY = dragState.startY + (event.clientY - dragState.originY) / surfaceSize.height;
              viewerPropsConfig.onUpdateScreenPosition(prop.id, {
                x: clampNumber(nextX, 0, 1),
                y: clampNumber(nextY, 0, 1),
              });
            }}
            onPointerUp={(event) => {
              if (
                dragStateRef.current?.propId === prop.id &&
                dragStateRef.current.pointerId === event.pointerId
              ) {
                try {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                } catch {
                  // Ignore unsupported pointer capture environments.
                }
                dragStateRef.current = null;
              }
            }}
            onPointerCancel={() => {
              dragStateRef.current = null;
            }}
          >
            <div
              className="viewer-prop-content"
              style={{ opacity: contentVisible ? 1 : 0 }}
              aria-hidden={!contentVisible}
            >
              {displayText}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ViewerPropsOverlay;
