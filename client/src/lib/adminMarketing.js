// Reine Hilfen für die Admin-Pflege von "Entdecken" (Phase 3 Task 5: AdminPromotions, AdminSupport) -
// spiegeln die Felder und Meldungen von server/lib/promotions.js (validatePromotion,
// validateDonationReport) und server/routes/adminMarketing.js.
import { formatDateShort } from './dates.js'
import { centsToEuroInput, parseEuroToCents } from './euro.js'

export const BEREICH_LABELS = {
  hundeschule: 'Hundeschule',
  // Phase P2: eigener Abschnitt "Salon & Betreuung" in "Entdecken" (server BEREICH_VALUES).
  salon: 'Salon & Betreuung',
  begleiter: 'Neue Begleiter',
  futter: 'Futter',
  unterstuetzen: 'Unterstützen'
}

export const KENNZEICHNUNGEN = ['Anzeige', 'Empfehlung', 'Partner']

export const TIERART_LABELS = { hund: 'Hund', katze: 'Katze', anderes: 'Andere Tiere' }

export const FUTTER_HINT = 'Keine Gesundheitsversprechen (z. B. ‚heilt‘, ‚verhindert Krankheiten‘).'
export const EMPFEHLUNG_HINT = 'Nur ohne Gegenleistung – sonst ‚Anzeige‘ wählen.'
export const EMPFOHLEN_VON_REQUIRED = 'Bei einer Empfehlung ist „Empfehlung von“ Pflicht'

// Server-Meldung -> Formularfeld. Der Server liefert nur { error }, deshalb über den (stabilen)
// Satzanfang zugeordnet; die Reihenfolge zählt ("Kennzeichnung muss einer von … Empfehlung …" vor
// "Empfehlung von"). Was nicht passt (z. B. breederGuard), zeigt das Formular oben an.
const PROMOTION_ERROR_FIELDS = [
  [/^Bereich /, 'bereich'],
  [/^Kennzeichnung /, 'kennzeichnung'],
  [/^Der Titel /, 'titel'],
  [/^Der Text /, 'text'],
  [/„Empfehlung von“/, 'empfohlenVon'],
  [/^Der Link/, 'url'],
  [/^Der Start/, 'start'],
  [/^Das Ende/, 'ende'],
  [/^Tierart /, 'tierart'],
  [/^Diesen Partner /, 'partnerId']
]

const DONATION_ERROR_FIELDS = [
  [/^Der Zeitraum /, 'zeitraum'],
  [/^Der Eingang /, 'eingang'],
  [/^Die Kosten /, 'kosten'],
  [/^Der weitergeleitete Betrag /, 'weitergeleitet'],
  [/^Der Empfänger /, 'empfaenger'],
  [/^Der Nachweis-Link/, 'nachweisUrl']
]

function matchErrorField(message, patterns) {
  if (typeof message !== 'string') return null
  return patterns.find(([pattern]) => pattern.test(message))?.[1] ?? null
}

// Einstellungen: der Server nennt das Feld mit seinem Schlüssel ("gofundme_url: ungültige Adresse") -
// hier durch eine lesbare Bezeichnung ersetzt.
const SETTINGS_ERROR_FIELDS = [
  ['gofundme_url', 'gofundmeUrl', 'Der GoFundMe-Link'],
  ['unterstuetzen_text', 'text', 'Der Text']
]

export function settingsError(message) {
  if (typeof message !== 'string') return null
  const match = SETTINGS_ERROR_FIELDS.find(([key]) => message.startsWith(key))
  return match ? { field: match[1], message: `${match[2]}${message.slice(match[0].length)}` } : null
}

export function promotionErrorField(message) {
  return matchErrorField(message, PROMOTION_ERROR_FIELDS)
}

export function donationErrorField(message) {
  return matchErrorField(message, DONATION_ERROR_FIELDS)
}

// --- Empfehlungen/Anzeigen ------------------------------------------------------------------------

// Formularwerte (Strings für die Eingabefelder) aus einer Server-Zeile bzw. leer beim Neuanlegen -
// "Anzeige" als Vorgabe: im Zweifel lieber zu deutlich gekennzeichnet.
export function initialPromotionForm(row) {
  return {
    bereich: row?.bereich || 'hundeschule',
    kennzeichnung: row?.kennzeichnung || 'Anzeige',
    empfohlenVon: row?.empfohlen_von || '',
    titel: row?.titel || '',
    text: row?.text || '',
    url: row?.url || '',
    tierart: row?.tierart || '',
    partnerId: row?.partner_id ? String(row.partner_id) : '',
    aktiv: row ? Boolean(row.aktiv) : true,
    start: row?.start || '',
    ende: row?.ende || '',
    sort: String(row?.sort ?? 0)
  }
}

