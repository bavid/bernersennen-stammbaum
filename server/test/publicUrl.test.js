const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// Phase G Task 2: mit gesetzter https-PUBLIC_URL baut die App absolute Links (Sitemap, Bot-User-Agent),
// schaltet HSTS und Secure-Cookies ein und nennt in robots.txt die Sitemap. APP_ENV=production, damit
// Demo-Partner wie für anonyme Besucher in Produktion NICHT sichtbar sind (routes/partners.js demoAllowed).
const PUBLIC_URL = 'https://chronik.example.org'
const ADMIN_TEST_PASSWORD = 'admin-test-domain-passwort-1'
const dataDir = useTempDataDir('publicUrl', {
  // Mit abschließendem Schrägstrich, um die Normalisierung zu prüfen
  PUBLIC_URL: `${PUBLIC_URL}/`,
  APP_ENV: 'production',
  LOGIN_RATE_LIMIT: '300'
})

// config cacht ADMIN_PASSWORD_HASH beim ersten require - darum hier vor allen Tests setzen und config erst in
// den Tests requiren (sonst bleibt der Admin-Login abgeschaltet, siehe admin-disabled.test.js).
test.before(async () => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
})

const HSTS_HEADER = 'max-age=31536000'

const EXPECTED_ROBOTS = [
  'User-agent: *',
  'Allow: /',
  'Allow: /p/',
  'Disallow: /api/',
  'Disallow: /admin',
  'Disallow: /v',
  'Disallow: /t/',
  'Disallow: /uploads/',
  'Disallow: /public-media/',
  'Disallow: /partner-media/',
  `Sitemap: ${PUBLIC_URL}/sitemap.xml`,
  ''
].join('\n')

async function startLocalServer(handler) {
  const server = http.createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, port: server.address().port }
}

function insertPartner(db, { slug, status = 'aktiv', gesperrt = 0, isDemo = 0 }) {
  db.prepare('INSERT INTO partners (slug, name, typ, status, gesperrt, is_demo) VALUES (?, ?, ?, ?, ?, ?)').run(
    slug,
    `Partner ${slug}`,
    'hundeschule',
    status,
    gesperrt,
    isDemo
  )
}

function locs(xml) {
  return [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1])
}

test('config: PUBLIC_URL wird normalisiert und schaltet Secure-Cookies ein', () => {
  const config = require('../config')
  const { readPublicUrl, isHttpsUrl } = config
  assert.equal(config.publicUrl, PUBLIC_URL, 'abschließender Schrägstrich fällt weg')
  assert.equal(config.httpsPublicUrl, true)
  assert.equal(config.cookieSecure, true, 'auch ohne COOKIE_SECURE=true')

  assert.equal(readPublicUrl(undefined), null)
  assert.equal(readPublicUrl('   '), null)
  assert.equal(readPublicUrl(' https://a.example/// '), 'https://a.example')
  assert.equal(readPublicUrl('https://a.example/pfad/?x=1#oben'), 'https://a.example/pfad', 'Query und Fragment fallen weg')
  // Halbe Angaben zählen nicht - sonst gäbe es eine Sitemap mit kaputten Adressen, aber kein HSTS
  assert.equal(readPublicUrl('https://'), null)
  assert.equal(readPublicUrl('chronik.example.org'), null)
  assert.equal(readPublicUrl('ftp://a.example'), null)
  assert.equal(isHttpsUrl('https://a.example'), true)
  assert.equal(isHttpsUrl('HTTPS://a.example'), true)
  assert.equal(isHttpsUrl('http://a.example'), false)
  assert.equal(isHttpsUrl(null), false)
})

test('absoluteUrl hängt den Pfad an PUBLIC_URL', () => {
  const { absoluteUrl } = require('../lib/publicUrl')
  assert.equal(absoluteUrl('/p/pfotenglueck'), `${PUBLIC_URL}/p/pfotenglueck`)
  assert.equal(absoluteUrl('p/pfotenglueck'), `${PUBLIC_URL}/p/pfotenglueck`, 'fehlender Schrägstrich wird ergänzt')
  assert.equal(absoluteUrl(), `${PUBLIC_URL}/`)
})

