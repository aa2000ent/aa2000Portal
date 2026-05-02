import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { applyPortalThemeCssVars } from '../theme/applyPortalThemeCssVars'

export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'aa-portal-theme'

/** Read persisted theme (SSR-safe). Used before React mounts to avoid CSS variable flash. */
export function readThemeFromStorage(): Theme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v === 'light' || v === 'dark') return v
  } catch {
    /* ignore */
  }
  return 'dark'
}

function applyDocumentTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  applyPortalThemeCssVars(theme)
}

type ThemeContextValue = {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readThemeFromStorage())

  useEffect(() => {
    applyDocumentTheme(theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
