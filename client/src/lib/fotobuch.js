import { yearOf } from './dates.js'
import { displayName } from './timeline.js'

// Chronik als Fotobuch (Plan 2027, „Später“): die Erinnerungen eines Tiers als druckbares Album (pages/FotobuchPage.jsx).
// Rein im Browser - die Seite liest nur getDog/listTimeline, der Server liefert ohnehin nur, was der Bereich sehen darf.
// Hier das Layout-Modell: Zeitraum, private Erinnerungen, Obergrenze, Seiten mit 2 oder 4 Erinnerungen, Kapitel je Jahr.

export const FOTOBUCH_RE = /^\/tier\/(\d+)\/fotobuch\/?$/
export const MAX_MEMORIES = 120
export const PER_PAGE_OPTIONS = Object.freeze([2, 4])
export const RANGES = Object.freeze(['all', 'year', '12m', 'custom'])
// Text je Erinnerung: bei zwei je Seite ist mehr Platz als bei vier.
export const TEXT_LIMITS = Object.freeze({ 2: 520, 4: 220 })
export const DEFAULT_OPTIONS = Object.freeze({
  range: 'all',
  from: '',
  to: '',
  includePrivate: false,
  perPage: 4,
  chapters: true
})

export function fotobuchRoute(dogId) {
  return `/tier/${dogId}/fotobuch`
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}/

function shiftYears(iso, years) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(Date.UTC(y + years, m - 1, d))
  return date.toISOString().slice(0, 10)
}

// Grenzen des Zeitraums als ISO-Tage (inklusive), null = offen.
export function rangeBounds({ range, from, to }, today) {
  if (range === 'year') return { from: `${today.slice(0, 4)}-01-01`, to: null }
  if (range === '12m') return { from: shiftYears(today, -1), to: null }
  if (range === 'custom') {
    return {
      from: ISO_DAY.test(from || '') ? from : null,
      to: ISO_DAY.test(to || '') ? to : null
    }
  }
  return { from: null, to: null }
}

function hasContent(entry) {
  return Boolean(entry?.foto_urls?.length || entry?.titel?.trim() || entry?.text?.trim())
}

function inRange(day, bounds) {
  return (!bounds.from || day >= bounds.from) && (!bounds.to || day <= bounds.to)
}

function byDate(a, b) {
  return String(a.datum).localeCompare(String(b.datum)) || (a.id ?? 0) - (b.id ?? 0)
}

// Erinnerungen fürs Buch: mit Datum und Inhalt, im Zeitraum, private nur auf Wunsch, nach Datum - höchstens MAX_MEMORIES.
export function selectMemories(entries = [], options = DEFAULT_OPTIONS, today) {
  const bounds = rangeBounds(options, today)
  const matching = entries
    .filter((entry) => ISO_DAY.test(entry?.datum || '') && hasContent(entry))
    .filter((entry) => options.includePrivate || !entry.privat)
    .filter((entry) => inRange(entry.datum.slice(0, 10), bounds))
    .sort(byDate)
  return {
    memories: matching.slice(0, MAX_MEMORIES),
    total: matching.length,
    capped: matching.length > MAX_MEMORIES
  }
}

// Text auf eine lesbare Länge kürzen - an einer Wortgrenze, mit „…“.
export function trimText(text = '', limit = TEXT_LIMITS[4]) {
  const clean = String(text || '').trim()
  if (clean.length <= limit) return clean
  const cut = clean.slice(0, limit)
  const space = cut.lastIndexOf(' ')
  return `${(space > limit * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '')} …`
}

function toItem(entry, limit) {
  return {
    id: entry.id,
    datum: entry.datum.slice(0, 10),
    titel: entry.titel?.trim() || '',
    text: trimText(entry.text, limit),
    photo: entry.foto_urls?.[0] || null
  }
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

// Seiten mit perPage Erinnerungen. Mit Kapiteln beginnt jedes Jahr auf einer neuen Seite, deren erste das Jahr trägt.
export function paginate(memories, { perPage = 4, chapters = true } = {}) {
  const size = PER_PAGE_OPTIONS.includes(Number(perPage)) ? Number(perPage) : 4
  const limit = TEXT_LIMITS[size]
  const items = memories.map((entry) => toItem(entry, limit))
  if (!chapters)
    return chunk(items, size).map((pageItems) => ({
      chapter: null,
      items: pageItems
    }))
  const years = [...new Set(items.map((item) => yearOf(item.datum)))]
  return years.flatMap((year) =>
    chunk(
      items.filter((item) => yearOf(item.datum) === year),
      size
    ).map((pageItems, index) => ({
      chapter: index === 0 ? year : null,
      items: pageItems
    }))
  )
}

export function yearSpan(memories) {
  if (memories.length === 0) return ''
  const first = yearOf(memories[0].datum)
  const last = yearOf(memories[memories.length - 1].datum)
  return first === last ? String(first) : `${first} – ${last}`
}

// Titelbild: das Porträt, sonst das erste Foto aus den Erinnerungen.
export function coverPhoto(dog, memories) {
  return dog?.foto_url || memories.find((entry) => entry.foto_urls?.length)?.foto_urls[0] || null
}

export function hasPrivate(entries = []) {
  return entries.some((entry) => entry?.privat)
}

// Ein Buch braucht mindestens eine sichtbare Erinnerung mit Datum und Inhalt.
export function canMakeBook(entries = []) {
  return entries.some((entry) => ISO_DAY.test(entry?.datum || '') && hasContent(entry))
}

export function buildBook({ dog, entries, options = DEFAULT_OPTIONS, today }) {
  const { memories, total, capped } = selectMemories(entries, options, today)
  return {
    name: displayName(dog),
    cover: { photo: coverPhoto(dog, memories), years: yearSpan(memories) },
    pages: paginate(memories, options),
    count: memories.length,
    total,
    capped
  }
}

// Alle Bild-Adressen des Buchs (Titel + Seiten), ohne Doppelte - für die Ladeanzeige vor dem Drucken.
export function bookImages(book) {
  const urls = [book.cover.photo, ...book.pages.flatMap((page) => page.items.map((item) => item.photo))]
  return [...new Set(urls.filter(Boolean))]
}
