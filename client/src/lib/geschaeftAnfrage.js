import { t, locale } from './i18n/index.js'
import { ANFRAGE_TYP, MAX_EMAIL_LENGTH, MAX_FIRMA_LENGTH, MAX_NACHRICHT_LENGTH, MAX_NAME_LENGTH } from './anfragen.js'

// Geschäftsanfrage auf /partner-werden (components/geschaeft/): Felder, Schritte, Prüfung im Client und Body für
// POST /api/public/anfragen (typ 'partner' mit geschaeft). Spiegelt server/lib/geschaeftAnfragen.js und
// server/lib/terminvorschlaege.js. Dazu für den Admin: Beschriftungen der Vorschläge und der Bestätigungstext.

export const MAX_ORT_LENGTH = 80
export const MAX_TELEFON_LENGTH = 30
export const MAX_WEBSEITE_LENGTH = 200
export const MAX_TERMINE = 3
export const MAX_TAGE_VORAUS = 60
export const MAX_BESTAETIGUNG_NOTIZ_LENGTH = 300
const DAY_MS = 24 * 60 * 60 * 1000
const SONNTAG = 0

export const GESCHAEFT_SUCCESS = 'Danke! Wir melden uns per E-Mail – meist innerhalb von 2 Werktagen.'

export const ART_OPTIONS = Object.freeze([
  { value: 'tierheim', label: 'Tierheim' },
  { value: 'hundeschule', label: 'Hundeschule' },
  { value: 'hundesalon', label: 'Hundesalon' },
  { value: 'betreuung', label: 'Betreuung' },
  { value: 'tierarzt', label: 'Tierarzt' },
  { value: 'sonstige', label: 'Sonstiges' }
])

export const ZEITFENSTER_OPTIONS = Object.freeze([
  { value: 'vormittag', label: 'Vormittag (9–12 Uhr)' },
  { value: 'mittag', label: 'Mittag (12–15 Uhr)' },
  { value: 'nachmittag', label: 'Nachmittag (15–18 Uhr)' },
  { value: 'abend', label: 'Abend (18–20 Uhr)' }
])

export const KANAL_OPTIONS = Object.freeze([
  { value: '', label: 'Egal' },
  { value: 'telefon', label: 'Telefon' },
  { value: 'video', label: 'Video' }
])

export const EMPTY_TERMIN = Object.freeze({ datum: '', zeitfenster: '', kanal: '' })

export const EMPTY_GESCHAEFT = Object.freeze({
  firma: '',
  art: '',
  plz: '',
  ort: '',
  webseite: '',
  bundesweit: false,
  name: '',
  email: '',
  telefon: '',
  nachricht: '',
  termine: Object.freeze([EMPTY_TERMIN]),
  einwilligung: false
})

