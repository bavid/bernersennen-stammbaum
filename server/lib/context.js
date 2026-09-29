const db = require('../db')
const { countUnread } = require('./partnerMessages')
// ART und PARTNER_AREA_ARTS liegen in lib/areaArt.js (ohne Abhängigkeiten, kein Require-Zyklus mit
// lib/partnerMessages.js) und werden hier weiter exportiert.
const { ART, PARTNER_AREA_ARTS } = require('./areaArt')
const { roleOf } = require('./roles')

// Familien (art rudel), in denen ein Zuhause Mitglied ist
function membershipsOf(homeId) {
  return db
    .prepare(
      `SELECT f.id, f.name, f.theme FROM family_members m JOIN families f ON f.id = m.group_family_id
       WHERE m.member_family_id = ? ORDER BY f.name COLLATE NOCASE`
    )
    .all(homeId)
}

function isMember(homeId, groupId) {
  return Boolean(
    db.prepare('SELECT 1 FROM family_members WHERE member_family_id = ? AND group_family_id = ?').get(homeId, groupId)
  )
}

// Darf die Identität homeId den Bereich familyId ansehen? (eigener Bereich oder Mitgliedschaft).
// Demo und Nicht-Demo dürfen nie gemischt werden, selbst wenn irgendwo eine Mitgliedschaftszeile
// existiert (z. B. weil eine Familie nachträglich als Demo markiert wurde) – Verteidigungslinie,
// da /join bzw. /group das im Normalbetrieb schon verhindern.
function canEnter(homeId, familyId) {
  if (homeId === familyId) return true
  if (!isMember(homeId, familyId)) return false
  const identity = db.prepare('SELECT is_demo FROM families WHERE id = ?').get(homeId)
  const area = db.prepare('SELECT is_demo FROM families WHERE id = ?').get(familyId)
  if (!identity || !area) return false
  return Boolean(identity.is_demo) === Boolean(area.is_demo)
}

// Welchen Nachweis verlangen /family/key, POST /users und DELETE /users/:id für DIESE Sitzung? Der
// Client braucht das, um das richtige Feld abzufragen (siehe requireCurrentCredential in routes/auth.js,
// das dieselbe Regel beim tatsächlichen Prüfen anwendet). Benutzer-Sitzung (userId gesetzt) -> das
// eigene Passwort zählt, nicht der Schlüssel der Identität. Sonst richtet es sich nach der Identität
// selbst: hat sie schon einen Schlüssel (access_key_hash), gilt der; nur eine Alt-Familie ohne
// Schlüssel verlangt noch ihr altes Bereichs-Passwort.
function currentAuthInfo(homeId, userId) {
  if (userId) {
    const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId)
    if (user) return { kind: 'user', username: user.username }
  }
  const family = db.prepare('SELECT access_key_hash FROM families WHERE id = ?').get(homeId)
  return { kind: family?.access_key_hash ? 'key' : 'legacy' }
}

// Antwort für /me, /login, /demo, /view: aktiver Bereich oben, Identität und Mitgliedschaften dazu.
// userId (falls gesetzt) beschreibt eine Benutzer-Sitzung und fließt nur in "auth" ein.
// Ist der aktive Bereich ein Partner-Bereich (art 'tierheim' oder 'partner'), kommt zusätzlich "partner"
// dazu (der Partner, aus dem der Admin diesen Bereich angelegt hat, siehe routes/admin.js POST
// /partners/:id/area) - der Client zeigt damit z. B. Name/Slug/Typ und eine Sperre, ohne extra nachzufragen.
// role (Phase R Task 1): die Rolle der Identität im aktiven Bereich (lib/roles.js roleOf) - 'leitung' im
// eigenen Bereich und mit dem gemeinsamen Schlüssel einer Familie, sonst die Rolle der Mitgliedschaft.
function buildMe(homeId, activeId, isDemo, userId = null) {
  const family = (id) => db.prepare('SELECT id, name, theme, art FROM families WHERE id = ?').get(id)
  const active = family(activeId)
  const home = family(homeId)
  const me = {
    ...active,
    isDemo: Boolean(isDemo),
    role: roleOf(homeId, activeId),
    home,
    memberships: membershipsOf(homeId),
    auth: currentAuthInfo(homeId, userId)
  }
  if (PARTNER_AREA_ARTS.includes(active?.art)) {
    const partner = db
      .prepare(
        `SELECT p.id, p.slug, p.name, p.typ, p.status, p.gesperrt
         FROM families f JOIN partners p ON p.id = f.partner_id WHERE f.id = ?`
      )
      .get(activeId)
    // unread (Phase P2 Task 9): ungelesene Nachrichten im Posteingang (lib/partnerMessages.js).
    if (partner) me.partner = { ...partner, gesperrt: Boolean(partner.gesperrt), unread: countUnread(partner.id) }
  }
  return me
}

// Tiere, die im Bereich @familyId sichtbar sind: eigene und dorthin geteilte
const VISIBLE_DOGS_SQL = `(SELECT id FROM dogs WHERE family_id = @familyId
  UNION SELECT dog_id FROM dog_shares WHERE family_id = @familyId)`

// Chronik-Einträge, die im Bereich @familyId sichtbar sind: eigene (alle) und geteilte (nur nicht-private).
// Erwartet einen Alias "t" auf timeline_entries im umgebenden Query.
const VISIBLE_ENTRY_SQL = `(t.family_id = @familyId OR (t.dog_id IN (SELECT dog_id FROM dog_shares WHERE family_id = @familyId) AND t.privat = 0))`

// Darf familyId dog sehen (lesend)? Eigenes Tier oder an familyId geteilt.
function canSeeDog(familyId, dog) {
  if (!dog) return false
  if (dog.family_id === familyId) return true
  return Boolean(db.prepare('SELECT 1 FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(dog.id, familyId))
}

// Kommentare, die im Bereich @familyId sichtbar sind: der Eintrag-Eigentümer sieht ALLE
// Kommentare; jeder andere Bereich (z. B. ein Rudel, in das geteilt wurde) sieht nur eigene
// Kommentare plus die des Eigentümers – Kommentare fremder, ebenfalls beteiligter Bereiche
// bleiben untereinander unsichtbar. Erwartet Aliase "c" (entry_comments) und "t" (timeline_entries).
const VISIBLE_COMMENT_SQL = `(t.family_id = @familyId OR c.family_id = @familyId OR c.family_id = t.family_id)`

module.exports = {
  ART,
  PARTNER_AREA_ARTS,
  membershipsOf,
  isMember,
  canEnter,
  buildMe,
  VISIBLE_DOGS_SQL,
  VISIBLE_ENTRY_SQL,
  VISIBLE_COMMENT_SQL,
  canSeeDog
}
