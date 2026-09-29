const test = require('node:test')
const { after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir } = require('./helpers')

// Phase N Task 2: Telegram-Benachrichtigungen (lib/notify.js, lib/notifySettings.js) - ohne Server und nie über das
// Netz: der Versand läuft über einen Fake-Sender (setNotifyRuntimeForTests). Token und Chat-ID sind erfunden und kommen
// hier aus der Umgebung (Rückfall, config.js readTelegram) - der Weg über den Admin: test/adminNotify.test.js.
const FAKE_TOKEN = '123456:TEST-token_nur-fuer-tests-0000000'
const FAKE_CHAT_ID = '-100200300'
const dataDir = useTempDataDir('notify', { TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_CHAT_ID: FAKE_CHAT_ID })

after(() => {
  const db = require('../db')
  if (db.open) db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

// Sammelt Versuche; failures: wie viele Versuche vorher scheitern (mit err), danach klappt es.
function fakeSender({ failures = 0, err = Object.assign(new Error('Verbindung fehlgeschlagen'), { status: 502 }) } = {}) {
  const calls = []
  const sender = async (message) => {
    calls.push(message)
    if (calls.length <= failures) throw err
  }
  return { sender, calls }
}

function captureLogger() {
  const lines = []
  const push = (...args) => lines.push(args.map(String).join(' '))
  return { logger: { log: push, info: push, warn: push, error: push }, lines }
}

test('readTelegram: beide Werte nötig und im erwarteten Format, sonst aus', () => {
  const { readTelegram } = require('../config')
  const silent = { warn: () => {} }
  assert.deepEqual(readTelegram({ TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_CHAT_ID: FAKE_CHAT_ID }, silent), {
    botToken: FAKE_TOKEN,
    chatId: FAKE_CHAT_ID
  })
  assert.deepEqual(readTelegram({ TELEGRAM_BOT_TOKEN: ` ${FAKE_TOKEN} `, TELEGRAM_CHAT_ID: '4242' }, silent), { botToken: FAKE_TOKEN, chatId: '4242' })
  assert.equal(readTelegram({ TELEGRAM_CHAT_ID: '@familie_kanal' }, silent), null)
  assert.equal(readTelegram({ TELEGRAM_BOT_TOKEN: FAKE_TOKEN }, silent), null)
  assert.equal(readTelegram({}, silent), null)
  assert.equal(readTelegram({ TELEGRAM_BOT_TOKEN: 'kein-token', TELEGRAM_CHAT_ID: '1' }, silent), null)
  assert.equal(readTelegram({ TELEGRAM_BOT_TOKEN: '1:abc/../x', TELEGRAM_CHAT_ID: '1' }, silent), null)
  assert.equal(readTelegram({ TELEGRAM_BOT_TOKEN: FAKE_TOKEN, TELEGRAM_CHAT_ID: 'chat 1' }, silent), null)

  const warnings = []
  readTelegram({ TELEGRAM_BOT_TOKEN: 'kein-token', TELEGRAM_CHAT_ID: '1' }, { warn: (line) => warnings.push(line) })
  assert.equal(warnings.length, 1)
  assert.ok(!warnings[0].includes('kein-token'), 'der Wert selbst steht nie im Log')
  const quiet = []
  readTelegram({}, { warn: (line) => quiet.push(line) })
  assert.deepEqual(quiet, [], 'gar nicht gesetzt -> kein Hinweis')

  const config = require('../config')
  assert.deepEqual(config.telegram, { botToken: FAKE_TOKEN, chatId: FAKE_CHAT_ID })
})

test('Einstellungen: Standard (vier an, Beitrag und Details aus), Teil-Update nur mit Booleans', () => {
  const { readNotifySettings, updateNotifySettings } = require('../lib/notifySettings')
  const db = require('../db')
  assert.deepEqual(readNotifySettings(), {
    gutschein_anfrage: true,
    partner_anfrage: true,
    registrierung: true,
    feedback: true,
    beitrag: false,
    details: false
  })

  for (const body of [{ feedback: 'false' }, { feedback: 0 }, { feedback: null }, { quatsch: true }, null, [true]]) {
    assert.throws(() => updateNotifySettings(body), (err) => err.status === 400, JSON.stringify(body))
  }
  assert.throws(() => updateNotifySettings({ feedback: false, beitrag: 'ja' }), (err) => err.status === 400)
  assert.equal(readNotifySettings().feedback, true, 'ein ungültiger Wert ändert gar nichts')

  const updated = updateNotifySettings({ feedback: false, beitrag: true })
  assert.equal(updated.feedback, false)
  assert.equal(updated.beitrag, true)
  assert.equal(updated.registrierung, true)
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'notify_feedback'").get().value, '0')
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'notify_beitrag'").get().value, '1')

  updateNotifySettings({ feedback: true, beitrag: false })
  assert.deepEqual(updateNotifySettings({}), readNotifySettings())
})

test('buildText: ohne Details keine personenbezogenen Daten, mit Details das Nötigste', () => {
  const { buildText, EREIGNIS } = require('../lib/notify')
  const anfrage = { name: 'Wilma Beispiel', email: 'wilma@example.org', firma: 'Hundeschule Pfotenweg', partnerTyp: 'hundeschule' }

  const plain = buildText(EREIGNIS.gutscheinAnfrage, anfrage, { details: false })
  assert.equal(plain, '🐾 Neue Gutschein-Anfrage – im Admin unter „Anfragen“ ansehen.')
  const withDetails = buildText(EREIGNIS.gutscheinAnfrage, anfrage, { details: true })
  assert.ok(withDetails.startsWith(plain))
  assert.match(withDetails, /Name: Wilma Beispiel/)
  assert.match(withDetails, /E-Mail: wilma@example.org/)

  const partnerPlain = buildText(EREIGNIS.partnerAnfrage, anfrage, { details: false })
  assert.ok(!/Wilma|wilma@|Pfotenweg/.test(partnerPlain))
  const partnerDetails = buildText(EREIGNIS.partnerAnfrage, anfrage, { details: true })
  assert.match(partnerDetails, /Hundeschule Pfotenweg/)
  assert.match(partnerDetails, /wilma@example.org/)
  const partnerNoName = buildText(EREIGNIS.partnerAnfrage, { ...anfrage, name: null }, { details: true })
  assert.ok(!partnerNoName.includes('Name:'), 'fehlende Angaben fallen weg')

  const zuhause = buildText(EREIGNIS.registrierung, { art: 'zuhause', name: 'Zuhause Flocke' }, { details: false })
  assert.ok(!zuhause.includes('Flocke'))
  assert.match(buildText(EREIGNIS.registrierung, { art: 'zuhause', name: 'Zuhause Flocke' }, { details: true }), /Bereich: Zuhause Flocke/)
  const partner = buildText(EREIGNIS.registrierung, { art: 'partner', name: 'Hundesalon Kamm' }, { details: false })
  assert.notEqual(partner, zuhause, 'ein Partner-Zugang hat einen eigenen Text')
  assert.match(partner, /Partner-Zugang/)
  assert.match(buildText(EREIGNIS.registrierung, { art: 'partner', name: 'Hundesalon Kamm' }, { details: true }), /Partner: Hundesalon Kamm/)

  const longText = `Anfang ${'x'.repeat(300)}`
  const feedbackPlain = buildText(EREIGNIS.feedback, { typ: 'feedback', text: longText }, { details: false })
  assert.ok(!feedbackPlain.includes('Anfang'))
  const feedbackDetails = buildText(EREIGNIS.feedback, { typ: 'feedback', text: longText }, { details: true })
  const excerpt = feedbackDetails.split('Nachricht: ')[1]
  assert.equal(excerpt, `${longText.slice(0, 200)}…`, 'nur die ersten 200 Zeichen')
  assert.match(buildText(EREIGNIS.feedback, { typ: 'problem', text: 'kaputt' }, { details: false }), /Problem/)
  const emoji = `${'x'.repeat(199)}🐾🐾`
  const emojiExcerpt = buildText(EREIGNIS.feedback, { typ: 'feedback', text: emoji }, { details: true }).split('Nachricht: ')[1]
  assert.equal(emojiExcerpt, `${'x'.repeat(199)}🐾…`, 'ein Emoji an der Grenze bleibt ganz')
  assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(emojiExcerpt), 'kein halbes Ersatzzeichen')

  const beitragPlain = buildText(EREIGNIS.beitrag, { partnerName: 'Hundeschule Pfotenweg', titel: 'Welpenkurs im Herbst' }, { details: false })
  assert.ok(!/Pfotenweg|Welpenkurs/.test(beitragPlain))
  const beitragDetails = buildText(EREIGNIS.beitrag, { partnerName: 'Hundeschule Pfotenweg', titel: 'Welpenkurs im Herbst' }, { details: true })
  assert.match(beitragDetails, /Partner: Hundeschule Pfotenweg/)
  assert.match(beitragDetails, /Titel: Welpenkurs im Herbst/)

  const sneaky = buildText(EREIGNIS.gutscheinAnfrage, { name: 'Flocke\u0000‮ Beispiel', email: 'f@example.org' }, { details: true })
  assert.ok(!/[\u0000‮]/.test(sneaky), 'Steuer- und Bidi-Zeichen fallen weg')
})

test('notify: verschickt asynchron, genau einmal, nur wenn eingeschaltet, eingerichtet und keine Demo', async () => {
  const { notify, setNotifyRuntimeForTests, flushNotificationsForTests, EREIGNIS } = require('../lib/notify')
  const { updateNotifySettings } = require('../lib/notifySettings')
  const config = require('../config')
  const { sender, calls } = fakeSender()
  const { logger, lines } = captureLogger()
  const restore = setNotifyRuntimeForTests({ sender, retryDelaysMs: [0, 0], logger })
  try {
    const pending = notify(EREIGNIS.gutscheinAnfrage, { name: 'Wilma Beispiel', email: 'wilma@example.org' })
    assert.equal(calls.length, 0, 'nicht im selben Tick - die Anfrage wartet nie auf Telegram')
    assert.ok(pending instanceof Promise)
    await flushNotificationsForTests()
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0], {
      token: config.telegram.botToken,
      chatId: config.telegram.chatId,
      text: '🐾 Neue Gutschein-Anfrage – im Admin unter „Anfragen“ ansehen.'
    })
    assert.equal(await pending, true)

    assert.equal(notify(EREIGNIS.beitrag, { partnerName: 'X', titel: 'Y' }), null, 'beitrag ist standardmäßig aus')
    assert.equal(notify(EREIGNIS.feedback, { typ: 'feedback', text: 'Hallo', demo: true }), null, 'Demo löst nie etwas aus')
    assert.equal(notify('unbekannt', {}), null)
    assert.deepEqual(lines, ['Unbekanntes Benachrichtigungs-Ereignis – nichts verschickt.'])
    updateNotifySettings({ feedback: false })
    assert.equal(notify(EREIGNIS.feedback, { typ: 'feedback', text: 'Hallo' }), null, 'ausgeschaltet')
    updateNotifySettings({ feedback: true, details: true })
    await notify(EREIGNIS.feedback, { typ: 'feedback', text: 'Hallo Admin' })
    assert.match(calls.at(-1).text, /Nachricht: Hallo Admin/, 'Details mitsenden wirkt')
    updateNotifySettings({ details: false })
    await flushNotificationsForTests()
    assert.equal(calls.length, 2)
  } finally {
    restore()
  }

  const { sender: unconfiguredSender, calls: unconfiguredCalls } = fakeSender()
  const restoreUnconfigured = setNotifyRuntimeForTests({ sender: unconfiguredSender, telegram: null })
  try {
    assert.equal(notify(EREIGNIS.gutscheinAnfrage, { email: 'a@example.org' }), null, 'ohne Token/Chat-ID kein Versand')
    await flushNotificationsForTests()
    assert.equal(unconfiguredCalls.length, 0)
  } finally {
    restoreUnconfigured()
  }
})

