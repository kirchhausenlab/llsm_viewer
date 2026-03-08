import { useEffect, useMemo, useRef, useState } from 'react';

import type { ViewerPropsConfig } from '../VolumeViewer.types';

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
  const visibleProps = useMemo(
    () =>
      (viewerPropsConfig?.props ?? []).filter(
        (prop) => prop.dimension === '2d' && prop.visible
      ),
    [viewerPropsConfig?.props]
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

  if (visibleProps.length === 0) {
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
      {visibleProps.map((prop) => {
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

        return (
          <div
            key={prop.id}
            className={
              editingEnabled
                ? isSelected
                  ? 'viewer-prop viewer-prop--selected'
                  : 'viewer-prop'
                : 'viewer-prop viewer-prop--display-only'
            }
            role={editingEnabled ? 'button' : undefined}
            tabIndex={editingEnabled ? 0 : -1}
            style={{
              left: `${prop.screen.x * 100}%`,
              top: `${prop.screen.y * 100}%`,
              color: prop.color,
              fontSize: `${fontSize}px`,
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
            <div className="viewer-prop-content">{prop.text}</div>
          </div>
        );
      })}
    </div>
  );
}

export default ViewerPropsOverlay;
