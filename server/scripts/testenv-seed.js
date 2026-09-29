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
const { createDemoPack, createDemoHousehold, createImageCopier, replaceDemoPack } = require('../lib/demoPack')
const { createBatch } = require('../lib/vouchers')
const { partnerAccessBatchOptions } = require('../lib/partnerAccess')
const { formatCode } = require('../lib/codes')

const TEST_PACK_NAME = 'Rudel vom Sonnenhang (Test)'
const TEST_HOUSEHOLD_NAME = 'Zuhause am Deich (Test)'
const ADMIN_BATCH_LABEL = 'Testumgebung'
const INVITE_BATCH_LABEL = 'Einladung Rudel vom Sonnenhang (Test)'
const PARTNER_BATCH_LABEL = 'Partner-Stapel "Tierheim Sonnenhang"'
const ACCESS_BATCH_LABEL = 'Partner-Zugang (Test)'
const ADMIN_BATCH_SIZE = 5
const PARTNER_BATCH_SIZE = 3
const ACCESS_BATCH_SIZE = 3
// Lokal ein festes Passwort (E2E-Skripte), auf der öffentlich erreichbaren Vorschau ein zufälliges
const testPassword = appEnv === 'dev' ? 'sonnenhang' : crypto.randomBytes(9).toString('base64url')
const testHouseholdPassword = appEnv === 'dev' ? 'deich' : crypto.randomBytes(9).toString('base64url')

function deleteAllFamilies() {
  for (const family of db.prepare('SELECT id FROM families').all()) {
    removeUploads(uploadDir, deleteFamily(db, family.id))
  }
}

// Nach --reset sind alle Familien weg - jeder übrig gebliebene Gutschein-Stapel ist dann verwaist:
// Admin-Stapel referenzieren nie eine Familie (issued_by_family_id ist NULL) und bleiben von
// deleteAllFamilies() völlig unberührt; ein Stapel wie der Einladungs-Gutschein des Test-Rudels
// verliert nur seine vouchers-Zeile (deleteFamily löscht die, aber nicht den Stapel selbst) und würde
// sonst als leerer Rest liegen bleiben - der "besteht schon"-Check weiter unten fände ihn dann
// fälschlich und würde keinen neuen Gutschein mehr anlegen. Darum werden beide Tabellen komplett
// geleert, bevor unten alles frisch entsteht.
function deleteOrphanedVoucherBatches() {
  db.exec('DELETE FROM vouchers; DELETE FROM voucher_batches')
}

