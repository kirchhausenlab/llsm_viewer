import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from 'react';

export type UiThemeMode = 'dark' | 'light';

type UiThemeContextValue = {
  themeMode: UiThemeMode;
  isDarkMode: boolean;
  setThemeMode: (themeMode: UiThemeMode) => void;
  toggleThemeMode: () => void;
};

const UI_THEME_STORAGE_KEY = 'llsm_viewer.theme_mode';
const DEFAULT_THEME_MODE: UiThemeMode = 'dark';

const DEFAULT_CONTEXT_VALUE: UiThemeContextValue = {
  themeMode: DEFAULT_THEME_MODE,
  isDarkMode: true,
  setThemeMode: () => {},
  toggleThemeMode: () => {}
};

const UiThemeContext = createContext<UiThemeContextValue>(DEFAULT_CONTEXT_VALUE);

const isUiThemeMode = (value: string | null): value is UiThemeMode =>
  value === 'dark' || value === 'light';

function readStoredThemeMode(): UiThemeMode {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_MODE;
  }

  try {
    const storedThemeMode = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
    return isUiThemeMode(storedThemeMode) ? storedThemeMode : DEFAULT_THEME_MODE;
  } catch (error) {
    console.warn('Unable to read theme mode from localStorage.', error);
    return DEFAULT_THEME_MODE;
  }
}

export function UiThemeProvider({ children }: PropsWithChildren) {
  const [themeMode, setThemeMode] = useState<UiThemeMode>(() => readStoredThemeMode());

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(UI_THEME_STORAGE_KEY, themeMode);
    } catch (error) {
      console.warn('Unable to store theme mode in localStorage.', error);
    }
  }, [themeMode]);

  const value = useMemo<UiThemeContextValue>(
    () => ({
      themeMode,
      isDarkMode: themeMode === 'dark',
      setThemeMode,
      toggleThemeMode: () => {
        setThemeMode((currentThemeMode) => (currentThemeMode === 'dark' ? 'light' : 'dark'));
      }
    }),
    [themeMode]
  );

  return <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>;
}

export function useUiTheme(): UiThemeContextValue {
  return useContext(UiThemeContext);
}
