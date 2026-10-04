const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { isIsoDate, cleanText, cleanId, cleanPhotoList } = require('../lib/validate')
const { ART, VISIBLE_DOGS_SQL, OWN_DOGS_SQL, VISIBLE_ENTRY_SQL, VISIBLE_COMMENT_SQL } = require('../lib/context')
const { GUEST_ENTRY_SQL, GUEST_COMMENT_SQL } = require('../lib/visits')
const { readTagInput, applyTags, entryContentChanged, withTags, mirroredForDog } = require('../lib/erlebtMitView')
const { canAttachUpload, canAttachPublicUpload } = require('../lib/uploadAccess')
const { requireRole, FORBIDDEN_MESSAGE } = require('../lib/roles')
const { authorContext, withAuthorFlags, mayDeleteInArea } = require('../lib/authorship')

const router = express.Router()

// Phase R Task 1 (lib/roles.js): Einträge schreiben, ändern und löschen braucht in einer Familie
// mindestens 'mitglied'; kommentieren darf schon ein 'gast'. Kommentare löschen (Phase R Task 2,
// lib/authorship.js): in einer Familie die Autorin selbst oder ab Stellvertretung (Moderation).
const canWrite = requireRole('mitglied')
const canComment = requireRole('gast')

const MAX_COMMENT_LENGTH = 1000
// Phase T Task 2: Kategorien für die Tierheim-Chronik; kategorie bleibt auch außerhalb eines
// Tierheims erlaubt (rein kosmetisch, keine Rechteprüfung nötig) - nur isPublic ist Tierheim-exklusiv.
const KATEGORIEN = ['ankunft', 'tierarzt', 'verhalten', 'training', 'gassi', 'sonstiges']

const hasKey = (body, key) => Object.prototype.hasOwnProperty.call(body, key)

// Phase V2: eine Besuchs-Sitzung (req.isGuest, middleware/auth.js) sieht im besuchten Zuhause nur dessen nicht-private
// Einträge und von den Kommentaren nur die eigenen und die des Gastgebers (lib/visits.js). Beide SQL-Teile erwarten
// @familyId (aktiver Bereich) und - für Gäste - @homeId (die Identität des Gasts), siehe viewParams.
const entrySql = (req) => (req.isGuest ? GUEST_ENTRY_SQL : VISIBLE_ENTRY_SQL)
const commentSql = (req) => (req.isGuest ? GUEST_COMMENT_SQL : VISIBLE_COMMENT_SQL)
const viewParams = (req) => ({ familyId: req.familyId, homeId: req.homeId })
// leerer String/undefined/null -> null (kein Wunsch), sonst der Wert unverändert (Enum-Prüfung folgt)
const cleanEnum = (value) => (value === null || value === undefined || value === '' ? null : value)
const findFamilyArt = db.prepare('SELECT art FROM families WHERE id = ?')

// herkunft_family_id ist ein reiner internes Verweisfeld (siehe lib/transfers.js) - Finding 14 des
// security-reviews: nicht direkt nach außen geben, sondern nur über herkunft_name (siehe die JOINs in
// GET /recent, GET / und findEntryById unten), das schon auf den öffentlich zumutbaren Partner-/
// Familiennamen abgebildet ist.
function toEntry(row, comments = []) {
  const { herkunft_family_id, ...rest } = row
  return { ...rest, foto_urls: JSON.parse(row.foto_urls), comments }
}

// Kommentare aller im Bereich sichtbaren Einträge in einer Abfrage statt einer pro Eintrag.
// Zeigt nur Kommentare, die im jeweiligen Bereich sichtbar sind (VISIBLE_COMMENT_SQL):
// der Eintrag-Eigentümer sieht alle, andere Bereiche nur ihre eigenen plus die des Eigentümers.
// Jeder Kommentar trägt vonMir/ehemalig (Phase R Task 2, lib/authorship.js); author_family_id bleibt innen.
// security-review Phase V2 (L-4): Kommentare eines Gasts (geschrieben unter seinem Zuhause, family_id = Zuhause des
// Gasts statt des Eintrags) tragen gastZuhause - den echten Namen dieses Zuhauses, vom Server, nicht frei eingetippt.
// So kann sich ein Gast nicht mit einem frei gewählten Namen als Gastgeber ausgeben. Erwartet Aliase c und t.
const GUEST_HOME_JOIN_SQL = `LEFT JOIN families gf ON gf.id = c.family_id AND c.family_id != t.family_id AND gf.art = 'zuhause'`

