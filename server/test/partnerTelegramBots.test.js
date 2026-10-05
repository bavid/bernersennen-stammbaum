const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Partner richten ihren eigenen Telegram-Bot ein (/api/partner-area/telegram/bot, lib/partnerTelegramBots.js): Token
// per getMe geprüft und verschlüsselt (AAD je Partner) gespeichert, nie zurückgegeben oder geloggt. Reihenfolge beim
// Versand: eigener Bot, sonst der Bot des Teams (Admin), sonst nichts. Der Update-Leser (lib/telegramUpdates.js) liest
// je Bot mit eigenem offset; ein Bot-Wechsel macht ein "neu verbinden" nötig. Telegram ist ein Fake-Client, nie das
// Netz. Token, Chat-IDs und Namen sind erfunden. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-telegram-bots-1'
const PLATFORM_TOKEN = '646464:PLATTFORM-token_nur-fuer-tests-abcdQRST'
const OWN_TOKEN = '737373:EIGENER-token_nur-fuer-tests-wxyzUVWX'
const OTHER_TOKEN = '828282:ZWEITER-token_nur-fuer-tests-klmnOPQR'
const PLATFORM_BOT = 'pfoten_hinweis_bot'
const OWN_BOT = 'lindenhof_hinweis_bot'
const OTHER_BOT = 'lindenhof_zwei_bot'
const PORTAL_TEXT = 'Kleine Gruppen, viel Geduld und jede Menge Leckerli – so arbeiten wir mit euren Hunden.'
const OWN_CHAT = 515151
const PLATFORM_CHAT = 616161
const dataDir = useTempDataDir('partner-telegram-bots', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })
delete process.env.TELEGRAM_BOT_TOKEN
delete process.env.TELEGRAM_CHAT_ID

const BOTS = { [PLATFORM_TOKEN]: PLATFORM_BOT, [OWN_TOKEN]: OWN_BOT, [OTHER_TOKEN]: OTHER_BOT }

function rejected(upstreamStatus) {
  return Object.assign(new Error(`Unerwarteter Status ${upstreamStatus}`), { status: 502, upstreamStatus })
}

function startMessage(updateId, chatId, text) {
  return { update_id: updateId, message: { message_id: updateId, text, chat: { id: chatId, type: 'private', first_name: 'Greta' } } }
}

function buttonPress(updateId, chatId, data) {
  return {
    update_id: updateId,
    callback_query: { id: `cb-${updateId}`, data, from: { id: chatId }, message: { message_id: updateId, chat: { id: chatId, type: 'private' } } }
  }
}

