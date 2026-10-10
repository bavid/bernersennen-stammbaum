const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold, createFamily } = require('./helpers')

// „Gesundheit leicht“ (docs/superpowers/plans/2026-10-10-gesundheit-leicht.md): Impfung, Wurmkur & Floh, Tierarzt als
// Art einer Erinnerung mit optionalem „Nächstes Mal am“ - gespeichert in lib/gesundheit.js, gelesen über /api/gesundheit.

const dataDir = useTempDataDir('gesundheit')

const pad = (n) => String(n).padStart(2, '0')
const HEUTE = '2026-10-10'
function plusTage(iso, tage) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + tage)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

test('Gesundheit leicht', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const home = await createHousehold(base, 'Zuhause Kiefernweg')
  const other = await createHousehold(base, 'Zuhause Lindenhof')
  const cookie = home.cookie
  const post = (path, body, c = cookie) => call(base, path, { method: 'POST', body, cookie: c })
  const put = (path, body, c = cookie) => call(base, path, { method: 'PUT', body, cookie: c })
  const get = (path, c = cookie) => call(base, path, { cookie: c })

  const benno = (await post('/api/dogs', { name: 'Benno', geschlecht: 'ruede' })).data
  const wilma = (await post('/api/dogs', { name: 'Wilma', geschlecht: 'huendin' })).data
  const lotte = (await post('/api/dogs', { name: 'Lotte', geschlecht: 'huendin' }, other.cookie)).data
  const entry = (dogId, extra = {}) => ({ dogId, autorName: 'Pepper', datum: '2026-09-01', titel: 'Beim Tierarzt', ...extra })

  await t.test('neue Gesundheits-Erinnerung: Art und nächstes Datum gespeichert, privat als Vorgabe', async () => {
    const res = await post('/api/timeline', entry(benno.id, { gesundheit: { art: 'impfung', naechstesAm: plusTage(HEUTE, 10) } }))
    assert.equal(res.status, 201)
    assert.deepEqual(res.data.gesundheit, { art: 'impfung', naechstesAm: plusTage(HEUTE, 10) })
    assert.equal(res.data.privat, 1)
    const list = await get(`/api/timeline?dogId=${benno.id}`)
    assert.deepEqual(list.data.find((e) => e.id === res.data.id).gesundheit, { art: 'impfung', naechstesAm: plusTage(HEUTE, 10) })
  })

  await t.test('ausdrücklich geteilt bleibt geteilt; ohne Gesundheit kein Feld und nicht privat', async () => {
    const shared = await post('/api/timeline', entry(benno.id, { privat: false, gesundheit: { art: 'tierarzt' } }))
    assert.equal(shared.status, 201)
    assert.equal(shared.data.privat, 0)
    assert.deepEqual(shared.data.gesundheit, { art: 'tierarzt', naechstesAm: null })
    const plain = await post('/api/timeline', entry(benno.id, { titel: 'Am See' }))
    assert.equal(plain.data.privat, 0)
    assert.equal(plain.data.gesundheit, null)
  })

  await t.test('ungültige Angaben -> 400 und nichts gespeichert', async () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM timeline_entries').get().n
    for (const gesundheit of [{ art: 'blutbild' }, { art: 'impfung', naechstesAm: '2026-13-01' }, 'impfung', []]) {
      const res = await post('/api/timeline', entry(benno.id, { gesundheit }))
      assert.equal(res.status, 400, JSON.stringify(gesundheit))
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM timeline_entries').get().n, before)
  })

  await t.test('PUT ändert und entfernt die Gesundheits-Angabe; ohne Feld bleibt sie', async () => {
    const created = (await post('/api/timeline', entry(wilma.id, { gesundheit: { art: 'wurmkur_floh' } }))).data
    const keep = await put(`/api/timeline/${created.id}`, entry(wilma.id, { titel: 'Wurmkur' }))
    assert.deepEqual(keep.data.gesundheit, { art: 'wurmkur_floh', naechstesAm: null })
    const changed = await put(`/api/timeline/${created.id}`, entry(wilma.id, { gesundheit: { art: 'sonstiges', naechstesAm: '2027-01-02' } }))
    assert.deepEqual(changed.data.gesundheit, { art: 'sonstiges', naechstesAm: '2027-01-02' })
    const removed = await put(`/api/timeline/${created.id}`, entry(wilma.id, { gesundheit: null }))
    assert.equal(removed.data.gesundheit, null)
  })

  await t.test('fremder Eintrag: PUT 404, Gesundheits-Angabe unverändert', async () => {
    const own = (await post('/api/timeline', entry(wilma.id, { gesundheit: { art: 'impfung' } }))).data
    const res = await put(`/api/timeline/${own.id}`, entry(wilma.id, { gesundheit: { art: 'tierarzt' } }), other.cookie)
    assert.equal(res.status, 404)
    assert.equal(db.prepare('SELECT art FROM gesundheit_eintraege WHERE entry_id = ?').get(own.id).art, 'impfung')
  })

  await t.test('Übersicht im Reiter Infos: letzte je Art und der nächste Termin; fremdes Tier 404', async () => {
    await post('/api/timeline', entry(wilma.id, { datum: '2026-05-01', gesundheit: { art: 'impfung', naechstesAm: '2026-11-01' } }))
    const newer = (await post('/api/timeline', entry(wilma.id, { datum: '2026-09-20', titel: 'Impfung', gesundheit: { art: 'impfung', naechstesAm: '2027-09-20' } }))).data
    const res = await get(`/api/gesundheit?dogId=${wilma.id}`)
    assert.equal(res.status, 200)
    const impfung = res.data.letzte.find((item) => item.art === 'impfung')
    assert.equal(impfung.entryId, newer.id)
    assert.equal(impfung.datum, '2026-09-20')
    assert.equal(impfung.naechstesAm, '2027-09-20')
    // Die Wurmkur von oben wurde wieder entfernt (gesundheit: null) - übrig bleibt nur die Impfung.
    assert.deepEqual(res.data.letzte.map((item) => item.art), ['impfung'])
    assert.equal((await get(`/api/gesundheit?dogId=${lotte.id}`)).status, 404)
    assert.equal((await get(`/api/gesundheit?dogId=${wilma.id}`, other.cookie)).status, 404)
    assert.equal((await get('/api/gesundheit?dogId=abc')).status, 400)
  })

  await t.test('„Bald“: nur 0-14 Tage, nur der jüngste je Tier und Art, nur eigene Tiere', async () => {
    db.prepare('DELETE FROM timeline_entries').run()
    await post('/api/timeline', entry(benno.id, { datum: '2026-01-01', gesundheit: { art: 'wurmkur_floh', naechstesAm: plusTage(HEUTE, 3) } }))
    await post('/api/timeline', entry(benno.id, { datum: '2026-04-01', gesundheit: { art: 'wurmkur_floh', naechstesAm: plusTage(HEUTE, 60) } }))
    await post('/api/timeline', entry(wilma.id, { gesundheit: { art: 'impfung', naechstesAm: plusTage(HEUTE, 14) } }))
    await post('/api/timeline', entry(wilma.id, { gesundheit: { art: 'tierarzt', naechstesAm: plusTage(HEUTE, 15) } }))
    await post('/api/timeline', entry(benno.id, { gesundheit: { art: 'tierarzt', naechstesAm: plusTage(HEUTE, -1) } }))
    await post('/api/timeline', entry(benno.id, { gesundheit: { art: 'impfung', naechstesAm: HEUTE } }))
    await post('/api/timeline', entry(lotte.id, { gesundheit: { art: 'impfung', naechstesAm: plusTage(HEUTE, 2) } }), other.cookie)
    const res = await get(`/api/gesundheit/bald?heute=${HEUTE}`)
    assert.equal(res.status, 200)
    assert.deepEqual(
      res.data.map((item) => [item.dogName, item.art, item.naechstesAm]),
      [
        ['Benno', 'impfung', HEUTE],
        ['Wilma', 'impfung', plusTage(HEUTE, 14)]
      ]
    )
    assert.equal((await get('/api/gesundheit/bald?heute=morgen')).status, 400)
  })

  await t.test('Löschen der Erinnerung nimmt die Gesundheits-Angabe mit (CASCADE)', async () => {
    const created = (await post('/api/timeline', entry(benno.id, { gesundheit: { art: 'impfung' } }))).data
    assert.equal((await call(base, `/api/timeline/${created.id}`, { method: 'DELETE', cookie })).status, 204)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM gesundheit_eintraege WHERE entry_id = ?').get(created.id).n, 0)
  })

  await t.test('Tierheim: Gesundheit erlaubt, aber nie privat', async () => {
    const shelter = await createFamily(base, 'Tierheim Wiesental', 'tierheimPasswort', { art: 'tierheim' })
    const flocke = (await post('/api/dogs', { name: 'Flocke', geschlecht: 'huendin' }, shelter.cookie)).data
    const res = await post('/api/timeline', entry(flocke.id, { gesundheit: { art: 'impfung' } }), shelter.cookie)
    assert.equal(res.status, 201)
    assert.equal(res.data.privat, 0)
  })
})
