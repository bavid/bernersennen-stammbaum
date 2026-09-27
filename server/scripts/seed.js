// Legt das Beispiel-Rudel samt Testbildern für die lokale Entwicklung an (beschreibbar).
//   npm run seed                      -> Passwort "sonnenhang"
//   npm run seed -- --password xyz123 -> eigenes Passwort
//   npm run seed -- --demo            -> als schreibgeschützte öffentliche Demo markieren
// Für die Demo auf dem Server: scripts/demo.js (ersetzt nur die bestehende Demo).
const bcrypt = require('bcryptjs')
const { uploadDir } = require('../config')
const db = require('../db')
const { FAMILY_NAME, createDemoPack, createImageCopier } = require('../lib/demoPack')

const DEFAULT_PASSWORD = 'sonnenhang'

function readPassword() {
  const flagIndex = process.argv.indexOf('--password')
  return (flagIndex > -1 && process.argv[flagIndex + 1]) || process.env.SEED_PASSWORD || DEFAULT_PASSWORD
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

try {
  const password = readPassword()
  const isDemo = process.argv.includes('--demo')
  assertSeedable(password)
  const result = createDemoPack(db, { password, isDemo, copyImage: createImageCopier(uploadDir) })
  console.log(`Rudel "${FAMILY_NAME}" angelegt: ${result.dogs} Tiere, ${result.entries} Chronik-Einträge.`)
  console.log(`Login-Passwort: ${password}`)
  if (isDemo) console.log('Als öffentliche Demo markiert (is_demo): schreibgeschützt, auch über /api/demo erreichbar.')
} catch (err) {
  console.error(`Seed fehlgeschlagen: ${err.message}`)
  process.exitCode = 1
} finally {
  db.close()
}
