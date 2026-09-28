const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { isIsoDate, cleanText, cleanId, isUploadUrl } = require('../lib/validate')
const { dogLabel } = require('../lib/labels')
const { ART, membershipsOf, canEnter, canSeeDog, VISIBLE_DOGS_SQL, VISIBLE_ENTRY_SQL } = require('../lib/context')

const router = express.Router()

const SEXES = ['ruede', 'huendin']
const SPECIES = ['hund', 'katze', 'anderes']
const PARENTS = [
  { idKey: 'motherDogId', textKey: 'motherFreitext', idCol: 'mother_dog_id', textCol: 'mother_freitext', sex: 'huendin', label: 'Mutter' },
  { idKey: 'fatherDogId', textKey: 'fatherFreitext', idCol: 'father_dog_id', textCol: 'father_freitext', sex: 'ruede', label: 'Vater' }
]
const ABSCHIED_GRUENDE = ['verstorben', 'abgegeben', 'umgezogen', 'anderes']
const HERKUNFT_ARTEN = ['tierheim', 'privat', 'zuechter', 'nachwuchs', 'fundtier', 'anderes']

const UNKNOWN_NAME = 'Unbekannt'
const SUMMARY_COLUMNS = `dogs.id, dogs.name, dogs.name_unbekannt, dogs.rasse, dogs.tierart, dogs.geschlecht, dogs.geburtsdatum,
  dogs.foto_url, dogs.family_id, dogs.bei_uns_seit, dogs.bei_uns_bis, dogs.abschied_grund, dogs.herkunft_art, dogs.herkunft_text,
  families.name AS familyName`

const hasKey = (body, key) => Object.prototype.hasOwnProperty.call(body, key)
const pick = (body, key, fallback) => (hasKey(body, key) ? body[key] : fallback)
// leerer String/undefined/null -> null; sonst der Wert unverändert (Enum-Prüfung folgt in validateDogRecord)
const cleanEnum = (value) => (value === null || value === undefined || value === '' ? null : value)

const findDog = db.prepare('SELECT * FROM dogs WHERE id = ?')
const insertDog = db.prepare(
  `INSERT INTO dogs
    (family_id, name, name_unbekannt, rasse, tierart, geschlecht, geburtsdatum, farbe_markings,
     mother_dog_id, father_dog_id, mother_freitext, father_freitext, foto_url, beschreibung,
     bei_uns_seit, bei_uns_bis, abschied_grund, herkunft_art, herkunft_text)
   VALUES (@family_id, @name, @name_unbekannt, @rasse, @tierart, @geschlecht, @geburtsdatum, @farbe_markings,
     @mother_dog_id, @father_dog_id, @mother_freitext, @father_freitext, @foto_url, @beschreibung,
     @bei_uns_seit, @bei_uns_bis, @abschied_grund, @herkunft_art, @herkunft_text)`
)
const insertLink = db.prepare('INSERT OR IGNORE INTO dog_links (family_id, dog_a_id, dog_b_id) VALUES (?, ?, ?)')
const listShares = db.prepare('SELECT family_id FROM dog_shares WHERE dog_id = ? ORDER BY family_id')
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
    tierart: pick(body, 'tierart', existing.tierart || 'hund'),
    geschlecht: pick(body, 'geschlecht', existing.geschlecht),
    geburtsdatum: cleanText(pick(body, 'geburtsdatum', existing.geburtsdatum), 10),
    farbe_markings: cleanText(pick(body, 'farbeMarkings', existing.farbe_markings), 200),
    foto_url: cleanText(pick(body, 'fotoUrl', existing.foto_url), 300),
    beschreibung: cleanText(pick(body, 'beschreibung', existing.beschreibung), 5000),
    bei_uns_seit: cleanText(pick(body, 'beiUnsSeit', existing.bei_uns_seit), 10),
    bei_uns_bis: cleanText(pick(body, 'beiUnsBis', existing.bei_uns_bis), 10),
    abschied_grund: cleanEnum(pick(body, 'abschiedGrund', existing.abschied_grund)),
    herkunft_art: cleanEnum(pick(body, 'herkunftArt', existing.herkunft_art)),
    herkunft_text: cleanText(pick(body, 'herkunftText', existing.herkunft_text), 120)
  }
  // Ohne Abschiedsdatum ergibt ein Abschiedsgrund keinen Sinn
  if (!record.bei_uns_bis) record.abschied_grund = null
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
  if (parentDog.tierart !== record.tierart) return `${parent.label} muss dieselbe Tierart haben`
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
  if (!SPECIES.includes(record.tierart)) return 'Tierart muss hund, katze oder anderes sein'
  if (record.geburtsdatum && !isIsoDate(record.geburtsdatum)) return 'Geburtsdatum ist ungültig'
  if (record.foto_url && !isUploadUrl(record.foto_url)) return 'Foto-URL ist ungültig'
  if (record.bei_uns_seit && !isIsoDate(record.bei_uns_seit)) return 'Datum „bei uns seit“ ist ungültig'
  if (record.bei_uns_bis && !isIsoDate(record.bei_uns_bis)) return 'Datum „bei uns bis“ ist ungültig'
  if (record.bei_uns_seit && record.bei_uns_bis && record.bei_uns_bis < record.bei_uns_seit) {
    return 'Der Abschied liegt vor dem Einzug'
  }
  if (record.abschied_grund !== null && !ABSCHIED_GRUENDE.includes(record.abschied_grund)) {
    return 'Unbekannter Abschiedsgrund'
  }
  if (record.herkunft_art !== null && !HERKUNFT_ARTEN.includes(record.herkunft_art)) {
    return 'Unbekannte Herkunft'
  }
  for (const parent of PARENTS) {
    const error = validateParent(record, parent, dogId, familyId)
    if (error) return error
  }
  return null
}

