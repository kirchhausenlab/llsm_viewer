type ToolIconProps = {
  className?: string;
};

const DEFAULT_CLASS_NAME = 'viewer-tool-icon';

export function HandToolIcon({ className = DEFAULT_CLASS_NAME }: ToolIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18 11V6a2 2 0 0 0-4 0v5" />
      <path d="M14 10V5a2 2 0 0 0-4 0v7" />
      <path d="M10 12V7a2 2 0 0 0-4 0v7" />
      <path d="M6 14v-2a2 2 0 0 0-4 0v3c0 4.4 3.6 8 8 8h2c4.4 0 8-3.6 8-8v-4a2 2 0 0 0-2-2Z" />
    </svg>
  );
}

export function LineToolIcon({ className = DEFAULT_CLASS_NAME }: ToolIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path d="M5 18 19 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function RectangleToolIcon({ className = DEFAULT_CLASS_NAME }: ToolIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" rx="1" />
    </svg>
  );
}

export function EllipseToolIcon({ className = DEFAULT_CLASS_NAME }: ToolIconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <ellipse cx="12" cy="12" rx="7" ry="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function BrushToolIcon({ className = DEFAULT_CLASS_NAME }: ToolIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 17c0 2-1.5 3.5-4 4 0-2.5 1.5-4 3.5-4h.5Z" />
      <path d="M7 17 19 5a2.1 2.1 0 0 1 3 3L10 20c-.8.8-2.1.8-3 0s-.8-2.1 0-3Z" />
    </svg>
  );
}

export function EraserToolIcon({ className = DEFAULT_CLASS_NAME }: ToolIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m4 15 8-8a2.8 2.8 0 0 1 4 0l4 4a2.8 2.8 0 0 1 0 4l-5 5H8l-4-4Z" />
      <path d="m9 10 7 7" />
      <path d="M14 20h7" />
    </svg>
  );
}

export function UndoToolIcon({ className = DEFAULT_CLASS_NAME }: ToolIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 1 1-5.2 9" />
    </svg>
  );
}

export function RedoToolIcon({ className = DEFAULT_CLASS_NAME }: ToolIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 1 0 5.2 9" />
    </svg>
  );
}

export function GearToolIcon({ className = DEFAULT_CLASS_NAME }: ToolIconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 1 1-4 0V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2.8a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </svg>
  );
}
