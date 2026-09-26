import { yearOf } from './dates.js'

const TYPE_ORDER = { birth: 0, breeding: 1, litter: 2, entry: 3 }

export function sexLabel(geschlecht) {
  return geschlecht === 'ruede' ? 'Rüde' : 'Hündin'
}

export function shortName(name = '') {
  return name.split(/\s+(vom|von|aus|zum|zur)\s+/i)[0]
}

// "Aikos", aber "Hermes’"
export function genitive(name) {
  return /[sxzß]$/i.test(name) ? `${name}’` : `${name}s`
}

function compareItems(a, b) {
  if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1
  if (TYPE_ORDER[a.type] !== TYPE_ORDER[b.type]) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
  return (a.sortId ?? 0) - (b.sortId ?? 0)
}

function litterItems(children = []) {
  const byDate = new Map()
  for (const child of children) {
    if (!child.geburtsdatum) continue
    byDate.set(child.geburtsdatum, [...(byDate.get(child.geburtsdatum) || []), child])
  }
  return [...byDate.entries()].map(([datum, litter]) => ({
    type: 'litter',
    key: `litter-${datum}`,
    datum,
    titel: `Nachwuchs: ${litter.map((c) => shortName(c.name)).join(', ')}`,
    children: litter
  }))
}

function breedingItems(dog, breedingEvents = []) {
  return breedingEvents
    .filter((event) => event.mutter_dog_id === dog.id || event.vater_dog_id === dog.id)
    .map((event) => {
      const partner =
        event.mutter_dog_id === dog.id ? event.vater_name || event.vater_freitext : event.mutter_name
      return {
        type: 'breeding',
        key: `breeding-${event.id}`,
        sortId: event.id,
        datum: event.datum,
        titel: partner ? `Deckakt mit ${shortName(partner)}` : 'Deckakt',
        text: event.wurf_info,
        foto_urls: event.foto_urls || []
      }
    })
}

// Führt eigene Einträge und automatische Meilensteine (Geburt, Deckakt, Nachwuchs)
// zu einer chronologisch sortierten Liste zusammen.
export function buildTimeline({ dog, entries = [], breedingEvents = [], children = [], newestFirst = false }) {
  const items = [
    ...entries.map((entry) => ({ ...entry, type: 'entry', key: `entry-${entry.id}`, sortId: entry.id })),
    ...breedingItems(dog, breedingEvents),
    ...litterItems(children)
  ]
  if (dog.geburtsdatum) {
    items.push({ type: 'birth', key: 'birth', datum: dog.geburtsdatum, titel: `${shortName(dog.name)} kommt zur Welt` })
  }
  items.sort(compareItems)
  return newestFirst ? items.reverse() : items
}

export function groupByYear(items) {
  const groups = []
  for (const item of items) {
    const year = yearOf(item.datum)
    const last = groups[groups.length - 1]
    if (last && last.year === year) last.items.push(item)
    else groups.push({ year, items: [item] })
  }
  return groups
}