// Für Schreibzugriffe: nur das eigene Tier zählt, auch wenn es geteilt ist. Fremde Hunde gelten
// als "nicht gefunden", damit sich über geänderte IDs in der URL nicht einmal ihre Existenz erkennen lässt.
function loadOwnDog(req, res) {
  const dog = findDog.get(req.params.id)
  if (!dog || dog.family_id !== req.familyId) {
    res.status(404).json({ error: 'Hund nicht gefunden' })
    return null
  }
  return dog
}

// Für Lesezugriffe: eigenes Tier oder ins eigene Rudel geteiltes Tier
function loadVisibleDog(req, res) {
  const dog = findDog.get(req.params.id)
  if (!canSeeDog(req.familyId, dog)) {
    res.status(404).json({ error: 'Hund nicht gefunden' })
    return null
  }
  return dog
}

// Rohe Eltern-Id nur, wenn dieser Elternteil im Bereich viewFamilyId ebenfalls sichtbar ist –
// sonst verrät die Id (auch ohne eigenen Datensatz abrufbar zu sein) die Existenz eines fremden
// Tieres. Nur relevant für Nicht-Bearbeiten-Ansichten; Eigentümer sehen ihre echten Ids immer.
function visibleParentId(parentId, viewFamilyId) {
  if (!parentId) return null
  return canSeeDog(viewFamilyId, findDog.get(parentId)) ? parentId : null
}

// can_edit: 1/0 (SQL-Ausdruck, wie andere Flags à la name_unbekannt). shared_from: Name des
// Eigentümer-Rudels, nur gesetzt wenn das Tier nicht dem eigenen Bereich gehört.
router.get('/', requireAuth, (req, res) => {
  const dogs = db
    .prepare(
      `SELECT dogs.*,
         (SELECT COUNT(*) FROM timeline_entries t WHERE t.dog_id = dogs.id AND ${VISIBLE_ENTRY_SQL}) AS timeline_count,
         (dogs.family_id = @familyId) AS can_edit,
         CASE WHEN dogs.family_id != @familyId THEN (SELECT name FROM families f WHERE f.id = dogs.family_id) END AS shared_from
       FROM dogs
       WHERE dogs.id IN ${VISIBLE_DOGS_SQL}
       ORDER BY geburtsdatum IS NULL, geburtsdatum, name`
    )
    .all({ familyId: req.familyId })
    .map((dog) =>
      dog.can_edit
        ? dog
        : {
            ...dog,
            mother_dog_id: visibleParentId(dog.mother_dog_id, req.familyId),
            father_dog_id: visibleParentId(dog.father_dog_id, req.familyId)
          }
    )
  res.json(dogs)
})

