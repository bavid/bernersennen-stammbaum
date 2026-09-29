'use strict'

// Phase R (Task 1 Migration, Task 2 ensureLeitung): jede Familie (art 'rudel') mit Mitgliedern, aber ohne
// Leitung, bekommt ihr ältestes Mitglied (family_members.created_at, bei Gleichstand die kleinste
// member_family_id) als Leitung. Je Familie trifft die Bedingung genau eine Zeile (das älteste Mitglied ist
// über created_at + member_family_id eindeutig), also nie zwei Leitungen auf einmal. Idempotent: hat die
// Familie eine Leitung, ändert ein weiterer Lauf nichts.
//
// Bewusst OHNE require('../db'): db.js ruft ensureLeitung beim Start für alle Familien auf (Nachtrag der
// Migration), lib/roles.js reicht es weiter und lib/families.js nutzt es nach dem Löschen eines Haushalts -
// ein require von db.js aus lib/roles.js wäre ein Require-Zyklus (roles.js braucht db.js schon beim Laden),
// darum liegt die eine SQL-Fassung hier (wie lib/areaArt.js für ART).
//
// @familyId NULL: alle Familien (Migration beim Start); sonst nur diese eine (z. B. nach dem Entfernen oder
// Löschen der bisherigen Leitung).
const PROMOTE_OLDEST_MEMBER_SQL = `
  UPDATE family_members SET rolle = 'leitung'
  WHERE group_family_id IN (SELECT id FROM families WHERE art = 'rudel' AND (@familyId IS NULL OR id = @familyId))
    AND NOT EXISTS (
      SELECT 1 FROM family_members l WHERE l.group_family_id = family_members.group_family_id AND l.rolle = 'leitung'
    )
    AND member_family_id = (
      SELECT o.member_family_id FROM family_members o WHERE o.group_family_id = family_members.group_family_id
      ORDER BY o.created_at, o.member_family_id LIMIT 1
    )
`

// Gibt die Anzahl der beförderten Mitgliedschaften zurück (0 oder, ohne familyId, je Familie höchstens 1).
function ensureLeitung(db, familyId = null) {
  return db.prepare(PROMOTE_OLDEST_MEMBER_SQL).run({ familyId }).changes
}

module.exports = { ensureLeitung }
