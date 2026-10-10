// Digitaler Bilderrahmen (/bilderrahmen angemeldet, /rahmen auf einem anderen Gerät): reine Hilfen ohne DOM - Optionen,
// Reihenfolge, Bildunterschrift, „Heute vor … Jahren“, Uhr und Nacht. Die Fotos kommen vom Server
// (server/lib/bilderrahmen.js): { url, tierName, datum (JJJJ-MM-TT oder null), inErinnerung }.
import { formatDateLong, monthNames } from './dates.js'
import { getLang, t } from './i18n/index.js'
import { readSetting, writeSetting } from './storage.js'

export const INTERVALLE = [5, 10, 30, 60]
export const ZEITRAEUME = [
  { key: 'alle', label: 'Alle' },
  { key: 'jahr', label: 'Letztes Jahr' },
  { key: 'monat', label: 'Letzter Monat' }
]
// Wie server/lib/rahmenGeraete.js DEFAULT_AUSWAHL (ohne Tiere, Zeitraum und „privat“).
export const DEFAULT_OPTIONEN = Object.freeze({
  intervall: 10,
  untertitel: true,
  uhr: false,
  nacht: true,
  mischen: true,
  heuteZuerst: true,
  erinnerung: true
})
const SWITCHES = ['untertitel', 'uhr', 'nacht', 'mischen', 'heuteZuerst', 'erinnerung']

export const NIGHT_FROM_HOUR = 22
export const NIGHT_UNTIL_HOUR = 7
// Die Fotoliste neu holen: angemeldet alle 30 Minuten (neue Erinnerungen), auf einem Rahmen-Gerät alle 10 Minuten - so zeigt
// ein beendeter Rahmen bald „beendet“, und die signierten Adressen (60 bis 120 Minuten gültig) bleiben immer frisch.
export const REFRESH_MS = 30 * 60 * 1000
export const DEVICE_REFRESH_MS = 10 * 60 * 1000
// Lädt ein Foto so lange nicht (Netz hängt), zählt es wie ein Ladefehler.
export const LOAD_TIMEOUT_MS = 20 * 1000
export const CONTROLS_HIDE_MS = 4000
export const FADE_MS = 1200

// localStorage-Schlüssel (lib/storage.js, mit try/catch): Anzeige und Auswahl der Diashow, Abweichungen auf dem Gerät.
export const SESSION_OPTIONEN_KEY = 'bilderrahmen.optionen'
export const SESSION_AUSWAHL_KEY = 'bilderrahmen.auswahl'
// Die Auswahl je Familie (pages/BilderrahmenPage.jsx areaKey): `${SESSION_AUSWAHL_KEY}.<Id>`.
const FAMILY_AUSWAHL_PREFIX = `chronik.${SESSION_AUSWAHL_KEY}.`

// Beim Abmelden: die gemerkte Auswahl der Familien gehört zu dieser Sitzung, nicht zum Gerät (Tier-Ids einer Familie).
export function clearFamilyAuswahl(storage = window.localStorage) {
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
    for (const key of keys) if (key?.startsWith(FAMILY_AUSWAHL_PREFIX)) storage.removeItem(key)
  } catch {
    // ohne Speicher gibt es nichts zu entfernen
  }
}
export const DEVICE_OPTIONEN_KEY = 'rahmen.optionen'

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function cleanOptionen(value, base = DEFAULT_OPTIONEN) {
  const source = isObject(value) ? value : {}
  const optionen = { ...DEFAULT_OPTIONEN, ...base }
  if (INTERVALLE.includes(source.intervall)) optionen.intervall = source.intervall
  for (const key of SWITCHES) if (typeof source[key] === 'boolean') optionen[key] = source[key]
  return optionen
}

// Auswahl der Diashow: Tiere, Zeitraum und (nur angemeldet im eigenen Zuhause) private Erinnerungen - Vorgabe aus.
export function cleanAuswahl(value) {
  const source = isObject(value) ? value : {}
  const tiere = Array.isArray(source.tiere) ? [...new Set(source.tiere.filter((id) => Number.isInteger(id) && id > 0))] : []
  const zeitraum = ZEITRAEUME.some((z) => z.key === source.zeitraum) ? source.zeitraum : 'alle'
  return { tiere, zeitraum, privat: source.privat === true }
}

