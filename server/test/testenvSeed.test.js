const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const script = path.join(__dirname, '..', 'scripts', 'testenv-seed.js')

function run(env, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    // DB_PATH/UPLOAD_DIR leer: config.js gibt ihnen Vorrang vor DATA_DIR (||-Fallback) - eine Shell,
    // in der DB_PATH zufällig gesetzt ist, würde sonst die falsche DB zurücksetzen.
    // CODE_PEPPER mitgeben wie JWT_SECRET: config.js verlangt beides in Produktion (readCodePepper),
    // sonst würde dieser generische Start-Fehler testenv-seed's eigene "nie in Produktion"-Prüfung
    // (appEnv === 'production', siehe scripts/testenv-seed.js) nie erreichen.
    env: {
      ...process.env,
      JWT_SECRET: 'test-secret',
      CODE_PEPPER: 'test-code-pepper-'.repeat(2),
      NODE_ENV: 'development',
      DB_PATH: '',
      UPLOAD_DIR: '',
      ...env
    },
    encoding: 'utf8'
  })
}

function familiesIn(dir) {
  const Database = require('better-sqlite3')
  const db = new Database(path.join(dir, 'data.db'), { readonly: true })
  const rows = db.prepare('SELECT name, is_demo, theme FROM families ORDER BY name').all()
  db.close()
  return rows.map((row) => [row.name, row.is_demo, row.theme])
}

function membershipExists(dir, memberName, groupName) {
  const Database = require('better-sqlite3')
  const db = new Database(path.join(dir, 'data.db'), { readonly: true })
  const row = db
    .prepare(
      `SELECT 1 FROM family_members m
       JOIN families member ON member.id = m.member_family_id
       JOIN families grp ON grp.id = m.group_family_id
       WHERE member.name = ? AND grp.name = ?`
    )
    .get(memberName, groupName)
  db.close()
  return Boolean(row)
}

// Partner-Gutscheinstapel "Tierheim Sonnenhang" (Task 4, siehe scripts/testenv-seed.js): Anzahl der
// Codes im Stapel UND wie viele davon tatsächlich partner_id des aktuellen Demo-Partners tragen -
// getrennt, damit ein Test sichtbar machen kann, falls ein zweiter Lauf die Zuordnung verliert (siehe
// Kommentar in scripts/testenv-seed.js zu replaceDemoPack()).
function partnerBatchInfo(dir) {
  const Database = require('better-sqlite3')
  const db = new Database(path.join(dir, 'data.db'), { readonly: true })
  const partner = db.prepare("SELECT id FROM partners WHERE slug = 'tierheim-sonnenhang' AND is_demo = 1").get()
  const batch = db.prepare(`SELECT id, kind, partner_id, size FROM voucher_batches WHERE label = ?`).get('Partner-Stapel "Tierheim Sonnenhang"')
  const voucherCount = batch ? db.prepare('SELECT COUNT(*) AS n FROM vouchers WHERE batch_id = ?').get(batch.id).n : 0
  const linkedCount = batch
    ? db.prepare('SELECT COUNT(*) AS n FROM vouchers WHERE batch_id = ? AND partner_id = ?').get(batch.id, partner?.id ?? -1).n
    : 0
  db.close()
  return { partnerId: partner?.id ?? null, batch, voucherCount, linkedCount }
}

