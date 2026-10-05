'use strict'

// Phase V2: "Erlebt mit" (Tabelle erlebt_mit, db.js). Wer in seinem eigenen Zuhause einen nicht-privaten Eintrag
// schreibt, kann Tiere verbundener Zuhause markieren (Besuch in einer der Richtungen oder gemeinsame Familie, siehe
// lib/visits.js CONNECTED_HOMES_SQL). Die Besitzer des markierten Tiers bekommen eine Anfrage ("Wilma war dabei -
// übernehmen?"); erst nach "bestätigen" erscheint der Eintrag gespiegelt in der Chronik ihres Tiers - als Verweis auf
// den Original-Eintrag, keine Kopie, und nur solange die Verbindung besteht und der Eintrag nicht privat ist.
// "ablehnen" blendet die Markierung überall aus. Auf der Seite der Autorin steht "erlebt mit Wilma" sofort.
// Bewusst ohne Abhängigkeit zu lib/context.js (buildMe braucht countOpenRequests).

const db = require('../db')
const { CONNECTED_HOMES_SQL } = require('./visits')

const MAX_TAGS = 10
// security-review V2 (L-3): höchstens so viele offene Anfragen eines Zuhauses an ein anderes - sonst ließe sich dessen
// Anfragen-Liste fluten; die Liste selbst zeigt höchstens OPEN_LIST_LIMIT.
const MAX_OPEN_PER_HOME = 20
const OPEN_LIST_LIMIT = 100
const STATUS = { offen: 'offen', bestaetigt: 'bestaetigt', abgelehnt: 'abgelehnt' }

const NOT_TAGGABLE_MESSAGE = 'Dieses Tier kannst du nicht markieren – nur Tiere von Zuhausen, mit denen ihr verbunden seid.'
const PRIVATE_MESSAGE = 'Private Einträge können keine anderen Tiere markieren.'
const ONLY_HOME_MESSAGE = '„Mit dabei“ gibt es nur in „Mein Zuhause“.'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Tiere, die homeId markieren darf: alle Tiere eines Zuhauses, mit dem ein Besuch besteht (in einer der beiden
// Richtungen), und die Tiere anderer Zuhause, die in eine gemeinsame Familie geteilt sind - nie die eigenen, nie über
// die Demo-Grenze hinweg.
const TAGGABLE_SQL = `
  SELECT d.id, d.name, d.name_unbekannt, d.tierart, f.id AS zuhauseId, f.name AS zuhause
  FROM dogs d JOIN families f ON f.id = d.family_id AND f.art = 'zuhause'
  WHERE d.family_id != @homeId
    AND f.is_demo = (SELECT is_demo FROM families WHERE id = @homeId)
    AND (
      d.family_id IN (SELECT gastgeber_family_id FROM besuche WHERE gast_family_id = @homeId
                      UNION SELECT gast_family_id FROM besuche WHERE gastgeber_family_id = @homeId)
      OR d.id IN (SELECT ds.dog_id FROM dog_shares ds JOIN family_members m ON m.group_family_id = ds.family_id
                  WHERE m.member_family_id = @homeId)
    )
  ORDER BY f.name COLLATE NOCASE, d.name COLLATE NOCASE, d.id`
const taggableStmt = db.prepare(TAGGABLE_SQL)

function taggableDogs(homeId) {
  return taggableStmt.all({ homeId }).map(({ name_unbekannt, ...dog }) => ({ ...dog, nameUnbekannt: Boolean(name_unbekannt) }))
}

// Eingabe { erlebtMit: [dogId, ...] } -> eindeutige, positive Ganzzahlen (höchstens MAX_TAGS) oder 400.
function cleanTagList(value) {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > MAX_TAGS || !value.every((id) => Number.isInteger(id) && id > 0)) {
    throw httpError(400, `„Mit dabei“: höchstens ${MAX_TAGS} Tiere`)
  }
  return [...new Set(value)]
}

