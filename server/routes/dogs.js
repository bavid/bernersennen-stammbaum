const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

function validateParent(dogIdField, freitextField, body) {
  const dogId = body[dogIdField]
  const freitext = body[freitextField]
  if (dogId && freitext?.trim()) {
    return `${dogIdField} und ${freitextField} dürfen nicht gleichzeitig gesetzt sein`
  }
  return null
}

router.get('/', requireAuth, (req, res) => {
  const dogs = db.prepare('SELECT * FROM dogs WHERE family_id = ? ORDER BY name').all(req.familyId)
  res.json(dogs)
})

router.get('/all', requireAuth, (req, res) => {
  const dogs = db
    .prepare(
      `SELECT dogs.id, dogs.name, families.name AS familyName
       FROM dogs JOIN families ON families.id = dogs.family_id
       ORDER BY dogs.name`
    )
    .all()
  res.json(dogs)
})

router.get('/:id', requireAuth, (req, res) => {
  const dog = db.prepare('SELECT * FROM dogs WHERE id = ?').get(req.params.id)
  if (!dog) return res.status(404).json({ error: 'Hund nicht gefunden' })

  const mother = dog.mother_dog_id
    ? db.prepare('SELECT id, name FROM dogs WHERE id = ?').get(dog.mother_dog_id)
    : null
  const father = dog.father_dog_id
    ? db.prepare('SELECT id, name FROM dogs WHERE id = ?').get(dog.father_dog_id)
    : null

  res.json({ ...dog, mother, father })
})

router.post('/', requireAuth, (req, res) => {
  const body = req.body || {}
  if (!body.name?.trim()) {
    return res.status(400).json({ error: 'Name ist erforderlich' })
  }
  if (!['ruede', 'huendin'].includes(body.geschlecht)) {
    return res.status(400).json({ error: 'Geschlecht muss ruede oder huendin sein' })
  }

  const motherError = validateParent('motherDogId', 'motherFreitext', body)
  if (motherError) return res.status(400).json({ error: motherError })
  const fatherError = validateParent('fatherDogId', 'fatherFreitext', body)
  if (fatherError) return res.status(400).json({ error: fatherError })

  const result = db
    .prepare(
      `INSERT INTO dogs
        (family_id, name, geschlecht, geburtsdatum, farbe_markings,
         mother_dog_id, father_dog_id, mother_freitext, father_freitext,
         foto_url, beschreibung)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.familyId,
      body.name.trim(),
      body.geschlecht,
      body.geburtsdatum || null,
      body.farbeMarkings || null,
      body.motherDogId || null,
      body.fatherDogId || null,
      body.motherFreitext || null,
      body.fatherFreitext || null,
      body.fotoUrl || null,
      body.beschreibung || null
    )

  const dog = db.prepare('SELECT * FROM dogs WHERE id = ?').get(result.lastInsertRowid)
  res.status(201).json(dog)
})

router.put('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM dogs WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Hund nicht gefunden' })
  if (existing.family_id !== req.familyId) {
    return res.status(403).json({ error: 'Kein Zugriff auf diesen Hund' })
  }

  const body = req.body || {}
  const motherError = validateParent('motherDogId', 'motherFreitext', body)
  if (motherError) return res.status(400).json({ error: motherError })
  const fatherError = validateParent('fatherDogId', 'fatherFreitext', body)
  if (fatherError) return res.status(400).json({ error: fatherError })

  db.prepare(
    `UPDATE dogs SET
       name = ?, geschlecht = ?, geburtsdatum = ?, farbe_markings = ?,
       mother_dog_id = ?, father_dog_id = ?, mother_freitext = ?, father_freitext = ?,
       foto_url = ?, beschreibung = ?
     WHERE id = ?`
  ).run(
    body.name?.trim() || existing.name,
    body.geschlecht || existing.geschlecht,
    body.geburtsdatum ?? existing.geburtsdatum,
    body.farbeMarkings ?? existing.farbe_markings,
    body.motherDogId ?? existing.mother_dog_id,
    body.fatherDogId ?? existing.father_dog_id,
    body.motherFreitext ?? existing.mother_freitext,
    body.fatherFreitext ?? existing.father_freitext,
    body.fotoUrl ?? existing.foto_url,
    body.beschreibung ?? existing.beschreibung,
    req.params.id
  )

  const dog = db.prepare('SELECT * FROM dogs WHERE id = ?').get(req.params.id)
  res.json(dog)
})

module.exports = router
