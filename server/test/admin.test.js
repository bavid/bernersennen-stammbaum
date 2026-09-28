const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const ADMIN_TEST_PASSWORD = 'admin-test-passwort'
const dataDir = useTempDataDir('admin')

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

test('admin sees everything, but only with the admin login', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  // Erst nach ADMIN_PASSWORD_HASH und startApp() requiren - sonst cacht Node das Modul mit den
  // falschen (Default-)Werten, bevor die Testumgebung steht.
  const config = require('../config')
  t.after(() => cleanup(dataDir, server))

  const a = await createFamily(base, 'Rudel A', 'passwortA', { quelle: 'Hundeschule Musterstadt' })
  await createFamily(base, 'Rudel B', 'passwortB')
  const dog = (await call(base, '/api/dogs', { method: 'POST', cookie: a.cookie, body: { name: 'Hermes', geschlecht: 'ruede', rasse: 'Berner-Mix' } })).data
  await call(base, '/api/timeline', { method: 'POST', cookie: a.cookie, body: { dogId: dog.id, autorName: 'D', datum: '2026-06-01', titel: 'See' } })
  const note = (await call(base, '/api/notes', { method: 'POST', cookie: a.cookie, body: { autorName: 'D', text: 'Treffen?' } })).data
  await call(base, `/api/notes/${note.id}/replies`, { method: 'POST', cookie: a.cookie, body: { autorName: 'S', text: 'Ja!' } })
  const photo = await uploadPng(base, a.cookie)

  const login = (username, password) => call(base, '/api/admin/login', { method: 'POST', body: { username, password } })
  let adminCookie

  await t.test('rejects wrong username or password', async () => {
    assert.equal((await login('admin', 'falsch')).status, 401)
    assert.equal((await login('root', ADMIN_TEST_PASSWORD)).status, 401)
  })

  await t.test('logs in with the configured credentials', async () => {
    const res = await login('admin', ADMIN_TEST_PASSWORD)
    assert.equal(res.status, 200)
    adminCookie = getCookie(res.res)
    // Cookie-Name ist an das Testumfeld gekoppelt (dev_admin_session, staging_admin_session, ...) - siehe config.adminCookie
    assert.ok(adminCookie.startsWith(`${config.adminCookie}=`), `expected ${config.adminCookie}=..., got ${adminCookie}`)
    assert.match(res.headers.get('set-cookie'), /HttpOnly/i)
  })

  await t.test('overview lists all packs with counts', async () => {
    const { status, data } = await call(base, '/api/admin/overview', { cookie: adminCookie })
    assert.equal(status, 200)
    assert.equal(data.stats.families, 2)
    const rudelA = data.families.find((f) => f.name === 'Rudel A')
    assert.deepEqual([rudelA.dogs, rudelA.entries, rudelA.notes, rudelA.replies], [1, 1, 1, 1])
    assert.ok(rudelA.last_activity)
    assert.equal(rudelA.quelle, 'Hundeschule Musterstadt')
  })

  await t.test('pack details include dogs, entries and notes with replies', async () => {
    const { data } = await call(base, `/api/admin/families/${a.data.id}`, { cookie: adminCookie })
    assert.equal(data.dogs[0].rasse, 'Berner-Mix')
    assert.equal(data.entries[0].dog_name, 'Hermes')
    assert.equal(data.notes[0].replies[0].text, 'Ja!')
  })

  await t.test('admin can view photos', async () => {
    const res = await fetch(`${base}${photo}`, { headers: { Cookie: adminCookie } })
    assert.equal(res.status, 200)
  })

  await t.test('family sessions are not admin sessions and vice versa', async () => {
    assert.equal((await call(base, '/api/admin/overview', { cookie: a.cookie })).status, 401)
    assert.equal((await call(base, '/api/admin/overview')).status, 401)
    assert.equal((await call(base, '/api/dogs', { cookie: adminCookie })).status, 401)
  })
})
