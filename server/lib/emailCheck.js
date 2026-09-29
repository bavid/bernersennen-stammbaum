'use strict'

// Phase N Task 1: Gibt es die Domain einer E-Mail-Adresse wirklich? (Anfragen, routes/anfragen.js)
// Nachgefragt wird per DNS: erst MX, ohne MX die A/AAAA-Einträge (RFC 5321 "implizites MX"). Nur ein klares
// "gibt es nicht" (NXDOMAIN, keine Einträge, Null-MX nach RFC 7505) lehnt ab - eine Zeitüberschreitung oder ein
// vorübergehender DNS-Fehler lässt die Adresse durch: lieber eine Anfrage mehr als eine echte Person abweisen,
// nur weil der Nameserver gerade hängt. Geloggt wird hier nichts (die Adresse ist ein personenbezogenes Datum).
// Der Resolver ist austauschbar (Parameter oder useResolverForTests) - Tests fragen nie echtes DNS.

const dns = require('node:dns')

const DNS_TIMEOUT_MS = 3000

const EMAIL_DOMAIN_RESULT = Object.freeze({ gueltig: 'gueltig', ungueltig: 'ungueltig', unbekannt: 'unbekannt' })

// "Diesen Eintrag gibt es nicht" - jede andere Fehlerart (SERVFAIL, Timeout, Verbindung, ...) gilt als vorübergehend.
const MISSING_CODES = new Set([dns.NODATA, dns.NOTFOUND, dns.BADNAME])

// Namen, die es im öffentlichen DNS nie gibt oder die intern verwendet werden (RFC 2606/6761/6762/7686/8375, übliche
// Container-/Service-Discovery- und Router-Zonen) und IP-Adressen statt einer Domain: gar nicht erst nachfragen - sonst
// ließe sich über die Antwort (400 oder 201) erraten, welche internen Namen der Resolver des Servers kennt. Verglichen
// wird je ganzem Label ("mailbox.org" ist also nicht "box").
const RESERVED_SUFFIXES = [
  'local', 'localhost', 'localdomain', 'internal', 'intranet', 'lan', 'home', 'box', 'private', 'corp', 'invalid', 'test', 'example',
  'docker', 'svc', 'consul', 'onion', 'arpa'
]
const IPV4_LITERAL_RE = /^\d{1,3}(\.\d{1,3}){3}$/

let defaultResolver = dns.promises

// Teil nach dem LETZTEN @ (ein @ im Lokalteil ist in Anführungszeichen erlaubt), klein geschrieben.
function domainOf(email) {
  return String(email).slice(String(email).lastIndexOf('@') + 1).toLowerCase()
}

function isReservedDomain(domain) {
  const withoutDot = domain.replace(/\.+$/, '')
  if (withoutDot.startsWith('[') || IPV4_LITERAL_RE.test(withoutDot)) return true
  return RESERVED_SUFFIXES.some((suffix) => withoutDot === suffix || withoutDot.endsWith(`.${suffix}`))
}

// Einträge einer Abfrage-Art, null wenn es keine gibt; vorübergehende Fehler werfen weiter.
async function recordsOrNull(query) {
  try {
    const records = await query()
    return Array.isArray(records) && records.length ? records : null
  } catch (err) {
    if (MISSING_CODES.has(err?.code)) return null
    throw err
  }
}

// Null-MX: ein einziger Eintrag mit leerem Ziel ("." bzw. "") - die Domain nimmt ausdrücklich keine Mails an.
function acceptsMail(mxRecords) {
  return mxRecords.some((record) => record && typeof record.exchange === 'string' && record.exchange !== '' && record.exchange !== '.')
}

async function lookupDomain(domain, resolver) {
  const mx = await recordsOrNull(() => resolver.resolveMx(domain))
  if (mx) return acceptsMail(mx) ? EMAIL_DOMAIN_RESULT.gueltig : EMAIL_DOMAIN_RESULT.ungueltig
  const [a, aaaa] = await Promise.all([recordsOrNull(() => resolver.resolve4(domain)), recordsOrNull(() => resolver.resolve6(domain))])
  return a || aaaa ? EMAIL_DOMAIN_RESULT.gueltig : EMAIL_DOMAIN_RESULT.ungueltig
}

// Ergebnis: 'gueltig' | 'ungueltig' | 'unbekannt' (Zeitüberschreitung oder vorübergehender Fehler).
// Wirft nie. Eine hängende Abfrage läuft nach dem Zeitlimit im Hintergrund aus, ihr Ergebnis zählt nicht mehr.
async function checkEmailDomain(email, { resolver = defaultResolver, timeoutMs = DNS_TIMEOUT_MS } = {}) {
  if (isReservedDomain(domainOf(email))) return EMAIL_DOMAIN_RESULT.ungueltig
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(EMAIL_DOMAIN_RESULT.unbekannt), timeoutMs)
  })
  try {
    const lookup = Promise.resolve()
      .then(() => lookupDomain(domainOf(email), resolver))
      .catch(() => EMAIL_DOMAIN_RESULT.unbekannt)
    return await Promise.race([lookup, timeout])
  } finally {
    clearTimeout(timer)
  }
}

// Nur für Tests: ersetzt den Standard-Resolver (auch für Aufrufe aus den Routen). Gibt restore() zurück.
function useResolverForTests(resolver) {
  const previous = defaultResolver
  defaultResolver = resolver
  return () => {
    defaultResolver = previous
  }
}

module.exports = { checkEmailDomain, domainOf, isReservedDomain, useResolverForTests, EMAIL_DOMAIN_RESULT, DNS_TIMEOUT_MS }
