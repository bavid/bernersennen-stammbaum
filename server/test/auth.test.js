const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const testDbPath = path.join(__dirname, 'auth.test.tmp.db')
process.env.DB_PATH = testDbPath
process.env.JWT_SECRET = 'test-secret'

const express = require('express')
const cookieParser = require('cookie-parser')
const bcrypt = require('bcryptjs')
const authRoutes = require('../routes/auth')
const { requireAuth } = require('../middleware/auth')
const db = require('../db')
const config = require('../config')

test.after(() => {
  db.close()
  for (const suffix of ['', '-wal', '-shm']) {
    const file = testDbPath + suffix
    if (fs.existsSync(file)) fs.unlinkSync(file)
  }
})

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use('/api', authRoutes)
  app.get('/api/protected', requireAuth, (req, res) => res.json({ familyId: req.familyId }))
  return app
}

function getCookie(res) {
  const setCookie = res.headers.get('set-cookie') || ''
  return setCookie.split(';')[0]
}

test('login and session protection', async (t) => {
  const app = buildApp()
  const server = app.listen(0)
  const base = `http://localhost:${server.address().port}`

  // Seit Phase 1 gibt es keine Registrierung (POST /api/families) mehr - eine Alt-Familie entsteht
  // direkt in der DB (wie test/helpers.js' createFamily), danach normal per /api/login angemeldet.
  await t.test('a family logs in and gets a namespaced session cookie', async () => {
    db.prepare('INSERT INTO families (name, password_hash, legacy_password) VALUES (?, ?, 1)').run(
      'Familie Hermes',
      bcrypt.hashSync('geheim123', 10)
    )
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'geheim123' })
    })
    assert.equal(res.status, 200)
    // Cookie-Name ist an das Testumfeld gekoppelt (dev_session, staging_session, ...) - siehe config.sessionCookie
    assert.ok(getCookie(res).startsWith(`${config.sessionCookie}=`), `expected ${config.sessionCookie}=..., got ${getCookie(res)}`)
  })

  await t.test('logs in with the correct password', async () => {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'geheim123' })
    })
    assert.equal(res.status, 200)
    const cookie = getCookie(res)

    const protectedRes = await fetch(`${base}/api/protected`, {
      headers: { Cookie: cookie }
    })
    assert.equal(protectedRes.status, 200)
    const body = await protectedRes.json()
    assert.equal(typeof body.familyId, 'number')
  })

  await t.test('rejects an incorrect password', async () => {
    const res = await fetch(`${base}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'falsch' })
    })
    assert.equal(res.status, 401)
  })

  await t.test('rejects protected route without cookie', async () => {
    const res = await fetch(`${base}/api/protected`)
    assert.equal(res.status, 401)
  })

  server.close()
})
