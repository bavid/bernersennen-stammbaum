// Füllt die lokale Testumgebung bzw. die Vorschau (Port 3005) mit Beispieldaten. Läuft nie in Produktion.
//   node scripts/testenv-seed.js          -> öffentliche Demo neu, Test-Rudel anlegen (falls es fehlt)
//   node scripts/testenv-seed.js --reset  -> vorher ALLE Rudel dieser Umgebung löschen
const crypto = require('node:crypto')
const { appEnv, uploadDir } = require('../config')

if (appEnv === 'production') {
  console.error('testenv-seed läuft nur in der Testumgebung oder Vorschau (APP_ENV=dev|staging), nie in Produktion.')
  process.exit(1)
}

const db = require('../db')
const { deleteFamily, removeUploads } = require('../lib/families')
const { createDemoPack, createImageCopier, replaceDemoPack } = require('../lib/demoPack')

const TEST_PACK_NAME = 'Rudel vom Sonnenhang (Test)'
// Lokal ein festes Passwort (E2E-Skripte), auf der öffentlich erreichbaren Vorschau ein zufälliges
const testPassword = appEnv === 'dev' ? 'sonnenhang' : crypto.randomBytes(9).toString('base64url')

function deleteAllFamilies() {
  for (const family of db.prepare('SELECT id FROM families').all()) {
    removeUploads(uploadDir, deleteFamily(db, family.id))
  }
}

try {
  if (process.argv.includes('--reset')) deleteAllFamilies()
  // Die öffentliche Demo der Vorschau zeigt den neuen Auftritt; das Test-Rudel bleibt beim Berner-Look
  replaceDemoPack(db, uploadDir, { theme: 'standard', name: 'Familie Sonnenhang' })
  if (!db.prepare('SELECT 1 FROM families WHERE name = ?').get(TEST_PACK_NAME)) {
    createDemoPack(db, { name: TEST_PACK_NAME, password: testPassword, isDemo: false, copyImage: createImageCopier(uploadDir) })
    console.log(`Test-Rudel "${TEST_PACK_NAME}" – Passwort: ${testPassword}`)
  } else {
    console.log(`Test-Rudel "${TEST_PACK_NAME}" besteht schon (Passwort unverändert)`)
  }
  console.log(`Umgebung: ${appEnv} – öffentliche Demo über „Demo ansehen" auf der Login-Seite`)
} catch (err) {
  console.error(`testenv-seed fehlgeschlagen: ${err.message}`)
  process.exitCode = 1
} finally {
  db.close()
}
