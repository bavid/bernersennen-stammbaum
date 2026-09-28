// Legt das Demo-Rudel aus seed/demo-data.js an – für die öffentliche Demo und die lokale Entwicklung.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const bcrypt = require('bcryptjs')
const { deleteFamily, removeUploads } = require('./families')
const { validatePartner, slugify } = require('./partners')
const { FAMILY_NAME, DOGS, HOUSEMATES, TIMELINE, BREEDING, NOTES } = require('../seed/demo-data')
const {
  HOUSEHOLD_NAME,
  COMPANIONS,
  HOUSEMATES: HOUSEHOLD_HOUSEMATES,
  TIMELINE: HOUSEHOLD_TIMELINE
} = require('../seed/demo-household')
const { DEMO_PARTNERS } = require('../seed/demo-partners')
const { SHELTER_NAME, DOGS: SHELTER_DOGS, TIMELINE: SHELTER_TIMELINE } = require('../seed/demo-shelter')

const IMAGE_DIR = path.join(__dirname, '..', 'seed', 'images')
const UNKNOWN_NAME = 'Unbekannt'

// Kopiert Seed-Bilder mit zufälligem Namen in den Upload-Ordner (jedes Bild nur einmal)
function createImageCopier(uploadDir) {
  fs.mkdirSync(uploadDir, { recursive: true })
  const copied = new Map()
  return (fileName) => {
    if (!copied.has(fileName)) {
      const target = `${crypto.randomUUID()}${path.extname(fileName)}`
      fs.copyFileSync(path.join(IMAGE_DIR, fileName), path.join(uploadDir, target))
      copied.set(fileName, `/uploads/${target}`)
    }
    return copied.get(fileName)
  }
}

const ago = (hours) => `-${hours} hours`

function insertDogs(db, familyId, copyImage) {
  const insert = db.prepare(
    `INSERT INTO dogs (family_id, name, name_unbekannt, rasse, tierart, geschlecht, geburtsdatum, farbe_markings,
       mother_dog_id, father_dog_id, mother_freitext, father_freitext, foto_url, beschreibung)
     VALUES (@familyId, @name, @nameUnbekannt, @rasse, @tierart, @geschlecht, @geburtsdatum, @farbe,
       @motherId, @fatherId, @motherFreitext, @fatherFreitext, @fotoUrl, @beschreibung)`
  )
  const ids = {}
  for (const dog of DOGS) {
    const tierart = dog.tierart || 'hund'
    ids[dog.key] = insert.run({
      familyId,
      name: dog.nameUnbekannt ? UNKNOWN_NAME : dog.name,
      nameUnbekannt: dog.nameUnbekannt ? 1 : 0,
      rasse: dog.rasse || (tierart === 'hund' ? 'Berner Sennenhund' : null),
      tierart,
      geschlecht: dog.geschlecht,
      geburtsdatum: dog.geburtsdatum || null,
      farbe: dog.farbe || null,
      motherId: dog.mother ? ids[dog.mother] : null,
      fatherId: dog.father ? ids[dog.father] : null,
      motherFreitext: dog.motherFreitext || null,
      fatherFreitext: dog.fatherFreitext || null,
      fotoUrl: dog.foto ? copyImage(dog.foto) : null,
      beschreibung: dog.beschreibung || null
    }).lastInsertRowid
  }
  const link = db.prepare('INSERT INTO dog_links (family_id, dog_a_id, dog_b_id) VALUES (?, ?, ?)')
  for (const [a, b] of HOUSEMATES) {
    link.run(familyId, Math.min(ids[a], ids[b]), Math.max(ids[a], ids[b]))
  }
  return ids
}

