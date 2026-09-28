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

// Hochgeladene, aber nie an einem Hund/Eintrag/Wurf verwendete Fotos einer Familie (z. B. ein
// abgebrochener Upload) - die stehen nur in der uploads-Tabelle, photoUrlsOf sieht sie nicht.
function unusedUploadUrlsOf(db, familyId) {
  return db
    .prepare('SELECT filename FROM uploads WHERE family_id = ?')
    .all(familyId)
    .map((row) => `/uploads/${row.filename}`)
}

// Löscht ein Rudel komplett. Verweise aus anderen Rudeln auf seine Hunde werden zu Freitext,
// damit deren Stammbaum lesbar bleibt. Liefert die Foto-URLs, die danach niemand mehr nutzt.
function deleteFamily(db, familyId) {
  const photos = [...new Set([...photoUrlsOf(db, familyId), ...unusedUploadUrlsOf(db, familyId)])]

  db.transaction(() => {
    // Upload-Zuordnungen der Familie zuerst weg - sonst verletzt das Löschen der families-Zeile
    // unten die Fremdschlüsselprüfung (uploads.family_id REFERENCES families(id)).
    db.prepare('DELETE FROM uploads WHERE family_id = ?').run(familyId)
    // Geteilte Tiere zuerst aufräumen: sowohl Freigaben AUS diesem Bereich (F teilte an andere)
    // als auch Freigaben IN diesen Bereich (andere teilten an F, falls F ein Rudel war)
    db.prepare('DELETE FROM dog_shares WHERE family_id = ? OR dog_id IN (SELECT id FROM dogs WHERE family_id = ?)').run(
      familyId,
      familyId
    )
    const dogs = db.prepare('SELECT id, name, name_unbekannt, rasse FROM dogs WHERE family_id = ?').all(familyId)
    for (const dog of dogs) {
      const label = dogLabel(dog)
      db.prepare('UPDATE dogs SET mother_dog_id = NULL, mother_freitext = ? WHERE mother_dog_id = ? AND family_id != ?').run(label, dog.id, familyId)
      db.prepare('UPDATE dogs SET father_dog_id = NULL, father_freitext = ? WHERE father_dog_id = ? AND family_id != ?').run(label, dog.id, familyId)
      db.prepare('UPDATE breeding_events SET vater_dog_id = NULL, vater_freitext = ? WHERE vater_dog_id = ? AND family_id != ?').run(label, dog.id, familyId)
    }
    // Auch Kommentare fremder Familien auf eigenen Einträgen entfernen (sonst FK-Verletzung
    // beim gleich folgenden Löschen der Einträge, wenn eine geteilte Familie kommentiert hat)
    db.prepare('DELETE FROM entry_comments WHERE family_id = ? OR entry_id IN (SELECT id FROM timeline_entries WHERE family_id = ?)').run(
      familyId,
      familyId
    )
    db.prepare('DELETE FROM timeline_entries WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM dog_links WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM admin_messages WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM note_replies WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM notes WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM breeding_events WHERE family_id = ?').run(familyId)
    db.prepare('UPDATE dogs SET mother_dog_id = NULL, father_dog_id = NULL WHERE family_id = ?').run(familyId)
    db.prepare('DELETE FROM dogs WHERE family_id = ?').run(familyId)
    // Mitgliedschaften in beide Richtungen: als beigetretener Haushalt und als Rudel mit Mitgliedern
    db.prepare('DELETE FROM family_members WHERE member_family_id = ? OR group_family_id = ?').run(familyId, familyId)
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