test('Versand: höchstens 3 Versuche mit Pause, Fehler nur als Zeile ohne Inhalt, Token nie im Log', async () => {
  const { notify, setNotifyRuntimeForTests, flushNotificationsForTests, EREIGNIS } = require('../lib/notify')
  const { logger, lines } = captureLogger()
  const leaky = Object.assign(new Error(`kaputt bei https://api.telegram.org/bot${FAKE_TOKEN}/sendMessage`), { status: 502 })

  const failing = fakeSender({ failures: 99, err: leaky })
  const delays = []
  const restore = setNotifyRuntimeForTests({ sender: failing.sender, retryDelaysMs: [5, 10], logger, sleep: async (ms) => delays.push(ms) })
  try {
    assert.equal(await notify(EREIGNIS.gutscheinAnfrage, { email: 'wilma@example.org', name: 'Wilma' }), false)
    assert.equal(failing.calls.length, 3)
    assert.deepEqual(delays, [5, 10], 'Pause zwischen den Versuchen')
    assert.deepEqual(lines, ['Telegram-Benachrichtigung fehlgeschlagen (502)'])
  } finally {
    restore()
  }

  const flaky = fakeSender({ failures: 1 })
  lines.length = 0
  const restoreFlaky = setNotifyRuntimeForTests({ sender: flaky.sender, retryDelaysMs: [0, 0], logger })
  try {
    assert.equal(await notify(EREIGNIS.gutscheinAnfrage, { email: 'wilma@example.org' }), true)
    assert.equal(flaky.calls.length, 2, 'zweiter Versuch klappt')
    assert.deepEqual(lines, [])
  } finally {
    restoreFlaky()
  }

  // 4xx von Telegram (falscher Token/Chat) wird nicht wiederholt - 429 (zu viele Nachrichten) schon.
  const unauthorized = fakeSender({ failures: 99, err: Object.assign(new Error('Unerwarteter Status 401'), { status: 502, upstreamStatus: 401 }) })
  lines.length = 0
  const restoreUnauthorized = setNotifyRuntimeForTests({ sender: unauthorized.sender, retryDelaysMs: [0, 0], logger })
  try {
    assert.equal(await notify(EREIGNIS.gutscheinAnfrage, { email: 'wilma@example.org' }), false)
    assert.equal(unauthorized.calls.length, 1)
    assert.deepEqual(lines, ['Telegram-Benachrichtigung fehlgeschlagen (401)'])
  } finally {
    restoreUnauthorized()
  }
  const tooMany = fakeSender({ failures: 99, err: Object.assign(new Error('x'), { upstreamStatus: 429 }) })
  const restoreTooMany = setNotifyRuntimeForTests({ sender: tooMany.sender, retryDelaysMs: [0, 0], logger })
  try {
    await notify(EREIGNIS.gutscheinAnfrage, { email: 'wilma@example.org' })
    assert.equal(tooMany.calls.length, 3)
  } finally {
    restoreTooMany()
  }

  const coded = fakeSender({ failures: 99, err: Object.assign(new Error(FAKE_TOKEN), { code: 'ECONNRESET' }) })
  const weird = fakeSender({ failures: 99, err: Object.assign(new Error('x'), { code: `bot${FAKE_TOKEN}` }) })
  lines.length = 0
  for (const { sender } of [coded, weird]) {
    const restoreCoded = setNotifyRuntimeForTests({ sender, retryDelaysMs: [0, 0], logger })
    try {
      await notify(EREIGNIS.gutscheinAnfrage, { email: 'wilma@example.org' })
    } finally {
      restoreCoded()
    }
  }
  assert.deepEqual(lines, ['Telegram-Benachrichtigung fehlgeschlagen (ECONNRESET)', 'Telegram-Benachrichtigung fehlgeschlagen (unbekannt)'])
  await flushNotificationsForTests()
})

