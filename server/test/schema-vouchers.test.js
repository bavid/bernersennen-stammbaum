const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Database = require('better-sqlite3')
const { useTempDataDir, cleanup } = require('./helpers')

const dataDir = useTempDataDir('schema-vouchers')
const db = require('../db')

test.after(() => cleanup(dataDir))

function columns(table) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((c) => c.name)
}

test('legt voucher_batches, vouchers und users an', () => {
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((r) => r.name)
  assert.ok(tables.includes('voucher_batches'))
  assert.ok(tables.includes('vouchers'))
  assert.ok(tables.includes('users'))
})

test('voucher_batches hat die erwarteten Spalten', () => {
  const cols = columns('voucher_batches')
  for (const name of ['id', 'label', 'kind', 'partner_id', 'size', 'created_at']) {
    assert.ok(cols.includes(name), `voucher_batches.${name} fehlt`)
  }
})

test('vouchers hat die erwarteten Spalten', () => {
  const cols = columns('vouchers')
  for (const name of [
    'id', 'batch_id', 'code_hash', 'code_cipher', 'code_hint', 'partner_id',
    'issued_by_family_id', 'join_family_id', 'redeemed_by_family_id',
    'redeemed_at', 'expires_at', 'revoked_at', 'created_at'
  ]) {
    assert.ok(cols.includes(name), `vouchers.${name} fehlt`)
  }
})

test('users hat die erwarteten Spalten', () => {
  const cols = columns('users')
  for (const name of ['id', 'family_id', 'username', 'password_hash', 'email', 'session_epoch', 'last_login_at', 'created_at']) {
    assert.ok(cols.includes(name), `users.${name} fehlt`)
  }
})

test('families bekommt access_key_hash, legacy_password, auth_epoch, voucher_id', () => {
  const cols = columns('families')
  for (const name of ['access_key_hash', 'legacy_password', 'auth_epoch', 'voucher_id']) {
    assert.ok(cols.includes(name), `families.${name} fehlt`)
  }
})

test('code_hash in vouchers ist eindeutig', () => {
  db.prepare("INSERT INTO voucher_batches (label, kind, size) VALUES ('Testumgebung', 'admin', 2)").run()
  const batchId = db.prepare('SELECT last_insert_rowid() AS id').get().id
  const insertVoucher = db.prepare(
    "INSERT INTO vouchers (batch_id, code_hash, code_hint) VALUES (?, ?, 'QRST')"
  )
  insertVoucher.run(batchId, 'hash-emma')
  assert.throws(() => insertVoucher.run(batchId, 'hash-emma'), /UNIQUE/)
})

test('access_key_hash ist eindeutig, aber mehrere NULL sind erlaubt', () => {
  const insert = db.prepare('INSERT INTO families (name, password_hash, access_key_hash) VALUES (?, ?, ?)')
  insert.run('Zuhause am Deich', '!', null)
  insert.run('Familie Sonnenhang', '!', null) // zwei NULLs müssen nebeneinander bestehen können

  insert.run('Familie Emma', '!', 'access-hash-emma')
  assert.throws(() => insert.run('Familie Luna', '!', 'access-hash-emma'), /UNIQUE/)
})

test('Bestandsfamilien haben nach der Migration legacy_password=1 und auth_epoch=0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-vouchers-migration-'))
  const dbFile = path.join(dir, 'old.db')

  // Datenbank im alten Schema anlegen (families ohne die neuen Gutschein-Spalten)
  const seedDb = new Database(dbFile)
  seedDb.exec(`
    CREATE TABLE families (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)
  seedDb.prepare('INSERT INTO families (name, password_hash) VALUES (?, ?)').run('Familie Alt', 'hash')
  seedDb.close()

  // db.js in einem eigenen Prozess laden, damit die Migration auf der alten Datei läuft
  execFileSync(process.execPath, ['-e', "require('./db')"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATA_DIR: dir, DB_PATH: dbFile, JWT_SECRET: 'test-secret' }
  })

  const checkDb = new Database(dbFile)
  const row = checkDb
    .prepare('SELECT legacy_password, auth_epoch, access_key_hash, voucher_id FROM families WHERE name = ?')
    .get('Familie Alt')
  assert.equal(row.legacy_password, 1)
  assert.equal(row.auth_epoch, 0)
  assert.equal(row.access_key_hash, null)
  assert.equal(row.voucher_id, null)

  checkDb.close()
  fs.rmSync(dir, { recursive: true, force: true })
})