function insertTimeline(db, familyId, ids, copyImage) {
  const insertEntry = db.prepare(
    `INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text, foto_urls, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(datetime('now', ?), datetime(?, '+18 hours')))`
  )
  const insertComment = db.prepare(
    `INSERT INTO entry_comments (entry_id, family_id, autor_name, text, created_at) VALUES (?, ?, ?, ?, datetime('now', ?))`
  )
  for (const entry of TIMELINE) {
    const fotos = (entry.fotos || []).map(copyImage)
    const writtenAgo = entry.hoursAgo ? ago(entry.hoursAgo) : null
    const entryId = insertEntry.run(
      ids[entry.dog], familyId, entry.autor, entry.datum, entry.titel, entry.text || null, JSON.stringify(fotos),
      writtenAgo, entry.datum
    ).lastInsertRowid
    for (const comment of entry.comments || []) {
      insertComment.run(entryId, familyId, comment.autor, comment.text, ago(comment.hoursAgo))
    }
  }
}

function insertNotes(db, familyId) {
  const insertNote = db.prepare(
    `INSERT INTO notes (family_id, autor_name, text, termin_datum, termin_zeit, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', ?))`
  )
  const insertReply = db.prepare(
    `INSERT INTO note_replies (note_id, family_id, autor_name, text, created_at) VALUES (?, ?, ?, ?, datetime('now', ?))`
  )
  for (const note of NOTES) {
    const noteId = insertNote.run(
      familyId, note.autor, note.text, note.terminDatum || null, note.terminZeit || null, ago(note.hoursAgo)
    ).lastInsertRowid
    for (const reply of note.replies || []) insertReply.run(noteId, familyId, reply.autor, reply.text, ago(reply.hoursAgo))
  }
}

