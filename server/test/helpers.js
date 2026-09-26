const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { once } = require('node:events')

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

async function createFamily(base, name, password, extra = {}) {
  const result = await call(base, '/api/families', { method: 'POST', body: { name, password, ...extra } })
  return { ...result, cookie: getCookie(result.res) }
}

module.exports = { useTempDataDir, startApp, cleanup, getCookie, call, createFamily }