test('testenv-seed never runs in production', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-seedguard-'))
  const result = run({ DATA_DIR: dir, APP_ENV: 'production' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /nie in Produktion/)
  assert.equal(fs.existsSync(path.join(dir, 'data.db')), false)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('testenv-seed never runs in the real prod container (NODE_ENV=production, APP_ENV unset)', () => {
  // Der Docker-Container setzt nur NODE_ENV=production; APP_ENV kann fehlen oder leer sein.
  // readAppEnv fällt dann auf NODE_ENV zurück -> appEnv wird 'production'.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-seedguard-prodcontainer-'))
  const result = run({ DATA_DIR: dir, NODE_ENV: 'production', APP_ENV: '' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /nie in Produktion/)
  assert.equal(fs.existsSync(path.join(dir, 'data.db')), false)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('testenv-seed creates the public demo, a writable test pack and a writable test household; --reset starts over', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-testenv-'))
  const env = { DATA_DIR: dir, APP_ENV: 'dev' }

  const first = run(env)
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /Passwort: sonnenhang/)
  assert.match(first.stdout, /Passwort: deich/)
  // Phase T Task 6: replaceDemoPack() legt inzwischen auch das Demo-Tierheim an (is_demo=1, 'standard').
  assert.deepEqual(familiesIn(dir), [
    ['Familie Sonnenhang', 1, 'standard'],
    ['Rudel vom Sonnenhang (Test)', 0, 'berner'],
    ['Tierheim Sonnenhang', 1, 'standard'],
    ['Zuhause am Deich', 1, 'standard'],
    ['Zuhause am Deich (Test)', 0, 'standard']
  ])
  assert.ok(membershipExists(dir, 'Zuhause am Deich', 'Familie Sonnenhang'), 'Demo-Zuhause ist Mitglied im Demo-Rudel')
  assert.ok(
    membershipExists(dir, 'Zuhause am Deich (Test)', 'Rudel vom Sonnenhang (Test)'),
    'Test-Zuhause ist Mitglied im Test-Rudel'
  )

  // Partner-Gutscheinstapel "Tierheim Sonnenhang": Codes werden wie die übrigen Test-Codes nach den
  // Admin-Codes ausgegeben, kind='partner' und alle drei Codes tragen die Id des Demo-Partners.
  assert.match(first.stdout, /Admin-Stapel "Testumgebung" \(5 Codes\):[\s\S]*Partner-Stapel "Tierheim Sonnenhang" \(3 Codes\):/)
  const firstBatch = partnerBatchInfo(dir)
  assert.ok(firstBatch.partnerId, 'Demo-Partner "Tierheim Sonnenhang" existiert')
  assert.equal(firstBatch.batch?.kind, 'partner')
  assert.equal(firstBatch.batch?.partner_id, firstBatch.partnerId)
  assert.equal(firstBatch.voucherCount, 3)
  assert.equal(firstBatch.linkedCount, 3, 'alle drei Gutscheine tragen die Id des Demo-Partners')

  assert.equal(run(env).status, 0)
  assert.equal(familiesIn(dir).length, 5, 'second run replaces the demo trio (Rudel/Zuhause/Tierheim) and keeps both test packs')

  // Simuliert ein Rudel, das die Seed-Funktion nicht kennt (z. B. echte Nutzung auf der Vorschau).
  // Ohne so ein Rudel würde --reset nichts beweisen: die Familienzahl wäre mit oder ohne --reset
  // gleich, egal ob wirklich gelöscht wird.
  const Database = require('better-sqlite3')
  const db = new Database(path.join(dir, 'data.db'))
  db.prepare('INSERT INTO families (name, password_hash, is_demo) VALUES (?, ?, 0)').run('Familie Vorher', 'x')
  db.close()
  const names = () => familiesIn(dir).map((row) => row[0]).sort()
  assert.deepEqual(names(), [
    'Familie Sonnenhang',
    'Familie Vorher',
    'Rudel vom Sonnenhang (Test)',
    'Tierheim Sonnenhang',
    'Zuhause am Deich',
    'Zuhause am Deich (Test)'
  ])

  assert.equal(run(env).status, 0)
  assert.ok(names().includes('Familie Vorher'), 'a plain run without --reset must not delete other families')

  // Vor --reset: der zweite Lauf oben hat den Demo-Partner ersetzt (neue Id), der Partner-Stapel
  // bestand aber schon (Label-Check) - seine Codes tragen darum jetzt KEINE Partner-Id mehr (siehe
  // lib/demoPack.js replaceDemoPack(), das übrig gebliebene Verweise auf gelöschte Demo-Partner-Ids
  // nullt). Das ist die dokumentierte Grenze dieses "besteht schon"-Verhaltens (siehe Kommentar in
  // scripts/testenv-seed.js) - erst --reset räumt den Stapel weg und lässt ihn neu, korrekt verknüpft entstehen.
  const beforeReset = partnerBatchInfo(dir)
  assert.equal(beforeReset.voucherCount, 3, 'der Stapel selbst bleibt über den zweiten Lauf hinweg bestehen')
  assert.equal(beforeReset.linkedCount, 0, 'seine Codes zeigen nach dem Partner-Wechsel auf keine Partner-Id mehr')

  assert.equal(run(env, ['--reset']).status, 0)
  assert.deepEqual(
    names(),
    ['Familie Sonnenhang', 'Rudel vom Sonnenhang (Test)', 'Tierheim Sonnenhang', 'Zuhause am Deich', 'Zuhause am Deich (Test)'],
    '--reset must delete families the seed did not create'
  )

  // --reset räumt vorher ALLE Gutscheine/Stapel weg (deleteOrphanedVoucherBatches) - der Partner-Stapel
  // entsteht danach frisch, wieder korrekt mit dem (neuen) Demo-Partner verknüpft.
  const afterReset = partnerBatchInfo(dir)
  assert.equal(afterReset.voucherCount, 3)
  assert.equal(afterReset.linkedCount, 3, '--reset stellt die Partner-Zuordnung wieder her')

  fs.rmSync(dir, { recursive: true, force: true })
})

test('on the preview both test packs get random passwords', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-preview-'))
  const result = run({ DATA_DIR: dir, APP_ENV: 'staging' })
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /Passwort: sonnenhang/)
  assert.doesNotMatch(result.stdout, /Passwort: deich/)
  const passwords = [...result.stdout.matchAll(/Passwort: (\S+)/g)].map((m) => m[1])
  assert.equal(passwords.length, 2)
  for (const password of passwords) assert.ok(password.length >= 8, password)
  fs.rmSync(dir, { recursive: true, force: true })
})
