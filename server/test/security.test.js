const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const dataDir = useTempDataDir('security', { UPLOAD_RATE_LIMIT: '3' })
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

  // Registrierung (POST /api/families) samt Einladungscode gibt es seit Phase 1 nicht mehr - siehe
  // access.test.js ("POST /api/families gibt es nicht mehr") und vouchers.test.js für die Validierung
  // beim Einlösen eines Gutscheins. Für die folgenden Tests reicht eine gewöhnliche Alt-Familie.
  const family = await createFamily(base, 'Familie Security', 'geheim123')
  const cookie = family.cookie

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

  // Phase G Task 2: ohne PUBLIC_URL bleibt alles wie bisher - kein HSTS (die App läuft auch per http://IP:PORT),
  // Cookies ohne Secure, relative Links.
  await t.test('ohne PUBLIC_URL: kein HSTS, Cookies ohne Secure, relative Links', async () => {
    const { absoluteUrl } = require('../lib/publicUrl')
    assert.equal(config.publicUrl, null)
    assert.equal(config.httpsPublicUrl, false)
    assert.equal(config.cookieSecure, false)
    assert.equal(absoluteUrl('/p/pfotenglueck'), '/p/pfotenglueck')

    const health = await fetch(`${base}/health`)
    assert.equal(health.headers.get('strict-transport-security'), null)

    const login = await call(base, '/api/login', { method: 'POST', body: { password: 'geheim123' } })
    assert.equal(login.status, 200)
    assert.doesNotMatch(login.headers.get('set-cookie'), /;\s*Secure/i)
  })

  await t.test('robots.txt kommt vor dem SPA-Fallback und nennt ohne PUBLIC_URL keine Sitemap', async () => {
    const robots = await fetch(`${base}/robots.txt`)
    assert.equal(robots.status, 200)
    assert.match(robots.headers.get('content-type'), /^text\/plain/)
    const text = await robots.text()
    assert.doesNotMatch(text, /Chronik/, 'nicht die index.html des Clients')
    assert.match(text, /^User-agent: \*\n/)
    assert.match(text, /^Disallow: \/api\/$/m)
    assert.match(text, /^Disallow: \/t\/$/m)
    assert.doesNotMatch(text, /Sitemap:/)

    // Ohne absolute Adresse gibt es keine gültige Sitemap - 404 statt relativer Pfade
    const sitemap = await fetch(`${base}/sitemap.xml`)
    assert.equal(sitemap.status, 404)
  })
})
