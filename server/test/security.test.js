const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const dataDir = useTempDataDir('security', { FAMILY_INVITE_CODE: 'berner-2026', UPLOAD_RATE_LIMIT: '3' })
const clientDist = path.join(dataDir, 'dist')
fs.mkdirSync(clientDist)
fs.writeFileSync(path.join(clientDist, 'index.html'), '<!doctype html><title>Chronik</title>')
process.env.CLIENT_DIST = clientDist
// Erst alle env-Overrides setzen, dann config requiren - sonst cacht Node das Modul mit den
// falschen (Default-)Werten, bevor die Testumgebung steht.
const config = require('../config')

async function uploadFile(base, cookie, { type, name, bytes }) {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), name)
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return { status: res.status, data: await res.json() }
}

test('security and deployment behaviour', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  let cookie

  await t.test('family creation requires the invite code when configured', async () => {
    const config = await call(base, '/api/config')
    assert.equal(config.data.inviteRequired, true)

    const without = await createFamily(base, 'Rudel X', 'geheim123')
    assert.equal(without.status, 403)

    const withCode = await createFamily(base, 'Rudel X', 'geheim123', { inviteCode: 'berner-2026' })
    assert.equal(withCode.status, 201)
    cookie = withCode.cookie
  })

  await t.test('members can look up the invite code to pass it on, strangers cannot', async () => {
    const member = await call(base, '/api/invite', { cookie })
    assert.equal(member.status, 200)
    assert.equal(member.data.inviteCode, 'berner-2026')
    const stranger = await call(base, '/api/invite')
    assert.equal(stranger.status, 401)
  })

  await t.test('rejects short and duplicate passwords', async () => {
    const short = await createFamily(base, 'Rudel Y', '123', { inviteCode: 'berner-2026' })
    assert.equal(short.status, 400)

    const duplicate = await createFamily(base, 'Rudel Y', 'geheim123', { inviteCode: 'berner-2026' })
    assert.equal(duplicate.status, 409)
  })

  await t.test('session cookie is httpOnly', async () => {
    const res = await call(base, '/api/login', { method: 'POST', body: { password: 'geheim123' } })
    assert.equal(res.status, 200)
    assert.match(res.headers.get('set-cookie'), /HttpOnly/i)
    // Cookie-Name ist an das Testumfeld gekoppelt (dev_session, staging_session, ...) - siehe config.sessionCookie
    assert.ok(getCookie(res.res).startsWith(`${config.sessionCookie}=`), `expected ${config.sessionCookie}=..., got ${getCookie(res.res)}`)
  })

  await t.test('upload rejects non-image types', async () => {
    const html = await uploadFile(base, cookie, { type: 'text/html', name: 'x.html', bytes: '<script>1</script>' })
    assert.equal(html.status, 400)

    const svg = await uploadFile(base, cookie, { type: 'image/svg+xml', name: 'x.svg', bytes: '<svg/>' })
    assert.equal(svg.status, 400)
  })

  await t.test('upload names files by mime type, never by client filename', async () => {
    const png = await uploadFile(base, cookie, { type: 'image/png', name: 'evil.html', bytes: 'PNGDATA' })
    assert.equal(png.status, 201)
    assert.match(png.data.url, /^\/uploads\/[\w-]+\.png$/)

    const served = await fetch(`${base}${png.data.url}`, { headers: { Cookie: cookie } })
    assert.equal(served.status, 200)
    assert.equal(served.headers.get('x-content-type-options'), 'nosniff')
  })

  await t.test('uploads are rate limited per family', async () => {
    const statuses = []
    for (let i = 0; i < 3; i += 1) {
      statuses.push((await uploadFile(base, cookie, { type: 'image/png', name: 'a.png', bytes: 'x' })).status)
    }
    assert.ok(statuses.includes(429), `expected a 429 after the limit, got ${statuses}`)
  })

  await t.test('upload requires a session', async () => {
    const res = await uploadFile(base, '', { type: 'image/png', name: 'a.png', bytes: 'x' })
    assert.equal(res.status, 401)
  })

  await t.test('health, SPA fallback and api 404', async () => {
    const health = await call(base, '/health')
    assert.deepEqual(health.data, { status: 'ok' })

    const spa = await fetch(`${base}/hund/42`)
    assert.equal(spa.status, 200)
    assert.match(await spa.text(), /Chronik/)

    const missing = await call(base, '/api/gibtsnicht')
    assert.equal(missing.status, 404)
  })
})
