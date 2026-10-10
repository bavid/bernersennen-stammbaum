const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const Database = require('better-sqlite3')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')
const { zaehleBestand } = require('../lib/bestandZaehlen')

// Umzug der Produktion (Stand Commit 1f7b91c, ein Bestandsrudel mit gemeinsamem Passwort) auf das neue System: die ALTE
// Server-Version wird aus git ausgepackt und legt in einem eigenen Prozess (test/altschemaSeed.js) über ihre eigene API
// ein fiktives Rudel an. Danach öffnet der NEUE Code dieselbe Datei (Start-Migrationen), im Instanz-Modus „rudel“ und mit
// APP_ENV=production wie die echte Instanz (unpräfixierte Cookie-Namen - alte Sitzungen gelten weiter).
const ALT_COMMIT = '1f7b91c'
const REPO = path.join(__dirname, '..', '..')
const HINWEIS_URL = 'https://neu.example.org/'

function gitAvailable() {
  try {
    execFileSync('git', ['cat-file', '-e', `${ALT_COMMIT}^{commit}`], { cwd: REPO, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Nur die Server-Quellen (ohne Tests und Bilder) - git show je Datei, damit kein tar nötig ist.
function extractOldServer(target) {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', ALT_COMMIT, 'server'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter((file) => /\.(js|json)$/.test(file) && !file.startsWith('server/test/'))
  for (const file of files) {
    const dest = path.join(target, file)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, execFileSync('git', ['show', `${ALT_COMMIT}:${file}`], { cwd: REPO, maxBuffer: 16 * 1024 * 1024 }))
  }
  return path.join(target, 'server')
}

function seedOldDatabase(oldServerDir, dataDir) {
  const out = execFileSync(process.execPath, [path.join(__dirname, 'altschemaSeed.js'), oldServerDir], {
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      JWT_SECRET: 'test-secret',
      NODE_ENV: 'test',
      NODE_PATH: path.join(__dirname, '..', 'node_modules')
    },
    encoding: 'utf8'
  })
  return JSON.parse(out.trim().split('\n').pop())
}

function treeOf(database) {
  return database.prepare('SELECT id, mother_dog_id, father_dog_id, mother_freitext, father_freitext FROM dogs ORDER BY id').all()
}

const hasGit = gitAvailable()

test('Altschema 1f7b91c -> neuer Code: nichts verloren, Passwort-Login, Stammbaum-Start, Rudel-Modus', { skip: !hasGit && 'git/Commit nicht verfügbar' }, async (t) => {
  const dataDir = useTempDataDir('altschema', { INSTANZ_MODUS: 'rudel', APP_ENV: 'production' })
  const oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronik-altcode-'))
  const seed = seedOldDatabase(extractOldServer(oldDir), dataDir)
  const dbFile = path.join(dataDir, 'data.db')

  const raw = new Database(dbFile, { readonly: true })
  const vorher = zaehleBestand(raw)
  const baumVorher = treeOf(raw)
  raw.close()

  const { server, base } = await startApp()
  const db = require('../db')
  const { migriereRudelInstanz } = require('../lib/rudelMigration')
  const backupDir = path.join(dataDir, 'backups')
  let cookie = ''

  t.after(() => {
    cleanup(dataDir, server)
    fs.rmSync(oldDir, { recursive: true, force: true })
  })

  await t.test('die alte App hat realistischen Bestand angelegt', () => {
    assert.deepEqual(
      { ...vorher, users: undefined },
      { families: 1, dogs: 5, timelineEntries: 3, photos: 5, notes: 2, noteReplies: 1, comments: 2, litters: 1, housemates: 1, adminMessages: 1, users: undefined }
    )
  })

  await t.test('nach den Start-Migrationen: alle Zahlen gleich, Stammbaum unverändert', () => {
    assert.deepEqual(zaehleBestand(db), vorher)
    assert.deepEqual(treeOf(db), baumVorher)
    const lotte = baumVorher.find((dog) => dog.id === seed.dogs.lotte)
    assert.equal(lotte.mother_dog_id, seed.dogs.flocke)
    assert.equal(lotte.father_freitext, 'Gastrüde aus dem Nachbardorf')
    const family = db.prepare('SELECT art, is_demo, legacy_password FROM families WHERE id = ?').get(seed.familyId)
    assert.deepEqual(family, { art: 'rudel', is_demo: 0, legacy_password: 1 })
  })

  await t.test('Familien-Passwort meldet über die neue API an, Tiere/Pinnwand/Fotos sind da', async () => {
    const login = await call(base, '/api/login', { method: 'POST', body: { password: seed.passwort } })
    assert.equal(login.status, 200)
    assert.equal(login.data.id, seed.familyId)
    assert.equal(login.data.stammbaumStart, false)
    cookie = getCookie(login.res)
    const dogs = await call(base, '/api/dogs', { cookie })
    assert.equal(dogs.data.length, 5)
    const flocke = dogs.data.find((dog) => dog.id === seed.dogs.flocke)
    assert.deepEqual([flocke.mother_dog_id, flocke.father_dog_id], [seed.dogs.wilma, seed.dogs.benno])
    assert.equal((await call(base, '/api/notes', { cookie })).data.length, 2)
    for (const foto of seed.fotos) {
      const res = await fetch(`${base}${foto}`, { headers: { Cookie: cookie } })
      assert.equal(res.status, 200, foto)
    }
    assert.equal((await call(base, '/api/login', { method: 'POST', body: { password: 'falsch-falsch' } })).status, 401)
  })

  await t.test('eine Sitzung aus der alten App bleibt gültig (gleiches JWT_SECRET)', async () => {
    const me = await call(base, '/api/me', { cookie: seed.altCookie })
    assert.equal(me.status, 200)
    assert.equal(me.data.id, seed.familyId)
  })

  await t.test('Probelauf schreibt nichts', async () => {
    const result = await migriereRudelInstanz({ familieId: seed.familyId, hinweisUrl: HINWEIS_URL, dryRun: true, backupDir })
    assert.equal(result.backupPfad, null)
    assert.equal(result.hinweis.aktion, 'angelegt')
    assert.equal(fs.existsSync(backupDir), false)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hinweise').get().n, 0)
    assert.equal((await call(base, '/api/me', { cookie })).data.stammbaumStart, false)
  })

  await t.test('Umzug: Sicherung, gleiche Zahlen, Stammbaum-Start in /api/me, ein Hinweis mit Link', async () => {
    const result = await migriereRudelInstanz({ familieId: seed.familyId, hinweisUrl: HINWEIS_URL, backupDir })
    assert.deepEqual(result.nachher, result.vorher)
    assert.deepEqual(result.vorher, vorher)
    assert.equal(result.stammbaumNeu, true)
    assert.equal(result.hinweis.aktion, 'angelegt')
    assert.match(path.basename(result.backupPfad), /^pre-migration-.+\.db$/)
    const kopie = new Database(result.backupPfad, { readonly: true })
    assert.deepEqual(zaehleBestand(kopie), vorher)
    kopie.close()
    const me = (await call(base, '/api/me', { cookie })).data
    assert.equal(me.stammbaumStart, true)
    assert.equal(me.instanzModus, 'rudel')
    const hinweise = (await call(base, '/api/hinweise')).data.hinweise
    assert.equal(hinweise.length, 1)
    assert.equal(hinweise[0].titel, 'Neue Familie auf Pfoten')
    assert.equal(hinweise[0].linkUrl, HINWEIS_URL)
    assert.equal(hinweise[0].linkLabel, 'Zur neuen Familie auf Pfoten')
    assert.match(hinweise[0].textEn, /invitation code/)
    assert.match(hinweise[0].text, /Es gibt eine neue Version/)
  })

  await t.test('neueVersionUrl: Link aus dem Hinweis nur im Rudel-Modus, ohne aktiven Hinweis null', () => {
    const { neueVersionUrl } = require('../lib/rudelNeueVersion')
    assert.equal(neueVersionUrl('rudel'), HINWEIS_URL)
    assert.equal(neueVersionUrl(''), null)
    db.prepare("UPDATE hinweise SET aktiv = 0 WHERE titel = 'Neue Familie auf Pfoten'").run()
    assert.equal(neueVersionUrl('rudel'), null)
    db.prepare("UPDATE hinweise SET aktiv = 1 WHERE titel = 'Neue Familie auf Pfoten'").run()
  })

  await t.test('zweiter Lauf: nichts doppelt, nichts geändert', async () => {
    const result = await migriereRudelInstanz({ familieId: seed.familyId, hinweisUrl: HINWEIS_URL, backupDir })
    assert.equal(result.stammbaumNeu, false)
    assert.equal(result.hinweis.aktion, 'unverändert')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM hinweise').get().n, 1)
    assert.deepEqual(result.nachher, vorher)
  })

  await t.test('bricht ab: unbekannte Familie, Demo-Familie, http-Link', async () => {
    const demoId = db.prepare("INSERT INTO families (name, password_hash, is_demo) VALUES ('Demo', '!', 1)").run().lastInsertRowid
    await assert.rejects(migriereRudelInstanz({ familieId: 9999, backupDir }), /gibt es nicht/)
    await assert.rejects(migriereRudelInstanz({ familieId: Number(demoId), backupDir }), /Demo/)
    await assert.rejects(migriereRudelInstanz({ familieId: seed.familyId, hinweisUrl: 'http://x.example', backupDir }), /https/)
    db.prepare('DELETE FROM families WHERE id = ?').run(demoId)
  })

  await t.test('Rudel-Modus: Config meldet ihn, Gutschein/Demo/Anfragen/Beitreten sind 404', async () => {
    assert.equal((await call(base, '/api/config')).data.instanzModus, 'rudel')
    const gesperrt = [
      ['/api/demo', {}],
      ['/api/vouchers/check', { code: 'ABCD-EFGH-JKLM' }],
      ['/api/vouchers/redeem', { code: 'ABCD-EFGH-JKLM', name: 'X' }],
      ['/api/vouchers/claim', { code: 'ABCD-EFGH-JKLM' }],
      ['/api/public/anfragen', { typ: 'gutschein', email: 'a@example.org' }],
      ['/api/families/join', { password: 'x' }]
    ]
    for (const [pfad, body] of gesperrt) {
      assert.equal((await call(base, pfad, { method: 'POST', body, cookie })).status, 404, pfad)
    }
  })
})
