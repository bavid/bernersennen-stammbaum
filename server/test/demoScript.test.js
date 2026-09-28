const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Database = require('better-sqlite3')

// scripts/demo.js legt die öffentliche Demo in einem eigenen Prozess an (wie ein echter `node scripts/demo.js`-Aufruf),
// damit die frische db.js-Instanz genau die Umgebung dieses Prozesses sieht.
test('scripts/demo.js legt die öffentliche Demo im neuen Standard-Auftritt an', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-demo-script-'))
  const serverDir = path.join(__dirname, '..')

  const output = execFileSync(process.execPath, ['scripts/demo.js'], {
    cwd: serverDir,
    env: { ...process.env, DATA_DIR: dir, JWT_SECRET: 'test-secret' }
  }).toString()

  assert.match(output, /Demo "Familie Sonnenhang" angelegt/)

  const db = new Database(path.join(dir, 'data.db'))
  const family = db.prepare('SELECT name, theme, is_demo FROM families WHERE is_demo = 1').get()
  assert.deepEqual(family, { name: 'Familie Sonnenhang', theme: 'standard', is_demo: 1 })
  db.close()

  fs.rmSync(dir, { recursive: true, force: true })
})
