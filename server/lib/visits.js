'use strict'

// Phase V2: Zuhause besuchen (Tabelle besuche, db.js). Ein Besuch verbindet zwei Zuhause (art 'zuhause'): der Gast
// (gast_family_id) darf die nicht-privaten Tiere und Einträge des Gastgebers (gastgeber_family_id) ansehen und
// kommentieren - sonst nichts (middleware/auth.js denyGuestRequest, lib/guestAccess.js). Beide Seiten können den
// Besuch jederzeit beenden. Bewusst ohne Abhängigkeit zu lib/vouchers.js oder lib/context.js: beide (und
// lib/roles.js) brauchen isVisiting, ein Require-Zyklus wäre sonst unvermeidlich. Einladen und Einlösen stehen in
// lib/visitInvites.js.

const db = require('../db')
const { ART } = require('./areaArt')

// Demo und Nicht-Demo werden nie verbunden (wie lib/context.js canEnter) - Verteidigungslinie, die Einlöse-Wege
// (lib/visitInvites.js) prüfen das schon vorher.
const findVisitStmt = db.prepare(
  `SELECT 1 FROM besuche b
   JOIN families g ON g.id = b.gast_family_id AND g.art = 'zuhause'
   JOIN families h ON h.id = b.gastgeber_family_id AND h.art = 'zuhause'
   WHERE b.gast_family_id = ? AND b.gastgeber_family_id = ? AND g.is_demo = h.is_demo`
)

// Darf das Zuhause guestId gerade das Zuhause hostId als Gast ansehen?
function isVisiting(guestId, hostId) {
  if (!Number.isInteger(guestId) || !Number.isInteger(hostId) || guestId === hostId) return false
  return Boolean(findVisitStmt.get(guestId, hostId))
}

// Wo ist homeId zu Besuch? (für /me und den Bereichswechsler: "Zu Besuch bei …")
const listVisitsStmt = db.prepare(
  `SELECT h.id, h.name, b.created_at AS seit FROM besuche b
   JOIN families h ON h.id = b.gastgeber_family_id AND h.art = 'zuhause'
   JOIN families g ON g.id = b.gast_family_id
   WHERE b.gast_family_id = ? AND g.is_demo = h.is_demo
   ORDER BY h.name COLLATE NOCASE, h.id`
)

// Wer ist bei homeId zu Gast? (Liste "Meine Gäste" mit "beenden"). neu (security-review V2, M-3): noch nicht mit
// „Passt“ bestätigt; ueberCode: die eigene Notiz des Codes, über den der Gast kam (nur, wenn homeId ihn angelegt hat).
const listGuestsStmt = db.prepare(
  `SELECT g.id, g.name, b.created_at AS seit, (b.bestaetigt_at IS NULL) AS neu,
     (SELECT v.label FROM vouchers v WHERE v.id = b.voucher_id AND v.created_by_family_id = b.gastgeber_family_id) AS ueberCode
   FROM besuche b
   JOIN families g ON g.id = b.gast_family_id AND g.art = 'zuhause'
   JOIN families h ON h.id = b.gastgeber_family_id
   WHERE b.gastgeber_family_id = ? AND g.is_demo = h.is_demo
   ORDER BY g.name COLLATE NOCASE, g.id`
)
const countNewGuestsStmt = db.prepare(
  `SELECT COUNT(*) AS c FROM besuche b
   JOIN families g ON g.id = b.gast_family_id AND g.art = 'zuhause'
   JOIN families h ON h.id = b.gastgeber_family_id
   WHERE b.gastgeber_family_id = ? AND b.bestaetigt_at IS NULL AND g.is_demo = h.is_demo`
)
const acknowledgeGuestStmt = db.prepare(
  "UPDATE besuche SET bestaetigt_at = datetime('now') WHERE gast_family_id = ? AND gastgeber_family_id = ? AND bestaetigt_at IS NULL"
)

function visitsOf(homeId) {
  return listVisitsStmt.all(homeId)
}

function guestsOf(homeId) {
  return listGuestsStmt.all(homeId).map((guest) => ({ ...guest, neu: Boolean(guest.neu) }))
}

