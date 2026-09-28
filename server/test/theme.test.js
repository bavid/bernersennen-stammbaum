const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Database = require('better-sqlite3')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const dataDir = useTempDataDir('theme')

test('Familien haben einen Auftritt (theme: standard|berner)', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')

  await t.test('eine neue Familie startet überall mit standard', async () => {
    const created = await createFamily(base, 'Familie Test', 'geheimnis1')
    assert.equal(created.status, 201)
    assert.equal(created.data.theme, 'standard')

    const me = await call(base, '/api/me', { cookie: created.cookie })
    assert.equal(me.data.theme, 'standard')

    const login = await call(base, '/api/login', { method: 'POST', body: { password: 'geheimnis1' } })
    assert.equal(login.data.theme, 'standard')
  })

  await t.test('PUT /api/family kann das Aussehen ändern', async () => {
    const family = await createFamily(base, 'Familie Theme', 'geheimnis2')
    const putFamily = (cookie, body) => call(base, '/api/family', { method: 'PUT', cookie, body })

    const res = await putFamily(family.cookie, { theme: 'berner' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, { id: family.data.id, name: 'Familie Theme', theme: 'berner' })

    const me = await call(base, '/api/me', { cookie: family.cookie })
    assert.equal(me.data.theme, 'berner')

    assert.equal((await putFamily(family.cookie, { theme: 'pink' })).status, 400)
    assert.equal((await putFamily(family.cookie, {})).status, 400)

    const renamed = await putFamily(family.cookie, { name: 'Neuer Name' })
    assert.equal(renamed.status, 200)
    assert.equal(renamed.data.name, 'Neuer Name')
    assert.equal(renamed.data.theme, 'berner')
  })

  await t.test('Demo-Login meldet den Auftritt, PUT bleibt gesperrt', async () => {
    const family = await createFamily(base, 'Familie Demo', 'geheimnis3')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(family.data.id)

    const demoLogin = await call(base, '/api/demo', { method: 'POST' })
    assert.equal(demoLogin.status, 200)
    assert.equal(demoLogin.data.theme, 'standard')

    const demoCookie = getCookie(demoLogin.res)
    const put = await call(base, '/api/family', { method: 'PUT', cookie: demoCookie, body: { theme: 'berner' } })
    assert.equal(put.status, 403)
  })

  await t.test('demoPack-Helfer: Standard ist berner, ein Auftritt kann aber übergeben werden', () => {
    const { createDemoPack, createImageCopier, replaceDemoPack } = require('../lib/demoPack')

    const defaultPack = createDemoPack(db, {
      password: 'pw-default-1', isDemo: false, copyImage: createImageCopier(uploadDir), name: 'Rudel Default Theme'
    })
    assert.equal(db.prepare('SELECT theme FROM families WHERE id = ?').get(defaultPack.familyId).theme, 'berner')

    const standardPack = createDemoPack(db, {
      password: 'pw-standard-1', isDemo: false, copyImage: createImageCopier(uploadDir), name: 'Rudel Standard Theme', theme: 'standard'
    })
    assert.equal(db.prepare('SELECT theme FROM families WHERE id = ?').get(standardPack.familyId).theme, 'standard')

    const replaced = replaceDemoPack(db, uploadDir, { theme: 'standard' })
    assert.equal(db.prepare('SELECT theme FROM families WHERE id = ?').get(replaced.created.familyId).theme, 'standard')
  })
})

test('Migration: bestehende Rudel behalten berner, neue Zeilen bekommen standard', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-theme-migration-'))
  const dbFile = path.join(dir, 'old.db')

  // Datenbank im alten Schema anlegen (families ohne theme-Spalte), mit einem Bestandsrudel
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
  assert.equal(checkDb.prepare('SELECT theme FROM families WHERE name = ?').get('Familie Alt').theme, 'berner')

  checkDb.prepare('INSERT INTO families (name, password_hash) VALUES (?, ?)').run('Familie Neu', 'hash2')
  assert.equal(checkDb.prepare('SELECT theme FROM families WHERE name = ?').get('Familie Neu').theme, 'standard')

  checkDb.close()
  fs.rmSync(dir, { recursive: true, force: true })
})
