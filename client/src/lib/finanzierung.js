// Phase F: Hilfen für „So finanzieren wir uns“ (pages/FinanzierungPage.jsx, components/finanzierung/*) und die
// Admin-Pflege (components/AdminFinanzierung*.jsx) - reine Funktionen über GET /api/finanzierung bzw. GET
// /api/admin/finanzierung (server/lib/finanzierung.js). Beträge kommen in ganzen Cent; der Admin tippt Euro
// (lib/euro.js parseEuroToCents, wie bei den Spendenberichten).

import { centsToEuroInput, parseEuroToCents } from './euro.js'
import { formatEuroCents } from './discover.js'
import { isExternalUrl } from './format.js'

// Wie server/lib/finanzierung.js LIMITS.
export const FINANZIERUNG_LIMITS = Object.freeze({ hinweisText: 400, zielTitel: 80, empfaenger: 120, notiz: 200, jahrMin: 2024, jahrMax: 2100 })

export const QUARTAL_VALUES = [1, 2, 3, 4]

// Betragsfelder der Quartale: Formularfeld -> Schlüssel der API.
export const QUARTAL_AMOUNTS = Object.freeze([
  { key: 'einnahmenSpenden', payloadKey: 'einnahmenSpendenCents', label: 'Einnahmen: Spenden' },
  { key: 'einnahmenPartner', payloadKey: 'einnahmenPartnerCents', label: 'Einnahmen: Partner' },
  { key: 'kosten', payloadKey: 'kostenCents', label: 'Kosten (Betrieb)' },
  { key: 'spendenWeitergegeben', payloadKey: 'spendenWeitergegebenCents', label: 'Spenden weitergegeben' }
])

export const INVALID_AMOUNT = 'Bitte einen Betrag in Euro eingeben, z. B. 1.250,50 (nicht negativ).'

// --- Lesen ----------------------------------------------------------------------------------------------------------

export function quartalLabel(jahr, quartal) {
  return `${quartal}. Quartal ${jahr}`
}

export function quartalKurz(jahr, quartal) {
  return `Q${quartal} ${jahr}`
}

// Drei Zahlen je Quartal: Einnahmen (Spenden + Partner), Kosten, weitergegebene Spenden - in Cent.
export function quartalSummen(quartal) {
  return {
    einnahmen: (quartal.einnahmenSpendenCents || 0) + (quartal.einnahmenPartnerCents || 0),
    kosten: quartal.kostenCents || 0,
    weitergegeben: quartal.spendenWeitergegebenCents || 0
  }
}

// Balkenbreiten in Prozent, alle Quartale an derselben Skala (größter Wert = 100). Ohne Werte überall 0.
export function balkenBreiten(quartale) {
  const summen = quartale.map(quartalSummen)
  const max = Math.max(0, ...summen.flatMap((s) => [s.einnahmen, s.kosten, s.weitergegeben]))
  const percent = (value) => (max > 0 ? (value / max) * 100 : 0)
  return summen.map((s) => ({ einnahmen: percent(s.einnahmen), kosten: percent(s.kosten), weitergegeben: percent(s.weitergegeben) }))
}

// „Ziel: 500,00 € für Hundewiese am Deich“ - ohne Betrag „Ziel: Hundewiese am Deich“.
export function zielText(ziel) {
  const betrag = formatEuroCents(ziel?.betragCents)
  return betrag ? `Ziel: ${betrag} für ${ziel.titel}` : `Ziel: ${ziel?.titel || ''}`
}

// Nur http(s) landet in einem href - nie ein beliebiger String aus der Datenbank.
export function isSafeHttpUrl(url) {
  return isExternalUrl(url)
}

// --- Admin-Formulare ---------------------------------------------------------------------------------------------------

// Formularwerte (Strings) eines Quartals; ohne Zeile ein neues Quartal im gegebenen Jahr.
export function quartalForm(quartal, defaultJahr = new Date().getFullYear()) {
  if (!quartal) {
    return { jahr: String(defaultJahr), quartal: '1', einnahmenSpenden: '', einnahmenPartner: '', kosten: '', spendenWeitergegeben: '', notiz: '' }
  }
  return {
    jahr: String(quartal.jahr),
    quartal: String(quartal.quartal),
    ...Object.fromEntries(QUARTAL_AMOUNTS.map((field) => [field.key, centsToEuroInput(quartal[field.payloadKey])])),
    notiz: quartal.notiz || ''
  }
}

// Ein Betrag in Euro -> Cent; leer zählt als 0 (die Felder dürfen leer bleiben).
function amountCents(value) {
  if (!value || !value.trim()) return 0
  return parseEuroToCents(value)
}

function integerIn(value, min, max) {
  const number = Number(value)
  return Number.isInteger(number) && number >= min && number <= max ? number : null
}

// { payload, errors } - payload ist null, sobald ein Feld nicht stimmt; errors je Feld.
export function quartalPayload(form) {
  const errors = {}
  const jahr = integerIn(form.jahr, FINANZIERUNG_LIMITS.jahrMin, FINANZIERUNG_LIMITS.jahrMax)
  if (jahr === null) errors.jahr = `Bitte ein Jahr zwischen ${FINANZIERUNG_LIMITS.jahrMin} und ${FINANZIERUNG_LIMITS.jahrMax}.`
  const quartal = integerIn(form.quartal, 1, 4)
  if (quartal === null) errors.quartal = 'Bitte ein Quartal von 1 bis 4.'
  const cents = {}
  for (const field of QUARTAL_AMOUNTS) {
    const value = amountCents(form[field.key])
    if (value === null) errors[field.key] = INVALID_AMOUNT
    else cents[field.payloadKey] = value
  }
  const notiz = (form.notiz || '').trim()
  if (notiz.length > FINANZIERUNG_LIMITS.notiz) errors.notiz = `Die Notiz darf höchstens ${FINANZIERUNG_LIMITS.notiz} Zeichen haben.`
  if (Object.keys(errors).length) return { payload: null, errors }
  return { payload: { jahr, quartal, ...cents, notiz }, errors }
}

// Ziel: Titel, Betrag (Euro -> Cent, leer -> null), Empfänger.
export function zielPayload(form) {
  const errors = {}
  const betrag = form.betrag && form.betrag.trim() ? parseEuroToCents(form.betrag) : null
  if (form.betrag && form.betrag.trim() && betrag === null) errors.betrag = INVALID_AMOUNT
  const payload = Object.keys(errors).length ? null : { titel: form.titel.trim(), betragCents: betrag, empfaenger: form.empfaenger.trim() }
  return { payload, errors }
}

export function zielForm(ziel) {
  return { titel: ziel?.titel || '', betrag: centsToEuroInput(ziel?.betragCents), empfaenger: ziel?.empfaenger || '' }
}

export function hinweisForm(hinweis) {
  return { text: hinweis?.text || '', url: hinweis?.url || '' }
}

export function hinweisPayload(form) {
  return { text: form.text.trim(), url: form.url.trim() }
}

// Fehler des Servers ({ error, feld }) auf das Formularfeld abbilden - die API nennt camelCase-Schlüssel wie oben.
const SERVER_FIELD_TO_FORM = Object.freeze({
  einnahmenSpendenCents: 'einnahmenSpenden',
  einnahmenPartnerCents: 'einnahmenPartner',
  kostenCents: 'kosten',
  spendenWeitergegebenCents: 'spendenWeitergegeben',
  betragCents: 'betrag'
})

export function serverFieldError(err) {
  const feld = err?.details?.feld
  if (!feld) return null
  return { field: SERVER_FIELD_TO_FORM[feld] || feld, message: err.message }
}
