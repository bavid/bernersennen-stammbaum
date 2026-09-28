'use strict'

// Phase P Task 1: Vermittlungsstatus eines Tierheim-Tiers - die EINZIGE Quelle für die Status-Listen
// (docs/superpowers/plans/2026-09-29-phase-p-partnerbereich.md). Vorher standen die Listen fest
// verdrahtet in routes/dogs.js, routes/publicAnimals.js und lib/publicMedia.js.
//
// - VERMITTLUNG_STATUS: alle gültigen Werte von dogs.vermittlung_status.
// - PUBLISHABLE_STATUS: der Steckbrief (/t/:slug) darf öffentlich sein und public_slug bleibt erhalten.
//   „pausiert“ (on hold, vorübergehend nicht vermittelbar) gehört dazu - der Steckbrief bleibt mit Hinweis
//   sichtbar (Konzept, offene Frage 26).
// - LISTED_STATUS: erscheint in Listen und Karten („Entdecken“ begleiter.tiere) - pausierte Tiere nicht.
//
// Übergabe-Gutscheine gehen weiterhin nur aus „reserviert“ (lib/vouchers.js assertHandoverStillRedeemable).

const VERMITTLUNG_STATUS = Object.freeze(['in_vermittlung', 'reserviert', 'pausiert', 'vermittelt'])
const PUBLISHABLE_STATUS = Object.freeze(['in_vermittlung', 'reserviert', 'pausiert'])
const LISTED_STATUS = Object.freeze(['in_vermittlung', 'reserviert'])

// Spalte, Alias.Spalte oder ein benannter Parameter (@name) - nie ein freier SQL-Ausdruck.
const SQL_OPERAND_RE = /^@?[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/
const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

// Baut `<column> IN ('a', 'b')` aus einer der Konstanten oben. Die Werte stehen als Literal in der
// Abfrage (kein Nutzereingabe-Pfad) - deshalb wird hier streng geprüft, dass nur bekannte Status und ein
// einfacher Spaltenausdruck durchkommen, statt beliebige Strings ins SQL zu übernehmen.
function statusInSql(list, column) {
  if (typeof column !== 'string' || !SQL_OPERAND_RE.test(column)) {
    throw new Error(`Ungültige Spalte für die Status-Abfrage: ${column}`)
  }
  if (!Array.isArray(list) || list.length === 0 || !list.every((status) => VERMITTLUNG_STATUS.includes(status))) {
    throw new Error('Unbekannter Vermittlungsstatus in der Status-Liste')
  }
  return `${column} IN (${list.map((status) => `'${status}'`).join(', ')})`
}

function statusColumn(alias) {
  if (alias === undefined || alias === null || alias === '') return 'vermittlung_status'
  if (typeof alias !== 'string' || !ALIAS_RE.test(alias)) throw new Error(`Ungültige Spalte für die Status-Abfrage: ${alias}`)
  return `${alias}.vermittlung_status`
}

// alias: optionaler Tabellen-Alias (z. B. 'd' -> d.vermittlung_status).
function publishableSql(alias) {
  return statusInSql(PUBLISHABLE_STATUS, statusColumn(alias))
}

function listedSql(alias) {
  return statusInSql(LISTED_STATUS, statusColumn(alias))
}

module.exports = {
  VERMITTLUNG_STATUS,
  PUBLISHABLE_STATUS,
  LISTED_STATUS,
  statusInSql,
  publishableSql,
  listedSql
}
