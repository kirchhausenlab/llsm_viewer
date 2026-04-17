import { CSSProperties, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const WINDOW_MARGIN = 16;

const getReservedTopBoundary = (): number => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 0;
  }

  const rawValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue('--viewer-top-menu-bottom')
    .trim();
  const parsedValue = Number.parseFloat(rawValue);
  return Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : 0;
};

type FloatingWindowProps = {
  title: string;
  initialPosition?: { x: number; y: number };
  width?: number | string;
  headerActions?: ReactNode;
  headerEndActions?: ReactNode;
  headerContent?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  resetSignal?: number;
  headerPosition?: 'top' | 'bottom';
  onClose?: () => void;
};

const combineClassNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ');

function FloatingWindow({
  title,
  initialPosition,
  width,
  headerActions,
  headerEndActions,
  headerContent,
  children,
  className,
  bodyClassName,
  resetSignal,
  headerPosition = 'top',
  onClose
}: FloatingWindowProps) {
  const resolvedInitialPosition = useMemo(
    () => initialPosition ?? { x: WINDOW_MARGIN, y: WINDOW_MARGIN },
    [initialPosition]
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);
  const [position, setPosition] = useState(() => resolvedInitialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const lastExpandedHeightRef = useRef<number | null>(null);
  const lastInitialPositionRef = useRef(resolvedInitialPosition);
  const lastResetSignalRef = useRef(resetSignal);

  const clampPosition = useCallback(
    (
      x: number,
      y: number,
      options?: { anchorOffset?: { x: number; y: number }; width?: number; height?: number }
    ) => {
      if (typeof window === 'undefined') {
        return { x, y };
      }

      const container = containerRef.current;
      const header = headerRef.current;
      if (!container) {
        return { x, y };
      }

      const rect = container.getBoundingClientRect();
      const measuredHeaderHeight = header?.getBoundingClientRect().height ?? 0;
      const windowWidth = Math.max(0, window.innerWidth);
      const windowHeight = Math.max(0, window.innerHeight);
      const measuredWidth = options?.width ?? rect.width;
      const measuredHeight = options?.height ?? (isMinimized && measuredHeaderHeight > 0 ? measuredHeaderHeight : rect.height);
      const reservedTop = getReservedTopBoundary();
      const minY = Math.max(WINDOW_MARGIN, reservedTop);
      const minX = WINDOW_MARGIN;
      const maxX = Math.max(minX, windowWidth - measuredWidth - WINDOW_MARGIN);
      const maxY = Math.max(minY, windowHeight - measuredHeight - WINDOW_MARGIN);

      if (options?.anchorOffset) {
        const anchorX = x + options.anchorOffset.x;
        const anchorY = y + options.anchorOffset.y;
        const clampedAnchorX = Math.min(Math.max(minX + options.anchorOffset.x, anchorX), maxX + options.anchorOffset.x);
        const clampedAnchorY = Math.min(Math.max(minY + options.anchorOffset.y, anchorY), maxY + options.anchorOffset.y);

        return {
          x: clampedAnchorX - options.anchorOffset.x,
          y: clampedAnchorY - options.anchorOffset.y
        };
      }

      return {
        x: Math.min(Math.max(minX, x), maxX),
        y: Math.min(Math.max(minY, y), maxY)
      };
    },
    [isMinimized]
  );

  useEffect(() => {
    const previous = lastInitialPositionRef.current;
    const hasChanged =
      previous.x !== resolvedInitialPosition.x || previous.y !== resolvedInitialPosition.y;
    lastInitialPositionRef.current = resolvedInitialPosition;
    if (!hasChanged) {
      return;
    }
    setPosition((current) => {
      const next = clampPosition(resolvedInitialPosition.x, resolvedInitialPosition.y);
      if (current.x === next.x && current.y === next.y) {
        return current;
      }
      return next;
    });
  }, [resolvedInitialPosition, clampPosition]);

  useEffect(() => {
    if (resetSignal === undefined) {
      lastResetSignalRef.current = resetSignal;
      return;
    }
    if (lastResetSignalRef.current === resetSignal) {
      return;
    }
    lastResetSignalRef.current = resetSignal;
    setIsMinimized(false);
    setPosition(clampPosition(resolvedInitialPosition.x, resolvedInitialPosition.y));
  }, [resetSignal, clampPosition, resolvedInitialPosition]);

  useEffect(() => {
    const handleViewportBoundsChange = () => {
      setPosition((current) => clampPosition(current.x, current.y));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleViewportBoundsChange);
      window.addEventListener('viewer-top-menu-boundary-change', handleViewportBoundsChange);
      return () => {
        window.removeEventListener('resize', handleViewportBoundsChange);
        window.removeEventListener('viewer-top-menu-boundary-change', handleViewportBoundsChange);
      };
    }
    return undefined;
  }, [clampPosition]);

  useEffect(() => {
    setPosition((current) => clampPosition(current.x, current.y));
  }, [isMinimized, clampPosition]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target as Element | null;
      if (target && target.closest('[data-no-drag]')) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      pointerIdRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsDragging(true);
      event.preventDefault();
    },
    []
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) {
        return;
      }
      event.preventDefault();
      const offset = dragOffsetRef.current;
      const nextX = event.clientX - offset.x;
      const nextY = event.clientY - offset.y;
      setPosition(clampPosition(nextX, nextY));
    },
    [clampPosition, isDragging]
  );

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging) {
        return;
      }
      if (pointerIdRef.current !== null && event.currentTarget.hasPointerCapture(pointerIdRef.current)) {
        event.currentTarget.releasePointerCapture(pointerIdRef.current);
        pointerIdRef.current = null;
      }
      setIsDragging(false);
      setPosition((current) => clampPosition(current.x, current.y));
      event.preventDefault();
    },
    [clampPosition, isDragging]
  );

  const stopHeaderActionPointerPropagation = useCallback((event: React.PointerEvent<HTMLElement>) => {
    event.stopPropagation();
  }, []);

  const toggleMinimize = useCallback(() => {
    const container = containerRef.current;
    const header = headerRef.current;

    if (!container || !header || headerPosition !== 'bottom') {
      setIsMinimized((value) => !value);
      return;
    }

    const rect = container.getBoundingClientRect();
    const headerHeight = header.getBoundingClientRect().height;
    const anchorY = rect.top + rect.height;

    setIsMinimized((current) => {
      if (!current) {
        const minimizedHeight = headerHeight;
        lastExpandedHeightRef.current = rect.height;
        setPosition((pos) =>
          clampPosition(pos.x, anchorY - minimizedHeight, {
            anchorOffset: { x: 0, y: minimizedHeight },
            height: minimizedHeight
          })
        );
        return true;
      }

      const expandedHeight = lastExpandedHeightRef.current ?? rect.height;
      setPosition((pos) =>
        clampPosition(pos.x, anchorY - expandedHeight, {
          anchorOffset: { x: 0, y: expandedHeight },
          height: expandedHeight
        })
      );
      return false;
    });
  }, [clampPosition, headerPosition]);

  const resolvedWidth = useMemo(() => {
    if (typeof width === 'number') {
      return `${width}px`;
    }
    return width ?? 'min(360px, calc(100vw - 3rem))';
  }, [width]);

  const style: CSSProperties = {
    transform: `translate3d(${Math.round(position.x)}px, ${Math.round(position.y)}px, 0)`
  };

  if (resolvedWidth) {
    style.width = resolvedWidth;
  }

  const containerClassName = combineClassNames(
    'floating-window',
    isDragging && 'is-dragging',
    isMinimized && 'is-minimized',
    headerPosition === 'bottom' && 'floating-window--header-bottom',
    className
  );
  const bodyClassNameResolved = combineClassNames('floating-window-body', bodyClassName);

  const header = (
    <div
      ref={headerRef}
      className="floating-window-header"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <div className="floating-window-header-main">
        <h2 className="floating-window-title">{title}</h2>
      </div>
      <div
        className="floating-window-header-actions"
        data-no-drag
        onPointerDownCapture={stopHeaderActionPointerPropagation}
      >
        {headerActions ? (
          <div
            className="floating-window-extra-actions"
            onPointerDownCapture={stopHeaderActionPointerPropagation}
          >
            {headerActions}
          </div>
        ) : null}
        <button
          type="button"
          className="floating-window-toggle"
          onClick={toggleMinimize}
          onPointerDown={stopHeaderActionPointerPropagation}
          aria-label={isMinimized ? `Maximize ${title} window` : `Minimize ${title} window`}
          data-no-drag
        >
          <span aria-hidden="true">{isMinimized ? '▢' : '–'}</span>
        </button>
        {headerEndActions ? (
          <div
            className="floating-window-extra-actions"
            onPointerDownCapture={stopHeaderActionPointerPropagation}
          >
            {headerEndActions}
          </div>
        ) : null}
        {onClose ? (
          <button
            type="button"
            className="floating-window-toggle"
            onClick={onClose}
            onPointerDown={stopHeaderActionPointerPropagation}
            aria-label={`Close ${title} window`}
            data-no-drag
            title="Close"
          >
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
      {headerContent ? (
        <div className="floating-window-header-content" data-no-drag>
          {headerContent}
        </div>
      ) : null}
    </div>
  );

  const body = <div className={bodyClassNameResolved}>{children}</div>;

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      style={style}
      aria-expanded={!isMinimized}
      role="region"
    >
      {headerPosition === 'bottom' ? (
        <>
          {body}
          {header}
        </>
      ) : (
        <>
          {header}
          {body}
        </>
      )}
    </div>
  );
}

export default FloatingWindow;
