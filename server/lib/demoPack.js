// Legt das Demo-Rudel aus seed/demo-data.js an – für die öffentliche Demo und die lokale Entwicklung.
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const bcrypt = require('bcryptjs')
const { deleteFamily, removeUploads } = require('./families')
const { FAMILY_NAME, DOGS, HOUSEMATES, TIMELINE, BREEDING, NOTES } = require('../seed/demo-data')

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

// Ersetzt die öffentliche Demo: legt zuerst die neue an und löscht erst danach die alte(n) – nur Rudel
// mit is_demo = 1, samt Fotos. Scheitert das Anlegen, bleibt die alte Demo erreichbar.
// Das Passwort ist zufällig – in die Demo kommt man über "Demo ansehen".
function replaceDemoPack(db, uploadDir, { theme } = {}) {
  const previous = db.prepare('SELECT id, name FROM families WHERE is_demo = 1').all()
  const password = crypto.randomBytes(24).toString('base64url')
  const packOptions = { password, isDemo: true, copyImage: createImageCopier(uploadDir) }
  if (theme !== undefined) packOptions.theme = theme
  const created = createDemoPack(db, packOptions)
  for (const family of previous) removeUploads(uploadDir, deleteFamily(db, family.id))
  return { removed: previous, created }
}

module.exports = { FAMILY_NAME, createDemoPack, createImageCopier, replaceDemoPack }
