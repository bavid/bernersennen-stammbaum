// Reine Hilfen für die Anfragen (Phase N): die öffentlichen Formulare "Noch keinen Gutschein?" (RequestVoucherForm)
// und "Partner-Zugang anfragen" (RequestPartnerForm) sowie die Admin-Liste (AdminAnfragen, AdminAnfrageAssign).
// Spiegeln server/lib/anfragen.js (validateAnfrage) und server/lib/anfrageGutschein.js (welcher Stapel passt).

export const ANFRAGE_TYP = Object.freeze({ gutschein: 'gutschein', partner: 'partner' })
export const ANFRAGE_STATUS = Object.freeze({ offen: 'offen', erledigt: 'erledigt', abgelehnt: 'abgelehnt' })
// Sprungmarke des Formulars "Partner-Zugang anfragen" auf /partner-werden (PartnerInfoPage, LoginPartnerEntry).
export const PARTNER_REQUEST_ANCHOR = 'anfragen'

export const MAX_NAME_LENGTH = 80
export const MAX_EMAIL_LENGTH = 120
export const MAX_FIRMA_LENGTH = 120
export const MAX_NACHRICHT_LENGTH = 1000
export const MAX_NOTIZ_LENGTH = 1000

// Format wie server/lib/partners.js (EMAIL_RE, kein ?/&) plus server/lib/anfragen.js EMAIL_UNSAFE_RE.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_UNSAFE_RE = /[<>",;%`\\?&]/
const HTML_RE = /[<>]/
const PLZ_RE = /^\d{5}$/

const HTML_MESSAGE = 'Bitte nur reinen Text eingeben (kein HTML).'
// Anrede wie auf der jeweiligen Seite: Besucher der Login-Seite mit "du", Partner mit "ihr".
const EMAIL_MESSAGES = Object.freeze({
  [ANFRAGE_TYP.gutschein]: {
    missing: 'Bitte gib deine E-Mail-Adresse an – nur so können wir dir antworten.',
    invalid: 'Bitte gib eine gültige E-Mail-Adresse an.'
  },
  [ANFRAGE_TYP.partner]: {
    missing: 'Bitte gebt eure E-Mail-Adresse an – nur so können wir euch antworten.',
    invalid: 'Bitte gebt eine gültige E-Mail-Adresse an.'
  }
})
export const FIRMA_MISSING_MESSAGE = 'Bitte gebt den Namen eurer Hundeschule, eures Tierheims oder Geschäfts an.'
export const PARTNER_TYP_MISSING_MESSAGE = 'Bitte wählt, was für ein Angebot ihr habt.'
export const PLZ_MESSAGE = 'Die Postleitzahl hat fünf Ziffern.'
export const RATE_LIMIT_MESSAGE = 'Zu viele Anfragen in kurzer Zeit – bitte später noch einmal versuchen.'
const FALLBACK_MESSAGE = 'Die Anfrage konnte gerade nicht verschickt werden – bitte später noch einmal versuchen.'

export const EMPTY_VOUCHER_REQUEST = Object.freeze({ name: '', email: '', nachricht: '' })
export const EMPTY_PARTNER_REQUEST = Object.freeze({ firma: '', partnerTyp: '', plz: '', name: '', email: '', nachricht: '' })

function textError(value, maxLength, label) {
  const text = value.trim()
  if (text.length > maxLength) return `${label} darf höchstens ${maxLength} Zeichen haben.`
  if (HTML_RE.test(text)) return HTML_MESSAGE
  return null
}

function emailError(value, messages) {
  const email = value.trim()
  if (!email) return messages.missing
  if (email.length > MAX_EMAIL_LENGTH || EMAIL_UNSAFE_RE.test(email) || !EMAIL_RE.test(email)) return messages.invalid
  return null
}

function partnerErrors(form) {
  const plz = form.plz.trim()
  return [
    ['firma', form.firma.trim() ? textError(form.firma, MAX_FIRMA_LENGTH, 'Der Name') : FIRMA_MISSING_MESSAGE],
    ['partnerTyp', form.partnerTyp ? null : PARTNER_TYP_MISSING_MESSAGE],
    ['plz', !plz || PLZ_RE.test(plz) ? null : PLZ_MESSAGE]
  ]
}

// Was der Server sicher ablehnen würde, gleich am Feld melden: { feld: meldung }. Ob es die Domain der E-Mail gibt,
// prüft nur der Server (DNS).
export function requestClientErrors(form, typ) {
  const entries = [
    ...(typ === ANFRAGE_TYP.partner ? partnerErrors(form) : []),
    ['name', textError(form.name, MAX_NAME_LENGTH, 'Der Name')],
    ['email', emailError(form.email, EMAIL_MESSAGES[typ] || EMAIL_MESSAGES[ANFRAGE_TYP.gutschein])],
    ['nachricht', textError(form.nachricht, MAX_NACHRICHT_LENGTH, 'Die Nachricht')]
  ]
  return Object.fromEntries(entries.filter(([, message]) => message))
}

// Body für POST /api/public/anfragen (ohne den Honigtopf website) - leere freiwillige Felder fallen weg.
export function toRequestPayload(form, typ) {
  const optional = (value) => value.trim() || undefined
  const base = { typ, name: optional(form.name), email: form.email.trim(), nachricht: optional(form.nachricht) }
  if (typ !== ANFRAGE_TYP.partner) return base
  return { ...base, firma: form.firma.trim(), partnerTyp: form.partnerTyp, plz: optional(form.plz) }
}

