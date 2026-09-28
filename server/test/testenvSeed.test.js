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
    env: { ...process.env, JWT_SECRET: 'test-secret', NODE_ENV: 'development', DB_PATH: '', UPLOAD_DIR: '', ...env },
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

test('testenv-seed creates the public demo and a writable test pack; --reset starts over', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-testenv-'))
  const env = { DATA_DIR: dir, APP_ENV: 'dev' }

  const first = run(env)
  assert.equal(first.status, 0, first.stderr)
  assert.match(first.stdout, /Passwort: sonnenhang/)
  assert.deepEqual(familiesIn(dir), [
    ['Rudel vom Sonnenhang', 1, 'standard'],
    ['Rudel vom Sonnenhang (Test)', 0, 'berner']
  ])

  assert.equal(run(env).status, 0)
  assert.equal(familiesIn(dir).length, 2, 'second run replaces the demo and keeps the test pack')

  // Simuliert ein Rudel, das die Seed-Funktion nicht kennt (z. B. echte Nutzung auf der Vorschau).
  // Ohne so ein Rudel würde --reset nichts beweisen: die Familienzahl wäre mit oder ohne --reset
  // gleich (2), egal ob wirklich gelöscht wird.
  const Database = require('better-sqlite3')
  const db = new Database(path.join(dir, 'data.db'))
  db.prepare('INSERT INTO families (name, password_hash, is_demo) VALUES (?, ?, 0)').run('Familie Vorher', 'x')
  db.close()
  const names = () => familiesIn(dir).map((row) => row[0]).sort()
  assert.deepEqual(names(), ['Familie Vorher', 'Rudel vom Sonnenhang', 'Rudel vom Sonnenhang (Test)'])

  assert.equal(run(env).status, 0)
  assert.ok(names().includes('Familie Vorher'), 'a plain run without --reset must not delete other families')

  assert.equal(run(env, ['--reset']).status, 0)
  assert.deepEqual(names(), ['Rudel vom Sonnenhang', 'Rudel vom Sonnenhang (Test)'], '--reset must delete families the seed did not create')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('on the preview the test pack gets a random password', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-preview-'))
  const result = run({ DATA_DIR: dir, APP_ENV: 'staging' })
  assert.equal(result.status, 0, result.stderr)
  assert.doesNotMatch(result.stdout, /Passwort: sonnenhang/)
  assert.match(result.stdout, /Passwort: \S{8,}/)
  fs.rmSync(dir, { recursive: true, force: true })
})
