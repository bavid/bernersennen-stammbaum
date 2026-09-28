const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Database = require('better-sqlite3')

// scripts/demo.js legt die öffentliche Demo in einem eigenen Prozess an (wie ein echter `node scripts/demo.js`-Aufruf),
// damit die frische db.js-Instanz genau die Umgebung dieses Prozesses sieht.
test('scripts/demo.js legt die öffentliche Demo (Rudel + Zuhause) im neuen Standard-Auftritt an', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-demo-script-'))
  const serverDir = path.join(__dirname, '..')

  const output = execFileSync(process.execPath, ['scripts/demo.js'], {
    cwd: serverDir,
    env: { ...process.env, DATA_DIR: dir, JWT_SECRET: 'test-secret' }
  }).toString()

  assert.match(output, /Demo "Familie Sonnenhang" angelegt/)
  assert.match(output, /Zuhause "Zuhause am Deich" angelegt/)

  const db = new Database(path.join(dir, 'data.db'))
  const families = db.prepare('SELECT id, name, theme, is_demo, art FROM families WHERE is_demo = 1 ORDER BY art').all()
  assert.deepEqual(
    families.map(({ name, theme, is_demo: isDemo, art }) => ({ name, theme, isDemo, art })),
    [
      { name: 'Familie Sonnenhang', theme: 'standard', isDemo: 1, art: 'rudel' },
      { name: 'Zuhause am Deich', theme: 'standard', isDemo: 1, art: 'zuhause' }
    ]
  )
  const membership = db
    .prepare('SELECT 1 FROM family_members WHERE member_family_id = ? AND group_family_id = ?')
    .get(families[1].id, families[0].id)
  assert.ok(membership, 'Zuhause ist Mitglied des Rudels')
  db.close()

  fs.rmSync(dir, { recursive: true, force: true })
})