function toComment(row, ctx) {
  const { gast_zuhause, ...comment } = row
  const flagged = withAuthorFlags(comment, ctx)
  return gast_zuhause ? { ...flagged, gastZuhause: gast_zuhause } : flagged
}

function commentsByEntry(req, dogId) {
  const ctx = authorContext(req)
  const rows = db
    .prepare(
      `SELECT c.*, gf.name AS gast_zuhause FROM entry_comments c JOIN timeline_entries t ON t.id = c.entry_id
       ${GUEST_HOME_JOIN_SQL}
       WHERE ${entrySql(req)} AND (@dogId IS NULL OR t.dog_id = @dogId) AND ${commentSql(req)}
       ORDER BY c.created_at, c.id`
    )
    .all({ ...viewParams(req), dogId })
  const grouped = new Map()
  for (const row of rows) grouped.set(row.entry_id, [...(grouped.get(row.entry_id) || []), toComment(row, ctx)])
  return grouped
}

// Alle Kommentare eines eigenen Eintrags (Antwort von PUT /:id - der Eigentümer sieht alle).
function commentsOf(req, entryId) {
  const ctx = authorContext(req)
  return db
    .prepare(
      `SELECT c.*, gf.name AS gast_zuhause FROM entry_comments c JOIN timeline_entries t ON t.id = c.entry_id
       ${GUEST_HOME_JOIN_SQL}
       WHERE c.entry_id = ? ORDER BY c.created_at, c.id`
    )
    .all(entryId)
    .map((row) => toComment(row, ctx))
}

// herkunft_name (security-review Phase T Finding 14): der öffentlich zumutbare Name der Herkunfts-
// Familie eines migrierten Eintrags (siehe lib/transfers.js herkunft_family_id) - der admin-gepflegte
// Partnername, wenn die Herkunftsfamilie ein (noch bestehender) Tierheim-Bereich mit Partner ist, sonst
// deren eigener Name, sonst null. hf.art='tierheim' UND der COALESCE-Fallback auf hf.name (nicht ein
// hartes Erfordernis eines Partners) halten das robust gegen Alt-/Testdaten ohne partner_id.
const HERKUNFT_NAME_JOIN_SQL = `
  LEFT JOIN families hf ON hf.id = t.herkunft_family_id AND hf.art = 'tierheim'
  LEFT JOIN partners hp ON hp.id = hf.partner_id`
const HERKUNFT_NAME_SELECT_SQL = 'COALESCE(hp.name, hf.name) AS herkunft_name'

// Einzelner Eintrag inkl. herkunft_name, für die Antworten von POST/PUT - keine zusätzliche
// Sichtbarkeitsprüfung nötig, die Aufrufer haben Eigentümerschaft schon vorher festgestellt.
const findEntryById = db.prepare(
  `SELECT t.*, ${HERKUNFT_NAME_SELECT_SQL} FROM timeline_entries t ${HERKUNFT_NAME_JOIN_SQL} WHERE t.id = ?`
)

