// „Kosten & Reserve“: Spiegel der Spendenrechnung (server/lib/finanzierungVerteilung.js) und die Texte dazu - für die
// öffentliche Seite /finanzierung (FinanzierungStand, FinanzierungRegel, RuecklageAnzeige), die Admin-Karte
// „Kosten & Reserve“ (AdminFinanzierungKosten) und später die Präsentation. Reine Funktionen; Beträge in ganzen Cent.

import { formatEuroCents } from './discover.js'
import { centsToEuroInput, parseEuroToCents } from './euro.js'

// Wie server/lib/finanzierungVerteilung.js RUECKLAGE_STUFEN: ab so vielen gedeckten Jahren gilt der Anteil.
export const RUECKLAGE_STUFEN = Object.freeze([
  { abJahren: 3, prozent: 0 },
  { abJahren: 2, prozent: 5 },
  { abJahren: 1, prozent: 10 },
  { abJahren: 0, prozent: 20 }
])

// Die Regel des Betreibers in einfachen Worten - genau so auf der Seite.
export const REGEL_TEXT =
  'Vom Überschuss legen wir anfangs 20 % für die Server-Zukunft zurück, damit wir im Voraus sammeln. Reicht die Rücklage für ein Jahr, sind es 10 %, für zwei Jahre 5 %, ab drei Jahren geht alles an Spenden.'

// Die Stufen als Liste (aufsteigend) - für die kleine Übersicht neben dem Text.
export const REGEL_STUFEN = Object.freeze([
  { label: 'Rücklage unter 1 Jahr', prozent: 20 },
  { label: 'ab 1 Jahr', prozent: 10 },
  { label: 'ab 2 Jahren', prozent: 5 },
  { label: 'ab 3 Jahren', prozent: 0 }
])

export function ruecklageAnteilProzent(ruecklageCents, kostenProJahrCents) {
  if (!(kostenProJahrCents > 0)) return 0
  const jahre = Math.max(0, ruecklageCents) / kostenProJahrCents
  return RUECKLAGE_STUFEN.find((stufe) => jahre >= stufe.abJahren).prozent
}

// Wie server verteileUeberschuss: { ueberschussCents, anteilProzent, reserveCents, gespendetCents }.
export function verteileUeberschuss({ spendenCents, kostenCents, ruecklageCents = 0, kostenProJahrCents }) {
  const ueberschussCents = Math.max(0, (spendenCents || 0) - (kostenCents || 0))
  const anteilProzent = ruecklageAnteilProzent(ruecklageCents, kostenProJahrCents)
  const reserveCents = Math.round((ueberschussCents * anteilProzent) / 100)
  return { ueberschussCents, anteilProzent, reserveCents, gespendetCents: ueberschussCents - reserveCents }
}

const JAHRE = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 })

// 0.4 -> „0,4 Jahre“, 1 -> „1 Jahr“; null (keine Jahreskosten) -> null.
export function formatJahre(jahre) {
  if (typeof jahre !== 'number' || !Number.isFinite(jahre)) return null
  const zahl = JAHRE.format(jahre)
  return `${zahl} ${zahl === '1' ? 'Jahr' : 'Jahre'}`
}

// „Rücklage: deckt 0,4 Jahre“ - ohne Jahreskosten ein ruhiger Satz statt einer Zahl.
export function ruecklageText(ruecklage) {
  const jahre = formatJahre(ruecklage?.jahreGedeckt)
  return jahre ? `Rücklage: deckt ${jahre}` : 'Rücklage: noch keine laufenden Kosten'
}

// Füllstand der Anzeige in Prozent: drei Jahre = voll (ab dann geht alles an Spenden).
export function ruecklageFuellstand(jahreGedeckt) {
  if (typeof jahreGedeckt !== 'number' || !Number.isFinite(jahreGedeckt)) return 100
  return Math.min(100, Math.max(0, (jahreGedeckt / 3) * 100))
}

