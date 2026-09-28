// Öffentliche Demo (neu) anlegen: ersetzt nur das Rudel mit is_demo = 1, echte Rudel bleiben unberührt.
// Auftritt und Name wie in der Vorschau/Tests (theme.test.js): standard-Look mit tierneutralem
// Namen, weil die Login-Seite immer im neuen Standard-Auftritt startet – Demo-Besucher sollen
// genau dort landen, nicht im alten Berner-Look.
//   node scripts/demo.js
const { uploadDir } = require('../config')
const db = require('../db')
const { replaceDemoPack } = require('../lib/demoPack')

const DEMO_NAME = 'Familie Sonnenhang'

try {
  const { removed, created, household } = replaceDemoPack(db, uploadDir, { theme: 'standard', name: DEMO_NAME })
  for (const family of removed) console.log(`Alte Demo entfernt: "${family.name}"`)
  console.log(`Demo "${DEMO_NAME}" angelegt: ${created.dogs} Tiere, ${created.entries} Chronik-Einträge (schreibgeschützt).`)
  console.log(`Zuhause "Zuhause am Deich" angelegt: ${household.dogs} Tiere, ${household.entries} Chronik-Einträge (schreibgeschützt, Mitglied im Rudel).`)
} catch (err) {
  console.error(`Demo fehlgeschlagen: ${err.message}`)
  process.exitCode = 1
} finally {
  db.close()
}
