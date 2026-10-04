// Reine Hilfen für "Schreib uns" (ContactPartnerForm) - spiegeln server/lib/partnerMessages.js
// (validateContactMessage) und die Antworten von POST /api/public/partners/:slug/contact.

export const MIN_NACHRICHT_LENGTH = 10
export const MAX_NACHRICHT_LENGTH = 2000
export const MAX_NAME_LENGTH = 80

export const RATE_LIMIT_MESSAGE = 'Zu viele Nachrichten – bitte später noch einmal.'
export const NACHRICHT_LENGTH_MESSAGE = `Die Nachricht muss ${MIN_NACHRICHT_LENGTH} bis ${MAX_NACHRICHT_LENGTH} Zeichen haben.`
export const REACHABLE_MESSAGE = 'Bitte gib eine E-Mail-Adresse oder Telefonnummer an, damit du eine Antwort bekommst.'
export const UNAVAILABLE_MESSAGE = 'Über dieses Formular lassen sich gerade keine Nachrichten verschicken.'
const HTML_MESSAGE = 'Bitte nur reinen Text eingeben (kein HTML).'

// Feedback-Runde: Portal und Steckbrief nennen keine "Demo" - der Hinweis am gesperrten "Schreib uns" eines Demo-Partners
// bleibt neutral.
export const DEMO_CONTACT_HINT = 'Hier werden keine Nachrichten verschickt.'

// Ist "Schreib uns" für diesen Partner da? Das meldet allein der Server als kontaktformular: true (Formular
// an, Postfach vorhanden) - auf dem Portal und am Tierheim eines Steckbriefs. Demo-Partner melden
// kontaktformular: false und kontaktformularDemo: true: der Knopf ist dann sichtbar, aber gesperrt.
// 'available', 'demo' oder 'unavailable' (auch ohne Angabe).
export function contactFormState(partner) {
  if (partner?.kontaktformular === true) return 'available'
  if (partner?.kontaktformularDemo === true) return 'demo'
  return 'unavailable'
}

// Knopf zeigen (bei 'demo' und in der Kundensicht deaktiviert, siehe ContactPartnerButton)?
export function showContactForm(partner) {
  return contactFormState(partner) !== 'unavailable'
}

export const EMPTY_CONTACT_FORM = Object.freeze({ name: '', email: '', telefon: '', nachricht: '' })

const HTML_RE = /[<>]/

// Was der Server sicher ablehnen würde, gleich am Feld melden. Die Formate von E-Mail und Telefon prüft
// nur der Server (dieselben Regeln wie bei den Partner-Kontaktdaten).
export function contactClientErrors(form) {
  const errors = {}
  if (form.name.trim().length > MAX_NAME_LENGTH) errors.name = `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen haben.`
  else if (HTML_RE.test(form.name)) errors.name = HTML_MESSAGE
  if (!form.email.trim() && !form.telefon.trim()) errors.email = REACHABLE_MESSAGE
  const length = form.nachricht.trim().length
  if (length < MIN_NACHRICHT_LENGTH || length > MAX_NACHRICHT_LENGTH) errors.nachricht = NACHRICHT_LENGTH_MESSAGE
  else if (HTML_RE.test(form.nachricht)) errors.nachricht = HTML_MESSAGE
  return errors
}

export function toContactPayload(form) {
  return {
    name: form.name.trim() || undefined,
    email: form.email.trim() || undefined,
    telefon: form.telefon.trim() || undefined,
    nachricht: form.nachricht.trim()
  }
}

// Server-Meldung (400) -> Formularfeld, über den stabilen Satzanfang.
const CONTACT_ERROR_FIELDS = [
  [/^Die Nachricht /, 'nachricht'],
  [/^Der Name /, 'name'],
  [/^Die E-Mail-Adresse /, 'email'],
  [/^Die Telefonnummer /, 'telefon'],
  [/E-Mail-Adresse oder Telefonnummer/, 'email']
]

export function contactErrorField(err) {
  if (err?.status !== 400 || typeof err.message !== 'string') return null
  return CONTACT_ERROR_FIELDS.find(([pattern]) => pattern.test(err.message))?.[1] ?? null
}

// Meldung für das Banner oben: 429 und 404 (Formular aus oder kein Postfach) mit eigenem Satz; sonst die (freundliche) Server-Meldung, z. B.
// "In der Demo werden keine Nachrichten verschickt." (403).
export function contactErrorMessage(err) {
  if (err?.status === 429) return RATE_LIMIT_MESSAGE
  if (err?.status === 404) return UNAVAILABLE_MESSAGE
  return err?.message || 'Die Nachricht konnte gerade nicht verschickt werden.'
}