function insertBreeding(db, familyId, ids, copyImage) {
  const insert = db.prepare(
    `INSERT INTO breeding_events (family_id, mutter_dog_id, vater_dog_id, vater_freitext, datum, wurf_info, foto_urls)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  for (const event of BREEDING) {
    insert.run(
      familyId,
      ids[event.mutter],
      event.vater ? ids[event.vater] : null,
      event.vaterFreitext || null,
      event.datum,
      event.wurfInfo,
      JSON.stringify((event.fotos || []).map(copyImage))
    )
  }
}

function insertCompanions(db, familyId, copyImage) {
  const insert = db.prepare(
    `INSERT INTO dogs (family_id, name, rasse, tierart, geschlecht, geburtsdatum, foto_url, beschreibung,
       bei_uns_seit, bei_uns_bis, abschied_grund, herkunft_art, herkunft_text)
     VALUES (@familyId, @name, @rasse, @tierart, @geschlecht, @geburtsdatum, @fotoUrl, @beschreibung,
       @beiUnsSeit, @beiUnsBis, @abschiedGrund, @herkunftArt, @herkunftText)`
  )
  const ids = {}
  for (const companion of COMPANIONS) {
    ids[companion.key] = insert.run({
      familyId,
      name: companion.name,
      rasse: companion.rasse || null,
      tierart: companion.tierart,
      geschlecht: companion.geschlecht,
      geburtsdatum: companion.geburtsdatum || null,
      fotoUrl: companion.foto ? copyImage(companion.foto) : null,
      beschreibung: companion.beschreibung || null,
      beiUnsSeit: companion.beiUnsSeit || null,
      beiUnsBis: companion.beiUnsBis || null,
      abschiedGrund: companion.abschiedGrund || null,
      herkunftArt: companion.herkunftArt || null,
      herkunftText: companion.herkunftText || null
    }).lastInsertRowid
  }
  const link = db.prepare('INSERT INTO dog_links (family_id, dog_a_id, dog_b_id) VALUES (?, ?, ?)')
  for (const [a, b] of HOUSEHOLD_HOUSEMATES) {
    link.run(familyId, Math.min(ids[a], ids[b]), Math.max(ids[a], ids[b]))
  }
  return ids
}

// Liefert zusätzlich entryIds: Id je Eintrag mit "key" - damit ein anderer Bereich (das Rudel, dem
// der Haushalt beitritt) gezielt einen Kommentar an einen bestimmten Eintrag hängen kann.
// shelterFamilyId (Phase T Task 6, optional): gesetzt für Einträge mit herkunftShelter (siehe
// seed/demo-household.js, Neles frühe Tierheim-Einträge) - genau die Spalte, die auch lib/transfers.js
// transferDog beim echten Umzug setzt, damit die Timeline "aus Tierheim Sonnenhang" zeigt.
function insertHouseholdTimeline(db, familyId, ids, { shelterFamilyId } = {}) {
  const insertEntry = db.prepare(
    `INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text, privat, kategorie, herkunft_family_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(datetime('now', ?), datetime(?, '+18 hours')))`
  )
  const entryIds = {}
  for (const entry of HOUSEHOLD_TIMELINE) {
    const writtenAgo = entry.hoursAgo ? ago(entry.hoursAgo) : null
    const herkunftFamilyId = entry.herkunftShelter && shelterFamilyId ? shelterFamilyId : null
    const entryId = insertEntry.run(
      ids[entry.dog], familyId, entry.autor, entry.datum, entry.titel, entry.text || null,
      entry.privat ? 1 : 0, entry.kategorie || null, herkunftFamilyId, writtenAgo, entry.datum
    ).lastInsertRowid
    if (entry.key) entryIds[entry.key] = entryId
  }
  return entryIds
}

// Legt die Demo-Partner an (is_demo = 1, siehe seed/demo-partners.js) - dieselbe validatePartner()
// wie der Admin (POST /api/admin/partners, siehe lib/partners.js), damit Slug, Kontrastprüfung und
// Züchter-Schutz identisch greifen. Gibt die neuen Ids zurück.
function insertDemoPartners(db) {
  const ids = []
  for (const input of DEMO_PARTNERS) {
    const clean = validatePartner(input)
    const columns = [...Object.keys(clean), 'is_demo']
    const id = db
      .prepare(`INSERT INTO partners (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`)
      .run(...columns.map((col) => (col === 'is_demo' ? 1 : clean[col]))).lastInsertRowid
    ids.push(id)
  }
  return ids
}

// Phase T Task 6: Slug-Erzeugung für veröffentlichte Steckbriefe des Demo-Tierheims - spiegelt
// routes/dogs.js generatePublicSlug (eigene, kleine Kopie hier: der Seed läuft unabhängig von den
// Express-Routen, ohne deren interne Helfer zu importieren).
const SHELTER_SLUG_SUFFIX_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const SHELTER_SLUG_SUFFIX_LENGTH = 6
const SHELTER_MAX_SLUG_ATTEMPTS = 20

function randomShelterSlugSuffix() {
  let suffix = ''
  for (let i = 0; i < SHELTER_SLUG_SUFFIX_LENGTH; i += 1) {
    suffix += SHELTER_SLUG_SUFFIX_CHARS[crypto.randomInt(SHELTER_SLUG_SUFFIX_CHARS.length)]
  }
  return suffix
}

function generateShelterPublicSlug(db, name) {
  const base = slugify(name) || 'tier'
  const taken = db.prepare('SELECT 1 FROM dogs WHERE public_slug = ?')
  for (let attempt = 0; attempt < SHELTER_MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = `${base}-${randomShelterSlugSuffix()}`
    if (!taken.get(slug)) return slug
  }
  throw new Error('Konnte keinen eindeutigen Steckbrief-Link erzeugen')
}

function insertShelterDogs(db, familyId, copyImage) {
  const insert = db.prepare(
    `INSERT INTO dogs (family_id, name, rasse, tierart, geschlecht, geburtsdatum, foto_url, beschreibung, vermittlung_status, public_slug)
     VALUES (@familyId, @name, @rasse, @tierart, @geschlecht, @geburtsdatum, @fotoUrl, @beschreibung, @vermittlungStatus, @publicSlug)`
  )
  const ids = {}
  for (const dog of SHELTER_DOGS) {
    ids[dog.key] = insert.run({
      familyId,
      name: dog.name,
      rasse: dog.rasse || null,
      tierart: dog.tierart,
      geschlecht: dog.geschlecht,
      geburtsdatum: dog.geburtsdatum || null,
      fotoUrl: dog.foto ? copyImage(dog.foto) : null,
      beschreibung: dog.beschreibung || null,
      vermittlungStatus: dog.vermittlungStatus,
      publicSlug: dog.published ? generateShelterPublicSlug(db, dog.name) : null
    }).lastInsertRowid
  }
  return ids
}

function insertShelterTimeline(db, familyId, ids, copyImage) {
  const insertEntry = db.prepare(
    `INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text, foto_urls, kategorie, is_public, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(datetime('now', ?), datetime(?, '+18 hours')))`
  )
  for (const entry of SHELTER_TIMELINE) {
    const fotos = (entry.fotos || []).map(copyImage)
    const writtenAgo = entry.hoursAgo ? ago(entry.hoursAgo) : null
    insertEntry.run(
      ids[entry.dog], familyId, entry.autor, entry.datum, entry.titel, entry.text || null, JSON.stringify(fotos),
      entry.kategorie || null, entry.isPublic ? 1 : 0, writtenAgo, entry.datum
    )
  }
}

// Legt das Demo-Tierheim an (art='tierheim', is_demo=1, partner_id = der übergebene Demo-Partner) mit
// seinen vier Tieren und ihrer Chronik (seed/demo-shelter.js). password_hash='!'/legacy_password=0 wie
// ein echter Tierheim-Bereich (siehe routes/admin.js POST /partners/:id/shelter) - kein access_key_hash,
// der Zugang läuft für die Demo ausschließlich über POST /api/demo { as: 'tierheim' } (routes/auth.js).
function createDemoShelter(db, { copyImage, partnerId }) {
  const familyId = db
    .prepare(
      `INSERT INTO families (name, password_hash, art, theme, partner_id, legacy_password, is_demo)
       VALUES (?, '!', 'tierheim', 'standard', ?, 0, 1)`
    )
    .run(SHELTER_NAME, partnerId).lastInsertRowid
  const ids = insertShelterDogs(db, familyId, copyImage)
  insertShelterTimeline(db, familyId, ids, copyImage)
  return { familyId, dogIds: ids, dogs: SHELTER_DOGS.length, entries: SHELTER_TIMELINE.length }
}

// Erzeugt "Meine Chronik" eines Haushalts mit Begleitern (Einzug/Abschied/Herkunft), teils privaten
// Chronik-Einträgen und einem Mitbewohner-Paar ohne gemeinsame Abstammung.
// groupFamilyId: tritt der Haushalt sofort einem Rudel bei (z. B. dem Demo-Rudel oder dem Test-Rudel)?
// Dann werden Nele und Mira dorthin geteilt und ein Kommentar einer fremden Familie an Neles
// Einzugseintrag gehängt - so zeigt die Demo auch das Zusammenspiel Haushalt <-> Rudel.
// shelterFamilyId (Phase T Task 6, optional): das Demo-Tierheim, aus dem Nele laut seed/demo-household.js
// (herkunftArt='tierheim') kam. Verknüpft ihre frühen Einträge (insertHouseholdTimeline oben), legt
// einen dog_transfers-Eintrag an (wie lib/transfers.js transferDog es bei einer echten Übergabe täte)
// und teilt Nele mit story_consent=1 zurück ans Tierheim - so sieht es sie unter "Ehemalige" (siehe
// routes/dogs.js findLatestTransfer/shelterShareFor). Keine voucher_id: dieser "Umzug" ist reine
// Seed-Historie, kein echt eingelöster Gutschein.
function createDemoHousehold(db, { password, isDemo, copyImage, groupFamilyId, shelterFamilyId, name = HOUSEHOLD_NAME, theme = 'standard' }) {
  return db.transaction(() => {
    const familyId = db
      .prepare("INSERT INTO families (name, password_hash, is_demo, theme, art) VALUES (?, ?, ?, ?, 'zuhause')")
      .run(name, bcrypt.hashSync(password, 10), isDemo ? 1 : 0, theme).lastInsertRowid
    const ids = insertCompanions(db, familyId, copyImage)
    const entryIds = insertHouseholdTimeline(db, familyId, ids, { shelterFamilyId })

    if (groupFamilyId) {
      db.prepare('INSERT OR IGNORE INTO family_members (member_family_id, group_family_id) VALUES (?, ?)').run(familyId, groupFamilyId)
      const share = db.prepare('INSERT OR IGNORE INTO dog_shares (dog_id, family_id) VALUES (?, ?)')
      share.run(ids.nele, groupFamilyId)
      share.run(ids.mira, groupFamilyId)
      if (entryIds.neleEinzug) {
        db.prepare('INSERT INTO entry_comments (entry_id, family_id, autor_name, text) VALUES (?, ?, ?, ?)').run(
          entryIds.neleEinzug,
          groupFamilyId,
          'Familie Keller',
          'Willkommen, Nele! Am Deich wird es dir bestimmt gefallen.'
        )
      }
    }

    if (shelterFamilyId) {
      db.prepare('INSERT INTO dog_transfers (dog_id, from_family_id, to_family_id, voucher_id) VALUES (?, ?, ?, NULL)').run(
        ids.nele,
        shelterFamilyId,
        familyId
      )
      db.prepare('INSERT INTO dog_shares (dog_id, family_id, story_consent) VALUES (?, ?, 1)').run(ids.nele, shelterFamilyId)
    }

    return { familyId, dogs: COMPANIONS.length, entries: HOUSEHOLD_TIMELINE.length, dogIds: ids }
  })()
}

// isDemo: öffentliche, schreibgeschützte Demo (Login über "Demo ansehen" ohne Passwort)
// name: abweichender Rudel-Name, z. B. für ein beschreibbares Test-Rudel neben der Demo
// theme: Auftritt der Familie – ohne Angabe der Berner-Look (bestehende Rudel, siehe db.js)
function createDemoPack(db, { password, isDemo, copyImage, name = FAMILY_NAME, theme = 'berner' }) {
  return db.transaction(() => {
    const familyId = db
      .prepare('INSERT INTO families (name, password_hash, is_demo, theme) VALUES (?, ?, ?, ?)')
      .run(name, bcrypt.hashSync(password, 10), isDemo ? 1 : 0, theme).lastInsertRowid
    const ids = insertDogs(db, familyId, copyImage)
    insertTimeline(db, familyId, ids, copyImage)
    insertNotes(db, familyId)
    insertBreeding(db, familyId, ids, copyImage)
    return { familyId, dogs: DOGS.length, entries: TIMELINE.length }
  })()
}

// Ersetzt die öffentliche Demo: legt zuerst die neue an (Rudel, dann das Zuhause "Zuhause am Deich"
// als Mitglied mit zwei geteilten Tieren, beides in EINER Transaktion) und löscht erst danach alle
// alten Demo-Familien (is_demo = 1, egal ob Rudel oder Zuhause) samt Fotos. Scheitert das Anlegen,
// bleibt die alte Demo unangetastet erreichbar; die alten Ids werden vorher eingesammelt, damit das
// Löschen die gerade frisch angelegten (höheren) Ids nicht treffen kann.
// Das Passwort ist zufällig – in die Demo kommt man über "Demo ansehen".
// name/theme: abweichender Name/Auftritt der öffentlichen Demo (z. B. themenpassend) - gilt nur fürs
// Rudel; das Zuhause bleibt immer "Zuhause am Deich" im Standard-Auftritt.
//
// Die Demo-Partner (is_demo = 1, siehe seed/demo-partners.js) laufen ANDERS als Rudel/Zuhause: ihr
// Slug ist UNIQUE, darum müssen die alten erst weg, bevor die neuen (mit denselben Slugs) entstehen -
// alles innerhalb DERSELBEN Transaktion wie das restliche Anlegen, damit bei einem Fehler (z. B. eine
// künftig ungültige Demo-Partner-Angabe) die ganze Transaktion zurückrollt und die alten Partner
// unangetastet bleiben, statt für einen Moment ganz zu fehlen.
// Phase T Task 6: die drei Demo-Partner entstehen in fester Reihenfolge (siehe seed/demo-partners.js),
// aber ein Nachschlagen über den Slug bleibt robust, falls sich die Reihenfolge dort je ändert.
const SHELTER_PARTNER_SLUG = 'tierheim-sonnenhang'

function replaceDemoPack(db, uploadDir, { theme, name } = {}) {
  const previous = db.prepare('SELECT id, name FROM families WHERE is_demo = 1').all()
  const previousPartnerIds = db.prepare('SELECT id FROM partners WHERE is_demo = 1').all().map((row) => row.id)
  const copyImage = createImageCopier(uploadDir)

  const { created, household, shelter, partnerIds } = db.transaction(() => {
    const packOptions = { password: crypto.randomBytes(24).toString('base64url'), isDemo: true, copyImage }
    if (theme !== undefined) packOptions.theme = theme
    if (name !== undefined) packOptions.name = name
    const rudelResult = createDemoPack(db, packOptions)

    // families.partner_id / vouchers.partner_id / voucher_batches.partner_id sind reine INTEGER-Spalten
    // ohne REFERENCES (siehe db.js) - das Löschen unten scheitert also nie an einem Fremdschlüssel.
    // Trotzdem werden übrig gebliebene Verweise auf die alten Demo-Partner-Ids vorher genullt, damit
    // z. B. ein in der Testumgebung eingelöster Demo-Partner-Gutschein (siehe scripts/testenv-seed.js)
    // danach nicht auf eine Partner-Id zeigt, die es nicht mehr gibt.
    if (previousPartnerIds.length) {
      const placeholders = previousPartnerIds.map(() => '?').join(', ')
      db.prepare(`UPDATE families SET partner_id = NULL WHERE partner_id IN (${placeholders})`).run(...previousPartnerIds)
      db.prepare(`UPDATE vouchers SET partner_id = NULL WHERE partner_id IN (${placeholders})`).run(...previousPartnerIds)
      db.prepare(`UPDATE voucher_batches SET partner_id = NULL WHERE partner_id IN (${placeholders})`).run(...previousPartnerIds)
      db.prepare(`DELETE FROM partners WHERE id IN (${placeholders})`).run(...previousPartnerIds)
    }
    const newPartnerIds = insertDemoPartners(db)

    // Das Demo-Tierheim braucht die neue Partner-Id (nicht die alte, gerade gelöschte) - darum erst
    // NACH insertDemoPartners, und das Zuhause ("Zuhause am Deich") erst NACH dem Tierheim, damit Neles
    // Verknüpfung (dog_transfers, dog_shares mit story_consent) das Tierheim schon kennt.
    const shelterPartner = db.prepare('SELECT id FROM partners WHERE slug = ?').get(SHELTER_PARTNER_SLUG)
    const shelterResult = createDemoShelter(db, { copyImage, partnerId: shelterPartner.id })

    const householdResult = createDemoHousehold(db, {
      password: crypto.randomBytes(24).toString('base64url'),
      isDemo: true,
      copyImage,
      groupFamilyId: rudelResult.familyId,
      shelterFamilyId: shelterResult.familyId
    })

    return { created: rudelResult, household: householdResult, shelter: shelterResult, partnerIds: newPartnerIds }
  })()

  // Die alten Demo-Familien sind jetzt vollständig durch neue ersetzt (auch das Tierheim, is_demo=1,
  // art='tierheim', gehört dazu und steckt schon in previous) - dog_transfers-Zeilen, die noch auf eine
  // der alten Ids zeigen, sind reine Seed-Historie ohne jeden Wert mehr (anders als bei einem ECHTEN
  // gelöschten Tierheim, siehe db.js-Kommentar zu dog_transfers: dort bleiben sie bewusst als Protokoll
  // stehen). deleteFamily selbst fasst dog_transfers nicht an, darum hier vorab aufräumen, damit ein
  // erneutes replaceDemoPack keine wachsende Zahl verwaister Zeilen hinterlässt.
  if (previous.length) {
    const placeholders = previous.map(() => '?').join(', ')
    const ids = previous.map((family) => family.id)
    db.prepare(`DELETE FROM dog_transfers WHERE from_family_id IN (${placeholders}) OR to_family_id IN (${placeholders})`).run(...ids, ...ids)
  }

  for (const family of previous) removeUploads(uploadDir, deleteFamily(db, family.id))
  return { removed: previous, created, household, shelter, partnerIds }
}

module.exports = {
  FAMILY_NAME,
  HOUSEHOLD_NAME,
  SHELTER_NAME,
  createDemoPack,
  createDemoHousehold,
  createDemoShelter,
  createImageCopier,
  insertDemoPartners,
  replaceDemoPack
}
