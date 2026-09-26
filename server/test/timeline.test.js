const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

const dataDir = useTempDataDir('timeline')

test('timeline keeps entries in chronological order', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const { cookie } = await createFamily(base, 'Rudel A', 'passwortA')
  const { cookie: otherCookie } = await createFamily(base, 'Rudel B', 'passwortB')
  const dog = await call(base, '/api/dogs', { method: 'POST', cookie, body: { name: 'Bella', geschlecht: 'huendin' } })
  const dogId = dog.data.id

  const addEntry = (datum, titel) =>
    call(base, '/api/timeline', { method: 'POST', cookie, body: { dogId, autorName: 'David', datum, titel } })

  await t.test('sorts entries by date regardless of insertion order', async () => {
    await addEntry('2024-06-01', 'Sommer')
    await addEntry('2021-03-15', 'Geburtstag')
    await addEntry('2022-12-24', 'Weihnachten')

    const { data } = await call(base, `/api/timeline?dogId=${dogId}`, { cookie })
    assert.deepEqual(
      data.map((e) => e.titel),
      ['Geburtstag', 'Weihnachten', 'Sommer']
    )
  })

  await t.test('moves an entry when its date is edited', async () => {
    const { data: entries } = await call(base, `/api/timeline?dogId=${dogId}`, { cookie })
    const sommer = entries.find((e) => e.titel === 'Sommer')

    const updated = await call(base, `/api/timeline/${sommer.id}`, {
      method: 'PUT',
      cookie,
      body: { autorName: 'David', datum: '2020-01-01', titel: 'Sommer (korrigiert)' }
    })
    assert.equal(updated.status, 200)

    const { data } = await call(base, `/api/timeline?dogId=${dogId}`, { cookie })
    assert.equal(data[0].titel, 'Sommer (korrigiert)')
  })

  await t.test('rejects invalid dates and foreign photo urls', async () => {
    const badDate = await addEntry('2024-13-45', 'Kaputt')
    assert.equal(badDate.status, 400)

    const badPhoto = await call(base, '/api/timeline', {
      method: 'POST',
      cookie,
      body: { dogId, autorName: 'X', datum: '2024-01-01', titel: 'Foto', fotoUrls: ['javascript:alert(1)'] }
    })
    assert.equal(badPhoto.status, 400)
  })

  await t.test('other families cannot read, edit or delete entries', async () => {
    const { data: entries } = await call(base, `/api/timeline?dogId=${dogId}`, { cookie })
    const foreignList = await call(base, `/api/timeline?dogId=${dogId}`, { cookie: otherCookie })
    assert.deepEqual(foreignList.data, [])

    const foreignDelete = await call(base, `/api/timeline/${entries[0].id}`, { method: 'DELETE', cookie: otherCookie })
    assert.equal(foreignDelete.status, 404)

    const foreignPost = await call(base, '/api/timeline', {
      method: 'POST',
      cookie: otherCookie,
      body: { dogId, autorName: 'Fremd', datum: '2024-01-01', titel: 'Fremd' }
    })
    assert.equal(foreignPost.status, 403)
  })

  await t.test('deletes an own entry', async () => {
    const { data: entries } = await call(base, `/api/timeline?dogId=${dogId}`, { cookie })
    const res = await call(base, `/api/timeline/${entries[0].id}`, { method: 'DELETE', cookie })
    assert.equal(res.status, 204)

    const { data } = await call(base, `/api/timeline?dogId=${dogId}`, { cookie })
    assert.equal(data.length, entries.length - 1)
  })
})
