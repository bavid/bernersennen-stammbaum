// Reine Hilfen für "Zur Freigabe" im Admin (Phase P2, AdminPostApproval) - spiegeln
// server/lib/promotions.js validateAblehnungsgrund und die Zeilen von GET /api/admin/promotions.

export const MIN_GRUND_LENGTH = 3
export const MAX_GRUND_LENGTH = 300
export const GRUND_MESSAGE = `Bitte einen Grund mit ${MIN_GRUND_LENGTH} bis ${MAX_GRUND_LENGTH} Zeichen angeben`

export function grundError(grund) {
  const length = String(grund || '').trim().length
  return length < MIN_GRUND_LENGTH || length > MAX_GRUND_LENGTH ? GRUND_MESSAGE : null
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
