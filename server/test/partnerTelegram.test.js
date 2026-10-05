const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Phase V4b: Telegram-Hinweise für Partner (/api/partner-area/telegram, lib/partnerTelegram.js, lib/telegramUpdates.js,
// lib/partnerNotify.js). Telegram ist ein Fake-Client (lib/telegram.js setTelegramClientForTests), nie das Netz; Uhr und
// Logger der Leser/Versender sind ausgetauscht. Ohne TELEGRAM_* in der Umgebung - der Bot kommt über den Admin. Token,
// Chat-IDs und Namen sind erfunden. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-telegram-1'
const TOKEN = '646464:PARTNER-token_nur-fuer-tests-abcdQRST'
const BOT = 'pfoten_hinweis_bot'
const PORTAL_TEXT = 'Kleine Gruppen, viel Geduld und jede Menge Leckerli – so arbeiten wir mit euren Hunden.'
const ADMIN_CHAT = 4242
const PARTNER_CHAT = 515151
const SENDER = { name: 'Mara Beispiel', email: 'mara@example.org', nachricht: 'Habt ihr im Oktober noch einen Platz im Welpenkurs frei?' }
const dataDir = useTempDataDir('partner-telegram', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300', CONTACT_RATE_LIMIT: '500' })
delete process.env.TELEGRAM_BOT_TOKEN
delete process.env.TELEGRAM_CHAT_ID

function rejected(upstreamStatus) {
  return Object.assign(new Error(`Unerwarteter Status ${upstreamStatus}`), { status: 502, upstreamStatus })
}

function startMessage(updateId, chatId, text) {
  return { update_id: updateId, message: { message_id: updateId, text, chat: { id: chatId, type: 'private', first_name: 'Greta' } } }
}

// Ein Tippen auf einen Knopf der Rückfrage ("ja:<code>"/"nein:<code>") - from ist, wer getippt hat.
function buttonPress(updateId, chatId, data, fromId = chatId) {
  return {
    update_id: updateId,
    callback_query: { id: `cb-${updateId}`, data, from: { id: fromId }, message: { message_id: updateId, chat: { id: chatId, type: 'private' } } }
  }
}

test('Telegram-Hinweise für Partner: verbinden, prüfen, Hinweise, Testnachricht, trennen', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { setTelegramClientForTests } = require('../lib/telegram')
  const { setTelegramUpdatesRuntimeForTests, flushTelegramRepliesForTests, OFFSET_KEY } = require('../lib/telegramUpdates')
  const { setPartnerNotifyRuntimeForTests, flushPartnerNotificationsForTests, notifyPartner, CAP_PER_WINDOW, CAP_WARNING_TEXT } = require('../lib/partnerNotify')
  const { flushNotificationsForTests } = require('../lib/notify')
  const { decryptSecret } = require('../lib/codes')
  const { EXPIRED_REPLY, DECLINED_REPLY, STOPPED_REPLY } = require('../lib/partnerTelegram')
  const { UPDATES_LIMIT } = require('../lib/telegram')

  const telegram = { updates: [], getUpdatesCalls: [], sent: [], answered: [], sendError: null }
  const restoreClient = setTelegramClientForTests({
    getMe: async () => ({ id: 646464, is_bot: true, username: BOT }),
    // Wie Telegram: höchstens UPDATES_LIMIT je Aufruf, der Rest beim nächsten. updatesError wird einmal SYNCHRON geworfen.
    getUpdates: (args) => {
      telegram.getUpdatesCalls.push(args)
      if (telegram.updatesError) {
        const err = telegram.updatesError
        telegram.updatesError = null
        throw err
      }
      return Promise.resolve(telegram.updates.splice(0, UPDATES_LIMIT))
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
    await flushNotificationsForTests()
  }
  const sentTo = (chatId) => telegram.sent.filter((message) => message.chatId === String(chatId)).map((message) => message.text)

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
  const school = await createPartnerArea({ name: 'Hundeschule Pfotenweg' })
  const partnerApi = (urlPath, options = {}) => request(`${TG}${urlPath}`, { ...options, cookie: school.cookie })
  const codeOf = (url) => new URL(url).searchParams.get('start')

  await t.test('ohne Bot im Admin: "nicht eingerichtet", Verbinden/Prüfen/Test 409', async () => {
    const status = await partnerApi('')
    assert.equal(status.status, 200)
    assert.equal(status.headers.get('cache-control'), 'no-store')
    assert.deepEqual(status.data, { eingerichtet: false, verbunden: false, getrennt: null, hinweise: { nachricht: false, freigabe: false }, bot: null })
    for (const urlPath of ['/verbinden', '/pruefen', '/test']) {
      const res = await partnerApi(urlPath, { method: 'POST' })
      assert.equal(res.status, 409, urlPath)
      assert.equal(res.data.error, 'Telegram ist noch nicht eingerichtet.')
    }
    assert.equal(telegram.getUpdatesCalls.length, 0)
  })

  let firstCode
  let code
  await t.test('Verbinden: Einmal-Link https://t.me/<bot>?start=<code>, gespeichert nur als HMAC; ein neuer Link ersetzt den alten', async () => {
    const saved = await admin('/api/admin/notify-settings/telegram', { method: 'PUT', body: { token: TOKEN } })
    assert.equal(saved.status, 200)
    assert.equal((await partnerApi('')).data.eingerichtet, true)

    const first = await partnerApi('/verbinden', { method: 'POST' })
    assert.equal(first.status, 201)
    assert.match(first.data.url, new RegExp(`^https://t\\.me/${BOT}\\?start=[A-Za-z0-9_-]{22}$`))
    assert.equal(first.data.gueltigMinuten, 15)
    firstCode = codeOf(first.data.url)
    const second = await partnerApi('/verbinden', { method: 'POST' })
    code = codeOf(second.data.url)
    assert.notEqual(code, firstCode)

    const rows = db.prepare('SELECT * FROM partner_telegram_codes WHERE partner_id = ?').all(school.partner.id)
    assert.equal(rows.length, 1, 'nur der neueste Code gilt')
    assert.ok(!JSON.stringify(db.prepare('SELECT * FROM partner_telegram_codes').all()).includes(code), 'kein Klartext in der Datenbank')
  })

  await t.test('Prüfen: EIN Leser verteilt einen Stapel - der Bot fragt erst nach, der Admin-Chat bleibt für "Chat finden"', async () => {
    telegram.updates = [
      startMessage(101, ADMIN_CHAT, '/start'),
      startMessage(102, PARTNER_CHAT, `/start ${code}`),
      startMessage(103, 616161, '/start falscher-code-0000000000'),
      startMessage(104, 717171, `/start ${firstCode}`),
      { update_id: 105, my_chat_member: { chat: { id: -100555, type: 'group', title: 'Team Pfoten' } } }
    ]
    const res = await partnerApi('/pruefen', { method: 'POST' })
    assert.equal(res.status, 200)
    assert.equal(res.data.verbunden, false, 'erst nach "Ja" verbunden')
    await settle()
    const question = telegram.sent.find((message) => message.chatId === String(PARTNER_CHAT))
    assert.match(question.text, /^Möchtest du hier Hinweise von Familie auf Pfoten für „Hundeschule Pfotenweg“ bekommen\?/)
    assert.deepEqual(question.replyMarkup, {
      inline_keyboard: [[{ text: 'Ja, Hinweise aktivieren', callback_data: `ja:${code}` }, { text: 'Nein', callback_data: `nein:${code}` }]]
    })
    assert.deepEqual(sentTo(616161), [EXPIRED_REPLY])
    assert.deepEqual(sentTo(717171), [EXPIRED_REPLY], 'der ersetzte Code gilt nicht mehr')
    assert.deepEqual(sentTo(ADMIN_CHAT), [], 'ein einfaches /start bekommt keine Antwort')
    const offset = JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get(OFFSET_KEY).value)
    assert.deepEqual(offset, { bot: '646464', offset: 106 })

    // Ein fremder Chat kann den Knopf nicht für diesen Chat drücken; dann "Ja" aus dem richtigen Chat.
    telegram.updates = [buttonPress(106, PARTNER_CHAT, `ja:${code}`, 999999), buttonPress(107, PARTNER_CHAT, `ja:${code}`)]
    advance()
    const connected = await partnerApi('/pruefen', { method: 'POST' })
    assert.deepEqual(connected.data, { eingerichtet: true, verbunden: true, getrennt: null, hinweise: { nachricht: true, freigabe: true }, bot: { quelle: 'plattform', username: null } })
    await settle()
    assert.deepEqual(telegram.answered, ['cb-106', 'cb-107'], 'jeder Knopf wird bestätigt')
    assert.equal(sentTo(PARTNER_CHAT).at(-1), 'Verbunden: Familie auf Pfoten schickt dir hier Hinweise für Hundeschule Pfotenweg. Mit /stop beendest du das jederzeit.')

    advance()
    telegram.updates = [startMessage(108, PARTNER_CHAT, 'Hallo Bot')]
    const chats = await admin('/api/admin/notify-settings/chat-finden', { method: 'POST' })
    assert.equal(chats.status, 200)
    assert.deepEqual(chats.data.map((chat) => chat.id), ['-100555', String(ADMIN_CHAT)], 'weder /start-Codes noch verbundene Partner-Chats beim Admin')
    assert.equal(telegram.getUpdatesCalls.at(-1).offset, 108)
  })

  await t.test('die Chat-ID liegt verschlüsselt (AAD je Partner) und steht in keiner Antwort', async () => {
    const row = db.prepare('SELECT * FROM partner_telegram WHERE partner_id = ?').get(school.partner.id)
    assert.ok(row.chat_cipher && !row.chat_cipher.includes(String(PARTNER_CHAT)))
    assert.ok(row.chat_hash && !row.chat_hash.includes(String(PARTNER_CHAT)), 'für /stop nur ein HMAC')
    assert.equal(decryptSecret(row.chat_cipher, `partner_telegram_chat:${school.partner.id}`), String(PARTNER_CHAT))
    assert.throws(() => decryptSecret(row.chat_cipher, `partner_telegram_chat:${school.partner.id + 1}`), 'an diesen Partner gebunden')
    const list = await admin('/api/admin/partners')
    const listed = list.data.find((partner) => partner.id === school.partner.id)
    assert.equal(listed.telegram_verbunden, 1)
    assert.ok(!JSON.stringify(list.data).includes(row.chat_cipher))
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_telegram_codes WHERE partner_id = ?').get(school.partner.id).n, 0)
  })

  await t.test('ein benutzter Code wirkt kein zweites Mal; ein abgelaufener nie; "Nein" verbindet nicht; ohne offenen Code keine Abfrage', async () => {
    const other = await createPartnerArea({ name: 'Hundesalon Kiesel', typ: 'hundesalon' })
    const otherApi = (urlPath, options = {}) => request(`${TG}${urlPath}`, { ...options, cookie: other.cookie })
    const link = await otherApi('/verbinden', { method: 'POST' })
    const otherCode = codeOf(link.data.url)
    db.prepare("UPDATE partner_telegram_codes SET expires_at = datetime('now', '-1 minute') WHERE partner_id = ?").run(other.partner.id)
    advance()
    telegram.updates = [startMessage(201, 818181, `/start ${otherCode}`), buttonPress(202, 919191, `ja:${code}`)]
    const callsBefore = telegram.getUpdatesCalls.length
    const res = await otherApi('/pruefen', { method: 'POST' })
    assert.equal(telegram.getUpdatesCalls.length, callsBefore, 'kein offener (gültiger) Code -> keine Abfrage')
    assert.equal(res.data.verbunden, false)

    const declined = codeOf((await otherApi('/verbinden', { method: 'POST' })).data.url)
    telegram.updates.push(buttonPress(203, 828282, `nein:${declined}`), buttonPress(204, 828282, `ja:${declined}`))
    advance()
    const checked = await otherApi('/pruefen', { method: 'POST' })
    await settle()
    assert.equal(checked.data.verbunden, false)
    assert.deepEqual(sentTo(818181), [EXPIRED_REPLY], 'abgelaufen')
    assert.deepEqual(sentTo(919191), [EXPIRED_REPLY], 'schon benutzt')
    assert.deepEqual(sentTo(828282), [DECLINED_REPLY, EXPIRED_REPLY], '"Nein" verbraucht den Code')
    const row = db.prepare('SELECT chat_cipher FROM partner_telegram WHERE partner_id = ?').get(school.partner.id)
    assert.equal(decryptSecret(row.chat_cipher, `partner_telegram_chat:${school.partner.id}`), String(PARTNER_CHAT), 'Pfotenweg bleibt verbunden')

    const fresh = codeOf((await otherApi('/verbinden', { method: 'POST' })).data.url)
    telegram.updates = [startMessage(205, 838383, `/start ${fresh}`), buttonPress(206, 838383, `ja:${fresh}`)]
    advance()
    assert.equal((await otherApi('/pruefen', { method: 'POST' })).data.verbunden, true)
    await otherApi('', { method: 'DELETE' })
  })

  await t.test('volle Stapel: bis zu vier Abfragen nacheinander - eine Flut verdrängt den echten Code nicht; /stop trennt', async () => {
    const other = await createPartnerArea({ name: 'Hundepension Wiesental', typ: 'betreuung' })
    const otherApi = (urlPath, options = {}) => request(`${TG}${urlPath}`, { ...options, cookie: other.cookie })
    const fresh = codeOf((await otherApi('/verbinden', { method: 'POST' })).data.url)
    const flood = Array.from({ length: UPDATES_LIMIT + 10 }, (_, i) => startMessage(400 + i, 848484, `Werbung ${i}`))
    telegram.updates = [...flood, startMessage(500, 858585, `/start ${fresh}`), buttonPress(501, 858585, `ja:${fresh}`)]
    advance()
    const before = telegram.getUpdatesCalls.length
    assert.equal((await otherApi('/pruefen', { method: 'POST' })).data.verbunden, true)
    assert.equal(telegram.getUpdatesCalls.length, before + 2)
    await settle()
    // "/stop" im Chat trennt alle Partner dieses Chats.
    await otherApi('/verbinden', { method: 'POST' })
    telegram.updates = [startMessage(502, 858585, '/stop')]
    advance()
    assert.equal((await otherApi('/pruefen', { method: 'POST' })).data.verbunden, false)
    await settle()
    assert.equal(sentTo(858585).at(-1), STOPPED_REPLY)
    await otherApi('', { method: 'DELETE' })
  })

  await t.test('Drossel: höchstens ein getUpdates je 3 s für alle zusammen', async () => {
    const link = await partnerApi('/verbinden', { method: 'POST' })
    assert.equal(link.status, 201)
    advance()
    const before = telegram.getUpdatesCalls.length
    await Promise.all([partnerApi('/pruefen', { method: 'POST' }), partnerApi('/pruefen', { method: 'POST' })])
    advance(1000)
    await partnerApi('/pruefen', { method: 'POST' })
    await admin('/api/admin/notify-settings/chat-finden', { method: 'POST' })
    assert.equal(telegram.getUpdatesCalls.length, before + 1)
    advance(3000)
    await partnerApi('/pruefen', { method: 'POST' })
    assert.equal(telegram.getUpdatesCalls.length, before + 2)
    assert.equal((await partnerApi('')).data.verbunden, true, 'ein neuer Link trennt nicht')
  })

  await t.test('ein Fehler beim Abfragen (auch synchron geworfen) blockiert den Leser nicht dauerhaft', async () => {
    await partnerApi('/verbinden', { method: 'POST' })
    telegram.updatesError = Object.assign(new Error('Zeitüberschreitung'), { status: 504 })
    advance()
    const failed = await partnerApi('/pruefen', { method: 'POST' })
    assert.equal(failed.status, 502)
    assert.equal(failed.data.error, 'Telegram ist gerade nicht erreichbar – bitte gleich noch einmal versuchen.')
    advance()
    assert.equal((await partnerApi('/pruefen', { method: 'POST' })).status, 200, 'der nächste Versuch läuft wieder')
  })

  await t.test('neue Nachricht über "Schreib uns": ein Hinweis ohne Name, Kontaktdaten oder Text; Schalter aus -> keiner', async () => {
    const before = telegram.sent.length
    const contact = await call(base, `/api/public/partners/${school.partner.slug}/contact`, { method: 'POST', body: SENDER })
    assert.equal(contact.status, 201)
    await settle()
    const texts = telegram.sent.slice(before).map((message) => message.text)
    assert.deepEqual(texts, ['🐾 Neue Nachricht über „Schreib uns“ – lesen im Partner-Bereich unter „Nachrichten“.'])
    assert.equal(telegram.sent.at(-1).chatId, String(PARTNER_CHAT))
    assert.equal(telegram.sent.at(-1).token, TOKEN)
    for (const value of Object.values(SENDER)) assert.ok(!texts[0].includes(value))

    const off = await partnerApi('/hinweise', { method: 'PUT', body: { nachricht: false } })
    assert.deepEqual(off.data.hinweise, { nachricht: false, freigabe: true })
    await call(base, `/api/public/partners/${school.partner.slug}/contact`, { method: 'POST', body: SENDER })
    await settle()
    assert.equal(telegram.sent.length, before + 1)
    assert.equal((await partnerApi('/hinweise', { method: 'PUT', body: { nachricht: 'nein' } })).status, 400)
    assert.equal((await partnerApi('/hinweise', { method: 'PUT', body: { chatId: '1' } })).status, 400)
    await partnerApi('/hinweise', { method: 'PUT', body: { nachricht: true } })
  })

  await t.test('Beitrag freigegeben oder abgelehnt: Titel ja, Ablehnungsgrund nie; nur bei echter Änderung', async () => {
    const create = (titel) =>
      request('/api/partner-area/posts', {
        method: 'POST',
        body: { titel, text: 'Sechs Termine in kleiner Gruppe.', bereich: 'hundeschule', url: 'https://example.org/welpenkurs' },
        cookie: school.cookie
      })
    const first = await create('Welpenkurs ab Oktober')
    const second = await create('Einzeltraining am Abend')
    const third = await create('Ruhe an der Leine')
    assert.equal(first.status, 201)
    const before = telegram.sent.length

    await admin(`/api/admin/promotions/${first.data.id}/freigeben`, { method: 'POST' })
    await admin(`/api/admin/promotions/${first.data.id}/freigeben`, { method: 'POST' })
    await admin(`/api/admin/promotions/${second.data.id}/ablehnen`, { method: 'POST', body: { vorlage: 'Sonstiges', text: 'Bitte ohne Preisangabe für Mara' } })
    await admin('/api/admin/promotions/freigeben', { method: 'POST', body: { ids: [third.data.id, first.data.id] } })
    await settle()
    const texts = telegram.sent.slice(before).map((message) => message.text)
    assert.deepEqual(texts, [
      '🐾 Dein Beitrag „Welpenkurs ab Oktober“ wurde freigegeben – er ist jetzt online.',
      '🐾 Dein Beitrag „Einzeltraining am Abend“ wurde abgelehnt – den Grund findest du im Partner-Bereich unter „Beiträge“.',
      '🐾 Dein Beitrag „Ruhe an der Leine“ wurde freigegeben – er ist jetzt online.'
    ])
    assert.ok(texts.every((text) => !text.includes('Preisangabe') && !text.includes('Mara')))

    await partnerApi('/hinweise', { method: 'PUT', body: { freigabe: false } })
    await admin(`/api/admin/promotions/${first.data.id}/ablehnen`, { method: 'POST', body: { grund: 'Link führt ins Leere' } })
    await settle()
    assert.equal(telegram.sent.length, before + 3, 'Schalter aus')
    await partnerApi('/hinweise', { method: 'PUT', body: { freigabe: true } })
  })

  await t.test('Obergrenze je Partner: 20 Hinweise je Stunde, dann EINE Warnung, danach Pause', async () => {
    advance(61 * 60 * 1000) // die Hinweise der Schritte davor fallen aus dem Fenster
    const before = telegram.sent.length
    for (let i = 0; i < CAP_PER_WINDOW + 5; i += 1) notifyPartner(school.partner.id, 'nachricht')
    await settle()
    const texts = telegram.sent.slice(before).map((message) => message.text)
    assert.equal(texts.length, CAP_PER_WINDOW + 1)
    assert.equal(texts.at(-1), CAP_WARNING_TEXT)
    advance(61 * 60 * 1000)
    notifyPartner(school.partner.id, 'nachricht')
    await settle()
    assert.equal(telegram.sent.length, before + CAP_PER_WINDOW + 2, 'nach der Stunde wieder')
    // Eigene Töpfe je Ereignis: eine Flut von Nachrichten verdrängt den Hinweis auf eine Freigabe nicht.
    for (let i = 0; i < CAP_PER_WINDOW + 3; i += 1) notifyPartner(school.partner.id, 'nachricht')
    notifyPartner(school.partner.id, 'freigabe', { titel: 'Welpenkurs ab Oktober', freigegeben: true })
    await settle()
    assert.equal(telegram.sent.at(-1).text, '🐾 Dein Beitrag „Welpenkurs ab Oktober“ wurde freigegeben – er ist jetzt online.')
    advance(61 * 60 * 1000)
    assert.equal(notifyPartner(school.partner.id, 'unbekannt'), null)
  })

  await t.test('Testnachricht: einmal, abgewartet; höchstens fünf je Stunde', async () => {
    const res = await partnerApi('/test', { method: 'POST' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data, { ok: true })
    assert.match(telegram.sent.at(-1).text, /^🐾 Testnachricht von Familie auf Pfoten – die Hinweise für Hundeschule Pfotenweg kommen hier an\.$/)

    telegram.sendError = rejected(500)
    const failed = await partnerApi('/test', { method: 'POST' })
    assert.equal(failed.status, 502)
    telegram.sendError = null
    // Fünf je Stunde - die 409 aus dem ersten Schritt zählt mit.
    for (let i = 0; i < 2; i += 1) assert.equal((await partnerApi('/test', { method: 'POST' })).status, 200)
    assert.equal((await partnerApi('/test', { method: 'POST' })).status, 429)
  })

  await t.test('Telegram meldet 403 (Bot blockiert): Verbindung beendet, im Status sichtbar, Log ohne Chat-ID', async () => {
    telegram.sendError = rejected(403)
    const contact = await call(base, `/api/public/partners/${school.partner.slug}/contact`, { method: 'POST', body: SENDER })
    assert.equal(contact.status, 201, 'die Nachricht selbst kommt trotzdem an')
    await settle()
    telegram.sendError = null
    const status = await partnerApi('')
    assert.deepEqual(status.data, { eingerichtet: true, verbunden: false, getrennt: 'blockiert', hinweise: { nachricht: false, freigabe: false }, bot: { quelle: 'plattform', username: null } })
    assert.equal(db.prepare('SELECT chat_cipher FROM partner_telegram WHERE partner_id = ?').get(school.partner.id).chat_cipher, null)
    assert.ok(logged.includes('Telegram-Hinweis an einen Partner fehlgeschlagen (403, Verbindung beendet)'))
    const before = telegram.sent.length
    notifyPartner(school.partner.id, 'nachricht')
    await settle()
    assert.equal(telegram.sent.length, before, 'nichts mehr an den blockierten Chat')
    assert.equal((await partnerApi('/hinweise', { method: 'PUT', body: { nachricht: true } })).status, 409)
    assert.equal((await admin('/api/admin/partners')).data.find((partner) => partner.id === school.partner.id).telegram_verbunden, 0)
  })

  await t.test('neu verbinden und trennen: danach keine Chat-ID mehr', async () => {
    const link = await partnerApi('/verbinden', { method: 'POST' })
    const again = codeOf(link.data.url)
    telegram.updates = [startMessage(301, PARTNER_CHAT, `/start ${again}`), buttonPress(302, PARTNER_CHAT, `ja:${again}`)]
    advance()
    assert.equal((await partnerApi('/pruefen', { method: 'POST' })).data.verbunden, true)
    // Ein nicht mehr lesbarer Geheimtext (z. B. nach geändertem CODE_PEPPER) zählt als nicht verbunden - neu verbinden geht.
    const cipher = db.prepare('SELECT chat_cipher FROM partner_telegram WHERE partner_id = ?').get(school.partner.id).chat_cipher
    db.prepare("UPDATE partner_telegram SET chat_cipher = 'kaputt.kaputt.kaputt' WHERE partner_id = ?").run(school.partner.id)
    assert.equal((await partnerApi('')).data.verbunden, false)
    db.prepare('UPDATE partner_telegram SET chat_cipher = ? WHERE partner_id = ?').run(cipher, school.partner.id)
    const res = await partnerApi('', { method: 'DELETE' })
    assert.equal(res.status, 200)
    assert.equal(res.data.verbunden, false)
    assert.equal(res.data.getrennt, null)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partner_telegram WHERE partner_id = ?').get(school.partner.id).n, 0)
    assert.equal((await partnerApi('/test', { method: 'POST' })).status, 429, 'die Grenze der Testnachricht gilt weiter')
  })

  await t.test('Demo und Admin-Ansicht: der Abschnitt ist lesbar, jeder Schreibversuch 403', async () => {
    const demo = await createPartnerArea({ name: 'Hundeschule Demo-Wiese' })
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.familyId)
    db.prepare('UPDATE partners SET is_demo = 1 WHERE id = ?').run(demo.partner.id)
    const demoApi = (urlPath, options = {}) => request(`${TG}${urlPath}`, { ...options, cookie: demo.cookie })
    assert.equal((await demoApi('')).data.eingerichtet, true)
    for (const [method, urlPath] of [['POST', '/verbinden'], ['POST', '/pruefen'], ['POST', '/test'], ['PUT', '/hinweise'], ['DELETE', '']]) {
      assert.equal((await demoApi(urlPath, { method, body: method === 'PUT' ? { nachricht: true } : undefined })).status, 403, `${method} ${urlPath}`)
    }
    assert.equal(notifyPartner(demo.partner.id, 'nachricht'), null, 'Demo-Partner bekommen nie Hinweise')

    const view = await call(base, `/api/admin/view/${school.familyId}`, { method: 'POST', cookie: adminCookie })
    const viewCookie = getCookie(view.res)
    assert.equal((await request(TG, { cookie: viewCookie })).status, 200)
    assert.equal((await request(`${TG}/verbinden`, { method: 'POST', cookie: viewCookie })).status, 403)
  })

  await t.test('kein Token, keine Chat-ID in einer Antwort oder Logzeile', () => {
    const everything = [...responses, ...logged].join('\n')
    assert.ok(!everything.includes(TOKEN.split(':')[1]))
    for (const chatId of [PARTNER_CHAT, 616161, 717171, 818181, 828282, 838383, 858585]) assert.ok(!everything.includes(String(chatId)), String(chatId))
  })
})
