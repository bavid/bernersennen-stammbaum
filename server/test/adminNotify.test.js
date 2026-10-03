const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase N Task 2: Telegram im Admin einrichten (routes/adminNotify.js). Ohne TELEGRAM_* in der Umgebung - hier zählt
// nur der Weg über den Admin. Telegram selbst ist ein Fake-Client (lib/telegram.js setTelegramClientForTests), nie das
// Netz. Token und Chat-IDs sind erfunden.
const ADMIN_TEST_PASSWORD = 'admin-test-notify-1'
const TOKEN = '424242:ADMIN-token_nur-fuer-tests-abcdWXYZ'
const OTHER_TOKEN = '515151:ANDERER-token_nur-fuer-tests-0000'
const dataDir = useTempDataDir('admin-notify')
delete process.env.TELEGRAM_BOT_TOKEN
delete process.env.TELEGRAM_CHAT_ID

function rejected(upstreamStatus) {
  return Object.assign(new Error(`Unerwarteter Status ${upstreamStatus}`), { status: 502, upstreamStatus })
}

test('Admin: Telegram einrichten, Schalter setzen, Chat finden und Testnachricht', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { setTelegramClientForTests } = require('../lib/telegram')
  const { setNotifyRuntimeForTests } = require('../lib/notify')
  const telegram = { getMeCalls: [], sent: [], getMe: null, getUpdates: null, sendMessage: null }
  const restoreClient = setTelegramClientForTests({
    getMe: (args) => {
      telegram.getMeCalls.push(args.token)
      return telegram.getMe(args)
    },
    getUpdates: (args) => telegram.getUpdates(args),
    sendMessage: (args) => {
      telegram.sent.push(args)
      return telegram.sendMessage(args)
    }
  })
  const logged = []
  const logger = { log: (line) => logged.push(line), warn: (line) => logged.push(line), error: (line) => logged.push(line) }
  const restoreRuntime = setNotifyRuntimeForTests({ logger, retryDelaysMs: [0, 0] })
  const { server, base } = await startApp()
  t.after(() => {
    restoreRuntime()
    restoreClient()
    cleanup(dataDir, server)
  })
  const db = require('../db')

  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(login.res)
  const admin = (urlPath, { method = 'GET', body } = {}) => call(base, urlPath, { method, body, cookie: adminCookie })
  const responses = []
  const track = async (promise) => {
    const res = await promise
    responses.push(JSON.stringify(res.data))
    return res
  }

  await t.test('ohne Admin-Cookie 401, alle Antworten no-store', async () => {
    for (const [method, urlPath] of [
      ['GET', '/api/admin/notify-settings'],
      ['PUT', '/api/admin/notify-settings'],
      ['PUT', '/api/admin/notify-settings/telegram'],
      ['POST', '/api/admin/notify-settings/chat-finden'],
      ['POST', '/api/admin/notify-test']
    ]) {
      const res = await call(base, urlPath, { method, body: method === 'GET' ? undefined : {} })
      assert.equal(res.status, 401, `${method} ${urlPath}`)
    }
    const res = await admin('/api/admin/notify-settings')
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })

  await t.test('GET: anfangs nicht eingerichtet, Schalter mit Standardwerten', async () => {
    const res = await track(admin('/api/admin/notify-settings'))
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, {
      eingerichtet: false,
      quelle: null,
      tokenHinweis: null,
      chatId: null,
      einstellungen: { gutschein_anfrage: true, partner_anfrage: true, registrierung: true, feedback: true, beitrag: false, details: false }
    })
  })

  await t.test('PUT Schalter: nur Booleans, unbekannte Schlüssel 400', async () => {
    assert.equal((await admin('/api/admin/notify-settings', { method: 'PUT', body: { feedback: 'nein' } })).status, 400)
    assert.equal((await admin('/api/admin/notify-settings', { method: 'PUT', body: { telegram_chat_id: '1' } })).status, 400)
    const res = await track(admin('/api/admin/notify-settings', { method: 'PUT', body: { beitrag: true, details: true } }))
    assert.equal(res.status, 200)
    assert.equal(res.data.einstellungen.beitrag, true)
    assert.equal(res.data.einstellungen.details, true)
    await admin('/api/admin/notify-settings', { method: 'PUT', body: { beitrag: false, details: false } })
  })

  await t.test('Testnachricht ohne Einrichtung: 409', async () => {
    const res = await admin('/api/admin/notify-test', { method: 'POST' })
    assert.equal(res.status, 409)
    assert.equal(res.data.error, 'Telegram ist nicht eingerichtet.')
    assert.equal(telegram.sent.length, 0)
  })

  await t.test('PUT telegram: Format geprüft, bevor Telegram gefragt wird', async () => {
    for (const body of [{}, { token: 'kein-token' }, { token: '1:zu-kurz' }, { chatId: 'kein chat' }, { token: 123 }]) {
      const res = await admin('/api/admin/notify-settings/telegram', { method: 'PUT', body })
      assert.equal(res.status, 400, JSON.stringify(body))
    }
    assert.deepEqual(telegram.getMeCalls, [])
  })

  await t.test('PUT telegram: lehnt Telegram den Token ab -> 400, nichts gespeichert; nicht erreichbar -> 502', async () => {
    telegram.getMe = async () => {
      throw rejected(401)
    }
    const res = await track(admin('/api/admin/notify-settings/telegram', { method: 'PUT', body: { token: TOKEN, chatId: '4242' } }))
    assert.equal(res.status, 400)
    assert.equal(res.data.error, 'Der Bot-Token wurde von Telegram nicht akzeptiert.')
    assert.deepEqual(telegram.getMeCalls, [TOKEN])

    telegram.getMe = async () => {
      throw Object.assign(new Error('Zeitüberschreitung bei der Anfrage'), { status: 504 })
    }
    const down = await track(admin('/api/admin/notify-settings/telegram', { method: 'PUT', body: { token: TOKEN } }))
    assert.equal(down.status, 502)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM settings WHERE key LIKE 'telegram_%'").get().n, 0, 'nichts gespeichert')
  })

  await t.test('PUT telegram: Token bestätigt -> verschlüsselt gespeichert, nach außen nur die letzten 4 Zeichen', async () => {
    telegram.getMe = async () => ({ id: 1, is_bot: true, username: 'pfoten_test_bot' })
    const res = await track(admin('/api/admin/notify-settings/telegram', { method: 'PUT', body: { token: ` ${TOKEN} ` } }))
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.data.tokenHinweis, '…WXYZ')
    assert.equal(res.data.eingerichtet, false, 'ohne Chat-ID noch nicht eingerichtet')
    assert.equal(res.data.chatId, null)

    const stored = db.prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token_cipher'").get().value
    assert.ok(stored && !stored.includes(TOKEN) && !stored.includes('WXYZ'))
    assert.ok(!JSON.stringify(db.prepare('SELECT * FROM settings').all()).includes(TOKEN))
  })

  await t.test('Chat finden: mit gespeichertem oder mitgeschicktem Token, speichert nichts', async () => {
    // Phase V4b: der gespeicherte Bot läuft über den gemeinsamen Update-Leser (lib/telegramUpdates.js) - mit eigener Uhr,
    // damit die Drossel (ein getUpdates je 3 s) den Test nicht ausbremst.
    const { setTelegramUpdatesRuntimeForTests } = require('../lib/telegramUpdates')
    let clock = 1_000_000
    const restoreUpdates = setTelegramUpdatesRuntimeForTests({ now: () => clock, logger })
    t.after(restoreUpdates)
    const tokensAsked = []
    const offsets = []
    telegram.getUpdates = async ({ token, offset }) => {
      tokensAsked.push(token)
      offsets.push(offset)
      return [
        { update_id: 1, message: { chat: { id: 4242, type: 'private', first_name: 'Greta', username: 'greta_b' } } },
        { update_id: 2, my_chat_member: { chat: { id: -100555, type: 'group', title: 'Team Pfoten' } } }
      ]
    }
    const res = await track(admin('/api/admin/notify-settings/chat-finden', { method: 'POST', body: {} }))
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, [
      { id: '-100555', titel: 'Team Pfoten', typ: 'group' },
      { id: '4242', titel: 'Greta @greta_b', typ: 'private' }
    ])
    const other = await track(admin('/api/admin/notify-settings/chat-finden', { method: 'POST', body: { token: OTHER_TOKEN } }))
    assert.equal(other.status, 200)
    assert.deepEqual(tokensAsked, [TOKEN, OTHER_TOKEN])
    assert.equal((await admin('/api/admin/notify-settings/chat-finden', { method: 'POST', body: { token: 'x' } })).status, 400)
    assert.equal(db.prepare("SELECT 1 FROM settings WHERE key = 'telegram_chat_id'").get(), undefined, 'nichts gespeichert')

    // Der gemeinsame Leser bestätigt per offset - gesehene Chats bleiben trotzdem in der Liste (24 Stunden).
    clock += 5000
    telegram.getUpdates = async ({ offset }) => {
      offsets.push(offset)
      return []
    }
    const again = await admin('/api/admin/notify-settings/chat-finden', { method: 'POST' })
    assert.deepEqual(again.data.map((chat) => chat.id), ['-100555', '4242'])
    assert.deepEqual(offsets, [undefined, undefined, 3], 'beim zweiten Mal ab update_id 3, der andere Token ohne offset')
    clock += 25 * 60 * 60 * 1000
    assert.deepEqual((await admin('/api/admin/notify-settings/chat-finden', { method: 'POST' })).data, [], 'nach 24 Stunden vergessen')
    clock += 5000
    telegram.getUpdates = async () => {
      throw rejected(409)
    }
    const webhook = await admin('/api/admin/notify-settings/chat-finden', { method: 'POST' })
    assert.equal(webhook.status, 409)
    assert.match(webhook.data.error, /Webhook/)
  })

  await t.test('PUT telegram: Chat-ID speichern -> eingerichtet (quelle admin), Protokoll ohne Werte', async () => {
    const res = await track(admin('/api/admin/notify-settings/telegram', { method: 'PUT', body: { chatId: '-100555' } }))
    assert.equal(res.status, 200)
    assert.deepEqual(
      { eingerichtet: res.data.eingerichtet, quelle: res.data.quelle, tokenHinweis: res.data.tokenHinweis, chatId: res.data.chatId },
      { eingerichtet: true, quelle: 'admin', tokenHinweis: '…WXYZ', chatId: '-100555' }
    )
    assert.equal(telegram.getMeCalls.at(-1), TOKEN, 'nur die Chat-ID geändert -> kein neuer getMe-Aufruf')

    const log = await admin('/api/admin/log')
    const entries = log.data.filter((entry) => entry.aktion.startsWith('telegram-'))
    assert.deepEqual(entries.map((entry) => [entry.aktion, entry.ziel]), [
      ['telegram-eingerichtet', 'telegram'],
      ['telegram-eingerichtet', 'telegram']
    ])
    assert.ok(!JSON.stringify(log.data).includes(TOKEN))
  })

  await t.test('Testnachricht: einmal, synchron; Fehler 502 mit allgemeiner Meldung', async () => {
    telegram.sendMessage = async () => ({ message_id: 1 })
    const ok = await track(admin('/api/admin/notify-test', { method: 'POST' }))
    assert.equal(ok.status, 200)
    assert.deepEqual(ok.data, { ok: true })
    assert.equal(telegram.sent.length, 1)
    assert.deepEqual({ token: telegram.sent[0].token, chatId: telegram.sent[0].chatId }, { token: TOKEN, chatId: '-100555' })
    assert.match(telegram.sent[0].text, /Testnachricht von Familie auf Pfoten/)

    telegram.sendMessage = async () => {
      throw rejected(400)
    }
    const failed = await track(admin('/api/admin/notify-test', { method: 'POST' }))
    assert.equal(failed.status, 502)
    assert.ok(failed.data.error)
    assert.equal(telegram.sent.length, 2, 'kein zweiter Versuch')
    assert.deepEqual(logged, ['Telegram-Benachrichtigung fehlgeschlagen (400)'])
  })

  await t.test('Löschen: leerer Token entfernt ihn (Protokoll telegram-entfernt), dann nicht mehr eingerichtet', async () => {
    const res = await track(admin('/api/admin/notify-settings/telegram', { method: 'PUT', body: { token: '' } }))
    assert.equal(res.status, 200)
    assert.equal(res.data.eingerichtet, false)
    assert.equal(res.data.tokenHinweis, null)
    assert.equal(res.data.chatId, '-100555')
    assert.equal(db.prepare("SELECT 1 FROM settings WHERE key = 'telegram_bot_token_cipher'").get(), undefined)
    const log = await admin('/api/admin/log')
    assert.equal(log.data[0].aktion, 'telegram-entfernt')
    assert.equal(log.data[0].ziel, 'telegram')

    const noToken = await admin('/api/admin/notify-settings/chat-finden', { method: 'POST' })
    assert.equal(noToken.status, 409)
    assert.equal(noToken.data.error, 'Zuerst den Bot-Token speichern.')
  })

  await t.test('nicht eingerichtet: ein Ereignis (neue Registrierung) verschickt nichts', async () => {
    const { flushNotificationsForTests } = require('../lib/notify')
    const before = telegram.sent.length
    const household = await createHousehold(base, 'Zuhause ohne Telegram')
    assert.equal(household.status, 201)
    await flushNotificationsForTests()
    assert.equal(telegram.sent.length, before)
  })

  await t.test('der Token steht in keiner Antwort und in keiner Logzeile', () => {
    const everything = [...responses, ...logged].join('\n')
    assert.ok(!everything.includes(TOKEN))
    assert.ok(!everything.includes(TOKEN.split(':')[1]))
  })
})
