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
  assert.match(output, /Tierheim "Tierheim Sonnenhang" angelegt/)
  assert.match(output, /Partner-Bereich "hundeschule-pfotenglueck" angelegt: 4 Einblicke/)
  assert.match(output, /Partner-Bereich "hundesalon-wuschelglueck" angelegt: 5 Einblicke/)

  const db = new Database(path.join(dir, 'data.db'))
  // Phase T Task 6: seit dem Demo-Tierheim drei Demo-Familien; Phase P1 Task 4: dazu zwei Demo-Partner-Bereiche
  // (ORDER BY art, name: partner, partner, rudel, tierheim, zuhause).
  const families = db.prepare('SELECT id, name, theme, is_demo, art FROM families WHERE is_demo = 1 ORDER BY art, name').all()
  assert.deepEqual(
    families.map(({ name, theme, is_demo: isDemo, art }) => ({ name, theme, isDemo, art })),
    [
      { name: 'Hundesalon Wuschelglück', theme: 'standard', isDemo: 1, art: 'partner' },
      { name: 'Hundeschule Pfotenglück', theme: 'standard', isDemo: 1, art: 'partner' },
      { name: 'Familie Sonnenhang', theme: 'standard', isDemo: 1, art: 'rudel' },
      { name: 'Tierheim Sonnenhang', theme: 'standard', isDemo: 1, art: 'tierheim' },
      { name: 'Zuhause am Deich', theme: 'standard', isDemo: 1, art: 'zuhause' }
    ]
  )
  const rudel = families.find((f) => f.art === 'rudel')
  const household = families.find((f) => f.art === 'zuhause')
  const membership = db
    .prepare('SELECT 1 FROM family_members WHERE member_family_id = ? AND group_family_id = ?')
    .get(household.id, rudel.id)
  assert.ok(membership, 'Zuhause ist Mitglied des Rudels')

  // replaceDemoPack() legt (Task 4) auch die Demo-Partner neu an, auch wenn scripts/demo.js selbst
  // nichts darüber ausgibt - siehe lib/demoPack.js, seed/demo-partners.js.
  const partnerSlugs = db.prepare('SELECT slug FROM partners WHERE is_demo = 1 ORDER BY slug').all().map((p) => p.slug)
  assert.deepEqual(partnerSlugs, ['hundesalon-wuschelglueck', 'hundeschule-pfotenglueck', 'tierheim-sonnenhang', 'tierschutzverein-deichland'])

  db.close()

  fs.rmSync(dir, { recursive: true, force: true })
})
