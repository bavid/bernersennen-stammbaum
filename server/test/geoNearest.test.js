const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')
const { nearestPlz, lookupPlz, distanceKm } = require('../lib/geo')

// Nahe genug: in Großstädten liegen mehrere PLZ (auch Großkunden-PLZ) dicht beieinander - es zählt, dass die
// gefundene PLZ wenige Kilometer entfernt liegt, nicht welche genau.
function kmBetween(plzA, plzB) {
  return distanceKm(lookupPlz(plzA), lookupPlz(plzB))
}

// „Standort für ‚In der Nähe‘ merken“ (Einstellungen › App): zu Koordinaten die nächste PLZ - gerundet, nicht
// gespeichert; die App merkt sich danach nur die PLZ auf dem Gerät.
const dataDir = useTempDataDir('geo-nearest')

test('nearestPlz: findet die nächste Postleitzahl, außerhalb Deutschlands nichts', () => {
  const hamburg = lookupPlz('20095')
  assert.ok(hamburg)
  const hit = nearestPlz(hamburg.lat + 0.004, hamburg.lon - 0.004)
  assert.ok(hit)
  assert.match(hit.plz, /^\d{5}$/)
  assert.ok(kmBetween(hit.plz, '20095') < 5, `${hit.plz} liegt nahe 20095`)
  assert.equal(nearestPlz(48.86, 2.35), null, 'Paris liegt außerhalb der gültigen Koordinaten')
  assert.equal(nearestPlz(Number.NaN, 10), null)
})

test('POST /api/places/plz', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const family = await createFamily(base, 'Familie Nord', 'geheim123')
  const post = (body, cookie) => call(base, '/api/places/plz', { method: 'POST', body, cookie })

  const hamburg = lookupPlz('20095')
  const ok = await post({ lat: hamburg.lat, lon: hamburg.lon }, family.cookie)
  assert.equal(ok.status, 200)
  assert.match(ok.data.plz, /^\d{5}$/)
  assert.ok(kmBetween(ok.data.plz, '20095') < 5)
  assert.equal(typeof ok.data.ort, 'string')
  assert.match(ok.headers.get('cache-control'), /no-store/)

  assert.equal((await post({ lat: 'x', lon: 10 }, family.cookie)).status, 400)
  assert.equal((await post({ lat: 48.86, lon: 2.35 }, family.cookie)).status, 400, 'außerhalb des gültigen Bereichs')
  assert.equal((await post({ lat: hamburg.lat, lon: hamburg.lon })).status, 401)
})
