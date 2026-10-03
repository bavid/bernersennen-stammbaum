// Fokus auf den Inhalt der Seite (Audit V7a): der Hauptbereich (<main>), ohne ihn die Seitenüberschrift - ohne zu
// scrollen. Genutzt von "Zum Inhalt springen" (SkipLink) und nach dem letzten weggeklickten Hinweis (HinweisBand), damit
// der Fokus nie im Nichts (body) landet. tabindex="-1" macht das Ziel fokussierbar, ohne es in die Tab-Reihenfolge
// aufzunehmen. Gibt zurück, ob es ein Ziel gab.
export function focusContent(doc = document) {
  const target = doc.querySelector('main') || doc.querySelector('h1')
  if (!target) return false
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1')
  target.focus({ preventScroll: true })
  return true
}