// Drei kurze Schritte am Handy; am Desktop dieselben Gruppen untereinander.
export const STEPS = Object.freeze([
  { key: 'betrieb', title: 'Betrieb', fields: ['firma', 'art', 'plz', 'ort', 'webseite'] },
  { key: 'kontakt', title: 'Kontakt', fields: ['name', 'email', 'telefon', 'nachricht'] },
  { key: 'termin', title: 'Termine', fields: ['termine', 'termin-0', 'termin-1', 'termin-2', 'einwilligung'] }
])

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_UNSAFE_RE = /[<>",;%`\\?&]/
const HTML_RE = /[<>]/
const PLZ_RE = /^\d{5}$/
const TELEFON_RE = /^\+?[\d\s/()-]{5,30}$/

export const MESSAGES = Object.freeze({
  firma: 'Bitte gebt den Namen eures Betriebs an.',
  art: 'Bitte wählt, was für ein Angebot ihr habt.',
  plz: 'Bitte gebt eure Postleitzahl an (fünf Ziffern).',
  ort: 'Bitte gebt euren Ort an.',
  webseite: 'Die Webseite muss mit https:// beginnen.',
  name: 'Bitte gebt eine Ansprechperson an.',
  emailMissing: 'Bitte gebt eure E-Mail-Adresse an – nur so können wir euch antworten.',
  emailInvalid: 'Bitte gebt eine gültige E-Mail-Adresse an.',
  telefon: 'Die Telefonnummer ist ungültig.',
  termin: 'Bitte wählt Tag und Zeitfenster.',
  doppelt: 'Diesen Termin habt ihr schon vorgeschlagen.',
  termine: 'Bitte schlagt mindestens einen Termin vor.',
  einwilligung: 'Bitte bestätigt, dass wir euch für diese Anfrage kontaktieren dürfen.',
  html: 'Bitte nur reinen Text eingeben (kein HTML).'
})

function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

// Heute im Kalender von Berlin (wie der Server), als YYYY-MM-DD.
export function heuteBerlin(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// Wählbare Tage: morgen bis in MAX_TAGE_VORAUS Tagen, ohne Sonntage. [{ value: 'YYYY-MM-DD', label: 'Di., 13.10.' }]
export function terminTage(now = Date.now()) {
  const start = Date.parse(`${heuteBerlin(now)}T00:00:00Z`)
  const format = new Intl.DateTimeFormat(locale(), { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' })
  return Array.from({ length: MAX_TAGE_VORAUS }, (_, i) => start + (i + 1) * DAY_MS)
    .filter((ms) => new Date(ms).getUTCDay() !== SONNTAG)
    .map((ms) => ({ value: isoDate(ms), label: format.format(ms) }))
}

function textTooLong(value, maxLength) {
  const text = value.trim()
  if (HTML_RE.test(text)) return t(MESSAGES.html)
  if (text.length > maxLength) return t('{label} darf höchstens {max} Zeichen haben.', { label: t('Der Text'), max: maxLength })
  return null
}

function required(value, maxLength, message) {
  return value.trim() ? textTooLong(value, maxLength) : t(message)
}

function emailError(value) {
  const email = value.trim()
  if (!email) return t(MESSAGES.emailMissing)
  if (email.length > MAX_EMAIL_LENGTH || EMAIL_UNSAFE_RE.test(email) || !EMAIL_RE.test(email)) return t(MESSAGES.emailInvalid)
  return null
}

function webseiteError(value) {
  const text = value.trim()
  if (!text) return null
  try {
    const url = new URL(text)
    return url.protocol === 'https:' && url.hostname.includes('.') && text.length <= MAX_WEBSEITE_LENGTH ? null : t(MESSAGES.webseite)
  } catch {
    return t(MESSAGES.webseite)
  }
}

function terminErrors(termine, now) {
  const erlaubt = new Set(terminTage(now).map((tag) => tag.value))
  const gesehen = new Set()
  return termine.map((termin, i) => {
    if (!erlaubt.has(termin.datum) || !termin.zeitfenster) return [`termin-${i}`, t(MESSAGES.termin)]
    const key = `${termin.datum}|${termin.zeitfenster}`
    const doppelt = gesehen.has(key)
    gesehen.add(key)
    return [`termin-${i}`, doppelt ? t(MESSAGES.doppelt) : null]
  })
}

// { feld: meldung } für alle Felder - oder nur die eines Schritts (stepKey).
export function geschaeftErrors(form, { stepKey, now = Date.now() } = {}) {
  const telefon = form.telefon.trim()
  const entries = [
    ['firma', required(form.firma, MAX_FIRMA_LENGTH, MESSAGES.firma)],
    ['art', ART_OPTIONS.some((option) => option.value === form.art) ? null : t(MESSAGES.art)],
    ['plz', PLZ_RE.test(form.plz.trim()) ? null : t(MESSAGES.plz)],
    ['ort', required(form.ort, MAX_ORT_LENGTH, MESSAGES.ort)],
    ['webseite', webseiteError(form.webseite)],
    ['name', required(form.name, MAX_NAME_LENGTH, MESSAGES.name)],
    ['email', emailError(form.email)],
    ['telefon', !telefon || (telefon.length <= MAX_TELEFON_LENGTH && TELEFON_RE.test(telefon)) ? null : t(MESSAGES.telefon)],
    ['nachricht', textTooLong(form.nachricht, MAX_NACHRICHT_LENGTH)],
    ['termine', form.termine.length ? null : t(MESSAGES.termine)],
    ...terminErrors(form.termine, now),
    ['einwilligung', form.einwilligung ? null : t(MESSAGES.einwilligung)]
  ]
  const fields = stepKey ? STEPS.find((step) => step.key === stepKey)?.fields || [] : null
  return Object.fromEntries(entries.filter(([field, message]) => message && (!fields || fields.includes(field))))
}

export function stepOfField(field) {
  const index = STEPS.findIndex((step) => step.fields.includes(field))
  return index < 0 ? 0 : index
}

// Body für POST /api/public/anfragen (ohne den Honigtopf website) - leere freiwillige Felder fallen weg.
export function toGeschaeftPayload(form) {
  const optional = (value) => value.trim() || undefined
  return {
    typ: ANFRAGE_TYP.partner,
    firma: form.firma.trim(),
    name: form.name.trim(),
    email: form.email.trim(),
    plz: form.plz.trim(),
    nachricht: optional(form.nachricht),
    geschaeft: {
      art: form.art,
      ort: form.ort.trim(),
      telefon: optional(form.telefon),
      webseite: optional(form.webseite),
      bundesweit: Boolean(form.bundesweit),
      einwilligung: form.einwilligung === true,
      termine: form.termine.map((termin) => ({ datum: termin.datum, zeitfenster: termin.zeitfenster, kanal: termin.kanal || undefined }))
    }
  }
}

// Server-Meldung (400, schon übersetzt von api.js) -> Feld. Muster auf dem deutschen Satz bzw. seiner Übersetzung.
const SERVER_FIELDS = Object.freeze([
  ['Bitte gebt den Namen eurer Hundeschule, eures Tierheims oder Geschäfts an.', 'firma'],
  ['Bitte wählt aus der Liste, was für ein Angebot ihr habt.', 'art'],
  ['Diese Postleitzahl kennen wir nicht', 'plz'],
  ['Bitte gebt eure Postleitzahl an.', 'plz'],
  ['Bitte gebt euren Ort an.', 'ort'],
  ['Die Webseite muss mit https:// beginnen.', 'webseite'],
  ['Bitte gebt eine Ansprechperson an.', 'name'],
  ['Die E-Mail-Adresse ist ungültig', 'email'],
  ['Diese E-Mail-Adresse scheint es nicht zu geben.', 'email'],
  ['Bitte gebt eure E-Mail-Adresse an – nur so können wir euch antworten.', 'email'],
  ['Die Telefonnummer ist ungültig.', 'telefon'],
  ['Bitte bestätigt, dass wir euch für diese Anfrage kontaktieren dürfen.', 'einwilligung'],
  [`Ein Termin muss zwischen morgen und in ${MAX_TAGE_VORAUS} Tagen liegen, Montag bis Samstag.`, 'termin-0'],
  [`Bitte schlagt mindestens 1 und höchstens ${MAX_TERMINE} Termine vor.`, 'termine'],
  ['Bitte schlagt jeden Termin nur einmal vor.', 'termin-0']
])

export function geschaeftErrorField(err) {
  if (err?.status !== 400 || typeof err.message !== 'string') return null
  return SERVER_FIELDS.find(([message]) => err.message === message || err.message === t(message))?.[1] || null
}

// --- Admin (deutsch, wie die übrige Admin-Oberfläche) ---------------------------------------------

const WOCHENTAGE = Object.freeze(['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'])

function optionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || value
}

export function artLabel(art) {
  return optionLabel(ART_OPTIONS, art)
}

// "Dienstag, 13.10.2026 · Vormittag (9–12 Uhr) · Telefon"
export function terminLabel(termin) {
  const [jahr, monat, tag] = termin.datum.split('-')
  const wochentag = WOCHENTAGE[new Date(`${termin.datum}T00:00:00Z`).getUTCDay()]
  const teile = [`${wochentag}, ${tag}.${monat}.${jahr}`, optionLabel(ZEITFENSTER_OPTIONS, termin.zeitfenster)]
  if (termin.kanal) teile.push(optionLabel(KANAL_OPTIONS, termin.kanal))
  return teile.join(' · ')
}

const KANAL_SATZ = Object.freeze({ telefon: 'Wir rufen euch an.', video: 'Den Link zum Video-Gespräch schicken wir euch vorher.' })

// Vorformulierte Bestätigung zum Kopieren (die App verschickt keine E-Mails): { subject, body } oder null.
export function bestaetigungsMail({ anfrage, appName }) {
  const geschaeft = anfrage?.geschaeft
  const termin = geschaeft?.bestaetigt ? geschaeft.termine[geschaeft.bestaetigt.index] : null
  if (!termin) return null
  const zeilen = [
    anfrage.name ? `Hallo ${anfrage.name},` : 'Hallo zusammen,',
    '',
    `danke für eure Anfrage bei ${appName}! Gern bestätigen wir euch diesen Termin für ein erstes Gespräch:`,
    '',
    terminLabel(termin),
    '',
    KANAL_SATZ[termin.kanal] || 'Wir melden uns zur vereinbarten Zeit.',
    ...(geschaeft.bestaetigt.notiz ? ['', geschaeft.bestaetigt.notiz] : []),
    '',
    'Passt es doch nicht? Antwortet einfach auf diese E-Mail.',
    '',
    'Viele Grüße'
  ]
  return { subject: `Euer Termin mit ${appName}`, body: zeilen.join('\n') }
}
