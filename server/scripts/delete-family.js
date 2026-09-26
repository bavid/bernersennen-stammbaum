// Löscht ein Rudel samt Hunden, Einträgen und nicht mehr genutzten Fotos.
//   npm run family:delete -- "Rudel vom Sonnenhang" --yes
const { uploadDir } = require('../config')
const db = require('../db')
const { deleteFamily, removeUploads } = require('../lib/families')

const name = process.argv.slice(2).find((arg) => !arg.startsWith('--'))
const confirmed = process.argv.includes('--yes')

try {
  const families = db.prepare('SELECT id, name FROM families').all()
  const family = families.find((f) => f.name === name)
  if (!family) {
    throw new Error(`Rudel "${name ?? ''}" nicht gefunden. Vorhanden: ${families.map((f) => `"${f.name}"`).join(', ') || 'keine'}`)
  }
  const dogCount = db.prepare('SELECT COUNT(*) AS c FROM dogs WHERE family_id = ?').get(family.id).c
  if (!confirmed) {
    throw new Error(`Würde "${family.name}" mit ${dogCount} Hunden löschen. Bestätigen mit --yes`)
  }
  const orphanedPhotos = deleteFamily(db, family.id)
  removeUploads(uploadDir, orphanedPhotos)
  console.log(`"${family.name}" gelöscht: ${dogCount} Hunde, ${orphanedPhotos.length} Fotos entfernt.`)
} catch (err) {
  console.error(err.message)
  process.exitCode = 1
} finally {
  db.close()
}
