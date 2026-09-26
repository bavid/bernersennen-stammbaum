const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { isIsoDate, cleanText, cleanId, cleanPhotoList } = require('../lib/validate')

const router = express.Router()

const SELECT_EVENTS = `
  SELECT b.*, m.name AS mutter_name, v.name AS vater_name
  FROM breeding_events b
  JOIN dogs m ON m.id = b.mutter_dog_id
  LEFT JOIN dogs v ON v.id = b.vater_dog_id
`

function toEvent(row) {
  return { ...row, foto_urls: JSON.parse(row.foto_urls) }
}

function validateEvent(body, familyId) {
  const mutterId = cleanId(body.mutterDogId)
  const vaterId = cleanId(body.vaterDogId)
  const vaterFreitext = cleanText(body.vaterFreitext, 120)
  const fotoUrls = cleanPhotoList(body.fotoUrls)

  if (!mutterId || !body.datum) return { status: 400, error: 'mutterDogId und datum sind erforderlich' }
  if (!isIsoDate(body.datum)) return { status: 400, error: 'Datum ist ungültig' }
  if (Number.isNaN(vaterId)) return { status: 400, error: 'Vater: ungültige Auswahl' }
  if (vaterId && vaterFreitext) {
    return { status: 400, error: 'vaterDogId und vaterFreitext dürfen nicht gleichzeitig gesetzt sein' }
  }
  if (fotoUrls === null) return { status: 400, error: 'Fotoliste ist ungültig' }

  const mutter = db.prepare('SELECT family_id, geschlecht FROM dogs WHERE id = ?').get(mutterId)
  if (!mutter || mutter.family_id !== familyId || mutter.geschlecht !== 'huendin') {
    return { status: 403, error: 'Mutter muss eine Hündin des eigenen Rudels sein' }
  }
  if (vaterId) {
    const vater = db.prepare('SELECT geschlecht FROM dogs WHERE id = ?').get(vaterId)
    if (!vater || vater.geschlecht !== 'ruede') return { status: 400, error: 'Vater muss ein Rüde sein' }
  }

  return {
    values: {
      family_id: familyId,
      mutter_dog_id: mutterId,
      vater_dog_id: vaterId,
      vater_freitext: vaterFreitext,
      datum: body.datum,
      wurf_info: cleanText(body.wurfInfo, 5000),
      foto_urls: JSON.stringify(fotoUrls)
    }
  }
}

router.get('/', requireAuth, (req, res) => {
  const rows = db.prepare(`${SELECT_EVENTS} WHERE b.family_id = ? ORDER BY b.datum DESC, b.id DESC`).all(req.familyId)
  res.json(rows.map(toEvent))
})

router.post('/', requireAuth, (req, res) => {
  const { status, error, values } = validateEvent(req.body || {}, req.familyId)
  if (error) return res.status(status).json({ error })

  const result = db
    .prepare(
      `INSERT INTO breeding_events
        (family_id, mutter_dog_id, vater_dog_id, vater_freitext, datum, wurf_info, foto_urls)
       VALUES (@family_id, @mutter_dog_id, @vater_dog_id, @vater_freitext, @datum, @wurf_info, @foto_urls)`
    )
    .run(values)

  const entry = db.prepare(`${SELECT_EVENTS} WHERE b.id = ?`).get(result.lastInsertRowid)
  res.status(201).json(toEvent(entry))
})

router.delete('/:id', requireAuth, (req, res) => {
  const event = db.prepare('SELECT family_id FROM breeding_events WHERE id = ?').get(req.params.id)
  if (!event || event.family_id !== req.familyId) {
    return res.status(404).json({ error: 'Eintrag nicht gefunden' })
  }
  db.prepare('DELETE FROM breeding_events WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

module.exports = router