router.get('/all', requireAuth, (req, res) => {
  const dogs = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS},
         (dogs.family_id = @familyId) AS can_edit,
         CASE WHEN dogs.family_id != @familyId THEN families.name END AS shared_from
       FROM dogs JOIN families ON families.id = dogs.family_id
       WHERE dogs.id IN ${VISIBLE_DOGS_SQL}
       ORDER BY dogs.name`
    )
    .all({ familyId: req.familyId })
  res.json(dogs)
})

// Alle "lebt zusammen mit"-Verbindungen: eigene, plus Paare, deren beide Tiere hier sichtbar sind
router.get('/links', requireAuth, (req, res) => {
  const links = db
    .prepare(
      `SELECT DISTINCT dog_a_id, dog_b_id FROM dog_links
       WHERE family_id = @familyId
          OR (dog_a_id IN ${VISIBLE_DOGS_SQL} AND dog_b_id IN ${VISIBLE_DOGS_SQL})
       ORDER BY dog_a_id, dog_b_id`
    )
    .all({ familyId: req.familyId })
  res.json(links)
})

const findHousemates = db.prepare(
  `SELECT ${SUMMARY_COLUMNS}
   FROM dog_links l
   JOIN dogs ON dogs.id = CASE WHEN l.dog_a_id = @id THEN l.dog_b_id ELSE l.dog_a_id END
   JOIN families ON families.id = dogs.family_id
   WHERE (l.dog_a_id = @id OR l.dog_b_id = @id) AND l.family_id = @familyId
   ORDER BY dogs.name`
)

const summaryById = db.prepare(
  `SELECT ${SUMMARY_COLUMNS} FROM dogs JOIN families ON families.id = dogs.family_id WHERE dogs.id = ?`
)

// Elternteil-Ansicht: volle Zusammenfassung wenn im aktuellen Bereich sichtbar; sonst nur der Name
// als Fallback, aber NUR wenn der Elternteil zur selben Eigentümerfamilie wie das Tier gehört
// (der Normalfall: nur nicht separat geteilt). Gehört er zu einer ganz anderen, unverwandten
// Familie (Altdaten von vor der API-Validierung), wird nichts preisgegeben, auch nicht der Name.
function parentView(parentId, ownerFamilyId, viewFamilyId) {
  if (!parentId) return null
  const parentDog = findDog.get(parentId)
  if (!parentDog) return null
  if (canSeeDog(viewFamilyId, parentDog)) return summaryById.get(parentId)
  return parentDog.family_id === ownerFamilyId ? { id: null, name: dogLabel(parentDog) } : null
}

router.get('/:id', requireAuth, (req, res) => {
  const dog = loadVisibleDog(req, res)
  if (!dog) return

  const canEdit = dog.family_id === req.familyId
  const children = db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}
       FROM dogs JOIN families ON families.id = dogs.family_id
       WHERE (mother_dog_id = ? OR father_dog_id = ?) AND dogs.family_id = ?
       ORDER BY geburtsdatum IS NULL, geburtsdatum, dogs.name`
    )
    .all(dog.id, dog.id, dog.family_id)
    .filter((child) => canSeeDog(req.familyId, child))
  const housemates = findHousemates
    .all({ id: dog.id, familyId: dog.family_id })
    .filter((mate) => canSeeDog(req.familyId, mate))
  const family = db.prepare('SELECT name FROM families WHERE id = ?').get(dog.family_id)

  res.json({
    ...dog,
    // Rohe Ids in Nicht-Bearbeiten-Ansichten redigieren, wenn der Elternteil hier nicht sichtbar ist;
    // Eigentümer sehen ihre echten mother_dog_id/father_dog_id immer (auch bei Altdaten-Sonderfällen).
    mother_dog_id: canEdit ? dog.mother_dog_id : visibleParentId(dog.mother_dog_id, req.familyId),
    father_dog_id: canEdit ? dog.father_dog_id : visibleParentId(dog.father_dog_id, req.familyId),
    familyName: family.name,
    ownerFamilyId: dog.family_id,
    isOwn: canEdit,
    canEdit,
    shares: canEdit ? listShares.all(dog.id).map((row) => row.family_id) : [],
    mother: parentView(dog.mother_dog_id, dog.family_id, req.familyId),
    father: parentView(dog.father_dog_id, dog.family_id, req.familyId),
    children,
    housemates
  })
})

