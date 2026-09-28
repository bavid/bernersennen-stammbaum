const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

// Kleine Limits, damit die Tests sie schnell erreichen
const dataDir = useTempDataDir('abuse', { API_RATE_LIMIT: '40', WRITE_RATE_LIMIT: '5', MIN_FREE_DISK_MB: '0' })

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return { status: res.status, data: await res.json() }
}

test('spam and flood protection', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const a = await createFamily(base, 'Rudel A', 'passwortA')

  // Registrierung (POST /api/families) und ihr Honeypot gibt es seit Phase 1 nicht mehr - Duplikat-
  // Passwort bleibt bei /api/families/group testbar (context.test.js), der Honeypot beim Einlösen
  // eines Gutscheins (vouchers.test.js).

  await t.test('login ignores the honeypot – password managers autofill it with the saved username', async () => {
    const login = await call(base, '/api/login', { method: 'POST', body: { password: 'passwortA', website: 'Rudel A' } })
    assert.equal(login.status, 200)
  })

  await t.test('writes per pack are rate limited', async () => {
    const statuses = []
    for (let i = 0; i < 7; i += 1) {
      const res = await call(base, '/api/notes', { method: 'POST', cookie: a.cookie, body: { autorName: 'X', text: `Spam ${i}` } })
      statuses.push(res.status)
    }
    assert.deepEqual(statuses.slice(0, 5), [201, 201, 201, 201, 201])
    assert.equal(statuses[6], 429)
  })

  await t.test('uploads stop when the disk is nearly full', async () => {
    process.env.MIN_FREE_DISK_MB = String(Number.MAX_SAFE_INTEGER)
    const res = await uploadPng(base, a.cookie)
    assert.equal(res.status, 507)
    process.env.MIN_FREE_DISK_MB = '0'
  })

  await t.test('the whole API is rate limited per IP', async () => {
    let limited = false
    for (let i = 0; i < 60 && !limited; i += 1) {
      limited = (await call(base, '/api/me', { cookie: a.cookie })).status === 429
    }
    assert.ok(limited, 'expected a 429 after exceeding API_RATE_LIMIT')
  })

  await t.test('health checks are never rate limited', async () => {
    assert.equal((await call(base, '/health')).status, 200)
  })
})
