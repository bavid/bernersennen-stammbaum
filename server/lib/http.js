'use strict'

// Einziger Weg nach außen (SSRF-Schutz) - siehe docs/superpowers/plans/2026-09-28-phase-2-partner.md,
// Task 3. Nur https:// zu Hosts einer expliziten Allowlist, ohne Weiterleitungen, mit Zeitlimit und
// gedeckelter Antwortgröße. Vor dem Verbinden wird der Host per DNS aufgelöst und geprüft, dass KEINE
// der Adressen privat/loopback/link-local ist - anschließend wird direkt gegen genau diese geprüfte
// IP verbunden (nicht noch einmal per Hostnamen), mit dem echten Hostnamen als Host-Header und TLS-SNI.
// Das schließt DNS-Rebinding: würde man stattdessen ein zweites Mal per Hostnamen auflösen (z. B. weil
// man fetch() mit der URL aufruft), könnte ein Angreifer zwischen Prüfung und Verbindungsaufbau die
// DNS-Antwort auf eine private Adresse wechseln.

const dns = require('node:dns')
const http = require('node:http')
const https = require('node:https')
const { BlockList, isIP } = require('node:net')
const { URL } = require('node:url')
const config = require('../config')
const { absoluteUrl } = require('./publicUrl')

const DEFAULT_TIMEOUT_MS = 8000
const DEFAULT_MAX_BYTES = 1_000_000

const IPV4_MAPPED_RE = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i

// Private/reservierte Bereiche, die nie erreicht werden dürfen (siehe Task-Vorgabe). Statt einer reinen
// Blockliste wäre "nur global unicast erlauben" die robustere Regel - hier bewusst als explizite Liste
// gehalten, damit jeder Bereich einzeln benannt und getestet ist (security-review Phase 2 Finding 5).
const forbiddenRanges = new BlockList()
forbiddenRanges.addSubnet('10.0.0.0', 8, 'ipv4')
forbiddenRanges.addSubnet('172.16.0.0', 12, 'ipv4')
forbiddenRanges.addSubnet('192.168.0.0', 16, 'ipv4')
forbiddenRanges.addSubnet('127.0.0.0', 8, 'ipv4')
forbiddenRanges.addSubnet('169.254.0.0', 16, 'ipv4')
forbiddenRanges.addSubnet('0.0.0.0', 8, 'ipv4') // "diese Adresse" (RFC 791/1122)
forbiddenRanges.addSubnet('100.64.0.0', 10, 'ipv4') // Carrier-Grade NAT (RFC 6598)
forbiddenRanges.addSubnet('192.0.0.0', 24, 'ipv4') // IETF-Protokollzuweisungen (RFC 6890)
forbiddenRanges.addSubnet('198.18.0.0', 15, 'ipv4') // Netzwerk-Benchmarking (RFC 2544)
forbiddenRanges.addSubnet('224.0.0.0', 4, 'ipv4') // Multicast
forbiddenRanges.addSubnet('240.0.0.0', 4, 'ipv4') // reserviert (inkl. 255.255.255.255 Broadcast)
forbiddenRanges.addAddress('::1', 'ipv6')
forbiddenRanges.addSubnet('fc00::', 7, 'ipv6') // ULA
forbiddenRanges.addSubnet('fe80::', 10, 'ipv6') // link-local
forbiddenRanges.addSubnet('::', 96, 'ipv6') // unspezifiziert (::) + veraltetes IPv4-kompatibles ::/96
forbiddenRanges.addSubnet('ff00::', 8, 'ipv6') // Multicast
forbiddenRanges.addSubnet('64:ff9b::', 96, 'ipv6') // NAT64 wohlbekanntes Präfix (RFC 6052)
forbiddenRanges.addSubnet('2002::', 16, 'ipv6') // 6to4 (RFC 3056) - kann IPv4-Adressen einbetten

// IPv4-mapped IPv6 (z. B. "::ffff:127.0.0.1") wie die eingebettete IPv4-Adresse behandeln - sonst
// würde sie an obigen ipv6-Bereichen vorbeirutschen, obwohl sie effektiv dieselbe Adresse ist.
function normalizeAddress(address) {
  const mapped = address.match(IPV4_MAPPED_RE)
  return mapped ? mapped[1] : address
}

