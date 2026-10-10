// Wegbegleiter: Zeitspanne je Tier – vom Einzug (sonst Geburt) bis Abschied (sonst heute) –
// dazu die Achse für die Zeitleiste, Herkunftstexte und der nächste Einzugs-Jahrestag.
import { formatDateLong, todayIso, yearOf } from './dates.js'
import { t } from './i18n/index.js'

const DAY_MS = 86400000

const toUtc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}
const daysBetween = (fromIso, toIsoDate) => Math.round((toUtc(toIsoDate) - toUtc(fromIso)) / DAY_MS)

// Wegbegleiter: Zeitspanne je Tier – vom Einzug (sonst Geburt) bis Abschied (sonst heute)
export function companionRows(dogs, today) {
  return dogs
    .map((dog) => {
      const start = dog.bei_uns_seit || dog.geburtsdatum
      if (!start) return null
      const departed = Boolean(dog.bei_uns_bis)
      return { dog, start, end: dog.bei_uns_bis || today, ongoing: !departed, departed }
    })
    .filter(Boolean)
    .sort((a, b) => a.start.localeCompare(b.start) || a.dog.name.localeCompare(b.dog.name, 'de'))
}

// Achse in ganzen Jahren über alle Zeilen
export function yearSpan(rows, today) {
  if (!rows.length) return null
  const from = Number(rows[0].start.slice(0, 4))
  const to = Math.max(...rows.map((r) => Number(r.end.slice(0, 4))), Number(today.slice(0, 4)))
  return { from, to }
}

// Anteil 0..1 eines Datums auf der Achse (für Balken-Position)
export function position(date, span) {
  const [y, m, d] = date.split('-').map(Number)
  const yearFraction = y + (m - 1) / 12 + (d - 1) / 365
  return (yearFraction - span.from) / (span.to + 1 - span.from)
}

// Nächster Jahrestag eines Einzugsdatums, bezogen auf "heute" – wie nextLitterBirthday in lib/litters.js,
// nur dass das erste volle Jahr abgewartet wird (ein Einzug von heute ist noch kein Jahrestag).
function anniversaryFor(startDate, today) {
  const [sy, sm, sd] = startDate.split('-').map(Number)
  const [ty] = today.split('-').map(Number)
  const onYear = (year) => `${year}-${String(sm).padStart(2, '0')}-${String(sd).padStart(2, '0')}`
  let year = ty
  if (onYear(year) < today) year += 1
  if (year - sy < 1) year = sy + 1
  const date = onYear(year)
  return { date, years: year - sy, daysUntil: daysBetween(today, date) }
}

// Nächster Jahrestag des Einzugs unter den noch bei uns lebenden Tieren (das mit dem geringsten Abstand)
export function nextAnniversary(dogs, today = todayIso()) {
  let best = null
  for (const dog of dogs) {
    if (!dog.bei_uns_seit || dog.bei_uns_bis) continue
    const candidate = anniversaryFor(dog.bei_uns_seit, today)
    if (!best || candidate.daysUntil < best.daysUntil) best = { dog, ...candidate }
  }
  return best
}

// Jahre gemeinsam: Summe der Zeitspannen aller Zeilen, je Tier auf ganze Jahre abgerundet (365-Tage-Jahr)
export function yearsTogether(rows) {
  return rows.reduce((sum, row) => sum + Math.floor(daysBetween(row.start, row.end) / 365), 0)
}

export const HERKUNFT_LABELS = {
  tierheim: 'aus dem Tierheim',
  privat: 'von privat',
  zuechter: 'vom Züchter',
  nachwuchs: 'eigener Nachwuchs',
  fundtier: 'als Fundtier',
  anderes: ''
}

// "aus dem Tierheim – Tierschutzverein Deichland", "von privat – Bauernhof-Wurf", bei "anderes" nur der Freitext,
// '' wenn nichts eingetragen ist. Beginnt der Name schon mit "Tierheim", wird daraus "aus dem Tierheim Sonnenhang"
// statt "aus dem Tierheim – Tierheim Sonnenhang" (Audit V7a).
const TIERHEIM_NAME_RE = /^tierheim\s/i

export function herkunftText(dog) {
  const art = dog.herkunft_art
  const text = dog.herkunft_text
  if (!art) return text || ''
  if (art === 'anderes') return text || ''
  if (art === 'tierheim' && text && TIERHEIM_NAME_RE.test(text)) return t('aus dem {name}', { name: text })
  const label = HERKUNFT_LABELS[art] ? t(HERKUNFT_LABELS[art]) : ''
  return text ? `${label} – ${text}` : label
}

const ABSCHIED_GRUND_LABELS = {
  abgegeben: 'abgegeben',
  umgezogen: 'umgezogen',
  anderes: 'aus anderem Grund'
}

// Zeile unter Name/Rasse im Hero der Tierseite: fasst Einzug/Herkunft (noch bei uns) oder Abschied
// (gegangen) in einem Satz zusammen. null, wenn dazu nichts bekannt ist. memorial löst die
// zurückhaltende "In Erinnerung"-Variante aus (wie schon in CompanionTimeline für "verstorben") –
// sie bleibt unverändert, auch für geteilte Tiere (kein "Im X in Erinnerung").
// ownerName: gesetzt für ein geteiltes Tier im fremden Bereich (!dog.canEdit) – ersetzt "Bei euch"
// durch "Im {ownerName}" (der Name des besitzenden Zuhauses/Rudels), sonst gilt weiter "Bei euch".
export function companionLine(dog, { ownerName } = {}) {
  const beiUns = ownerName ? t('Im {name}', { name: ownerName }) : t('Bei euch')

  if (dog.bei_uns_bis) {
    const from = yearOf(dog.bei_uns_seit || dog.geburtsdatum)
    const to = yearOf(dog.bei_uns_bis)
    const span = from && to ? `${from}–${to}` : to ? `${to}` : ''

    if (dog.abschied_grund === 'verstorben') {
      return { text: span ? `${t('In Erinnerung')} · ${span}` : t('In Erinnerung'), memorial: true }
    }

    const grund = ABSCHIED_GRUND_LABELS[dog.abschied_grund] ? t(ABSCHIED_GRUND_LABELS[dog.abschied_grund]) : ''
    const parts = [span ? `${beiUns} ${span}` : beiUns]
    if (grund) parts.push(grund)
    return { text: parts.join(' · '), memorial: false }
  }

  const parts = []
  if (dog.bei_uns_seit) parts.push(t('{where} seit {date}', { where: beiUns, date: formatDateLong(dog.bei_uns_seit) }))
  const herkunft = herkunftText(dog)
  if (herkunft) parts.push(herkunft)
  if (!parts.length) return null
  return { text: parts.join(' · '), memorial: false }
}
