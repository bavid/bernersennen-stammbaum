import { todayIso } from './dates.js'

export function isPastTermin(note, today = todayIso()) {
  return Boolean(note.termin_datum) && note.termin_datum < today
}

// Kommende Termine zuerst (der nächste oben), dann alle übrigen Zettel neueste zuerst,
// vergangene Termine ans Ende.
export function sortNotes(notes, today = todayIso()) {
  const group = (note) => {
    if (!note.termin_datum) return 1
    return isPastTermin(note, today) ? 2 : 0
  }
  const terminKey = (note) => `${note.termin_datum}T${note.termin_zeit || '00:00'}`
  return [...notes].sort((a, b) => {
    if (group(a) !== group(b)) return group(a) - group(b)
    if (group(a) === 0) return terminKey(a) < terminKey(b) ? -1 : 1
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
    return b.id - a.id
  })
}

export function nextTermin(notes, today = todayIso()) {
  return sortNotes(notes, today).find((note) => note.termin_datum && !isPastTermin(note, today)) || null
}
