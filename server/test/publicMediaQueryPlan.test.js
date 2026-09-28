const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, cleanup } = require('./helpers')

// security-review Phase T Finding 11: die Foto-Suche in lib/publicMedia.js (canServePublicMedia,
// entryPhotoStmt) startet bewusst FROM dogs (nutzt den Teil-Index idx_dogs_public_slug, siehe db.js -
// deckt nur Zeilen mit public_slug IS NOT NULL ab) und hängt timeline_entries darüber an (über
// idx_timeline_dog(dog_id, datum)), statt zuerst alle timeline_entries zu scannen.
//
// Auf einer leeren Test-Datenbank ohne jede Statistik wählt SQLites Optimierer mangels Anhaltspunkten
// mitunter einen anderen (aber auf leeren Tabellen ebenso billigen) Plan - das sagt nichts über echte
// Datenmengen aus. Dieser Test sät deshalb eine realistische Größenordnung (viele Tierheime/Hunde/
// Einträge, nur ein einziges öffentlich vermittelbares Tier) und lässt ANALYZE laufen, damit der
// Optimierer dieselbe Kosteneinschätzung trifft wie in Produktion - und prüft dann den ECHTEN
// EXPLAIN QUERY PLAN auf Index-Nutzung statt eines vollen Scans über timeline_entries.
const dataDir = useTempDataDir('public-media-query-plan')
const db = require('../db')
const { ENTRY_PHOTO_SQL } = require('../lib/publicMedia')

test.after(() => cleanup(dataDir))

const SHELTERS = 60
const DOGS_PER_SHELTER = 5
const ENTRIES_PER_DOG = 5

function seed() {
  const insertPartner = db.prepare("INSERT INTO partners (slug, name, typ, status) VALUES (?, ?, 'tierheim', 'aktiv')")
  const insertFamily = db.prepare("INSERT INTO families (name, password_hash, art, partner_id) VALUES (?, '!', 'tierheim', ?)")
  const insertDog = db.prepare(
    "INSERT INTO dogs (family_id, name, geschlecht, tierart, vermittlung_status, public_slug) VALUES (?, 'Test', 'ruede', 'hund', ?, ?)"
  )
  const insertEntry = db.prepare(
    "INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, is_public, privat, foto_urls) VALUES (?, ?, 'x', '2026-01-01', 't', 1, 0, '[]')"
  )

  let publicDogPlanted = false
  for (let s = 0; s < SHELTERS; s += 1) {
    const partnerId = insertPartner.run(`plan-partner-${s}`, `Plan Partner ${s}`).lastInsertRowid
    const familyId = insertFamily.run(`Plan Fam ${s}`, partnerId).lastInsertRowid
    for (let d = 0; d < DOGS_PER_SHELTER; d += 1) {
      const makePublic = !publicDogPlanted && s === Math.floor(SHELTERS / 2) && d === 0
      if (makePublic) publicDogPlanted = true
      const dogId = insertDog.run(familyId, makePublic ? 'in_vermittlung' : null, makePublic ? 'the-plan-slug' : null).lastInsertRowid
      for (let e = 0; e < ENTRIES_PER_DOG; e += 1) insertEntry.run(dogId, familyId)
    }
  }
  db.exec('ANALYZE')
}

test('lib/publicMedia.js entryPhotoStmt: EXPLAIN QUERY PLAN nutzt Indizes statt eines vollen Scans über timeline_entries', () => {
  seed()

  // GENAU die Abfrage aus lib/publicMedia.js entryPhotoStmt (siehe dort für die volle Begründung) - aus
  // denselben Bausteinen gebaut (publishableSql/publicPartnerSql), keine nachgebaute Kopie.
  assert.match(ENTRY_PHOTO_SQL, /gesperrt = 0/, 'die geprüfte Abfrage enthält die Sperr-Prüfung (Phase P Task 1)')
  assert.match(ENTRY_PHOTO_SQL, /'pausiert'/, 'die geprüfte Abfrage enthält den Status pausiert (Phase P Task 1)')
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${ENTRY_PHOTO_SQL}`).all({ pattern: '%"/uploads/test.jpg"%' })

  const planText = plan.map((row) => row.detail).join('\n')

  assert.match(planText, /SEARCH d USING (COVERING )?INDEX idx_dogs_public_slug/, `dogs sollte über idx_dogs_public_slug angesteuert werden:\n${planText}`)
  assert.match(planText, /SEARCH t USING (COVERING )?INDEX idx_timeline_dog/, `timeline_entries sollte über idx_timeline_dog angesteuert werden, nicht gescannt:\n${planText}`)
  assert.doesNotMatch(planText, /SCAN t\b/, `kein voller Scan über timeline_entries erwartet:\n${planText}`)
})