const listEntryTagsStmt = db.prepare('SELECT id, dog_id, status FROM erlebt_mit WHERE entry_id = ?')
const reopenConfirmedStmt = db.prepare(
  "UPDATE erlebt_mit SET status = 'offen', entschieden_at = NULL, created_at = datetime('now') WHERE entry_id = ? AND status = 'bestaetigt'"
)
const insertTagStmt = db.prepare("INSERT INTO erlebt_mit (entry_id, dog_id, status) VALUES (?, ?, 'offen')")
const findDogFamilyStmt = db.prepare('SELECT family_id FROM dogs WHERE id = ?').pluck()
const deleteTagStmt = db.prepare('DELETE FROM erlebt_mit WHERE id = ?')
const clearTagsStmt = db.prepare('DELETE FROM erlebt_mit WHERE entry_id = ?')

// Prüft die Markierungen eines Eintrags im Zuhause homeId VOR dem Speichern (wirft 400). privat: der Eintrag ist
// (nach dem Speichern) privat - dann sind keine Markierungen erlaubt.
function assertTaggable(homeId, dogIds, { privat }) {
  if (dogIds.length === 0) return
  if (privat) throw httpError(400, PRIVATE_MESSAGE)
  const allowed = new Set(taggableStmt.all({ homeId }).map((dog) => dog.id))
  if (!dogIds.every((id) => allowed.has(id))) throw httpError(400, NOT_TAGGABLE_MESSAGE)
}

// Gleicht die Markierungen eines Eintrags an dogIds an (innerhalb der Speicher-Transaktion aufrufen, NACH
// assertTaggable): neue werden angefragt ('offen'), weggenommene verschwinden - eine abgelehnte Markierung bleibt
// stehen (ausgeblendet), damit dasselbe Tier nicht mit jedem Speichern erneut angefragt wird.
// Offene Anfragen des Zuhauses authorId (Einträge mit family_id = authorId) an das Zuhause targetId.
const countOpenBetweenStmt = db.prepare(
  `SELECT COUNT(*) AS c FROM erlebt_mit em
   JOIN timeline_entries t ON t.id = em.entry_id JOIN dogs w ON w.id = em.dog_id
   WHERE em.status = 'offen' AND t.family_id = ? AND w.family_id = ?`
)
const findTargetStmt = db.prepare('SELECT d.family_id AS homeId, f.name FROM dogs d JOIN families f ON f.id = d.family_id WHERE d.id = ?')
const findEntryFamilyStmt = db.prepare('SELECT family_id FROM timeline_entries WHERE id = ?').pluck()

// 409, wenn neue Anfragen die Grenze MAX_OPEN_PER_HOME je Ziel-Zuhause überschreiten würden (security-review V2, L-3).
function assertOpenRequestLimit(authorId, newDogIds) {
  const perTarget = new Map()
  for (const dogId of newDogIds) {
    const target = findTargetStmt.get(dogId)
    if (!target) continue
    const entry = perTarget.get(target.homeId) || { name: target.name, count: 0 }
    perTarget.set(target.homeId, { ...entry, count: entry.count + 1 })
  }
  for (const [targetId, { name, count }] of perTarget) {
    if (countOpenBetweenStmt.get(authorId, targetId).c + count > MAX_OPEN_PER_HOME) {
      throw httpError(409, `Ihr habt schon ${MAX_OPEN_PER_HOME} offene „Mit dabei“-Anfragen an „${name}“ – wartet, bis sie entschieden sind.`)
    }
  }
}

function syncTags(entryId, dogIds) {
  const wanted = new Set(dogIds)
  const existing = listEntryTagsStmt.all(entryId)
  const existingDogs = new Set(existing.map((row) => row.dog_id))
  for (const row of existing) {
    if (!wanted.has(row.dog_id) && row.status !== STATUS.abgelehnt) deleteTagStmt.run(row.id)
  }
  const added = [...wanted].filter((dogId) => !existingDogs.has(dogId))
  assertOpenRequestLimit(findEntryFamilyStmt.get(entryId), added)
  for (const dogId of added) insertTagStmt.run(entryId, dogId)
  notifyOwners(findEntryFamilyStmt.get(entryId), added)
}

// Neue „Mit dabei“-Anfragen: die Besitzer der markierten Tiere erfahren es aufs Handy (lib/push.js) - je Zuhause einmal,
// nie das eigene. Erst nach der Transaktion der Route wirksam (notifyHome verschickt per setImmediate).
function notifyOwners(authorId, dogIds) {
  const { EREIGNIS, notifyHome } = require('./push')
  const owners = new Set(dogIds.map((dogId) => findDogFamilyStmt.get(dogId)).filter((id) => Number.isInteger(id) && id !== authorId))
  for (const ownerId of owners) notifyHome(ownerId, EREIGNIS.mitDabei)
}

