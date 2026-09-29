const test = require('node:test')
const { after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir } = require('./helpers')

// Phase N Task 2: Telegram-Client (lib/telegram.js), verschlüsselte Zugangsdaten (lib/telegramConfig.js, lib/codes.js
// encryptSecret) - ohne Server, ohne Netz (fetchJson/Client sind Fakes). Token und Chat-IDs sind erfunden.
const TOKEN = '987654:ADMIN-token_aus-dem-admin-00000000'
const ENV_TOKEN = '111111:ENV-token_aus-der-umgebung-0000000'
const dataDir = useTempDataDir('telegram')
delete process.env.TELEGRAM_BOT_TOKEN
delete process.env.TELEGRAM_CHAT_ID

after(() => {
  const db = require('../db')
  if (db.open) db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test('createTelegramClient: POST an api.telegram.org über lib/http.js, reiner Text ohne parse_mode', async () => {
  const { createTelegramClient, TELEGRAM_HOST } = require('../lib/telegram')
  assert.equal(TELEGRAM_HOST, 'api.telegram.org')
  const requests = []
  const fetchJson = async (url, options) => {
    requests.push({ url, options })
    if (url.endsWith('/getMe')) return { ok: true, result: { id: 5, is_bot: true, username: 'pfoten_test_bot' } }
    if (url.endsWith('/getUpdates')) return { ok: true, result: [] }
    return { ok: true, result: { message_id: 1 } }
  }
  const client = createTelegramClient({ fetchJson })

  await client.sendMessage({ token: TOKEN, chatId: '-100200300', text: 'Hallo *fett* <b>' })
  const send = requests[0]
  assert.equal(send.url, `https://api.telegram.org/bot${TOKEN}/sendMessage`)
  assert.equal(send.options.method, 'POST')
  assert.deepEqual(send.options.allowHosts, ['api.telegram.org'])
  assert.ok(send.options.timeoutMs > 0)
  const body = JSON.parse(send.options.body)
  assert.equal(body.chat_id, '-100200300')
  assert.equal(body.text, 'Hallo *fett* <b>')
  assert.equal(body.disable_web_page_preview, true)
  assert.equal(body.parse_mode, undefined, 'kein Markdown/HTML - nichts lässt sich einschleusen')

  assert.equal((await client.getMe({ token: TOKEN })).username, 'pfoten_test_bot')
  assert.equal(requests[1].url, `https://api.telegram.org/bot${TOKEN}/getMe`)
  assert.equal(requests[1].options.timeoutMs, 5000)
  assert.deepEqual(await client.getUpdates({ token: TOKEN }), [])
  assert.equal(requests[2].url, `https://api.telegram.org/bot${TOKEN}/getUpdates`)

  // Ein Token im falschen Format geht gar nicht erst raus (er steht im Pfad der URL).
  const before = requests.length
  for (const bad of ['1:kurz', `${TOKEN}/../x`, `${TOKEN}?a=1`, '', null]) {
    await assert.rejects(client.getMe({ token: bad }), (err) => err.status === 400)
  }
  assert.equal(requests.length, before)
})

test('createTelegramClient: ok:false, kein Bot und HTTP-Fehler werden sauber unterschieden, ohne Token in der Meldung', async () => {
  const { createTelegramClient, isRejectedByTelegram } = require('../lib/telegram')
  const notOk = createTelegramClient({ fetchJson: async () => ({ ok: false, description: 'Unauthorized' }) })
  await assert.rejects(notOk.getMe({ token: TOKEN }), (err) => isRejectedByTelegram(err) && !err.message.includes(TOKEN))
  const human = createTelegramClient({ fetchJson: async () => ({ ok: true, result: { id: 1, is_bot: false } }) })
  await assert.rejects(human.getMe({ token: TOKEN }), (err) => isRejectedByTelegram(err))

  const http401 = createTelegramClient({
    fetchJson: async () => {
      throw Object.assign(new Error('Unerwarteter Status 401'), { status: 502, upstreamStatus: 401 })
    }
  })
  await assert.rejects(http401.getMe({ token: TOKEN }), (err) => isRejectedByTelegram(err))

  assert.equal(isRejectedByTelegram(Object.assign(new Error('x'), { upstreamStatus: 429 })), false, '429 ist kein Nein')
  assert.equal(isRejectedByTelegram(Object.assign(new Error('x'), { status: 504 })), false, 'Zeitüberschreitung ist kein Nein')
  assert.equal(isRejectedByTelegram(Object.assign(new Error('x'), { upstreamStatus: 500 })), false)
})

test('extractChats: verschiedene Chats, neueste zuerst, nur numerische IDs, reiner Text', () => {
  const { extractChats } = require('../lib/telegram')
  const updates = [
    { update_id: 1, message: { chat: { id: 4242, type: 'private', first_name: 'Greta', last_name: 'Beispiel', username: 'greta_b' } } },
    { update_id: 2, my_chat_member: { chat: { id: -100555, type: 'supergroup', title: 'Team‮ Pfoten' } } },
    { update_id: 3, message: { chat: { id: 4242, type: 'private', first_name: 'Greta' } } },
    { update_id: 4, channel_post: { chat: { id: -100777, type: 'channel', username: 'pfoten_kanal' } } },
    { update_id: 5, message: { chat: { id: 'abc', type: 'private' } } },
    { update_id: 6, callback_query: { message: { chat: { id: 99, type: 'private', username: 'nur_user' } } } },
    { update_id: 7, poll: { id: 'x' } },
    null
  ]
  assert.deepEqual(extractChats(updates), [
    { id: '99', titel: '@nur_user', typ: 'private' },
    { id: '-100777', titel: '@pfoten_kanal', typ: 'channel' },
    { id: '4242', titel: 'Greta', typ: 'private' },
    { id: '-100555', titel: 'Team Pfoten', typ: 'supergroup' }
  ])
  assert.deepEqual(extractChats(undefined), [])
  assert.deepEqual(extractChats({ result: [] }), [])

  const many = Array.from({ length: 40 }, (_, i) => ({ message: { chat: { id: i + 1, type: 'group', title: `Gruppe ${i + 1}` } } }))
  assert.equal(extractChats(many).length, 20)
  assert.equal(extractChats([{ message: { chat: { id: 1, type: 'group', title: 'x'.repeat(300) } } }])[0].titel.length, 100)
})

// Geheimtext ohne AAD, wie ihn encryptSecret vor der AAD-Bindung geschrieben hat (gleicher Schlüssel aus CODE_PEPPER).
function legacySecret(plaintext) {
  const crypto = require('node:crypto')
  const { codePepper } = require('../config')
  const key = crypto.createHash('sha256').update(`${codePepper}:settings-secret`).digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

test('encryptSecret/decryptSecret: AES-256-GCM mit eigenem Schlüssel und dem Settings-Schlüssel als AAD', () => {
  const { encryptSecret, decryptSecret, encryptCode, decryptCode } = require('../lib/codes')
  const KEY = 'telegram_bot_token_cipher'
  const first = encryptSecret(TOKEN, KEY)
  const second = encryptSecret(TOKEN, KEY)
  assert.notEqual(first, second, 'zufälliger IV')
  assert.ok(!first.includes(TOKEN))
  assert.equal(decryptSecret(first, KEY), TOKEN)
  assert.throws(() => decryptSecret(first, 'anderer_schluessel'), 'an einen anderen Settings-Schlüssel gebunden -> ungültig')
  assert.throws(() => decryptCode(first), 'ein Geheimnis ist kein Gutschein-Geheimtext')
  assert.throws(() => decryptSecret(encryptCode('ABCDEFGHJKMN'), KEY))
  const tampered = `${first.slice(0, -2)}AA`
  assert.throws(() => decryptSecret(tampered, KEY), (err) => !err.message.includes(TOKEN))
  assert.throws(() => decryptSecret('kaputt', KEY))
  assert.throws(() => encryptSecret(TOKEN), 'ohne AAD kein Verschlüsseln')

  // Alte Werte (vor der AAD-Bindung) bleiben lesbar.
  assert.equal(decryptSecret(legacySecret(TOKEN), KEY), TOKEN)
})

test('telegramConfig: verschlüsselt gespeichert, Status nur mit Hinweis, Rückfall auf die Umgebung je Wert, Löschen', () => {
  const db = require('../db')
  const cfg = require('../lib/telegramConfig')
  const silent = { warn: () => {} }
  const noEnv = { envTelegram: null, logger: silent }
  const env = { envTelegram: { botToken: ENV_TOKEN, chatId: '5555' }, logger: silent }

  assert.deepEqual(cfg.telegramStatus(noEnv), { eingerichtet: false, quelle: null, tokenHinweis: null, chatId: null })
  assert.equal(cfg.telegramCredentials(noEnv), null)
  assert.deepEqual(cfg.telegramStatus(env), { eingerichtet: true, quelle: 'umgebung', tokenHinweis: '…0000', chatId: '5555' })
  assert.deepEqual(cfg.telegramCredentials(env), { botToken: ENV_TOKEN, chatId: '5555' })

  assert.deepEqual(cfg.saveTelegram({ token: TOKEN }), { gesetzt: true, geloescht: false })
  const stored = db.prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token_cipher'").get().value
  assert.ok(!stored.includes(TOKEN), 'in der Datenbank steht nur der Geheimtext')
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM settings').all()).includes(TOKEN))
  assert.deepEqual(cfg.telegramStatus(noEnv), { eingerichtet: false, quelle: null, tokenHinweis: '…0000', chatId: null })
  assert.deepEqual(cfg.telegramStatus(env), { eingerichtet: true, quelle: 'admin', tokenHinweis: '…0000', chatId: '5555' })
  assert.deepEqual(cfg.telegramCredentials(env), { botToken: TOKEN, chatId: '5555' }, 'der Token aus dem Admin schlägt die Umgebung')

  cfg.saveTelegram({ chatId: '-100200300' })
  assert.deepEqual(cfg.telegramCredentials(noEnv), { botToken: TOKEN, chatId: '-100200300' })
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'telegram_chat_id'").get().value, '-100200300')

  assert.deepEqual(cfg.saveTelegram({ token: null }), { gesetzt: false, geloescht: true })
  assert.equal(db.prepare("SELECT 1 FROM settings WHERE key = 'telegram_bot_token_cipher'").get(), undefined)
  assert.deepEqual(cfg.telegramCredentials(env), { botToken: ENV_TOKEN, chatId: '-100200300' }, 'ohne Admin-Token wieder die Umgebung')
  cfg.saveTelegram({ chatId: null })
  assert.deepEqual(cfg.telegramStatus(env).quelle, 'umgebung')

  // Ein nicht lesbarer Geheimtext zählt als "nicht gesetzt" - mit Warnung ohne Inhalt, EINMAL je Prozess.
  db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_bot_token_cipher', 'kaputt.kaputt.kaputt')").run()
  const warnings = []
  const warnLogger = { envTelegram: null, logger: { warn: (line) => warnings.push(line) } }
  assert.equal(cfg.telegramCredentials(warnLogger), null)
  assert.equal(cfg.telegramCredentials(warnLogger), null)
  cfg.telegramStatus(warnLogger)
  assert.equal(warnings.length, 1, 'nur einmal, nicht bei jedem Aufruf')
  db.prepare("DELETE FROM settings WHERE key = 'telegram_bot_token_cipher'").run()

  // Ein alter Geheimtext ohne AAD bleibt lesbar und wird beim nächsten Speichern mit AAD neu verschlüsselt.
  db.prepare("INSERT INTO settings (key, value) VALUES ('telegram_bot_token_cipher', ?)").run(legacySecret(TOKEN))
  assert.deepEqual(cfg.telegramCredentials({ ...noEnv, envTelegram: { botToken: ENV_TOKEN, chatId: '1' } }), { botToken: TOKEN, chatId: '1' })
  cfg.saveTelegram({ chatId: '4242' })
  const reencrypted = db.prepare("SELECT value FROM settings WHERE key = 'telegram_bot_token_cipher'").get().value
  const { decryptSecret } = require('../lib/codes')
  assert.equal(decryptSecret(reencrypted, 'telegram_bot_token_cipher'), TOKEN)
  assert.throws(() => decryptSecret(reencrypted, 'anderer_schluessel'), 'jetzt mit AAD gebunden')
  assert.deepEqual(cfg.telegramCredentials(noEnv), { botToken: TOKEN, chatId: '4242' })
  cfg.saveTelegram({ token: null, chatId: null })
})

test('validateTelegramInput: Format von Token und Chat-ID, leer löscht, mindestens eine Angabe', () => {
  const { validateTelegramInput, validateOptionalToken } = require('../lib/telegramConfig')
  assert.deepEqual(validateTelegramInput({ token: ` ${TOKEN} ` }), { token: TOKEN, chatId: undefined })
  assert.deepEqual(validateTelegramInput({ chatId: '@pfoten_kanal' }), { token: undefined, chatId: '@pfoten_kanal' })
  assert.deepEqual(validateTelegramInput({ token: '', chatId: null }), { token: null, chatId: null })
  for (const body of [{}, null, [], { token: 'kein-token' }, { token: 42 }, { chatId: 'chat 1' }, { chatId: '@ab' }, { chatId: 12345 }]) {
    assert.throws(() => validateTelegramInput(body), (err) => err.status === 400, JSON.stringify(body))
  }
  assert.equal(validateOptionalToken(undefined), null)
  assert.equal(validateOptionalToken(TOKEN), TOKEN)
  assert.throws(() => validateOptionalToken('x'), (err) => err.status === 400)
})
