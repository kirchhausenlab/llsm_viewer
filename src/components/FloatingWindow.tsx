import { CSSProperties, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';

const WINDOW_MARGIN = 16;

type FloatingWindowProps = {
  title: string;
  initialPosition?: { x: number; y: number };
  width?: number | string;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

const combineClassNames = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(' ');

function FloatingWindow({
  title,
  initialPosition,
  width,
  headerActions,
  children,
  className,
  bodyClassName
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
  const lastInitialPositionRef = useRef(resolvedInitialPosition);

  const clampPosition = useCallback(
    (x: number, y: number) => {
      if (typeof window === 'undefined') {
        return { x, y };
      }

      const container = containerRef.current;
      const header = headerRef.current;
      if (!container) {
        return { x, y };
      }

      const rect = container.getBoundingClientRect();
      const headerHeight = header?.getBoundingClientRect().height ?? rect.height;
      const width = rect.width;
      const height = isMinimized ? headerHeight : rect.height;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const minX = Math.min(WINDOW_MARGIN, Math.max(0, viewportWidth - width));
      const minY = Math.min(WINDOW_MARGIN, Math.max(0, viewportHeight - height));
      const maxX = Math.max(minX, viewportWidth - width - WINDOW_MARGIN);
      const maxY = Math.max(minY, viewportHeight - height - WINDOW_MARGIN);

      const clampedX = Math.min(Math.max(minX, x), maxX);
      const clampedY = Math.min(Math.max(minY, y), maxY);
      return { x: clampedX, y: clampedY };
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
    const handleResize = () => {
      setPosition((current) => clampPosition(current.x, current.y));
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
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
      const header = headerRef.current;
      if (!container || !header) {
        return;
      }

      const rect = container.getBoundingClientRect();
      dragOffsetRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      pointerIdRef.current = event.pointerId;
      header.setPointerCapture(event.pointerId);
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
      if (pointerIdRef.current !== null) {
        headerRef.current?.releasePointerCapture(pointerIdRef.current);
        pointerIdRef.current = null;
      }
      setIsDragging(false);
      setPosition((current) => clampPosition(current.x, current.y));
      event.preventDefault();
    },
    [clampPosition, isDragging]
  );

  const toggleMinimize = useCallback(() => {
    setIsMinimized((value) => !value);
  }, []);

  const handleHeaderDoubleClick = useCallback(() => {
    toggleMinimize();
  }, [toggleMinimize]);

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
    className
  );
  const bodyClassNameResolved = combineClassNames('floating-window-body', bodyClassName);

  return (
    <div
      ref={containerRef}
      className={containerClassName}
      style={style}
      aria-expanded={!isMinimized}
      role="region"
    >
      <div
        ref={headerRef}
        className="floating-window-header"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onDoubleClick={handleHeaderDoubleClick}
      >
        <h2 className="floating-window-title">{title}</h2>
        <div className="floating-window-header-actions" data-no-drag>
          {headerActions ? <div className="floating-window-extra-actions">{headerActions}</div> : null}
          <button
            type="button"
            className="floating-window-toggle"
            onClick={toggleMinimize}
            aria-label={isMinimized ? `Restore ${title}` : `Minimize ${title}`}
            data-no-drag
          >
            <span aria-hidden="true">{isMinimized ? '▢' : '–'}</span>
          </button>
        </div>
      </div>
      <div className={bodyClassNameResolved}>{children}</div>
    </div>
  );
}

export default FloatingWindow;