// Validiert Titel/Datum/Autor/Text/Fotos/Privat/Kategorie/Öffentlich. Liefert { error } oder { values }.
// existingPrivat/existingKategorie/existingIsPublic: der Wert, der gilt, wenn der Body das jeweilige
// Feld nicht mitschickt (PUT ändert es dann nicht; POST hat naturgemäß keinen bestehenden Wert).
// existingFotoUrls: die bisherigen Fotos bei PUT ([] bei POST) - bleiben erlaubt, auch wenn sie gerade
// nicht (mehr) über canAttachUpload sichtbar wären (Altbestand, siehe lib/uploadAccess.js).
function readEntryInput(body, req, existingPrivat = 0, existingFotoUrls = [], existingKategorie = null, existingIsPublic = 0) {
  const values = {
    autor_name: cleanText(body.autorName, 60),
    datum: body.datum,
    titel: cleanText(body.titel, 120),
    text: cleanText(body.text, 5000),
    foto_urls: cleanPhotoList(body.fotoUrls),
    privat: hasKey(body, 'privat') ? (body.privat ? 1 : 0) : existingPrivat,
    kategorie: hasKey(body, 'kategorie') ? cleanEnum(body.kategorie) : existingKategorie,
    is_public: hasKey(body, 'isPublic') ? (body.isPublic ? 1 : 0) : existingIsPublic
  }
  if (!values.autor_name || !values.titel || !values.datum) {
    return { error: 'Name, Datum und Titel sind erforderlich' }
  }
  if (!isIsoDate(values.datum)) return { error: 'Datum ist ungültig' }
  if (values.foto_urls === null) return { error: 'Fotoliste ist ungültig' }
  if (values.kategorie !== null && !KATEGORIEN.includes(values.kategorie)) return { error: 'Unbekannte Kategorie' }
  if (values.is_public && values.privat) {
    return { error: 'Ein Eintrag kann nicht gleichzeitig privat und öffentlich (Steckbrief) sein' }
  }
  const identity = findFamilyArt.get(req.familyId)
  const isShelterArea = identity?.art === ART.tierheim
  if (values.is_public && !isShelterArea) {
    return { error: '„Im Steckbrief zeigen“ gibt es nur für Tiere des Tierheims' }
  }
  // security-review Phase T Finding 9: ein Tierheim-Bereich wird gemeinsam vom ganzen Team genutzt -
  // "privat" hat dort niemanden, vor dem es etwas verbergen könnte, und ein bei der Übergabe (lib/
  // transfers.js transferDog fasst "privat" nicht an) unverändert mitziehender privater Eintrag würde
  // dem neuen Zuhause ungefiltert zufallen, ohne dass das je beabsichtigt war. Nur neue Schreibzugriffe
  // werden geprüft - schon bestehende Altdaten bleiben unangetastet.
  if (values.privat && isShelterArea) {
    return { error: 'Im Tierheim gibt es keine privaten Einträge' }
  }
  const uploadContext = { familyId: req.familyId, homeId: req.homeId }
  // security-review Phase T Finding 6: ein öffentlicher (isPublic) Eintrag darf nur Fotos verwenden, die
  // der Bereich SELBST hochgeladen hat (oder die schon vorher auf dem Eintrag standen) - sonst könnte
  // ein Tierheim mit Mitlese-Freigabe (dog_shares) ein privates Adoptanten-Foto über einen eigenen
  // öffentlichen Eintrag veröffentlichen.
  const attachAllowed = values.is_public
    ? (url) => canAttachPublicUpload({ familyId: req.familyId }, url, existingFotoUrls)
    : (url) => canAttachUpload(uploadContext, url, existingFotoUrls)
  if (!values.foto_urls.every(attachAllowed)) {
    return { error: 'Foto nicht gefunden' }
  }
  return { values: { ...values, foto_urls: JSON.stringify(values.foto_urls) } }
}

// Für Schreibzugriffe (PUT/DELETE): nur der eigene Eintrag zählt
function loadOwnEntry(req, res) {
  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(req.params.id)
  if (!entry || entry.family_id !== req.familyId) {
    res.status(404).json({ error: 'Eintrag nicht gefunden' })
    return null
  }
  return entry
}

const findVisibleEntry = db.prepare(`SELECT t.* FROM timeline_entries t WHERE t.id = @id AND ${VISIBLE_ENTRY_SQL}`)
const findGuestEntry = db.prepare(`SELECT t.* FROM timeline_entries t WHERE t.id = @id AND ${GUEST_ENTRY_SQL}`)

