const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// Phase R Task 3: die Demo-Familie hat alle vier Rollen (lib/demoMembers.js, seed/demo-members.js) und eine
// offene Einladung mit Rolle; ein Demo-Wechsel ersetzt alles ohne Waisen, echte Daten bleiben unberührt, und
// die Mitglieder-Seite ist in der Demo nur lesbar. t.test() bleibt auf einer Ebene.
const dataDir = useTempDataDir('demomembers', { LOGIN_RATE_LIMIT: '200', CODE_RATE_LIMIT: '200' })
const MEMBERS = '/api/family/members'

test('Demo-Familie mit allen Rollen', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')
  const { createBatch, DEMO_BATCH_KIND, findVoucherByHash, assertVoucherOpen } = require('../lib/vouchers')
  const { hashCode } = require('../lib/codes')
  const { MEMBERS: SEED } = require('../seed/demo-members')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })

  // Echte Daten, die kein Demo-Wechsel anfassen darf: eine Familie mit einem echten Mitglied samt Freigabe
  // und einer echten Einladung (Kontingent über GET /vouchers/mine).
  const realHome = await createFamily(base, 'Zuhause Echt', 'echt-zuhause-pw', { art: 'zuhause' })
  const realFamily = await createFamily(base, 'Familie Echt', 'echt-familie-pw')
  await post('/api/families/join', { password: 'echt-familie-pw' }, realHome.cookie)
  const realDog = (await post('/api/dogs', { name: 'Bleibt', geschlecht: 'ruede' }, realHome.cookie)).data
  await put(`/api/dogs/${realDog.id}/shares`, { familyIds: [realFamily.data.id] }, realHome.cookie)
  await get('/api/vouchers/mine', realFamily.cookie)
  const snapshotReal = () => ({
    members: db.prepare('SELECT * FROM family_members WHERE group_family_id = ? ORDER BY member_family_id').all(realFamily.data.id),
    shares: db.prepare('SELECT * FROM dog_shares WHERE family_id = ?').all(realFamily.data.id),
    vouchers: db.prepare('SELECT id, join_family_id, join_rolle, revoked_at FROM vouchers WHERE join_family_id = ? ORDER BY id').all(realFamily.data.id)
  })
  const realBefore = snapshotReal()
  assert.equal(realBefore.vouchers.length, 3)

  const first = replaceDemoPack(db, uploadDir)
  const { created, household, members } = replaceDemoPack(db, uploadDir)

  const rudelMembers = () =>
    db
      .prepare(
        `SELECT f.id, f.name, f.is_demo, f.art, f.legacy_password, f.access_key_hash, m.rolle, m.created_at,
           (SELECT COUNT(*) FROM dog_shares ds JOIN dogs d ON d.id = ds.dog_id WHERE ds.family_id = m.group_family_id AND d.family_id = f.id) AS shares
         FROM family_members m JOIN families f ON f.id = m.member_family_id WHERE m.group_family_id = ? ORDER BY m.created_at`
      )
      .all(created.familyId)

  await t.test('alle vier Rollen sind besetzt: Zuhause am Deich leitet, dazu Stellvertretung, Mitglied und Gast', () => {
    assert.equal(members.households.length, 3)
    const rows = rudelMembers()
    assert.deepEqual(
      rows.map((r) => [r.name, r.rolle, r.shares]),
      [
        ['Zuhause Möwenweg (Demo)', 'stellvertretung', 1],
        ['Zuhause Lindenhof (Demo)', 'mitglied', 1],
        ['Zuhause Heidekamp (Demo)', 'gast', 0],
        ['Zuhause am Deich', 'leitung', 2]
      ]
    )
    for (const row of rows) {
      assert.equal(row.is_demo, 1, `${row.name} ist Demo`)
      assert.equal(row.art, 'zuhause')
    }
    for (const row of rows.slice(0, 3)) {
      assert.equal(row.legacy_password, 0, `${row.name}: kein Passwort-Login`)
      assert.equal(row.access_key_hash, null, `${row.name}: kein Schlüssel`)
    }
    assert.deepEqual(
      members.households.map((h) => h.rolle),
      SEED.map((m) => m.rolle)
    )
    assert.equal(members.comments, 1, 'der Gast hat einmal kommentiert')
  })

  await t.test('eine offene Demo-Einladung mit Rolle gast - nie einlösbar, in /check unbekannt', async () => {
    const invites = db
      .prepare('SELECT v.id, v.join_rolle, v.code_cipher, v.redeemed_at, v.revoked_at, v.issued_by_family_id, b.kind FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id WHERE v.join_family_id = ?')
      .all(created.familyId)
    assert.equal(invites.length, 1)
    const [invite] = invites
    assert.equal(invite.id, members.invite.voucherId)
    assert.equal(invite.join_rolle, 'gast')
    assert.equal(invite.kind, DEMO_BATCH_KIND)
    assert.ok(invite.code_cipher, 'wie jeder offene Gutschein (die Admin-Stapelansicht entschlüsselt offene Codes)')
    assert.equal(invite.redeemed_at, null)
    assert.equal(invite.revoked_at, null)
    assert.equal(invite.issued_by_family_id, created.familyId)

    // Ein Gutschein derselben Stapel-Art ist nach außen unbekannt, auch wenn jemand den Code kennt
    const { codes } = createBatch(db, { label: 'Demo-Probe', kind: DEMO_BATCH_KIND, size: 1, joinFamilyId: created.familyId, joinRolle: 'gast' })
    assert.deepEqual((await post('/api/vouchers/check', { code: codes[0] })).data, { status: 'unbekannt' })
    const redeem = await post('/api/vouchers/redeem', { code: codes[0], name: 'Zuhause Schwindel' })
    assert.equal(redeem.status, 404)
    assert.throws(() => assertVoucherOpen(findVoucherByHash(db, hashCode(codes[0]))), /kennen wir nicht/)
    assert.equal(db.prepare('SELECT redeemed_at FROM vouchers WHERE code_hash = ?').get(hashCode(codes[0])).redeemed_at, null, 'nichts verbraucht')
    db.prepare("DELETE FROM vouchers WHERE batch_id IN (SELECT id FROM voucher_batches WHERE label = 'Demo-Probe')").run()
    db.prepare("DELETE FROM voucher_batches WHERE label = 'Demo-Probe'").run()
  })

  const demoLogin = await post('/api/demo')
  const demoCookie = getCookie(demoLogin.res)

  await t.test('POST /api/demo landet weiterhin in "Zuhause am Deich" (der Leitung), nicht bei einem der neuen Haushalte', () => {
    assert.equal(demoLogin.status, 200)
    assert.equal(demoLogin.data.id, household.familyId)
    assert.deepEqual(
      demoLogin.data.memberships.map((m) => [m.id, m.rolle]),
      [[created.familyId, 'leitung']]
    )
  })

  const view = await post('/api/view', { familyId: created.familyId }, demoCookie)
  const rudelCookie = getCookie(view.res)

  await t.test('GET /api/family/members in der Demo: alle vier Rollen, eine Einladung mit Rolle, keine Codes', async () => {
    assert.equal(view.status, 200)
    assert.equal(view.data.role, 'leitung')
    const res = await get(MEMBERS, rudelCookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.ichBin, 'leitung')
    assert.deepEqual(
      res.data.mitglieder.map((m) => [m.name, m.rolle, m.geteilteTiere]),
      [
        ['Zuhause am Deich', 'leitung', 2],
        ['Zuhause Möwenweg (Demo)', 'stellvertretung', 1],
        ['Zuhause Lindenhof (Demo)', 'mitglied', 1],
        ['Zuhause Heidekamp (Demo)', 'gast', 0]
      ]
    )
    assert.equal(res.data.einladungen.length, 1)
    assert.equal(res.data.einladungen[0].rolle, 'gast')
    assert.match(res.data.einladungen[0].hinweis, /^[0-9A-Z]{4}$/)
    assert.equal(res.data.einladungen[0].code, undefined)

    // Die geteilten Tiere der neuen Haushalte samt Kommentar des Gasts sind in der Familie sichtbar
    const dogs = (await get('/api/dogs', rudelCookie)).data
    assert.equal(dogs.find((d) => d.name === 'Wilma')?.shared_from, 'Zuhause Möwenweg (Demo)')
    assert.equal(dogs.find((d) => d.name === 'Pepper')?.shared_from, 'Zuhause Lindenhof (Demo)')
    const entries = (await get('/api/timeline', rudelCookie)).data
    const wilma = entries.find((e) => e.titel === 'Wilma im ersten Schnee')
    assert.ok(wilma, 'Wilmas Eintrag ist in der Familie sichtbar')
    // Der Gast (Heidekamp) und die Leitung "Zuhause am Deich" (die Demo-Besucherin selbst: vonMir) haben kommentiert
    assert.deepEqual(
      wilma.comments.map((c) => [c.autor_name, c.vonMir, c.ehemalig]),
      [
        ['Familie Voss', false, false],
        ['Familie Nissen', true, false]
      ]
    )
    const authors = db
      .prepare('SELECT c.author_family_id FROM entry_comments c JOIN timeline_entries t ON t.id = c.entry_id WHERE t.titel = ? ORDER BY c.created_at')
      .all('Wilma im ersten Schnee')
      .map((row) => row.author_family_id)
    assert.deepEqual(authors, [members.households.find((h) => h.rolle === 'gast').familyId, household.familyId])
  })

  await t.test('die Mitglieder-Seite ist in der Demo nur lesbar: jedes Schreiben 403', async () => {
    const guest = members.households.find((h) => h.rolle === 'gast')
    const attempts = [
      ['Rolle ändern', put(`${MEMBERS}/${guest.familyId}`, { rolle: 'mitglied' }, rudelCookie)],
      ['Mitglied entfernen', del(`${MEMBERS}/${guest.familyId}`, rudelCookie)],
      ['Leitung übergeben', post(`${MEMBERS}/leitung/${guest.familyId}`, undefined, rudelCookie)],
      ['Einladung widerrufen', del(`${MEMBERS}/einladungen/${members.invite.voucherId}`, rudelCookie)],
      ['Einladungs-Rolle', put(`/api/vouchers/${members.invite.voucherId}/rolle`, { rolle: 'mitglied' }, rudelCookie)],
      ['Auflösen', post(`${MEMBERS}/aufloesen`, { bestaetigung: 'Rudel vom Sonnenhang' }, rudelCookie)],
      ['Schlüssel', post(`${MEMBERS}/key`, { currentKey: 'egal' }, rudelCookie)],
      ['Verlassen', del(`/api/memberships/${created.familyId}`, demoCookie)]
    ]
    for (const [label, pending] of attempts) {
      const res = await pending
      assert.equal(res.status, 403, label)
      assert.match(res.data.error, /Demo-Modus/, label)
    }
    assert.equal(rudelMembers().length, 4, 'nichts hat sich geändert')
    assert.equal(db.prepare('SELECT revoked_at FROM vouchers WHERE id = ?').get(members.invite.voucherId).revoked_at, null)
  })

  await t.test('ein zweiter Demo-Wechsel ersetzt alle acht Demo-Familien ohne Waisen; echte Daten bleiben', () => {
    const oldIds = [created.familyId, household.familyId, ...members.households.map((h) => h.familyId)]
    assert.equal(first.removed.length, 0, 'erster Lauf: nichts zu entfernen')

    const second = replaceDemoPack(db, uploadDir)
    assert.equal(second.removed.length, 8, 'Rudel, vier Zuhause, Tierheim, zwei Partner-Bereiche')
    assert.equal(second.members.households.length, 3)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM families WHERE is_demo = 1').get().n, 8)
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM families WHERE id IN (${oldIds.map(() => '?').join(',')})`).get(...oldIds).n, 0)
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM families WHERE name LIKE '% (Demo)'").get().n, 3, 'keine doppelten Demo-Haushalte')
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM family_members WHERE group_family_id = ?").get(second.created.familyId).n, 4)

    const orphans = {
      members: db
        .prepare(
          `SELECT COUNT(*) AS n FROM family_members
           WHERE member_family_id NOT IN (SELECT id FROM families) OR group_family_id NOT IN (SELECT id FROM families)`
        )
        .get().n,
      shares: db
        .prepare('SELECT COUNT(*) AS n FROM dog_shares WHERE family_id NOT IN (SELECT id FROM families) OR dog_id NOT IN (SELECT id FROM dogs)')
        .get().n,
      comments: db
        .prepare(
          `SELECT COUNT(*) AS n FROM entry_comments
           WHERE family_id NOT IN (SELECT id FROM families) OR entry_id NOT IN (SELECT id FROM timeline_entries)
             OR (author_family_id IS NOT NULL AND author_family_id NOT IN (SELECT id FROM families))`
        )
        .get().n,
      invites: db.prepare('SELECT COUNT(*) AS n FROM vouchers WHERE join_family_id IS NOT NULL AND join_family_id NOT IN (SELECT id FROM families)').get().n,
      demoBatches: db.prepare('SELECT COUNT(*) AS n FROM voucher_batches WHERE kind = ?').get(DEMO_BATCH_KIND).n,
      demoVouchers: db.prepare('SELECT COUNT(*) AS n FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id WHERE b.kind = ?').get(DEMO_BATCH_KIND).n
    }
    assert.deepEqual(orphans, { members: 0, shares: 0, comments: 0, invites: 0, demoBatches: 1, demoVouchers: 1 })
    assert.equal(db.prepare('SELECT join_rolle FROM vouchers WHERE id = ?').get(second.members.invite.voucherId).join_rolle, 'gast')

    assert.deepEqual(snapshotReal(), realBefore, 'echte Mitgliedschaft, Freigabe und Einladungen unverändert')
    assert.ok(db.prepare('SELECT 1 FROM dogs WHERE id = ?').get(realDog.id))
  })
})
