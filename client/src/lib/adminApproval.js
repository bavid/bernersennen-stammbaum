// Reine Hilfen für "Zur Freigabe" im Admin (Phase P2, AdminPostApproval) - spiegeln
// server/lib/promotions.js validateAblehnungsgrund, server/lib/promotionFreigabe.js (Vorlagen, Sammel-Freigabe,
// V-Fehler 3) und die Zeilen von GET /api/admin/promotions.

export const MIN_GRUND_LENGTH = 3
export const MAX_GRUND_LENGTH = 300
export const GRUND_MESSAGE = `Bitte einen Grund mit ${MIN_GRUND_LENGTH} bis ${MAX_GRUND_LENGTH} Zeichen angeben`
export const VORLAGE_MESSAGE = 'Bitte einen Grund wählen'
export const SONSTIGES_MESSAGE = 'Bei „Sonstiges“ bitte den Grund kurz beschreiben'
export const MAX_SAMMEL_FREIGABE = 50

// Ablehnungsgründe als Vorlagen - dieselbe Liste wie server/lib/promotionFreigabe.js ABLEHNUNG_VORLAGEN (der Server
// lehnt andere Werte ab). Der Partner liest "Vorlage – Zusatz", bei "Sonstiges" nur den Zusatz.
export const SONSTIGES = 'Sonstiges'
export const ABLEHNUNG_VORLAGEN = Object.freeze([
  'Gesundheitsversprechen',
  'Kennzeichnung unklar',
  'Bild passt nicht / Rechte unklar',
  'Link führt ins Leere',
  'Kein Bezug zu Tieren',
  SONSTIGES
])
const VORLAGE_TRENNER = ' – '

export function grundError(grund) {
  const length = String(grund || '').trim().length
  return length < MIN_GRUND_LENGTH || length > MAX_GRUND_LENGTH ? GRUND_MESSAGE : null
}

// Der Grund, wie der Server ihn speichert und der Partner ihn liest.
export function composeGrund(vorlage, text) {
  const zusatz = String(text || '').trim()
  if (vorlage === SONSTIGES) return zusatz
  return zusatz ? `${vorlage}${VORLAGE_TRENNER}${zusatz}` : vorlage
}

// Was der Server sicher ablehnen würde, gleich am passenden Feld: { field: 'vorlage' | 'text', message } oder null.
export function rejectionError(vorlage, text) {
  if (!ABLEHNUNG_VORLAGEN.includes(vorlage)) return { field: 'vorlage', message: VORLAGE_MESSAGE }
  if (vorlage === SONSTIGES && !String(text || '').trim()) return { field: 'text', message: SONSTIGES_MESSAGE }
  const message = grundError(composeGrund(vorlage, text))
  return message ? { field: 'text', message } : null
}

// Höchstlänge des Zusatzes, damit "Vorlage – Zusatz" in MAX_GRUND_LENGTH passt.
export function maxZusatzLength(vorlage) {
  if (!vorlage || vorlage === SONSTIGES) return MAX_GRUND_LENGTH
  return MAX_GRUND_LENGTH - vorlage.length - VORLAGE_TRENNER.length
}

// Ergebnis von POST /api/admin/promotions/freigeben als ein Satz.
export function bulkStatus({ freigegeben, uebersprungen }) {
  const done = `${freigegeben} ${freigegeben === 1 ? 'Beitrag' : 'Beiträge'} freigegeben`
  return uebersprungen > 0 ? `${done}, ${uebersprungen} übersprungen (nicht mehr eingereicht).` : `${done}.`
}

// Admin-Zeile (snake_case) -> Karte in der Form von "Entdecken" (server/routes/discover.js promotionCard),
// damit die Vorschau genau so aussieht wie später bei Kundinnen und Kunden. Der Link bleibt in der
// Vorschau ohnehin deaktiviert (PreviewProvider).
export function promotionPreviewCard(row) {
  return {
    id: row.id,
    kind: 'promotion',
    bereich: row.bereich,
    kennzeichnung: row.kennzeichnung,
    empfohlenVon: row.empfohlen_von || null,
    titel: row.titel,
    text: row.text,
    bildUrl: row.bildUrl || null,
    url: row.url || null,
    clickUrl: row.url ? `/r/promotion/${row.id}` : null
  }
}
