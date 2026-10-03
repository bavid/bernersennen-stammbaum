const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir } = require('./helpers')

// Phase G Task 6: Telegram-Warnungen des Admin-Reiters „Server“ (lib/serverWarnings.js). Platte sofort, Speicher und Last
// erst „dauerhaft“ (die letzten drei stündlichen Messungen), höchstens eine Warnung je Messwert und Berliner Tag, eigener
// Schalter „Server-Warnungen“. Versand gestubbt bzw. über einen Fake-Telegram-Client - nie das Netz. Token erfunden.
const FAKE_TOKEN = '424242:SERVER-token_nur-fuer-tests-abcdWXYZ'
const dataDir = useTempDataDir('server-warnings', { TELEGRAM_BOT_TOKEN: '', TELEGRAM_CHAT_ID: '' })

const { createServerWarnings, exceededMetrics } = require('../lib/serverWarnings')
const db = require('../db')

const HOUR = 60 * 60 * 1000
const NOW = Date.parse('2026-10-03T10:00:00Z') // 12:00 Berlin

// Messungen neueste zuerst (wie lib/serverHistory.js recentSamples), je eine Stunde auseinander.
function samples(values, now = NOW) {
  return values.map((value, index) => ({
    at: new Date(now - index * HOUR).toISOString(),
    mem_used_pct: 50,
    disk_used_pct: 20,
    load1: 0.2,
    load5: 0.2,
    app_rss: 1,
    ...value
  }))
}

function recorder({ fail = null } = {}) {
  const sent = []
  const send = async (text) => {
    if (fail) throw fail
    sent.push(text)
    return true
  }
  return { sent, send }
}

const logged = []
const logger = { log: (line) => logged.push(line), warn: (line) => logged.push(line) }

test.after(() => {
  db.close()
  fs.rmSync(dataDir, { recursive: true, force: true })
})

test.beforeEach(() => {
  db.prepare("DELETE FROM settings WHERE key LIKE 'server_warnung%' OR key = 'notify_server_warnung'").run()
})

test('Platte warnt sofort, Speicher und Last erst nach drei Messungen über der Schwelle', () => {
  assert.deepEqual(exceededMetrics({ samples: samples([{ disk_used_pct: 72 }]), cores: 2, now: NOW }), [
    { metrik: 'platte', stufe: 'erhoeht', wert: 72 }
  ])
  assert.deepEqual(exceededMetrics({ samples: samples([{ mem_used_pct: 95 }, { mem_used_pct: 95 }]), cores: 2, now: NOW }), [], 'erst zwei')
  assert.deepEqual(
    exceededMetrics({ samples: samples([{ mem_used_pct: 95 }, { mem_used_pct: 81 }, { mem_used_pct: 79 }]), cores: 2, now: NOW }),
    [],
    'eine der drei darunter'
  )
  assert.deepEqual(
    exceededMetrics({ samples: samples([{ mem_used_pct: 91 }, { mem_used_pct: 85 }, { mem_used_pct: 81 }]), cores: 2, now: NOW }),
    [{ metrik: 'speicher', stufe: 'kritisch', wert: 91 }],
    'Stufe nach der neuesten Messung'
  )
  // Last je Kern: bei 2 Kernen ab über 1,5
  const load = (value) => ({ load1: value })
  assert.deepEqual(exceededMetrics({ samples: samples([load(1.6), load(1.7), load(1.51)]), cores: 2, now: NOW }), [
    { metrik: 'last', stufe: 'erhoeht', wert: 0.8 }
  ])
  assert.deepEqual(exceededMetrics({ samples: samples([load(1.6), load(1.7), load(1.5)]), cores: 2, now: NOW }), [], '1,5 ist noch ok')
  assert.deepEqual(exceededMetrics({ samples: samples([load(1.6), load(1.7), load(1.6)]), cores: 4, now: NOW }), [], 'bei 4 Kernen erst über 3')
  assert.deepEqual(exceededMetrics({ samples: samples([load(5), load(5), load(5)]), cores: null, now: NOW }), [], 'ohne Kernzahl keine Last-Warnung')
})

test('Alte Messungen zählen nicht: nach einer Pause des Servers kein „dauerhaft“, keine veraltete Platte', () => {
  const stale = samples([{ mem_used_pct: 95 }, { mem_used_pct: 95 }, { mem_used_pct: 95 }], NOW - 3 * HOUR)
  assert.deepEqual(exceededMetrics({ samples: [{ ...stale[0], at: new Date(NOW).toISOString() }, ...stale.slice(1)], cores: 2, now: NOW }), [])
  assert.deepEqual(exceededMetrics({ samples: samples([{ disk_used_pct: 90 }], NOW - 5 * HOUR), cores: 2, now: NOW }), [])
  assert.deepEqual(exceededMetrics({ samples: [], cores: 2, now: NOW }), [])
})

test('Drosselung: höchstens eine Warnung je Messwert und Berliner Tag, am nächsten Tag wieder', async () => {
  const { sent, send } = recorder()
  const warnings = createServerWarnings({ send, isEnabled: () => true, appEnv: 'production', logger })
  const fullAt = (now) => samples([{ disk_used_pct: 88, mem_used_pct: 92 }, { mem_used_pct: 92 }, { mem_used_pct: 92 }], now)
  const check = (now) => warnings.check({ samples: fullAt(now), cores: 2, now })

  assert.deepEqual(await check(NOW), ['speicher', 'platte'])
  assert.equal(sent.length, 2)
  assert.match(sent[0], /^⚠️ Server-Warnung \(kritisch\): Der Arbeitsspeicher ist zu 92 % belegt – bei den letzten drei stündlichen Messungen über 80 %\. Details/)
  assert.match(sent[1], /Der Speicherplatz ist zu 88 % belegt \(Warnschwelle 70 %\)\. Details im Admin unter „Server“\.$/)
  for (const text of sent) assert.doesNotMatch(text, /[\\/]|data|backups/, 'keine Pfade')

  assert.deepEqual(await check(NOW + HOUR), [], 'eine Stunde später nichts')
  assert.deepEqual(await check(NOW + 9 * HOUR), [], '21:00 Berlin: noch derselbe Tag')
  // 22:30 UTC am 03.10. ist in Berlin schon der 04.10.
  assert.deepEqual(await check(Date.parse('2026-10-03T22:30:00Z')), ['speicher', 'platte'])
  assert.equal(sent.length, 4)
})

