import {
  forwardRef,
  type ChangeEvent,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FormHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

type ClassValue = string | false | null | undefined;

export function viewerWindowClassNames(...classes: ClassValue[]): string {
  return classes.filter(Boolean).join(' ');
}

type ViewerWindowStackProps = HTMLAttributes<HTMLDivElement>;

export function ViewerWindowStack({ className, ...props }: ViewerWindowStackProps) {
  return (
    <div
      {...props}
      className={viewerWindowClassNames('global-controls', 'viewer-window-stack', className)}
    />
  );
}

type ViewerWindowFormProps = FormHTMLAttributes<HTMLFormElement>;

export function ViewerWindowForm({ className, ...props }: ViewerWindowFormProps) {
  return (
    <form
      {...props}
      className={viewerWindowClassNames('global-controls', 'viewer-window-stack', className)}
    />
  );
}

type ViewerWindowRowProps = HTMLAttributes<HTMLDivElement> & {
  align?: 'start' | 'center' | 'stretch';
  justify?: 'start' | 'center' | 'between' | 'end';
  wrap?: boolean;
};

export function ViewerWindowRow({
  align = 'start',
  justify = 'start',
  wrap = false,
  className,
  ...props
}: ViewerWindowRowProps) {
  return (
    <div
      {...props}
      className={viewerWindowClassNames(
        'control-row',
        'viewer-window-row',
        `viewer-window-row--align-${align}`,
        `viewer-window-row--justify-${justify}`,
        wrap && 'viewer-window-row--wrap',
        className,
      )}
    />
  );
}

export function ViewerWindowDivider({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={viewerWindowClassNames('viewer-window-divider', className)}
    />
  );
}

type ViewerWindowButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  expand?: boolean;
  active?: boolean;
};

export function ViewerWindowButton({
  className,
  expand = false,
  active = false,
  ...props
}: ViewerWindowButtonProps) {
  return (
    <button
      {...props}
      className={viewerWindowClassNames(
        'viewer-window-button',
        expand && 'viewer-window-button--expand',
        active && 'is-active',
        className,
      )}
    />
  );
}

type ViewerWindowIconButtonProps = ViewerWindowButtonProps;

export function ViewerWindowIconButton({ className, ...props }: ViewerWindowIconButtonProps) {
  return (
    <ViewerWindowButton
      {...props}
      className={viewerWindowClassNames('viewer-window-icon-button', className)}
    />
  );
}

type ViewerWindowFieldRowProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  children: ReactNode;
};

export function ViewerWindowFieldRow({
  label,
  children,
  className,
  ...props
}: ViewerWindowFieldRowProps) {
  return (
    <ViewerWindowRow
      {...props}
      align="center"
      className={viewerWindowClassNames('viewer-window-field-row', className)}
    >
      <span className="viewer-window-field-label">{label}</span>
      <span className="viewer-window-field-value">{children}</span>
    </ViewerWindowRow>
  );
}

type ViewerWindowValueProps = HTMLAttributes<HTMLSpanElement>;

export function ViewerWindowValue({ className, ...props }: ViewerWindowValueProps) {
  return (
    <span
      {...props}
      className={viewerWindowClassNames('viewer-window-value', className)}
    />
  );
}

type ViewerWindowSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  compact?: boolean;
  expand?: boolean;
};

export function ViewerWindowSelect({
  className,
  compact = false,
  expand = false,
  ...props
}: ViewerWindowSelectProps) {
  return (
    <select
      {...props}
      className={viewerWindowClassNames(
        'viewer-window-select',
        compact && 'viewer-window-select--compact',
        expand && 'viewer-window-select--expand',
        className,
      )}
    />
  );
}

type ViewerWindowSelectFieldProps = ViewerWindowSelectProps & {
  label: ReactNode;
  fieldClassName?: string;
  labelClassName?: string;
};

export function ViewerWindowSelectField({
  label,
  fieldClassName,
  labelClassName,
  className,
  ...props
}: ViewerWindowSelectFieldProps) {
  return (
    <label className={viewerWindowClassNames('viewer-window-select-field', fieldClassName)}>
      <span className={viewerWindowClassNames('viewer-window-select-label', labelClassName)}>
        {label}
      </span>
      <ViewerWindowSelect {...props} className={className} />
    </label>
  );
}

type ViewerWindowSliderProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode;
  valueLabel?: ReactNode;
  accentColor?: string;
  labelClassName?: string;
  inputClassName?: string;
};

function resolveSliderPercent(value: InputHTMLAttributes<HTMLInputElement>['value'], min: unknown, max: unknown) {
  const numericValue = Number(value);
  const numericMin = Number(min ?? 0);
  const numericMax = Number(max ?? 100);
  if (!Number.isFinite(numericValue) || !Number.isFinite(numericMin) || !Number.isFinite(numericMax)) {
    return 0;
  }
  const span = numericMax - numericMin;
  if (span <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, ((numericValue - numericMin) / span) * 100));
}

export function ViewerWindowSlider({
  label,
  valueLabel,
  accentColor,
  className,
  labelClassName,
  inputClassName,
  style,
  value,
  min,
  max,
  ...props
}: ViewerWindowSliderProps) {
  const mergedStyle: CSSProperties = {
    ...style,
    '--viewer-window-slider-fill-percent': `${resolveSliderPercent(value, min, max)}%`,
    ...(accentColor ? { '--viewer-window-slider-accent': accentColor } : null),
  } as CSSProperties;

  return (
    <label
      className={viewerWindowClassNames('viewer-window-slider', className)}
      style={mergedStyle}
    >
      <span className={viewerWindowClassNames('viewer-window-slider-label', labelClassName)}>
        <span>{label}</span>
        {valueLabel !== undefined ? (
          <span className="viewer-window-slider-value">{valueLabel}</span>
        ) : null}
      </span>
      <input
        {...props}
        type="range"
        min={min}
        max={max}
        value={value}
        className={viewerWindowClassNames('viewer-window-slider-input', inputClassName)}
      />
    </label>
  );
}

type ViewerWindowNumericRange = {
  min: number;
  max: number;
};

type ViewerWindowRangeSliderProps = {
  label: ReactNode;
  bounds: ViewerWindowNumericRange;
  value: ViewerWindowNumericRange;
  onChange: (value: ViewerWindowNumericRange) => void;
  step?: number | 'any';
  formatValue?: (value: number) => string;
  accentColor?: string;
  disabled?: boolean;
  className?: string;
  minAriaLabel?: string;
  maxAriaLabel?: string;
};

function clampViewerWindowNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

const defaultRangeValueFormatter = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function ViewerWindowRangeSlider({
  label,
  bounds,
  value,
  onChange,
  step = 'any',
  formatValue = defaultRangeValueFormatter,
  accentColor,
  disabled = false,
  className,
  minAriaLabel,
  maxAriaLabel,
}: ViewerWindowRangeSliderProps) {
  const sliderDisabled = disabled || bounds.max <= bounds.min;
  const span = bounds.max - bounds.min;
  const minPercent =
    span > 0 ? Math.min(100, Math.max(0, ((value.min - bounds.min) / span) * 100)) : 0;
  const maxPercent =
    span > 0 ? Math.min(100, Math.max(0, ((value.max - bounds.min) / span) * 100)) : 0;
  const mergedStyle: CSSProperties = {
    '--viewer-window-range-min-percent': `${minPercent}%`,
    '--viewer-window-range-width-percent': `${Math.max(maxPercent - minPercent, 0)}%`,
    ...(accentColor ? { '--viewer-window-slider-accent': accentColor } : null),
  } as CSSProperties;

  const handleMinChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = clampViewerWindowNumber(Number(event.target.value), bounds.min, bounds.max);
    onChange({ min: Math.min(nextValue, value.max), max: value.max });
  };

  const handleMaxChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextValue = clampViewerWindowNumber(Number(event.target.value), bounds.min, bounds.max);
    onChange({ min: value.min, max: Math.max(nextValue, value.min) });
  };

  return (
    <div
      className={viewerWindowClassNames('viewer-window-range-slider', className)}
      style={mergedStyle}
    >
      <div className="viewer-window-slider-label">
        <span>{label}</span>
        <span className="viewer-window-slider-value">
          {formatValue(value.min)} - {formatValue(value.max)}
        </span>
      </div>
      <div className="viewer-window-range-slider-inputs" aria-hidden={sliderDisabled}>
        <div className="viewer-window-range-slider-track" />
        <div className="viewer-window-range-slider-fill" />
        <input
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={step}
          value={value.min}
          onChange={handleMinChange}
          aria-label={minAriaLabel ?? `${String(label)} minimum`}
          className="viewer-window-range-slider-handle viewer-window-range-slider-handle--min"
          disabled={sliderDisabled}
        />
        <input
          type="range"
          min={bounds.min}
          max={bounds.max}
          step={step}
          value={value.max}
          onChange={handleMaxChange}
          aria-label={maxAriaLabel ?? `${String(label)} maximum`}
          className="viewer-window-range-slider-handle viewer-window-range-slider-handle--max"
          disabled={sliderDisabled}
        />
      </div>
    </div>
  );
}

