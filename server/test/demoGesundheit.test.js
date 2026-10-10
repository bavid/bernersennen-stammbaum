const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// „Gesundheit leicht“ im Demo-Pack (seed/demo-household.js): Nele hat eine Impfung mit nächstem Termin in 10 Tagen und
// eine Wurmkur; die Demo liest, schreibt aber nichts.

const dataDir = useTempDataDir('demo-gesundheit', { APP_ENV: 'staging' })

test('Demo: Gesundheit leicht am Deich', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { relativeDemoDate } = require('../lib/demoDates')

  replaceDemoPack(db, uploadDir)
  const { household } = replaceDemoPack(db, uploadDir)
  const demo = await call(base, '/api/demo', { method: 'POST' })
  const cookie = getCookie(demo.res)
  const neleId = household.dogIds.nele

  await t.test('zweimal erneuern: keine verwaisten Gesundheits-Zeilen', () => {
    const orphans = db.prepare('SELECT COUNT(*) AS n FROM gesundheit_eintraege WHERE entry_id NOT IN (SELECT id FROM timeline_entries)').get().n
    assert.equal(orphans, 0)
    const demoRows = db
      .prepare('SELECT COUNT(*) AS n FROM gesundheit_eintraege g JOIN timeline_entries t ON t.id = g.entry_id WHERE t.family_id = ?')
      .get(household.familyId).n
    assert.equal(demoRows, 3)
  })

  await t.test('Infos: Impfung, Wurmkur und Tierarzt mit nächsten Terminen', async () => {
    const res = await call(base, `/api/gesundheit?dogId=${neleId}`, { cookie })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.letzte.map((item) => item.art), ['impfung', 'wurmkur_floh', 'tierarzt'])
    assert.equal(res.data.letzte[0].naechstesAm, relativeDemoDate({ days: 10 }))
  })

  await t.test('Bald: die Impfung erscheint, die Wurmkur (6 Wochen) noch nicht', async () => {
    const res = await call(base, `/api/gesundheit/bald?heute=${relativeDemoDate()}`, { cookie })
    assert.deepEqual(res.data.map((item) => [item.dogName, item.art]), [['Nele', 'impfung']])
  })

  await t.test('Demo schreibt keine Gesundheit', async () => {
    const res = await call(base, '/api/timeline', {
      method: 'POST',
      cookie,
      body: { dogId: neleId, autorName: 'Pepper', datum: '2026-10-01', titel: 'Impfung', gesundheit: { art: 'impfung' } }
    })
    assert.equal(res.status, 403)
  })
})
