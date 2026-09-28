const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { isIsoDate, cleanText, cleanId, cleanPhotoList } = require('../lib/validate')
const { ART, VISIBLE_ENTRY_SQL, VISIBLE_COMMENT_SQL } = require('../lib/context')
const { canAttachUpload, canAttachPublicUpload } = require('../lib/uploadAccess')

const router = express.Router()

const MAX_COMMENT_LENGTH = 1000
// Phase T Task 2: Kategorien für die Tierheim-Chronik; kategorie bleibt auch außerhalb eines
// Tierheims erlaubt (rein kosmetisch, keine Rechteprüfung nötig) - nur isPublic ist Tierheim-exklusiv.
const KATEGORIEN = ['ankunft', 'tierarzt', 'verhalten', 'training', 'gassi', 'sonstiges']

const hasKey = (body, key) => Object.prototype.hasOwnProperty.call(body, key)
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
function commentsByEntry(familyId, dogId) {
  const rows = db
    .prepare(
      `SELECT c.* FROM entry_comments c JOIN timeline_entries t ON t.id = c.entry_id
       WHERE ${VISIBLE_ENTRY_SQL} AND (@dogId IS NULL OR t.dog_id = @dogId) AND ${VISIBLE_COMMENT_SQL}
       ORDER BY c.created_at, c.id`
    )
    .all({ familyId, dogId })
  const grouped = new Map()
  for (const row of rows) grouped.set(row.entry_id, [...(grouped.get(row.entry_id) || []), row])
  return grouped
}

const commentsOf = (entryId) => db.prepare('SELECT * FROM entry_comments WHERE entry_id = ? ORDER BY created_at, id').all(entryId)

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

// Für Kommentare: eigener Eintrag oder ein geteilter, nicht-privater Eintrag
function loadVisibleEntry(req, res) {
  const entry = findVisibleEntry.get({ id: req.params.id, familyId: req.familyId })
  if (!entry) {
    res.status(404).json({ error: 'Eintrag nicht gefunden' })
    return null
  }
  return entry
}

const RECENT_DEFAULT = 6
const RECENT_MAX = 20

// "Was treiben die anderen?": zuletzt geschriebene Einträge, die im Bereich sichtbar sind
// (eigene und geteilte nicht-private). comment_count zählt ALLE Kommentare, nicht nur eigene.
router.get('/recent', requireAuth, (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || RECENT_DEFAULT, 1), RECENT_MAX)
  const rows = db
    .prepare(
      `SELECT t.*, d.name AS dog_name, d.name_unbekannt AS dog_name_unbekannt, d.rasse AS dog_rasse,
              d.foto_url AS dog_foto_url,
              (SELECT COUNT(*) FROM entry_comments c WHERE c.entry_id = t.id AND ${VISIBLE_COMMENT_SQL}) AS comment_count,
              ${HERKUNFT_NAME_SELECT_SQL}
       FROM timeline_entries t JOIN dogs d ON d.id = t.dog_id
       ${HERKUNFT_NAME_JOIN_SQL}
       WHERE ${VISIBLE_ENTRY_SQL}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT @limit`
    )
    .all({ familyId: req.familyId, limit })
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
       WHERE ${VISIBLE_ENTRY_SQL} AND (@dogId IS NULL OR t.dog_id = @dogId)
       ORDER BY t.datum, t.id`
    )
    .all({ familyId: req.familyId, dogId })
  const comments = commentsByEntry(req.familyId, dogId)
  res.json(rows.map((row) => toEntry(row, comments.get(row.id))))
})

router.post('/', requireAuth, (req, res) => {
  const body = req.body || {}
  const dogId = cleanId(body.dogId)
  if (!dogId) return res.status(400).json({ error: 'dogId ist erforderlich' })

  const { error, values } = readEntryInput(body, req)
  if (error) return res.status(400).json({ error })

  const dog = db.prepare('SELECT id, family_id FROM dogs WHERE id = ?').get(dogId)
  if (!dog || dog.family_id !== req.familyId) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Hund' })
  }

  const result = db
    .prepare(
      `INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text, foto_urls, privat, kategorie, is_public)
       VALUES (@dog_id, @family_id, @autor_name, @datum, @titel, @text, @foto_urls, @privat, @kategorie, @is_public)`
    )
    .run({ ...values, dog_id: dogId, family_id: req.familyId })

  const entry = findEntryById.get(result.lastInsertRowid)
  res.status(201).json(toEntry(entry))
})

router.put('/:id', requireAuth, (req, res) => {
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

  db.prepare(
    `UPDATE timeline_entries
     SET autor_name = @autor_name, datum = @datum, titel = @titel, text = @text, foto_urls = @foto_urls,
         privat = @privat, kategorie = @kategorie, is_public = @is_public
     WHERE id = @id`
  ).run({ ...values, id: existing.id })

  const entry = findEntryById.get(existing.id)
  res.json(toEntry(entry, commentsOf(entry.id)))
})

const deleteEntry = db.transaction((entryId) => {
  db.prepare('DELETE FROM entry_comments WHERE entry_id = ?').run(entryId)
  db.prepare('DELETE FROM timeline_entries WHERE id = ?').run(entryId)
})

router.delete('/:id', requireAuth, (req, res) => {
  const existing = loadOwnEntry(req, res)
  if (!existing) return
  deleteEntry(existing.id)
  res.status(204).end()
})

// Andere Mitglieder kommentieren einen Eintrag – mit Namen, wie auf der Pinnwand.
// Erlaubt für jeden im Bereich sichtbaren Eintrag (eigen oder geteilt nicht-privat).
router.post('/:id/comments', requireAuth, (req, res) => {
  const entry = loadVisibleEntry(req, res)
  if (!entry) return

  const body = req.body || {}
  const autorName = cleanText(body.autorName, 60)
  const text = cleanText(body.text, MAX_COMMENT_LENGTH)
  if (!autorName || !text) return res.status(400).json({ error: 'Name und Kommentar sind erforderlich' })

  const result = db
    .prepare('INSERT INTO entry_comments (entry_id, family_id, autor_name, text) VALUES (?, ?, ?, ?)')
    .run(entry.id, req.familyId, autorName, text)
  res.status(201).json(db.prepare('SELECT * FROM entry_comments WHERE id = ?').get(result.lastInsertRowid))
})

// Löschen darf, wer den Kommentar geschrieben hat, oder wem der Eintrag gehört (Moderation)
router.delete('/:id/comments/:commentId', requireAuth, (req, res) => {
  const comment = db
    .prepare('SELECT * FROM entry_comments WHERE id = ? AND entry_id = ?')
    .get(req.params.commentId, req.params.id)
  const entry = db.prepare('SELECT family_id FROM timeline_entries WHERE id = ?').get(req.params.id)
  const canDelete = comment && entry && (comment.family_id === req.familyId || entry.family_id === req.familyId)
  if (!canDelete) {
    return res.status(404).json({ error: 'Kommentar nicht gefunden' })
  }
  db.prepare('DELETE FROM entry_comments WHERE id = ?').run(comment.id)
  res.status(204).end()
})

module.exports = router
