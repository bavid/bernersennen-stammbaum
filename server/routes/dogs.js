const crypto = require('node:crypto')
const express = require('express')
const db = require('../db')
const { requireAuth } = require('../middleware/auth')
const { authLimiter } = require('../middleware/abuse')
const { isIsoDate, cleanText, cleanId, isUploadUrl } = require('../lib/validate')
const { dogLabel } = require('../lib/labels')
const { ART, membershipsOf, canEnter, canSeeDog, VISIBLE_DOGS_SQL, VISIBLE_ENTRY_SQL } = require('../lib/context')
const { canAttachUpload, canAttachPublicUpload } = require('../lib/uploadAccess')
const { requireRole, hasRole, FORBIDDEN_MESSAGE } = require('../lib/roles')
const { slugify } = require('../lib/partners')
const { createBatch, revokeOpenHandoverVouchers } = require('../lib/vouchers')
const { formatCode } = require('../lib/codes')
const { VERMITTLUNG_STATUS, PUBLISHABLE_STATUS, statusInSql } = require('../lib/vermittlung')

const router = express.Router()

// Phase R Task 1: jeder Schreibweg an Tieren des aktiven Bereichs (anlegen, pflegen, Mitbewohner,
// Stammbaum über mother/father, löschen) braucht in einer Familie mindestens 'mitglied' (lib/roles.js).
// Im eigenen Bereich (Zuhause, Tierheim) ist man immer Leitung - dort ändert sich nichts.
const canWrite = requireRole('mitglied')

const SEXES = ['ruede', 'huendin']
const SPECIES = ['hund', 'katze', 'anderes']
const PARENTS = [
  { idKey: 'motherDogId', textKey: 'motherFreitext', idCol: 'mother_dog_id', textCol: 'mother_freitext', sex: 'huendin', label: 'Mutter' },
  { idKey: 'fatherDogId', textKey: 'fatherFreitext', idCol: 'father_dog_id', textCol: 'father_freitext', sex: 'ruede', label: 'Vater' }
]
const ABSCHIED_GRUENDE = ['verstorben', 'abgegeben', 'umgezogen', 'anderes']
const HERKUNFT_ARTEN = ['tierheim', 'privat', 'zuechter', 'nachwuchs', 'fundtier', 'anderes']
// Phase T Task 2: Vermittlungsstatus - nur im Tierheim-Bereich setzbar (siehe validateDogRecord).
// "vermittelt" kommt normalerweise erst über die Übergabe (Task 3) zustande, bleibt aber auch hier
// ein gültiger, manuell setzbarer Wert (z. B. wenn eine Vermittlung ohne App-Gutschein stattfand).
// Die Status-Listen (VERMITTLUNG_STATUS, PUBLISHABLE_STATUS: ein Steckbrief lässt sich veröffentlichen
// bzw. bleibt veröffentlicht) kommen seit Phase P Task 1 aus lib/vermittlung.js - inkl. "pausiert".

const UNKNOWN_NAME = 'Unbekannt'
const SUMMARY_COLUMNS = `dogs.id, dogs.name, dogs.name_unbekannt, dogs.rasse, dogs.tierart, dogs.geschlecht, dogs.geburtsdatum,
  dogs.foto_url, dogs.family_id, dogs.bei_uns_seit, dogs.bei_uns_bis, dogs.abschied_grund, dogs.herkunft_art, dogs.herkunft_text,
  families.name AS familyName`

const hasKey = (body, key) => Object.prototype.hasOwnProperty.call(body, key)
const pick = (body, key, fallback) => (hasKey(body, key) ? body[key] : fallback)
// leerer String/undefined/null -> null; sonst der Wert unverändert (Enum-Prüfung folgt in validateDogRecord)
const cleanEnum = (value) => (value === null || value === undefined || value === '' ? null : value)

