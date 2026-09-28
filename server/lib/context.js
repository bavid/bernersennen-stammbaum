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

// Darf die Identität homeId den Bereich familyId ansehen? (eigener Bereich oder Mitgliedschaft)
function canEnter(homeId, familyId) {
  return homeId === familyId || isMember(homeId, familyId)
}

// Antwort für /me, /login, /demo, /view: aktiver Bereich oben, Identität und Mitgliedschaften dazu
function buildMe(homeId, activeId, isDemo) {
  const family = (id) => db.prepare('SELECT id, name, theme, art FROM families WHERE id = ?').get(id)
  const active = family(activeId)
  const home = family(homeId)
  return { ...active, isDemo: Boolean(isDemo), home, memberships: membershipsOf(homeId) }
}

module.exports = { ART, membershipsOf, isMember, canEnter, buildMe }
