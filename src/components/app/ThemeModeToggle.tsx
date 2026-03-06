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
      <span className="theme-mode-toggle__copy">
        <span className="theme-mode-toggle__label">
          {themeMode === 'dark' ? 'Dark mode' : 'Light mode'}
        </span>
        {!compact ? (
          <span className="theme-mode-toggle__hint">
            Switch to {nextThemeMode} mode
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={combineClassNames(
          'theme-mode-toggle__switch',
          themeMode === 'dark' && 'is-dark'
        )}
      >
        <span className="theme-mode-toggle__thumb" />
      </span>
    </button>
  );
}