const findDog = db.prepare('SELECT * FROM dogs WHERE id = ?')
const findFamilyArt = db.prepare('SELECT art FROM families WHERE id = ?')
const insertDog = db.prepare(
  `INSERT INTO dogs
    (family_id, name, name_unbekannt, rasse, tierart, geschlecht, geburtsdatum, farbe_markings,
     mother_dog_id, father_dog_id, mother_freitext, father_freitext, foto_url, beschreibung,
     bei_uns_seit, bei_uns_bis, abschied_grund, herkunft_art, herkunft_text, vermittlung_status)
   VALUES (@family_id, @name, @name_unbekannt, @rasse, @tierart, @geschlecht, @geburtsdatum, @farbe_markings,
     @mother_dog_id, @father_dog_id, @mother_freitext, @father_freitext, @foto_url, @beschreibung,
     @bei_uns_seit, @bei_uns_bis, @abschied_grund, @herkunft_art, @herkunft_text, @vermittlung_status)`
)
const insertLink = db.prepare('INSERT OR IGNORE INTO dog_links (family_id, dog_a_id, dog_b_id) VALUES (?, ?, ?)')
// Nur Rudel-Freigaben (Teilen aus "Meine Chronik", siehe PUT /:id/shares) - die Tierheim-Freigabe
// (dog_shares mit einer Tierheim-Familie, "Tierheim darf mitlesen", siehe PUT /:id/shelter-share) ist
// eine eigene Einwilligung und gehört nicht in diese Liste (security-review Phase T Finding 2).
const listShares = db.prepare(
  `SELECT ds.family_id FROM dog_shares ds JOIN families f ON f.id = ds.family_id
   WHERE ds.dog_id = ? AND f.art = 'rudel' ORDER BY ds.family_id`
)
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
    herkunft_text: cleanText(pick(body, 'herkunftText', existing.herkunft_text), 120),
    // Vermittlungsstatus (Phase T): nur im Tierheim-Bereich erlaubt, siehe validateDogRecord.
    // public_slug bleibt hier bewusst außen vor - den setzt/löscht ausschließlich PUT /:id/steckbrief.
    vermittlung_status: cleanEnum(pick(body, 'vermittlungStatus', existing.vermittlung_status))
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