export type ViewerSegmentedOption<T extends string> = {
  value: T;
  content: ReactNode;
  id?: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  className?: string;
};

type ViewerWindowSegmentedControlProps<T extends string> = {
  ariaLabel: string;
  value: T;
  options: Array<ViewerSegmentedOption<T>>;
  onChange: (value: T) => void;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  style?: CSSProperties;
};

export function ViewerWindowSegmentedControl<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
  className,
  buttonClassName,
  disabled = false,
  style,
}: ViewerWindowSegmentedControlProps<T>) {
  const mergedStyle: CSSProperties = {
    ...style,
    '--viewer-window-segment-count': options.length,
  } as CSSProperties;

  return (
    <div
      className={viewerWindowClassNames('viewer-window-segmented-control', className)}
      role="group"
      aria-label={ariaLabel}
      style={mergedStyle}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={option.id}
            type="button"
            className={viewerWindowClassNames(
              'viewer-window-segment-button',
              buttonClassName,
              option.className,
              selected && 'is-active',
            )}
            aria-label={option.ariaLabel}
            aria-pressed={selected}
            title={option.title}
            disabled={disabled || option.disabled}
            onClick={() => onChange(option.value)}
          >
            {option.content}
          </button>
        );
      })}
    </div>
  );
}

type ViewerWindowManagerProps = HTMLAttributes<HTMLDivElement>;

export function ViewerWindowManager({ className, ...props }: ViewerWindowManagerProps) {
  return (
    <div
      {...props}
      className={viewerWindowClassNames('viewer-window-manager', className)}
    />
  );
}

type ViewerWindowManagerListProps = HTMLAttributes<HTMLDivElement> & {
  multiselectable?: boolean;
};

export function ViewerWindowManagerList({
  className,
  multiselectable,
  ...props
}: ViewerWindowManagerListProps) {
  return (
    <div
      {...props}
      className={viewerWindowClassNames('viewer-window-manager-list', className)}
      role={props.role ?? 'listbox'}
      aria-multiselectable={multiselectable}
    />
  );
}

type ViewerWindowManagerItemProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  active?: boolean;
};

export function ViewerWindowManagerItem({
  className,
  selected = false,
  active = false,
  ...props
}: ViewerWindowManagerItemProps) {
  return (
    <button
      {...props}
      className={viewerWindowClassNames(
        'viewer-window-manager-list-item',
        selected && 'is-selected',
        active && 'is-active',
        className,
      )}
      aria-selected={props['aria-selected'] ?? selected}
    />
  );
}

export function ViewerWindowManagerItemLabel({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className={viewerWindowClassNames('viewer-window-manager-list-item-label', className)}
    />
  );
}

export function ViewerWindowManagerBadge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...props}
      className={viewerWindowClassNames('viewer-window-manager-selection-badge', className)}
    />
  );
}

export function ViewerWindowEmptyState({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      {...props}
      className={viewerWindowClassNames('viewer-window-empty-state', className)}
    />
  );
}

export function ViewerWindowMessage({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={viewerWindowClassNames('viewer-window-message', className)}
    />
  );
}

export const ViewerWindowManagerActions = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function ViewerWindowManagerActions({ className, ...props }, ref) {
    return (
      <div
        {...props}
        ref={ref}
        className={viewerWindowClassNames('viewer-window-manager-actions', className)}
      />
    );
  },
);
