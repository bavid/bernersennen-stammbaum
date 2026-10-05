const test = require('node:test')
const assert = require('node:assert/strict')
const { generateVAPIDKeys } = require('web-push')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Benachrichtigungen aufs Handy (Web Push): Abos je Zuhause unter /api/push, Versand zu den Glocken-Ereignissen (neuer
// Gast, Gruß) mit festen Texten ohne Namen, Aufräumen bei 410 - der Versand selbst ist ersetzt (setSenderForTests),
// nie eine echte Anfrage an einen Push-Dienst.
const keys = generateVAPIDKeys()
const dataDir = useTempDataDir('push', { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey })
const config = require('../config')
const push = require('../lib/push')

const subscription = (name) => ({ endpoint: `https://push.example/abo/${name}`, keys: { p256dh: 'BPdh_abc-123', auth: 'auth_abc' } })
const flush = () => new Promise((resolve) => setImmediate(() => setImmediate(resolve)))

test('readVapid: beide Schlüssel oder keiner, Absender mailto/https', () => {
  const both = config.readVapid({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }, 'https://pfoten.example')
  assert.deepEqual(both, { publicKey: 'pub', privateKey: 'priv', subject: 'https://pfoten.example' })
  const half = config.readVapid({ VAPID_PUBLIC_KEY: 'pub' }, null)
  assert.equal(half.publicKey, '')
  assert.equal(half.privateKey, '')
  assert.equal(half.subject, 'mailto:admin@localhost')
  assert.equal(config.readVapid({ VAPID_SUBJECT: 'mailto:hallo@example.org' }, null).subject, 'mailto:hallo@example.org')
  assert.equal(config.readVapid({ VAPID_SUBJECT: 'javascript:1' }, null).subject, 'mailto:admin@localhost')
})

test('cleanSubscription: nur https-Endpunkte mit beiden Schlüsseln, begrenzte Längen', () => {
  assert.deepEqual(push.cleanSubscription(subscription('a')), subscription('a'))
  assert.equal(push.cleanSubscription(null), null)
  assert.equal(push.cleanSubscription({ endpoint: 'http://push.example/x', keys: subscription('a').keys }), null)
  assert.equal(push.cleanSubscription({ endpoint: 'https://push.example/x', keys: { p256dh: 'ok' } }), null)
  assert.equal(push.cleanSubscription({ endpoint: 'https://push.example/x', keys: { p256dh: 'böse<', auth: 'a' } }), null)
  assert.equal(push.cleanSubscription({ endpoint: `https://push.example/${'x'.repeat(2100)}`, keys: subscription('a').keys }), null)
})

test('payloadFor: feste Texte ohne Namen, unbekanntes Ereignis wirft', () => {
  for (const ereignis of Object.values(push.EREIGNIS)) {
    const payload = push.payloadFor(ereignis)
    assert.ok(payload.titel && payload.text && payload.url === '/start')
    assert.equal(payload.ereignis, ereignis)
  }
  assert.throws(() => push.payloadFor('quatsch'), /Unbekanntes Push-Ereignis/)
})

test('Web Push über die API', async (t) => {
  const { server, base } = await startApp()
  t.after(() => {
    push.setSenderForTests(null)
    cleanup(dataDir, server)
  })
  const sent = []
  push.setSenderForTests(async (sub, payload) => {
    sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) })
    if (sub.endpoint.endsWith('/weg')) {
      const err = new Error('Gone')
      err.statusCode = 410
      throw err
    }
  })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const del = (urlPath, body, cookie) => call(base, urlPath, { method: 'DELETE', body, cookie })
  const host = await createHousehold(base, 'Zuhause am Hafen')
  const guest = await createHousehold(base, 'Zuhause im Grünen')
  const hostId = host.data.id

  await t.test('GET /key: eingeschaltet, nur der öffentliche Schlüssel; ohne Sitzung 401', async () => {
    const res = await call(base, '/api/push/key', { cookie: host.cookie })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, { enabled: true, publicKey: keys.publicKey, geraete: 0 })
    assert.doesNotMatch(JSON.stringify(res.data), new RegExp(keys.privateKey.slice(0, 12)))
    assert.match(res.headers.get('cache-control'), /no-store/)
    assert.equal((await call(base, '/api/push/key')).status, 401)
  })

  await t.test('POST /abo: ungültig 400, gespeichert 201, derselbe Endpunkt aktualisiert statt doppelt', async () => {
    assert.equal((await post('/api/push/abo', { subscription: { endpoint: 'http://x', keys: {} } }, host.cookie)).status, 400)
    assert.equal((await post('/api/push/abo', {}, host.cookie)).status, 400)
    assert.equal((await post('/api/push/abo', { subscription: subscription('handy') }, host.cookie)).status, 201)
    assert.equal((await post('/api/push/abo', { subscription: subscription('handy') }, host.cookie)).status, 201)
    assert.equal(push.countAbos(hostId), 1)
    assert.equal((await call(base, '/api/push/key', { cookie: host.cookie })).data.geraete, 1)
    assert.equal((await post('/api/push/abo', { subscription: subscription('x') })).status, 401)
  })

  await t.test('höchstens MAX_ABOS_PER_HOME Geräte je Zuhause (409)', async () => {
    for (let i = push.countAbos(hostId); i < push.MAX_ABOS_PER_HOME; i += 1) {
      assert.equal((await post('/api/push/abo', { subscription: subscription(`g${i}`) }, host.cookie)).status, 201)
    }
    assert.equal((await post('/api/push/abo', { subscription: subscription('zuviel') }, host.cookie)).status, 409)
    for (let i = 1; i < push.MAX_ABOS_PER_HOME; i += 1) await del('/api/push/abo', { endpoint: subscription(`g${i}`).endpoint }, host.cookie)
    assert.equal(push.countAbos(hostId), 1)
  })

  // Demo: eine Familie, die in der DB als Demo markiert ist (requireAuth liest is_demo aus der DB, nicht aus dem Token).
  const demoFamily = await createFamily(base, 'Demo-Familie', 'demo12345')
  require('../db').prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoFamily.data.id)

  await t.test('Demo-Sitzung: Schlüssel lesen ja, abonnieren 403', async () => {
    const cookie = demoFamily.cookie
    assert.equal((await call(base, '/api/push/key', { cookie })).status, 200)
    assert.equal((await post('/api/push/abo', { subscription: subscription('demo') }, cookie)).status, 403)
  })

  await t.test('Neuer Gast: der Gastgeber bekommt einen Hinweis - ohne Namen des Gastes', async () => {
    const invite = (await post('/api/besuche/einladungen', {}, host.cookie)).data
    sent.length = 0
    assert.equal((await post('/api/besuche/einloesen', { code: invite.code }, guest.cookie)).status, 201)
    await flush()
    assert.equal(sent.length, 1)
    assert.equal(sent[0].endpoint, subscription('handy').endpoint)
    assert.equal(sent[0].payload.ereignis, push.EREIGNIS.gast)
    assert.doesNotMatch(JSON.stringify(sent[0].payload), /Grünen|Hafen/)
  })

  await t.test('Gruß: ein Kommentar des Gastes zu einer Erinnerung des Gastgebers - der eigene Kommentar nicht', async () => {
    const dog = (await post('/api/dogs', { name: 'Wilma', geschlecht: 'huendin' }, host.cookie)).data
    const entry = (await post('/api/timeline', { dogId: dog.id, autorName: 'Hafen', datum: '2026-05-01', titel: 'Am Strand' }, host.cookie)).data
    const view = await post('/api/view', { familyId: hostId }, guest.cookie)
    assert.equal(view.status, 200)
    const guestCookie = getCookie(view.res)

    sent.length = 0
    assert.equal((await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Hafen', text: 'Eigener Kommentar' }, host.cookie)).status, 201)
    await flush()
    assert.equal(sent.length, 0, 'der eigene Kommentar ist kein Gruß')

    assert.equal((await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Grün', text: 'Schön war es!' }, guestCookie)).status, 201)
    await flush()
    assert.equal(sent.length, 1)
    assert.equal(sent[0].payload.ereignis, push.EREIGNIS.gruss)
    assert.doesNotMatch(JSON.stringify(sent[0].payload), /Schön war es|Am Strand|Grün/)
  })

  await t.test('410 vom Push-Dienst löscht das Abo, der Rest bleibt', async () => {
    push.saveAbo(hostId, subscription('weg'))
    assert.equal(push.countAbos(hostId), 2)
    const delivered = await push.deliver(hostId, push.EREIGNIS.gruss)
    assert.equal(delivered, 1)
    assert.equal(push.countAbos(hostId), 1)
  })

  await t.test('DELETE /abo: ein Gerät (404 wenn fremd oder unbekannt) oder ohne endpoint alle', async () => {
    assert.equal((await del('/api/push/abo', { endpoint: subscription('handy').endpoint }, guest.cookie)).status, 404)
    assert.equal((await del('/api/push/abo', { endpoint: subscription('handy').endpoint }, host.cookie)).status, 204)
    assert.equal(push.countAbos(hostId), 0)
    push.saveAbo(hostId, subscription('a'))
    push.saveAbo(hostId, subscription('b'))
    assert.equal((await del('/api/push/abo', {}, host.cookie)).status, 204)
    assert.equal(push.countAbos(hostId), 0)
  })

  await t.test('Demo-Zuhause lösen nie etwas aus', async () => {
    assert.equal(push.notifyHome(demoFamily.data.id, push.EREIGNIS.gast), false)
    assert.equal(push.notifyHome(null, push.EREIGNIS.gast), false)
  })
})
