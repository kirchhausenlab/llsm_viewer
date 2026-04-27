import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

const ACTION_HEIGHT_CSS_VAR = '--roi-manager-actions-height';

export function useActionColumnHeightCssVar() {
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const node = actionsRef.current;
    if (!node || typeof node.getBoundingClientRect !== 'function') {
      return undefined;
    }

    let animationFrame: number | null = null;
    const measure = () => {
      const nextHeight = Math.ceil(node.getBoundingClientRect().height);
      setHeight((current) => (nextHeight > 0 && current !== nextHeight ? nextHeight : current));
    };
    const scheduleMeasure = () => {
      if (typeof requestAnimationFrame !== 'function') {
        measure();
        return;
      }
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        measure();
      });
    };

    scheduleMeasure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleMeasure) : null;
    observer?.observe(node);
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', scheduleMeasure);
    }

    return () => {
      observer?.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', scheduleMeasure);
      }
      if (animationFrame !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, []);

  const managerStyle = useMemo<CSSProperties | undefined>(
    () => (height ? ({ [ACTION_HEIGHT_CSS_VAR]: `${height}px` } as CSSProperties) : undefined),
    [height]
  );

  return { actionsRef, managerStyle };
}
