const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold } = require('./helpers')

const dataDir = useTempDataDir('families')

test('deleting a family keeps other families intact', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { deleteFamily, removeUploads } = require('../lib/families')
  const { uploadDir } = require('../config')

  const a = await createFamily(base, 'Rudel A', 'passwortA')
  const b = await createFamily(base, 'Rudel B', 'passwortB')
  const post = (cookie, urlPath, body) => call(base, urlPath, { method: 'POST', cookie, body })

  // Die Foto-URLs sind frei erfunden (keine echten Uploads) und dienen nur der Foto-Aufräum-Logik
  // von deleteFamily/photoUrlsOf - seit Task 3 prüft die API selbst, ob eine fotoUrl gerade sichtbar
  // ist (canAttachUpload), darum werden sie hier direkt in der DB gesetzt statt über die API gesendet.
  const mother = (await post(a.cookie, '/api/dogs', { name: 'Bella', geschlecht: 'huendin' })).data
  db.prepare('UPDATE dogs SET foto_url = ? WHERE id = ?').run('/uploads/a1.jpg', mother.id)
  const motherEntry = (
    await post(a.cookie, '/api/timeline', { dogId: mother.id, autorName: 'A', datum: '2020-01-01', titel: 'X' })
  ).data
  db.prepare('UPDATE timeline_entries SET foto_urls = ? WHERE id = ?').run(JSON.stringify(['/uploads/a2.jpg']), motherEntry.id)
  // Rudelübergreifende Verknüpfungen sind über die API nicht mehr möglich – hier Altdaten simulieren
  const child = (await post(b.cookie, '/api/dogs', { name: 'Cora', geschlecht: 'huendin' })).data
  db.prepare('UPDATE dogs SET foto_url = ?, mother_dog_id = ? WHERE id = ?').run('/uploads/b1.jpg', mother.id, child.id)

  const orphaned = deleteFamily(db, a.data.id)

  await t.test('removes the family, its dogs and entries', () => {
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(a.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dogs WHERE family_id = ?').get(a.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM timeline_entries WHERE family_id = ?').get(a.data.id).c, 0)
  })

  await t.test('turns links from other families into freitext', () => {
    const cora = db.prepare('SELECT * FROM dogs WHERE id = ?').get(child.id)
    assert.equal(cora.mother_dog_id, null)
    assert.equal(cora.mother_freitext, 'Bella')
  })

  await t.test('reports only photos nobody uses anymore', () => {
    assert.deepEqual(orphaned.sort(), ['/uploads/a1.jpg', '/uploads/a2.jpg'])
  })

  await t.test('the other family still logs in', async () => {
    const login = await call(base, '/api/login', { method: 'POST', body: { password: 'passwortB' } })
    assert.equal(login.status, 200)
  })

  await t.test('deleting a rudel someone joined removes the membership, the member stays', async () => {
    const home = await createFamily(base, 'Zuhause Nele', 'zuhause-pw-del1', { art: 'zuhause' })
    const rudel = await createFamily(base, 'Familie Talblick', 'rudel-pw-del1')
    await post(home.cookie, '/api/families/join', { password: 'rudel-pw-del1' })
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_members WHERE group_family_id = ?').get(rudel.data.id).c, 1)

    deleteFamily(db, rudel.data.id)

    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(rudel.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_members WHERE group_family_id = ?').get(rudel.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(home.data.id).c, 1)
  })

  await t.test('deleting a zuhause that joined a rudel removes the membership, the rudel stays', async () => {
    const home = await createFamily(base, 'Zuhause Mira', 'zuhause-pw-del2', { art: 'zuhause' })
    const rudel = await createFamily(base, 'Familie Nordlicht', 'rudel-pw-del2')
    await post(home.cookie, '/api/families/join', { password: 'rudel-pw-del2' })
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_members WHERE member_family_id = ?').get(home.data.id).c, 1)

    deleteFamily(db, home.data.id)

    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(home.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_members WHERE member_family_id = ?').get(home.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(rudel.data.id).c, 1)
  })

  await t.test('deleteFamily: eigene unbenutzte Uploads verschwinden von der Platte, fremde bleiben', async () => {
    const uploadPng = async (cookie) => {
      const form = new FormData()
      form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'x.png')
      const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
      return (await res.json()).url
    }

    const x = await createFamily(base, 'Rudel X', 'passwortX1')
    const y = await createFamily(base, 'Rudel Y', 'passwortY1')

    // Beide Uploads bleiben unbenutzt (nie an einem Hund/Eintrag/Wurf) - stehen also nur in "uploads"
    const xUnusedUrl = await uploadPng(x.cookie)
    const yUnusedUrl = await uploadPng(y.cookie)
    const xPath = path.join(uploadDir, path.basename(xUnusedUrl))
    const yPath = path.join(uploadDir, path.basename(yUnusedUrl))
    assert.equal(fs.existsSync(xPath), true)
    assert.equal(fs.existsSync(yPath), true)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM uploads WHERE family_id = ?').get(x.data.id).c, 1)

    // FK-sicher: uploads-Zeilen der gelöschten Familie stehen der families-Löschung nicht im Weg
    const orphaned = deleteFamily(db, x.data.id)
    removeUploads(uploadDir, orphaned)

    assert.equal(orphaned.includes(xUnusedUrl), true, 'die eigene unbenutzte Datei gilt als verwaist')
    assert.equal(fs.existsSync(xPath), false, 'eigene unbenutzte Datei wird von der Platte entfernt')
    assert.equal(fs.existsSync(yPath), true, 'fremde, von Y hochgeladene Datei bleibt erhalten')
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM uploads WHERE family_id = ?').get(x.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM uploads WHERE family_id = ?').get(y.data.id).c, 1)
  })

  // Sicherheits-Nachbesserung (I1): deleteFamily verletzte vorher die Fremdschlüsselprüfung, sobald die
  // Familie Benutzer hatte oder von Gutscheinen referenziert wurde (issued_by/join/redeemed_by) - siehe
  // lib/families.js. Die folgenden vier Fälle decken genau das ab.

  await t.test('deleteFamily: ein per Gutschein eingelöstes Zuhause lässt sich löschen, der Gutschein bleibt (ohne Verweis)', async () => {
    const household = await createHousehold(base, 'Zuhause Nordwind')
    const voucherBefore = db.prepare('SELECT id FROM vouchers WHERE redeemed_by_family_id = ?').get(household.data.id)
    assert.ok(voucherBefore, 'der Gutschein zeigt vor dem Löschen auf das Zuhause')

    deleteFamily(db, household.data.id)

    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(household.data.id).c, 0)
    const voucherAfter = db.prepare('SELECT redeemed_by_family_id FROM vouchers WHERE id = ?').get(voucherBefore.id)
    assert.equal(voucherAfter.redeemed_by_family_id, null, 'die Referenz ist weg, die Zeile bleibt (Statistik)')
  })

  await t.test('deleteFamily: ein Zuhause mit eigenem Benutzer lässt sich löschen', async () => {
    const household = await createHousehold(base, 'Zuhause Talwind', { username: 'nutzer-del1', password: 'geheim1234' })
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM users WHERE family_id = ?').get(household.data.id).c, 1)

    deleteFamily(db, household.data.id)

    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(household.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM users WHERE family_id = ?').get(household.data.id).c, 0)
  })

  await t.test('deleteFamily: ein Rudel, das selbst Gutscheine ausgegeben hat (offen + eingelöst) und Beitrittsziel ist', async () => {
    const { createBatch } = require('../lib/vouchers')
    const rudel = await createFamily(base, 'Familie Weitergabe', 'weitergabe-pw1')

    const open = createBatch(db, {
      label: 'Offen',
      kind: 'rudel',
      size: 1,
      issuedByFamilyId: rudel.data.id,
      joinFamilyId: rudel.data.id
    })
    const redeemed = createBatch(db, { label: 'Eingelöst', kind: 'rudel', size: 1, issuedByFamilyId: rudel.data.id })
    const redeemRes = await call(base, '/api/vouchers/redeem', {
      method: 'POST',
      body: { code: redeemed.codes[0], name: 'Zuhause Weitergabe' }
    })
    assert.equal(redeemRes.status, 201)

    deleteFamily(db, rudel.data.id)

    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(rudel.data.id).c, 0)
    assert.equal(
      db.prepare('SELECT COUNT(*) AS c FROM vouchers WHERE batch_id = ?').get(open.batchId).c,
      0,
      'der offene, selbst ausgegebene Gutschein wird gelöscht'
    )
    const redeemedRow = db.prepare('SELECT issued_by_family_id FROM vouchers WHERE batch_id = ?').get(redeemed.batchId)
    assert.equal(redeemedRow.issued_by_family_id, null, 'der eingelöste Gutschein bleibt, aber ohne Verweis auf das gelöschte Rudel')

    // M3: der jetzt leere Stapel (nur der gelöschte offene Gutschein war drin) verschwindet mit; der
    // Stapel mit dem weiterhin existierenden eingelösten Gutschein bleibt bestehen.
    assert.equal(
      db.prepare('SELECT COUNT(*) AS c FROM voucher_batches WHERE id = ?').get(open.batchId).c,
      0,
      'ein leer zurückbleibender Stapel wird mitgelöscht'
    )
    assert.equal(
      db.prepare('SELECT COUNT(*) AS c FROM voucher_batches WHERE id = ?').get(redeemed.batchId).c,
      1,
      'ein Stapel mit noch vorhandenen Gutscheinen bleibt bestehen'
    )
  })

  await t.test('deleteFamily: eine Demo-Familie, die das join_family_id eines Admin-Gutscheins ist (replaceDemoPack-Fall)', async () => {
    const { createBatch } = require('../lib/vouchers')
    const demo = await createFamily(base, 'Familie Demo Gutschein', 'demo-pw-voucher1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    const adminBatch = createBatch(db, { label: 'Admin-Ziel-Demo', kind: 'admin', size: 1, joinFamilyId: demo.data.id })

    // Ohne die I1-Nachbesserung würfe das hier SQLITE_CONSTRAINT_FOREIGNKEY - genau der Fall, der bei
    // jedem replaceDemoPack()-Lauf auftritt, sobald ein Admin-Gutschein die alte Demo als Beitrittsziel hat.
    deleteFamily(db, demo.data.id)

    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(demo.data.id).c, 0)
    const voucherAfter = db.prepare('SELECT join_family_id FROM vouchers WHERE batch_id = ?').get(adminBatch.batchId)
    assert.equal(voucherAfter.join_family_id, null)
  })
})
