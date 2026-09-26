const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

const dataDir = useTempDataDir('housemates')

test('adoptive siblings and other animals living together', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const { cookie } = await createFamily(base, 'Rudel A', 'passwortA')
  const { cookie: otherCookie } = await createFamily(base, 'Rudel B', 'passwortB')
  const createDog = (body, c = cookie) => call(base, '/api/dogs', { method: 'POST', cookie: c, body })
  const link = (dogId, otherDogId, c = cookie) =>
    call(base, `/api/dogs/${dogId}/housemates`, { method: 'POST', cookie: c, body: { otherDogId } })

  const hermes = (await createDog({ name: 'Hermes', geschlecht: 'ruede' })).data
  const max = (await createDog({ name: 'Max', geschlecht: 'ruede', rasse: 'Labrador' })).data
  const minka = (await createDog({ name: 'Minka', geschlecht: 'huendin', tierart: 'katze' })).data
  const foreign = (await createDog({ name: 'Fremd', geschlecht: 'ruede' }, otherCookie)).data

  await t.test('animals have a species, dogs by default', async () => {
    assert.equal(hermes.tierart, 'hund')
    assert.equal(minka.tierart, 'katze')
    assert.equal((await createDog({ name: 'X', geschlecht: 'ruede', tierart: 'drache' })).status, 400)
  })

  await t.test('links two animals of the pack in both directions', async () => {
    assert.equal((await link(max.id, hermes.id)).status, 201)
    assert.equal((await link(minka.id, hermes.id)).status, 201)

    const { data } = await call(base, `/api/dogs/${hermes.id}`, { cookie })
    assert.deepEqual(data.housemates.map((h) => h.name).sort(), ['Max', 'Minka'])
    assert.equal(data.housemates.find((h) => h.name === 'Minka').tierart, 'katze')

    const maxDetail = (await call(base, `/api/dogs/${max.id}`, { cookie })).data
    assert.deepEqual(maxDetail.housemates.map((h) => h.name), ['Hermes'])

    const links = (await call(base, '/api/dogs/links', { cookie })).data
    assert.equal(links.length, 2)
  })

  await t.test('linking twice is harmless, self and foreign links are rejected', async () => {
    assert.equal((await link(hermes.id, max.id)).status, 201)
    assert.equal((await call(base, '/api/dogs/links', { cookie })).data.length, 2)
    assert.equal((await link(hermes.id, hermes.id)).status, 400)
    assert.equal((await link(hermes.id, foreign.id)).status, 404)
    assert.equal((await link(foreign.id, hermes.id, otherCookie)).status, 404)
  })

  await t.test('parents must be the same species', async () => {
    const kitten = await createDog({ name: 'Kitten', geschlecht: 'ruede', motherDogId: minka.id })
    assert.equal(kitten.status, 400)
    const catKitten = await createDog({ name: 'Mini', geschlecht: 'ruede', tierart: 'katze', motherDogId: minka.id })
    assert.equal(catKitten.status, 201)
  })

  await t.test('unlinking rejects an invalid id', async () => {
    const res = await call(base, `/api/dogs/${hermes.id}/housemates/abc`, { method: 'DELETE', cookie })
    assert.equal(res.status, 400)
  })

  await t.test('unlinking and deleting remove the connection', async () => {
    const res = await call(base, `/api/dogs/${hermes.id}/housemates/${minka.id}`, { method: 'DELETE', cookie })
    assert.equal(res.status, 204)
    await call(base, `/api/dogs/${max.id}`, { method: 'DELETE', cookie })
    const { data } = await call(base, `/api/dogs/${hermes.id}`, { cookie })
    assert.deepEqual(data.housemates, [])
    assert.deepEqual((await call(base, '/api/dogs/links', { cookie })).data, [])
  })

  await t.test('links of other packs stay invisible', async () => {
    assert.deepEqual((await call(base, '/api/dogs/links', { cookie: otherCookie })).data, [])
  })

  await t.test('quick add: creating an animal with housemateId links it in one step', async () => {
    const res = await createDog({ name: 'Hoppel', geschlecht: 'ruede', tierart: 'anderes', rasse: 'Kaninchen', housemateId: hermes.id })
    assert.equal(res.status, 201)
    assert.equal(res.data.rasse, 'Kaninchen')
    const { data } = await call(base, `/api/dogs/${hermes.id}`, { cookie })
    assert.deepEqual(data.housemates.map((h) => h.name), ['Hoppel'])
  })

  await t.test('quick add rejects foreign or invalid housemates without creating the animal', async () => {
    const countDogs = async () => (await call(base, '/api/dogs', { cookie })).data.length
    const before = await countDogs()
    const foreignMate = await createDog({ name: 'Spion', geschlecht: 'ruede', housemateId: foreign.id })
    assert.equal(foreignMate.status, 400)
    assert.equal((await createDog({ name: 'Kaputt', geschlecht: 'ruede', housemateId: 'abc' })).status, 400)
    assert.equal(await countDogs(), before)
    assert.deepEqual((await call(base, '/api/dogs/links', { cookie: otherCookie })).data, [])
  })
})
