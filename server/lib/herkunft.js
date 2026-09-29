'use strict'

// Phase 5 Task 1: Herkunft eines Bereichs für die Rudel-Liste des Admins (routes/admin.js GET /overview),
// abgeleitet aus dem Gutschein, mit dem er entstand (families.voucher_id -> vouchers -> Stapel, ausgebender
// Bereich, Partner):
//   'partner:<Name>'          Partner-Stapel oder Weitergabe aus einem Partner-/Tierheim-Bereich; ohne
//                             Gutschein (families.partner_id gesetzt) der Bereich des Partners selbst
//   'weitergabe:<Bereichsname>' Weitergabe-Gutschein eines Zuhauses oder Rudels (Mundpropaganda)
//   'stapel:<Label>'          Admin-Stapel (Kundenkarten, Partner-Zugänge, ...)
//   'altbestand'              kein Gutschein - der Freitext families.quelle bleibt als Fallback im Client
// Nur Bereichs-, Partner- und Stapel-Namen, nie Personen. Die SQL-Bausteine setzen den Alias f für families
// voraus; die Spalten heißen herkunft_* und werden von herkunft(row) in EIN Feld zusammengefasst.

const HERKUNFT_JOINS_SQL = `
  LEFT JOIN vouchers hv ON hv.id = f.voucher_id
  LEFT JOIN voucher_batches hb ON hb.id = hv.batch_id
  LEFT JOIN partners hp ON hp.id = COALESCE(hv.partner_id, f.partner_id)
  LEFT JOIN families hi ON hi.id = hv.issued_by_family_id`

const HERKUNFT_COLUMNS_SQL = 'hp.name AS herkunft_partner, hi.name AS herkunft_bereich, hb.label AS herkunft_stapel'

const HERKUNFT_ROW_KEYS = ['herkunft_partner', 'herkunft_bereich', 'herkunft_stapel']

function herkunft(row) {
  if (row.herkunft_partner) return `partner:${row.herkunft_partner}`
  if (row.herkunft_bereich) return `weitergabe:${row.herkunft_bereich}`
  if (row.herkunft_stapel) return `stapel:${row.herkunft_stapel}`
  return 'altbestand'
}

// Ersetzt die herkunft_*-Hilfsspalten einer Zeile durch das eine Feld herkunft (neue Zeile, keine Mutation).
function withHerkunft(row) {
  const rest = Object.fromEntries(Object.entries(row).filter(([key]) => !HERKUNFT_ROW_KEYS.includes(key)))
  return { ...rest, herkunft: herkunft(row) }
}

module.exports = { HERKUNFT_JOINS_SQL, HERKUNFT_COLUMNS_SQL, herkunft, withHerkunft }