// Mitbewohner verbinden – beide müssen zum eigenen Rudel gehören
router.post('/:id/housemates', requireAuth, (req, res) => {
  const dog = loadOwnDog(req, res)
  if (!dog) return
  const otherId = cleanId((req.body || {}).otherDogId)
  if (!otherId || Number.isNaN(otherId)) return res.status(400).json({ error: 'Bitte ein Tier auswählen' })
  if (otherId === dog.id) return res.status(400).json({ error: 'Ein Tier kann nicht mit sich selbst zusammenwohnen' })
  const other = findDog.get(otherId)
  if (!other || other.family_id !== req.familyId) return res.status(404).json({ error: 'Tier nicht gefunden' })

  insertLink.run(req.familyId, Math.min(dog.id, other.id), Math.max(dog.id, other.id))
  res.status(201).json(findHousemates.all({ id: dog.id, familyId: req.familyId }))
})

router.delete('/:id/housemates/:otherId', requireAuth, (req, res) => {
  const dog = loadOwnDog(req, res)
  if (!dog) return
  const otherId = cleanId(req.params.otherId)
  if (!otherId || Number.isNaN(otherId)) return res.status(400).json({ error: 'Ungültiges Tier' })
  const [a, b] = dog.id < otherId ? [dog.id, otherId] : [otherId, dog.id]
  db.prepare('DELETE FROM dog_links WHERE dog_a_id = ? AND dog_b_id = ? AND family_id = ?').run(a, b, req.familyId)
  res.status(204).end()
})

// Neues Tier samt "lebt zusammen mit" in einem Schritt – schlägt eins fehl, bleibt nichts zurück
const createDog = db.transaction((record, familyId, housemateId) => {
  const id = Number(insertDog.run({ ...record, family_id: familyId }).lastInsertRowid)
  if (housemateId) insertLink.run(familyId, Math.min(id, housemateId), Math.max(id, housemateId))
  return id
})

function validateHousemate(housemateId, familyId) {
  if (housemateId === null) return null
  if (Number.isNaN(housemateId)) return 'Mitbewohner: ungültige Auswahl'
  const mate = findDog.get(housemateId)
  if (!mate || mate.family_id !== familyId) return 'Mitbewohner muss ein Tier des eigenen Rudels sein'
  return null
}

router.post('/', requireAuth, (req, res) => {
  const body = req.body || {}
  const record = buildDogRecord(body)
  const housemateId = cleanId(body.housemateId)
  const error = validateDogRecord(record, null, req.familyId) || validateHousemate(housemateId, req.familyId)
  if (error) return res.status(400).json({ error })

  const id = createDog(record, req.familyId, housemateId)
  res.status(201).json(findDog.get(id))
})

router.put('/:id', requireAuth, (req, res) => {
  const existing = loadOwnDog(req, res)
  if (!existing) return

  const record = buildDogRecord(req.body || {}, existing)
  const error = validateDogRecord(record, existing.id, req.familyId)
  if (error) return res.status(400).json({ error })

  db.prepare(
    `UPDATE dogs SET
       name = @name, name_unbekannt = @name_unbekannt, rasse = @rasse, tierart = @tierart,
       geschlecht = @geschlecht, geburtsdatum = @geburtsdatum,
       farbe_markings = @farbe_markings, mother_dog_id = @mother_dog_id,
       father_dog_id = @father_dog_id, mother_freitext = @mother_freitext,
       father_freitext = @father_freitext, foto_url = @foto_url, beschreibung = @beschreibung,
       bei_uns_seit = @bei_uns_seit, bei_uns_bis = @bei_uns_bis, abschied_grund = @abschied_grund,
       herkunft_art = @herkunft_art, herkunft_text = @herkunft_text
     WHERE id = @id`
  ).run({ ...record, id: existing.id })

  res.json(findDog.get(existing.id))
})

