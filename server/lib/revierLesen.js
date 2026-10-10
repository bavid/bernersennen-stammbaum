'use strict'

// Phase M „Mein Revier“: lesen - Radar, Profilseite, „Mein Profil für andere“ (Vorschau), Feed „Aus deinem Revier“ und
// die Foto-/Bild-Freigabe. Jede Abfrage trägt PROFIL_SICHTBAR_SQL (lib/revierKern.js): ein ausgeschaltetes oder
// gesperrtes Profil ist mit der nächsten Anfrage überall weg. Antworten nennen Profile nur über ihren slug.
// viewer: { homeId, isDemo } - die Identität (immer ein eigenes Zuhause, routes/revier.js).

const { lookupPlz, distanceKm } = require('./geo')
const { bildFileOf } = require('./profil')
const {
  db,
  UMKREIS_VALUES,
  PROFIL_SICHTBAR_SQL,
  PUBLIC_DOGS_SQL,
  PUBLIC_ENTRY_SQL,
  ENTRY_COLUMNS_SQL,
  httpError,
  demoFlag,
  bandOf,
  bandMax,
  bandRank,
  bildUrlOf,
  publicName,
  publicDogs,
  toPublicEntry
} = require('./revierKern')
const { ensureProfil } = require('./revierEinstellungen')

const SEITE = 10
const MAX_RADAR = 50
const TIERARTEN = ['hund', 'katze', 'anderes']
const PROFIL_COLUMNS_SQL = 'p.*, f.name AS family_name'
const NOT_HIDDEN_SQL = 'NOT EXISTS (SELECT 1 FROM revier_ausgeblendet a WHERE a.viewer_id = @viewer AND a.profil_id = p.family_id)'

const radarStmt = db.prepare(`SELECT ${PROFIL_COLUMNS_SQL} FROM revier_profile p JOIN families f ON f.id = p.family_id
  WHERE ${PROFIL_SICHTBAR_SQL} AND p.family_id != @viewer AND ${NOT_HIDDEN_SQL}`)
const bySlugStmt = db.prepare(`SELECT ${PROFIL_COLUMNS_SQL}, f.is_demo FROM revier_profile p JOIN families f ON f.id = p.family_id
  WHERE p.slug = ?`)
const visibleBySlugStmt = db.prepare(`SELECT ${PROFIL_COLUMNS_SQL} FROM revier_profile p JOIN families f ON f.id = p.family_id
  WHERE p.slug = @slug AND ${PROFIL_SICHTBAR_SQL}`)
const entriesStmt = db.prepare(`SELECT ${ENTRY_COLUMNS_SQL} FROM revier_profile p JOIN timeline_entries t ON ${PUBLIC_ENTRY_SQL}
  JOIN dogs d ON d.id = t.dog_id WHERE p.family_id = @familyId AND (@vor IS NULL OR t.id < @vor)
  ORDER BY t.id DESC LIMIT @limit`)
const followsMeStmt = db.prepare('SELECT 1 FROM revier_follows WHERE follower_id = ? AND profil_id = ?')
const hiddenStmt = db.prepare('SELECT 1 FROM revier_ausgeblendet WHERE viewer_id = ? AND profil_id = ?')
const followerCountStmt = db.prepare('SELECT COUNT(*) AS n FROM revier_follows WHERE profil_id = ?')
// Namen der Follower, die selbst ein sichtbares Profil haben (derselben Welt) - alle anderen zählen nur.
const followerNamesStmt = db.prepare(`SELECT ${PROFIL_COLUMNS_SQL} FROM revier_follows rf
  JOIN revier_profile p ON p.family_id = rf.follower_id JOIN families f ON f.id = p.family_id
  WHERE rf.profil_id = @profil AND ${PROFIL_SICHTBAR_SQL} ORDER BY COALESCE(p.anzeigename, f.name) COLLATE NOCASE`)

function entriesOf(familyId, { vor = null, limit = SEITE } = {}) {
  const rows = entriesStmt.all({ familyId, vor, limit: limit + 1 })
  const eintraege = rows.slice(0, limit).map(toPublicEntry)
  return { eintraege, weiter: rows.length > limit ? eintraege[eintraege.length - 1].id : null }
}

function ortOf(row) {
  return row.ort_zeigen ? lookupPlz(row.plz)?.ort || undefined : undefined
}

