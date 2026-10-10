// Tagesgruppen und Grenzen für „Fotos mitbringen“ (rein, ohne Browser-APIs).
// Je Tag EINE Erinnerung; höchstens MAX_PER_ENTRY Fotos je Erinnerung (server/lib/validate.js MAX_PHOTOS = 20),
// höchstens MAX_PHOTOS Fotos und MAX_DAYS Erinnerungen je Durchgang (schont Upload-Grenze und Geduld).

export const MAX_PHOTOS = 60
export const MAX_DAYS = 20
export const MAX_PER_ENTRY = 20

const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// items: [{ id, date: 'YYYY-MM-DD', ... }] → [{ date, items }] aufsteigend nach Datum, Reihenfolge innerhalb bleibt.
export function groupByDay(items) {
  const days = new Map()
  for (const item of items) {
    if (!item?.date) continue
    days.set(item.date, [...(days.get(item.date) || []), item])
  }
  return [...days.entries()].sort(([a], [b]) => byKey(a, b)).map(([date, dayItems]) => ({ date, items: dayItems }))
}

// Auswahl → Plan: nur ausgewählte Fotos, Grenzen der Reihe nach angewandt. skipped = ausgewählt, aber nicht dabei.
export function planImport(days, selectedIds) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds)
  const plan = []
  let photos = 0
  let wanted = 0
  for (const day of days) {
    const chosen = day.items.filter((item) => selected.has(item.id))
    wanted += chosen.length
    if (chosen.length === 0 || plan.length >= MAX_DAYS) continue
    const take = chosen.slice(0, Math.min(MAX_PER_ENTRY, MAX_PHOTOS - photos))
    if (take.length === 0) continue
    plan.push({ date: day.date, items: take })
    photos += take.length
  }
  return { plan, photos, skipped: wanted - photos }
}

// Vorauswahl: alles, was in einen Durchgang passt (die frühesten Tage zuerst) - der Rest bleibt abgewählt.
export function initialSelection(days) {
  const all = days.flatMap((day) => day.items.map((item) => item.id))
  return new Set(planImport(days, all).plan.flatMap((day) => day.items.map((item) => item.id)))
}