function clearTags(entryId) {
  clearTagsStmt.run(entryId)
}

// Ändert die Autorin Titel, Text, Datum oder Fotos eines schon bestätigten Eintrags, muss die andere Seite erneut
// zustimmen - sonst ließe sich nach der Bestätigung ein ganz anderer Inhalt in deren Chronik schieben
// (security-review Phase V2, MEDIUM-2). Innerhalb der Speicher-Transaktion aufrufen.
function reopenConfirmedTags(entryId) {
  reopenConfirmedStmt.run(entryId)
}

// Markierungen für die Ansicht der Autorin (ihr eigenes Zuhause homeId): je Eintrag [{ id, dogId, name, zuhause,
// status }], ohne abgelehnte. entryIds: Einträge, die dem aktiven Bereich gehören. Ist das Zuhause des Tiers nicht
// mehr verbunden (security-review V2, L-1), bleibt nur { id, status, getrennt: true } - ohne den heutigen Namen des
// Tiers oder seines Zuhauses.
const tagsForEntriesStmt = db.prepare(
  `SELECT em.id, em.entry_id, em.dog_id AS dogId, d.name, d.name_unbekannt, f.name AS zuhause, em.status,
     (d.family_id IN ${CONNECTED_HOMES_SQL}) AS verbunden
   FROM erlebt_mit em JOIN dogs d ON d.id = em.dog_id JOIN families f ON f.id = d.family_id
   WHERE em.entry_id IN (SELECT value FROM json_each(@ids)) AND em.status != 'abgelehnt'
   ORDER BY d.name COLLATE NOCASE, em.id`
)

function toTag({ entry_id, name_unbekannt, verbunden, ...tag }) {
  if (!verbunden) return { id: tag.id, status: tag.status, getrennt: true }
  return { ...tag, nameUnbekannt: Boolean(name_unbekannt) }
}

function tagsForEntries(entryIds, homeId) {
  if (entryIds.length === 0) return new Map()
  const rows = tagsForEntriesStmt.all({ ids: JSON.stringify(entryIds), homeId })
  const byEntry = new Map()
  for (const row of rows) byEntry.set(row.entry_id, [...(byEntry.get(row.entry_id) || []), toTag(row)])
  return byEntry
}

// Gemeinsame Bedingung für alles, was die Besitzer des markierten Tiers (@homeId) sehen: das Tier gehört ihnen, der
// Eintrag ist nicht privat und sein Zuhause ist (noch) mit ihnen verbunden. Aliase em, t, w (das markierte Tier).
const OWNER_VIEW_SQL = `w.family_id = @homeId AND t.privat = 0 AND t.family_id IN ${CONNECTED_HOMES_SQL}`

const ENTRY_COLUMNS_SQL = `t.id, t.dog_id, t.autor_name, t.datum, t.titel, t.text, t.foto_urls, t.created_at,
  od.id AS tierId, od.name AS tier, od.name_unbekannt AS tierNameUnbekannt, f.id AS zuhauseId, f.name AS zuhause,
  w.id AS dogId, w.name AS dogName`

const ownerViewFrom = `FROM erlebt_mit em
  JOIN timeline_entries t ON t.id = em.entry_id
  JOIN dogs od ON od.id = t.dog_id
  JOIN families f ON f.id = t.family_id
  JOIN dogs w ON w.id = em.dog_id`