function isForbiddenIp(address) {
  const normalized = normalizeAddress(address)
  const family = isIP(normalized) === 6 ? 'ipv6' : 'ipv4'
  return forbiddenRanges.check(normalized, family)
}

function isLoopbackIp(address) {
  const normalized = normalizeAddress(address)
  return normalized === '::1' || normalized.startsWith('127.')
}

// Erlaubt eine Adresse nur, wenn sie nicht in den verbotenen Bereichen liegt - AUSSER das
// Test-Flag `allowLocalHttp` ist gesetzt UND die Adresse ist tatsächlich Loopback (127.0.0.0/8, ::1).
// Andere private Bereiche (10/8, 172.16/12, 192.168/16, 169.254/16, fc00::/7, fe80::/10) bleiben auch
// mit dem Flag gesperrt - es ist nur für einen lokalen Testserver gedacht, nicht für private Netze.
function isAllowedAddress(address, allowLocalHttp) {
  if (!isForbiddenIp(address)) return true
  return Boolean(allowLocalHttp) && isLoopbackIp(address)
}

function httpLibError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Lässt `promise` gegen eine feste Deadline laufen, statt gegen eine eigene, frische Zeitspanne - so
// zählt die DNS-Auflösung gegen dasselbe Gesamt-Zeitlimit wie die eigentliche Anfrage (siehe
// safeFetchJson: ohne das könnte eine hängende Namensauflösung `timeoutMs` beliebig überschreiten,
// weil bisher nur die Anfrage selbst ein Zeitlimit hatte). Ein "Verlieren" gegen die Deadline lässt die
// ursprüngliche Promise im Hintergrund weiterlaufen (kein AbortSignal für dns.promises.lookup nötig) -
// ihr Ergebnis wird dann einfach nicht mehr verwendet.
function withDeadline(promise, deadlineAt) {
  const remaining = deadlineAt - Date.now()
  if (remaining <= 0) return Promise.reject(httpLibError(504, 'Zeitüberschreitung bei der Anfrage'))
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(httpLibError(504, 'Zeitüberschreitung bei der Anfrage')), remaining))
  ])
}

// Infoadresse im User-Agent: mit PUBLIC_URL die eigene Domain (lib/publicUrl.js), sonst der angefragte Host.
function userAgent(hostname) {
  const infoUrl = config.publicUrl ? absoluteUrl('/bot') : `https://${hostname}/bot`
  return `FamilieAufPfotenBot/1.0 (+${infoUrl})`
}

function pickModule(protocol) {
  return protocol === 'https:' ? https : http
}

