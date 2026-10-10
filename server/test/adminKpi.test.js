const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Plan 2027 Kap. 8 „Erfolg messen“ (lib/adminKpi.js, GET /api/admin/stats/kpi): Einlösungen je Serie/Kanal mit
// Zeitraum, Aktivierung (erste Erinnerung binnen 7 Tagen) und Wiederkommen (Aktivität in Woche 4) - ohne Demo-Daten.
const ADMIN_TEST_PASSWORD = 'admin-test-kpi-passwort-1'
const dataDir = useTempDataDir('adminKpi', { LOGIN_RATE_LIMIT: '300' })

test('Admin: Kennzahlen „Erfolg messen“', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  const db = require('../db')
  const { createBatch } = require('../lib/vouchers')
  const { kanalOf } = require('../lib/adminKpi')
  t.after(() => cleanup(dataDir, server))

  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const cookie = getCookie(login.res)
  const kpi = (query = '') => call(base, `/api/admin/stats/kpi${query}`, { cookie })

  const insertFamily = db.prepare(
    "INSERT INTO families (name, password_hash, art, is_demo, created_at) VALUES (?, 'x', ?, ?, datetime('now', ?))"
  )
  const insertDog = db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, 'Bello', 'ruede')")
  const insertEntry = db.prepare(
    "INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, created_at) VALUES (?, ?, 'Wir', '2026-01-01', 'Tag', datetime('now', ?))"
  )
  const insertComment = db.prepare(
    "INSERT INTO entry_comments (entry_id, family_id, autor_name, text, created_at) VALUES (?, ?, 'Wir', 'Hallo', datetime('now', ?))"
  )
  // Ein Zuhause, angelegt vor `alter` Tagen; entryNach: Tage nach dem Anlegen bis zur ersten Erinnerung (oder null).
  const zuhause = (name, alter, { entryNach = null, isDemo = 0, art = 'zuhause' } = {}) => {
    const id = Number(insertFamily.run(name, art, isDemo, `-${alter} days`).lastInsertRowid)
    const dogId = Number(insertDog.run(id).lastInsertRowid)
    const entry = entryNach === null ? null : Number(insertEntry.run(dogId, id, `-${alter - entryNach} days`).lastInsertRowid)
    return { id, dogId, entry }
  }

  // Aktivierung, 30 Tage = angelegt vor 7 bis 37 Tagen: A (Tag 2) und B (Tag 10, zu spät) zählen, C ist zu jung,
  // D zu alt, Demo und Rudel nie.
  zuhause('Zuhause Aktiv', 10, { entryNach: 2 })
  zuhause('Zuhause Spät', 20, { entryNach: 10 })
  zuhause('Zuhause Jung', 3, { entryNach: 1 })
  zuhause('Zuhause Alt', 200, { entryNach: 1 })
  zuhause('Demo Zuhause', 10, { entryNach: 1, isDemo: 1 })
  zuhause('Ein Rudel', 10, { entryNach: 1, art: 'rudel' })

  // Wiederkommen, 30 Tage = angelegt vor 28 bis 58 Tagen: W1 Kommentar an Tag 24, W2 nur Tag 2 aktiv, W3 Erinnerung an
  // Tag 22 (auch in der Aktivierungs-Kohorte nicht, die endet bei 37 Tagen).
  const w1 = zuhause('Zuhause Woche Vier', 40, { entryNach: 1 })
  insertComment.run(w1.entry, w1.id, '-16 days')
  zuhause('Zuhause Kurz', 45, { entryNach: 2 })
  const w3 = zuhause('Zuhause Treu', 50)
  insertEntry.run(w3.dogId, w3.id, '-28 days')

  // Stapel: FB-Serie (zwei Stapel), ein Stapel ohne Serie, ein Demo-Stapel.
  const redeemNow = db.prepare("UPDATE vouchers SET redeemed_at = datetime('now', ?) WHERE id = ?")
  const stapel = (label, size, redeemedAgo, kind = 'admin') => {
    const { batchId } = createBatch(db, { label, kind, size })
    const ids = db.prepare('SELECT id FROM vouchers WHERE batch_id = ? ORDER BY id').all(batchId).map((r) => r.id)
    redeemedAgo.forEach((ago, i) => redeemNow.run(`-${ago} days`, ids[i]))
    db.prepare("UPDATE voucher_batches SET created_at = datetime('now', '-100 days') WHERE id = ?").run(batchId)
    return batchId
  }
  stapel('FB-Frühjahr', 4, [5, 60])
  stapel('fb-Herbst', 2, [])
  stapel('Kundenkarten', 3, [100])
  stapel('Demo-Stapel', 3, [1], 'demo')

  await t.test('Rechte, Zeitraum, Zahlen', async () => {
    assert.equal((await call(base, '/api/admin/stats/kpi')).status, 401)
    assert.equal((await kpi('?zeitraum=7')).status, 400)

    const res = await kpi()
    assert.equal(res.status, 200)
    assert.match(res.headers.get('cache-control') ?? '', /no-store/)
    assert.equal(res.data.zeitraum, '30')
    assert.deepEqual(res.data.ziel, { aktivierung: 50, wiederkommen: 25 })
    assert.deepEqual(res.data.aktivierung, { kohorte: 2, erreicht: 1, quote: 50 })
    assert.deepEqual(res.data.wiederkommen, { kohorte: 3, erreicht: 2, quote: 66.7 })

    // 30 Tage: nur Stapel mit Einlösung im Zeitraum (alle sind älter als 30 Tage) - FB-Frühjahr.
    assert.deepEqual(
      res.data.einloesungen.stapel.map(({ label, kanal, ausgegeben, eingeloest, eingeloestGesamt, quote }) => ({
        label, kanal, ausgegeben, eingeloest, eingeloestGesamt, quote
      })),
      [{ label: 'FB-Frühjahr', kanal: 'FB', ausgegeben: 4, eingeloest: 1, eingeloestGesamt: 2, quote: 50 }]
    )

    const alle = await kpi('?zeitraum=alle')
    assert.equal(alle.data.einloesungen.stapel.length, 3)
    const kanaele = Object.fromEntries(alle.data.einloesungen.kanaele.map((k) => [k.kanal ?? '-', k]))
    assert.deepEqual(Object.keys(kanaele).sort(), ['-', 'FB'])
    assert.equal(kanaele.FB.stapel, 2)
    assert.equal(kanaele.FB.ausgegeben, 6)
    assert.equal(kanaele.FB.eingeloestGesamt, 2)
    assert.equal(kanaele.FB.quote, 33.3)
    assert.equal(kanaele['-'].eingeloest, 1)
    assert.equal(alle.data.aktivierung.kohorte, 6)

    assert.equal(kanalOf({ label: 'ANZ-Zeitung', partnerName: 'Hundeschule Test' }), 'ANZ')
    assert.equal(kanalOf({ label: 'Kundenkarten', partnerName: 'Hundeschule Test' }), 'Hundeschule Test')
    assert.equal(kanalOf({ label: 'Kundenkarten', partnerName: null }), null)
  })
})
