const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const dns = require('node:dns')
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

test('isForbiddenIp: zusätzliche reservierte/Sonder-Bereiche (SSRF-Härtung)', () => {
  // IPv4: "diese Adresse" (0/8), CGNAT (100.64/10), IETF-Protokolle (192.0.0/24), Benchmarking
  // (198.18/15), Multicast (224/4), reserviert (240/4), gerichtete Broadcast
  assert.equal(isForbiddenIp('0.0.0.0'), true)
  assert.equal(isForbiddenIp('0.5.5.5'), true)
  assert.equal(isForbiddenIp('100.64.0.1'), true)
  assert.equal(isForbiddenIp('100.127.255.255'), true)
  assert.equal(isForbiddenIp('100.63.255.255'), false) // knapp außerhalb von 100.64.0.0/10
  assert.equal(isForbiddenIp('192.0.0.5'), true)
  assert.equal(isForbiddenIp('198.18.0.1'), true)
  assert.equal(isForbiddenIp('198.19.255.255'), true)
  assert.equal(isForbiddenIp('224.0.0.1'), true)
  assert.equal(isForbiddenIp('240.0.0.1'), true)
  assert.equal(isForbiddenIp('255.255.255.255'), true)

  // IPv6: unspezifiziert, veraltetes IPv4-kompatibles ::/96, Multicast, NAT64, 6to4
  assert.equal(isForbiddenIp('::'), true)
  assert.equal(isForbiddenIp('::0.0.0.1'), true)
  assert.equal(isForbiddenIp('ff02::1'), true)
  assert.equal(isForbiddenIp('64:ff9b::203.0.113.1'), true)
  assert.equal(isForbiddenIp('2002::1'), true)
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

// --- DNS-Auflösung: mehrere Adressen, jede verbotene Adresse blockt die ganze Anfrage -------------

test('safeFetchJson: eine private Adresse unter mehreren aufgelösten Adressen blockt die ganze Anfrage', async (t) => {
  t.mock.method(dns.promises, 'lookup', async () => [
    { address: '203.0.113.5', family: 4 },
    { address: '10.0.0.1', family: 4 }
  ])

  await assert.rejects(
    safeFetchJson('https://example.org/x', { allowHosts: ['example.org'] }),
    /nicht erlaubt/i
  )
})

test('safeFetchJson: 0.0.0.0 als aufgelöste Adresse wird abgelehnt', async (t) => {
  t.mock.method(dns.promises, 'lookup', async () => [{ address: '0.0.0.0', family: 4 }])

  await assert.rejects(safeFetchJson('https://example.org/x', { allowHosts: ['example.org'] }), /nicht erlaubt/i)
})

test('safeFetchJson: :: als aufgelöste Adresse wird abgelehnt', async (t) => {
  t.mock.method(dns.promises, 'lookup', async () => [{ address: '::', family: 6 }])

  await assert.rejects(safeFetchJson('https://example.org/x', { allowHosts: ['example.org'] }), /nicht erlaubt/i)
})

test('safeFetchJson: 100.64.0.1 (CGNAT) als aufgelöste Adresse wird abgelehnt', async (t) => {
  t.mock.method(dns.promises, 'lookup', async () => [{ address: '100.64.0.1', family: 4 }])

  await assert.rejects(safeFetchJson('https://example.org/x', { allowHosts: ['example.org'] }), /nicht erlaubt/i)
})

// --- DNS-Pinning: es wird gegen die geprüfte Adresse verbunden, Host-Header/SNI bleiben der echte
// Hostname (siehe Dateikopf, DNS-Rebinding) ---------------------------------------------------------

test('safeFetchJson: verbindet zur geprüften (gemockten) Adresse, Host-Header trägt den echten Hostnamen samt Port', async (t) => {
  const { server, port } = await startLocalServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, host: req.headers.host }))
  })
  t.after(() => server.close())

  t.mock.method(dns.promises, 'lookup', async () => [{ address: '127.0.0.1', family: 4 }])

  const data = await safeFetchJson(`http://pinned.test:${port}/x`, { allowHosts: ['pinned.test'], allowLocalHttp: true })
  assert.equal(data.ok, true)
  assert.equal(data.host, `pinned.test:${port}`)
})

// --- Port-Pinning: außerhalb des Test-Flags ist ausschließlich Port 443 erlaubt --------------------

test('safeFetchJson: https mit abweichendem Port ohne allowLocalHttp wird abgelehnt', async (t) => {
  t.mock.method(dns.promises, 'lookup', async () => [{ address: '203.0.113.5', family: 4 }])

  await assert.rejects(safeFetchJson('https://example.org:8443/x', { allowHosts: ['example.org'] }), /port/i)
})

// --- Gemeinsame Gesamt-Zeitschranke: DNS-Auflösung + Anfrage zusammen dürfen timeoutMs nicht
// überschreiten ---------------------------------------------------------------------------------

test('safeFetchJson: eine hängende DNS-Auflösung löst dieselbe Zeitüberschreitung aus wie eine hängende Anfrage', async () => {
  const dnsMock = { promise: new Promise(() => {}) } // löst absichtlich nie auf
  const t0 = Date.now()
  await assert.rejects(
    (async () => {
      const original = dns.promises.lookup
      dns.promises.lookup = () => dnsMock.promise
      try {
        await safeFetchJson('https://example.org/x', { allowHosts: ['example.org'], timeoutMs: 200 })
      } finally {
        dns.promises.lookup = original
      }
    })(),
    /zeitüberschreitung/i
  )
  assert.ok(Date.now() - t0 < 2000, 'die Gesamt-Zeitschranke greift, statt auf die DNS-Auflösung zu warten')
})
