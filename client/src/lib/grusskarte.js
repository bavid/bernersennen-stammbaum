// „Grüße-Karte zum Teilen“ (Plan 2027): aus einer Erinnerung ein Bild 1080 × 1350 (Hochformat für WhatsApp/Facebook).
// Hier nur reine Funktionen ohne DOM - was auf die Karte kommt. Gezeichnet wird in lib/grusskarteCanvas.js, ganz auf dem
// Gerät: nichts wird hochgeladen, keine fremden Dienste, kein Tracking.
import { formatDateLong } from './dates.js'
import { printBaseUrl } from './voucherPrint.js'

export const CARD_WIDTH = 1080
export const CARD_HEIGHT = 1350
export const TITLE_MAX = 80
export const LINE_MAX = 140
const ELLIPSIS = '…'
// Der QR-Code führt auf die öffentliche Startseite der Plattform.
const START_PATH = '/'

// Kürzt auf höchstens max Zeichen, möglichst an einer Wortgrenze, mit „…“.
export function truncate(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  const base = space > max * 0.6 ? cut.slice(0, space) : cut
  return `${base.replace(/[\s.,;:–-]+$/, '')}${ELLIPSIS}`
}

// Erster Satz eines Textes (bis . ! ? oder Zeilenende).
export function firstSentence(text) {
  const clean = String(text || '').trim()
  if (!clean) return ''
  const firstLine = clean.split(/\n/)[0].trim()
  const match = firstLine.match(/^.+?[.!?](?=\s|$)/)
  return (match ? match[0] : firstLine).trim()
}

// Nur Fotos vom eigenen Ursprung (/uploads/…): fremde Bilder würden die Zeichenfläche sperren (tainted canvas).
export function isSameOriginPhoto(url, origin) {
  if (typeof url !== 'string' || !url.trim() || !origin) return false
  try {
    return new URL(url, origin).origin === new URL(origin).origin
  } catch {
    return false
  }
}

// Dateiname ohne Sonderzeichen: „gruesse-benno-2024-05-01.png“
export function cardFileName(dogName, datum) {
  const slug = String(dogName || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ['gruesse', slug, (datum || '').slice(0, 10)].filter(Boolean).join('-') + '.png'
}

// Was auf die Karte kommt. entry: Chronik-Eintrag (titel, text, datum, foto_urls, privat); publicUrl: PUBLIC_URL aus
// /api/config (oder null - dann gilt origin).
export function grussKarteModel({ entry, dogName, publicUrl, origin }) {
  const photo = (entry.foto_urls || []).find((url) => isSameOriginPhoto(url, origin)) || null
  const sentence = firstSentence(entry.text)
  const title = truncate(entry.titel || sentence, TITLE_MAX)
  const line = entry.titel ? truncate(sentence, LINE_MAX) : ''
  const base = printBaseUrl(publicUrl, origin)
  return {
    dogName: truncate(dogName, 40),
    title,
    line: line === title ? '' : line,
    date: formatDateLong(entry.datum),
    photoUrl: photo,
    qrUrl: `${base}${START_PATH}`,
    host: hostOf(base),
    isPrivate: Boolean(entry.privat),
    fileName: cardFileName(dogName, entry.datum)
  }
}

function hostOf(base) {
  try {
    return new URL(base).host
  } catch {
    return base
  }
}
