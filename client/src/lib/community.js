import { getLang, locale } from './i18n/index.js'

// Band „Mit dabei“ (CommunityTicker) - reine Funktionen über GET /api/community (server/lib/community.js): aus den Summen
// werden kurze Einträge mit Zahl und Wort („10 Familien“, „200 Erinnerungen“, „500 € Spenden“) und vorgestellte Partner
// („Partner des Monats: Hundeschule Pfotenglück“). Nullen fallen weg; 1 steht im Singular. Sprache aus lib/i18n.

const TEXTE = {
  de: {
    leer: 'Gerade starten wir – schön, dass du da bist.',
    familie: ['Familie', 'Familien'],
    zuhause: ['Zuhause', 'Zuhause'],
    erinnerung: ['Erinnerung', 'Erinnerungen'],
    foto: ['Foto', 'Fotos'],
    partner: ['Partner', 'Partner'],
    spenden: 'Spenden',
    partnerDesMonats: 'Partner des Monats',
    vorgestellt: 'Vorgestellt',
    dabeiEins: 'Dabei ist',
    dabeiViele: 'Dabei sind'
  },
  en: {
    leer: 'We are just getting started – lovely to have you here.',
    familie: ['family', 'families'],
    zuhause: ['home', 'homes'],
    erinnerung: ['memory', 'memories'],
    foto: ['photo', 'photos'],
    partner: ['partner', 'partners'],
    spenden: 'donated',
    partnerDesMonats: 'Partner of the month',
    vorgestellt: 'Featured',
    dabeiEins: 'On board:',
    dabeiViele: 'On board:'
  }
}

const texte = () => TEXTE[getLang()] ?? TEXTE.de

export function tickerLeer() {
  return texte().leer
}
// Für bestehende Aufrufer: der deutsche Satz.
export const TICKER_LEER = TEXTE.de.leer
// Wie viele Einträge die ruhige Zeile (weniger Bewegung) zeigt, bevor „mehr“ den Rest aufklappt.
export const STATIC_COUNT = 4

function positiv(n) {
  return Number.isFinite(n) && n > 0
}

function zahl(n) {
  return new Intl.NumberFormat(locale()).format(n)
}

function euroGanz(cents) {
  return new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.floor(cents / 100))
}

// Ein Zahl-Eintrag: value (formatiert), label (Wort in Ein- oder Mehrzahl), text (beides als Satzteil).
function zahlEintrag(key, icon, n, [eins, viele]) {
  const value = zahl(n)
  const label = n === 1 ? eins : viele
  return { key, icon, value, label, text: `${value} ${label}` }
}

// [{ key, icon, value?, label, text, href?, featured? }] in fester Reihenfolge - ohne Daten oder mit lauter Nullen leer.
export function tickerItems(data) {
  if (!data || typeof data !== 'object') return []
  const w = texte()
  const items = []
  if (positiv(data.familien)) {
    const item = zahlEintrag('familien', 'users', data.familien, w.familie)
    items.push({ ...item, text: `${data.familien === 1 ? w.dabeiEins : w.dabeiViele} ${item.text}` })
  }
  if (positiv(data.zuhause)) items.push(zahlEintrag('zuhause', 'home', data.zuhause, w.zuhause))
  if (positiv(data.erinnerungen)) items.push(zahlEintrag('erinnerungen', 'book', data.erinnerungen, w.erinnerung))
  if (positiv(data.fotos)) items.push(zahlEintrag('fotos', 'camera', data.fotos, w.foto))
  if (positiv(data.spendenCents)) {
    const value = euroGanz(data.spendenCents)
    items.push({ key: 'spenden', icon: 'heart', value, label: w.spenden, text: `${value} ${w.spenden}` })
  }
  if (positiv(data.partner)) items.push(zahlEintrag('partner', 'globe', data.partner, w.partner))
  const vorgestellt = Array.isArray(data.partnerVorgestellt) ? data.partnerVorgestellt.filter((p) => p?.slug && p?.name) : []
  const kicker = vorgestellt.length === 1 ? w.partnerDesMonats : w.vorgestellt
  for (const partner of vorgestellt) {
    items.push({
      key: `partner-${partner.slug}`,
      icon: 'star',
      kicker,
      label: partner.name,
      text: `${kicker}: ${partner.name}`,
      href: `/p/${encodeURIComponent(partner.slug)}`,
      featured: true
    })
  }
  return items
}

// Der Satz für Screenreader (einmal, unsichtbar): „Dabei sind 10 Familien, 200 Erinnerungen, … .“
export function tickerSentence(items) {
  return items.length ? `${items.map((item) => item.text).join(', ')}.` : ''
}

// Dauer eines Durchlaufs in Sekunden: proportional zur Länge, zwischen 40 und 80 - ruhig, aber nicht schleppend.
export function tickerDuration(items) {
  const zeichen = items.reduce((sum, item) => sum + item.text.length + 6, 0)
  return Math.min(80, Math.max(40, Math.round(zeichen * 0.5)))
}
