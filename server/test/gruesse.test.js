const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

const dataDir = useTempDataDir('gruesse', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400' })

// Hinweis-Glocke: Grüße anderer Zuhause zu den eigenen Erinnerungen (GET /api/hinweise/gruesse) und „gesehen“
// (POST /api/hinweise/gelesen, Zeitstempel je Zuhause, nur vom Server gesetzt).
test('Hinweis-Glocke: neue Grüße zu eigenen Erinnerungen, gelesen, Zahlen in /me', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })

  const host = await createHousehold(base, 'Zuhause am Hafen')
  const guest = await createHousehold(base, 'Zuhause Möwenweg')
  const stranger = await createHousehold(base, 'Zuhause Fremd')
  const hostId = host.data.id

  const dog = (await post('/api/dogs', { name: 'Wilma', geschlecht: 'huendin' }, host.cookie)).data
  const entry = (await post('/api/timeline', { dogId: dog.id, autorName: 'Hafen', datum: '2026-05-01', titel: 'Erster Schnee' }, host.cookie))
    .data
  const privateEntry = (
    await post('/api/timeline', { dogId: dog.id, autorName: 'Hafen', datum: '2026-06-01', titel: 'Geheim', privat: true }, host.cookie)
  ).data

  // Der Möwenweg besucht den Hafen und grüßt dort; der Hafen selbst schreibt auch einen Gruß (zählt nicht).
  const invite = await post('/api/besuche/einladungen', {}, host.cookie)
  assert.equal((await post('/api/besuche/einloesen', { code: invite.data.code }, guest.cookie)).status, 201)
  const guestView = getCookie((await post('/api/view', { familyId: hostId }, guest.cookie)).res)
  assert.equal((await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Lotte', text: 'Wie schön!' }, guestView)).status, 201)
  await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Hafen', text: 'Danke!' }, host.cookie)
  // Ein früher Gruß (vor 40 Tagen) fällt aus dem Zeitfenster.
  db.prepare(
    `INSERT INTO entry_comments (entry_id, family_id, author_family_id, autor_name, text, created_at)
     VALUES (?, ?, ?, 'Lotte', 'Alt', datetime('now', '-40 days'))`
  ).run(entry.id, guest.data.id, guest.data.id)

  await t.test('GET /gruesse: nur Grüße anderer, mit dem Namen des Zuhauses, neu; /me zählt mit', async () => {
    const res = await get('/api/hinweise/gruesse', host.cookie)
    assert.equal(res.status, 200)
    assert.match(res.res.headers.get('cache-control') || '', /no-store/)
    assert.equal(res.data.gruesse.length, 1)
    const [gruss] = res.data.gruesse
    assert.deepEqual(
      { entryId: gruss.entryId, dogId: gruss.dogId, titel: gruss.titel, von: gruss.von, neu: gruss.neu },
      { entryId: entry.id, dogId: dog.id, titel: 'Erster Schnee', von: 'Zuhause Möwenweg', neu: true }
    )
    assert.equal(gruss.text, undefined, 'der Text des Grußes bleibt beim Eintrag')
    assert.deepEqual(res.data.zahlen, { anfragen: 0, gaeste: 1, gruesse: 1 })
    assert.equal((await get('/api/me', host.cookie)).data.neueGruesse, 1)
  })

  await t.test('POST /gelesen: danach nicht mehr neu, aber noch unter „früher“; ein neuer Gruß ist wieder neu', async () => {
    const res = await post('/api/hinweise/gelesen', {}, host.cookie)
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.zahlen, { anfragen: 0, gaeste: 1, gruesse: 0 })
    const after = await get('/api/hinweise/gruesse', host.cookie)
    assert.deepEqual(after.data.gruesse.map((g) => g.neu), [false])
    assert.equal((await get('/api/me', host.cookie)).data.neueGruesse, 0)

    // Der gespeicherte Zeitpunkt kommt vom Server - ein Wert im Body ändert nichts.
    db.prepare("UPDATE home_hinweise_gesehen SET gesehen_at = datetime('now', '-1 hour') WHERE family_id = ?").run(hostId)
    await post('/api/hinweise/gelesen', { gesehenAt: '2000-01-01 00:00:00' }, host.cookie)
    const stamp = db.prepare('SELECT gesehen_at FROM home_hinweise_gesehen WHERE family_id = ?').get(hostId).gesehen_at
    assert.ok(stamp > '2026-01-01', `vom Server gesetzt (${stamp})`)

    db.prepare("UPDATE home_hinweise_gesehen SET gesehen_at = datetime('now', '-1 hour') WHERE family_id = ?").run(hostId)
    assert.equal((await get('/api/hinweise/gruesse', host.cookie)).data.zahlen.gruesse, 1)
  })

  await t.test('private Einträge, fremde Zuhause und Bereiche außerhalb des eigenen Zuhauses', async () => {
    // Auf einen privaten Eintrag kann der Gast nicht grüßen - es bleibt bei einem Gruß.
    assert.equal((await post(`/api/timeline/${privateEntry.id}/comments`, { autorName: 'Lotte', text: 'x' }, guestView)).status, 404)
    assert.equal((await get('/api/hinweise/gruesse', stranger.cookie)).data.gruesse.length, 0)
    // Zu Besuch sperrt schon die Besuchs-Sitzung (middleware/auth.js, lib/guestAccess.js).
    assert.equal((await get('/api/hinweise/gruesse', guestView)).status, 403)
    assert.equal((await post('/api/hinweise/gelesen', {}, guestView)).status, 403)
    const rudel = await createFamily(base, 'Familie Glocke', 'glocke-pw-1')
    assert.equal((await get('/api/hinweise/gruesse', rudel.cookie)).status, 400)
    assert.equal((await get('/api/hinweise/gruesse')).status, 401)
  })

  await t.test('die Demo liest nur; das öffentliche Band GET /api/hinweise bleibt ohne Login', async () => {
    const demo = await createHousehold(base, 'Zuhause Demo Glocke')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    assert.equal((await get('/api/hinweise/gruesse', demo.cookie)).status, 200)
    assert.equal((await post('/api/hinweise/gelesen', {}, demo.cookie)).status, 403)
    const band = await get('/api/hinweise')
    assert.equal(band.status, 200)
    assert.ok(Array.isArray(band.data.hinweise))
  })

  await t.test('verschwindet das Zuhause, geht sein Zeitstempel mit', async () => {
    const { deleteFamily } = require('../lib/families')
    deleteFamily(db, hostId)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM home_hinweise_gesehen WHERE family_id = ?').get(hostId).c, 0)
  })
})
