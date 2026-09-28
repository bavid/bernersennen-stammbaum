// Partner-Zugang einlösen (/v, RedeemForm + PartnerSetupFields): Prüfung und Anfrage-Felder für das
// Einrichten des Partner-Profils. Vertrag: server/routes/vouchers.js POST /check (zweck, partnerTyp,
// partnerName) und POST /redeem (name, typ, plz - siehe server/lib/partnerAccess.js).
import { SETUP_TYPE_OPTIONS } from './partnerTypes.js'

export const PARTNER_ACCESS_ZWECK = 'partnerzugang'

const PLZ_RE = /^\d{5}$/
const TYP_VALUES = SETUP_TYPE_OPTIONS.map((option) => option.value)

// Aus der Antwort von api.checkVoucher: { partnerTyp, partnerName } für einen offenen Partner-Zugang,
// sonst null (Kunden-Gutschein, unbekannt, noch nicht geprüft).
export function partnerAccessFrom(checkResult) {
  if (checkResult?.zweck !== PARTNER_ACCESS_ZWECK) return null
  return { partnerTyp: checkResult.partnerTyp || null, partnerName: checkResult.partnerName || null }
}

// Gebunden: der Zugang gehört zu einem schon angelegten Partner - dann gibt es nichts einzurichten,
// nur optional eigene Anmeldedaten.
export function isBoundPartnerAccess(access) {
  return Boolean(access?.partnerName)
}

// Feldfehler { name?, typ?, plz? } - leer heißt gültig. Die endgültige Prüfung (Namenslänge, bekannte
// PLZ, Züchter-Sperre) macht der Server, seine Meldung erscheint dann im Fehlerbanner.
export function validatePartnerSetup(values, access) {
  if (isBoundPartnerAccess(access)) return {}
  const errors = {}
  if (!values.name.trim()) errors.name = 'Bitte gebt euren Namen an.'
  if (!access?.partnerTyp && !TYP_VALUES.includes(values.typ)) errors.typ = 'Bitte wählt aus, was ihr anbietet.'
  if (!PLZ_RE.test(values.plz)) errors.plz = 'Bitte gebt eine fünfstellige Postleitzahl an.'
  return errors
}

// Zusätzliche Felder für api.redeemVoucher. typ fehlt bei einer Typ-Vorgabe ganz (der Server nimmt
// dann die Vorgabe des Stapels), ein gebundener Zugang schickt gar nichts davon.
export function partnerSetupPayload(values, access) {
  if (isBoundPartnerAccess(access)) return {}
  const payload = { name: values.name, plz: values.plz }
  return access?.partnerTyp ? payload : { ...payload, typ: values.typ }
}
