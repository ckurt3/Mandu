import { createContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';

// Types
export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

// Context
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

// Provider Props
interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

// Safe localStorage access (handles private browsing)
const getStoredTheme = (key: string): Theme | null => {
  try {
    return localStorage.getItem(key) as Theme | null;
  } catch {
    return null;
  }
};

const setStoredTheme = (key: string, theme: Theme): void => {
  try {
    localStorage.setItem(key, theme);
  } catch {
    // Silently fail in private browsing
  }
};

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'mandu-theme',
}: ThemeProviderProps) {
  // Initialize from localStorage or default
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    return getStoredTheme(storageKey) || defaultTheme;
  });

  // Track system preference
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Resolve actual theme
  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme;

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Sync to DOM and localStorage
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    setStoredTheme(storageKey, theme);
  }, [theme, resolvedTheme, storageKey]);

  // Theme setter
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
  }, []);

  // Simple toggle between light/dark
  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      if (prev === 'light') return 'dark';
      if (prev === 'dark') return 'light';
      // If system, toggle to opposite of current resolved
      return resolvedTheme === 'dark' ? 'light' : 'dark';
    });
  }, [resolvedTheme]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
