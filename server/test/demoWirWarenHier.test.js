const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// „Wir waren hier“ im Demo-Pack (Plan 2026-10-10 Aufgabe 5, seed/demo-wir-waren-hier.js): zweimal erneuern ohne
// Dubletten/Waisen, echte Zeilen bleiben, und die Demo zeigt Anmeldung (frei + offen), Anheftung und Kontaktwunsch.

const dataDir = useTempDataDir('demo-wir-waren-hier', { APP_ENV: 'staging' })
const count = (db, table, where = '1') => db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get().n

function addRealCheckin(db) {
  const home = db.prepare("INSERT INTO families (name, password_hash, art) VALUES ('Zuhause Hoppelweg', 'x', 'zuhause')").run().lastInsertRowid
  const dog = db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, 'Lotte', 'huendin')").run(home).lastInsertRowid
  const partner = db
    .prepare("INSERT INTO partners (slug, name, typ, status, is_demo) VALUES ('hundeschule-wiesengrund', 'Hundeschule Wiesengrund', 'hundeschule', 'aktiv', 0)")
    .run().lastInsertRowid
  const checkin = db
    .prepare("INSERT INTO wwh_checkins (partner_id, family_id, dog_id, status, zeige_mich) VALUES (?, ?, ?, 'bestaetigt', 1)")
    .run(partner, home, dog).lastInsertRowid
  db.prepare('INSERT INTO wwh_kontakt_log (von_family_id) VALUES (?)').run(home)
  return { home: Number(home), checkin: Number(checkin) }
}

test('Demo: „Wir waren hier“ bei Pfotenglück', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })

  const real = addRealCheckin(db)
  const first = replaceDemoPack(db, uploadDir)
  // Ein Versand-Protokoll eines Demo-Zuhauses muss beim nächsten Erneuern mit verschwinden.
  db.prepare('INSERT INTO wwh_kontakt_log (von_family_id) VALUES (?)').run(first.household.familyId)
  const { wirWarenHier, household } = replaceDemoPack(db, uploadDir)

  await t.test('zweimal erneuern: keine Dubletten, keine Waisen, echte Zeilen unberührt', () => {
    assert.deepEqual(wirWarenHier, { partnerId: wirWarenHier.partnerId, checkins: 3, pins: 1, kontakte: 1 })
    assert.equal(count(db, 'wwh_checkins', 'is_demo = 1'), 3)
    assert.equal(count(db, 'wwh_pins'), 1)
    assert.equal(count(db, 'wwh_kontakt', 'is_demo = 1'), 1)
    assert.equal(count(db, 'wwh_checkins', `is_demo = 1 AND partner_id != ${wirWarenHier.partnerId}`), 0)
    assert.equal(count(db, 'wwh_checkins', 'partner_id NOT IN (SELECT id FROM partners)'), 0)
    assert.equal(count(db, 'wwh_checkins', 'family_id IN (SELECT id FROM families WHERE is_demo = 1)'), 3)
    assert.equal(count(db, 'wwh_kontakt_log', 'von_family_id IN (SELECT id FROM families WHERE is_demo = 1)'), 0)
    assert.equal(count(db, 'wwh_kontakt_log', 'von_family_id NOT IN (SELECT id FROM families)'), 0)
    assert.equal(db.prepare('SELECT status FROM wwh_checkins WHERE id = ?').get(real.checkin).status, 'bestaetigt')
    assert.equal(count(db, 'wwh_kontakt_log', `von_family_id = ${real.home}`), 1)
  })

  const demo = await post('/api/demo')
  const demoCookie = getCookie(demo.res)

  await t.test('Deich: Nele freigegeben und gezeigt, Mira offen, Pepper mit angehefteter Erinnerung am Ort', async () => {
    assert.equal(demo.data.id, household.familyId)
    const view = await get(`/api/wir-waren-hier/partner/${wirWarenHier.partnerId}`, demoCookie)
    assert.equal(view.status, 200)
    assert.equal(view.data.ort.name, 'Hundeschule Pfotenglück')
    const own = Object.fromEntries(view.data.eigene.map((c) => [c.tierName, [c.status, c.zeigeMich]]))
    assert.deepEqual(own, { Mira: ['offen', false], Nele: ['bestaetigt', true] })
    assert.deepEqual(
      view.data.andere.map((o) => [o.tierName, o.erinnerungen.map((e) => e.titel)]),
      [['Pepper', ['Pepper lernt schwimmen']]]
    )
  })

  await t.test('Deich: ein offener Kontaktwunsch von Pepper an Nele', async () => {
    const wishes = await get('/api/wir-waren-hier/kontakt/offen', demoCookie)
    assert.equal(wishes.status, 200)
    assert.equal(wishes.data.an.length, 1)
    assert.equal(wishes.data.von.length, 0)
    assert.ok(!JSON.stringify(wishes.data).includes('Lindenhof'))
  })

  await t.test('Deich: die Glocke zählt den Kontaktwunsch (/me und /api/hinweise/gruesse)', async () => {
    const me = await get('/api/me', demoCookie)
    assert.equal(me.data.wwhKontakteOffen, 1)
    const glocke = await get('/api/hinweise/gruesse', demoCookie)
    assert.equal(glocke.status, 200)
    assert.equal(glocke.data.zahlen.kontakte, 1)
  })

  await t.test('Partner-Demo Pfotenglück sieht die offene Anmeldung, darf aber nicht entscheiden', async () => {
    const login = await post('/api/demo', { as: 'partner' })
    const cookie = getCookie(login.res)
    const overview = await get('/api/partner-area/wir-waren-hier', cookie)
    assert.equal(overview.status, 200)
    const open = overview.data.anmeldungen.filter((a) => a.status === 'offen')
    assert.deepEqual(open.map((a) => a.tierName), ['Mira'])
    const decide = await post(`/api/partner-area/wir-waren-hier/checkins/${open[0].id}/freigeben`, {}, cookie)
    assert.equal(decide.status, 403)
  })
})