const openRequestsStmt = db.prepare(
  `SELECT em.id AS requestId, em.created_at AS angefragtAm, ${ENTRY_COLUMNS_SQL} ${ownerViewFrom}
   WHERE em.status = 'offen' AND ${OWNER_VIEW_SQL}
   ORDER BY em.created_at DESC, em.id DESC
   LIMIT ${OPEN_LIST_LIMIT}`
)
// „Alle von {Zuhause} ablehnen“ (security-review V2, L-3): alle offenen, für homeId sichtbaren Anfragen aus fromId.
const rejectAllFromStmt = db.prepare(
  `UPDATE erlebt_mit SET status = 'abgelehnt', entschieden_at = datetime('now')
   WHERE id IN (SELECT em.id ${ownerViewFrom} WHERE em.status = 'offen' AND t.family_id = @fromId AND ${OWNER_VIEW_SQL})`
)
const countOpenStmt = db.prepare(`SELECT COUNT(*) AS c ${ownerViewFrom} WHERE em.status = 'offen' AND ${OWNER_VIEW_SQL}`)
const mirroredStmt = db.prepare(
  `SELECT em.id AS requestId, ${ENTRY_COLUMNS_SQL} ${ownerViewFrom}
   WHERE em.status = 'bestaetigt' AND em.dog_id = @dogId AND ${OWNER_VIEW_SQL}
   ORDER BY t.datum, t.id`
)
const findDecidableStmt = db.prepare(
  `SELECT em.id, em.status ${ownerViewFrom} WHERE em.id = @id AND em.status IN ('offen', 'bestaetigt') AND ${OWNER_VIEW_SQL}`
)
const decideStmt = db.prepare("UPDATE erlebt_mit SET status = ?, entschieden_at = datetime('now') WHERE id = ?")

function toRequestEntry({ foto_urls, tierNameUnbekannt, ...rest }) {
  return { ...rest, foto_urls: JSON.parse(foto_urls), tierNameUnbekannt: Boolean(tierNameUnbekannt) }
}

// Offene Anfragen an das Zuhause homeId: [{ requestId, angefragtAm, dogId, dogName (das eigene Tier), tier (das Tier
// des Eintrags), zuhause, titel, datum, text, foto_urls, autor_name, ... }]
function openRequests(homeId) {
  return openRequestsStmt.all({ homeId }).map(toRequestEntry)
}

function countOpenRequests(homeId) {
  return countOpenStmt.get({ homeId }).c
}

// Bestätigte, noch sichtbare Einträge anderer Zuhause, die das eigene Tier dogId markieren - für dessen Chronik.
function mirroredEntries(homeId, dogId) {
  return mirroredStmt.all({ homeId, dogId }).map(toRequestEntry)
}

// bestaetigen/ablehnen durch die Besitzer des markierten Tiers. Ablehnen geht auch nach einer Bestätigung (der
// gespiegelte Eintrag verschwindet wieder). 404 für alles, was homeId nicht (mehr) sehen darf.
function decideRequest(homeId, id, status) {
  const row = Number.isInteger(id) ? findDecidableStmt.get({ id, homeId }) : null
  if (!row) throw httpError(404, 'Diese Anfrage gibt es nicht')
  if (status === STATUS.bestaetigt && row.status !== STATUS.offen) throw httpError(404, 'Diese Anfrage gibt es nicht')
  decideStmt.run(status, id)
  return { id, status }
}

// Gibt die Anzahl abgelehnter Anfragen zurück (0, wenn es keine gab).
function rejectAllFrom(homeId, fromId) {
  return Number.isInteger(fromId) ? rejectAllFromStmt.run({ homeId, fromId }).changes : 0
}

// Fotos eines markierten Eintrags sieht das Zuhause homeId, solange die Markierung offen oder bestätigt ist (für die
// Anfrage bzw. die gespiegelte Chronik) - nicht anhängbar (lib/uploadAccess.js nur canSeeUpload). Alias t.
const mirroredPhotoStmt = db.prepare(
  `SELECT 1 ${ownerViewFrom} WHERE t.foto_urls LIKE @pattern AND em.status IN ('offen', 'bestaetigt') AND ${OWNER_VIEW_SQL} LIMIT 1`
)

function isMirroredPhoto(homeId, pattern) {
  return Boolean(mirroredPhotoStmt.get({ homeId, pattern }))
}

module.exports = {
  MAX_TAGS,
  STATUS,
  ONLY_HOME_MESSAGE,
  taggableDogs,
  cleanTagList,
  assertTaggable,
  syncTags,
  clearTags,
  reopenConfirmedTags,
  tagsForEntries,
  openRequests,
  countOpenRequests,
  mirroredEntries,
  decideRequest,
  rejectAllFrom,
  isMirroredPhoto,
  MAX_OPEN_PER_HOME,
  OPEN_LIST_LIMIT
}
