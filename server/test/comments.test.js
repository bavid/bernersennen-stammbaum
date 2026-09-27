const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

const dataDir = useTempDataDir('comments')

test('comments on chronicle entries', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const { cookie } = await createFamily(base, 'Rudel A', 'passwortA')
  const { cookie: otherCookie } = await createFamily(base, 'Rudel B', 'passwortB')
  const dog = (await call(base, '/api/dogs', { method: 'POST', cookie, body: { name: 'Hermes', geschlecht: 'ruede' } })).data
  const newEntry = async (titel) =>
    (await call(base, '/api/timeline', { method: 'POST', cookie, body: { dogId: dog.id, autorName: 'Anna', datum: '2026-05-14', titel } })).data
  const entry = await newEntry('Erster Ausflug')
  const comment = (entryId, body, c = cookie) => call(base, `/api/timeline/${entryId}/comments`, { method: 'POST', cookie: c, body })
  const listEntries = async () => (await call(base, `/api/timeline?dogId=${dog.id}`, { cookie })).data

  await t.test('others comment with their name; entries come with their comments in order', async () => {
    const first = await comment(entry.id, { autorName: 'Sabine', text: 'Wie süß!' })
    assert.equal(first.status, 201)
    assert.equal(first.data.autor_name, 'Sabine')
    await comment(entry.id, { autorName: 'Tom', text: 'Da müssen wir auch mal hin.' })
    const [listed] = await listEntries()
    assert.deepEqual(listed.comments.map((c) => [c.autor_name, c.text]), [
      ['Sabine', 'Wie süß!'],
      ['Tom', 'Da müssen wir auch mal hin.']
    ])
  })

  await t.test('name and text are required', async () => {
    assert.equal((await comment(entry.id, { autorName: '', text: 'x' })).status, 400)
    assert.equal((await comment(entry.id, { autorName: 'Tom', text: '  ' })).status, 400)
  })

  await t.test('other packs can neither comment nor delete', async () => {
    assert.equal((await comment(entry.id, { autorName: 'Fremd', text: 'Hallo' }, otherCookie)).status, 404)
    const [listed] = await listEntries()
    const del = await call(base, `/api/timeline/${entry.id}/comments/${listed.comments[0].id}`, { method: 'DELETE', cookie: otherCookie })
    assert.equal(del.status, 404)
    assert.equal((await listEntries())[0].comments.length, 2)
  })

  await t.test('a comment can be deleted, but only through its own entry', async () => {
    const other = await newEntry('Zweiter Eintrag')
    const [listed] = await listEntries()
    const target = listed.comments[0]
    const wrongEntry = await call(base, `/api/timeline/${other.id}/comments/${target.id}`, { method: 'DELETE', cookie })
    assert.equal(wrongEntry.status, 404)
    const del = await call(base, `/api/timeline/${entry.id}/comments/${target.id}`, { method: 'DELETE', cookie })
    assert.equal(del.status, 204)
    assert.equal((await listEntries())[0].comments.length, 1)
  })

  await t.test('recent activity counts comments', async () => {
    const { data } = await call(base, '/api/timeline/recent', { cookie })
    assert.equal(data.find((e) => e.id === entry.id).comment_count, 1)
  })

  await t.test('deleting the entry or the dog removes its comments', async () => {
    const doomed = await newEntry('Wird gelöscht')
    await comment(doomed.id, { autorName: 'Tom', text: 'Weg damit' })
    assert.equal((await call(base, `/api/timeline/${doomed.id}`, { method: 'DELETE', cookie })).status, 204)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entry_comments WHERE entry_id = ?').get(doomed.id).n, 0)

    assert.equal((await call(base, `/api/dogs/${dog.id}`, { method: 'DELETE', cookie })).status, 204)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entry_comments').get().n, 0)
  })

  await t.test('demo packs stay read-only for comments too', async () => {
    const demo = await createFamily(base, 'Rudel Demo', 'demo-passwort')
    const demoDog = (await call(base, '/api/dogs', { method: 'POST', cookie: demo.cookie, body: { name: 'Demo', geschlecht: 'ruede' } })).data
    const demoEntry = (
      await call(base, '/api/timeline', {
        method: 'POST',
        cookie: demo.cookie,
        body: { dogId: demoDog.id, autorName: 'Anna', datum: '2026-01-01', titel: 'Demo' }
      })
    ).data
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    assert.equal((await comment(demoEntry.id, { autorName: 'Gast', text: 'Hallo' }, demo.cookie)).status, 403)
  })
})
