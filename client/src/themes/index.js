import standard from './standard.js'

// Ein Auftritt für alle (B+ Familienalbum, 04.10.): der Berner-Auftritt ist entfernt. getTheme bleibt für bestehende
// Aufrufer und liefert immer den Standard - auch für einen alten gespeicherten Wert wie 'berner' (server families.theme).
export const THEME = standard

export function getTheme() {
  return standard
}
