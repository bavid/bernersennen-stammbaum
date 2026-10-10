import { t } from './i18n/index.js'
// Kapitel nach Jahreszeiten (B+ Familienalbum): in der Chronik eines Tiers und im Feed auf Start steht zwischen den
// Erinnerungen in Handschrift „Herbst 2026“. Meteorologisch: Frühling März–Mai, Sommer Juni–August, Herbst
// September–November, Winter Dezember–Februar (über den Jahreswechsel „Winter 2026/27“).
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})/

function parts(iso) {
  const match = typeof iso === 'string' ? iso.match(ISO_RE) : null
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  return month >= 1 && month <= 12 ? { year, month, day } : null
}

const SEASONS = [
  { name: 'Frühling', months: [3, 4, 5] },
  { name: 'Sommer', months: [6, 7, 8] },
  { name: 'Herbst', months: [9, 10, 11] }
]

const twoDigits = (year) => String(year % 100).padStart(2, '0')

export function seasonLabel(iso) {
  const date = parts(iso)
  if (!date) return null
  const season = SEASONS.find((entry) => entry.months.includes(date.month))
  if (season) return `${t(season.name)} ${date.year}`
  const startYear = date.month === 12 ? date.year : date.year - 1
  return `${t('Winter')} ${startYear}/${twoDigits(startYear + 1)}`
}

// Aufeinanderfolgende Einträge derselben Jahreszeit -> [{ key, label, items }], die Reihenfolge der Liste bleibt. Ein
// Eintrag ohne Datum hängt am Kapitel davor (am Anfang: ein Kapitel ohne Titel, label null).
export function groupBySeason(items, dateOf = (item) => item.datum) {
  const groups = []
  for (const item of items) {
    const label = seasonLabel(dateOf(item))
    const last = groups[groups.length - 1]
    if (last && (label === null || label === last.label)) last.items.push(item)
    else groups.push({ key: `${label ?? 'ohne'}-${groups.length}`, label, items: [item] })
  }
  return groups
}

// „Heute vor einem Jahr“ / „Heute vor 3 Jahren“ - nur, wenn datum derselbe Tag eines früheren Jahres ist wie today.
export function yearsAgoLabel(datum, today) {
  const date = parts(datum)
  const now = parts(today)
  if (!date || !now || date.month !== now.month || date.day !== now.day) return null
  const years = now.year - date.year
  if (years <= 0) return null
  return years === 1 ? t('Heute vor einem Jahr') : t('Heute vor {n} Jahren', { n: years })
}
