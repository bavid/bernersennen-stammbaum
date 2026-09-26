// Legt das Demo-Rudel samt Testbildern an.
//   npm run seed                      -> Passwort "sonnenhang"
//   npm run seed -- --password xyz123 -> eigenes Passwort
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const bcrypt = require('bcryptjs')
const { uploadDir } = require('../config')
const db = require('../db')
const { FAMILY_NAME, DOGS, TIMELINE, BREEDING, NOTES } = require('../seed/demo-data')

const IMAGE_DIR = path.join(__dirname, '..', 'seed', 'images')
const DEFAULT_PASSWORD = 'sonnenhang'

function readPassword() {
  const flagIndex = process.argv.indexOf('--password')
  return (flagIndex > -1 && process.argv[flagIndex + 1]) || process.env.SEED_PASSWORD || DEFAULT_PASSWORD
}

function createImageCopier() {
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

function assertSeedable(password) {
  if (db.prepare('SELECT 1 FROM families WHERE name = ?').get(FAMILY_NAME)) {
    throw new Error(`"${FAMILY_NAME}" existiert schon. Erst "npm run db:reset -- --yes" ausführen.`)
  }
  const hashes = db.prepare('SELECT password_hash FROM families').all()
  if (hashes.some((row) => bcrypt.compareSync(password, row.password_hash))) {
    throw new Error('Dieses Passwort nutzt schon ein anderes Rudel. Bitte --password angeben.')
  }
}

const seed = db.transaction((password, copyImage) => {
  const familyId = db
    .prepare('INSERT INTO families (name, password_hash) VALUES (?, ?)')
    .run(FAMILY_NAME, bcrypt.hashSync(password, 10)).lastInsertRowid

  const insertDog = db.prepare(
    `INSERT INTO dogs (family_id, name, rasse, geschlecht, geburtsdatum, farbe_markings, mother_dog_id, father_dog_id,
       mother_freitext, father_freitext, foto_url, beschreibung)
     VALUES (@familyId, @name, @rasse, @geschlecht, @geburtsdatum, @farbe, @motherId, @fatherId,
       @motherFreitext, @fatherFreitext, @fotoUrl, @beschreibung)`
  )
  const ids = {}
  for (const dog of DOGS) {
    ids[dog.key] = insertDog.run({
      familyId,
      name: dog.name,
      rasse: dog.rasse || 'Berner Sennenhund',
      geschlecht: dog.geschlecht,
      geburtsdatum: dog.geburtsdatum,
      farbe: dog.farbe,
      motherId: dog.mother ? ids[dog.mother] : null,
      fatherId: dog.father ? ids[dog.father] : null,
      motherFreitext: dog.motherFreitext || null,
      fatherFreitext: dog.fatherFreitext || null,
      fotoUrl: copyImage(dog.foto),
      beschreibung: dog.beschreibung
    }).lastInsertRowid
  }

  const insertEntry = db.prepare(
    `INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text, foto_urls)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  for (const entry of TIMELINE) {
    const fotos = (entry.fotos || []).map(copyImage)
    insertEntry.run(ids[entry.dog], familyId, entry.autor, entry.datum, entry.titel, entry.text || null, JSON.stringify(fotos))
  }

  const insertNote = db.prepare(
    `INSERT INTO notes (family_id, autor_name, text, termin_datum, termin_zeit, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now', ?))`
  )
  for (const note of NOTES) {
    insertNote.run(familyId, note.autor, note.text, note.terminDatum || null, note.terminZeit || null, `-${note.hoursAgo} hours`)
  }

  const insertBreeding = db.prepare(
    `INSERT INTO breeding_events (family_id, mutter_dog_id, vater_dog_id, vater_freitext, datum, wurf_info, foto_urls)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  for (const event of BREEDING) {
    const fotos = (event.fotos || []).map(copyImage)
    insertBreeding.run(
      familyId,
      ids[event.mutter],
      event.vater ? ids[event.vater] : null,
      event.vaterFreitext || null,
      event.datum,
      event.wurfInfo,
      JSON.stringify(fotos)
    )
  }
})

try {
  const password = readPassword()
  assertSeedable(password)
  seed(password, createImageCopier())
  console.log(`Demo-Rudel "${FAMILY_NAME}" angelegt: ${DOGS.length} Hunde, ${TIMELINE.length} Timeline-Einträge.`)
  console.log(`Login-Passwort: ${password}`)
} catch (err) {
  console.error(`Seed fehlgeschlagen: ${err.message}`)
  process.exitCode = 1
} finally {
  db.close()
}
