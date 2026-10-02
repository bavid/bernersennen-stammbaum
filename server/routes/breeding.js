const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { isIsoDate, cleanText, cleanId, cleanPhotoList } = require('../lib/validate')
const { canAttachUpload } = require('../lib/uploadAccess')
const { canSeeDog, OWN_DOGS_SQL } = require('../lib/context')
const { requireRole } = require('../lib/roles')

const router = express.Router()

// Phase R Task 1: Würfe/Deckakte eintragen und löschen braucht in einer Familie mindestens 'mitglied'.
const canWrite = requireRole('mitglied')

const SELECT_EVENTS = `
  SELECT b.*, m.name AS mutter_name, v.name AS vater_name
  FROM breeding_events b
  JOIN dogs m ON m.id = b.mutter_dog_id
  LEFT JOIN dogs v ON v.id = b.vater_dog_id
`

function toEvent(row) {
  return { ...row, foto_urls: JSON.parse(row.foto_urls) }
}

// Kein PUT/Edit für Wurf-Einträge - fotoUrls kommen also immer frisch vom Client, nie ein
// bestehender Datensatz, den man unverändert lassen müsste (anders als bei dogs.js/timeline.js).
function validateEvent(body, req) {
  const familyId = req.familyId
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
  const uploadContext = { familyId, homeId: req.homeId }
  if (!fotoUrls.every((url) => canAttachUpload(uploadContext, url))) {
    return { status: 400, error: 'Foto nicht gefunden' }
  }

  const mutter = db.prepare('SELECT family_id, geschlecht, tierart FROM dogs WHERE id = ?').get(mutterId)
  if (!mutter || mutter.family_id !== familyId || mutter.geschlecht !== 'huendin') {
    return { status: 403, error: 'Mutter muss eine Hündin des eigenen Rudels sein' }
  }
  if (vaterId) {
    const vater = db.prepare('SELECT family_id, geschlecht, tierart FROM dogs WHERE id = ?').get(vaterId)
    if (!vater || vater.family_id !== familyId || vater.geschlecht !== 'ruede' || vater.tierart !== mutter.tierart) {
      return { status: 400, error: 'Vater muss ein Rüde des eigenen Rudels sein (sonst als Freitext angeben)' }
    }
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

// Zuchtbuch des Bereichs UND Würfe EIGENER Tiere, die in einem anderen Bereich eingetragen wurden (Phase R:
// nach dem Übernehmen eines Tiers aus der Familie, routes/dogs.js POST /:id/uebernehmen, bleibt sein Wurf im
// Zuchtbuch der Familie - im Zuhause des neuen Eigentümers soll er trotzdem erscheinen). Bewusst nur eigene
// Tiere (dogs.family_id), nicht bloß sichtbare: das Zuchtbuch eines Haushalts wird nicht dadurch geteilt, dass
// er ein Tier in eine Familie teilt (test/uploadAccess.test.js "Wurf-Fotos werden nicht geteilt").
const LIST_EVENTS_SQL = `${SELECT_EVENTS}
  WHERE b.family_id = @familyId OR b.mutter_dog_id IN ${OWN_DOGS_SQL} OR b.vater_dog_id IN ${OWN_DOGS_SQL}
  ORDER BY b.datum DESC, b.id DESC`
const findDogForVisibility = db.prepare('SELECT id, family_id FROM dogs WHERE id = ?')

// Bei einem fremden Wurf-Eintrag (anderer Bereich) bleibt nur, was hier sichtbar ist: ein beteiligtes Tier,
// das der Bereich nicht sehen darf, verschwindet samt Name (Id und Name null; ein Freitext-Vater bleibt) -
// dieselbe Regel wie visibleParentId/canSeeDog in routes/dogs.js. Eigene Einträge bleiben wie bisher komplett.
function hideInvisibleDogs(row, familyId) {
  if (row.family_id === familyId) return row
  const event = { ...row }
  if (!canSeeDog(familyId, findDogForVisibility.get(row.mutter_dog_id))) {
    event.mutter_dog_id = null
    event.mutter_name = null
  }
  if (row.vater_dog_id && !canSeeDog(familyId, findDogForVisibility.get(row.vater_dog_id))) {
    event.vater_dog_id = null
    event.vater_name = null
  }
  return event
}

// Phase V2: ein Gast sieht Tiere und Einträge, nicht das Zuchtbuch des besuchten Zuhauses - die Tierseite lädt
// die Liste trotzdem mit, darum eine leere statt 403.
router.get('/', requireAuth, (req, res) => {
  if (req.isGuest) return res.json([])
  const rows = db.prepare(LIST_EVENTS_SQL).all({ familyId: req.familyId })
  res.json(rows.map((row) => toEvent(hideInvisibleDogs(row, req.familyId))))
})

router.post('/', requireAuth, canWrite, (req, res) => {
  const { status, error, values } = validateEvent(req.body || {}, req)
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

router.delete('/:id', requireAuth, canWrite, (req, res) => {
  const event = db.prepare('SELECT family_id FROM breeding_events WHERE id = ?').get(req.params.id)
  if (!event || event.family_id !== req.familyId) {
    return res.status(404).json({ error: 'Eintrag nicht gefunden' })
  }
  db.prepare('DELETE FROM breeding_events WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

module.exports = router
