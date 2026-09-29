const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call } = require('./helpers')

// Phase P2 Task 9: Auffüllen der öffentlichen Partnerliste im Umkreis (POST /api/public/partners/near und
// GET /api/public/partners?plz=) - liegen weniger als 5 Partner im Radius, kommen die nächsten außerhalb
// dazu (höchstens 20, ausserhalb: true). Die Antwort bleibt ein Array. t.test() bleibt auf einer Ebene.
const dataDir = useTempDataDir('partners-near')

test('Partnerliste im Umkreis: Auffüllen mit den nächsten außerhalb', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { lookupPlz } = require('../lib/geo')
  const berlin = lookupPlz('10115')

  const near = async (body) => {
    const res = await call(base, '/api/public/partners/near', { method: 'POST', body })
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.data))
    return res.data
  }

  let counter = 0
  function insertPartner({ lat, lon, name, status = 'aktiv' }) {
    counter += 1
    const slug = `near-test-${counter}`
    db.prepare("INSERT INTO partners (slug, name, typ, status, lat, lon) VALUES (?, ?, 'hundeschule', ?, ?, ?)").run(slug, name || slug, status, lat, lon)
    return slug
  }

  // Im 10-km-Radius um Berlin-Mitte: zwei. Außerhalb: Potsdam (~26 km), Hamburg (~255 km), München (~504 km).
  const mitteA = insertPartner({ lat: berlin.lat, lon: berlin.lon })
  const mitteB = insertPartner({ lat: berlin.lat + 0.01, lon: berlin.lon })
  const potsdam = insertPartner({ lat: 52.39, lon: 13.06 })
  const hamburg = insertPartner({ lat: 53.55, lon: 9.99 })
  const muenchen = insertPartner({ lat: 48.137, lon: 11.575 })
  insertPartner({ lat: 52.4, lon: 13.1, status: 'entwurf' })
  insertPartner({ lat: null, lon: null })

  await t.test('weniger als 5 im Radius: die nächsten außerhalb kommen dazu, im Radius ausserhalb: false', async () => {
    const list = await near({ plz: '10115', radius: 10 })
    assert.deepEqual(list.map((p) => p.slug), [mitteA, mitteB, potsdam, hamburg, muenchen])
    assert.deepEqual(list.map((p) => p.ausserhalb), [false, false, true, true, true])
    for (let i = 1; i < list.length; i += 1) assert.ok(list[i - 1].distanceKm <= list[i].distanceKm)
    assert.ok(list[2].distanceKm > 10)
    // gleiche Antwort über GET ?plz=
    assert.deepEqual((await call(base, '/api/public/partners?plz=10115&radius=10')).data, list)
  })

  await t.test('ab 5 im Radius: nichts von außerhalb', async () => {
    const list = await near({ plz: '10115', radius: 50 })
    assert.deepEqual(list.map((p) => p.slug), [mitteA, mitteB, potsdam, hamburg, muenchen])
    assert.deepEqual(list.map((p) => p.ausserhalb), [false, false, false, true, true], 'Potsdam liegt jetzt im Radius')

    const extra = [1, 2, 3].map(() => insertPartner({ lat: berlin.lat, lon: berlin.lon }))
    const full = await near({ plz: '10115', radius: 10 })
    assert.equal(full.length, 5)
    assert.ok(full.every((p) => p.ausserhalb === false))
    assert.ok(!full.some((p) => [potsdam, hamburg, muenchen].includes(p.slug)))
    db.prepare(`DELETE FROM partners WHERE slug IN (${extra.map(() => '?').join(', ')})`).run(...extra)
  })

  await t.test('höchstens 20 ergänzte Partner, die nächsten zuerst', async () => {
    for (let i = 0; i < 25; i += 1) insertPartner({ lat: 47 + i * 0.01, lon: 10 })
    const list = await near({ plz: '10115', radius: 10 })
    assert.equal(list.filter((p) => p.ausserhalb === false).length, 2)
    const outside = list.filter((p) => p.ausserhalb === true)
    assert.equal(outside.length, 20)
    assert.deepEqual(outside.slice(0, 3).map((p) => p.slug), [potsdam, hamburg, muenchen])
  })

  await t.test('ohne PLZ: alle nach Name, ohne ausserhalb', async () => {
    const list = (await call(base, '/api/public/partners')).data
    assert.ok(Array.isArray(list))
    assert.ok(list.every((p) => !('ausserhalb' in p) && !('distanceKm' in p)))
  })
})
