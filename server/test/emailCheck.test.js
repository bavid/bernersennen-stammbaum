const test = require('node:test')
const assert = require('node:assert/strict')
const { checkEmailDomain, domainOf, EMAIL_DOMAIN_RESULT } = require('../lib/emailCheck')

// Phase N Task 1: Prüfung der E-Mail-Domain per DNS - hier nur mit einem Stub-Resolver, nie echtes DNS.

function dnsError(code) {
  const err = new Error(`queryX ${code}`)
  err.code = code
  return err
}

// Stub mit festen Antworten je Abfrage-Art: ein Array = Treffer, ein String = Fehlercode.
function stubResolver({ mx = 'ENODATA', a = 'ENODATA', aaaa = 'ENODATA' } = {}, calls = []) {
  const answer = (kind, value, domain) => {
    calls.push(`${kind}:${domain}`)
    return typeof value === 'string' ? Promise.reject(dnsError(value)) : Promise.resolve(value)
  }
  return {
    resolveMx: (domain) => answer('mx', mx, domain),
    resolve4: (domain) => answer('a', a, domain),
    resolve6: (domain) => answer('aaaa', aaaa, domain)
  }
}

test('domainOf: Teil nach dem letzten @, klein geschrieben', () => {
  assert.equal(domainOf('Anna@Example.ORG'), 'example.org')
  assert.equal(domainOf('a"@"b@beispiel.example'), 'beispiel.example')
})

test('checkEmailDomain: MX-Eintrag vorhanden -> gültig, ohne A/AAAA nachzufragen', async () => {
  const calls = []
  const resolver = stubResolver({ mx: [{ exchange: 'mail.example.org', priority: 10 }] }, calls)
  assert.equal(await checkEmailDomain('anna@Example.org', { resolver }), EMAIL_DOMAIN_RESULT.gueltig)
  assert.deepEqual(calls, ['mx:example.org'])
})

test('checkEmailDomain: Null-MX (RFC 7505, Domain nimmt keine Mails an) -> ungültig', async () => {
  const resolver = stubResolver({ mx: [{ exchange: '', priority: 0 }] })
  assert.equal(await checkEmailDomain('niemand@example.org', { resolver }), EMAIL_DOMAIN_RESULT.ungueltig)
  const dotted = stubResolver({ mx: [{ exchange: '.', priority: 0 }] })
  assert.equal(await checkEmailDomain('niemand@example.org', { resolver: dotted }), EMAIL_DOMAIN_RESULT.ungueltig)
})

test('checkEmailDomain: kein MX, aber A oder AAAA -> gültig (implizites MX)', async () => {
  const onlyA = stubResolver({ mx: 'ENODATA', a: ['203.0.113.5'] })
  assert.equal(await checkEmailDomain('anna@example.org', { resolver: onlyA }), EMAIL_DOMAIN_RESULT.gueltig)
  const onlyAaaa = stubResolver({ mx: 'ENOTFOUND', a: 'ENODATA', aaaa: ['2001:db8::5'] })
  assert.equal(await checkEmailDomain('anna@example.org', { resolver: onlyAaaa }), EMAIL_DOMAIN_RESULT.gueltig)
})

test('checkEmailDomain: weder MX noch A/AAAA -> ungültig', async () => {
  const nx = stubResolver({ mx: 'ENOTFOUND', a: 'ENOTFOUND', aaaa: 'ENOTFOUND' })
  assert.equal(await checkEmailDomain('anna@gibt-es-nicht.example.net', { resolver: nx }), EMAIL_DOMAIN_RESULT.ungueltig)
  const noData = stubResolver({ mx: 'ENODATA', a: 'ENODATA', aaaa: 'ENODATA' })
  assert.equal(await checkEmailDomain('anna@leer.example.net', { resolver: noData }), EMAIL_DOMAIN_RESULT.ungueltig)
  const badName = stubResolver({ mx: 'EBADNAME', a: 'EBADNAME', aaaa: 'EBADNAME' })
  assert.equal(await checkEmailDomain('anna@kaputt..example.net', { resolver: badName }), EMAIL_DOMAIN_RESULT.ungueltig)
})

test('checkEmailDomain: Zeitüberschreitung -> unbekannt (wird angenommen, nicht blockiert)', async () => {
  const hanging = { resolveMx: () => new Promise(() => {}), resolve4: () => new Promise(() => {}), resolve6: () => new Promise(() => {}) }
  const started = Date.now()
  assert.equal(await checkEmailDomain('anna@langsam.example.net', { resolver: hanging, timeoutMs: 30 }), EMAIL_DOMAIN_RESULT.unbekannt)
  assert.ok(Date.now() - started < 1000, 'das Zeitlimit greift')
})

test('checkEmailDomain: vorübergehender DNS-Fehler (SERVFAIL, Timeout des Resolvers) -> unbekannt', async () => {
  const servfail = stubResolver({ mx: 'ESERVFAIL' })
  assert.equal(await checkEmailDomain('anna@example.org', { resolver: servfail }), EMAIL_DOMAIN_RESULT.unbekannt)
  const partly = stubResolver({ mx: 'ENODATA', a: 'ENODATA', aaaa: 'ETIMEOUT' })
  assert.equal(await checkEmailDomain('anna@example.org', { resolver: partly }), EMAIL_DOMAIN_RESULT.unbekannt)
  const thrower = { resolveMx: () => { throw new Error('kaputt') } }
  assert.equal(await checkEmailDomain('anna@example.org', { resolver: thrower }), EMAIL_DOMAIN_RESULT.unbekannt)
})

test('checkEmailDomain: interne Namen und IP-Adressen gelten ohne Nachfrage als ungültig', async () => {
  const { isReservedDomain } = require('../lib/emailCheck')
  const calls = []
  const resolver = stubResolver({ mx: [{ exchange: 'mx.intern', priority: 1 }] }, calls)
  const internal = [
    'a@drucker.local', 'a@localhost', 'a@nas.internal', 'a@fritz.box.lan', 'a@router.home.arpa', 'a@x.corp', 'a@127.0.0.1', 'a@[10.0.0.1]',
    'a@server.LOCAL.', 'a@server.local...', 'a@shop.test', 'a@beispiel.example', 'a@pc.localdomain', 'a@nas.home', 'a@fritz.box',
    'a@nas.private', 'a@db.docker', 'a@api.svc', 'a@web.service.consul', 'a@abcdefgh.onion', 'a@1.0.0.127.in-addr.arpa'
  ]
  for (const email of internal) {
    assert.equal(await checkEmailDomain(email, { resolver }), EMAIL_DOMAIN_RESULT.ungueltig, email)
  }
  assert.deepEqual(calls, [], 'kein DNS-Aufruf')
  assert.equal(isReservedDomain('example.org'), false)
  assert.equal(isReservedDomain('locals.example.org'), false)
  assert.equal(isReservedDomain('mylan.example.org'), false)
  assert.equal(isReservedDomain('testing.example.net'), false)
  assert.equal(isReservedDomain('mailbox.org'), false, 'box nur als ganzes Label')
})

test('useResolverForTests: ersetzt den Standard-Resolver, bis restore() aufgerufen wird', async () => {
  const { useResolverForTests } = require('../lib/emailCheck')
  const restore = useResolverForTests(stubResolver({ mx: [{ exchange: 'mx.example.org', priority: 1 }] }))
  try {
    assert.equal(await checkEmailDomain('anna@example.org'), EMAIL_DOMAIN_RESULT.gueltig)
  } finally {
    restore()
  }
})
