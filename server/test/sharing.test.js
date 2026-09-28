const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// Viele Login/Join-Aufrufe: Standard-Rate-Limit grosszügiger setzen (wie context.test.js)
const dataDir = useTempDataDir('sharing', { LOGIN_RATE_LIMIT: '200' })

test('Tiere aus "Meine Chronik" in Rudel teilen', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })

  const R = await createFamily(base, 'Familie Sonnenhang', 'pR-pass1')
  const Z = await createFamily(base, 'Zuhause am Deich', 'zuhause-pass1', { art: 'zuhause' })
  const joinR = await post('/api/families/join', { password: 'pR-pass1' }, Z.cookie)
  assert.equal(joinR.status, 200)

  const nele = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin' }, Z.cookie)).data
  const publicEntry = (
    await post('/api/timeline', { dogId: nele.id, autorName: 'Anna', datum: '2026-01-10', titel: 'Ausflug' }, Z.cookie)
  ).data
  const privateEntry = (
    await post(
      '/api/timeline',
      { dogId: nele.id, autorName: 'Anna', datum: '2026-01-11', titel: 'Tierarzt', privat: true },
      Z.cookie
    )
  ).data
  assert.equal(privateEntry.privat, 1)
  assert.equal(publicEntry.privat, 0)

  const emma = (await post('/api/dogs', { name: 'Emma', geschlecht: 'huendin' }, R.cookie)).data
  void emma

  await t.test('1. ohne Teilen: Nele in R weder gelistet noch erreichbar', async () => {
    const dogsList = await call(base, '/api/dogs', { cookie: R.cookie })
    assert.equal(dogsList.data.some((d) => d.id === nele.id), false)

    const allList = await call(base, '/api/dogs/all', { cookie: R.cookie })
    assert.equal(allList.data.some((d) => d.id === nele.id), false)

    const detail = await call(base, `/api/dogs/${nele.id}`, { cookie: R.cookie })
    assert.equal(detail.status, 404)

    const tl = await call(base, `/api/timeline?dogId=${nele.id}`, { cookie: R.cookie })
    assert.deepEqual(tl.data, [])

    const recent = await call(base, '/api/timeline/recent', { cookie: R.cookie })
    assert.equal(recent.data.some((e) => e.id === publicEntry.id), false)
  })

  await t.test('2. Teilen: R sieht Nele lesend, nur den öffentlichen Eintrag, Schreiben bleibt bei Z', async () => {
    const share = await put(`/api/dogs/${nele.id}/shares`, { familyIds: [R.data.id] }, Z.cookie)
    assert.equal(share.status, 200)
    assert.deepEqual(share.data.shares, [R.data.id])

    const dogsList = await call(base, '/api/dogs', { cookie: R.cookie })
    const listed = dogsList.data.find((d) => d.id === nele.id)
    assert.ok(listed, 'Nele erscheint in der Liste von R')
    assert.equal(listed.can_edit, 0)
    assert.equal(listed.shared_from, 'Zuhause am Deich')

    const allList = await call(base, '/api/dogs/all', { cookie: R.cookie })
    const listedAll = allList.data.find((d) => d.id === nele.id)
    assert.ok(listedAll)
    assert.equal(listedAll.can_edit, 0)
    assert.equal(listedAll.shared_from, 'Zuhause am Deich')

    const detail = await call(base, `/api/dogs/${nele.id}`, { cookie: R.cookie })
    assert.equal(detail.status, 200)
    assert.equal(detail.data.canEdit, false)
    assert.equal(detail.data.isOwn, false)
    assert.equal(detail.data.ownerFamilyId, Z.data.id)
    assert.deepEqual(detail.data.shares, [])

    const tl = await call(base, `/api/timeline?dogId=${nele.id}`, { cookie: R.cookie })
    assert.deepEqual(tl.data.map((e) => e.id), [publicEntry.id])

    const recentIds = (await call(base, '/api/timeline/recent', { cookie: R.cookie })).data.map((e) => e.id)
    assert.equal(recentIds.includes(publicEntry.id), true)
    assert.equal(recentIds.includes(privateEntry.id), false)

    const writeAttempt = await put(`/api/dogs/${nele.id}`, { name: 'Umbenannt' }, R.cookie)
    assert.equal(writeAttempt.status, 404)

    const postEntry = await post(
      '/api/timeline',
      { dogId: nele.id, autorName: 'Fremd', datum: '2026-02-01', titel: 'x' },
      R.cookie
    )
    assert.equal(postEntry.status, 403)
  })

  await t.test('3. Bereichswechsel per /view zeigt denselben Blick wie R, zurück in Z beides mit canEdit true', async () => {
    const view = await post('/api/view', { familyId: R.data.id }, Z.cookie)
    assert.equal(view.status, 200)
    const viewedCookie = getCookie(view.res)

    const detailInR = await call(base, `/api/dogs/${nele.id}`, { cookie: viewedCookie })
    assert.equal(detailInR.data.canEdit, false)

    const backView = await post('/api/view', { familyId: Z.data.id }, viewedCookie)
    assert.equal(backView.status, 200)
    const backCookie = getCookie(backView.res)

    const detailInZ = await call(base, `/api/dogs/${nele.id}`, { cookie: backCookie })
    assert.equal(detailInZ.data.canEdit, true)

    const tlInZ = await call(base, `/api/timeline?dogId=${nele.id}`, { cookie: backCookie })
    assert.deepEqual(
      tlInZ.data.map((e) => e.id).sort((a, b) => a - b),
      [publicEntry.id, privateEntry.id].sort((a, b) => a - b)
    )
  })

  await t.test('4. Kommentare: R kommentiert, Z moderiert, fremde Familie darf nicht', async () => {
    const comment = await post(`/api/timeline/${publicEntry.id}/comments`, { autorName: 'Nachbar', text: 'Süß!' }, R.cookie)
    assert.equal(comment.status, 201)

    const tlInZ = await call(base, `/api/timeline?dogId=${nele.id}`, { cookie: Z.cookie })
    const entryInZ = tlInZ.data.find((e) => e.id === publicEntry.id)
    assert.equal(entryInZ.comments.some((c) => c.text === 'Süß!'), true)

    const tlInR = await call(base, `/api/timeline?dogId=${nele.id}`, { cookie: R.cookie })
    const entryInR = tlInR.data.find((e) => e.id === publicEntry.id)
    const commentId = entryInR.comments.find((c) => c.text === 'Süß!').id

    const delByOwner = await call(base, `/api/timeline/${publicEntry.id}/comments/${commentId}`, {
      method: 'DELETE',
      cookie: Z.cookie
    })
    assert.equal(delByOwner.status, 204)

    const second = await post(`/api/timeline/${publicEntry.id}/comments`, { autorName: 'Nachbar', text: 'Nochmal' }, R.cookie)
    const delByAuthor = await call(base, `/api/timeline/${publicEntry.id}/comments/${second.data.id}`, {
      method: 'DELETE',
      cookie: R.cookie
    })
    assert.equal(delByAuthor.status, 204)

    const outsider = await createFamily(base, 'Familie Fremdklang', 'fremd-pass1')
    const outsiderComment = await post(
      `/api/timeline/${publicEntry.id}/comments`,
      { autorName: 'X', text: 'Hallo' },
      outsider.cookie
    )
    assert.equal(outsiderComment.status, 404)
  })

  await t.test('5. Teilen: Validierung', async () => {
    const outsider = await createFamily(base, 'Familie Fernweh', 'fremd-pass2')
    const notMember = await put(`/api/dogs/${nele.id}/shares`, { familyIds: [outsider.data.id] }, Z.cookie)
    assert.equal(notMember.status, 400)

    // aktiver Bereich ist R (ein Rudel) -> Teilen ist gesperrt, auch für ein eigenes Tier von R
    const fromRudel = await put(`/api/dogs/${emma.id}/shares`, { familyIds: [] }, R.cookie)
    assert.equal(fromRudel.status, 400)

    const badBody1 = await put(`/api/dogs/${nele.id}/shares`, { familyIds: 'not-array' }, Z.cookie)
    assert.equal(badBody1.status, 400)
    const badBody2 = await put(`/api/dogs/${nele.id}/shares`, { familyIds: [-1] }, Z.cookie)
    assert.equal(badBody2.status, 400)
    const badBody3 = await put(`/api/dogs/${nele.id}/shares`, {}, Z.cookie)
    assert.equal(badBody3.status, 400)
  })

  await t.test('6. Teilen entfernen macht wieder unsichtbar; erneutes Teilen + Verlassen räumt auf', async () => {
    const removed = await put(`/api/dogs/${nele.id}/shares`, { familyIds: [] }, Z.cookie)
    assert.equal(removed.status, 200)
    assert.deepEqual(removed.data.shares, [])

    const detailGone = await call(base, `/api/dogs/${nele.id}`, { cookie: R.cookie })
    assert.equal(detailGone.status, 404)

    const reshared = await put(`/api/dogs/${nele.id}/shares`, { familyIds: [R.data.id] }, Z.cookie)
    assert.equal(reshared.status, 200)
    assert.deepEqual(reshared.data.shares, [R.data.id])

    const leave = await call(base, `/api/memberships/${R.data.id}`, { method: 'DELETE', cookie: Z.cookie })
    assert.equal(leave.status, 200)

    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(nele.id, R.data.id).c, 0)
  })

  await t.test('7. Links werden erst sichtbar, wenn beide verlinkten Tiere geteilt sind', async () => {
    const R8 = await createFamily(base, 'Familie Sonnenhang Drei', 'pR8-pass1')
    const Z8 = await createFamily(base, 'Zuhause am Deich Zwei', 'zuhause-pass8', { art: 'zuhause' })
    await post('/api/families/join', { password: 'pR8-pass1' }, Z8.cookie)

    const nele8 = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin' }, Z8.cookie)).data
    const mira8 = (await post('/api/dogs', { name: 'Mira', geschlecht: 'huendin' }, Z8.cookie)).data
    await post(`/api/dogs/${nele8.id}/housemates`, { otherDogId: mira8.id }, Z8.cookie)

    await put(`/api/dogs/${nele8.id}/shares`, { familyIds: [R8.data.id] }, Z8.cookie)

    const hasPair = (links) =>
      links.some((l) => [l.dog_a_id, l.dog_b_id].includes(nele8.id) && [l.dog_a_id, l.dog_b_id].includes(mira8.id))

    const linksOnlyNele = (await call(base, '/api/dogs/links', { cookie: R8.cookie })).data
    assert.equal(hasPair(linksOnlyNele), false)

    // Detailansicht: solange Mira nicht geteilt ist, taucht sie in Neles housemates (in R8) nicht auf
    const detailOnlyNele = (await call(base, `/api/dogs/${nele8.id}`, { cookie: R8.cookie })).data
    assert.deepEqual(detailOnlyNele.housemates, [])

    await put(`/api/dogs/${mira8.id}/shares`, { familyIds: [R8.data.id] }, Z8.cookie)
    const linksBoth = (await call(base, '/api/dogs/links', { cookie: R8.cookie })).data
    assert.equal(hasPair(linksBoth), true)

    const detailBoth = (await call(base, `/api/dogs/${nele8.id}`, { cookie: R8.cookie })).data
    assert.deepEqual(detailBoth.housemates.map((h) => h.name), ['Mira'])
  })

  await t.test('8. deleteFamily räumt dog_shares in beide Richtungen auf', async () => {
    const { deleteFamily } = require('../lib/families')

    // nach Test 6 ist die Mitgliedschaft weg -> erneut beitreten und teilen
    await post('/api/families/join', { password: 'pR-pass1' }, Z.cookie)
    await put(`/api/dogs/${nele.id}/shares`, { familyIds: [R.data.id] }, Z.cookie)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dog_shares WHERE dog_id = ?').get(nele.id).c, 1)

    deleteFamily(db, R.data.id)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(Z.data.id).c, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dogs WHERE id = ?').get(nele.id).c, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dog_shares WHERE dog_id = ?').get(nele.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_members WHERE member_family_id = ?').get(Z.data.id).c, 0)

    const R2 = await createFamily(base, 'Familie Sonnenhang Vier', 'pR2-pass1')
    await post('/api/families/join', { password: 'pR2-pass1' }, Z.cookie)
    await put(`/api/dogs/${nele.id}/shares`, { familyIds: [R2.data.id] }, Z.cookie)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dog_shares WHERE dog_id = ?').get(nele.id).c, 1)

    deleteFamily(db, Z.data.id)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(R2.data.id).c, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dog_shares WHERE dog_id = ?').get(nele.id).c, 0)
  })
})