// existingFotoUrl: der bisherige Wert bei PUT (null bei POST) - bleibt erlaubt, auch wenn er gerade
// nicht (mehr) über canAttachUpload sichtbar wäre (Altbestand, siehe lib/uploadAccess.js)
// previousVermittlungStatus: der bisherige Wert bei PUT (null bei POST) - siehe die Vermittlungsstatus-
// Prüfung unten (security-review Phase T Finding 1).
function validateDogRecord(record, dogId, req, existingFotoUrl = null, previousVermittlungStatus = null) {
  if (!record.name) return 'Name ist erforderlich (oder „Name unbekannt“ wählen)'
  if (!SEXES.includes(record.geschlecht)) return 'Geschlecht muss ruede oder huendin sein'
  if (!SPECIES.includes(record.tierart)) return 'Tierart muss hund, katze oder anderes sein'
  if (record.geburtsdatum && !isIsoDate(record.geburtsdatum)) return 'Geburtsdatum ist ungültig'
  if (record.foto_url && !isUploadUrl(record.foto_url)) return 'Foto-URL ist ungültig'
  if (record.foto_url) {
    const existingUrls = existingFotoUrl ? [existingFotoUrl] : []
    // security-review Phase T Finding 6: ein Tierheim mit Mitlese-Freigabe (dog_shares) auf ein längst
    // vermitteltes Tier SIEHT dessen (vom neuen Zuhause hochgeladene) Fotos - canAttachUpload würde das
    // als "im Bereich sichtbar" durchlassen. Für ein eigenes, noch vermittelbares Tier (Steckbrief-
    // fähig) reicht das nicht: hier zählt nur ein selbst hochgeladenes Foto oder der bisherige Wert,
    // sonst könnte ein privates Adoptanten-Foto in einen öffentlichen Steckbrief wandern.
    const identity = findFamilyArt.get(req.familyId)
    const isPublicShelterAnimal = identity?.art === ART.tierheim && PUBLISHABLE_STATUS.includes(record.vermittlung_status)
    const attachAllowed = isPublicShelterAnimal
      ? canAttachPublicUpload({ familyId: req.familyId }, record.foto_url, existingUrls)
      : canAttachUpload({ familyId: req.familyId, homeId: req.homeId }, record.foto_url, existingUrls)
    if (!attachAllowed) return 'Foto nicht gefunden'
  }
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
  // security-review Phase T Finding 1: die Shelter-only-Regel gilt nur, wenn sich der Wert wirklich
  // ÄNDERT. Nach einer Übergabe (lib/transfers.js transferDog) trägt das Tier weiterhin
  // vermittlung_status='vermittelt', obwohl der neue Besitzer (ein Zuhause) kein Tierheim ist - der
  // bloße Erhalt dieses Werts (Name ändern, Foto ändern, ...) darf nicht an dieser Regel scheitern.
  if (record.vermittlung_status !== previousVermittlungStatus) {
    const identity = findFamilyArt.get(req.familyId)
    if (!identity || identity.art !== ART.tierheim) return 'Vermittlungsstatus gibt es nur im Tierheim-Bereich'
  }
  if (record.vermittlung_status !== null && !VERMITTLUNG_STATUS.includes(record.vermittlung_status)) {
    return 'Unbekannter Vermittlungsstatus'
  }
  for (const parent of PARENTS) {
    const error = validateParent(record, parent, dogId, req.familyId)
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
// latest_entry_titel/latest_entry_datum (final-review Phase T, ShelterAnimalsPage): der neueste im
// Bereich sichtbare Eintrag je Tier - dieselbe VISIBLE_ENTRY_SQL-Regel wie überall (eigene Einträge
// vollständig, geteilte nur nicht-private), für ein eigenes Tierheim-Tier also ALLE seine Einträge.
// Nach created_at (zuletzt GESCHRIEBEN) statt datum sortiert, wie zuvor api.recentActivity - ein
// rückdatierter Eintrag soll die Kartenvorschau nicht in die Vergangenheit springen lassen.
router.get('/', requireAuth, (req, res) => {
  const dogs = db
    .prepare(
      `SELECT dogs.*,
         (SELECT COUNT(*) FROM timeline_entries t WHERE t.dog_id = dogs.id AND ${VISIBLE_ENTRY_SQL}) AS timeline_count,
         (SELECT t.titel FROM timeline_entries t WHERE t.dog_id = dogs.id AND ${VISIBLE_ENTRY_SQL}
            ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS latest_entry_titel,
         (SELECT t.datum FROM timeline_entries t WHERE t.dog_id = dogs.id AND ${VISIBLE_ENTRY_SQL}
            ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS latest_entry_datum,
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

// Übergabe/Mitlesen (Phase T Task 3): das abgebende Tierheim des NEUESTEN Umzugs dieses Tiers, wenn es
// (noch) tatsächlich ein Tierheim-Bereich ist - sonst null (z. B. Tier nie umgezogen, oder die
// Tierheim-Familie besteht nicht mehr). Genutzt von GET /:id (shelterShare) und PUT /:id/shelter-share.
const findLatestTransfer = db.prepare('SELECT from_family_id FROM dog_transfers WHERE dog_id = ? ORDER BY id DESC LIMIT 1')

// name: der admin-gepflegte Partnername (partners.name), nicht der (vom Tierheim-Team selbst frei
// änderbare) Familienname - Fallback auf families.name nur, wenn kein Partner verknüpft ist (final-
// review Phase T: dieselbe Regel wie routes/vouchers.js findHandoverInfo/lib/transfers.js herkunft_text,
// bisher hier noch fehlend).
const findShelterFamilyById = db.prepare(
  `SELECT f.id, COALESCE(p.name, f.name) AS name
   FROM families f LEFT JOIN partners p ON p.id = f.partner_id
   WHERE f.id = ? AND f.art = 'tierheim'`
)

function findShelterForDog(dogId) {
  const transfer = findLatestTransfer.get(dogId)
  if (!transfer?.from_family_id) return null
  return findShelterFamilyById.get(transfer.from_family_id) || null
}

// { shelterName, enabled, storyConsent } wenn es ein Tierheim zum Mitlesen gibt, sonst null.
function shelterShareFor(dogId) {
  const shelter = findShelterForDog(dogId)
  if (!shelter) return null
  const share = db.prepare('SELECT story_consent FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(dogId, shelter.id)
  return { shelterName: shelter.name, enabled: Boolean(share), storyConsent: Boolean(share?.story_consent) }
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
    housemates,
    // Nur für den Besitzer relevant (Einwilligung "Tierheim darf mitlesen") - sonst weggelassen,
    // nicht null, damit die Form für Nicht-Besitzer nicht suggeriert, es gäbe hier etwas zu verwalten.
    ...(canEdit ? { shelterShare: shelterShareFor(dog.id) } : {})
  })
})

// Mitbewohner verbinden – beide müssen zum eigenen Rudel gehören
router.post('/:id/housemates', requireAuth, canWrite, (req, res) => {
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

router.delete('/:id/housemates/:otherId', requireAuth, canWrite, (req, res) => {
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

router.post('/', requireAuth, canWrite, (req, res) => {
  // Phase P Task 1: ein Partner-Bereich (Hundeschule, Hundesalon, Betreuung, ...) führt keine Tiere -
  // Tiere mit Chronik gibt es nur im Zuhause, im Rudel und im Tierheim.
  if (findFamilyArt.get(req.familyId)?.art === ART.partner) {
    return res.status(400).json({ error: 'Partner-Bereiche haben keine Tiere' })
  }

  const body = req.body || {}
  const record = buildDogRecord(body)
  const housemateId = cleanId(body.housemateId)
  const error = validateDogRecord(record, null, req) || validateHousemate(housemateId, req.familyId)
  if (error) return res.status(400).json({ error })

  const id = createDog(record, req.familyId, housemateId)
  res.status(201).json(findDog.get(id))
})

// public_slug bleibt nur erhalten, solange der neue Status veröffentlichbar ist (in_vermittlung/
// reserviert/pausiert) - jeder andere Wert (inkl. NULL, nicht nur 'vermittelt') räumt ihn auf
// (security-review Phase T Finding 10: vorher blieb ein Steckbrief-Link z. B. beim Zurücksetzen auf
// NULL fälschlich stehen). PUBLISHABLE_STATUS ist eine feste, im Code definierte Konstante - statusInSql
// setzt sie als Literal in die IN-Liste, kein Nutzereingabe-Pfad (wie lib/publicMedia.js).
const PUBLIC_SLUG_KEEP_SQL = `CASE WHEN ${statusInSql(PUBLISHABLE_STATUS, '@vermittlung_status')} THEN public_slug ELSE NULL END`

const updateDogStmt = db.prepare(
  `UPDATE dogs SET
     name = @name, name_unbekannt = @name_unbekannt, rasse = @rasse, tierart = @tierart,
     geschlecht = @geschlecht, geburtsdatum = @geburtsdatum,
     farbe_markings = @farbe_markings, mother_dog_id = @mother_dog_id,
     father_dog_id = @father_dog_id, mother_freitext = @mother_freitext,
     father_freitext = @father_freitext, foto_url = @foto_url, beschreibung = @beschreibung,
     bei_uns_seit = @bei_uns_seit, bei_uns_bis = @bei_uns_bis, abschied_grund = @abschied_grund,
     herkunft_art = @herkunft_art, herkunft_text = @herkunft_text, vermittlung_status = @vermittlung_status,
     public_slug = ${PUBLIC_SLUG_KEEP_SQL}
   WHERE id = @id`
)

// Verlässt der Status "reserviert" auf diesem Weg (nicht über DELETE /:id/handover), muss ein noch
// offener Übergabe-Gutschein mit zurückgezogen werden - sonst ließe er sich später einlösen, obwohl die
// Reservierung längst nicht mehr gilt (security-review Phase T Finding 3).
const updateDog = db.transaction((existing, record) => {
  updateDogStmt.run({ ...record, id: existing.id })
  if (existing.vermittlung_status === 'reserviert' && record.vermittlung_status !== 'reserviert') {
    revokeOpenHandoverVouchers(db, existing.id)
  }
})

router.put('/:id', requireAuth, canWrite, (req, res) => {
  const existing = loadOwnDog(req, res)
  if (!existing) return

  const record = buildDogRecord(req.body || {}, existing)
  const error = validateDogRecord(record, existing.id, req, existing.foto_url, existing.vermittlung_status)
  if (error) return res.status(400).json({ error })

  updateDog(existing, record)

  res.json(findDog.get(existing.id))
})

// Steckbrief (Phase T Task 2): veröffentlicht/zieht ein Tier eines Tierheims öffentlich unter
// /t/:slug zurück. Nur der Besitzer-Bereich (loadOwnDog) UND nur ein Tierheim-Bereich dürfen das -
// ein normales Zuhause/Rudel hat keine Steckbriefe. Veröffentlichen geht nur mit einem
// veröffentlichbaren Status (PUBLISHABLE_STATUS: in_vermittlung/reserviert/pausiert - ein pausiertes Tier
// bleibt mit Hinweis sichtbar); Zurückziehen (published: false) geht immer.
const SLUG_SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const SLUG_SUFFIX_LENGTH = 6
const MAX_SLUG_ATTEMPTS = 20

const slugTaken = db.prepare('SELECT 1 FROM dogs WHERE public_slug = ?')

function randomSlugSuffix() {
  let suffix = ''
  for (let i = 0; i < SLUG_SUFFIX_LENGTH; i += 1) suffix += SLUG_SUFFIX_CHARS[crypto.randomInt(SLUG_SUFFIX_CHARS.length)]
  return suffix
}

// <name-kebab>-<6 zufällige [a-z0-9]>, geprüft auf Eindeutigkeit (dogs.public_slug hat einen
// Unique-Index, siehe db.js) - der Zufallsanteil macht eine Kollision praktisch ausgeschlossen,
// die Schleife ist nur ein zusätzliches Sicherheitsnetz.
function generatePublicSlug(name) {
  const base = slugify(name) || 'tier'
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = `${base}-${randomSlugSuffix()}`
    if (!slugTaken.get(slug)) return slug
  }
  throw new Error('Konnte keinen eindeutigen Steckbrief-Link erzeugen')
}

router.put('/:id/steckbrief', requireAuth, canWrite, (req, res) => {
  const dog = loadOwnDog(req, res)
  if (!dog) return

  const identity = findFamilyArt.get(req.familyId)
  if (!identity || identity.art !== ART.tierheim) {
    return res.status(400).json({ error: 'Steckbriefe gibt es nur im Tierheim-Bereich' })
  }

  const { published } = req.body || {}
  if (typeof published !== 'boolean') return res.status(400).json({ error: '„published“ muss true oder false sein' })

  if (published) {
    if (!PUBLISHABLE_STATUS.includes(dog.vermittlung_status)) {
      return res.status(400).json({ error: 'Veröffentlichen geht nur mit Status „in Vermittlung“, „reserviert“ oder „pausiert“' })
    }
    db.prepare('UPDATE dogs SET public_slug = ? WHERE id = ?').run(generatePublicSlug(dog.name), dog.id)
  } else {
    db.prepare('UPDATE dogs SET public_slug = NULL WHERE id = ?').run(dog.id)
  }

  res.json(findDog.get(dog.id))
})

// Übergabe-Gutschein (Phase T Task 3): der Tierheim-Besitzer erzeugt einen Gutschein, mit dem das Tier
// samt Chronik ins neue Zuhause umzieht (siehe lib/transfers.js transferDog, aufgerufen beim Einlösen/
// claim - lib/vouchers.js). authLimiter zusätzlich zum ohnehin für /api/dogs greifenden writeLimiter
// (app.js limitWrites): wie andere sensible, Code ausgebende Aktionen (routes/auth.js /family/key).
// "nicht Demo" ist schon durch requireAuth abgedeckt (Demo darf nur GET).
// HANDOVER_VOUCHER_DAYS: befristet, damit eine vergessene/verlorene Reservierung nicht ewig offen
// bleibt (security-review Phase T Finding 3) - abgelaufene Gutscheine lehnt redeem/claim ohnehin ab.
const HANDOVER_VOUCHER_DAYS = 30
const HANDOVER_VOUCHER_MS = HANDOVER_VOUCHER_DAYS * 24 * 60 * 60 * 1000

const setReservedStmt = db.prepare("UPDATE dogs SET vermittlung_status = 'reserviert' WHERE id = ?")

// Zurückziehen + Statuswechsel + neuer Gutschein-Stapel als EINE Transaktion (security-review Phase T
// Finding 3) - ein Absturz mittendrin darf das Tier nie im Zustand "reserviert ohne gültigen Gutschein"
// oder "zwei offene Gutscheine" zurücklassen.
const createHandover = db.transaction((dog, identity) => {
  revokeOpenHandoverVouchers(db, dog.id)
  setReservedStmt.run(dog.id)
  return createBatch(db, {
    label: `Übergabe ${dog.name}`,
    kind: 'partner',
    size: 1,
    issuedByFamilyId: dog.family_id,
    partnerId: identity.partner_id,
    dogId: dog.id,
    expiresAt: new Date(Date.now() + HANDOVER_VOUCHER_MS)
  })
})

router.post('/:id/handover', authLimiter, requireAuth, canWrite, (req, res) => {
  const dog = loadOwnDog(req, res)
  if (!dog) return

  const identity = db.prepare('SELECT art, partner_id FROM families WHERE id = ?').get(req.familyId)
  if (!identity || identity.art !== ART.tierheim) {
    return res.status(400).json({ error: 'Übergabe-Gutscheine gibt es nur im Tierheim-Bereich' })
  }
  // Phase P Task 1: ein pausiertes Tier ist gerade nicht vermittelbar - eine Übergabe würde es sonst
  // stillschweigend auf "reserviert" setzen. Erst den Status zurück auf "in Vermittlung" stellen.
  if (dog.vermittlung_status === 'pausiert') {
    return res.status(400).json({ error: 'Das Tier ist pausiert – für eine Übergabe bitte erst auf „Verfügbar“ oder „Reserviert“ setzen' })
  }

  const { codes } = createHandover(dog, identity)
  const code = codes[0]

  res.status(201).json({ code: formatCode(code), link: `/v#${code}` })
})

// Übergabe stornieren (Phase T, security-review Finding 3): zieht offene Übergabe-Gutscheine dieses
// Tiers zurück und setzt den Status zurück auf "in_vermittlung", falls er noch "reserviert" war (ein
// inzwischen z. B. auf "vermittelt" gesetztes Tier bleibt unangetastet). Nur der Tierheim-Besitzer.
const cancelHandover = db.transaction((dog) => {
  revokeOpenHandoverVouchers(db, dog.id)
  if (dog.vermittlung_status === 'reserviert') {
    db.prepare("UPDATE dogs SET vermittlung_status = 'in_vermittlung' WHERE id = ?").run(dog.id)
  }
})

router.delete('/:id/handover', requireAuth, canWrite, (req, res) => {
  const dog = loadOwnDog(req, res)
  if (!dog) return

  const identity = db.prepare('SELECT art FROM families WHERE id = ?').get(req.familyId)
  if (!identity || identity.art !== ART.tierheim) {
    return res.status(400).json({ error: 'Übergabe-Gutscheine gibt es nur im Tierheim-Bereich' })
  }

  cancelHandover(dog)
  res.json(findDog.get(dog.id))
})

// Teilen: nur aus "Meine Chronik" heraus, nur in Rudel, in denen der Haushalt Mitglied ist. Phase R
// Task 1: eine NEUE Freigabe braucht in der Ziel-Familie mindestens 'mitglied' (ein Gast teilt nichts);
// eine schon bestehende Freigabe darf bleiben (z. B. nach einer Herabstufung zum Gast), und Entfernen
// geht immer. canWrite gilt hier für den aktiven Bereich - das eigene Zuhause, also immer Leitung.
// Ersetzt jeweils die komplette Menge (nicht additiv) – einfacher fürs Frontend als Diffing. Löscht
// dabei NUR Rudel-Freigaben - eine eventuelle Tierheim-Freigabe (dog_shares mit story_consent, siehe
// PUT /:id/shelter-share) blieb bisher fälschlich mit gelöscht (security-review Phase T Finding 2).
const replaceShares = db.transaction((dogId, familyIds) => {
  db.prepare(
    `DELETE FROM dog_shares WHERE dog_id = ? AND family_id IN (SELECT id FROM families WHERE art = 'rudel')`
  ).run(dogId)
  const insert = db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)')
  for (const familyId of familyIds) insert.run(dogId, familyId)
})

const MAX_SHARE_TARGETS = 50

router.put('/:id/shares', requireAuth, canWrite, (req, res) => {
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
  const current = new Set(listShares.all(dog.id).map((row) => row.family_id))
  const added = uniqueIds.filter((id) => !current.has(id))
  if (!added.every((id) => hasRole(req.familyId, id, 'mitglied'))) {
    return res.status(403).json({ error: FORBIDDEN_MESSAGE })
  }

  replaceShares(dog.id, uniqueIds)
  res.json({ shares: listShares.all(dog.id).map((row) => row.family_id).sort((a, b) => a - b) })
})

// Einwilligung "Tierheim darf mitlesen" (Phase T Task 3): nur für den Besitzer-Haushalt, und nur wenn
// es laut dog_transfers überhaupt ein (noch bestehendes) abgebendes Tierheim gibt. enabled=true legt
// den dog_shares-Eintrag an/aktualisiert ihn (mit story_consent); enabled=false löscht ihn - danach
// sieht das Tierheim dieses Tier nicht mehr (canSeeDog/VISIBLE_DOGS_SQL).
const setShelterShare = db.transaction((dogId, familyId, storyConsent) => {
  db.prepare('DELETE FROM dog_shares WHERE dog_id = ? AND family_id = ?').run(dogId, familyId)
  db.prepare('INSERT INTO dog_shares (dog_id, family_id, story_consent) VALUES (?, ?, ?)').run(dogId, familyId, storyConsent)
})

router.put('/:id/shelter-share', requireAuth, canWrite, (req, res) => {
  const dog = loadOwnDog(req, res)
  if (!dog) return

  const shelter = findShelterForDog(dog.id)
  if (!shelter) return res.status(400).json({ error: 'Für dieses Tier gibt es kein Tierheim zum Mitlesen' })

  const { enabled, storyConsent } = req.body || {}
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: '„enabled“ muss true oder false sein' })
  // security-review Phase T Finding 7: storyConsent muss, wenn mitgeschickt, ein echter Boolean sein -
  // sonst würde z. B. der String "false" (truthy!) stillschweigend als Einwilligung durchgehen.
  if (storyConsent !== undefined && storyConsent !== null && typeof storyConsent !== 'boolean') {
    return res.status(400).json({ error: '„storyConsent“ muss true oder false sein' })
  }

  if (enabled) {
    setShelterShare(dog.id, shelter.id, storyConsent ? 1 : 0)
  } else {
    db.prepare('DELETE FROM dog_shares WHERE dog_id = ? AND family_id = ?').run(dog.id, shelter.id)
  }

  res.json(shelterShareFor(dog.id))
})

// Löscht den Hund samt Timeline. Verweise anderer Hunde/Würfe werden zu Freitext,
// damit die Abstammung (auch in anderen Rudeln) lesbar bleibt.
const deleteDog = db.transaction((dog) => {
  // Ein noch offener Übergabe-Gutschein für dieses Tier darf danach nicht mehr einlösbar sein
  // (security-review Phase T Finding 3) - assertHandoverStillRedeemable in lib/vouchers.js würde das
  // zwar ohnehin ablehnen (das Tier existiert nicht mehr), aber revoked_at macht es auch für /check
  // und die Gutschein-Übersicht sofort sichtbar "erledigt".
  revokeOpenHandoverVouchers(db, dog.id)
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

router.delete('/:id', requireAuth, canWrite, (req, res) => {
  const dog = loadOwnDog(req, res)
  if (!dog) return
  deleteDog(dog)
  res.status(204).end()
})

module.exports = router