// Server-Meldung (400) -> Formularfeld, über den stabilen Satzanfang. Die Firma teilt sich im Server die
// Beschriftung "Der Name" - ihre Längengrenze (120) unterscheidet sie vom Namen (80).
const ERROR_FIELDS = [
  [/E-Mail-Adresse/, 'email'],
  [new RegExp(`^Der Name darf höchstens ${MAX_FIRMA_LENGTH} `), 'firma'],
  [/^Der Name /, 'name'],
  [/^Bitte gebt den Namen eurer /, 'firma'],
  [/^Bitte wählt aus der Liste/, 'partnerTyp'],
  [/Postleitzahl/, 'plz'],
  [/^Die Nachricht /, 'nachricht']
]

export function requestErrorField(err, fields) {
  if (err?.status !== 400 || typeof err.message !== 'string') return null
  const field = ERROR_FIELDS.find(([pattern]) => pattern.test(err.message))?.[1]
  return field && fields.includes(field) ? field : null
}

// Meldung für das Banner oben: 429 mit eigenem Satz (auch ohne JSON vom Proxy), sonst die Server-Meldung.
export function requestErrorMessage(err) {
  if (err?.status === 429) return RATE_LIMIT_MESSAGE
  return err?.message || FALLBACK_MESSAGE
}

// --- Admin -----------------------------------------------------------------------------------------

// Wie server/lib/anfrageGutschein.js: nur eigene Stapel des Admins (kind 'admin' - keine Partner-, Weitergabe- oder
// Demo-Stapel), der Zweck passend zur Anfrage.
const ASSIGNABLE_KINDS = ['admin']
const ZWECK_CHRONIK = 'chronik'
const ZWECK_PARTNERZUGANG = 'partnerzugang'
const ZWECK_FOR_TYP = Object.freeze({ [ANFRAGE_TYP.gutschein]: ZWECK_CHRONIK, [ANFRAGE_TYP.partner]: ZWECK_PARTNERZUGANG })
// Ist der zugewiesene Gutschein zurückgezogen oder abgelaufen, darf die Anfrage einen neuen bekommen.
const REASSIGNABLE_STATUS = ['widerrufen', 'abgelaufen']

// Frei für eine Zuweisung: offen und noch keiner Anfrage zugewiesen (GET /api/admin/voucher-batches: open, assigned).
export function freeCodes(batch) {
  return Math.max(0, (Number(batch?.open) || 0) - (Number(batch?.assigned) || 0))
}

// Stapel, aus denen sich dieser Anfrage ein Code zuweisen lässt: eigener Admin-Stapel, Zweck passt (ältere Stapel
// ohne zweck sind Kunden-Gutscheine), mindestens ein freier Code, eine Typ-Vorgabe passt zur Anfrage. Ein an einen
// bestehenden Partner gebundener Partner-Zugang (partner_name) gehört diesem Partner und ist nie frei.
export function assignableBatches(batches, anfrage) {
  const zweck = ZWECK_FOR_TYP[anfrage?.typ]
  if (!zweck || !Array.isArray(batches)) return []
  return batches.filter((batch) => {
    if (!ASSIGNABLE_KINDS.includes(batch.kind) || (batch.zweck || ZWECK_CHRONIK) !== zweck) return false
    if (freeCodes(batch) === 0) return false
    if (zweck === ZWECK_PARTNERZUGANG && batch.partner_name) return false
    return !(batch.partnerTyp && anfrage.partnerTyp && batch.partnerTyp !== anfrage.partnerTyp)
  })
}

// "Gutschein zuweisen" anbieten? Nicht für abgelehnte Anfragen und nicht, solange ein offener oder eingelöster
// Gutschein zugewiesen ist.
export function canAssign(anfrage) {
  if (!anfrage || anfrage.status === ANFRAGE_STATUS.abgelehnt) return false
  return !anfrage.gutschein || REASSIGNABLE_STATUS.includes(anfrage.gutschein.status)
}

function greeting(anfrage) {
  if (anfrage.name) return `Hallo ${anfrage.name},`
  return anfrage.typ === ANFRAGE_TYP.partner ? 'Hallo zusammen,' : 'Hallo,'
}

// Vorformulierte E-Mail zum Kopieren (wir versenden keine E-Mails): { subject, body }. link: {origin}/v#CODE -
// der Code steht hinter der Raute (lib/voucherPrint.js voucherUrl), die Einlöse-Seite füllt ihn ein.
export function assignmentMail({ anfrage, code, link, appName }) {
  if (anfrage.typ === ANFRAGE_TYP.partner) {
    return {
      subject: `Euer Partner-Zugang für ${appName}`,
      body: [
        greeting(anfrage),
        '',
        `hier ist euer Partner-Zugang für ${appName}: ${code}`,
        '',
        `Löst ihn unter ${link} ein und richtet dort euer Partner-Profil ein – das ist kostenlos.`,
        '',
        'Viele Grüße'
      ].join('\n')
    }
  }
  return {
    subject: `Dein Gutschein für ${appName}`,
    body: [
      greeting(anfrage),
      '',
      `hier ist dein Gutschein für ${appName}: ${code}`,
      '',
      `Einlösen unter ${link} – dort legst du deine eigene Chronik an.`,
      '',
      'Viele Grüße'
    ].join('\n')
  }
}

// mailto:-Link mit Betreff und Text (urlencodiert). Die Adresse selbst ebenfalls kodiert - nur das @ bleibt stehen.
export function mailtoHref(email, { subject, body } = {}) {
  const address = encodeURIComponent(email || '').replace(/%40/g, '@')
  const params = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean)
  return `mailto:${address}${params.length ? `?${params.join('&')}` : ''}`
}