test('Domain-Betrieb: HSTS, Secure-Cookies, robots.txt und sitemap.xml', async (t) => {
  const { server, base } = await startApp()
  const db = require('../db')
  t.after(() => cleanup(dataDir, server))

  await t.test('jede Antwort trägt Strict-Transport-Security ohne preload', async () => {
    for (const urlPath of ['/health', '/api/config', '/api/gibtsnicht', '/robots.txt']) {
      const res = await fetch(`${base}${urlPath}`)
      assert.equal(res.headers.get('strict-transport-security'), HSTS_HEADER, urlPath)
    }
  })

  await t.test('Sitzungs- und Admin-Cookie sind Secure', async () => {
    const family = await createFamily(base, 'Familie Domain', 'domain-passwort-1')
    assert.match(family.headers.get('set-cookie'), /;\s*Secure/i)
    assert.ok(family.cookie.startsWith('session='), 'Produktions-Instanz: Cookie ohne Präfix')

    const admin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
    assert.equal(admin.status, 200)
    assert.match(admin.headers.get('set-cookie'), /;\s*Secure/i)
    assert.ok(getCookie(admin.res).startsWith('admin_session='))
  })

  await t.test('robots.txt nennt die Sitemap', async () => {
    const res = await fetch(`${base}/robots.txt`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /^text\/plain/)
    assert.equal(await res.text(), EXPECTED_ROBOTS)
  })

  await t.test('sitemap.xml listet Startseite, Partnerseiten und nur sichtbare Portale', async () => {
    insertPartner(db, { slug: 'pfotenglueck' })
    insertPartner(db, { slug: 'entwurf-schule', status: 'entwurf' })
    insertPartner(db, { slug: 'pausierte-schule', status: 'pausiert' })
    insertPartner(db, { slug: 'gesperrte-schule', gesperrt: 1 })
    insertPartner(db, { slug: 'demo-schule', isDemo: 1 })

    const res = await fetch(`${base}/sitemap.xml`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /^application\/xml/)
    assert.equal(res.headers.get('cache-control'), 'public, max-age=600')
    const xml = await res.text()
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
    assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/)
    assert.deepEqual(locs(xml), [
      `${PUBLIC_URL}/`,
      `${PUBLIC_URL}/partner`,
      `${PUBLIC_URL}/partner-werden`,
      `${PUBLIC_URL}/p/pfotenglueck`
    ])
  })

  await t.test('sitemap.xml wird zehn Minuten im Speicher gehalten', async () => {
    const { sitemapXml, SITEMAP_TTL_MS } = require('../lib/sitemap')
    assert.equal(SITEMAP_TTL_MS, 10 * 60 * 1000)
    insertPartner(db, { slug: 'neue-schule' })

    const cached = await (await fetch(`${base}/sitemap.xml`)).text()
    assert.ok(!locs(cached).includes(`${PUBLIC_URL}/p/neue-schule`), 'innerhalb der 10 Minuten bleibt der alte Stand')

    const fresh = sitemapXml(Date.now() + SITEMAP_TTL_MS + 1)
    assert.ok(locs(fresh).includes(`${PUBLIC_URL}/p/neue-schule`), 'nach Ablauf wird neu gebaut')
  })

  await t.test('sitemap.xml maskiert XML-Sonderzeichen', () => {
    const { buildSitemapXml } = require('../lib/sitemap')
    const xml = buildSitemapXml(['https://a.example/?a=1&b=<2>'])
    assert.match(xml, /<loc>https:\/\/a\.example\/\?a=1&amp;b=&lt;2&gt;<\/loc>/)
  })

  await t.test('Bot-User-Agent nennt PUBLIC_URL als Infoadresse', async () => {
    const { safeFetchJson } = require('../lib/http')
    const local = await startLocalServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ua: req.headers['user-agent'] }))
    })
    t.after(() => local.server.close())
    const data = await safeFetchJson(`http://127.0.0.1:${local.port}/x`, { allowHosts: ['127.0.0.1'], allowLocalHttp: true })
    assert.equal(data.ua, `FamilieAufPfotenBot/1.0 (+${PUBLIC_URL}/bot)`)
  })
})