// Für Kommentare: eigener Eintrag oder ein geteilter, nicht-privater Eintrag (als Gast: ein nicht-privater des Gastgebers)
function loadVisibleEntry(req, res) {
  const entry = (req.isGuest ? findGuestEntry : findVisibleEntry).get({ id: req.params.id, familyId: req.familyId })
  if (!entry) {
    res.status(404).json({ error: 'Eintrag nicht gefunden' })
    return null
  }
  return entry
}

const RECENT_DEFAULT = 6
const RECENT_MAX = 20

// Wo das Tier wohnt (dog_zuhause): der Name seines Zuhauses bzw. der Familie, der es selbst gehört - nie das eigene
// Zuhause (@homeId) und nur für ein Tier, das der Bereich gerade zeigt (als Gast nur die Tiere des Gastgebers). Dessen
// Zuhause nennt dort ohnehin GET /api/dogs (shared_from); eine Id gibt es nie.
const dogHomeSql = (req) => `CASE WHEN d.family_id != @homeId AND d.id IN ${req.isGuest ? OWN_DOGS_SQL : VISIBLE_DOGS_SQL}
  THEN (SELECT f.name FROM families f WHERE f.id = d.family_id) END`

// "Was treiben die anderen?": zuletzt geschriebene Einträge, die im Bereich sichtbar sind
// (eigene und geteilte nicht-private). comment_count zählt ALLE Kommentare, nicht nur eigene.
router.get('/recent', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || RECENT_DEFAULT, 1), RECENT_MAX)
  const rows = db
    .prepare(
      `SELECT t.*, d.name AS dog_name, d.name_unbekannt AS dog_name_unbekannt, d.rasse AS dog_rasse,
              d.foto_url AS dog_foto_url, ${dogHomeSql(req)} AS dog_zuhause,
              (SELECT COUNT(*) FROM entry_comments c WHERE c.entry_id = t.id AND ${commentSql(req)}) AS comment_count,
              ${HERKUNFT_NAME_SELECT_SQL}
       FROM timeline_entries t JOIN dogs d ON d.id = t.dog_id
       ${HERKUNFT_NAME_JOIN_SQL}
       WHERE ${entrySql(req)}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT @limit`
    )
    .all({ ...viewParams(req), limit })
  res.json(rows.map((row) => toEntry(row)))
})

// B+ Familienalbum: „Heute vor einem Jahr“ auf Start - Erinnerungen vom selben Tag (Monat und Tag von ?tag=JJJJ-MM-TT, dem
// heutigen Tag des Geräts) in früheren Jahren, mit denselben Sichtregeln und Feldern wie /recent. Höchstens drei, solche mit
// Fotos zuerst, dann die jüngsten Jahre.
const JAHRESTAG_MAX = 3

router.get('/jahrestag', requireAuth, (req, res) => {
  const tag = req.query.tag
  if (!isIsoDate(tag)) return res.status(400).json({ error: 'tag ist ungültig' })
  const rows = db
    .prepare(
      `SELECT t.*, d.name AS dog_name, d.name_unbekannt AS dog_name_unbekannt, d.rasse AS dog_rasse,
              d.foto_url AS dog_foto_url,
              (SELECT COUNT(*) FROM entry_comments c WHERE c.entry_id = t.id AND ${commentSql(req)}) AS comment_count,
              ${HERKUNFT_NAME_SELECT_SQL}
       FROM timeline_entries t JOIN dogs d ON d.id = t.dog_id
       ${HERKUNFT_NAME_JOIN_SQL}
       WHERE ${entrySql(req)} AND substr(t.datum, 6, 5) = @monatTag AND t.datum < @jahresAnfang
       ORDER BY (t.foto_urls != '[]') DESC, t.datum DESC, t.id DESC
       LIMIT @limit`
    )
    .all({ ...viewParams(req), monatTag: tag.slice(5, 10), jahresAnfang: `${tag.slice(0, 4)}-01-01`, limit: JAHRESTAG_MAX })
  res.json(rows.map((row) => toEntry(row)))
})

