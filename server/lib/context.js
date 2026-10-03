const db = require('../db')
const { countUnread } = require('./partnerMessages')
// ART und PARTNER_AREA_ARTS liegen in lib/areaArt.js (ohne Abhängigkeiten, kein Require-Zyklus mit
// lib/partnerMessages.js) und werden hier weiter exportiert.
const { ART, PARTNER_AREA_ARTS } = require('./areaArt')
const { roleOf } = require('./roles')
const { isVisiting, visitTargetsOf, countNewGuests } = require('./visits')
const { countOpenRequests } = require('./erlebtMit')
const { revokeInvitesOnLeave } = require('./inviteRevocation')

// Familien (art rudel), in denen ein Zuhause Mitglied ist - mit der eigenen Rolle dort (Phase R Task 2,
// für den ContextSwitcher des Clients).
function membershipsOf(homeId) {
  return db
    .prepare(
      `SELECT f.id, f.name, f.theme, m.rolle FROM family_members m JOIN families f ON f.id = m.group_family_id
       WHERE m.member_family_id = ? ORDER BY f.name COLLATE NOCASE`
    )
    .all(homeId)
}

function isMember(homeId, groupId) {
  return Boolean(
    db.prepare('SELECT 1 FROM family_members WHERE member_family_id = ? AND group_family_id = ?').get(homeId, groupId)
  )
}

// Mitgliedschaft und die Freigaben dieses Haushalts in dieses Rudel gemeinsam entfernen (Verlassen in
// routes/auth.js, Entfernen durch die Leitung in routes/members.js): ein Absturz dazwischen darf keine
// verwaisten dog_shares hinterlassen, die auf eine tote Mitgliedschaft zeigen. Die Tiere selbst bleiben in
// ihrem Zuhause. Gibt die Anzahl entfernter Mitgliedschaften zurück (0 = war kein Mitglied).
// security-review Phase V2 (M-2): dazu die Einladungs-Codes, die der Haushalt kannte (lib/inviteRevocation.js).
const removeMembership = db.transaction((homeId, groupId) => {
  const membership = db.prepare('SELECT rolle FROM family_members WHERE member_family_id = ? AND group_family_id = ?').get(homeId, groupId)
  const result = db
    .prepare('DELETE FROM family_members WHERE member_family_id = ? AND group_family_id = ?')
    .run(homeId, groupId)
  if (result.changes > 0) {
    db.prepare('DELETE FROM dog_shares WHERE family_id = ? AND dog_id IN (SELECT id FROM dogs WHERE family_id = ?)').run(
      groupId,
      homeId
    )
    revokeInvitesOnLeave(db, { homeId, groupId, role: membership?.rolle })
  }
  return result.changes
})

// Darf die Identität homeId den Bereich familyId ansehen? (eigener Bereich oder Mitgliedschaft).
// Demo und Nicht-Demo dürfen nie gemischt werden, selbst wenn irgendwo eine Mitgliedschaftszeile
// existiert (z. B. weil eine Familie nachträglich als Demo markiert wurde) – Verteidigungslinie,
// da /join bzw. /group das im Normalbetrieb schon verhindern.
// adminView (Phase 5 Task 5b, middleware/auth.js): die Admin-Ansicht darf jede Mitgliedschaft der Identität
// öffnen, auch über die Demo-Grenze hinweg - der Admin sieht ohnehin alles, die Sitzung ist nur lesend.
function canEnter(homeId, familyId, { adminView = false } = {}) {
  if (homeId === familyId) return true
  if (!isMember(homeId, familyId)) return false
  if (adminView) return true
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
// adminView (Phase 5 Task 5b): nur in einer Admin-Ansicht (routes/admin.js POST /view/:familyId) steht
// "adminView: true" in der Antwort - normale Sitzungen tragen das Feld gar nicht.
// besuche (Phase V2, lib/visits.js): die Zuhause, die die Identität besucht ([{ id, name }], für "Zu Besuch bei …").
// zuBesuch: nur gesetzt (true), wenn der aktive Bereich so ein besuchtes Zuhause ist - role ist dann 'gast'.
// erlebtMitOffen (Phase V2, lib/erlebtMit.js): offene "Erlebt mit"-Anfragen an das eigene Zuhause (Badge im Client).
// neueGaeste (security-review V2, M-3): Gäste, die das eigene Zuhause noch nicht mit „Passt“ bestätigt hat.
function buildMe(homeId, activeId, isDemo, userId = null, { adminView = false } = {}) {
  const family = (id) => db.prepare('SELECT id, name, theme, art FROM families WHERE id = ?').get(id)
  const active = family(activeId)
  const home = family(homeId)
  const zuBesuch = activeId !== homeId && !isMember(homeId, activeId) && isVisiting(homeId, activeId)
  const me = {
    ...active,
    isDemo: Boolean(isDemo),
    ...(adminView ? { adminView: true } : {}),
    ...(zuBesuch ? { zuBesuch: true } : {}),
    role: roleOf(homeId, activeId),
    home,
    memberships: membershipsOf(homeId),
    besuche: visitTargetsOf(homeId),
    erlebtMitOffen: home?.art === ART.zuhause ? countOpenRequests(homeId) : 0,
    neueGaeste: home?.art === ART.zuhause ? countNewGuests(homeId) : 0,
    auth: currentAuthInfo(homeId, userId)
  }
  if (PARTNER_AREA_ARTS.includes(active?.art)) {
    const partner = db
      .prepare(
        `SELECT p.id, p.slug, p.name, p.typ, p.status, p.gesperrt, p.vertrauenswuerdig
         FROM families f JOIN partners p ON p.id = f.partner_id WHERE f.id = ?`
      )
      .get(activeId)
    // unread (Phase P2 Task 9): ungelesene Nachrichten im Posteingang (lib/partnerMessages.js). vertrauenswuerdig
    // (V-Fehler 3): Änderungen an freigegebenen Beiträgen gehen sofort online (lib/promotionFreigabe.js).
    if (partner) {
      me.partner = {
        ...partner,
        gesperrt: Boolean(partner.gesperrt),
        vertrauenswuerdig: Boolean(partner.vertrauenswuerdig),
        unread: countUnread(partner.id)
      }
    }
  }
  return me
}

// Tiere, die im Bereich @familyId sichtbar sind: eigene und dorthin geteilte
const VISIBLE_DOGS_SQL = `(SELECT id FROM dogs WHERE family_id = @familyId
  UNION SELECT dog_id FROM dog_shares WHERE family_id = @familyId)`

// Nur die EIGENEN Tiere des Bereichs @familyId (ohne geteilte) - für Würfe eigener Tiere in fremden Zuchtbüchern
// (routes/breeding.js GET /, lib/uploadAccess.js): ein geteiltes Tier bringt das Zuchtbuch seines Zuhauses nicht mit.
const OWN_DOGS_SQL = '(SELECT id FROM dogs WHERE family_id = @familyId)'

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
  removeMembership,
  canEnter,
  buildMe,
  VISIBLE_DOGS_SQL,
  OWN_DOGS_SQL,
  VISIBLE_ENTRY_SQL,
  VISIBLE_COMMENT_SQL,
  canSeeDog
}