// Öffentlich, ehrlich und ruhig.
export function saldoText(saldoCents) {
  if (saldoCents < 0) return `Zurzeit tragen wir ${formatEuroCents(-saldoCents)} selbst.`
  if (saldoCents > 0) return `Zurzeit liegen wir ${formatEuroCents(saldoCents)} im Plus.`
  return 'Spenden und Kosten halten sich gerade die Waage.'
}

// Im Admin direkt angesprochen.
export function adminSaldoText(saldoCents) {
  if (saldoCents < 0) return `Du bist ${formatEuroCents(-saldoCents)} im Minus`
  if (saldoCents > 0) return `Du bist ${formatEuroCents(saldoCents)} im Plus`
  return 'Ausgeglichen'
}

export function prognoseText(prognoseJahresendeCents) {
  if (prognoseJahresendeCents < 0) return `Bei gleichbleibenden Kosten fehlen bis Jahresende ${formatEuroCents(-prognoseJahresendeCents)}.`
  return `Bei gleichbleibenden Kosten bleiben bis Jahresende ${formatEuroCents(prognoseJahresendeCents)} übrig.`
}

export const INTERVALL_LABELS = Object.freeze({ monat: 'im Monat', jahr: 'im Jahr' })

// „Server: 23,00 € im Monat“
export function postenText(posten) {
  return `${posten.titel}: ${formatEuroCents(posten.betragCents)} ${INTERVALL_LABELS[posten.intervall] || ''}`.trim()
}

// Hat der Admin überhaupt etwas eingetragen? Sonst zeigt die Seite keine Zahlen.
export function hatFinanzDaten(data) {
  return Boolean(data?.quartale?.length || data?.kosten?.posten?.length)
}

// --- Admin-Formular eines Postens ---------------------------------------------------------------------------------------

// Wie server/lib/finanzierungKosten.js KOSTEN_LIMITS.
export const KOSTEN_LIMITS = Object.freeze({ titel: 80, notiz: 200 })
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function heuteIso(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function kostenForm(posten, now = new Date()) {
  if (!posten) return { titel: '', betrag: '', intervall: 'monat', ab: heuteIso(now), bis: '', notiz: '' }
  return { titel: posten.titel, betrag: centsToEuroInput(posten.betragCents), intervall: posten.intervall, ab: posten.ab, bis: posten.bis || '', notiz: posten.notiz || '' }
}

// { payload, errors } - payload null, sobald ein Feld nicht stimmt.
export function kostenPayload(form) {
  const errors = {}
  const titel = form.titel.trim()
  if (!titel) errors.titel = 'Bitte gib dem Posten einen Titel, z. B. „Server“.'
  else if (titel.length > KOSTEN_LIMITS.titel) errors.titel = `Höchstens ${KOSTEN_LIMITS.titel} Zeichen.`
  const betragCents = parseEuroToCents(form.betrag || '')
  if (!betragCents) errors.betrag = 'Bitte einen Betrag in Euro eingeben, z. B. 23,00.'
  if (!['monat', 'jahr'].includes(form.intervall)) errors.intervall = 'Bitte Monat oder Jahr wählen.'
  if (!ISO_DATE_RE.test(form.ab || '')) errors.ab = 'Bitte ein Datum wählen.'
  const bis = form.bis || null
  if (bis && !ISO_DATE_RE.test(bis)) errors.bis = 'Bitte ein Datum wählen.'
  else if (bis && form.ab && bis < form.ab) errors.bis = 'Das Ende muss nach dem Beginn liegen.'
  const notiz = (form.notiz || '').trim()
  if (notiz.length > KOSTEN_LIMITS.notiz) errors.notiz = `Höchstens ${KOSTEN_LIMITS.notiz} Zeichen.`
  if (Object.keys(errors).length) return { payload: null, errors }
  return { payload: { titel, betragCents, intervall: form.intervall, ab: form.ab, bis, notiz }, errors }
}

// Fehler des Servers ({ error, feld }) auf das Formularfeld.
export function kostenServerFieldError(err) {
  const feld = err?.details?.feld
  if (!feld) return null
  return { field: feld === 'betragCents' ? 'betrag' : feld, message: err.message }
}
