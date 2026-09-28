import berner from './berner.js'
import standard from './standard.js'

// Reihenfolge = Reihenfolge in der Auswahl; muss zu server/lib/themes.js passen
export const THEMES = { standard, berner }
export const THEME_IDS = Object.keys(THEMES)

export function getTheme(id) {
  return THEMES[id] || THEMES.standard
}
