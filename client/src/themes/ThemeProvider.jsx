import { THEME } from './index.js'

// Seit B+ Familienalbum (04.10.) gibt es einen Auftritt für alle: Logo, Name und Wörter (themes/standard.js) hängen nicht
// mehr an der Familie. Der Dateiname bleibt, weil viele Komponenten useTheme von hier holen.
const VALUE = Object.freeze({ theme: THEME, words: THEME.words })

// Hülle ohne eigene Wirkung - Fenstertitel und Favicon stehen fest in index.html.
export function ThemeProvider({ children }) {
  return children
}

export function useTheme() {
  return VALUE
}
