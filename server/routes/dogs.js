const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { isIsoDate, cleanText, cleanId, isUploadUrl } = require('../lib/validate')
const { dogLabel } = require('../lib/labels')

const router = express.Router()

const SEXES = ['ruede', 'huendin']
const PARENTS = [
  { idKey: 'motherDogId', textKey: 'motherFreitext', idCol: 'mother_dog_id', textCol: 'mother_freitext', sex: 'huendin', label: 'Mutter' },
  { idKey: 'fatherDogId', textKey: 'fatherFreitext', idCol: 'father_dog_id', textCol: 'father_freitext', sex: 'ruede', label: 'Vater' }
]

const UNKNOWN_NAME = 'Unbekannt'
const SUMMARY_COLUMNS = `dogs.id, dogs.name, dogs.name_unbekannt, dogs.rasse, dogs.geschlecht, dogs.geburtsdatum,
  dogs.foto_url, dogs.family_id, families.name AS familyName`

const hasKey = (body, key) => Object.prototype.hasOwnProperty.call(body, key)
const pick = (body, key, fallback) => (hasKey(body, key) ? body[key] : fallback)

const findDog = db.prepare('SELECT * FROM dogs WHERE id = ?')
const findDescendant = db.prepare(`
  WITH RECURSIVE descendants(id) AS (
    SELECT id FROM dogs WHERE mother_dog_id = :root OR father_dog_id = :root
    UNION
    SELECT d.id FROM dogs d JOIN descendants ON d.mother_dog_id = descendants.id OR d.father_dog_id = descendants.id
  )
  SELECT 1 FROM descendants WHERE id = :candidate LIMIT 1
`)

// Baut aus Request-Body (+ bestehendem Datensatz bei PUT) einen neuen Datensatz.
// Wird nur eine Seite eines Elternpaars (Liste/Freitext) gesendet, gewinnt sie.
function buildDogRecord(body, existing = {}) {
  const nameUnbekannt = Boolean(pick(body, 'nameUnbekannt', existing.name_unbekannt))
  const record = {
    name: nameUnbekannt ? UNKNOWN_NAME : cleanText(pick(body, 'name', existing.name), 80),
    name_unbekannt: nameUnbekannt ? 1 : 0,
    rasse: cleanText(pick(body, 'rasse', existing.rasse), 120),
    geschlecht: pick(body, 'geschlecht', existing.geschlecht),
    geburtsdatum: cleanText(pick(body, 'geburtsdatum', existing.geburtsdatum), 10),
    farbe_markings: cleanText(pick(body, 'farbeMarkings', existing.farbe_markings), 200),
    foto_url: cleanText(pick(body, 'fotoUrl', existing.foto_url), 300),
    beschreibung: cleanText(pick(body, 'beschreibung', existing.beschreibung), 5000)
  }
  for (const parent of PARENTS) {
    const sendsId = hasKey(body, parent.idKey)
    const sendsText = hasKey(body, parent.textKey)
    record[parent.idCol] = cleanId(pick(body, parent.idKey, sendsText ? null : existing[parent.idCol]))
    record[parent.textCol] = cleanText(pick(body, parent.textKey, sendsId ? null : existing[parent.textCol]), 120)
  }
  return record
}

function validateParent(record, parent, dogId, familyId) {
  const parentId = record[parent.idCol]
  if (Number.isNaN(parentId)) return `${parent.label}: ungültige Auswahl`
  if (parentId && record[parent.textCol]) {
    return `${parent.idKey} und ${parent.textKey} dürfen nicht gleichzeitig gesetzt sein`
  }
  if (!parentId) return null

  const parentDog = findDog.get(parentId)
  if (!parentDog || parentDog.family_id !== familyId) return `${parent.label} muss ein Hund des eigenen Rudels sein`
  if (parentDog.geschlecht !== parent.sex) {
    return `${parent.label} muss ${parent.sex === 'huendin' ? 'eine Hündin' : 'ein Rüde'} sein`
  }
  if (dogId && (parentId === dogId || findDescendant.get({ root: dogId, candidate: parentId }))) {
    return `${parent.label} kann nicht der Hund selbst oder einer seiner Nachkommen sein`
  }
  return null
}

function validateDogRecord(record, dogId, familyId) {
  if (!record.name) return 'Name ist erforderlich (oder „Name unbekannt“ wählen)'
  if (!SEXES.includes(record.geschlecht)) return 'Geschlecht muss ruede oder huendin sein'
  if (record.geburtsdatum && !isIsoDate(record.geburtsdatum)) return 'Geburtsdatum ist ungültig'
  if (record.foto_url && !isUploadUrl(record.foto_url)) return 'Foto-URL ist ungültig'
  for (const parent of PARENTS) {
    const error = validateParent(record, parent, dogId, familyId)
    if (error) return error
  }
  return null
}

