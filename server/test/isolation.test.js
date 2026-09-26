const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

const dataDir = useTempDataDir('isolation')

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

test('families cannot see or use each other’s dogs by changing ids', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const a = await createFamily(base, 'Rudel A', 'passwortA')
  const b = await createFamily(base, 'Rudel B', 'passwortB')
  const dogA = (await call(base, '/api/dogs', { method: 'POST', cookie: a.cookie, body: { name: 'Geheim', geschlecht: 'huendin' } })).data
  const photo = await uploadPng(base, a.cookie)

  await t.test('a foreign dog is "not found", not visible', async () => {
    const res = await call(base, `/api/dogs/${dogA.id}`, { cookie: b.cookie })
    assert.equal(res.status, 404)
    assert.equal(res.data.name, undefined)
  })

  await t.test('the parent picker only lists own dogs', async () => {
    const { data } = await call(base, '/api/dogs/all', { cookie: b.cookie })
    assert.deepEqual(data, [])
  })

  await t.test('foreign dogs cannot be linked as parents', async () => {
    const res = await call(base, '/api/dogs', {
      method: 'POST',
      cookie: b.cookie,
      body: { name: 'Kind', geschlecht: 'ruede', motherDogId: dogA.id }
    })
    assert.equal(res.status, 400)
  })

  await t.test('foreign dogs cannot be edited or deleted (and do not reveal they exist)', async () => {
    const put = await call(base, `/api/dogs/${dogA.id}`, { method: 'PUT', cookie: b.cookie, body: { name: 'X' } })
    const del = await call(base, `/api/dogs/${dogA.id}`, { method: 'DELETE', cookie: b.cookie })
    assert.equal(put.status, 404)
    assert.equal(del.status, 404)
  })

  await t.test('photos require a login', async () => {
    const anonymous = await fetch(`${base}${photo}`)
    assert.equal(anonymous.status, 401)
    const loggedIn = await fetch(`${base}${photo}`, { headers: { Cookie: a.cookie } })
    assert.equal(loggedIn.status, 200)
    assert.match(loggedIn.headers.get('cache-control'), /private/)
  })
})
