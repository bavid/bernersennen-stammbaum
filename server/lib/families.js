const fs = require('node:fs')
const path = require('node:path')
const { dogLabel } = require('./labels')

function photoUrlsOf(db, familyId) {
  const dogPhotos = db.prepare('SELECT foto_url FROM dogs WHERE family_id = ? AND foto_url IS NOT NULL').all(familyId)
  const entryPhotos = db.prepare('SELECT foto_urls FROM timeline_entries WHERE family_id = ?').all(familyId)
  const breedingPhotos = db.prepare('SELECT foto_urls FROM breeding_events WHERE family_id = ?').all(familyId)
  return [
    ...dogPhotos.map((row) => row.foto_url),
    ...[...entryPhotos, ...breedingPhotos].flatMap((row) => JSON.parse(row.foto_urls))
  ]
}

// Löscht ein Rudel komplett. Verweise aus anderen Rudeln auf seine Hunde werden zu Freitext,
// damit deren Stammbaum lesbar bleibt. Liefert die Foto-URLs, die danach niemand mehr nutzt.
function deleteFamily(db, familyId) {
  const photos = photoUrlsOf(db, familyId)

  db.transaction(() => {
    const dogs = db.prepare('SELECT id, name, name_unbekannt, rasse FROM dogs WHERE family_id = ?').all(familyId)
    for (const dog of dogs) {
      const label = dogLabel(dog)
      db.prepare('UPDATE dogs SET mother_dog_id = NULL, mother_freitext = ? WHERE mother_dog_id = ? AND family_id != ?').run(label, dog.id, familyId)
      db.prepare('UPDATE dogs SET father_dog_id = NULL, father_freitext = ? WHERE father_dog_id = ? AND family_id != ?').run(label, dog.id, familyId)
      db.prepare('UPDATE breeding_events SET vater_dog_id = NULL, vater_freitext = ? WHERE vater_dog_id = ? AND family_id != ?').run(label, dog.id, familyId)
    }
    db.prepare('DELETE FROM timeline_entries WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM admin_messages WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM note_replies WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM notes WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM breeding_events WHERE family_id = ?').run(familyId)
    db.prepare('UPDATE dogs SET mother_dog_id = NULL, father_dog_id = NULL WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM dogs WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM families WHERE id = ?').run(familyId)
  })()

  const stillUsed = new Set(
    db.prepare('SELECT id FROM families').all().flatMap((family) => photoUrlsOf(db, family.id))
  )
  return [...new Set(photos)].filter((url) => !stillUsed.has(url))
}

function removeUploads(uploadDir, urls) {
  for (const url of urls) {
    fs.rmSync(path.join(uploadDir, path.basename(url)), { force: true })
  }
}

module.exports = { deleteFamily, removeUploads }
