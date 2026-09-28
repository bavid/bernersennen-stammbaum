const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { once } = require('node:events')
const bcrypt = require('bcryptjs')

const BCRYPT_ROUNDS = 10

// Muss vor dem ersten require von config/db/app aufgerufen werden.
function useTempDataDir(name, extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `chronik-${name}-`))
  process.env.DATA_DIR = dir
  process.env.JWT_SECRET = 'test-secret'
  delete process.env.DB_PATH
  Object.assign(process.env, extraEnv)
  return dir
}

async function startApp() {
  const { createApp } = require('../app')
  const server = createApp().listen(0)
  await once(server, 'listening')
  return { server, base: `http://localhost:${server.address().port}` }
}

function cleanup(dir, server) {
  server?.close()
  require('../db').close()
  fs.rmSync(dir, { recursive: true, force: true })
}

function getCookie(res) {
  return (res.headers.get('set-cookie') || '').split(';')[0]
}

async function call(base, urlPath, { method = 'GET', body, cookie } = {}) {
  const headers = {}
  if (cookie) headers.Cookie = cookie
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  return { status: res.status, headers: res.headers, data: text ? JSON.parse(text) : null, res }
}

// Legt eine Alt-Familie DIREKT in der DB an (bcrypt-Hash, legacy_password = 1) und meldet sie danach
// per /api/login an - seit Phase 1 gibt es keine Registrierung (POST /api/families) mehr, jede echte
// Familie entsteht per Gutschein (siehe createHousehold). Die Rückgabe imitiert bewusst die alte
// Registrierungsantwort (status 201, buildMe-Form in "data"), damit die ganz überwiegende Mehrheit der
// bestehenden Tests - denen es nur um eine funktionierende Familie mit Login geht, nicht um die
// Registrierung selbst - unverändert weiterläuft.
async function createFamily(base, name, password, extra = {}) {
  const db = require('../db')
  const { art = 'rudel', quelle = null } = extra
  const passwordHash = bcrypt.hashSync(password, BCRYPT_ROUNDS)
  db.prepare('INSERT INTO families (name, password_hash, art, quelle, legacy_password) VALUES (?, ?, ?, ?, 1)').run(
    name,
    passwordHash,
    art,
    quelle
  )
  const login = await call(base, '/api/login', { method: 'POST', body: { password } })
  return { status: 201, data: login.data, headers: login.headers, cookie: getCookie(login.res), res: login.res }
}

// Legt per lib/vouchers.createBatch einen Gutschein an und löst ihn sofort über die API ein - so
// entsteht ein echtes, per Schlüssel angemeldetes Zuhause ("Meine Chronik"), wie es die Anwendung nach
// Phase 1 tatsächlich anlegt (anders als createFamily, das eine Alt-Familie mit Passwort simuliert).
// { username, password } ist optional und legt gleich einen eigenen Benutzer-Login dafür an.
async function createHousehold(base, name, { username, password } = {}) {
  const db = require('../db')
  const { createBatch } = require('../lib/vouchers')
  const { codes } = createBatch(db, { label: 'Test-Gutschein', kind: 'admin', size: 1 })
  const body = { code: codes[0], name, ...(username ? { username, password } : {}) }
  const result = await call(base, '/api/vouchers/redeem', { method: 'POST', body })
  return { ...result, cookie: getCookie(result.res), key: result.data?.key ?? null }
}

module.exports = { useTempDataDir, startApp, cleanup, getCookie, call, createFamily, createHousehold }
