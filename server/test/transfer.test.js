const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { dogLabel } = require('../lib/labels')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const ADMIN_TEST_PASSWORD = 'admin-test-transfer-1'
const dataDir = useTempDataDir('transfer', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

test('Übergabe-Gutschein: Tier zieht mit Chronik ins neue Zuhause', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })

  let shelterCounter = 0
  async function createShelter(name) {
    shelterCounter += 1
    const slug = `tierheim-transfer-${shelterCounter}`
    const partner = await post('/api/admin/partners', { name, typ: 'tierheim', plz: '10115', status: 'aktiv', slug }, adminCookie)
    assert.equal(partner.status, 201)
    const shelter = await post(`/api/admin/partners/${partner.data.id}/shelter`, undefined, adminCookie)
    assert.equal(shelter.status, 201)
    const login = await post('/api/login', { secret: shelter.data.key }, null)
    assert.equal(login.status, 200)
    return {
      partnerId: partner.data.id,
      partnerSlug: partner.data.slug,
      familyId: shelter.data.familyId,
      familyName: name,
      cookie: getCookie(login.res)
    }
  }

  const sonnenhang = await createShelter('Tierheim Sonnenhang')

  async function addDog(shelter, name, geschlecht, vermittlungStatus = 'in_vermittlung') {
    const res = await post('/api/dogs', { name, geschlecht, tierart: 'hund', vermittlungStatus }, shelter.cookie)
    assert.equal(res.status, 201)
    return res.data
  }

  await t.test('1. POST /:id/handover: reserviert, Gutschein in Partner-Stapel, nur der Tierheim-Besitzer', async () => {
    const pepper = await addDog(sonnenhang, 'Pepper', 'huendin')

    const notShelter = await createFamily(base, 'Zuhause ohne Tierheim Handover', 'zuhause-no-shelter-1', { art: 'zuhause' })
    const forbidden = await post(`/api/dogs/${pepper.id}/handover`, {}, notShelter.cookie)
    assert.equal(forbidden.status, 404) // loadOwnDog: fremdes Tier gilt als nicht gefunden

    const handover = await post(`/api/dogs/${pepper.id}/handover`, {}, sonnenhang.cookie)
    assert.equal(handover.status, 201)
    assert.match(handover.data.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    assert.equal(handover.data.link, `/v#${handover.data.code.replace(/-/g, '')}`)

    const dogAfter = db.prepare('SELECT vermittlung_status FROM dogs WHERE id = ?').get(pepper.id)
    assert.equal(dogAfter.vermittlung_status, 'reserviert')

    const voucher = db
      .prepare(
        `SELECT v.*, b.kind, b.label FROM vouchers v JOIN voucher_batches b ON b.id = v.batch_id WHERE v.dog_id = ?`
      )
      .get(pepper.id)
    assert.equal(voucher.kind, 'partner')
    assert.equal(voucher.label, 'Übergabe Pepper')
    assert.equal(voucher.partner_id, sonnenhang.partnerId)
    assert.equal(voucher.issued_by_family_id, sonnenhang.familyId)
    assert.equal(voucher.redeemed_at, null)
    assert.equal(voucher.revoked_at, null)

    // Ein normales Zuhause (nicht Tierheim) darf keine Übergabe-Gutscheine erzeugen, auch nicht für
    // ein eigenes Tier
    const wrongArea = await createFamily(base, 'Zuhause wrong area', 'zuhause-wrong-area-1', { art: 'zuhause' })
    const ownDogForWrongArea = await post('/api/dogs', { name: 'Bello2', geschlecht: 'ruede' }, wrongArea.cookie)
    const wrongAreaHandover = await post(`/api/dogs/${ownDogForWrongArea.data.id}/handover`, {}, wrongArea.cookie)
    assert.equal(wrongAreaHandover.status, 400)
  })

  await t.test('2. Höchstens ein offener Übergabe-Gutschein pro Tier: ein neuer zieht den alten zurück', async () => {
    const oskar = await addDog(sonnenhang, 'Oskar', 'ruede')

    const first = await post(`/api/dogs/${oskar.id}/handover`, {}, sonnenhang.cookie)
    assert.equal(first.status, 201)
    const firstHash = require('../lib/codes').hashCode(require('../lib/codes').normalizeCode(first.data.code))

    const second = await post(`/api/dogs/${oskar.id}/handover`, {}, sonnenhang.cookie)
    assert.equal(second.status, 201)
    assert.notEqual(second.data.code, first.data.code)

    const firstVoucher = db.prepare('SELECT revoked_at, code_cipher FROM vouchers WHERE code_hash = ?').get(firstHash)
    assert.ok(firstVoucher.revoked_at, 'der erste Gutschein wurde zurückgezogen')
    assert.equal(firstVoucher.code_cipher, null)

    const openCount = db
      .prepare('SELECT COUNT(*) AS c FROM vouchers WHERE dog_id = ? AND redeemed_at IS NULL AND revoked_at IS NULL')
      .get(oskar.id).c
    assert.equal(openCount, 1)
  })

  await t.test('3. POST /vouchers/check zeigt handover-Hinweis für offene Übergabe-Gutscheine', async () => {
    const momo = await addDog(sonnenhang, 'Momo', 'ruede', 'in_vermittlung')
    const handover = await post(`/api/dogs/${momo.id}/handover`, {}, sonnenhang.cookie)

    const checked = await post('/api/vouchers/check', { code: handover.data.code })
    assert.equal(checked.status, 200)
    assert.equal(checked.data.status, 'offen')
    assert.deepEqual(checked.data.handover, { animalName: 'Momo', shelterName: sonnenhang.familyName })

    // ein normaler (nicht-Übergabe) Gutschein liefert kein handover-Feld
    const { createBatch } = require('../lib/vouchers')
    const { codes } = createBatch(db, { label: 'Normal', kind: 'admin', size: 1 })
    const plainChecked = await post('/api/vouchers/check', { code: codes[0] })
    assert.equal(plainChecked.data.handover, undefined)
  })

  await t.test('4. Einlösen (redeem): Tier zieht mit ganzer Chronik um, Herkunft sichtbar, Eltern-Verweise zu Freitext', async () => {
    const mutterBleibt = await addDog(sonnenhang, 'Mutter Bleibt', 'huendin', null)
    const susi = await addDog(sonnenhang, 'Susi', 'huendin')
    await put(`/api/dogs/${susi.id}`, { motherDogId: mutterBleibt.id }, sonnenhang.cookie)
    const welpe = await addDog(sonnenhang, 'Welpe', 'ruede')
    await put(`/api/dogs/${welpe.id}`, { motherDogId: susi.id }, sonnenhang.cookie)
    await post(`/api/dogs/${susi.id}/housemates`, { otherDogId: mutterBleibt.id }, sonnenhang.cookie)

    const publicEntry = await post(
      '/api/timeline',
      { dogId: susi.id, autorName: 'Team', datum: '2026-01-05', titel: 'Ankunft im Tierheim', kategorie: 'ankunft', isPublic: true },
      sonnenhang.cookie
    )
    assert.equal(publicEntry.status, 201)
    const privateEntry = await post(
      '/api/timeline',
      { dogId: susi.id, autorName: 'Team', datum: '2026-01-06', titel: 'Verhaltensnotiz', privat: true },
      sonnenhang.cookie
    )
    assert.equal(privateEntry.status, 201)

    const handover = await post(`/api/dogs/${susi.id}/handover`, {}, sonnenhang.cookie)
    assert.equal(handover.status, 201)

    const redeemed = await post('/api/vouchers/redeem', { code: handover.data.code, name: 'Zuhause am Deich Susi' })
    assert.equal(redeemed.status, 201)
    assert.equal(redeemed.data.art, 'zuhause')
    const newHomeCookie = getCookie(redeemed.res)
    const newHomeId = redeemed.data.id

    const detail = await get(`/api/dogs/${susi.id}`, newHomeCookie)
    assert.equal(detail.status, 200)
    assert.equal(detail.data.family_id, newHomeId)
    assert.equal(detail.data.herkunft_art, 'tierheim')
    assert.equal(detail.data.herkunft_text, sonnenhang.familyName)
    assert.equal(detail.data.vermittlung_status, 'vermittelt')
    assert.equal(detail.data.public_slug, null)
    assert.equal(detail.data.bei_uns_seit, new Date().toISOString().slice(0, 10))
    // Eigener Mutter-Verweis wurde zu Freitext
    assert.equal(detail.data.mother_dog_id, null)
    assert.equal(detail.data.mother_freitext, dogLabel({ name: 'Mutter Bleibt', name_unbekannt: 0 }))

    // Chronik zog komplett mit, inklusive des privaten Eintrags (Besitzer sieht alles)
    const timeline = await get(`/api/timeline?dogId=${susi.id}`, newHomeCookie)
    const titles = timeline.data.map((e) => e.titel).sort()
    assert.deepEqual(titles, ['Ankunft im Tierheim', 'Verhaltensnotiz'])
    for (const entry of timeline.data) {
      assert.equal(entry.family_id, newHomeId)
      assert.equal(entry.is_public, 0)
      assert.equal(entry.herkunft_family_id, sonnenhang.familyId)
    }

    // dog_links wurden entfernt
    const linksRow = db
      .prepare('SELECT COUNT(*) AS c FROM dog_links WHERE dog_a_id = ? OR dog_b_id = ?')
      .get(susi.id, susi.id).c
    assert.equal(linksRow, 0)

    // Verweis eines anderen Tieres AUF susi (als Mutter) wurde zu Freitext
    const welpeAfter = db.prepare('SELECT mother_dog_id, mother_freitext FROM dogs WHERE id = ?').get(welpe.id)
    assert.equal(welpeAfter.mother_dog_id, null)
    assert.equal(welpeAfter.mother_freitext, 'Susi')

    // dog_transfers-Eintrag vorhanden
    const transferRow = db.prepare('SELECT * FROM dog_transfers WHERE dog_id = ?').get(susi.id)
    assert.ok(transferRow)
    assert.equal(transferRow.from_family_id, sonnenhang.familyId)
    assert.equal(transferRow.to_family_id, newHomeId)

    // Das Tierheim sieht Susi nicht mehr (keine Freigabe)
    const shelterDogs = await get('/api/dogs', sonnenhang.cookie)
    assert.equal(shelterDogs.data.some((d) => d.id === susi.id), false)
    const shelterDetail = await get(`/api/dogs/${susi.id}`, sonnenhang.cookie)
    assert.equal(shelterDetail.status, 404)
  })

  await t.test('5. breeding_events: als Vater referenziert -> Freitext, als Mutter referenziert -> Zeile gelöscht', async () => {
    const bello = await addDog(sonnenhang, 'Bello', 'ruede')
    const mutterFuerBello = await addDog(sonnenhang, 'Mutter für Bello', 'huendin', null)
    const eventBello = await post(
      '/api/breeding',
      { mutterDogId: mutterFuerBello.id, vaterDogId: bello.id, datum: '2026-01-01' },
      sonnenhang.cookie
    )
    assert.equal(eventBello.status, 201)

    const pepperFuerWurf = await addDog(sonnenhang, 'Pepper Wurf', 'huendin')
    const vaterFuerPepper = await addDog(sonnenhang, 'Vater für Pepper', 'ruede')
    const eventPepper = await post(
      '/api/breeding',
      { mutterDogId: pepperFuerWurf.id, vaterDogId: vaterFuerPepper.id, datum: '2026-01-02' },
      sonnenhang.cookie
    )
    assert.equal(eventPepper.status, 201)

    // Bello (Vater) wandert um
    const handoverBello = await post(`/api/dogs/${bello.id}/handover`, {}, sonnenhang.cookie)
    await post('/api/vouchers/redeem', { code: handoverBello.data.code, name: 'Zuhause Bello' })

    const eventBelloAfter = db.prepare('SELECT vater_dog_id, vater_freitext, mutter_dog_id FROM breeding_events WHERE id = ?').get(
      eventBello.data.id
    )
    assert.equal(eventBelloAfter.vater_dog_id, null)
    assert.equal(eventBelloAfter.vater_freitext, 'Bello')
    assert.equal(eventBelloAfter.mutter_dog_id, mutterFuerBello.id)

    // Pepper Wurf (Mutter) wandert um - der Wurf-Eintrag lässt sich nicht auf Freitext umstellen
    // (mutter_dog_id ist NOT NULL ohne Freitext-Spalte) und wird deshalb gelöscht
    const handoverPepper = await post(`/api/dogs/${pepperFuerWurf.id}/handover`, {}, sonnenhang.cookie)
    await post('/api/vouchers/redeem', { code: handoverPepper.data.code, name: 'Zuhause Pepper Wurf' })

    const eventPepperAfter = db.prepare('SELECT * FROM breeding_events WHERE id = ?').get(eventPepper.data.id)
    assert.equal(eventPepperAfter, undefined)
  })

  await t.test('6. shelterMayRead: Tierheim darf mitlesen (nicht-privat), Einwilligung widerrufen/erteilen', async () => {
    const sunny = await addDog(sonnenhang, 'Sunny', 'huendin', 'in_vermittlung')
    const publicEntry = await post(
      '/api/timeline',
      { dogId: sunny.id, autorName: 'Team', datum: '2026-01-10', titel: 'Öffentliche Notiz', isPublic: true, kategorie: 'sonstiges' },
      sonnenhang.cookie
    )
    const privateEntry = await post(
      '/api/timeline',
      { dogId: sunny.id, autorName: 'Team', datum: '2026-01-11', titel: 'Private Notiz', privat: true },
      sonnenhang.cookie
    )
    assert.equal(publicEntry.status, 201)
    assert.equal(privateEntry.status, 201)

    const handover = await post(`/api/dogs/${sunny.id}/handover`, {}, sonnenhang.cookie)
    const redeemed = await post('/api/vouchers/redeem', {
      code: handover.data.code,
      name: 'Zuhause am Deich Sunny',
      shelterMayRead: true
    })
    assert.equal(redeemed.status, 201)
    const newHomeCookie = getCookie(redeemed.res)

    const shelterDogs = await get('/api/dogs', sonnenhang.cookie)
    const listed = shelterDogs.data.find((d) => d.id === sunny.id)
    assert.ok(listed, 'Tierheim sieht Sunny lesend')
    assert.equal(listed.can_edit, 0)
    assert.equal(listed.shared_from, 'Zuhause am Deich Sunny')

    const shelterTimeline = await get(`/api/timeline?dogId=${sunny.id}`, sonnenhang.cookie)
    const shelterTitles = shelterTimeline.data.map((e) => e.titel)
    assert.ok(shelterTitles.includes('Öffentliche Notiz'))
    assert.ok(!shelterTitles.includes('Private Notiz'))

    const shareRow = db.prepare('SELECT story_consent FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(sunny.id, sonnenhang.familyId)
    assert.equal(shareRow.story_consent, 0)

    const detailWithShare = await get(`/api/dogs/${sunny.id}`, newHomeCookie)
    assert.deepEqual(detailWithShare.data.shelterShare, {
      shelterName: sonnenhang.familyName,
      enabled: true,
      storyConsent: false
    })

    // Fremde dürfen die Einwilligung nicht verwalten
    const stranger = await createFamily(base, 'Fremdes Zuhause Sunny', 'fremd-sunny-1', { art: 'zuhause' })
    const strangerAttempt = await put(`/api/dogs/${sunny.id}/shelter-share`, { enabled: false }, stranger.cookie)
    assert.equal(strangerAttempt.status, 404)

    // Widerrufen: Tierheim sieht Sunny danach nicht mehr (shelterShare bleibt sichtbar, nur enabled=false -
    // die Herkunft aus dem Tierheim bleibt ja bestehen, nur die Mitlese-Freigabe ist weg)
    const revoke = await put(`/api/dogs/${sunny.id}/shelter-share`, { enabled: false }, newHomeCookie)
    assert.equal(revoke.status, 200)
    assert.deepEqual(revoke.data, { shelterName: sonnenhang.familyName, enabled: false, storyConsent: false })
    const shelterDogsAfterRevoke = await get('/api/dogs', sonnenhang.cookie)
    assert.equal(shelterDogsAfterRevoke.data.some((d) => d.id === sunny.id), false)
    assert.equal(
      db.prepare('SELECT COUNT(*) AS c FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(sunny.id, sonnenhang.familyId).c,
      0
    )

    // Erneut erteilen, diesmal mit Happy-End-Einwilligung
    const grant = await put(`/api/dogs/${sunny.id}/shelter-share`, { enabled: true, storyConsent: true }, newHomeCookie)
    assert.equal(grant.status, 200)
    assert.deepEqual(grant.data, { shelterName: sonnenhang.familyName, enabled: true, storyConsent: true })

    // Ein Tier ohne Tierheim-Herkunft kennt kein shelterShare (null) und lässt sich nicht verwalten
    const plainHome = await createFamily(base, 'Zuhause ohne Herkunft', 'ohne-herkunft-1', { art: 'zuhause' })
    const plainDog = await post('/api/dogs', { name: 'Fiffi', geschlecht: 'ruede' }, plainHome.cookie)
    const plainDetail = await get(`/api/dogs/${plainDog.data.id}`, plainHome.cookie)
    assert.equal(plainDetail.data.shelterShare, null)
    const plainAttempt = await put(`/api/dogs/${plainDog.data.id}/shelter-share`, { enabled: true }, plainHome.cookie)
    assert.equal(plainAttempt.status, 400)
  })

  await t.test('7. claim: eingeloggtes Zuhause übernimmt per Code, ohne neues Zuhause anzulegen', async () => {
    const existingHome = await createFamily(base, 'Zuhause am Deich Claim', 'zuhause-claim-1', { art: 'zuhause' })

    const oskar = await addDog(sonnenhang, 'Oskar Claim', 'ruede')
    const handover = await post(`/api/dogs/${oskar.id}/handover`, {}, sonnenhang.cookie)

    const claimed = await post('/api/vouchers/claim', { code: handover.data.code, shelterMayRead: false }, existingHome.cookie)
    assert.equal(claimed.status, 200)
    assert.equal(claimed.data.dogId, oskar.id)

    const detail = await get(`/api/dogs/${oskar.id}`, existingHome.cookie)
    assert.equal(detail.status, 200)
    assert.equal(detail.data.family_id, existingHome.data.id)
    assert.equal(detail.data.vermittlung_status, 'vermittelt')

    // ein zweites Einlösen desselben Codes -> 410
    const secondClaim = await post('/api/vouchers/claim', { code: handover.data.code }, existingHome.cookie)
    assert.equal(secondClaim.status, 410)

    // ein normaler (nicht-Übergabe) Gutschein -> 400 mit dem Hinweis, sich abzumelden
    const { createBatch } = require('../lib/vouchers')
    const { codes } = createBatch(db, { label: 'Normal für Claim', kind: 'admin', size: 1 })
    const wrongKind = await post('/api/vouchers/claim', { code: codes[0] }, existingHome.cookie)
    assert.equal(wrongKind.status, 400)
    assert.match(wrongKind.data.error, /kein Übergabe-Gutschein/)

    // claim aus einem beigetretenen Rudel heraus (aktiver Bereich != eigene Identität) -> 400
    const rudel = await createFamily(base, 'Rudel für Claim', 'rudel-claim-pw-1')
    await post('/api/families/join', { password: 'rudel-claim-pw-1' }, existingHome.cookie)
    const view = await post('/api/view', { familyId: rudel.data.id }, existingHome.cookie)
    const viewedCookie = getCookie(view.res)
    const momo2 = await addDog(sonnenhang, 'Momo Claim', 'ruede')
    const handoverMomo = await post(`/api/dogs/${momo2.id}/handover`, {}, sonnenhang.cookie)
    const fromRudel = await post('/api/vouchers/claim', { code: handoverMomo.data.code }, viewedCookie)
    assert.equal(fromRudel.status, 400)

    // claim aus einem Tierheim-Bereich heraus -> 400
    const fromShelter = await post('/api/vouchers/claim', { code: handoverMomo.data.code }, sonnenhang.cookie)
    assert.equal(fromShelter.status, 400)

    // claim ohne Sitzung -> 401
    const anonymous = await post('/api/vouchers/claim', { code: handoverMomo.data.code }, null)
    assert.equal(anonymous.status, 401)
  })

  await t.test('8. Folgeänderung: PUT /api/dogs löscht public_slug, wenn vermittlung_status "vermittelt" wird', async () => {
    const luna = await addDog(sonnenhang, 'Luna', 'huendin')
    const published = await put(`/api/dogs/${luna.id}/steckbrief`, { published: true }, sonnenhang.cookie)
    assert.equal(published.status, 200)
    const slug = published.data.public_slug
    assert.ok(slug)

    const stillPublic = await get(`/api/public/animals/${slug}`)
    assert.equal(stillPublic.status, 200)

    const updated = await put(`/api/dogs/${luna.id}`, { vermittlungStatus: 'vermittelt' }, sonnenhang.cookie)
    assert.equal(updated.status, 200)
    assert.equal(updated.data.public_slug, null)

    const goneNow = await get(`/api/public/animals/${slug}`)
    assert.equal(goneNow.status, 404)
  })

  await t.test('9. Folgeänderung: /public-media verlangt zusätzlich vermittlung_status in_vermittlung/reserviert', async () => {
    const form = new FormData()
    form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
    const uploadRes = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: sonnenhang.cookie }, body: form })
    const fotoUrl = (await uploadRes.json()).url
    const filename = fotoUrl.split('/').pop()

    const wilma = await addDog(sonnenhang, 'Wilma', 'huendin')
    await put(`/api/dogs/${wilma.id}`, { fotoUrl }, sonnenhang.cookie)
    const published = await put(`/api/dogs/${wilma.id}/steckbrief`, { published: true }, sonnenhang.cookie)
    assert.equal(published.status, 200)

    const whilePublishable = await fetch(`${base}/public-media/${filename}`)
    assert.equal(whilePublishable.status, 200)

    // Status direkt in der DB auf "vermittelt" setzen, public_slug aber (anders als über PUT /api/dogs)
    // absichtlich stehen lassen - Verteidigungslinie: /public-media muss trotzdem 404 liefern.
    db.prepare("UPDATE dogs SET vermittlung_status = 'vermittelt' WHERE id = ?").run(wilma.id)
    const stillHasSlug = db.prepare('SELECT public_slug FROM dogs WHERE id = ?').get(wilma.id)
    assert.ok(stillHasSlug.public_slug)

    const afterStatusChange = await fetch(`${base}/public-media/${filename}`)
    assert.equal(afterStatusChange.status, 404)
  })
})