test('sendTestMessage: ein Versuch, synchron; ohne Einrichtung 409', async () => {
  const { sendTestMessage, setNotifyRuntimeForTests } = require('../lib/notify')
  const ok = fakeSender()
  const restore = setNotifyRuntimeForTests({ sender: ok.sender })
  try {
    assert.equal(await sendTestMessage(), true)
    assert.equal(ok.calls.length, 1)
    assert.match(ok.calls[0].text, /Testnachricht von Familie auf Pfoten/)
  } finally {
    restore()
  }

  const { logger, lines } = captureLogger()
  const failing = fakeSender({ failures: 99 })
  const restoreFailing = setNotifyRuntimeForTests({ sender: failing.sender, logger, retryDelaysMs: [0, 0] })
  try {
    assert.equal(await sendTestMessage(), false)
    assert.equal(failing.calls.length, 1, 'die Testnachricht wird nicht wiederholt')
    assert.deepEqual(lines, ['Telegram-Benachrichtigung fehlgeschlagen (502)'])
  } finally {
    restoreFailing()
  }

  const restoreUnconfigured = setNotifyRuntimeForTests({ telegram: null })
  try {
    await assert.rejects(sendTestMessage(), (err) => err.status === 409 && err.message === 'Telegram ist nicht eingerichtet.')
  } finally {
    restoreUnconfigured()
  }
})