// Wie viele neue Gäste hat homeId noch nicht bestätigt? (me.neueGaeste, Hinweis auf den Wegbegleitern)
function countNewGuests(homeId) {
  return countNewGuestsStmt.get(homeId).c
}

// „Passt“: der Gastgeber hostId hat den neuen Gast guestId gesehen. true, wenn es einen offenen Hinweis gab.
function acknowledgeGuest(guestId, hostId) {
  return acknowledgeGuestStmt.run(guestId, hostId).changes === 1
}

// Kurzform für /me: nur Id und Name.
function visitTargetsOf(homeId) {
  return visitsOf(homeId).map(({ id, name }) => ({ id, name }))
}

const insertVisitStmt = db.prepare('INSERT OR IGNORE INTO besuche (gast_family_id, gastgeber_family_id, voucher_id) VALUES (?, ?, ?)')
const deleteVisitStmt = db.prepare('DELETE FROM besuche WHERE gast_family_id = ? AND gastgeber_family_id = ?')

// Gibt true zurück, wenn der Besuch neu entstanden ist (false: gab es schon). voucherId: der eingelöste Code (optional).
// Ein neuer Besuch beginnt unbestätigt (bestaetigt_at NULL) - der Gastgeber sieht ihn als „Neu zu Besuch“.
function addVisit(guestId, hostId, voucherId = null) {
  return insertVisitStmt.run(guestId, hostId, voucherId).changes === 1
}

// Gibt true zurück, wenn es den Besuch gab.
function endVisit(guestId, hostId) {
  return deleteVisitStmt.run(guestId, hostId).changes === 1
}

const findHomeStmt = db.prepare('SELECT id, name, art, is_demo FROM families WHERE id = ?')

// Ein Zuhause (art 'zuhause') oder null.
function findHome(id) {
  const row = Number.isInteger(id) ? findHomeStmt.get(id) : null
  return row && row.art === ART.zuhause ? row : null
}

// Zuhause, die mit @homeId verbunden sind: ein Besuch in einer der beiden Richtungen oder eine gemeinsame Familie
// (beide Mitglied derselben Familie, art 'rudel'). Für "Erlebt mit" (lib/erlebtMit.js): wen man markieren darf und
// wessen Einträge man gespiegelt sieht, solange die Verbindung besteht. Erwartet den Parameter @homeId. Nie über die
// Demo-Grenze hinweg (wie isVisiting - Verteidigungslinie, security-review Phase V2 LOW-6).
const CONNECTED_HOMES_SQL = `(
  SELECT connected.id FROM (
    SELECT gastgeber_family_id AS id FROM besuche WHERE gast_family_id = @homeId
    UNION SELECT gast_family_id FROM besuche WHERE gastgeber_family_id = @homeId
    UNION SELECT m2.member_family_id FROM family_members m1
      JOIN family_members m2 ON m2.group_family_id = m1.group_family_id
      WHERE m1.member_family_id = @homeId AND m2.member_family_id != @homeId
  ) connected
  JOIN families cf ON cf.id = connected.id
  WHERE cf.is_demo = (SELECT is_demo FROM families WHERE id = @homeId)
)`

// Was eine Besuchs-Sitzung (aktiver Bereich @familyId = der Gastgeber, @homeId = das Zuhause des Gasts) sieht:
// - Einträge (Alias t): nur die eigenen, nicht-privaten des Gastgebers - auch keine, die andere Bereiche dorthin
//   geteilt hätten;
// - Kommentare (Aliase c, t): die eigenen (ein Gast schreibt unter seinem Zuhause, routes/timeline.js) und die des
//   Gastgebers - nicht die anderer Gäste oder der Familien, in die ein Tier geteilt ist.
const GUEST_ENTRY_SQL = '(t.family_id = @familyId AND t.privat = 0)'
const GUEST_COMMENT_SQL = '(c.family_id = @homeId OR c.family_id = t.family_id)'

module.exports = {
  isVisiting,
  visitsOf,
  guestsOf,
  countNewGuests,
  acknowledgeGuest,
  visitTargetsOf,
  addVisit,
  endVisit,
  findHome,
  CONNECTED_HOMES_SQL,
  GUEST_ENTRY_SQL,
  GUEST_COMMENT_SQL
}
