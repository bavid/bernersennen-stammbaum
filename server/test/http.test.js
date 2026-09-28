const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { once } = require('node:events')
const { safeFetchJson, isForbiddenIp, isLoopbackIp } = require('../lib/http')

// Startet einen einfachen lokalen HTTP-Server auf 127.0.0.1 mit einem festen Port-0 (frei wählbar) -
// nur für diese Tests, nie eine echte externe Anfrage (siehe Vorgabe: Tests fragen nie echte externe
// Dienste ab).
async function startLocalServer(handler) {
  const server = http.createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return { server, port: server.address().port }
}

test('isForbiddenIp/isLoopbackIp: private, loopback und link-local Bereiche werden erkannt', () => {
  assert.equal(isForbiddenIp('10.0.0.5'), true)
  assert.equal(isForbiddenIp('172.16.5.1'), true)
  assert.equal(isForbiddenIp('172.31.255.255'), true)
  assert.equal(isForbiddenIp('192.168.1.1'), true)
  assert.equal(isForbiddenIp('127.0.0.1'), true)
  assert.equal(isForbiddenIp('169.254.1.1'), true)
  assert.equal(isForbiddenIp('::1'), true)
  assert.equal(isForbiddenIp('fc00::1'), true)
  assert.equal(isForbiddenIp('fe80::1'), true)
  // IPv4-mapped IPv6: wie die eingebettete IPv4-Adresse behandeln
  assert.equal(isForbiddenIp('::ffff:127.0.0.1'), true)
  assert.equal(isForbiddenIp('::ffff:10.0.0.1'), true)
  assert.equal(isForbiddenIp('::ffff:203.0.113.42'), false)

  assert.equal(isForbiddenIp('203.0.113.42'), false)
  assert.equal(isForbiddenIp('2001:db8::1'), false)

  assert.equal(isLoopbackIp('127.0.0.1'), true)
  assert.equal(isLoopbackIp('::1'), true)
  assert.equal(isLoopbackIp('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackIp('10.0.0.1'), false)
})

test('safeFetchJson: privater Host (localhost/127.0.0.1) ohne Test-Flag scheitert', async () => {
  await assert.rejects(
    safeFetchJson('http://127.0.0.1:1/x', { allowHosts: ['127.0.0.1'] }),
    /https/i
  )
  await assert.rejects(
    safeFetchJson('https://localhost/x', { allowHosts: ['localhost'] })
  )
})

test('safeFetchJson: Host nicht in der Allowlist scheitert', async () => {
  await assert.rejects(safeFetchJson('https://overpass-api.de/api/interpreter', { allowHosts: ['example.org'] }), /erlaubt/i)
})

test('safeFetchJson: erfolgreiche Anfrage über den lokalen Testserver (Test-Flag)', async (t) => {
  const { server, port } = await startLocalServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, host: req.headers.host, ua: req.headers['user-agent'] }))
  })
  t.after(() => server.close())

  const data = await safeFetchJson(`http://127.0.0.1:${port}/x`, { allowHosts: ['127.0.0.1'], allowLocalHttp: true })
  assert.equal(data.ok, true)
  // Host-Header entspricht dem Hostnamen aus der URL (hier zufällig identisch mit der Verbindungs-IP,
  // siehe http.test für die eigentliche DNS-Pinning-Absicherung)
  assert.equal(data.host, `127.0.0.1:${port}`)
  assert.match(data.ua, /^FamilieAufPfotenBot\/1\.0 \(\+https:\/\//)
})

test('safeFetchJson: Weiterleitung (3xx) wird abgelehnt', async (t) => {
  const { server, port } = await startLocalServer((req, res) => {
    res.writeHead(302, { Location: 'https://example.org/anders' })
    res.end()
  })
  t.after(() => server.close())

  await assert.rejects(
    safeFetchJson(`http://127.0.0.1:${port}/x`, { allowHosts: ['127.0.0.1'], allowLocalHttp: true }),
    /weiterleitung/i
  )
})

test('safeFetchJson: zu große Antwort wird abgebrochen', async (t) => {
  const { server, port } = await startLocalServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.write('['.repeat(2000))
    // Server hält die Verbindung offen, statt sofort zu enden, damit der Client die Größe erkennt,
    // bevor der Server von sich aus schließt.
    setTimeout(() => res.end(']'), 500)
  })
  t.after(() => server.close())

  await assert.rejects(
    safeFetchJson(`http://127.0.0.1:${port}/x`, { allowHosts: ['127.0.0.1'], allowLocalHttp: true, maxBytes: 100 }),
    /groß/i
  )
})

test('safeFetchJson: Zeitüberschreitung bei einem hängenden Server', async (t) => {
  const { server, port } = await startLocalServer((req, res) => {
    // Antwortet absichtlich nie
  })
  t.after(() => server.close())

  await assert.rejects(
    safeFetchJson(`http://127.0.0.1:${port}/x`, { allowHosts: ['127.0.0.1'], allowLocalHttp: true, timeoutMs: 200 }),
    /zeitüberschreitung/i
  )
})