test('Eigener Telegram-Bot je Partner: speichern, Reihenfolge, Verbinden je Bot, Wechsel, Grenzen', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { setTelegramClientForTests } = require('../lib/telegram')
  const { setTelegramUpdatesRuntimeForTests, flushTelegramRepliesForTests, OFFSET_KEY } = require('../lib/telegramUpdates')
  const { setPartnerNotifyRuntimeForTests, flushPartnerNotificationsForTests, notifyPartner } = require('../lib/partnerNotify')
  const { decryptSecret } = require('../lib/codes')
  const { EXPIRED_REPLY, WRONG_BOT_REPLY } = require('../lib/partnerTelegram')
  const { UPDATES_LIMIT } = require('../lib/telegram')

  // Updates liegen je Bot-Token bereit - wie bei Telegram bekommt jeder Bot nur seine eigenen.
  const telegram = { updates: new Map(), getUpdatesCalls: [], sent: [], answered: [], sendError: null, getMeError: null }
  const restoreClient = setTelegramClientForTests({
    getMe: async ({ token }) => {
      if (telegram.getMeError) {
        const err = telegram.getMeError
        telegram.getMeError = null
        throw err
      }
      return { id: Number(token.split(':')[0]), is_bot: true, username: BOTS[token] }
    },
    getUpdates: (args) => {
      telegram.getUpdatesCalls.push(args)
      const list = telegram.updates.get(args.token) || []
      return Promise.resolve(list.splice(0, UPDATES_LIMIT))
    },
    answerCallbackQuery: async ({ callbackQueryId }) => {
      telegram.answered.push(callbackQueryId)
      return true
    },
    sendMessage: async (args) => {
      telegram.sent.push(args)
      if (telegram.sendError) throw telegram.sendError
      return { message_id: telegram.sent.length }
    }
  })
  const logged = []
  const logger = { log: (line) => logged.push(line), warn: (line) => logged.push(line), error: (line) => logged.push(line) }
  let clock = 2_000_000_000
  const restoreUpdates = setTelegramUpdatesRuntimeForTests({ now: () => clock, logger })
  const restoreNotify = setPartnerNotifyRuntimeForTests({ logger, retryDelaysMs: [0, 0], now: () => clock })
  const { server, base } = await startApp()
  t.after(() => {
    restoreNotify()
    restoreUpdates()
    restoreClient()
    cleanup(dataDir, server)
  })
  const db = require('../db')

  const responses = []
  async function request(urlPath, { method = 'GET', body, cookie } = {}) {
    const res = await call(base, urlPath, { method, body, cookie })
    responses.push(JSON.stringify(res.data))
    return res
  }
  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const admin = (urlPath, options = {}) => request(urlPath, { ...options, cookie: adminCookie })
  const TG = '/api/partner-area/telegram'
  const advance = (ms = 5000) => {
    clock += ms
  }
  async function settle() {
    await flushTelegramRepliesForTests()
    await flushPartnerNotificationsForTests()
  }
  const sentTo = (chatId) => telegram.sent.filter((message) => message.chatId === String(chatId))
  const offsetRow = (key) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? JSON.parse(row.value) : null
  }

  let counter = 0
  async function createPartnerArea(overrides = {}) {
    counter += 1
    const input = { name: `Hundeschule Lindenhof ${counter}`, slug: `hundeschule-lindenhof-${counter}`, typ: 'hundeschule', plz: '10115', portalText: PORTAL_TEXT, status: 'aktiv', ...overrides }
    const partner = await admin('/api/admin/partners', { method: 'POST', body: input })
    assert.equal(partner.status, 201)
    const area = await admin(`/api/admin/partners/${partner.data.id}/area`, { method: 'POST' })
    assert.equal(area.status, 201)
    const login = await call(base, '/api/login', { method: 'POST', body: { secret: area.data.key } })
    return { partner: partner.data, familyId: area.data.familyId, cookie: getCookie(login.res) }
  }
  const own = await createPartnerArea({ name: 'Hundeschule Lindenhof' })
  const plain = await createPartnerArea({ name: 'Hundesalon Fellnase', typ: 'hundesalon' })
  const ownApi = (urlPath, options = {}) => request(`${TG}${urlPath}`, { ...options, cookie: own.cookie })
  const plainApi = (urlPath, options = {}) => request(`${TG}${urlPath}`, { ...options, cookie: plain.cookie })
  const codeOf = (url) => new URL(url).searchParams.get('start')
  const ownBotId = OWN_TOKEN.split(':')[0]

  await t.test('ohne Bot: Status ohne Bot, Verbinden 409 – und der eigene Bot lässt sich nur im richtigen Format speichern', async () => {
    const status = await ownApi('')
    assert.equal(status.status, 200)
    assert.equal(status.headers.get('cache-control'), 'no-store')
    assert.deepEqual(status.data, { eingerichtet: false, verbunden: false, getrennt: null, hinweise: { nachricht: false, freigabe: false }, bot: null })
    assert.equal((await ownApi('/verbinden', { method: 'POST' })).status, 409)

    for (const body of [undefined, [], { token: 'kein-token' }, { token: 123 }, { token: OWN_TOKEN, chatId: '1' }, {}]) {
      const res = await plainApi('/bot', { method: 'PUT', body })
      assert.equal(res.status, 400, JSON.stringify(body))
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM partner_telegram_bots').get().c, 0)
  })

  await t.test('speichern: Telegram prüft den Token (getMe) – abgelehnt 400 und nichts gespeichert, nicht erreichbar 502', async () => {
    telegram.getMeError = rejected(401)
    const refused = await ownApi('/bot', { method: 'PUT', body: { token: OWN_TOKEN } })
    assert.equal(refused.status, 400)
    assert.match(refused.data.error, /nicht angenommen/)
    telegram.getMeError = Object.assign(new Error('timeout'), { status: 504 })
    const unreachable = await ownApi('/bot', { method: 'PUT', body: { token: OWN_TOKEN } })
    assert.equal(unreachable.status, 502)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM partner_telegram_bots').get().c, 0)
  })

  await t.test('gespeichert: verschlüsselt mit AAD je Partner, Status nennt nur den Bot-Namen, der Token steht nirgends', async () => {
    const saved = await ownApi('/bot', { method: 'PUT', body: { token: OWN_TOKEN } })
    assert.equal(saved.status, 200)
    assert.equal(saved.headers.get('cache-control'), 'no-store')
    assert.deepEqual(saved.data, {
      eingerichtet: true,
      verbunden: false,
      getrennt: null,
      hinweise: { nachricht: false, freigabe: false },
      bot: { quelle: 'eigener', username: OWN_BOT }
    })
    const row = db.prepare('SELECT * FROM partner_telegram_bots WHERE partner_id = ?').get(own.partner.id)
    assert.ok(row.token_cipher && !row.token_cipher.includes(OWN_TOKEN.split(':')[1]))
    assert.equal(row.bot_username, OWN_BOT)
    assert.equal(decryptSecret(row.token_cipher, `partner_telegram_bot:${own.partner.id}`, { allowLegacy: false }), OWN_TOKEN)
    assert.throws(() => decryptSecret(row.token_cipher, `partner_telegram_bot:${plain.partner.id}`, { allowLegacy: false }), 'an diesen Partner gebunden')
    assert.ok(!responses.some((text) => text.includes(OWN_TOKEN.split(':')[1])), 'der Token steht in keiner Antwort')
    assert.ok(!logged.some((line) => line.includes(OWN_TOKEN.split(':')[1])), 'der Token steht in keinem Log')
    const list = await admin('/api/admin/partners')
    assert.equal(list.data.find((partner) => partner.id === own.partner.id).telegram_eigener_bot, 1)
    assert.equal(list.data.find((partner) => partner.id === plain.partner.id).telegram_eigener_bot, 0)
    assert.ok(!JSON.stringify(list.data).includes(OWN_TOKEN.split(':')[1]))
  })

  let ownCode
  await t.test('verbinden über den eigenen Bot: Link mit eigenem Bot-Namen, Leser fragt mit dem eigenen Token und eigenem offset', async () => {
    const link = await ownApi('/verbinden', { method: 'POST' })
    assert.equal(link.status, 201)
    assert.match(link.data.url, new RegExp(`^https://t\\.me/${OWN_BOT}\\?start=[A-Za-z0-9_-]{22}$`))
    ownCode = codeOf(link.data.url)

    telegram.updates.set(OWN_TOKEN, [startMessage(201, OWN_CHAT, `/start ${ownCode}`)])
    const checked = await ownApi('/pruefen', { method: 'POST' })
    assert.equal(checked.status, 200)
    assert.equal(checked.data.verbunden, false)
    assert.equal(telegram.getUpdatesCalls.at(-1).token, OWN_TOKEN)
    await settle()
    assert.match(sentTo(OWN_CHAT)[0].text, /^Möchtest du hier Hinweise von Familie auf Pfoten für „Hundeschule Lindenhof“ bekommen\?/)
    assert.equal(sentTo(OWN_CHAT)[0].token, OWN_TOKEN, 'die Rückfrage geht über den eigenen Bot')
    assert.deepEqual(offsetRow(`${OFFSET_KEY}:${ownBotId}`), { bot: ownBotId, offset: 202 })
    assert.equal(offsetRow(OFFSET_KEY), null, 'der Schlüssel des Team-Bots bleibt unberührt')

    advance()
    telegram.updates.set(OWN_TOKEN, [buttonPress(202, OWN_CHAT, `ja:${ownCode}`)])
    const connected = await ownApi('/pruefen', { method: 'POST' })
    assert.equal(connected.data.verbunden, true)
    assert.deepEqual(connected.data.bot, { quelle: 'eigener', username: OWN_BOT })
    await settle()
    assert.deepEqual(telegram.answered, ['cb-202'])
  })

  await t.test('Reihenfolge: eigener Bot vor Team-Bot – Hinweis und Testnachricht gehen über den eigenen Token', async () => {
    const saved = await admin('/api/admin/notify-settings/telegram', { method: 'PUT', body: { token: PLATFORM_TOKEN } })
    assert.equal(saved.status, 200)
    const status = await ownApi('')
    assert.deepEqual(status.data.bot, { quelle: 'eigener', username: OWN_BOT }, 'der eigene Bot bleibt vorn')
    const before = telegram.sent.length
    await notifyPartner(own.partner.id, 'nachricht')
    await settle()
    assert.equal(telegram.sent.length, before + 1)
    assert.equal(telegram.sent.at(-1).token, OWN_TOKEN)
    assert.equal(telegram.sent.at(-1).chatId, String(OWN_CHAT))
    const testMessage = await ownApi('/test', { method: 'POST' })
    assert.equal(testMessage.status, 200)
    assert.equal(telegram.sent.at(-1).token, OWN_TOKEN)

    const plainStatus = await plainApi('')
    assert.deepEqual(plainStatus.data.bot, { quelle: 'plattform', username: null }, 'ohne eigenen Bot gilt der Team-Bot')
  })

  await t.test('je Bot ein eigener Leser: der Team-Bot liest mit seinem Token und Schlüssel, ein fremder Link bekommt am falschen Bot keine Verbindung', async () => {
    const link = await plainApi('/verbinden', { method: 'POST' })
    assert.match(link.data.url, new RegExp(`^https://t\\.me/${PLATFORM_BOT}\\?start=`))
    const plainCode = codeOf(link.data.url)
    // Die Hundeschule holt sich (schon verbunden) einen weiteren Link - nur mit offenem Link liest ihr Bot überhaupt.
    const secondOwnCode = codeOf((await ownApi('/verbinden', { method: 'POST' })).data.url)
    // Der Link des Salons (Team-Bot) wird irrtümlich beim eigenen Bot der Hundeschule gestartet - und umgekehrt.
    telegram.updates.set(OWN_TOKEN, [startMessage(301, 717171, `/start ${plainCode}`)])
    telegram.updates.set(PLATFORM_TOKEN, [
      startMessage(401, PLATFORM_CHAT, `/start ${plainCode}`),
      startMessage(402, 818181, `/start ${secondOwnCode}`),
      startMessage(403, 919191, `/start ${ownCode}`)
    ])
    advance()
    const ownCheck = await ownApi('/pruefen', { method: 'POST' })
    assert.equal(ownCheck.status, 200)
    assert.equal(telegram.getUpdatesCalls.at(-1).token, OWN_TOKEN)
    const plainCheck = await plainApi('/pruefen', { method: 'POST' })
    assert.equal(plainCheck.status, 200)
    assert.equal(telegram.getUpdatesCalls.at(-1).token, PLATFORM_TOKEN)
    await settle()
    assert.deepEqual(sentTo(717171).map((m) => m.text), [WRONG_BOT_REPLY])
    assert.deepEqual(sentTo(818181).map((m) => m.text), [WRONG_BOT_REPLY], 'der Link der Hundeschule gehört zu ihrem eigenen Bot')
    assert.deepEqual(sentTo(919191).map((m) => m.text), [EXPIRED_REPLY], 'der verbrauchte Code gilt nirgends mehr')
    assert.match(sentTo(PLATFORM_CHAT)[0].text, /Hundesalon Fellnase/)
    assert.equal(sentTo(PLATFORM_CHAT)[0].token, PLATFORM_TOKEN)
    assert.deepEqual(offsetRow(OFFSET_KEY), { bot: PLATFORM_TOKEN.split(':')[0], offset: 404 })
    assert.deepEqual(offsetRow(`${OFFSET_KEY}:${ownBotId}`), { bot: ownBotId, offset: 302 })

    advance()
    telegram.updates.set(PLATFORM_TOKEN, [buttonPress(404, PLATFORM_CHAT, `ja:${plainCode}`)])
    const connected = await plainApi('/pruefen', { method: 'POST' })
    assert.equal(connected.data.verbunden, true)
    await settle()
    const before = telegram.sent.length
    await notifyPartner(plain.partner.id, 'nachricht')
    await settle()
    assert.equal(telegram.sent.length, before + 1)
    assert.equal(telegram.sent.at(-1).token, PLATFORM_TOKEN, 'ohne eigenen Bot über den Team-Bot')
  })

  await t.test('/stop am Team-Bot trennt nur Partner dieses Bots', async () => {
    // Derselbe Mensch (gleiche Chat-ID bei beiden Bots) schreibt dem Team-Bot /stop - die Verbindung über den eigenen
    // Bot der Hundeschule bleibt.
    telegram.updates.set(PLATFORM_TOKEN, [startMessage(501, OWN_CHAT, '/stop')])
    advance()
    await plainApi('/pruefen', { method: 'POST' })
    await settle()
    assert.equal((await ownApi('')).data.verbunden, true)
    assert.equal((await plainApi('')).data.verbunden, true, 'der Salon hängt an einer anderen Chat-ID')
  })

  await t.test('Bot wechseln: die Verbindung braucht ein neues Verbinden ("bot-gewechselt"), offene Links verfallen', async () => {
    const changed = await ownApi('/bot', { method: 'PUT', body: { token: OTHER_TOKEN } })
    assert.equal(changed.status, 200)
    assert.deepEqual(changed.data, {
      eingerichtet: true,
      verbunden: false,
      getrennt: 'bot-gewechselt',
      hinweise: { nachricht: false, freigabe: false },
      bot: { quelle: 'eigener', username: OTHER_BOT }
    })
    const row = db.prepare('SELECT chat_cipher, chat_hash FROM partner_telegram WHERE partner_id = ?').get(own.partner.id)
    assert.equal(row.chat_cipher, null)
    assert.equal(row.chat_hash, null)
    assert.equal(await notifyPartner(own.partner.id, 'nachricht'), null, 'nichts geht raus, solange nicht neu verbunden')

    // Denselben Bot noch einmal speichern ändert nichts am Zustand.
    const same = await ownApi('/bot', { method: 'PUT', body: { token: OTHER_TOKEN } })
    assert.equal(same.data.getrennt, 'bot-gewechselt')

    const link = await ownApi('/verbinden', { method: 'POST' })
    assert.match(link.data.url, new RegExp(`^https://t\\.me/${OTHER_BOT}\\?start=`))
    const code = codeOf(link.data.url)
    telegram.updates.set(OTHER_TOKEN, [startMessage(601, OWN_CHAT, `/start ${code}`), buttonPress(602, OWN_CHAT, `ja:${code}`)])
    advance()
    const connected = await ownApi('/pruefen', { method: 'POST' })
    assert.equal(connected.data.verbunden, true)
    assert.equal(connected.data.getrennt, null)
    assert.equal(telegram.getUpdatesCalls.at(-1).token, OTHER_TOKEN)
    await settle()
  })

  await t.test('403 am eigenen Bot: Verbindung beendet ("blockiert"), der Bot bleibt eingerichtet', async () => {
    telegram.sendError = rejected(403)
    const res = await ownApi('/test', { method: 'POST' })
    telegram.sendError = null
    assert.equal(res.status, 409)
    const status = await ownApi('')
    assert.equal(status.data.verbunden, false)
    assert.equal(status.data.getrennt, 'blockiert')
    assert.deepEqual(status.data.bot, { quelle: 'eigener', username: OTHER_BOT })
  })

  await t.test('Bot entfernen: zurück zum Team-Bot – eine bestehende Verbindung braucht neues Verbinden; ohne Team-Bot nichts eingerichtet', async () => {
    const link = await ownApi('/verbinden', { method: 'POST' })
    const code = codeOf(link.data.url)
    telegram.updates.set(OTHER_TOKEN, [startMessage(701, OWN_CHAT, `/start ${code}`), buttonPress(702, OWN_CHAT, `ja:${code}`)])
    advance()
    assert.equal((await ownApi('/pruefen', { method: 'POST' })).data.verbunden, true)
    await settle()

    const removed = await ownApi('/bot', { method: 'DELETE' })
    assert.equal(removed.status, 200)
    assert.deepEqual(removed.data.bot, { quelle: 'plattform', username: null })
    assert.equal(removed.data.verbunden, false)
    assert.equal(removed.data.getrennt, 'bot-gewechselt')
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM partner_telegram_bots WHERE partner_id = ?').get(own.partner.id).c, 0)
    assert.equal((await ownApi('/bot', { method: 'DELETE' })).status, 200, 'noch einmal entfernen ist harmlos')

    const cleared = await admin('/api/admin/notify-settings/telegram', { method: 'PUT', body: { token: '' } })
    assert.equal(cleared.status, 200)
    const status = await ownApi('')
    assert.equal(status.data.eingerichtet, false)
    assert.equal(status.data.bot, null)
    assert.equal(await notifyPartner(plain.partner.id, 'nachricht'), null)
  })

  await t.test('Demo-Partner: Bot speichern und entfernen 403, lesen geht', async () => {
    const demo = await createPartnerArea({ name: 'Hundeschule Demo-Wiese' })
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.familyId)
    db.prepare('UPDATE partners SET is_demo = 1 WHERE id = ?').run(demo.partner.id)
    const demoApi = (urlPath, options = {}) => request(`${TG}${urlPath}`, { ...options, cookie: demo.cookie })
    assert.equal((await demoApi('')).status, 200)
    assert.equal((await demoApi('/bot', { method: 'PUT', body: { token: OWN_TOKEN } })).status, 403)
    assert.equal((await demoApi('/bot', { method: 'DELETE' })).status, 403)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM partner_telegram_bots').get().c, 0)
  })

  await t.test('höchstens 10 Speicherversuche je Stunde und Partner', async () => {
    // Der Salon hat oben schon sechs Versuche hinter sich (die Formatprüfungen) - nach dem zehnten ist Schluss.
    let last
    for (let i = 0; i < 6; i += 1) last = await plainApi('/bot', { method: 'PUT', body: { token: 'kaputt' } })
    assert.equal(last.status, 429)
    assert.match(last.data.error, /Zu viele/)
    assert.equal((await ownApi('/bot', { method: 'PUT', body: { token: 'kaputt' } })).status, 400, 'je Partner gezählt')
  })
})
