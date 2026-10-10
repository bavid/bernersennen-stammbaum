const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

const dataDir = useTempDataDir('demoprofil', { LOGIN_RATE_LIMIT: '200', CODE_RATE_LIMIT: '200' })

// Demo: „Zuhause am Deich“ und die Demo-Familie haben ein Bild, die Demo-Haushalte einen Namen (lib/demoProfil.js) -
// ein erneutes Auffrischen ersetzt beides ohne verwaiste Dateien und fasst echte Profile nicht an.
test('Demo-Profil: Bilder und Namen, idempotent', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { DEMO_PERSONEN } = require('../lib/demoProfil')

  // Ein echtes Profil, das kein Demo-Wechsel anfassen darf.
  const realId = db.prepare("INSERT INTO families (name, password_hash, art) VALUES ('Zuhause Echt', 'x', 'zuhause')").run().lastInsertRowid
  db.prepare("INSERT INTO bereich_profil (family_id, anzeigename) VALUES (?, 'Lotte')").run(realId)

  const first = replaceDemoPack(db, uploadDir)
  const profile = () =>
    db.prepare('SELECT p.family_id, p.anzeigename, p.bild_file, f.name FROM bereich_profil p JOIN families f ON f.id = p.family_id WHERE f.is_demo = 1').all()

  await t.test('Zuhause und Familie haben ein Bild, die Haushalte ihren Namen', () => {
    const rows = profile()
    const home = rows.find((row) => row.family_id === first.household.familyId)
    const family = rows.find((row) => row.family_id === first.created.familyId)
    assert.ok(home.bild_file && fs.existsSync(path.join(uploadDir, home.bild_file)))
    assert.ok(family.bild_file && fs.existsSync(path.join(uploadDir, family.bild_file)))
    assert.equal(home.anzeigename, DEMO_PERSONEN['Zuhause am Deich'])
    for (const member of first.members.households) {
      assert.equal(rows.find((row) => row.family_id === member.familyId)?.anzeigename, DEMO_PERSONEN[member.name], member.name)
    }
    // Eigene Kopien - nicht dieselbe Datei wie ein Tierfoto (sonst löschte deleteFamily ein Tierfoto mit).
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dogs WHERE foto_url = ?').get(`/uploads/${home.bild_file}`).c, 0)
  })

  await t.test('Demo-Sitzung: /me zeigt Bild und Namen, das Bild ist abrufbar', async () => {
    const demo = await call(base, '/api/demo', { method: 'POST' })
    const me = (await call(base, '/api/me', { cookie: getCookie(demo.res) })).data
    assert.ok(me.home.bild)
    assert.equal(me.person.anzeigename, DEMO_PERSONEN['Zuhause am Deich'])
    assert.ok(me.memberships.every((m) => m.bild))
    const res = await fetch(`${base}${me.home.bild}`, { headers: { Cookie: getCookie(demo.res) } })
    assert.equal(res.status, 200)
  })

  await t.test('erneutes Auffrischen: alte Bilddateien weg, je Bereich genau ein Bild, echtes Profil bleibt', () => {
    const oldFiles = profile().map((row) => row.bild_file).filter(Boolean)
    replaceDemoPack(db, uploadDir)
    for (const file of oldFiles) assert.equal(fs.existsSync(path.join(uploadDir, file)), false, file)
    // Zuhause, Familie und zwei Revier-Profile (lib/demoRevier.js).
    assert.equal(profile().filter((row) => row.bild_file).length, 4)
    assert.equal(db.prepare('SELECT anzeigename FROM bereich_profil WHERE family_id = ?').get(realId).anzeigename, 'Lotte')
  })
})
