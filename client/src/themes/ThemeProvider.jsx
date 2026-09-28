import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { getTheme } from './index.js'

const ThemeContext = createContext(null)
const noop = () => {}

// Setzt das Aussehen der Familie: data-theme am <html>, Fenstertitel und Favicon.
// setPreviewId zeigt ein anderes Theme vorübergehend (Auswahl in den Einstellungen), ohne zu speichern.
export function ThemeProvider({ themeId, children }) {
  const [previewId, setPreviewId] = useState(null)
  const theme = getTheme(previewId || themeId)

  useEffect(() => setPreviewId(null), [themeId])

  useEffect(() => {
    document.documentElement.dataset.theme = theme.id
    document.title = theme.appName
    const icon = document.querySelector('link[rel="icon"]')
    if (icon) icon.setAttribute('href', theme.favicon)
  }, [theme])

  const value = useMemo(() => ({ theme, words: theme.words, setPreviewId }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (value) return value
  const theme = getTheme('standard')
  return { theme, words: theme.words, setPreviewId: noop }
}