try {
  if (process.argv.includes('--reset')) {
    deleteAllFamilies()
    deleteOrphanedVoucherBatches()
  }
  // Die öffentliche Demo der Vorschau zeigt den neuen Auftritt; das Test-Rudel bleibt beim Berner-Look
  replaceDemoPack(db, uploadDir, { theme: 'standard', name: 'Familie Sonnenhang' })

  let testFamily = db.prepare('SELECT id FROM families WHERE name = ?').get(TEST_PACK_NAME)
  if (!testFamily) {
    const created = createDemoPack(db, { name: TEST_PACK_NAME, password: testPassword, isDemo: false, copyImage: createImageCopier(uploadDir) })
    testFamily = { id: created.familyId }
    console.log(`Test-Rudel "${TEST_PACK_NAME}" – Passwort: ${testPassword}`)
  } else {
    console.log(`Test-Rudel "${TEST_PACK_NAME}" besteht schon (Passwort unverändert)`)
  }

  // Beschreibbares Test-Zuhause, Mitglied im Test-Rudel: zum lokalen Testen von Teilen/privaten
  // Einträgen mit Schreibzugriff (die öffentliche Demo ist schreibgeschützt).
  if (!db.prepare('SELECT 1 FROM families WHERE name = ?').get(TEST_HOUSEHOLD_NAME)) {
    createDemoHousehold(db, {
      name: TEST_HOUSEHOLD_NAME,
      password: testHouseholdPassword,
      isDemo: false,
      copyImage: createImageCopier(uploadDir),
      groupFamilyId: testFamily.id
    })
    console.log(`Test-Zuhause "${TEST_HOUSEHOLD_NAME}" – Passwort: ${testHouseholdPassword}`)
  } else {
    console.log(`Test-Zuhause "${TEST_HOUSEHOLD_NAME}" besteht schon (Passwort unverändert)`)
  }

  // Admin-Stapel zum Ausprobieren von "Gutscheine weitergeben" bzw. der Admin-Übersicht - Klartext
  // NUR hier in der Konsole (Codes landen sonst nie in Logs, siehe lib/codes.js).
  if (!db.prepare('SELECT 1 FROM voucher_batches WHERE label = ?').get(ADMIN_BATCH_LABEL)) {
    const { codes } = createBatch(db, { label: ADMIN_BATCH_LABEL, kind: 'admin', size: ADMIN_BATCH_SIZE })
    console.log(`Admin-Stapel "${ADMIN_BATCH_LABEL}" (${ADMIN_BATCH_SIZE} Codes):\n${codes.map(formatCode).join('\n')}`)
  } else {
    console.log(`Admin-Stapel "${ADMIN_BATCH_LABEL}" besteht schon`)
  }

  // Partner-Gutscheinstapel für den Demo-Partner "Tierheim Sonnenhang" (siehe lib/demoPack.js,
  // seed/demo-partners.js) - zum Ausprobieren, wie ein Partner-Portal einen eigenen Gutschein einlöst
  // (families.partner_id landet dann auf "kam über Partner X", siehe lib/vouchers.js redeemVoucher).
  // Der "besteht schon"-Check hält den Stapel über mehrere Läufe stabil wie die übrigen Stapel oben -
  // da replaceDemoPack() den Demo-Partner bei jedem Lauf neu anlegt (neue Id, siehe dort), bleiben die
  // Codes eines schon bestehenden Stapels ab dem zweiten Lauf ohne Partner-Zuordnung (partner_id wird
  // von replaceDemoPack() genullt, siehe dort) - `--reset` räumt vorher alle Gutscheine weg, danach
  // entsteht der Stapel wieder frisch mit dem aktuellen Demo-Partner.
  if (!db.prepare('SELECT 1 FROM voucher_batches WHERE label = ?').get(PARTNER_BATCH_LABEL)) {
    const partner = db.prepare("SELECT id FROM partners WHERE slug = 'tierheim-sonnenhang' AND is_demo = 1").get()
    if (!partner) throw new Error('Demo-Partner "Tierheim Sonnenhang" fehlt - replaceDemoPack() lief nicht wie erwartet')
    const { codes } = createBatch(db, { label: PARTNER_BATCH_LABEL, kind: 'partner', size: PARTNER_BATCH_SIZE, partnerId: partner.id })
    console.log(`${PARTNER_BATCH_LABEL} (${PARTNER_BATCH_SIZE} Codes):\n${codes.map(formatCode).join('\n')}`)
  } else {
    console.log(`${PARTNER_BATCH_LABEL} besteht schon`)
  }

  // Partner-Zugang-Stapel (Phase P1 Task 4): Admin-Stapel mit zweck 'partnerzugang', an keinen Partner
  // gebunden - zum Ausprobieren, wie ein neuer Partner unter /v#CODE sein Profil und seinen Bereich selbst
  // einrichtet (lib/partnerAccess.js). Dieselben Stapel-Optionen wie POST /api/admin/voucher-batches.
  if (!db.prepare('SELECT 1 FROM voucher_batches WHERE label = ?').get(ACCESS_BATCH_LABEL)) {
    const options = partnerAccessBatchOptions(db, { size: ACCESS_BATCH_SIZE })
    const { codes } = createBatch(db, { label: ACCESS_BATCH_LABEL, size: ACCESS_BATCH_SIZE, ...options })
    console.log(`Partner-Zugang-Stapel "${ACCESS_BATCH_LABEL}" (${ACCESS_BATCH_SIZE} Codes):\n${codes.map(formatCode).join('\n')}`)
  } else {
    console.log(`Partner-Zugang-Stapel "${ACCESS_BATCH_LABEL}" besteht schon`)
  }

  // Ein Einladungs-Gutschein des Test-Rudels: löst man ihn ein, entsteht ein Zuhause, das gleich
  // Mitglied im Test-Rudel ist - zum Ausprobieren von "Gutschein einlösen -> Mitglied" per Hand.
  if (!db.prepare('SELECT 1 FROM voucher_batches WHERE label = ?').get(INVITE_BATCH_LABEL)) {
    const { codes } = createBatch(db, {
      label: INVITE_BATCH_LABEL,
      kind: 'rudel',
      size: 1,
      issuedByFamilyId: testFamily.id,
      joinFamilyId: testFamily.id
    })
    console.log(`Einladungs-Gutschein für "${TEST_PACK_NAME}": ${formatCode(codes[0])}`)
  } else {
    console.log(`Einladungs-Gutschein für "${TEST_PACK_NAME}" besteht schon`)
  }

  console.log(`Umgebung: ${appEnv} – öffentliche Demo über „Demo ansehen" auf der Login-Seite`)
} catch (err) {
  console.error(`testenv-seed fehlgeschlagen: ${err.message}`)
  process.exitCode = 1
} finally {
  db.close()
}
