const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Phase V3: die Familienbande zeigt im eigenen Zuhause je Familie die Tiere, die ihr dort zeigt ("In Familien
// zeigen"). Dafür trägt GET /api/dogs bei EIGENEN Tieren dieselbe Liste "shares" wie GET /api/dogs/:id - nur
// Familien (art rudel), nie die Tierheim-Freigabe, und bei fremden (geteilten oder besuchten) Tieren immer leer.
const dataDir = useTempDataDir('dog-list-shares', { LOGIN_RATE_LIMIT: '200' })

test('GET /api/dogs: Familien-Freigaben nur an eigenen Tieren', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const listed = async (cookie, id) => (await call(base, '/api/dogs', { cookie })).data.find((dog) => dog.id === id)

  const R = await createFamily(base, 'Familie Sonnenhang', 'v3-rudel-1')
  const S = await createFamily(base, 'Familie Lindenweg', 'v3-rudel-2')
  const Z = await createFamily(base, 'Zuhause am Deich', 'v3-zuhause', { art: 'zuhause' })
  const T = await createFamily(base, 'Tierheim Kleeblatt', 'v3-tierheim', { art: 'tierheim' })
  for (const password of ['v3-rudel-1', 'v3-rudel-2']) {
    assert.equal((await post('/api/families/join', { password }, Z.cookie)).status, 200)
  }

  const nele = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin' }, Z.cookie)).data
  const mira = (await post('/api/dogs', { name: 'Mira', geschlecht: 'huendin', tierart: 'katze' }, Z.cookie)).data
  const emma = (await post('/api/dogs', { name: 'Emma', geschlecht: 'huendin' }, R.cookie)).data
  assert.equal((await put(`/api/dogs/${nele.id}/shares`, { familyIds: [S.data.id, R.data.id] }, Z.cookie)).status, 200)
  // "Tierheim darf mitlesen" ist eine eigene Einwilligung und gehört nicht in die Liste (wie GET /:id) - mit und
  // ohne Geschichten-Einwilligung
  db.prepare('INSERT INTO dog_shares (dog_id, family_id, story_consent) VALUES (?, ?, 0)').run(mira.id, T.data.id)
  db.prepare('INSERT INTO dog_shares (dog_id, family_id, story_consent) VALUES (?, ?, 1)').run(nele.id, T.data.id)
  // Ein zweites Zuhause teilt in dieselbe Familie - seine Freigaben bleiben seine
  const Y = await createFamily(base, 'Zuhause am Hang', 'v3-zuhause-2', { art: 'zuhause' })
  assert.equal((await post('/api/families/join', { password: 'v3-rudel-1' }, Y.cookie)).status, 200)
  const pepper = (await post('/api/dogs', { name: 'Pepper', geschlecht: 'ruede' }, Y.cookie)).data
  assert.equal((await put(`/api/dogs/${pepper.id}/shares`, { familyIds: [R.data.id] }, Y.cookie)).status, 200)

  await t.test('eigene Tiere: dieselben Familien wie in der Detailansicht, aufsteigend, ohne Tierheim', async () => {
    const neleListed = await listed(Z.cookie, nele.id)
    assert.deepEqual(neleListed.shares, [R.data.id, S.data.id].sort((a, b) => a - b))
    const detail = await call(base, `/api/dogs/${nele.id}`, { cookie: Z.cookie })
    assert.deepEqual([...neleListed.shares].sort(), [...detail.data.shares].sort())
    assert.deepEqual((await listed(Z.cookie, mira.id)).shares, [])
  })

  await t.test('in der Familie: geteilte Tiere verraten keine weiteren Familien, eigene haben eine leere Liste', async () => {
    const neleInR = await listed(R.cookie, nele.id)
    assert.equal(neleInR.can_edit, 0)
    assert.deepEqual(neleInR.shares, [])
    assert.deepEqual((await listed(R.cookie, pepper.id)).shares, [])
    assert.deepEqual((await listed(R.cookie, emma.id)).shares, [])
  })

  await t.test('jedes Zuhause sieht nur die eigenen Freigaben', async () => {
    const own = (await call(base, '/api/dogs', { cookie: Y.cookie })).data
    assert.deepEqual(own.map((dog) => [dog.name, dog.shares]), [['Pepper', [R.data.id]]])
    assert.equal((await listed(Z.cookie, pepper.id)), undefined)
  })

  await t.test('im Tierheim: das mitgelesene Tier ohne Freigaben', async () => {
    const miraInT = await listed(T.cookie, mira.id)
    assert.equal(miraInT.can_edit, 0)
    assert.deepEqual(miraInT.shares, [])
  })

  await t.test('zu Besuch: die Tiere des Gastgebers ohne Freigaben', async () => {
    const guest = await createHousehold(base, 'Zuhause im Grünen')
    const invite = await post('/api/besuche/einladungen', {}, Z.cookie)
    assert.equal(invite.status, 201)
    assert.equal((await post('/api/besuche/einloesen', { code: invite.data.code }, guest.cookie)).status, 201)
    const view = await post('/api/view', { familyId: Z.data.id }, guest.cookie)
    assert.equal(view.status, 200)
    assert.equal(view.data.zuBesuch, true)

    const neleAsGuest = await listed(getCookie(view.res), nele.id)
    assert.equal(neleAsGuest.can_edit, 0)
    assert.deepEqual(neleAsGuest.shares, [])
  })
})