// Chronologisch aufsteigend: die Timeline erzählt das Leben von der Geburt an.
// Sichtbar sind eigene Einträge (auch private) und geteilte nicht-private Einträge.
router.get('/', requireAuth, (req, res) => {
  const dogId = cleanId(req.query.dogId)
  if (Number.isNaN(dogId)) return res.status(400).json({ error: 'dogId ist ungültig' })

  const rows = db
    .prepare(
      `SELECT t.*, ${HERKUNFT_NAME_SELECT_SQL} FROM timeline_entries t
       ${HERKUNFT_NAME_JOIN_SQL}
       WHERE ${entrySql(req)} AND (@dogId IS NULL OR t.dog_id = @dogId)
       ORDER BY t.datum, t.id`
    )
    .all({ ...viewParams(req), dogId })
  const comments = commentsByEntry(req, dogId)
  // Phase V2 "Erlebt mit": im eigenen Zuhause tragen eigene Einträge ihre Markierungen, und die Chronik eines Tiers
  // zeigt bestätigte Einträge verbundener Zuhause gespiegelt dazu (lib/erlebtMitView.js).
  const entries = withTags(req, rows.map((row) => toEntry(row, comments.get(row.id))))
  res.json([...entries, ...mirroredForDog(req, dogId)])
})

// readTagInput wirft 400 mit Meldung; alles andere ist ein echter Fehler.
function readTags(body, req, privat, res) {
  try {
    return { tags: readTagInput(body, req, privat) }
  } catch (err) {
    if (!err.status) throw err
    res.status(err.status).json({ error: err.message })
    return null
  }
}

const insertEntry = db.prepare(
  `INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text, foto_urls, privat, kategorie, is_public)
   VALUES (@dog_id, @family_id, @autor_name, @datum, @titel, @text, @foto_urls, @privat, @kategorie, @is_public)`
)
const updateEntry = db.prepare(
  `UPDATE timeline_entries
   SET autor_name = @autor_name, datum = @datum, titel = @titel, text = @text, foto_urls = @foto_urls,
       privat = @privat, kategorie = @kategorie, is_public = @is_public
   WHERE id = @id`
)

// Eintrag und seine "Erlebt mit"-Markierungen zusammen: ein Absturz dazwischen darf keine halbe Markierung hinterlassen.
const createEntryWithTags = db.transaction((values, tags) => {
  const entryId = insertEntry.run(values).lastInsertRowid
  applyTags(entryId, tags, values.privat)
  return entryId
})
const updateEntryWithTags = db.transaction((values, tags, contentChanged) => {
  updateEntry.run(values)
  applyTags(values.id, tags, values.privat, { contentChanged })
})

router.post('/', requireAuth, canWrite, (req, res) => {
  const body = req.body || {}
  const dogId = cleanId(body.dogId)
  if (!dogId) return res.status(400).json({ error: 'dogId ist erforderlich' })

  const { error, values } = readEntryInput(body, req)
  if (error) return res.status(400).json({ error })

  const dog = db.prepare('SELECT id, family_id FROM dogs WHERE id = ?').get(dogId)
  if (!dog || dog.family_id !== req.familyId) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Hund' })
  }
  const tagInput = readTags(body, req, values.privat, res)
  if (!tagInput) return

  const entryId = createEntryWithTags({ ...values, dog_id: dogId, family_id: req.familyId }, tagInput.tags)
  const entry = findEntryById.get(entryId)
  res.status(201).json(withTags(req, [toEntry(entry)])[0])
})

router.put('/:id', requireAuth, canWrite, (req, res) => {
  const existing = loadOwnEntry(req, res)
  if (!existing) return

  const { error, values } = readEntryInput(
    req.body || {},
    req,
    existing.privat,
    JSON.parse(existing.foto_urls),
    existing.kategorie,
    existing.is_public
  )
  if (error) return res.status(400).json({ error })
  const tagInput = readTags(req.body || {}, req, values.privat, res)
  if (!tagInput) return

  updateEntryWithTags({ ...values, id: existing.id }, tagInput.tags, entryContentChanged(existing, values))
  const entry = findEntryById.get(existing.id)
  res.json(withTags(req, [toEntry(entry, commentsOf(req, entry.id))])[0])
})

