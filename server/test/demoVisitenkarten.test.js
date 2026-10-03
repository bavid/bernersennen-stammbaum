const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Phase V5: die gespeicherten Visitenkarten der Demo (seed/demo-partner-area.js VISITENKARTEN, lib/demoPartnerAreas.js) -
// Pfotenglück "Foto" mit Kunden-Gutschein, das Demo-Tierheim "Klassisch", geprüft wie echte Eingaben, is_demo = 1 und bei
// jedem Demo-Wechsel ohne Waisen ersetzt. t.test() bleibt auf einer Ebene.
const dataDir = useTempDataDir('demo-visitenkarten', { LOGIN_RATE_LIMIT: '300' })

const PFOTENGLUECK = 'hundeschule-pfotenglueck'
const SONNENHANG = 'tierheim-sonnenhang'

test('Demo: Visitenkarten der Demo-Partner', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { validateDesign } = require('../lib/visitenkarteDesign')
  const { VISITENKARTEN } = require('../seed/demo-partner-area')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const rows = () => db.prepare('SELECT v.*, p.slug FROM partner_visitenkarte v LEFT JOIN partners p ON p.id = v.partner_id ORDER BY p.slug').all()

  const first = replaceDemoPack(db, uploadDir)

  await t.test('Pfotenglück Foto mit Gutschein, Tierheim Klassisch - beide als Demo markiert', () => {
    assert.deepEqual(first.visitenkarten, { [PFOTENGLUECK]: 'foto', [SONNENHANG]: 'klassisch' })
    const [schule, tierheim] = rows()
    assert.deepEqual([schule.slug, schule.is_demo], [PFOTENGLUECK, 1])
    assert.deepEqual([tierheim.slug, tierheim.is_demo], [SONNENHANG, 1])
    assert.equal(JSON.parse(schule.design).mitGutschein, true)
    assert.equal(JSON.parse(tierheim.design).mitGutschein, false)
    for (const { design } of VISITENKARTEN) assert.deepEqual(validateDesign(design), design)
  })

  await t.test('Kunden-Stapel von Pfotenglück: zwei offene Codes stehen schon auf gedruckten Karten', async () => {
    const counts = db
      .prepare(
        `SELECT COUNT(CASE WHEN v.gedruckt_at IS NOT NULL THEN 1 END) AS gedruckt,
                COUNT(CASE WHEN v.gedruckt_at IS NOT NULL AND v.redeemed_at IS NULL AND v.revoked_at IS NULL THEN 1 END) AS gedrucktOffen
         FROM vouchers v JOIN partners p ON p.id = v.partner_id WHERE p.slug = ?`
      )
      .get(PFOTENGLUECK)
    assert.deepEqual(counts, { gedruckt: 2, gedrucktOffen: 2 })
    const partner = await post('/api/demo', { as: 'partner' })
    const cookie = getCookie(partner.res)
    const stacks = await call(base, '/api/partner-area/vouchers', { cookie })
    const print = await call(base, `/api/partner-area/vouchers/${stacks.data.stapel[0].id}/print`, { cookie })
    assert.equal(print.data.schonGedruckt, 2)
  })

  await t.test('Demo-Sitzungen sehen ihre gespeicherte Gestaltung', async () => {
    const partner = await post('/api/demo', { as: 'partner' })
    const design = await call(base, '/api/partner-area/visitenkarte', { cookie: getCookie(partner.res) })
    assert.equal(design.data.gespeichert, true)
    assert.equal(design.data.design.vorlage, 'foto')
    const shelter = await post('/api/demo', { as: 'tierheim' })
    const shelterDesign = await call(base, '/api/partner-area/visitenkarte', { cookie: getCookie(shelter.res) })
    assert.equal(shelterDesign.data.design.vorlage, 'klassisch')
  })

  await t.test('Demo-Wechsel: die Visitenkarten werden ersetzt, ohne verwaiste Zeilen an alten Partnern', () => {
    const second = replaceDemoPack(db, uploadDir)
    assert.deepEqual(second.visitenkarten, first.visitenkarten)
    const after = rows()
    assert.equal(after.length, 2)
    assert.ok(after.every((row) => row.slug !== null), 'jede Gestaltung gehört zu einem bestehenden Partner')
    assert.deepEqual(
      after.map((row) => row.partner_id).sort(),
      db.prepare('SELECT id FROM partners WHERE slug IN (?, ?)').all(PFOTENGLUECK, SONNENHANG).map((row) => row.id).sort()
    )
  })

  await t.test('eine echte Gestaltung (is_demo = 0) übersteht den Demo-Wechsel', () => {
    const real = db.prepare("INSERT INTO partners (slug, name, typ) VALUES ('vk-echt', 'Hundeschule Echt', 'hundeschule')").run()
    db.prepare("INSERT INTO partner_visitenkarte (partner_id, design, is_demo) VALUES (?, '{}', 0)").run(real.lastInsertRowid)
    replaceDemoPack(db, uploadDir)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM partner_visitenkarte WHERE partner_id = ?').get(real.lastInsertRowid).c, 1)
  })
})
