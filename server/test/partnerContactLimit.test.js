const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Phase P2 Task 9: das Kontaktformular hat ein eigenes Limit von 5 Anfragen je Stunde und IP (Standardwert,
// CONTACT_RATE_LIMIT ist hier bewusst nicht gesetzt) - die 6. Anfrage bekommt 429, auch an einen anderen
// Partner. Eigene Datei, weil das Limit je Prozess gilt.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-contact-limit-1'
const dataDir = useTempDataDir('partner-contact-limit')

test('Kontaktformular: höchstens 5 Anfragen je Stunde und IP', async (t) => {
  delete process.env.CONTACT_RATE_LIMIT
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })

  const slugs = []
  for (const slug of ['limit-partner-eins', 'limit-partner-zwei']) {
    const partner = await post('/api/admin/partners', { name: slug, slug, typ: 'hundeschule', plz: '10115', status: 'aktiv', portalText: 'Kleine Gruppen, viel Geduld und jede Menge Leckerli für alle Hunde.' }, adminCookie)
    assert.equal(partner.status, 201)
    assert.equal((await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)).status, 201)
    slugs.push(slug)
  }

  const body = { email: 'limit@example.org', nachricht: 'Eine Anfrage, die das Limit testet.' }
  const statuses = []
  for (let i = 0; i < 5; i += 1) statuses.push((await post(`/api/public/partners/${slugs[0]}/contact`, body)).status)
  assert.deepEqual(statuses, [201, 201, 201, 201, 201])

  const sixth = await post(`/api/public/partners/${slugs[1]}/contact`, body)
  assert.equal(sixth.status, 429)
  assert.ok(sixth.data.error)
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_messages').get().n, 5)
})