// Baut die eigentliche Anfrage: verbindet zur bereits geprüften IP (targetIp), sendet aber den echten
// Hostnamen als Host-Header (und bei https als SNI/Zertifikats-Hostname über `servername`).
function performRequest({ targetIp, hostname, port, path, protocol, method, headers, body, timeoutMs, maxBytes }) {
  return new Promise((resolve, reject) => {
    const mod = pickModule(protocol)
    let settled = false
    const done = (fn, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn(value)
    }

    const options = { method, host: targetIp, port, path, headers }
    if (protocol === 'https:') options.servername = hostname

    const req = mod.request(options, (response) => {
      const status = response.statusCode || 0
      if (status >= 300 && status < 400) {
        response.resume()
        return done(reject, httpLibError(502, 'Weiterleitungen sind nicht erlaubt'))
      }
      if (status < 200 || status >= 300) {
        response.resume()
        return done(reject, httpLibError(502, `Unerwarteter Status ${status}`))
      }

      const chunks = []
      let received = 0
      response.on('data', (chunk) => {
        if (settled) return
        received += chunk.length
        if (received > maxBytes) {
          response.destroy()
          req.destroy()
          return done(reject, httpLibError(502, 'Antwort ist zu groß'))
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        if (settled) return
        try {
          done(resolve, JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch {
          done(reject, httpLibError(502, 'Antwort ist kein gültiges JSON'))
        }
      })
      response.on('error', (err) => done(reject, err))
    })

    let timedOut = false
    req.on('error', () => {
      // Eine einzige, unverfängliche Fehlermeldung statt des rohen Socket-Fehlers (der z. B. die
      // Ziel-IP enthalten könnte) - unterscheidet nur, ob es unser eigenes Timeout war.
      done(reject, timedOut ? httpLibError(504, 'Zeitüberschreitung bei der Anfrage') : httpLibError(502, 'Verbindung fehlgeschlagen'))
    })

    const timer = setTimeout(() => {
      timedOut = true
      req.destroy(new Error('Zeitüberschreitung'))
    }, timeoutMs)

    if (body !== undefined) req.write(body)
    req.end()
  })
}

// safeFetchJson(url, { method, body, headers, timeoutMs, maxBytes, allowHosts, allowLocalHttp })
// Gibt die geparste JSON-Antwort zurück oder wirft einen Fehler mit .status.
async function safeFetchJson(url, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBytes = DEFAULT_MAX_BYTES,
    allowHosts,
    allowLocalHttp = false
  } = options

  if (!Array.isArray(allowHosts) || allowHosts.length === 0) {
    throw httpLibError(500, 'safeFetchJson benötigt eine Host-Allowlist')
  }

  // Gesamt-Zeitschranke über DNS-Auflösung UND Anfrage hinweg (siehe withDeadline) - ohne sie könnte
  // eine hängende Namensauflösung timeoutMs beliebig überschreiten, weil bislang nur die eigentliche
  // Anfrage ein eigenes Zeitlimit hatte.
  const deadlineAt = Date.now() + timeoutMs

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    throw httpLibError(400, 'Ungültige URL')
  }

  const isHttps = parsed.protocol === 'https:'
  const isTestHttp = allowLocalHttp && parsed.protocol === 'http:'
  if (!isHttps && !isTestHttp) {
    throw httpLibError(400, 'Nur https:// ist erlaubt')
  }

  const hostname = parsed.hostname
  if (!allowHosts.some((allowed) => allowed.toLowerCase() === hostname.toLowerCase())) {
    throw httpLibError(400, 'Dieser Host ist nicht erlaubt')
  }

  // Port fest auf 443 gepinnt - außerhalb des Test-Flags soll niemand über die URL einen anderen
  // (z. B. internen) Port ansprechen können. `allowLocalHttp` ist ausschließlich für einen lokalen
  // Testserver auf einem beliebigen Port gedacht (siehe isAllowedAddress).
  const requestedPort = Number(parsed.port) || (isHttps ? 443 : 80)
  if (!allowLocalHttp && requestedPort !== 443) {
    throw httpLibError(400, 'Nur Port 443 ist erlaubt')
  }
  const port = requestedPort

  let addresses
  try {
    addresses = await withDeadline(dns.promises.lookup(hostname, { all: true, verbatim: true }), deadlineAt)
  } catch (err) {
    if (err instanceof Error && err.status === 504) throw err
    throw httpLibError(502, 'Host konnte nicht aufgelöst werden')
  }
  if (!addresses.length) throw httpLibError(502, 'Host konnte nicht aufgelöst werden')
  if (addresses.some((a) => !isAllowedAddress(a.address, allowLocalHttp))) {
    throw httpLibError(400, 'Zieladresse ist nicht erlaubt')
  }

  // Direkt gegen die geprüfte(n) Adresse(n) verbinden statt später noch einmal per Hostnamen
  // aufzulösen - siehe Kommentar am Dateikopf (DNS-Rebinding).
  const targetIp = addresses[0].address
  const path = `${parsed.pathname}${parsed.search}`

  // Host-Header wie ein normaler Client: Hostname allein bei Standard-Port, sonst mit Port - unabhängig
  // davon, dass die TCP-Verbindung selbst gegen targetIp (nicht hostname) aufgebaut wird.
  const isDefaultPort = (isHttps && port === 443) || (isTestHttp && port === 80)
  const hostHeader = isDefaultPort ? hostname : `${hostname}:${port}`
  const requestHeaders = { ...headers, Host: hostHeader, 'User-Agent': userAgent(hostname), Accept: 'application/json' }
  if (body !== undefined && !('Content-Type' in requestHeaders) && !('content-type' in requestHeaders)) {
    requestHeaders['Content-Type'] = 'application/json'
  }

  const remainingMs = deadlineAt - Date.now()
  if (remainingMs <= 0) throw httpLibError(504, 'Zeitüberschreitung bei der Anfrage')

  return performRequest({
    targetIp,
    hostname,
    port,
    path,
    protocol: isTestHttp ? 'http:' : 'https:',
    method,
    headers: requestHeaders,
    body,
    timeoutMs: remainingMs,
    maxBytes
  })
}

module.exports = { safeFetchJson, isForbiddenIp, isLoopbackIp }
