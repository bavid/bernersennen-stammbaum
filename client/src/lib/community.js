import { getLang, locale } from './i18n/index.js'

// Band „Mit dabei“ (CommunityTicker) - reine Funktionen über GET /api/community (server/lib/community.js): aus den Summen
// werden kurze Einträge mit Zahl und Wort („10 Familien“, „200 Erinnerungen“, „500 € Spenden“) und vorgestellte Partner
// („Partner des Monats: Hundeschule Pfotenglück“, der erste vorn mit Fotos - tickerHero). Nullen fallen weg; 1 steht im
// Singular. Was das Band zeigt, stellt der Admin ein (data.banner: chips, hinweis, partnerDesMonats). Sprache aus lib/i18n.

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

// Die vorgestellten Partner mit Name und Slug; der erste ist der „Held“ des Bands (tickerHero).
function vorgestellte(data) {
  return Array.isArray(data?.partnerVorgestellt) ? data.partnerVorgestellt.filter((p) => p?.slug && p?.name) : []
}

function partnerKicker(data, list) {
  const w = texte()
  return data?.banner?.partnerDesMonats || list.length === 1 ? w.partnerDesMonats : w.vorgestellt
}

// Welche Zahlen das Band zeigt (Admin: banner.chips); ohne Angabe alle.
function chipShown(data, key) {
  const chips = data?.banner?.chips
  return !Array.isArray(chips) || chips.includes(key)
}

function zahlenItems(data) {
  const w = texte()
  const shown = (key, n) => chipShown(data, key) && positiv(n)
  const items = []
  if (shown('familien', data.familien)) {
    const item = zahlEintrag('familien', 'users', data.familien, w.familie)
    items.push({ ...item, text: `${data.familien === 1 ? w.dabeiEins : w.dabeiViele} ${item.text}` })
  }
  if (shown('zuhause', data.zuhause)) items.push(zahlEintrag('zuhause', 'home', data.zuhause, w.zuhause))
  if (shown('erinnerungen', data.erinnerungen)) items.push(zahlEintrag('erinnerungen', 'book', data.erinnerungen, w.erinnerung))
  if (shown('fotos', data.fotos)) items.push(zahlEintrag('fotos', 'camera', data.fotos, w.foto))
  if (shown('spenden', data.spendenCents)) {
    const value = euroGanz(data.spendenCents)
    items.push({ key: 'spenden', icon: 'heart', value, label: w.spenden, text: `${value} ${w.spenden}` })
  }
  if (shown('partner', data.partner)) items.push(zahlEintrag('partner', 'globe', data.partner, w.partner))
  return items
}

// Eigener kurzer Eintrag des Admins („Neu: Wir waren hier“), Link nur als interner Pfad.
function hinweisItem(data) {
  const hinweis = data?.banner?.hinweis
  if (!hinweis || typeof hinweis.text !== 'string' || !hinweis.text.trim()) return null
  const href = typeof hinweis.link === 'string' && /^\/(?![/\\])/.test(hinweis.link) ? hinweis.link : undefined
  return { key: 'hinweis', icon: 'megaphone', label: hinweis.text, text: hinweis.text, href, hinweis: true }
}

// Der vorgestellte Partner vorn im Band (Partner des Monats): { slug, name, href, kicker, fotos } oder null.
export function tickerHero(data) {
  const list = vorgestellte(data)
  if (!list.length) return null
  const [partner] = list
  const fotos = Array.isArray(partner.fotos) ? partner.fotos.filter((url) => typeof url === 'string' && url.startsWith('/')) : []
  return { slug: partner.slug, name: partner.name, href: `/p/${encodeURIComponent(partner.slug)}`, kicker: partnerKicker(data, list), fotos }
}

// [{ key, icon, value?, label, text, href?, featured?, hinweis? }] in fester Reihenfolge: Zahlen (Nullen fallen weg), der
// eigene Eintrag und weitere vorgestellte Partner (der erste steht als tickerHero vorn) - ohne Daten leer.
export function tickerItems(data) {
  if (!data || typeof data !== 'object') return []
  const items = zahlenItems(data)
  const hinweis = hinweisItem(data)
  if (hinweis) items.push(hinweis)
  const list = vorgestellte(data)
  const kicker = partnerKicker(data, list)
  for (const partner of list.slice(1)) {
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
