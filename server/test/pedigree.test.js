const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

const dataDir = useTempDataDir('pedigree')

test('pedigree rules and dog lifecycle', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const { cookie } = await createFamily(base, 'Rudel A', 'passwortA')
  const createDog = (body) => call(base, '/api/dogs', { method: 'POST', cookie, body })

  const mother = (await createDog({ name: 'Bella', geschlecht: 'huendin', geburtsdatum: '2015-04-02' })).data
  const father = (await createDog({ name: 'Aiko', geschlecht: 'ruede' })).data
  const child = (
    await createDog({ name: 'Cora', geschlecht: 'huendin', motherDogId: mother.id, fatherDogId: father.id })
  ).data

  await t.test('detail view lists parents and children', async () => {
    const { data } = await call(base, `/api/dogs/${mother.id}`, { cookie })
    assert.equal(data.isOwn, true)
    assert.equal(data.familyName, 'Rudel A')
    assert.deepEqual(data.children.map((c) => c.name), ['Cora'])

    const { data: childData } = await call(base, `/api/dogs/${child.id}`, { cookie })
    assert.equal(childData.mother.name, 'Bella')
    assert.equal(childData.father.name, 'Aiko')
  })

  await t.test('rejects a male dog as mother', async () => {
    const res = await createDog({ name: 'Falsch', geschlecht: 'huendin', motherDogId: father.id })
    assert.equal(res.status, 400)
  })

  await t.test('rejects a descendant as parent (cycle)', async () => {
    const res = await call(base, `/api/dogs/${mother.id}`, { method: 'PUT', cookie, body: { motherDogId: child.id } })
    assert.equal(res.status, 400)
  })

  await t.test('switching a parent to freitext clears the linked id', async () => {
    const res = await call(base, `/api/dogs/${child.id}`, {
      method: 'PUT',
      cookie,
      body: { fatherFreitext: 'Balu vom Schwarzwaldhof' }
    })
    assert.equal(res.status, 200)
    assert.equal(res.data.father_dog_id, null)
    assert.equal(res.data.father_freitext, 'Balu vom Schwarzwaldhof')
  })

  await t.test('a parent link can be removed with null', async () => {
    const res = await call(base, `/api/dogs/${child.id}`, { method: 'PUT', cookie, body: { fatherFreitext: null } })
    assert.equal(res.data.father_freitext, null)
  })

  await t.test('deleting a dog keeps its name on children as freitext', async () => {
    await call(base, '/api/timeline', {
      method: 'POST',
      cookie,
      body: { dogId: mother.id, autorName: 'D', datum: '2020-01-01', titel: 'Test' }
    })
    const res = await call(base, `/api/dogs/${mother.id}`, { method: 'DELETE', cookie })
    assert.equal(res.status, 204)

    const { data } = await call(base, `/api/dogs/${child.id}`, { cookie })
    assert.equal(data.mother_dog_id, null)
    assert.equal(data.mother_freitext, 'Bella')

    const gone = await call(base, `/api/dogs/${mother.id}`, { cookie })
    assert.equal(gone.status, 404)
  })

  await t.test('overview lists dogs with timeline counts', async () => {
    const { data } = await call(base, '/api/dogs', { cookie })
    assert.ok(data.every((dog) => typeof dog.timeline_count === 'number'))
  })
})