// Teilen: nur aus "Meine Chronik" heraus, nur in Rudel, in denen der Haushalt Mitglied ist.
// Ersetzt jeweils die komplette Menge (nicht additiv) – einfacher fürs Frontend als Diffing.
const replaceShares = db.transaction((dogId, familyIds) => {
  db.prepare('DELETE FROM dog_shares WHERE dog_id = ?').run(dogId)
  const insert = db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)')
  for (const familyId of familyIds) insert.run(dogId, familyId)
})

const MAX_SHARE_TARGETS = 50

router.put('/:id/shares', requireAuth, (req, res) => {
  const dog = loadOwnDog(req, res)
  if (!dog) return

  const identity = db.prepare('SELECT art FROM families WHERE id = ?').get(req.familyId)
  if (!identity || identity.art !== ART.zuhause) {
    return res.status(400).json({ error: 'Teilen geht aus „Meine Chronik“' })
  }

  const familyIds = (req.body || {}).familyIds
  const validList =
    Array.isArray(familyIds) &&
    familyIds.length <= MAX_SHARE_TARGETS &&
    familyIds.every((id) => Number.isInteger(id) && id > 0)
  if (!validList) return res.status(400).json({ error: 'Ungültige Liste von Familien' })

  // Eine einzige membershipsOf-Abfrage statt einer isMember-Abfrage pro Id, zusätzlich Demo-Parität
  // wie canEnter (kein Wechsel zwischen Demo und Nicht-Demo, selbst bei technischer Mitgliedschaft)
  const uniqueIds = [...new Set(familyIds)]
  const memberships = new Set(membershipsOf(req.familyId).map((m) => m.id))
  const allowed = uniqueIds.every((id) => memberships.has(id) && canEnter(req.familyId, id))
  if (!allowed) {
    return res.status(400).json({ error: 'Nur Familien, in denen ihr Mitglied seid' })
  }

  replaceShares(dog.id, uniqueIds)
  res.json({ shares: listShares.all(dog.id).map((row) => row.family_id).sort((a, b) => a - b) })
})

// Löscht den Hund samt Timeline. Verweise anderer Hunde/Würfe werden zu Freitext,
// damit die Abstammung (auch in anderen Rudeln) lesbar bleibt.
const deleteDog = db.transaction((dog) => {
  const label = dogLabel(dog)
  db.prepare('UPDATE dogs SET mother_dog_id = NULL, mother_freitext = ? WHERE mother_dog_id = ?').run(label, dog.id)
  db.prepare('UPDATE dogs SET father_dog_id = NULL, father_freitext = ? WHERE father_dog_id = ?').run(label, dog.id)
  db.prepare('UPDATE breeding_events SET vater_dog_id = NULL, vater_freitext = ? WHERE vater_dog_id = ?').run(label, dog.id)
  db.prepare('DELETE FROM breeding_events WHERE mutter_dog_id = ?').run(dog.id)
  db.prepare('DELETE FROM entry_comments WHERE entry_id IN (SELECT id FROM timeline_entries WHERE dog_id = ?)').run(dog.id)
  db.prepare('DELETE FROM timeline_entries WHERE dog_id = ?').run(dog.id)
  db.prepare('DELETE FROM dog_links WHERE dog_a_id = ? OR dog_b_id = ?').run(dog.id, dog.id)
  db.prepare('DELETE FROM dog_shares WHERE dog_id = ?').run(dog.id)
  db.prepare('DELETE FROM dogs WHERE id = ?').run(dog.id)
})

router.delete('/:id', requireAuth, (req, res) => {
  const dog = loadOwnDog(req, res)
  if (!dog) return
  deleteDog(dog)
  res.status(204).end()
})

module.exports = router
