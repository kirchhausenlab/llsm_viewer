import { useUiTheme } from '../../ui/app/providers/UiThemeProvider';

type ThemeModeToggleProps = {
  className?: string;
  compact?: boolean;
};

const combineClassNames = (...values: Array<string | null | undefined | false>) =>
  values.filter(Boolean).join(' ');

export default function ThemeModeToggle({
  className,
  compact = false
}: ThemeModeToggleProps) {
  const { themeMode, toggleThemeMode } = useUiTheme();
  const nextThemeMode = themeMode === 'dark' ? 'light' : 'dark';
  const isDark = themeMode === 'dark';

  return (
    <button
      type="button"
      className={combineClassNames(
        'theme-mode-toggle',
        compact && 'theme-mode-toggle--compact',
        className
      )}
      onClick={toggleThemeMode}
      aria-label={`Switch to ${nextThemeMode} mode`}
      title={`Switch to ${nextThemeMode} mode`}
    >
      <span
        aria-hidden="true"
        className={combineClassNames(
          'theme-mode-toggle__switch',
          isDark && 'is-dark'
        )}
      >
        <span className="theme-mode-toggle__thumb">
          {isDark ? (
            <svg
              className="theme-mode-toggle__icon"
              viewBox="0 0 24 24"
              focusable="false"
              aria-hidden="true"
            >
              <path
                d="M14.25 4.25a7.5 7.5 0 1 0 5.5 12.6a6.75 6.75 0 1 1-5.5-12.6Z"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg
              className="theme-mode-toggle__icon"
              viewBox="0 0 24 24"
              focusable="false"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="4.1" fill="currentColor" />
              <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 2.75v2.4" />
                <path d="M12 18.85v2.4" />
                <path d="M2.75 12h2.4" />
                <path d="M18.85 12h2.4" />
                <path d="m5.46 5.46 1.7 1.7" />
                <path d="m16.84 16.84 1.7 1.7" />
                <path d="m18.54 5.46-1.7 1.7" />
                <path d="m7.16 16.84-1.7 1.7" />
              </g>
            </svg>
          )}
        </span>
      </span>
    </button>
  );
}