// Der Server nimmt sort nur als ganze Zahl (sonst 0) - "2.5" oder "abc" also bewusst 0.
function toSort(value) {
  const trimmed = String(value).trim()
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : 0
}

// Immer der vollständige Datensatz - PUT validiert wie POST alles (validatePromotion).
export function toPromotionPayload(form) {
  return {
    bereich: form.bereich,
    kennzeichnung: form.kennzeichnung,
    empfohlenVon: form.empfohlenVon.trim() || null,
    titel: form.titel,
    text: form.text.trim() || null,
    url: form.url.trim() || null,
    tierart: form.tierart || null,
    partnerId: form.partnerId ? Number(form.partnerId) : null,
    aktiv: form.aktiv,
    start: form.start || null,
    ende: form.ende || null,
    sort: toSort(form.sort)
  }
}

// Was der Server sicher ablehnen würde, gleich am Feld melden (Formular mit noValidate - sonst zeigt der
// Browser seine eigene Blase statt der Meldung am Feld). Gleicher Wortlaut wie server/lib/promotions.js.
export function promotionClientErrors(form) {
  const errors = {}
  if (!form.titel.trim()) errors.titel = 'Der Titel ist Pflicht'
  if (form.kennzeichnung === 'Empfehlung' && !form.empfohlenVon.trim()) errors.empfohlenVon = EMPFOHLEN_VON_REQUIRED
  return errors
}

export function formatZeitraum(start, ende) {
  if (start && ende) return `${formatDateShort(start)} – ${formatDateShort(ende)}`
  if (start) return `ab ${formatDateShort(start)}`
  if (ende) return `bis ${formatDateShort(ende)}`
  return 'unbefristet'
}

// --- Spendenberichte ------------------------------------------------------------------------------

export const AMOUNT_FIELDS = [
  { key: 'eingang', payloadKey: 'eingangCents', rowKey: 'eingang_cents', label: 'Eingang' },
  { key: 'kosten', payloadKey: 'kostenCents', rowKey: 'kosten_cents', label: 'Kosten gedeckt' },
  { key: 'weitergeleitet', payloadKey: 'weitergeleitetCents', rowKey: 'weitergeleitet_cents', label: 'Weitergegeben' }
]

export const INVALID_AMOUNT = 'Bitte einen Betrag in Euro eingeben, z. B. 1.250,50 (nicht negativ).'
export const MAX_AMOUNT_CENTS = 1e9 // wie server/lib/promotions.js MAX_CENTS
export const AMOUNT_TOO_LARGE = 'Höchstens 10.000.000,00 € pro Betrag.'

function amountError(cents) {
  if (cents === null) return INVALID_AMOUNT
  return cents > MAX_AMOUNT_CENTS ? AMOUNT_TOO_LARGE : null
}

export function initialDonationForm(row) {
  return {
    zeitraum: row?.zeitraum || '',
    ...Object.fromEntries(AMOUNT_FIELDS.map((field) => [field.key, row ? centsToEuroInput(row[field.rowKey]) : ''])),
    empfaenger: row?.empfaenger || '',
    nachweisUrl: row?.nachweis_url || ''
  }
}

// Euro-Eingaben -> Cent. { payload, errors }: payload ist null, sobald ein Betrag nicht lesbar ist oder
// der Zeitraum fehlt (beides lehnt der Server ohnehin ab - so steht die Meldung gleich am Feld).
export function parseDonationForm(form) {
  const cents = Object.fromEntries(AMOUNT_FIELDS.map((field) => [field.key, parseEuroToCents(form[field.key])]))
  const errors = {
    ...(form.zeitraum.trim() ? {} : { zeitraum: 'Der Zeitraum ist Pflicht' }),
    ...Object.fromEntries(
      AMOUNT_FIELDS.map((field) => [field.key, amountError(cents[field.key])]).filter(([, message]) => message)
    )
  }
  if (Object.keys(errors).length) return { payload: null, errors }
  return {
    payload: {
      zeitraum: form.zeitraum,
      ...Object.fromEntries(AMOUNT_FIELDS.map((field) => [field.payloadKey, cents[field.key]])),
      empfaenger: form.empfaenger.trim() || null,
      nachweisUrl: form.nachweisUrl.trim() || null
    },
    errors
  }
}