function karteOf(row, extra = {}) {
  const ort = ortOf(row)
  return {
    slug: row.slug,
    name: publicName(row),
    text: row.text || null,
    bild: bildUrlOf(row),
    ...(ort ? { ort } : {}),
    ...extra
  }
}

function cleanUmkreis(value) {
  const umkreis = Number(value)
  if (!UMKREIS_VALUES.includes(umkreis)) throw httpError(400, 'Unbekannter Umkreis')
  return umkreis
}

function radarCenter(viewer, plz) {
  const own = plz || ensureProfil(viewer.homeId).plz
  if (!own) throw httpError(400, 'Bitte eine Postleitzahl angeben.', 'PLZ')
  const center = typeof own === 'string' ? lookupPlz(own) : null
  if (!center) throw httpError(400, 'Diese Postleitzahl kennen wir nicht')
  return { center, ort: center.ort }
}

// Radar: sichtbare Profile im Umkreis, sortiert nach Stufe und Name (nie nach Kilometern - die Reihenfolge innerhalb
// einer Stufe verrät so nichts). Ohne plz gilt die PLZ des eigenen Profils.
function radar(viewer, { plz, umkreis, tierart } = {}) {
  const max = cleanUmkreis(umkreis)
  if (tierart && !TIERARTEN.includes(tierart)) throw httpError(400, 'Unbekannte Tierart')
  const { center, ort } = radarCenter(viewer, plz)
  const profile = radarStmt
    .all({ viewer: viewer.homeId, isDemo: demoFlag(viewer.isDemo) })
    .map((row) => {
      const other = lookupPlz(row.plz)
      return { row, band: other ? bandOf(distanceKm(center, other)) : null }
    })
    .filter(({ band }) => band && bandMax(band) <= max)
    .map(({ row, band }) => ({ row, band, tiere: publicDogs(row.family_id) }))
    .filter(({ tiere }) => !tierart || tiere.some((tier) => tier.tierart === tierart))
    .sort((a, b) => bandRank(a.band) - bandRank(b.band) || publicName(a.row).localeCompare(publicName(b.row), 'de'))
    .slice(0, MAX_RADAR)
    .map(({ row, band, tiere }) =>
      karteOf(row, {
        band,
        tiere,
        neueste: entriesOf(row.family_id, { limit: 1 }).eintraege[0] || null,
        folgeIch: Boolean(followsMeStmt.get(viewer.homeId, row.family_id))
      })
    )
  return { umkreis: max, ort, profile }
}

function followerOf(row) {
  const anzahl = followerCountStmt.get(row.family_id).n
  if (!row.follower_oeffentlich) return { anzahl }
  const namen = followerNamesStmt.all({ profil: row.family_id, isDemo: row.is_demo ?? 0 }).map(publicName)
  return { anzahl, namen, weitere: anzahl - namen.length }
}

function profilSeite(row, viewer, { vor = null, eigenes = false } = {}) {
  return karteOf(row, {
    aktiv: Boolean(row.aktiv && !row.gesperrt),
    eigenes,
    tiere: publicDogs(row.family_id),
    ...entriesOf(row.family_id, { vor }),
    follower: followerOf(row),
    folgeIch: Boolean(followsMeStmt.get(viewer.homeId, row.family_id)),
    ausgeblendet: Boolean(hiddenStmt.get(viewer.homeId, row.family_id))
  })
}

// Profilseite: sichtbar für die Welt der Sitzung - oder das eigene (dann wie die Vorschau, auch ausgeschaltet). 404 sonst.
function profilBySlug(viewer, slug, { vor = null } = {}) {
  const own = bySlugStmt.get(String(slug))
  if (own && own.family_id === viewer.homeId) return profilSeite(own, viewer, { vor, eigenes: true })
  const row = visibleBySlugStmt.get({ slug: String(slug), isDemo: demoFlag(viewer.isDemo) })
  if (!row) throw httpError(404, 'Profil nicht gefunden')
  return profilSeite({ ...row, is_demo: demoFlag(viewer.isDemo) }, viewer, { vor })
}

// „Mein Profil für andere“: genau die öffentliche Form des eigenen Bereichs - auch bevor es eingeschaltet ist.
function vorschau(viewer, familyId) {
  ensureProfil(familyId)
  const row = db.prepare(`SELECT ${PROFIL_COLUMNS_SQL}, f.is_demo FROM revier_profile p JOIN families f ON f.id = p.family_id
    WHERE p.family_id = ?`).get(familyId)
  return profilSeite(row, viewer, { eigenes: true })
}

