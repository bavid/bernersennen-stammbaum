const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold } = require('./helpers')

const dataDir = useTempDataDir('rahmen-limit', { RAHMEN_RATE_LIMIT: '3', BILDERRAHMEN_RATE_LIMIT: '2' })

test('Bilderrahmen-Geräte: Fotolisten sind je IP begrenzt (öffentlich, ohne Login)', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const statuses = []
  for (let i = 0; i < 4; i += 1) {
    const res = await fetch(`${base}/api/rahmen/fotos`, { headers: { 'X-Rahmen-Token': 'A'.repeat(43) } })
    statuses.push(res.status)
  }
  assert.deepEqual(statuses, [401, 401, 401, 429])

  // Diashow: je Bereich ein eigenes, knappes Limit für die Fotolisten
  const home = await createHousehold(base, 'Zuhause Limit')
  const lists = []
  for (let i = 0; i < 3; i += 1) lists.push((await call(base, '/api/bilderrahmen/fotos', { cookie: home.cookie })).status)
  assert.deepEqual(lists, [200, 200, 429])
})

test('Kappung: höchstens 300 Fotos - „Heute vor … Jahren“ und Tierfotos immer, dann die neuesten, dazu ältere', () => {
  const { capFotos, MAX_FOTOS } = require('../lib/bilderrahmen')
  const now = new Date('2026-10-04T12:00:00Z')
  const day = (offset) => new Date(now.getTime() - offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const fotos = []
  for (let i = 1; i <= 600; i += 1) fotos.push({ url: `/u/${i}`, datum: day(i), eintragId: i })
  fotos.push({ url: '/u/profil', datum: null, eintragId: null })
  fotos.push({ url: '/u/heute-2020', datum: '2020-10-04', eintragId: 9001 })
  fotos.push({ url: '/u/gestern-2019', datum: '2019-10-03', eintragId: 9002 })

  const capped = capFotos(fotos, { now, random: () => 0.5 })
  const urls = capped.map((foto) => foto.url)
  assert.equal(capped.length, MAX_FOTOS)
  assert.equal(new Set(urls).size, MAX_FOTOS, 'keine doppelten')
  assert.ok(urls.includes('/u/profil'))
  assert.ok(urls.includes('/u/heute-2020'))
  assert.ok(urls.includes('/u/gestern-2019'))
  for (let i = 1; i <= 197; i += 1) assert.ok(urls.includes(`/u/${i}`), `neuestes ${i}`)
  assert.equal(urls[0], '/u/1', 'neueste zuerst')
  assert.equal(urls.at(-1), '/u/profil', 'Tierfotos ohne Datum am Ende')
  assert.deepEqual(capFotos(fotos.slice(0, 5), { now }).length, 5)
})