test('Schalter aus oder Telegram nicht eingerichtet: nichts verschickt, nichts vermerkt', async () => {
  const { sent, send } = recorder()
  const full = samples([{ disk_used_pct: 90 }])
  const off = createServerWarnings({ send, isEnabled: () => false, logger })
  assert.deepEqual(await off.check({ samples: full, cores: 2, now: NOW }), [])
  assert.equal(sent.length, 0)

  const notSetUp = createServerWarnings({ send: async () => false, isEnabled: () => true, logger })
  assert.deepEqual(await notSetUp.check({ samples: full, cores: 2, now: NOW }), [])

  const on = createServerWarnings({ send, isEnabled: () => true, logger })
  assert.deepEqual(await on.check({ samples: full, cores: 2, now: NOW }), ['platte'], 'nach dem Einschalten noch am selben Tag')
})

test('Fehler beim Versand: vorübergehend -> nächste Stunde noch einmal, „Nein“ von Telegram -> erst morgen; Log ohne Inhalt', async () => {
  logged.length = 0
  const full = samples([{ disk_used_pct: 90 }])
  const flaky = createServerWarnings({ send: recorder({ fail: Object.assign(new Error('weg'), { code: 'ECONNRESET' }) }).send, isEnabled: () => true, logger })
  assert.deepEqual(await flaky.check({ samples: full, cores: 2, now: NOW }), [])
  assert.deepEqual(logged, ['Server-Warnung per Telegram fehlgeschlagen (ECONNRESET)'])

  const { sent, send } = recorder()
  const retry = createServerWarnings({ send, isEnabled: () => true, logger })
  assert.deepEqual(await retry.check({ samples: full, cores: 2, now: NOW + HOUR }), ['platte'], 'nicht vermerkt, also erneut')

  db.prepare("DELETE FROM settings WHERE key LIKE 'server_warnung%'").run()
  const rejected = Object.assign(new Error('nein'), { status: 502, upstreamStatus: 401 })
  const no = createServerWarnings({ send: recorder({ fail: rejected }).send, isEnabled: () => true, logger })
  await no.check({ samples: full, cores: 2, now: NOW })
  assert.equal(logged.at(-1), 'Server-Warnung per Telegram fehlgeschlagen (401)')
  assert.deepEqual(await retry.check({ samples: full, cores: 2, now: NOW + HOUR }), [], 'vermerkt, erst morgen wieder')
  assert.equal(sent.length, 1)
})

test('Text: Last mit Kernen und Schwelle, Vorschau gekennzeichnet', async () => {
  const { sent, send } = recorder()
  const warnings = createServerWarnings({ send, isEnabled: () => true, appEnv: 'staging', logger })
  const load = samples([{ load1: 2.4 }, { load1: 2.1 }, { load1: 1.9 }])
  await warnings.check({ samples: load, cores: 2, now: NOW })
  assert.deepEqual(sent, [
    '⚠️ Server-Warnung (Vorschau, kritisch): Die Last liegt bei 2,4 (2 Kerne) – bei den letzten drei stündlichen Messungen über 1,5. Details im Admin unter „Server“.'
  ])
})

test('Standard-Versand über den Admin-Bot (lib/telegram.js) und den Schalter aus den Einstellungen (Standard an)', async (t) => {
  const { setTelegramClientForTests } = require('../lib/telegram')
  const { readNotifySettings, updateNotifySettings } = require('../lib/notifySettings')
  const { saveTelegram } = require('../lib/telegramConfig')
  const messages = []
  const restore = setTelegramClientForTests({ sendMessage: async (message) => messages.push(message) })
  t.after(restore)

  assert.equal(readNotifySettings().server_warnung, true, 'Standard an')
  const warnings = createServerWarnings({ logger })
  assert.deepEqual(warnings.status(), { aktiv: true, eingerichtet: false })
  assert.deepEqual(await warnings.check({ samples: samples([{ disk_used_pct: 90 }]), cores: 2, now: NOW }), [], 'ohne Telegram nichts')

  saveTelegram({ token: FAKE_TOKEN, chatId: '4242' })
  assert.deepEqual(warnings.status(), { aktiv: true, eingerichtet: true })
  assert.deepEqual(await warnings.check({ samples: samples([{ disk_used_pct: 90 }]), cores: 2, now: NOW }), ['platte'])
  assert.equal(messages.length, 1)
  assert.equal(messages[0].token, FAKE_TOKEN)
  assert.equal(messages[0].chatId, '4242')

  db.prepare("DELETE FROM settings WHERE key LIKE 'server_warnung%'").run()
  updateNotifySettings({ server_warnung: false })
  assert.deepEqual(warnings.status(), { aktiv: false, eingerichtet: true })
  assert.deepEqual(await warnings.check({ samples: samples([{ disk_used_pct: 90 }]), cores: 2, now: NOW }), [])
  assert.equal(messages.length, 1)
})
