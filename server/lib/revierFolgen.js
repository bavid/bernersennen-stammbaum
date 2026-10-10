'use strict'

// Phase M „Mein Revier“: folgen, ausblenden, eigene Follower verwalten und die Admin-Sperre (Not-Aus für öffentliche
// Inhalte). Folgen und Ausblenden nur für sichtbare Profile derselben Welt; das eigene Profil lässt sich nicht folgen.
// Follower werden nach außen nie mit Bereichs-Id genannt - der Inhaber sieht je Follower nur die Id der Folge-Zeile
// (zum Entfernen) und den Namen, falls der Follower selbst ein sichtbares Profil hat.

const { logAdminAction } = require('./adminLog')
const { db, PROFIL_SICHTBAR_SQL, httpError, demoFlag, publicName } = require('./revierKern')

const visibleStmt = db.prepare(`SELECT p.family_id, p.slug FROM revier_profile p JOIN families f ON f.id = p.family_id
  WHERE p.slug = @slug AND ${PROFIL_SICHTBAR_SQL}`)
const slugStmt = db.prepare('SELECT family_id FROM revier_profile WHERE slug = ?')
const followStmt = db.prepare('INSERT OR IGNORE INTO revier_follows (follower_id, profil_id) VALUES (?, ?)')
const unfollowStmt = db.prepare('DELETE FROM revier_follows WHERE follower_id = ? AND profil_id = ?')
const hideStmt = db.prepare('INSERT OR IGNORE INTO revier_ausgeblendet (viewer_id, profil_id) VALUES (?, ?)')
const unhideStmt = db.prepare('DELETE FROM revier_ausgeblendet WHERE viewer_id = ? AND profil_id = ?')

function visibleProfil(viewer, slug) {
  const row = visibleStmt.get({ slug: String(slug), isDemo: demoFlag(viewer.isDemo) })
  if (!row) throw httpError(404, 'Profil nicht gefunden')
  if (row.family_id === viewer.homeId) throw httpError(400, 'Eurem eigenen Profil könnt ihr nicht folgen.')
  return row
}

function folgen(viewer, slug) {
  const row = visibleProfil(viewer, slug)
  followStmt.run(viewer.homeId, row.family_id)
  return { folgeIch: true }
}

// Entfolgen und Einblenden gehen auch, wenn das Profil inzwischen unsichtbar ist (sonst bliebe die Zeile hängen).
function entfolgen(viewer, slug) {
  const row = slugStmt.get(String(slug))
  if (row) unfollowStmt.run(viewer.homeId, row.family_id)
}

const ausblenden = db.transaction((viewer, slug) => {
  const row = visibleProfil(viewer, slug)
  hideStmt.run(viewer.homeId, row.family_id)
  unfollowStmt.run(viewer.homeId, row.family_id)
  return { ausgeblendet: true }
})

function einblenden(viewer, slug) {
  const row = slugStmt.get(String(slug))
  if (row) unhideStmt.run(viewer.homeId, row.family_id)
}

const hiddenListStmt = db.prepare(`SELECT p.slug, p.anzeigename, f.name AS family_name FROM revier_ausgeblendet a
  JOIN revier_profile p ON p.family_id = a.profil_id JOIN families f ON f.id = p.family_id
  WHERE a.viewer_id = @viewer AND ${PROFIL_SICHTBAR_SQL} ORDER BY a.created_at DESC`)

function ausgeblendete(viewer) {
  return {
    profile: hiddenListStmt.all({ viewer: viewer.homeId, isDemo: demoFlag(viewer.isDemo) }).map((row) => ({
      slug: row.slug,
      name: publicName(row)
    }))
  }
}

// Eigene Follower: Id der Folge-Zeile und - nur bei eigenem sichtbaren Profil des Followers - dessen Name.
const followerStmt = db.prepare(`SELECT rf.id, p.anzeigename, f.name AS family_name, p.slug,
    CASE WHEN p.family_id IS NOT NULL AND ${PROFIL_SICHTBAR_SQL} THEN 1 ELSE 0 END AS sichtbar
  FROM revier_follows rf LEFT JOIN revier_profile p ON p.family_id = rf.follower_id
  LEFT JOIN families f ON f.id = rf.follower_id
  WHERE rf.profil_id = @profil ORDER BY rf.created_at DESC, rf.id DESC`)
const profilDemoStmt = db.prepare('SELECT is_demo FROM families WHERE id = ?')

function eigeneFollower(familyId) {
  const isDemo = profilDemoStmt.get(familyId)?.is_demo ? 1 : 0
  const follower = followerStmt.all({ profil: familyId, isDemo }).map((row) => ({
    id: row.id,
    name: row.sichtbar ? publicName(row) : null,
    slug: row.sichtbar ? row.slug : null
  }))
  return { anzahl: follower.length, follower }
}

function removeFollower(familyId, followId) {
  const result = db.prepare('DELETE FROM revier_follows WHERE id = ? AND profil_id = ?').run(followId, familyId)
  if (result.changes === 0) throw httpError(404, 'Follower nicht gefunden')
}

// Admin: alle Profile (ohne PLZ) und die Sperre. Gesperrt = sofort überall unsichtbar (PROFIL_SICHTBAR_SQL).
const adminListStmt = db.prepare(`SELECT p.slug, p.anzeigename, f.name AS family_name, p.aktiv, p.gesperrt, f.is_demo,
    p.updated_at,
    (SELECT COUNT(*) FROM revier_tiere rt JOIN dogs d ON d.id = rt.dog_id WHERE d.family_id = p.family_id) AS tiere,
    (SELECT COUNT(*) FROM revier_eintraege re JOIN timeline_entries t ON t.id = re.entry_id
       WHERE t.family_id = p.family_id) AS eintraege,
    (SELECT COUNT(*) FROM revier_follows rf WHERE rf.profil_id = p.family_id) AS follower
  FROM revier_profile p JOIN families f ON f.id = p.family_id
  WHERE p.aktiv = 1 OR p.gesperrt = 1 ORDER BY f.is_demo, p.updated_at DESC`)

function adminRevierListe() {
  return {
    profile: adminListStmt.all().map((row) => ({
      slug: row.slug,
      name: publicName(row),
      aktiv: Boolean(row.aktiv),
      gesperrt: Boolean(row.gesperrt),
      isDemo: Boolean(row.is_demo),
      tiere: row.tiere,
      eintraege: row.eintraege,
      follower: row.follower,
      updatedAt: row.updated_at
    }))
  }
}

function setRevierGesperrt(slug, gesperrt) {
  const result = db.prepare('UPDATE revier_profile SET gesperrt = ? WHERE slug = ?').run(gesperrt ? 1 : 0, String(slug))
  if (result.changes === 0) throw httpError(404, 'Profil nicht gefunden')
  logAdminAction(gesperrt ? 'revier-gesperrt' : 'revier-freigegeben', `revier:${slug}`)
  return { slug: String(slug), gesperrt: Boolean(gesperrt) }
}

module.exports = {
  folgen,
  entfolgen,
  ausblenden,
  einblenden,
  ausgeblendete,
  eigeneFollower,
  removeFollower,
  adminRevierListe,
  setRevierGesperrt
}