const deleteEntry = db.transaction((entryId) => {
  db.prepare('DELETE FROM entry_comments WHERE entry_id = ?').run(entryId)
  db.prepare('DELETE FROM timeline_entries WHERE id = ?').run(entryId)
})

router.delete('/:id', requireAuth, canWrite, (req, res) => {
  const existing = loadOwnEntry(req, res)
  if (!existing) return
  deleteEntry(existing.id)
  res.status(204).end()
})

// Andere Mitglieder kommentieren einen Eintrag – mit Namen, wie auf der Pinnwand.
// Erlaubt für jeden im Bereich sichtbaren Eintrag (eigen oder geteilt nicht-privat).
router.post('/:id/comments', requireAuth, canComment, (req, res) => {
  const entry = loadVisibleEntry(req, res)
  if (!entry) return

  const body = req.body || {}
  const autorName = cleanText(body.autorName, 60)
  const text = cleanText(body.text, MAX_COMMENT_LENGTH)
  if (!autorName || !text) return res.status(400).json({ error: 'Name und Kommentar sind erforderlich' })

  // author_family_id (Phase R Task 2): die schreibende Identität, nicht der Bereich (lib/authorship.js). Ein Gast
  // (Phase V2) schreibt unter seinem eigenen Zuhause (family_id = req.homeId): so sehen ihn nur er selbst und der
  // Gastgeber (VISIBLE_COMMENT_SQL beim Gastgeber, GUEST_COMMENT_SQL beim Gast) - andere Gäste und Familien nicht.
  const areaId = req.isGuest ? req.homeId : req.familyId
  const result = db
    .prepare('INSERT INTO entry_comments (entry_id, family_id, author_family_id, autor_name, text) VALUES (?, ?, ?, ?, ?)')
    .run(entry.id, areaId, req.homeId, autorName, text)
  const comment = db
    .prepare(
      `SELECT c.*, gf.name AS gast_zuhause FROM entry_comments c JOIN timeline_entries t ON t.id = c.entry_id
       ${GUEST_HOME_JOIN_SQL} WHERE c.id = ?`
    )
    .get(result.lastInsertRowid)
  res.status(201).json(toComment(comment, authorContext(req)))
})

// Löschen darf, wessen Bereich den Kommentar geschrieben hat, oder wem der Eintrag gehört (Moderation) -
// in einer Familie zusätzlich nur die Autorin selbst oder ab Stellvertretung (Phase R Task 2,
// lib/authorship.js mayDeleteInArea), sonst 403.
router.delete('/:id/comments/:commentId', requireAuth, canComment, (req, res) => {
  const comment = db
    .prepare('SELECT * FROM entry_comments WHERE id = ? AND entry_id = ?')
    .get(req.params.commentId, req.params.id)
  const entry = db.prepare('SELECT family_id FROM timeline_entries WHERE id = ?').get(req.params.id)
  // Ein Gast (Phase V2) löscht nur seine eigenen Kommentare auf einem für ihn sichtbaren Eintrag des Gastgebers -
  // nie die des Gastgebers oder anderer, auch wenn der Eintrag dem aktiven Bereich gehört.
  const canDelete = req.isGuest
    ? comment && comment.family_id === req.homeId && comment.author_family_id === req.homeId &&
      Boolean(findGuestEntry.get({ id: comment.entry_id, familyId: req.familyId }))
    : comment && entry && (comment.family_id === req.familyId || entry.family_id === req.familyId)
  if (!canDelete) {
    return res.status(404).json({ error: 'Kommentar nicht gefunden' })
  }
  if (!mayDeleteInArea(comment, authorContext(req))) return res.status(403).json({ error: FORBIDDEN_MESSAGE })
  db.prepare('DELETE FROM entry_comments WHERE id = ?').run(comment.id)
  res.status(204).end()
})

module.exports = router
