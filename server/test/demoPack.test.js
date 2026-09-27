const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const dataDir = useTempDataDir('demopack')

test('public demo pack: full content, replaced safely', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')

  // Ein echtes Rudel, das beim Ersetzen der Demo niemals angefasst werden darf
  const real = await createFamily(base, 'Echtes Rudel', 'echtes-passwort')
  await call(base, '/api/dogs', { method: 'POST', cookie: real.cookie, body: { name: 'Bleibt', geschlecht: 'ruede' } })

  replaceDemoPack(db, uploadDir)
  const firstUploads = fs.readdirSync(uploadDir).length
  const { removed } = replaceDemoPack(db, uploadDir)

  await t.test('replacing removes only the old demo and its photos', async () => {
    assert.equal(removed.length, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM families WHERE is_demo = 1').get().n, 1)
    assert.equal(fs.readdirSync(uploadDir).length, firstUploads, 'no orphaned demo photos pile up')
    const realDogs = await call(base, '/api/dogs', { cookie: real.cookie })
    assert.deepEqual(realDogs.data.map((d) => d.name), ['Bleibt'])
  })

  const demoLogin = await call(base, '/api/demo', { method: 'POST' })
  const demo = getCookie(demoLogin.res)

  await t.test('visitors get in without a password', () => {
    assert.equal(demoLogin.status, 200)
    assert.equal(demoLogin.data.isDemo, true)
  })

  await t.test('the demo shows every feature', async () => {
    const dogs = (await call(base, '/api/dogs', { cookie: demo })).data
    assert.ok(dogs.length >= 15, `${dogs.length} Tiere`)
    assert.ok(dogs.some((d) => d.name_unbekannt), 'unknown ancestors')
    assert.ok(dogs.some((d) => d.tierart === 'katze') && dogs.some((d) => d.tierart === 'anderes'), 'cats and other animals')
    assert.ok(dogs.some((d) => d.mother_dog_id && d.father_dog_id), 'known parent pairs')
    assert.ok(dogs.some((d) => d.mother_dog_id && d.father_freitext), 'parents from outside the pack')
    assert.ok(dogs.every((d) => d.foto_url), 'every animal has a picture')
    assert.ok((await call(base, '/api/dogs/links', { cookie: demo })).data.length >= 3, 'housemates')

    const entries = (await call(base, '/api/timeline', { cookie: demo })).data
    assert.ok(entries.some((e) => e.comments.length > 0), 'comments')
    assert.ok(entries.some((e) => e.foto_urls.length > 0), 'photos in the chronicle')
    const notes = (await call(base, '/api/notes', { cookie: demo })).data
    assert.ok(notes.some((n) => n.replies.length > 0) && notes.some((n) => n.termin_datum), 'pinboard with replies and dates')
    assert.ok((await call(base, '/api/breeding', { cookie: demo })).data.length >= 3, 'breeding book')
  })

  await t.test('the demo stays read-only', async () => {
    const res = await call(base, '/api/dogs', { method: 'POST', cookie: demo, body: { name: 'Neu', geschlecht: 'ruede' } })
    assert.equal(res.status, 403)
  })
})
