const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Familienbande 2: GET /api/dogs/:id liefert die Geschwister (mindestens ein gemeinsamer Elternteil) - die Tierseite
// zeigt sie, seit die Beziehungs-Chips aus der Familienbande verschwunden sind. Nur über Elternteile, die der Bereich
// selbst sieht (wie der Stammbaum), und nur Geschwister, die er sieht. t.test() bleibt auf einer Ebene.
const dataDir = useTempDataDir('siblings', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

test('Geschwister in der Detailansicht eines Tiers', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const siblingsOf = async (dogId, cookie) => (await call(base, `/api/dogs/${dogId}`, { cookie })).data.siblings.map((dog) => dog.name)

  const home = await createHousehold(base, 'Zuhause am Deich')
  assert.equal(home.status, 201)
  const cookie = home.cookie
  const createDog = async (body) => (await post('/api/dogs', body, cookie)).data

  const mama = await createDog({ name: 'Lotte', geschlecht: 'huendin', geburtsdatum: '2015-04-02' })
  const papa = await createDog({ name: 'Benno', geschlecht: 'ruede' })
  const andererPapa = await createDog({ name: 'Arco', geschlecht: 'ruede' })
  const flocke = await createDog({ name: 'Flocke', geschlecht: 'huendin', motherDogId: mama.id, fatherDogId: papa.id, geburtsdatum: '2020-05-01' })
  const pepper = await createDog({ name: 'Pepper', geschlecht: 'ruede', motherDogId: mama.id, fatherDogId: papa.id, geburtsdatum: '2020-05-01' })
  const wilma = await createDog({ name: 'Wilma', geschlecht: 'huendin', motherDogId: mama.id, fatherDogId: andererPapa.id, geburtsdatum: '2022-03-10' })
  const halbBruder = await createDog({ name: 'Hugo', geschlecht: 'ruede', fatherDogId: papa.id, geburtsdatum: '2023-01-01' })

  await t.test('Voll- und Halbgeschwister, nach Geburtstag; nie das Tier selbst', async () => {
    assert.deepEqual(await siblingsOf(flocke.id, cookie), ['Pepper', 'Wilma', 'Hugo'])
    assert.deepEqual(await siblingsOf(wilma.id, cookie), ['Flocke', 'Pepper'])
    assert.deepEqual(await siblingsOf(halbBruder.id, cookie), ['Flocke', 'Pepper'])
  })

  await t.test('nur die Angaben für die Chips - keine Herkunft oder Abschied', async () => {
    const { data } = await call(base, `/api/dogs/${flocke.id}`, { cookie })
    assert.deepEqual(Object.keys(data.siblings[0]).sort(), [
      'family_id',
      'foto_url',
      'geburtsdatum',
      'geschlecht',
      'id',
      'name',
      'name_unbekannt',
      'rasse',
      'tierart'
    ])
  })

  await t.test('ohne Eltern keine Geschwister', async () => {
    assert.deepEqual(await siblingsOf(mama.id, cookie), [])
  })

  await t.test('in einer Familie nur über Eltern, die die Familie sieht', async () => {
    const group = await post('/api/families/group', { name: 'Familie Sonnenhang', password: 'familie-sonnenhang-pw' }, cookie)
    assert.equal(group.status, 201)
    const familyId = group.data.memberships.find((m) => m.name === 'Familie Sonnenhang').id
    for (const dog of [flocke, pepper]) {
      assert.equal((await put(`/api/dogs/${dog.id}/shares`, { familyIds: [familyId] }, cookie)).status, 200)
    }
    const familyCookie = getCookie((await post('/api/view', { familyId }, cookie)).res)

    // Lotte und Benno sind nicht in die Familie geteilt - dort verrät die Seite keine Verwandtschaft über sie
    assert.deepEqual(await siblingsOf(flocke.id, familyCookie), [])

    assert.equal((await put(`/api/dogs/${mama.id}/shares`, { familyIds: [familyId] }, cookie)).status, 200)
    // Über Lotte jetzt Pepper - Wilma und Hugo sieht die Familie nicht
    assert.deepEqual(await siblingsOf(flocke.id, familyCookie), ['Pepper'])
  })
})
