const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

const dataDir = useTempDataDir('notes')

test('pinboard notes and recent activity', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const { cookie } = await createFamily(base, 'Rudel A', 'passwortA')
  const { cookie: otherCookie } = await createFamily(base, 'Rudel B', 'passwortB')
  const post = (path, body, c = cookie) => call(base, path, { method: 'POST', cookie: c, body })

  await t.test('pins a note with an optional meeting date and time', async () => {
    const res = await post('/api/notes', { autorName: 'David', text: 'Treffen am See?', terminDatum: '2026-10-18', terminZeit: '14:00' })
    assert.equal(res.status, 201)
    assert.equal(res.data.termin_datum, '2026-10-18')
    assert.equal(res.data.termin_zeit, '14:00')

    const plain = await post('/api/notes', { autorName: 'Anna', text: 'Hermes hat einen neuen Lieblingsball' })
    assert.equal(plain.status, 201)
    assert.equal(plain.data.termin_datum, null)
  })

  await t.test('lists newest notes first, only for the own pack', async () => {
    const { data } = await call(base, '/api/notes', { cookie })
    assert.deepEqual(data.map((n) => n.autor_name), ['Anna', 'David'])
    const other = await call(base, '/api/notes', { cookie: otherCookie })
    assert.deepEqual(other.data, [])
  })

  await t.test('validates text, date and time', async () => {
    assert.equal((await post('/api/notes', { autorName: 'X', text: '' })).status, 400)
    assert.equal((await post('/api/notes', { autorName: 'X', text: 'a', terminDatum: '2026-02-30' })).status, 400)
    assert.equal((await post('/api/notes', { autorName: 'X', text: 'a', terminZeit: '14:00' })).status, 400)
    assert.equal((await post('/api/notes', { autorName: 'X', text: 'a', terminDatum: '2026-10-18', terminZeit: '25:00' })).status, 400)
  })

  await t.test('other packs cannot delete notes; own pack can', async () => {
    const { data } = await call(base, '/api/notes', { cookie })
    const foreign = await call(base, `/api/notes/${data[0].id}`, { method: 'DELETE', cookie: otherCookie })
    assert.equal(foreign.status, 404)
    const own = await call(base, `/api/notes/${data[0].id}`, { method: 'DELETE', cookie })
    assert.equal(own.status, 204)
  })

  await t.test('notes carry a conversation of replies with author names', async () => {
    const note = (await post('/api/notes', { autorName: 'David', text: 'Wer kommt Sonntag in den Park?' })).data
    assert.deepEqual(note.replies, [])

    const first = await post(`/api/notes/${note.id}/replies`, { autorName: 'Anna', text: 'Wir sind dabei!' })
    assert.equal(first.status, 201)
    await post(`/api/notes/${note.id}/replies`, { autorName: 'Familie Keller', text: 'Wir kommen später nach.' })

    const { data } = await call(base, '/api/notes', { cookie })
    const listed = data.find((n) => n.id === note.id)
    assert.deepEqual(listed.replies.map((r) => [r.autor_name, r.text]), [
      ['Anna', 'Wir sind dabei!'],
      ['Familie Keller', 'Wir kommen später nach.']
    ])
  })

  await t.test('replies are validated and stay inside the own pack', async () => {
    const { data } = await call(base, '/api/notes', { cookie })
    const note = data.find((n) => n.replies.length)
    assert.equal((await post(`/api/notes/${note.id}/replies`, { autorName: 'X', text: '' })).status, 400)
    assert.equal((await post(`/api/notes/${note.id}/replies`, { autorName: 'Fremd', text: 'Hallo' }, otherCookie)).status, 404)

    const reply = note.replies[0]
    const foreignDelete = await call(base, `/api/notes/${note.id}/replies/${reply.id}`, { method: 'DELETE', cookie: otherCookie })
    assert.equal(foreignDelete.status, 404)
    const ownDelete = await call(base, `/api/notes/${note.id}/replies/${reply.id}`, { method: 'DELETE', cookie })
    assert.equal(ownDelete.status, 204)
  })

  await t.test('deleting a note removes its replies', async () => {
    const { data } = await call(base, '/api/notes', { cookie })
    const note = data.find((n) => n.replies.length)
    await call(base, `/api/notes/${note.id}`, { method: 'DELETE', cookie })
    const db = require('../db')
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM note_replies WHERE note_id = ?').get(note.id).c, 0)
  })

  await t.test('recent activity shows newest entries across all dogs with dog info', async () => {
    const hermes = (await post('/api/dogs', { name: 'Hermes', geschlecht: 'ruede', rasse: 'Berner-Mix' })).data
    const tilda = (await post('/api/dogs', { name: 'Tilda', geschlecht: 'huendin' })).data
    await post('/api/timeline', { dogId: hermes.id, autorName: 'David', datum: '2026-06-01', titel: 'Erster Ausflug' })
    await post('/api/timeline', { dogId: tilda.id, autorName: 'Anna', datum: '2020-01-01', titel: 'Alte Erinnerung nachgetragen' })

    const { data } = await call(base, '/api/timeline/recent?limit=5', { cookie })
    assert.deepEqual(data.map((e) => e.titel), ['Alte Erinnerung nachgetragen', 'Erster Ausflug'])
    assert.equal(data[1].dog_name, 'Hermes')
    assert.equal(data[1].dog_rasse, 'Berner-Mix')

    const other = await call(base, '/api/timeline/recent', { cookie: otherCookie })
    assert.deepEqual(other.data, [])
  })
})