// Profil-Spalten einzeln (nicht p.*): p.text ist der Profiltext und darf den Text der Erinnerung nicht überdecken.
const feedStmt = db.prepare(`SELECT ${ENTRY_COLUMNS_SQL}, p.slug, p.anzeigename, p.family_id, f.name AS family_name FROM revier_follows rf
  JOIN revier_profile p ON p.family_id = rf.profil_id JOIN families f ON f.id = p.family_id
  JOIN timeline_entries t ON ${PUBLIC_ENTRY_SQL} JOIN dogs d ON d.id = t.dog_id
  WHERE rf.follower_id = @viewer AND ${PROFIL_SICHTBAR_SQL} AND ${NOT_HIDDEN_SQL} AND (@vor IS NULL OR t.id < @vor)
  ORDER BY t.id DESC LIMIT @limit`)

// „Aus deinem Revier“: neueste öffentliche Erinnerungen gefolgter Profile, seitenweise (?vor=<letzte id>).
function feed(viewer, { vor = null, limit = SEITE } = {}) {
  const rows = feedStmt.all({ viewer: viewer.homeId, isDemo: demoFlag(viewer.isDemo), vor, limit: limit + 1 })
  const eintraege = rows.slice(0, limit).map((row) => ({
    ...toPublicEntry(row),
    profil: { slug: row.slug, name: publicName(row), bild: bildUrlOf(row) }
  }))
  return { eintraege, weiter: rows.length > limit ? eintraege[eintraege.length - 1].id : null }
}

const followingStmt = db.prepare(`SELECT ${PROFIL_COLUMNS_SQL} FROM revier_follows rf
  JOIN revier_profile p ON p.family_id = rf.profil_id JOIN families f ON f.id = p.family_id
  WHERE rf.follower_id = @viewer AND ${PROFIL_SICHTBAR_SQL} ORDER BY COALESCE(p.anzeigename, f.name) COLLATE NOCASE`)

function folgeIch(viewer) {
  return { profile: followingStmt.all({ viewer: viewer.homeId, isDemo: demoFlag(viewer.isDemo) }).map((row) => karteOf(row)) }
}

// Bild eines Profils (bereich_profil.bild_file) - nur für Sitzungen, die das Profil sehen dürfen, oder den Inhaber.
function bildFileForSlug(viewer, slug) {
  const row = bySlugStmt.get(String(slug))
  if (!row) return null
  const allowed = row.family_id === viewer.homeId || visibleBySlugStmt.get({ slug: row.slug, isDemo: demoFlag(viewer.isDemo) })
  return allowed ? bildFileOf(row.family_id) : null
}

const viewerStmt = db.prepare("SELECT is_demo FROM families WHERE id = ? AND art = 'zuhause'")
const dogPhotoStmt = db.prepare(`SELECT 1 FROM dogs d JOIN revier_tiere rt ON rt.dog_id = d.id
  JOIN revier_profile p ON p.family_id = d.family_id JOIN families f ON f.id = p.family_id
  WHERE d.foto_url = @url AND ${PROFIL_SICHTBAR_SQL} LIMIT 1`)
const entryPhotoStmt = db.prepare(`SELECT 1 FROM revier_eintraege re JOIN timeline_entries t ON t.id = re.entry_id
  JOIN revier_profile p ON p.family_id = t.family_id JOIN families f ON f.id = p.family_id
  WHERE t.foto_urls LIKE @pattern AND ${PUBLIC_ENTRY_SQL} AND ${PROFIL_SICHTBAR_SQL} LIMIT 1`)

// Für lib/uploadAccess.js canSeeUpload: Tierfoto eines öffentlichen Tiers oder Foto einer öffentlichen Erinnerung eines
// sichtbaren Profils - nur für eine Haushalts-Identität (eigenes Zuhause) derselben Welt. Nur ansehen, nie anhängen.
function isRevierPhoto(homeId, { url, pattern }) {
  if (!Number.isInteger(homeId)) return false
  const viewer = viewerStmt.get(homeId)
  if (!viewer) return false
  const params = { url, pattern, isDemo: viewer.is_demo ? 1 : 0 }
  return Boolean(dogPhotoStmt.get(params) || entryPhotoStmt.get(params))
}

module.exports = { radar, profilBySlug, vorschau, feed, folgeIch, bildFileForSlug, isRevierPhoto, PUBLIC_DOGS_SQL }
