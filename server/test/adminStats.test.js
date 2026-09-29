const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Phase 5 Task 1: Druckdaten (Klartext-Codes nur für offene Gutscheine, nur für den Admin, no-store),
// CSV-Export ohne Codes, Statistik (Einlösungen, Mundpropaganda-Ketten, Klicks, Partner - alles ohne Demo)
// und die Herkunft je Bereich in der Rudel-Liste.
const ADMIN_TEST_PASSWORD = 'admin-test-statistik-passwort-1'
const PUBLIC_URL = 'https://familie-auf-pfoten.example'
const dataDir = useTempDataDir('adminStats', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300', PUBLIC_URL })

const PARTNER_NAME = 'Hundeschule Pfotenglück'
const PARTNER_FARBE = '#7a3b12'
const CSV_BOM = '﻿'
const CSV_HEADER = 'Hinweis;Status;Eingelöst am;Bereich;Partner'

const rawCode = (formatted) => formatted.replace(/-/g, '')

test('Admin: Druckdaten, CSV-Export, Statistik und Herkunft', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  // Erst nach ADMIN_PASSWORD_HASH und startApp() requiren, siehe admin.test.js.
  const db = require('../db')
  const { createBatch } = require('../lib/vouchers')
  const { hashCode } = require('../lib/codes')
  t.after(() => cleanup(dataDir, server))

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)

  const post = (urlPath, body, cookie = adminCookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const get = (urlPath, cookie = adminCookie) => call(base, urlPath, { cookie })
  const redeem = (code, name) => post('/api/vouchers/redeem', { code, name }, null)
  const mine = (cookie) => get('/api/vouchers/mine', cookie)
  // Für Antworten, die kein JSON sind (CSV). Über Buffer statt res.text(): der WHATWG-Decoder von fetch
  // verschluckt ein UTF-8-BOM, Buffer#toString behält es - nur so lässt sich das BOM prüfen.
  const raw = async (urlPath, cookie = adminCookie) => {
    const res = await fetch(`${base}${urlPath}`, { headers: cookie ? { Cookie: cookie } : {} })
    const bytes = Buffer.from(await res.arrayBuffer())
    return { status: res.status, headers: res.headers, bytes, text: bytes.toString('utf8') }
  }
  const voucherIdOf = async (batchId, formattedCode) => {
    const detail = await get(`/api/admin/voucher-batches/${batchId}`)
    return detail.data.vouchers.find((voucher) => voucher.code === formattedCode).id
  }
  const sqlDate = (modifier = '+0 days') => db.prepare("SELECT date('now', ?) AS d").get(modifier).d
  const insertClick = db.prepare("INSERT INTO link_clicks (target_type, target_id, tag, anzahl) VALUES (?, ?, date('now', ?), ?)")
  const insertPromotion = db.prepare(
    `INSERT INTO promotions (bereich, kennzeichnung, titel, partner_id, erstellt_von_partner, freigabe, is_demo)
     VALUES ('futter', 'Anzeige', ?, ?, ?, ?, ?)`
  )
  const insertEinblick = db.prepare(
    "INSERT INTO partner_einblicke (partner_id, foto_url, datum, einwilligung, is_demo) VALUES (?, '/uploads/e.jpg', '2026-09-01', 1, ?)"
  )
  const insertMessage = db.prepare("INSERT INTO partner_messages (partner_id, nachricht, gelesen_at, is_demo) VALUES (?, 'Hallo', ?, ?)")

  // --- Echte Daten -------------------------------------------------------------------------------

  // Partner mit eigenem Bereich; der Bereich gibt Kunden-Gutscheine weiter (Herkunft partner:<Name>).
  const partner = await post('/api/admin/partners', { name: PARTNER_NAME, slug: 'pfotenglueck', typ: 'hundeschule', status: 'aktiv' })
  assert.equal(partner.status, 201)
  db.prepare('UPDATE partners SET farbe = ? WHERE id = ?').run(PARTNER_FARBE, partner.data.id)
  const area = await post(`/api/admin/partners/${partner.data.id}/area`)
  assert.equal(area.status, 201)
  const areaLogin = await post('/api/login', { secret: area.data.key }, null)
  const areaCookie = getCookie(areaLogin.res)
  const areaVouchers = await mine(areaCookie)
  assert.equal(areaVouchers.status, 200)
  const kundschaft = await redeem(areaVouchers.data[0].code, 'Zuhause Kundschaft')
  assert.equal(kundschaft.status, 201)

  // Weitere Partner nur für die Status-Zählung.
  await post('/api/admin/partners', { name: 'Tierheim Entwurf', slug: 'tierheim-entwurf', typ: 'tierheim' })
  await post('/api/admin/partners', { name: 'Salon Pause', slug: 'salon-pause', typ: 'hundesalon', status: 'pausiert' })
  const gesperrt = await post('/api/admin/partners', { name: 'Betreuung Gesperrt', slug: 'betreuung-gesperrt', typ: 'betreuung', status: 'aktiv' })
  db.prepare("UPDATE partners SET gesperrt = 1, status = 'pausiert' WHERE id = ?").run(gesperrt.data.id)

  // Admin-Stapel "Kundenkarten": eingelöst, widerrufen, abgelaufen, ohne Geheimtext, offen.
  const kundenkarten = await post('/api/admin/voucher-batches', { label: 'Kundenkarten', size: 5 })
  assert.equal(kundenkarten.status, 201)
  const [eingeloestCode, widerrufenCode, abgelaufenCode, ohneCipherCode, offenCode] = kundenkarten.data.codes
  const karte = await redeem(eingeloestCode, 'Zuhause Karte')
  assert.equal(karte.status, 201)
  const revoked = await post(`/api/admin/vouchers/${await voucherIdOf(kundenkarten.data.batch.id, widerrufenCode)}/revoke`)
  assert.equal(revoked.status, 200)
  db.prepare("UPDATE vouchers SET expires_at = '2000-01-01 00:00:00' WHERE code_hash = ?").run(hashCode(rawCode(abgelaufenCode)))
  db.prepare('UPDATE vouchers SET code_cipher = NULL WHERE code_hash = ?').run(hashCode(rawCode(ohneCipherCode)))

  // Partner-Stapel (Herkunft partner:<Name>), ein Bereichsname wie eine Tabellen-Formel.
  const partnerkarten = await post('/api/admin/voucher-batches', { label: 'Pfotenglück-Karten', size: 3, partnerId: partner.data.id })
  assert.equal(partnerkarten.status, 201)
  assert.equal((await redeem(partnerkarten.data.codes[0], 'Zuhause Partnerkarte')).status, 201)
  assert.equal((await redeem(partnerkarten.data.codes[1], '=Zuhause Formel')).status, 201)

  // Partner-Zugänge (eigener Zweck), nichts eingelöst.
  const zugaenge = await post('/api/admin/voucher-batches', { label: 'Partner-Zugänge', size: 3, zweck: 'partnerzugang' })
  assert.equal(zugaenge.status, 201)

  // Mundpropaganda: Anfang -> Zweite -> Vierte, Anfang -> Dritte (3 Nachkommen, Tiefe 2); Einzeln -> Folge.
  const anfang = await createHousehold(base, 'Zuhause Anfang')
  const anfangVouchers = await mine(anfang.cookie)
  const zweite = await redeem(anfangVouchers.data[0].code, 'Zuhause Zweite')
  assert.equal(zweite.status, 201)
  assert.equal((await redeem(anfangVouchers.data[1].code, 'Zuhause Dritte')).status, 201)
  const zweiteVouchers = await mine(getCookie(zweite.res))
  assert.equal((await redeem(zweiteVouchers.data[0].code, 'Zuhause Vierte')).status, 201)
  const einzeln = await createHousehold(base, 'Zuhause Einzeln')
  const einzelnVouchers = await mine(einzeln.cookie)
  assert.equal((await redeem(einzelnVouchers.data[0].code, 'Zuhause Folge')).status, 201)

  // Altbestand mit Freitext-Quelle.
  await createFamily(base, 'Rudel Altbestand', 'altbestand-pw-1', { quelle: 'Flyer im Futterladen' })

  // Klicks: eine Empfehlung, der Website-Link des Partners, der echte GoFundMe-Link.
  const futterTipp = insertPromotion.run('Futter-Tipp', null, 0, 'freigegeben', 0).lastInsertRowid
  insertClick.run('promotion', futterTipp, '+0 days', 3)
  insertClick.run('promotion', futterTipp, '-3 days', 2)
  insertClick.run('promotion', futterTipp, '-10 days', 5)
  insertClick.run('promotion', futterTipp, '-40 days', 7)
  insertClick.run('partner-website', partner.data.id, '-1 days', 4)
  insertClick.run('gofundme', 0, '+0 days', 1)

  // Partner-Block: Einblicke, Beiträge je Freigabe, ungelesene Nachrichten.
  insertEinblick.run(partner.data.id, 0)
  insertEinblick.run(partner.data.id, 0)
  for (const freigabe of ['eingereicht', 'eingereicht', 'freigegeben', 'abgelehnt']) {
    insertPromotion.run(`Beitrag ${freigabe}`, partner.data.id, 1, freigabe, 0)
  }
  insertMessage.run(partner.data.id, null, 0)
  insertMessage.run(partner.data.id, null, 0)
  insertMessage.run(partner.data.id, '2026-09-01 10:00:00', 0)

  const fremd = await createFamily(base, 'Rudel Fremd', 'fremd-pw-1')

  // --- Druckdaten ---------------------------------------------------------------------------------

  await t.test('print: nur offene Codes mit Geheimtext, Rest zählt als nichtDruckbar, no-store', async () => {
    const res = await get(`/api/admin/voucher-batches/${kundenkarten.data.batch.id}/print`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual(res.data.codes, [offenCode])
    assert.equal(res.data.nichtDruckbar, 4)
    assert.deepEqual(res.data.batch, {
      id: kundenkarten.data.batch.id,
      label: 'Kundenkarten',
      zweck: 'chronik',
      partnerTyp: null,
      partner: null
    })
  })

  await t.test('print: Partner-Stapel trägt Name, Logo und Farbe des Partners; Partner-Zugänge ihren Zweck', async () => {
    const res = await get(`/api/admin/voucher-batches/${partnerkarten.data.batch.id}/print`)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.codes, [partnerkarten.data.codes[2]])
    assert.equal(res.data.nichtDruckbar, 2)
    assert.deepEqual(res.data.batch.partner, { name: PARTNER_NAME, logoUrl: null, farbe: PARTNER_FARBE })

    const zugang = await get(`/api/admin/voucher-batches/${zugaenge.data.batch.id}/print`)
    assert.equal(zugang.data.batch.zweck, 'partnerzugang')
    assert.equal(zugang.data.batch.partner, null)
    assert.equal(zugang.data.codes.length, 3)
  })

  await t.test('print und CSV: 404 für unbekannte Stapel, auch die 404 mit no-store', async () => {
    const missing = await get('/api/admin/voucher-batches/999999/print')
    assert.equal(missing.status, 404)
    assert.equal(missing.headers.get('cache-control'), 'no-store')
    assert.equal((await get('/api/admin/voucher-batches/abc/print')).status, 404)
    const missingCsv = await raw('/api/admin/voucher-batches/999999/export.csv')
    assert.equal(missingCsv.status, 404)
    assert.equal(missingCsv.headers.get('cache-control'), 'no-store')
  })

  await t.test('print, CSV und stats: kein ETag (kein Validator für Klartext-Codes)', async () => {
    const batchId = kundenkarten.data.batch.id
    for (const res of [
      await get(`/api/admin/voucher-batches/${batchId}/print`),
      await raw(`/api/admin/voucher-batches/${batchId}/export.csv`),
      await get('/api/admin/stats'),
      await get('/api/admin/voucher-batches/999999/print')
    ]) {
      assert.equal(res.headers.get('etag'), null)
      assert.equal(res.headers.get('cache-control'), 'no-store')
    }
  })

  await t.test('Indizes für Statistik und Herkunft sind angelegt', () => {
    const indexNames = (table) => db.prepare(`PRAGMA index_list(${table})`).all().map((row) => row.name)
    assert.ok(indexNames('link_clicks').includes('idx_link_clicks_tag'))
    assert.ok(indexNames('families').includes('idx_families_partner'))
  })

  // --- CSV ----------------------------------------------------------------------------------------

  await t.test('CSV: BOM, Semikolon, Anhang, Status je Gutschein, keine Codes', async () => {
    const res = await raw(`/api/admin/voucher-batches/${kundenkarten.data.batch.id}/export.csv`)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /^text\/csv/)
    assert.match(res.headers.get('content-disposition'), /^attachment; filename="gutscheine-stapel-\d+\.csv"$/)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.deepEqual([...res.bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf])
    assert.ok(res.text.startsWith(CSV_BOM))

    const lines = res.text.slice(CSV_BOM.length).split('\r\n').filter(Boolean)
    assert.equal(lines[0], CSV_HEADER)
    assert.equal(lines.length, 6)
    const rows = lines.slice(1).map((line) => line.split(';'))
    assert.deepEqual(rows.map((row) => row[1]).sort(), ['abgelaufen', 'eingelöst', 'offen', 'offen', 'widerrufen'])
    const eingeloest = rows.find((row) => row[1] === 'eingelöst')
    assert.match(eingeloest[2], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    assert.equal(eingeloest[3], 'Zuhause Karte')
    assert.ok(rows.every((row) => /^[0-9A-Z]{4}$/.test(row[0])))

    for (const code of kundenkarten.data.codes) {
      assert.equal(res.text.includes(code), false)
      assert.equal(res.text.includes(rawCode(code)), false)
    }
  })

  await t.test('CSV: Partner-Spalte, Formel-Schutz für Bereichsnamen', async () => {
    const res = await raw(`/api/admin/voucher-batches/${partnerkarten.data.batch.id}/export.csv`)
    const lines = res.text.slice(CSV_BOM.length).split('\r\n').filter(Boolean)
    assert.equal(lines.length, 4)
    assert.ok(lines.slice(1).every((line) => line.endsWith(`;${PARTNER_NAME}`)))
    assert.ok(lines.some((line) => line.includes(";'=Zuhause Formel;")), lines.join('\n'))
    assert.equal(res.text.includes('=Zuhause Formel;') && !res.text.includes("'=Zuhause Formel;"), false)
  })

  await t.test('voucherCsv: Anführungszeichen und Semikolons werden RFC-4180-konform maskiert', () => {
    const { voucherCsv } = require('../lib/voucherPrint')
    const csv = voucherCsv([
      {
        code_hint: 'AB12',
        redeemed_at: '2026-01-01 10:00:00',
        revoked_at: null,
        expires_at: null,
        redeemed_by_name: 'Zuhause "Anführung"; Semikolon',
        partner_name: null
      }
    ])
    assert.equal(csv, `${CSV_BOM}${CSV_HEADER}\r\nAB12;eingelöst;2026-01-01 10:00:00;"Zuhause ""Anführung""; Semikolon";\r\n`)
  })

  // --- Statistik ----------------------------------------------------------------------------------

  await t.test('stats: Einlösungen je Stapel (nur Admin-/Partner-Stapel), je Partner und je Zweck', async () => {
    const res = await get('/api/admin/stats')
    assert.equal(res.status, 200)
    const { stapel, partner: partnerRows, zweck } = res.data.einloesungen

    const byLabel = (label) => stapel.find((row) => row.label === label)
    assert.deepEqual(byLabel('Kundenkarten'), {
      id: kundenkarten.data.batch.id,
      label: 'Kundenkarten',
      zweck: 'chronik',
      size: 5,
      eingeloest: 1,
      offen: 2,
      widerrufen: 1
    })
    assert.deepEqual(byLabel('Pfotenglück-Karten'), {
      id: partnerkarten.data.batch.id,
      label: 'Pfotenglück-Karten',
      zweck: 'chronik',
      size: 3,
      eingeloest: 2,
      offen: 1,
      widerrufen: 0
    })
    assert.equal(byLabel('Partner-Zugänge').offen, 3)
    // Weitergabe-Stapel der Bereiche (kind 'rudel') gehören zur Mundpropaganda, nicht in diese Liste.
    assert.equal(stapel.some((row) => row.label.startsWith('Weitergabe')), false)

    // Kundschaft (Weitergabe aus dem Partner-Bereich), Partnerkarte und Formel (Partner-Stapel) - der
    // Bereich des Partners selbst zählt nicht als neuer Bereich.
    assert.deepEqual(partnerRows[0], { partnerId: partner.data.id, name: PARTNER_NAME, neueBereiche: 3 })
    assert.equal(partnerRows.length, 4)
    assert.ok(partnerRows.slice(1).every((row) => row.neueBereiche === 0))

    assert.deepEqual(zweck.find((row) => row.zweck === 'partnerzugang'), {
      zweck: 'partnerzugang',
      gesamt: 3,
      eingeloest: 0,
      offen: 3,
      widerrufen: 0
    })
    // chronik: Bereich 3 (1 eingelöst), Kundenkarten 5 (1/1 widerrufen/1 abgelaufen), Pfotenglück-Karten 3
    // (2), Anfang 1+3 (1+2), Zweite 3 (1), Einzeln 1+3 (1+1) = 22 gesamt, 10 eingelöst, 10 offen, 1 widerrufen.
    assert.deepEqual(zweck.find((row) => row.zweck === 'chronik'), {
      zweck: 'chronik',
      gesamt: 22,
      eingeloest: 10,
      offen: 10,
      widerrufen: 1
    })
  })

  await t.test('stats: Mundpropaganda-Ketten mit Tiefe und Top-Startbereichen', async () => {
    const res = await get('/api/admin/stats')
    const { ketten, maxTiefe, top } = res.data.mundpropaganda
    // Anfang (3 Nachkommen), Partner-Bereich -> Kundschaft, Einzeln -> Folge.
    assert.equal(ketten, 3)
    assert.equal(maxTiefe, 2)
    assert.deepEqual(top[0], { startFamilyId: anfang.data.id, name: 'Zuhause Anfang', nachkommen: 3 })
    assert.deepEqual(
      top.map((row) => row.startFamilyId),
      [anfang.data.id, area.data.familyId, einzeln.data.id]
    )
    assert.deepEqual(top.slice(1).map((row) => row.nachkommen), [1, 1])
    assert.equal(top.find((row) => row.startFamilyId === area.data.familyId).name, PARTNER_NAME)
  })

  await t.test('stats: Klicks als Tagesreihe der letzten 30 Tage und Top-Ziele mit Titel', async () => {
    const res = await get('/api/admin/stats')
    const { tage, top } = res.data.klicks
    assert.equal(tage.length, 30)
    assert.equal(tage[0].tag, sqlDate('-29 days'))
    assert.equal(tage[29].tag, sqlDate())
    const anzahl = (modifier) => tage.find((row) => row.tag === sqlDate(modifier)).anzahl
    assert.equal(anzahl('+0 days'), 4)
    assert.equal(anzahl('-1 days'), 4)
    assert.equal(anzahl('-3 days'), 2)
    assert.equal(anzahl('-10 days'), 5)
    assert.equal(tage.reduce((sum, row) => sum + row.anzahl, 0), 15)

    assert.deepEqual(top, [
      { targetType: 'promotion', targetId: futterTipp, titel: 'Futter-Tipp', klicks7: 5, klicks30: 10, gesamt: 17 },
      { targetType: 'partner-website', targetId: partner.data.id, titel: `${PARTNER_NAME} – Website`, klicks7: 4, klicks30: 4, gesamt: 4 },
      { targetType: 'gofundme', targetId: 0, titel: 'Unterstützen', klicks7: 1, klicks30: 1, gesamt: 1 }
    ])
  })

  await t.test('stats: Partner je Status, Einblicke, Beiträge je Freigabe, ungelesene Nachrichten', async () => {
    const res = await get('/api/admin/stats')
    assert.deepEqual(res.data.partner, {
      status: { entwurf: 1, aktiv: 1, pausiert: 1, gesperrt: 1 },
      einblicke: 2,
      beitraege: { eingereicht: 2, freigegeben: 1, abgelehnt: 1 },
      ungeleseneNachrichten: 2
    })
  })

  // --- Herkunft -----------------------------------------------------------------------------------

  await t.test('overview: Herkunft je Bereich, bisherige Felder bleiben', async () => {
    const res = await get('/api/admin/overview')
    assert.equal(res.status, 200)
    const byName = (name) => res.data.families.find((family) => family.name === name)
    assert.equal(byName('Zuhause Kundschaft').herkunft, `partner:${PARTNER_NAME}`)
    assert.equal(byName('Zuhause Partnerkarte').herkunft, `partner:${PARTNER_NAME}`)
    assert.equal(byName(PARTNER_NAME).herkunft, `partner:${PARTNER_NAME}`)
    assert.equal(byName('Zuhause Karte').herkunft, 'stapel:Kundenkarten')
    assert.equal(byName('Zuhause Zweite').herkunft, 'weitergabe:Zuhause Anfang')
    assert.equal(byName('Zuhause Vierte').herkunft, 'weitergabe:Zuhause Zweite')
    const alt = byName('Rudel Altbestand')
    assert.equal(alt.herkunft, 'altbestand')
    assert.equal(alt.quelle, 'Flyer im Futterladen')
    for (const key of ['id', 'art', 'is_demo', 'created_at', 'dogs', 'entries', 'notes', 'replies', 'last_activity']) {
      assert.ok(key in alt, key)
    }
    assert.equal(res.data.families.some((family) => 'herkunft_partner' in family), false)
  })

  // --- Zugriff ------------------------------------------------------------------------------------

  await t.test('kein Zugriff ohne Admin (401), auch nicht mit einer Bereichs-Sitzung', async () => {
    const batchId = kundenkarten.data.batch.id
    for (const cookie of [fremd.cookie, null]) {
      assert.equal((await get(`/api/admin/voucher-batches/${batchId}/print`, cookie)).status, 401)
      assert.equal((await raw(`/api/admin/voucher-batches/${batchId}/export.csv`, cookie)).status, 401)
      assert.equal((await get('/api/admin/stats', cookie)).status, 401)
    }
  })

  await t.test('GET /api/config liefert publicUrl', async () => {
    const res = await call(base, '/api/config')
    assert.equal(res.status, 200)
    assert.equal(res.data.publicUrl, PUBLIC_URL)
  })

  // --- Demo bleibt außen vor ------------------------------------------------------------------------

  await t.test('stats: Demo-Bereiche, -Partner, -Stapel, -Empfehlungen und -Nachrichten zählen nicht', async () => {
    const before = (await get('/api/admin/stats')).data

    // Demo-Bereich gibt einen Gutschein weiter, daraus entsteht ein Bereich - keine Kette.
    const demoStart = await createFamily(base, 'Zuhause Demo-Start', 'demo-start-pw-1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoStart.data.id)
    const demoWeitergabe = createBatch(db, { label: 'Weitergabe Demo', kind: 'rudel', size: 1, issuedByFamilyId: demoStart.data.id })
    const demoFolge = await redeem(demoWeitergabe.codes[0], 'Zuhause Demo-Folge')
    assert.equal(demoFolge.status, 201)

    // Demo-Stapel (Schein-Einladung der Demo, lässt sich nie einlösen) mit zwei offenen Gutscheinen.
    createBatch(db, { label: 'Demo-Stapel', kind: 'demo', size: 2 })

    // Demo-Partner mit zugerechnetem Bereich, Einblick, Beitrag, ungelesener Nachricht und Klicks;
    // Demo-Empfehlung mit Klicks.
    const demoPartner = db
      .prepare("INSERT INTO partners (slug, name, typ, status, is_demo) VALUES ('demo-schule', 'Demo-Hundeschule', 'hundeschule', 'aktiv', 1)")
      .run().lastInsertRowid
    db.prepare('UPDATE families SET partner_id = ? WHERE id = ?').run(demoPartner, demoFolge.data.id)
    insertEinblick.run(demoPartner, 1)
    insertPromotion.run('Demo-Beitrag', demoPartner, 1, 'eingereicht', 1)
    insertMessage.run(demoPartner, null, 1)
    insertClick.run('partner-website', demoPartner, '+0 days', 50)
    const demoPromotion = insertPromotion.run('Demo-Empfehlung', null, 0, 'freigegeben', 1).lastInsertRowid
    insertClick.run('promotion', demoPromotion, '+0 days', 100)
    insertClick.run('gofundme', 1, '+0 days', 50)

    const after = (await get('/api/admin/stats')).data
    assert.deepEqual(after, before)
    assert.equal(after.einloesungen.stapel.some((row) => row.label === 'Demo-Stapel'), false)
    assert.equal(after.einloesungen.partner.some((row) => row.name === 'Demo-Hundeschule'), false)
  })
})
