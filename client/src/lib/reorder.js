// Reine Rechenhilfen fürs Anordnen per Ziehen (hooks/useDragReorder.js): Element verschieben, Treffer unter dem Zeiger.

// Eine neue Liste, in der das Element von `from` an `to` steht (alle anderen rücken nach). Ungültige Stellen lassen
// die Liste, wie sie ist.
export function moveItem(list, from, to) {
  if (!Array.isArray(list) || from === to) return Array.isArray(list) ? [...list] : []
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list]
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

// Welches Rechteck (DOMRect-artig: left, top, right, bottom; null für fehlende) liegt unter dem Punkt? Index oder null.
export function indexFromPoint(rects, x, y) {
  for (let index = 0; index < rects.length; index += 1) {
    const rect = rects[index]
    if (rect && x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) return index
  }
  return null
}

// Die nächste Stelle nach einem Tastendruck: Pfeile um eins, Pos1/Ende an den Rand, sonst null.
export function stepIndex(key, current, count) {
  const delta = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[key]
  if (delta !== undefined) return Math.min(count - 1, Math.max(0, current + delta))
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

// Hinweis (Toast), wenn der Server eine neue Reihenfolge nicht speichert - die alte springt dann zurück.
export const ORDER_ERROR = 'Die Reihenfolge ließ sich nicht speichern – bitte noch einmal versuchen.'