// Nur die Werte, die von base abweichen - so überschreibt das Gerät nicht jede spätere Änderung am Rahmen-Link.
export function diffOptionen(optionen, base) {
  return Object.fromEntries(Object.entries(optionen).filter(([key, value]) => base[key] !== value))
}

export function readOptionen(key, base = DEFAULT_OPTIONEN) {
  return cleanOptionen(readSetting(key, null), base)
}

export function writeOptionen(key, optionen) {
  writeSetting(key, optionen)
}

function dateParts(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null
  const [year, month, day] = iso.split('-').map(Number)
  return { year, month, day }
}

// Wie viele Jahre liegt datum heute zurück - nur, wenn Tag und Monat heute sind (sonst null).
export function yearsAgo(datum, today = new Date()) {
  const parts = dateParts(datum)
  if (!parts) return null
  if (parts.month !== today.getMonth() + 1 || parts.day !== today.getDate()) return null
  const years = today.getFullYear() - parts.year
  return years > 0 ? years : null
}

export function heuteVorText(years) {
  return years === 1 ? t('Heute vor einem Jahr') : t('Heute vor {n} Jahren', { n: years })
}

// { name, datum, heuteVor, erinnerung } für die Bildunterschrift - Texte gibt es keine, nur Name und Datum.
export function captionFor(foto, optionen, today = new Date()) {
  const years = yearsAgo(foto.datum, today)
  return {
    name: foto.tierName,
    datum: formatDateLong(foto.datum),
    heuteVor: years ? heuteVorText(years) : null,
    erinnerung: optionen.erinnerung && foto.inErinnerung ? t('In Erinnerung') : null
  }
}

export function altText(foto) {
  const datum = formatDateLong(foto.datum)
  return datum ? t('Foto von {name}, {datum}', { name: foto.tierName, datum }) : t('Foto von {name}', { name: foto.tierName })
}

// Dieselbe Datei bleibt dasselbe Foto, auch wenn das Gerät eine frisch signierte Adresse bekommt.
export function fotoKey(foto) {
  return String(foto?.url || '').split('?')[0]
}

function shuffle(list, random) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Reihenfolge der Diashow: ohne Mischen wie vom Server (neueste zuerst), „Heute vor … Jahren“ auf Wunsch vorn.
export function orderFotos(fotos, { mischen, heuteZuerst, today = new Date(), random = Math.random }) {
  const onThisDay = heuteZuerst ? fotos.filter((foto) => yearsAgo(foto.datum, today)) : []
  const rest = fotos.filter((foto) => !onThisDay.includes(foto))
  return [...onThisDay, ...(mischen ? shuffle(rest, random) : rest)]
}

export function isNight(date = new Date()) {
  const hour = date.getHours()
  return hour >= NIGHT_FROM_HOUR || hour < NIGHT_UNTIL_HOUR
}

export function formatClock(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return {
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    date:
      getLang() === 'en'
        ? `${WEEKDAYS_EN[date.getDay()]}, ${date.getDate()} ${monthNames()[date.getMonth()]}`
        : `${WEEKDAYS[date.getDay()]}, ${date.getDate()}. ${monthNames()[date.getMonth()]}`
  }
}

// JJJJ-MM-TT des Tages (lokal) - Abhängigkeit für Reihenfolgen, die nur einmal am Tag neu entstehen sollen.
export function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

// Erstes Foto für die Karte auf Start (Tierfoto oder Foto einer Erinnerung) - null, wenn es noch keins gibt.
export function firstFramePhoto(dogs, entries) {
  const dogPhoto = (dogs || []).find((dog) => dog.foto_url)?.foto_url
  if (dogPhoto) return dogPhoto
  return (entries || []).find((entry) => entry.foto_urls?.length)?.foto_urls[0] || null
}
