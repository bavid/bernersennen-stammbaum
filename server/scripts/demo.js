// Öffentliche Demo (neu) anlegen: ersetzt nur das Rudel mit is_demo = 1, echte Rudel bleiben unberührt.
//   node scripts/demo.js
const { uploadDir } = require('../config')
const db = require('../db')
const { FAMILY_NAME, replaceDemoPack } = require('../lib/demoPack')

try {
  const { removed, created } = replaceDemoPack(db, uploadDir)
  for (const family of removed) console.log(`Alte Demo entfernt: "${family.name}"`)
  console.log(`Demo "${FAMILY_NAME}" angelegt: ${created.dogs} Tiere, ${created.entries} Chronik-Einträge (schreibgeschützt).`)
} catch (err) {
  console.error(`Demo fehlgeschlagen: ${err.message}`)
  process.exitCode = 1
} finally {
  db.close()
}
