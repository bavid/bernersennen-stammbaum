// Laufband „Zahlen aus der Gemeinschaft“ (CommunityTicker) - reine Funktionen über GET /api/community
// (server/lib/community.js): aus den Summen werden kurze Einträge („Dabei sind 10 Familien“, „200 Erinnerungen“,
// „500 € Spenden“, „Partner des Monats: Hundeschule Pfotenglück“). Nullen fallen weg; 1 steht im Singular.

const ZAHL = new Intl.NumberFormat('de-DE')
const EURO_GANZ = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export const TICKER_LEER = 'Gerade starten wir – schön, dass du da bist.'
// Wie viele Einträge die ruhige Zeile (ohne Bewegung) zeigt, bevor „mehr“ den Rest aufklappt.
export const STATIC_COUNT = 4

function anzahl(n, eins, viele) {
  return `${ZAHL.format(n)} ${n === 1 ? eins : viele}`
}

function positiv(n) {
  return Number.isFinite(n) && n > 0
}

// [{ key, text, href? }] in fester Reihenfolge - ohne Daten oder mit lauter Nullen ein leeres Array.
export function tickerItems(data) {
  if (!data || typeof data !== 'object') return []
  const items = []
  if (positiv(data.familien)) items.push({ key: 'familien', text: `${data.familien === 1 ? 'Dabei ist' : 'Dabei sind'} ${anzahl(data.familien, 'Familie', 'Familien')}` })
  if (positiv(data.zuhause)) items.push({ key: 'zuhause', text: anzahl(data.zuhause, 'Zuhause', 'Zuhause') })
  if (positiv(data.erinnerungen)) items.push({ key: 'erinnerungen', text: anzahl(data.erinnerungen, 'Erinnerung', 'Erinnerungen') })
  if (positiv(data.fotos)) items.push({ key: 'fotos', text: anzahl(data.fotos, 'Foto', 'Fotos') })
  if (positiv(data.spendenCents)) items.push({ key: 'spenden', text: `${EURO_GANZ.format(Math.floor(data.spendenCents / 100))} Spenden` })
  if (positiv(data.partner)) items.push({ key: 'partner', text: anzahl(data.partner, 'Partner', 'Partner') })
  const vorgestellt = Array.isArray(data.partnerVorgestellt) ? data.partnerVorgestellt.filter((p) => p?.slug && p?.name) : []
  const label = vorgestellt.length === 1 ? 'Partner des Monats' : 'Vorgestellt'
  for (const partner of vorgestellt) {
    items.push({ key: `partner-${partner.slug}`, text: `${label}: ${partner.name}`, href: `/p/${encodeURIComponent(partner.slug)}` })
  }
  return items
}

// Der Satz für Screenreader (einmal, unsichtbar): „Dabei sind 10 Familien, 200 Erinnerungen, … .“
export function tickerSentence(items) {
  return items.length ? `${items.map((item) => item.text).join(', ')}.` : ''
}

// Dauer eines Durchlaufs in Sekunden: proportional zur Länge, zwischen 60 und 90.
export function tickerDuration(items) {
  const zeichen = items.reduce((sum, item) => sum + item.text.length + 3, 0)
  return Math.min(90, Math.max(60, Math.round(zeichen * 0.6)))
}
