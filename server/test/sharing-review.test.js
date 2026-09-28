const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

// Nachbesserungen aus dem Review von db9ee50: Kommentare je Familie, keine Zähl-Lecks,
// Löschen mit fremden Kommentaren, privat-Merge, Eltern-Redaktion, Teilen-Härtung.
// Hinweis: t.test() NICHT verschachteln (t.test in t.test) – das hängt den node:test-Runner
// in dieser Umgebung auf. Alle Fälle bleiben deshalb auf einer Ebene, wie in den übrigen Dateien.
const dataDir = useTempDataDir('sharing-review', { LOGIN_RATE_LIMIT: '200' })

test('Teilen – Nachbesserungen', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { deleteFamily } = require('../lib/families')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })

  await t.test('1. deleteFamily: Eintrag-Eigentümer löschen trotz fremder Kommentare', async () => {
    const Z = await createFamily(base, 'Zuhause am Deich', 'zpw-r1a', { art: 'zuhause' })
    const R = await createFamily(base, 'Familie Sonnenhang', 'rpw-r1a')
    await post('/api/families/join', { password: 'rpw-r1a' }, Z.cookie)

    const nele = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin' }, Z.cookie)).data
    const entry = (
      await post('/api/timeline', { dogId: nele.id, autorName: 'Anna', datum: '2026-01-10', titel: 'Ausflug' }, Z.cookie)
    ).data
    await put(`/api/dogs/${nele.id}/shares`, { familyIds: [R.data.id] }, Z.cookie)
    const comment = await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Nachbar', text: 'Süß!' }, R.cookie)
    assert.equal(comment.status, 201)

    // Vorher (ohne Fix) warf das hier SQLITE_CONSTRAINT_FOREIGNKEY, weil R's Kommentar noch
    // auf den gleich gelöschten Eintrag von Z zeigte.
    assert.doesNotThrow(() => deleteFamily(db, Z.data.id))
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(Z.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(R.data.id).c, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM entry_comments').get().c, 0)
  })

  await t.test('1b. deleteFamily: die kommentierende Familie löschen (Gegenrichtung) bleibt unproblematisch', async () => {
    const Z = await createFamily(base, 'Zuhause am Deich Zwei', 'zpw-r1b', { art: 'zuhause' })
    const R = await createFamily(base, 'Familie Sonnenhang Zwei', 'rpw-r1b')
    await post('/api/families/join', { password: 'rpw-r1b' }, Z.cookie)

    const nele = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin' }, Z.cookie)).data
    const entry = (
      await post('/api/timeline', { dogId: nele.id, autorName: 'Anna', datum: '2026-01-10', titel: 'Ausflug' }, Z.cookie)
    ).data
    await put(`/api/dogs/${nele.id}/shares`, { familyIds: [R.data.id] }, Z.cookie)
    await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Nachbar', text: 'Süß!' }, R.cookie)

    assert.doesNotThrow(() => deleteFamily(db, R.data.id))
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(R.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(Z.data.id).c, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM entry_comments').get().c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dogs WHERE id = ?').get(nele.id).c, 1)
  })

  await t.test('2. timeline_count zählt nur sichtbare Einträge', async () => {
    const Z = await createFamily(base, 'Zuhause am Deich Drei', 'zpw-r2', { art: 'zuhause' })
    const R = await createFamily(base, 'Familie Sonnenhang Drei', 'rpw-r2')
    await post('/api/families/join', { password: 'rpw-r2' }, Z.cookie)

    const nele = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin' }, Z.cookie)).data
    await post('/api/timeline', { dogId: nele.id, autorName: 'A', datum: '2026-01-01', titel: 'Öffentlich' }, Z.cookie)
    await post(
      '/api/timeline',
      { dogId: nele.id, autorName: 'A', datum: '2026-01-02', titel: 'Privat 1', privat: true },
      Z.cookie
    )
    await post(
      '/api/timeline',
      { dogId: nele.id, autorName: 'A', datum: '2026-01-03', titel: 'Privat 2', privat: true },
      Z.cookie
    )
    await put(`/api/dogs/${nele.id}/shares`, { familyIds: [R.data.id] }, Z.cookie)

    const inR = (await call(base, '/api/dogs', { cookie: R.cookie })).data.find((d) => d.id === nele.id)
    assert.equal(inR.timeline_count, 1)

    const inZ = (await call(base, '/api/dogs', { cookie: Z.cookie })).data.find((d) => d.id === nele.id)
    assert.equal(inZ.timeline_count, 3)
  })

  await t.test('3. Kommentare bleiben pro Familie getrennt, Eigentümer sieht alles', async () => {
    const Z = await createFamily(base, 'Zuhause am Deich Vier', 'zpw-r3', { art: 'zuhause' })
    const R1 = await createFamily(base, 'Familie Sonnenhang Vier', 'r1pw-r3')
    const R2 = await createFamily(base, 'Familie Talblick', 'r2pw-r3')
    await post('/api/families/join', { password: 'r1pw-r3' }, Z.cookie)
    await post('/api/families/join', { password: 'r2pw-r3' }, Z.cookie)

    const nele = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin' }, Z.cookie)).data
    const entry = (
      await post('/api/timeline', { dogId: nele.id, autorName: 'A', datum: '2026-02-01', titel: 'Spaziergang' }, Z.cookie)
    ).data
    await put(`/api/dogs/${nele.id}/shares`, { familyIds: [R1.data.id, R2.data.id] }, Z.cookie)

    const fromR1 = await post(`/api/timeline/${entry.id}/comments`, { autorName: 'R1', text: 'R1 sagt hallo' }, R1.cookie)
    assert.equal(fromR1.status, 201)

    const entryFor = async (cookie) => (await call(base, `/api/timeline?dogId=${nele.id}`, { cookie })).data[0]

    assert.deepEqual((await entryFor(R2.cookie)).comments.map((c) => c.text), [])
    assert.deepEqual((await entryFor(R1.cookie)).comments.map((c) => c.text), ['R1 sagt hallo'])
    assert.deepEqual((await entryFor(Z.cookie)).comments.map((c) => c.text), ['R1 sagt hallo'])

    const recentCountFor = async (cookie) =>
      (await call(base, '/api/timeline/recent', { cookie })).data.find((e) => e.id === entry.id).comment_count
    assert.equal(await recentCountFor(R2.cookie), 0)
    assert.equal(await recentCountFor(R1.cookie), 1)
    assert.equal(await recentCountFor(Z.cookie), 1)

    const ownerReply = await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Z', text: 'Danke euch!' }, Z.cookie)
    assert.equal(ownerReply.status, 201)

    assert.deepEqual((await entryFor(R2.cookie)).comments.map((c) => c.text), ['Danke euch!'])
    assert.deepEqual((await entryFor(R1.cookie)).comments.map((c) => c.text), ['R1 sagt hallo', 'Danke euch!'])
    assert.deepEqual((await entryFor(Z.cookie)).comments.map((c) => c.text), ['R1 sagt hallo', 'Danke euch!'])

    assert.equal(await recentCountFor(R2.cookie), 1)
    assert.equal(await recentCountFor(R1.cookie), 2)
    assert.equal(await recentCountFor(Z.cookie), 2)
  })

  await t.test('4. PUT ohne privat-Feld behält den bisherigen Wert', async () => {
    const Z = await createFamily(base, 'Zuhause am Deich Fünf', 'zpw-r4', { art: 'zuhause' })
    const nele = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin' }, Z.cookie)).data
    const entry = (
      await post(
        '/api/timeline',
        { dogId: nele.id, autorName: 'A', datum: '2026-03-01', titel: 'Tierarzt', privat: true },
        Z.cookie
      )
    ).data
    assert.equal(entry.privat, 1)

    const updated = await put(
      `/api/timeline/${entry.id}`,
      { autorName: 'A', datum: '2026-03-01', titel: 'Tierarzt (aktualisiert)' },
      Z.cookie
    )
    assert.equal(updated.status, 200)
    assert.equal(updated.data.privat, 1)
    assert.equal(updated.data.titel, 'Tierarzt (aktualisiert)')
  })

  // Setup für 5a/5a-bis/5b: Luna (Mutter) und Nele (Kind) gehören beide Z, Nele wird nach R geteilt.
  const Z5 = await createFamily(base, 'Zuhause am Deich Sechs', 'zpw-r5', { art: 'zuhause' })
  const R5 = await createFamily(base, 'Familie Sonnenhang Fünf', 'rpw-r5')
  await post('/api/families/join', { password: 'rpw-r5' }, Z5.cookie)
  const luna5 = (await post('/api/dogs', { name: 'Luna', geschlecht: 'huendin' }, Z5.cookie)).data
  const nele5 = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin', motherDogId: luna5.id }, Z5.cookie)).data
  await put(`/api/dogs/${nele5.id}/shares`, { familyIds: [R5.data.id] }, Z5.cookie)

  await t.test('5a. gleiche Eigentümerfamilie, Mutter nicht separat geteilt: Name-Fallback, rohe Id redigiert', async () => {
    const detailInR = (await call(base, `/api/dogs/${nele5.id}`, { cookie: R5.cookie })).data
    assert.equal(detailInR.canEdit, false)
    assert.equal(detailInR.mother.id, null)
    assert.equal(detailInR.mother.name, 'Luna')
    assert.equal(detailInR.mother_dog_id, null)
    assert.equal(detailInR.mother_freitext, null)

    const listInR = (await call(base, '/api/dogs', { cookie: R5.cookie })).data.find((d) => d.id === nele5.id)
    assert.equal(listInR.mother_dog_id, null)

    const detailInZ = (await call(base, `/api/dogs/${nele5.id}`, { cookie: Z5.cookie })).data
    assert.equal(detailInZ.canEdit, true)
    assert.equal(detailInZ.mother.name, 'Luna')
    assert.equal(detailInZ.mother_dog_id, luna5.id)
  })

  await t.test('5a-bis. Mutter zusätzlich geteilt: volle Zusammenfassung, rohe Id sichtbar', async () => {
    await put(`/api/dogs/${luna5.id}/shares`, { familyIds: [R5.data.id] }, Z5.cookie)
    const detailInR = (await call(base, `/api/dogs/${nele5.id}`, { cookie: R5.cookie })).data
    assert.equal(detailInR.mother.id, luna5.id)
    assert.equal(detailInR.mother.name, 'Luna')
    assert.equal(detailInR.mother_dog_id, luna5.id)

    const listInR = (await call(base, '/api/dogs', { cookie: R5.cookie })).data.find((d) => d.id === nele5.id)
    assert.equal(listInR.mother_dog_id, luna5.id)
  })

  await t.test('5b. Elternteil aus fremder, nicht verwandter Familie: weder Name noch Id (Altdaten-Fall)', async () => {
    const F = await createFamily(base, 'Familie Fernweh Zwei', 'fpw-r5')
    const foreign = (await post('/api/dogs', { name: 'Fremd', geschlecht: 'ruede' }, F.cookie)).data
    const kind = (await post('/api/dogs', { name: 'Kind', geschlecht: 'huendin' }, Z5.cookie)).data
    // Altdaten simulieren: rudelübergreifender Elternlink, wie in families.test.js – über die API nicht mehr möglich
    db.prepare('UPDATE dogs SET mother_dog_id = ? WHERE id = ?').run(foreign.id, kind.id)
    await put(`/api/dogs/${kind.id}/shares`, { familyIds: [R5.data.id] }, Z5.cookie)

    const detailInR = (await call(base, `/api/dogs/${kind.id}`, { cookie: R5.cookie })).data
    assert.equal(detailInR.mother, null)
    assert.equal(detailInR.mother_dog_id, null)

    const detailInZ = (await call(base, `/api/dogs/${kind.id}`, { cookie: Z5.cookie })).data
    assert.equal(detailInZ.canEdit, true)
    assert.equal(detailInZ.mother, null)
    // Bearbeiten-Ansicht: rohe Id bleibt für den Eigentümer unredigiert
    assert.equal(detailInZ.mother_dog_id, foreign.id)
  })

  await t.test('6. PUT /dogs/:id/shares: Obergrenze und Mitgliedschaft mit Demo-Parität', async () => {
    const Z = await createFamily(base, 'Zuhause am Deich Sieben', 'zpw-r6', { art: 'zuhause' })
    const R = await createFamily(base, 'Familie Sonnenhang Sechs', 'rpw-r6')
    await post('/api/families/join', { password: 'rpw-r6' }, Z.cookie)
    const nele = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin' }, Z.cookie)).data

    const tooMany = await put(
      `/api/dogs/${nele.id}/shares`,
      { familyIds: Array.from({ length: 51 }, (_, i) => i + 1) },
      Z.cookie
    )
    assert.equal(tooMany.status, 400)

    const withinLimit = await put(`/api/dogs/${nele.id}/shares`, { familyIds: [R.data.id] }, Z.cookie)
    assert.equal(withinLimit.status, 200)

    // Demo-Parität: eine Mitgliedschaftszeile existiert technisch, aber das Ziel ist eine Demo-Familie ->
    // wie canEnter (context.test.js #15) muss das trotz Mitgliedschaft verweigert werden
    const demoRudel = await createFamily(base, 'Familie Demo Teilen', 'demopw-r6')
    db.prepare('INSERT INTO family_members (member_family_id, group_family_id) VALUES (?, ?)').run(Z.data.id, demoRudel.data.id)
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoRudel.data.id)

    const toDemo = await put(`/api/dogs/${nele.id}/shares`, { familyIds: [demoRudel.data.id] }, Z.cookie)
    assert.equal(toDemo.status, 400)
  })

  // Setup für 7a-7d
  const Z7 = await createFamily(base, 'Zuhause am Deich Acht', 'zpw-r7', { art: 'zuhause' })
  const R7 = await createFamily(base, 'Familie Sonnenhang Sieben', 'rpw-r7')
  await post('/api/families/join', { password: 'rpw-r7' }, Z7.cookie)
  const nele7 = (await post('/api/dogs', { name: 'Nele', geschlecht: 'huendin' }, Z7.cookie)).data
  const publicEntry7 = (
    await post('/api/timeline', { dogId: nele7.id, autorName: 'A', datum: '2026-04-01', titel: 'Öffentlich' }, Z7.cookie)
  ).data
  const privateEntry7 = (
    await post(
      '/api/timeline',
      { dogId: nele7.id, autorName: 'A', datum: '2026-04-02', titel: 'Privat', privat: true },
      Z7.cookie
    )
  ).data
  await put(`/api/dogs/${nele7.id}/shares`, { familyIds: [R7.data.id] }, Z7.cookie)

  await t.test('7a. Rudel kommentiert einen privaten Eintrag -> 404', async () => {
    const res = await post(`/api/timeline/${privateEntry7.id}/comments`, { autorName: 'X', text: 'Hallo' }, R7.cookie)
    assert.equal(res.status, 404)
  })

  await t.test('7b. PUT/DELETE eines geteilten Eintrags aus R -> 404', async () => {
    const putRes = await put(
      `/api/timeline/${publicEntry7.id}`,
      { autorName: 'X', datum: '2026-04-01', titel: 'Übernommen' },
      R7.cookie
    )
    assert.equal(putRes.status, 404)
    const delRes = await del(`/api/timeline/${publicEntry7.id}`, R7.cookie)
    assert.equal(delRes.status, 404)
  })

  await t.test('7c. DELETE eines geteilten Tieres aus R -> 404', async () => {
    const delRes = await del(`/api/dogs/${nele7.id}`, R7.cookie)
    assert.equal(delRes.status, 404)
  })

  await t.test('7d. privat einschalten lässt den Eintrag aus R verschwinden', async () => {
    const before = (await call(base, `/api/timeline?dogId=${nele7.id}`, { cookie: R7.cookie })).data
    assert.equal(before.some((e) => e.id === publicEntry7.id), true)

    const switched = await put(
      `/api/timeline/${publicEntry7.id}`,
      { autorName: 'A', datum: '2026-04-01', titel: 'Öffentlich', privat: true },
      Z7.cookie
    )
    assert.equal(switched.status, 200)
    assert.equal(switched.data.privat, 1)

    const after = (await call(base, `/api/timeline?dogId=${nele7.id}`, { cookie: R7.cookie })).data
    assert.equal(after.some((e) => e.id === publicEntry7.id), false)
  })
})