// Jedes Rudel sieht nur seine eigenen Hunde. Fremde Hunde gelten als "nicht gefunden",
// damit sich über geänderte IDs in der URL nicht einmal ihre Existenz erkennen lässt.
function loadOwnDog(req, res) {
  const dog = findDog.get(req.params.id)
  if (!dog || dog.family_id !== req.familyId) {
    res.status(404).json({ error: 'Hund nicht gefunden' })
    return null
  }
  return dog
}

router.get('/', requireAuth, (req, res) => {
  const dogs = db
    .prepare(
      `SELECT dogs.*,
         (SELECT COUNT(*) FROM timeline_entries t WHERE t.dog_id = dogs.id) AS timeline_count
       FROM dogs WHERE family_id = ? ORDER BY geburtsdatum IS NULL, geburtsdatum, name`
    )
    .all(req.familyId)
  res.json(dogs)
})

router.get('/all', requireAuth, (req, res) => {
  const dogs = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS} FROM dogs JOIN families ON families.id = dogs.family_id
       WHERE dogs.family_id = ? ORDER BY dogs.name`
    )
    .all(req.familyId)
  res.json(dogs)
})

router.get('/:id', requireAuth, (req, res) => {
  const dog = loadOwnDog(req, res)
  if (!dog) return

  const summary = db.prepare(
    `SELECT ${SUMMARY_COLUMNS} FROM dogs JOIN families ON families.id = dogs.family_id
     WHERE dogs.id = ? AND dogs.family_id = ?`
  )
  const children = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}
       FROM dogs JOIN families ON families.id = dogs.family_id
       WHERE (mother_dog_id = ? OR father_dog_id = ?) AND dogs.family_id = ?
       ORDER BY geburtsdatum IS NULL, geburtsdatum, dogs.name`
    )
    .all(dog.id, dog.id, req.familyId)
  const family = db.prepare('SELECT name FROM families WHERE id = ?').get(dog.family_id)

  res.json({
    ...dog,
    familyName: family.name,
    isOwn: dog.family_id === req.familyId,
    mother: dog.mother_dog_id ? summary.get(dog.mother_dog_id, req.familyId) ?? null : null,
    father: dog.father_dog_id ? summary.get(dog.father_dog_id, req.familyId) ?? null : null,
    children
  })
})

router.post('/', requireAuth, (req, res) => {
  const record = buildDogRecord(req.body || {})
  const error = validateDogRecord(record, null, req.familyId)
  if (error) return res.status(400).json({ error })

  const result = db
    .prepare(
      `INSERT INTO dogs
        (family_id, name, name_unbekannt, rasse, geschlecht, geburtsdatum, farbe_markings,
         mother_dog_id, father_dog_id, mother_freitext, father_freitext, foto_url, beschreibung)
       VALUES (@family_id, @name, @name_unbekannt, @rasse, @geschlecht, @geburtsdatum, @farbe_markings,
         @mother_dog_id, @father_dog_id, @mother_freitext, @father_freitext, @foto_url, @beschreibung)`
    )
    .run({ ...record, family_id: req.familyId })

  res.status(201).json(findDog.get(result.lastInsertRowid))
})

router.put('/:id', requireAuth, (req, res) => {
  const existing = loadOwnDog(req, res)
  if (!existing) return

  const record = buildDogRecord(req.body || {}, existing)
  const error = validateDogRecord(record, existing.id, req.familyId)
  if (error) return res.status(400).json({ error })

  db.prepare(
    `UPDATE dogs SET
       name = @name, name_unbekannt = @name_unbekannt, rasse = @rasse,
       geschlecht = @geschlecht, geburtsdatum = @geburtsdatum,
       farbe_markings = @farbe_markings, mother_dog_id = @mother_dog_id,
       father_dog_id = @father_dog_id, mother_freitext = @mother_freitext,
       father_freitext = @father_freitext, foto_url = @foto_url, beschreibung = @beschreibung
     WHERE id = @id`
  ).run({ ...record, id: existing.id })

  res.json(findDog.get(existing.id))
})

// Löscht den Hund samt Timeline. Verweise anderer Hunde/Würfe werden zu Freitext,
// damit die Abstammung (auch in anderen Rudeln) lesbar bleibt.
const deleteDog = db.transaction((dog) => {
  const label = dogLabel(dog)
  db.prepare('UPDATE dogs SET mother_dog_id = NULL, mother_freitext = ? WHERE mother_dog_id = ?').run(label, dog.id)
  db.prepare('UPDATE dogs SET father_dog_id = NULL, father_freitext = ? WHERE father_dog_id = ?').run(label, dog.id)
  db.prepare('UPDATE breeding_events SET vater_dog_id = NULL, vater_freitext = ? WHERE vater_dog_id = ?').run(label, dog.id)
  db.prepare('DELETE FROM breeding_events WHERE mutter_dog_id = ?').run(dog.id)
  db.prepare('DELETE FROM timeline_entries WHERE dog_id = ?').run(dog.id)
  db.prepare('DELETE FROM dogs WHERE id = ?').run(dog.id)
})

router.delete('/:id', requireAuth, (req, res) => {
  const dog = loadOwnDog(req, res)
  if (!dog) return
  deleteDog(dog)
  res.status(204).end()
})

module.exports = router
