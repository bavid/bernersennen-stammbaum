const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const dataDir = useTempDataDir('messages')

test('"Schreib dem Admin": packs send, admin reads and resolves', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword('admin-test-passwort')
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const a = await createFamily(base, 'Rudel A', 'passwortA')
  const b = await createFamily(base, 'Rudel B', 'passwortB')
  const send = (cookie, body) => call(base, '/api/messages', { method: 'POST', cookie, body })
  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: 'admin-test-passwort' } })
  const admin = getCookie(login.res)

  await t.test('sends feedback and problem reports', async () => {
    const feedback = await send(a.cookie, { type: 'feedback', autorName: 'Clara', text: 'Tolle Idee!', contact: 'clara@example.org' })
    assert.equal(feedback.status, 201)
    assert.deepEqual(feedback.data, { sent: true }, 'the answer does not echo the message back')
    const problem = await send(b.cookie, { type: 'problem', autorName: 'Anna', text: 'Upload hängt', page: '/hund/3' })
    assert.equal(problem.status, 201)
  })

  await t.test('the name is optional – messages can be anonymous', async () => {
    assert.equal((await send(a.cookie, { type: 'feedback', text: 'Anonymer Hinweis' })).status, 201)
    assert.equal((await send(a.cookie, { type: 'feedback', autorName: '   ', text: 'Noch einer' })).status, 201)
  })

  await t.test('validates type and text', async () => {
    assert.equal((await send(a.cookie, { type: 'spam', autorName: 'X', text: 'y' })).status, 400)
    assert.equal((await send(a.cookie, { type: 'feedback', autorName: 'X', text: ' ' })).status, 400)
    assert.equal((await send('', { type: 'feedback', autorName: 'X', text: 'y' })).status, 401)
  })

  await t.test('packs cannot read messages back – only the admin sees them', async () => {
    const list = await call(base, '/api/messages', { cookie: a.cookie })
    assert.equal(list.status, 404)
    assert.equal(JSON.stringify(list.data).includes('Tolle Idee'), false)
  })

  await t.test('admin sees all messages with pack, contact, page and browser', async () => {
    const { data } = await call(base, '/api/admin/messages', { cookie: admin })
    assert.equal(data.length, 4)
    assert.equal(data.filter((m) => m.autor_name === '').length, 2, 'anonymous messages are stored without a name')
    const problem = data.find((m) => m.type === 'problem')
    assert.equal(problem.family_name, 'Rudel B')
    assert.equal(problem.page, '/hund/3')
    assert.ok(problem.user_agent)
    assert.equal(data.find((m) => m.autor_name === 'Clara').contact, 'clara@example.org')

    const onlyProblems = await call(base, '/api/admin/messages?type=problem', { cookie: admin })
    assert.deepEqual(onlyProblems.data.map((m) => m.type), ['problem'])

    const overview = await call(base, '/api/admin/overview', { cookie: admin })
    assert.equal(overview.data.stats.openMessages, 4)
  })

  await t.test('admin resolves, reopens and deletes', async () => {
    const { data } = await call(base, '/api/admin/messages', { cookie: admin })
    const feedback = data.find((m) => m.autor_name === 'Clara')
    const patch = (status) => call(base, `/api/admin/messages/${feedback.id}`, { method: 'PATCH', cookie: admin, body: { status } })

    const done = await patch('erledigt')
    assert.equal(done.data.status, 'erledigt')
    assert.ok(done.data.resolved_at)

    const reopened = await patch('offen')
    assert.equal(reopened.data.resolved_at, null)
    assert.equal((await patch('weg')).status, 400)

    assert.equal((await call(base, `/api/admin/messages/${feedback.id}`, { method: 'DELETE', cookie: admin })).status, 204)
    assert.equal((await call(base, `/api/admin/messages/${feedback.id}`, { method: 'DELETE', cookie: admin })).status, 404)
  })

  await t.test('packs cannot use the admin message endpoints', async () => {
    assert.equal((await call(base, '/api/admin/messages', { cookie: a.cookie })).status, 401)
  })
})
