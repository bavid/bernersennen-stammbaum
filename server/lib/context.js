const db = require('../db')

const ART = { zuhause: 'zuhause', rudel: 'rudel' }

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

// Antwort für /me, /login, /demo, /view: aktiver Bereich oben, Identität und Mitgliedschaften dazu
function buildMe(homeId, activeId, isDemo) {
  const family = (id) => db.prepare('SELECT id, name, theme, art FROM families WHERE id = ?').get(id)
  const active = family(activeId)
  const home = family(homeId)
  return { ...active, isDemo: Boolean(isDemo), home, memberships: membershipsOf(homeId) }
}

module.exports = { ART, membershipsOf, isMember, canEnter, buildMe }
