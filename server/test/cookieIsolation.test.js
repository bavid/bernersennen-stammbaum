const test = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const ADMIN_TEST_PASSWORD = 'admin-test-passwort'
const dataDir = useTempDataDir('cookie-isolation', { APP_ENV: 'staging' })

// Vorschau und Prod laufen auf derselben IP, nur der Port unterscheidet sich - Browser scopen Cookies
// aber nicht nach Port. Ohne Präfix würde ein Login auf der Vorschau die Prod-Sitzung überschreiben.
test('cookies are namespaced per instance so the preview never touches a prod session', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const config = require('../config')

  await t.test('config derives distinct cookie names for the staging instance', () => {
    assert.equal(config.appEnv, 'staging')
    assert.equal(config.sessionCookie, 'staging_session')
    assert.equal(config.adminCookie, 'staging_admin_session')
  })

  const family = await createFamily(base, 'Rudel Vorschau', 'passwortA')

  await t.test('the family login response sets the namespaced session cookie', () => {
    assert.ok(family.cookie.startsWith('staging_session='), `expected staging_session=..., got ${family.cookie}`)
  })

  await t.test('a request that only carries a plain, unprefixed session cookie is not authenticated', async () => {
    // Simuliert ein Prod-Token (gleiche Signatur, aber ohne Präfix), das im selben Browser landet
    const prodStyleToken = jwt.sign({ familyId: family.data.id }, config.jwtSecret, { expiresIn: '30d' })
    const res = await call(base, '/api/dogs', { cookie: `session=${prodStyleToken}` })
    assert.equal(res.status, 401)
  })

  await t.test('the namespaced cookie itself works', async () => {
    const res = await call(base, '/api/dogs', { cookie: family.cookie })
    assert.equal(res.status, 200)
  })

  let adminCookie
  await t.test('admin login sets the namespaced admin cookie', async () => {
    const res = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
    assert.equal(res.status, 200)
    adminCookie = getCookie(res.res)
    assert.ok(adminCookie.startsWith('staging_admin_session='), `expected staging_admin_session=..., got ${adminCookie}`)
  })

  await t.test('a plain, unprefixed admin_session cookie is not accepted', async () => {
    const prodStyleAdminToken = jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: '12h' })
    const res = await call(base, '/api/admin/overview', { cookie: `admin_session=${prodStyleAdminToken}` })
    assert.equal(res.status, 401)
  })

  await t.test('the namespaced admin cookie itself works', async () => {
    const res = await call(base, '/api/admin/overview', { cookie: adminCookie })
    assert.equal(res.status, 200)
  })
})
