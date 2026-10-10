const test = require('node:test')
const assert = require('node:assert/strict')
const { generateVAPIDKeys } = require('web-push')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// „Test-Benachrichtigung senden“ (Einstellungen › App): POST /api/push/test schickt EINE feste, namenlose Nachricht an
// genau das Gerät, das fragt (sein endpoint) - nur wenn dieses Abo dem eigenen Zuhause gehört. Demo und Besuch 403,
// ohne VAPID 503, höchstens 3 je 10 Minuten je Zuhause. Der Versand ist ersetzt (setSenderForTests).
const keys = generateVAPIDKeys()
const dataDir = useTempDataDir('push-test', { VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey })
const config = require('../config')
const push = require('../lib/push')

const subscription = (name) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, keys: { p256dh: 'BPdh_abc-123', auth: 'auth_abc' } })

test('payloadForTest: fest, ohne Namen, Deutsch oder Englisch', () => {
  const de = push.payloadForTest()
  assert.equal(de.ereignis, 'test')
  assert.match(`${de.titel} ${de.text}`, /Familie auf Pfoten/)
  assert.match(de.text, /So sehen Benachrichtigungen aus/)
  assert.deepEqual(push.payloadForTest('quatsch'), de)
  assert.match(push.payloadForTest('en').text, /This is how notifications look/)
})

test('POST /api/push/test', async (t) => {
  const { server, base } = await startApp()
  const savedVapid = config.vapid
  t.after(() => {
    config.vapid = savedVapid
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
  const post = (body, cookie) => call(base, '/api/push/test', { method: 'POST', body, cookie })
  const benno = await createHousehold(base, 'Zuhause Benno')
  const wilma = await createHousehold(base, 'Zuhause Wilma')
  const lotte = await createHousehold(base, 'Zuhause Lotte')
  push.saveAbo(benno.data.id, subscription('benno-handy'))
  push.saveAbo(benno.data.id, subscription('benno-tablet'))
  push.saveAbo(wilma.data.id, subscription('wilma-handy'))

  await t.test('ohne Sitzung 401', async () => {
    assert.equal((await post({ endpoint: subscription('benno-handy').endpoint })).status, 401)
  })

  await t.test('nur an dieses Gerät: die anderen Geräte und andere Zuhause bekommen nichts', async () => {
    sent.length = 0
    const res = await post({ endpoint: subscription('benno-handy').endpoint, lang: 'de' }, benno.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, { ok: true })
    assert.match(res.headers.get('cache-control'), /no-store/)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].endpoint, subscription('benno-handy').endpoint)
    assert.equal(sent[0].payload.ereignis, 'test')
    assert.doesNotMatch(JSON.stringify(sent[0].payload), /Benno|Wilma/)
  })

  await t.test('fremdes Abo 404 (kein Versand), ohne endpoint 400', async () => {
    sent.length = 0
    assert.equal((await post({ endpoint: subscription('wilma-handy').endpoint }, benno.cookie)).status, 404)
    assert.equal((await post({}, wilma.cookie)).status, 400)
    assert.equal(sent.length, 0)
  })

  await t.test('Englisch über lang', async () => {
    sent.length = 0
    assert.equal((await post({ endpoint: subscription('wilma-handy').endpoint, lang: 'en' }, wilma.cookie)).status, 200)
    assert.match(sent[0].payload.text, /This is how notifications look/)
  })

  await t.test('410 vom Push-Dienst: Abo gelöscht, 410 mit Hinweis', async () => {
    push.saveAbo(lotte.data.id, subscription('weg'))
    const res = await post({ endpoint: subscription('weg').endpoint }, lotte.cookie)
    assert.equal(res.status, 410)
    assert.ok(res.data.error)
    assert.equal(push.countAbos(lotte.data.id), 0)
  })

  await t.test('höchstens 3 je 10 Minuten je Zuhause (429) - ein anderes Zuhause ist nicht betroffen', async () => {
    // benno: 1 Versuch oben (+ 1 fremder 404) = 2; der dritte geht noch, der vierte nicht
    assert.equal((await post({ endpoint: subscription('benno-tablet').endpoint }, benno.cookie)).status, 200)
    const res = await post({ endpoint: subscription('benno-tablet').endpoint }, benno.cookie)
    assert.equal(res.status, 429)
    assert.ok(res.data.error)
    assert.equal((await post({ endpoint: subscription('wilma-handy').endpoint }, wilma.cookie)).status, 200)
  })

  await t.test('Demo-Sitzung 403', async () => {
    const demo = await createFamily(base, 'Demo-Familie', 'demo12345')
    require('../db').prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    assert.equal((await post({ endpoint: subscription('demo').endpoint }, demo.cookie)).status, 403)
  })

  await t.test('Besuchs-Sitzung (Gast) 403', async () => {
    const invite = (await call(base, '/api/besuche/einladungen', { method: 'POST', body: {}, cookie: lotte.cookie })).data
    assert.equal((await call(base, '/api/besuche/einloesen', { method: 'POST', body: { code: invite.code }, cookie: wilma.cookie })).status, 201)
    const view = await call(base, '/api/view', { method: 'POST', body: { familyId: lotte.data.id }, cookie: wilma.cookie })
    assert.equal(view.status, 200)
    sent.length = 0
    assert.equal((await post({ endpoint: subscription('wilma-handy').endpoint }, getCookie(view.res))).status, 403)
    assert.equal(sent.length, 0)
  })

  await t.test('ohne VAPID-Schlüssel 503 mit klarer Meldung', async () => {
    config.vapid = Object.freeze({ publicKey: '', privateKey: '', subject: 'mailto:admin@localhost' })
    const res = await post({ endpoint: subscription('wilma-handy').endpoint }, wilma.cookie)
    assert.equal(res.status, 503)
    assert.match(res.data.error, /nicht eingerichtet/)
    config.vapid = savedVapid
  })
})
