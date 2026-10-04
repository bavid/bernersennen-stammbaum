const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

const dataDir = useTempDataDir('besuche', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400' })

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

test('Phase V2: Zuhause besuchen - Einladung, Einlösen, nur lesen und kommentieren, beenden', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const del = (urlPath, cookie) => call(base, urlPath, { method: 'DELETE', cookie })

  const host = await createHousehold(base, 'Zuhause am Hafen')
  const guest = await createHousehold(base, 'Zuhause im Grünen')
  const other = await createHousehold(base, 'Zuhause Fremd')
  const hostId = host.data.id
  const guestId = guest.data.id

  // Daten des Gastgebers: ein Tier mit Foto, ein öffentlicher und ein privater Eintrag (je mit Foto).
  const dogPhoto = await uploadPng(base, host.cookie)
  const publicPhoto = await uploadPng(base, host.cookie)
  const privatePhoto = await uploadPng(base, host.cookie)
  const freshPhoto = await uploadPng(base, host.cookie)
  const dog = (await post('/api/dogs', { name: 'Wilma', geschlecht: 'huendin', fotoUrl: dogPhoto }, host.cookie)).data
  const publicEntry = (
    await post('/api/timeline', { dogId: dog.id, autorName: 'Hafen', datum: '2026-05-01', titel: 'Am Strand', fotoUrls: [publicPhoto] }, host.cookie)
  ).data
  const privateEntry = (
    await post(
      '/api/timeline',
      { dogId: dog.id, autorName: 'Hafen', datum: '2026-06-01', titel: 'Tierarzt geheim', fotoUrls: [privatePhoto], privat: true },
      host.cookie
    )
  ).data
  await post(`/api/timeline/${publicEntry.id}/comments`, { autorName: 'Hafen', text: 'Kommentar des Gastgebers' }, host.cookie)

  let guestCookie = guest.cookie
  let invite

  await t.test('Einladung: nur aus dem eigenen Zuhause, 7 Tage gültig, erscheint in /vouchers/mine', async () => {
    const res = await post('/api/besuche/einladungen', {}, host.cookie)
    assert.equal(res.status, 201)
    assert.match(res.data.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    assert.equal(res.data.gueltigTage, 7)
    const days = (new Date(`${res.data.expires_at}Z`) - Date.now()) / (24 * 60 * 60 * 1000)
    assert.ok(days > 6.9 && days <= 7, `läuft nach 7 Tagen ab (${days})`)
    invite = res.data

    const mine = await get('/api/vouchers/mine', host.cookie)
    const row = mine.data.find((voucher) => voucher.id === invite.id)
    assert.equal(row.besuch, true)
    assert.equal(row.code, invite.code)

    const check = await post('/api/vouchers/check', { code: invite.code })
    assert.deepEqual(check.data, { status: 'offen', besuch: { name: 'Zuhause am Hafen' } })

    const rudel = await createFamily(base, 'Familie Besuchstest', 'besuchstest-pw-1')
    assert.equal((await post('/api/besuche/einladungen', {}, rudel.cookie)).status, 400)
    assert.equal((await post('/api/besuche/einladungen', {}, undefined)).status, 401)
  })

  await t.test('falsche Wege verbrauchen nichts: Übergabe-Einlösen, Chronik-Gutschein, eigene Einladung', async () => {
    const claim = await post('/api/vouchers/claim', { code: invite.code }, guest.cookie)
    assert.equal(claim.status, 400)
    const own = await post('/api/besuche/einloesen', { code: invite.code }, host.cookie)
    assert.equal(own.status, 400)

    const { createBatch } = require('../lib/vouchers')
    const { codes } = createBatch(db, { label: 'Chronik', kind: 'admin', size: 1 })
    const wrong = await post('/api/besuche/einloesen', { code: codes[0] }, guest.cookie)
    assert.equal(wrong.status, 400)
    assert.equal((await post('/api/vouchers/check', { code: codes[0] })).data.status, 'offen')
    assert.equal((await post('/api/vouchers/check', { code: invite.code })).data.status, 'offen')
  })

  await t.test('Einlösen aus dem eigenen Zuhause legt den Besuch an - genau einmal', async () => {
    const res = await post('/api/besuche/einloesen', { code: invite.code }, guest.cookie)
    assert.equal(res.status, 201)
    assert.deepEqual(res.data.gastgeber, { id: hostId, name: 'Zuhause am Hafen' })
    assert.deepEqual(res.data.me.besuche.map(({ id, name }) => ({ id, name })), [{ id: hostId, name: 'Zuhause am Hafen' }])

    const again = await post('/api/besuche/einloesen', { code: invite.code }, other.cookie)
    assert.equal(again.status, 410)

    const lists = await get('/api/besuche', host.cookie)
    assert.deepEqual(lists.data.gaeste.map((g) => g.id), [guestId])
    assert.deepEqual(lists.data.besuche, [])
    assert.deepEqual((await get('/api/besuche', guest.cookie)).data.besuche.map((b) => b.id), [hostId])
  })

  await t.test('abgelaufene Einladung (nach 7 Tagen) lässt sich nicht mehr einlösen', async () => {
    const res = await post('/api/besuche/einladungen', {}, host.cookie)
    db.prepare("UPDATE vouchers SET expires_at = datetime('now', '-1 minute') WHERE id = ?").run(res.data.id)
    const late = await post('/api/besuche/einloesen', { code: res.data.code }, other.cookie)
    assert.equal(late.status, 410)
    assert.equal((await get('/api/besuche', other.cookie)).data.besuche.length, 0)
  })

  await t.test('Wechsel zum Gastgeber: zuBesuch, Rolle gast; Fremde kommen nicht hinein', async () => {
    const view = await post('/api/view', { familyId: hostId }, guest.cookie)
    assert.equal(view.status, 200)
    assert.equal(view.data.id, hostId)
    assert.equal(view.data.zuBesuch, true)
    assert.equal(view.data.role, 'gast')
    guestCookie = getCookie(view.res)

    const me = await get('/api/me', guestCookie)
    assert.equal(me.data.id, hostId)
    assert.equal(me.data.zuBesuch, true)

    assert.equal((await post('/api/view', { familyId: hostId }, other.cookie)).status, 404)
    // Umgekehrt nicht: der Gastgeber besucht den Gast nicht
    assert.equal((await post('/api/view', { familyId: guestId }, host.cookie)).status, 404)
  })

  await t.test('Gast sieht nur Nicht-Privates und darf nichts bearbeiten', async () => {
    const dogs = await get('/api/dogs', guestCookie)
    assert.equal(dogs.status, 200)
    assert.equal(dogs.data.length, 1)
    assert.equal(dogs.data[0].can_edit, 0)
    assert.equal(dogs.data[0].timeline_count, 1)
    assert.equal(dogs.data[0].latest_entry_titel, 'Am Strand')

    const detail = await get(`/api/dogs/${dog.id}`, guestCookie)
    assert.equal(detail.data.canEdit, false)
    assert.deepEqual(detail.data.shares, [])
    assert.equal(detail.data.shelterShare, undefined)

    const timeline = await get(`/api/timeline?dogId=${dog.id}`, guestCookie)
    assert.deepEqual(timeline.data.map((entry) => entry.titel), ['Am Strand'])
    assert.deepEqual(timeline.data[0].comments.map((c) => c.text), ['Kommentar des Gastgebers'])
    const recent = await get('/api/timeline/recent', guestCookie)
    assert.ok(recent.data.every((entry) => entry.id !== privateEntry.id))

    assert.deepEqual((await get('/api/breeding', guestCookie)).data, [])
    assert.deepEqual((await get('/api/notes', guestCookie)).data, [])
    assert.equal((await get('/api/dogs/all', guestCookie)).data[0].can_edit, 0)
  })

  await t.test('Gast: jeder Schreibweg außer Kommentaren ist gesperrt (403), auch fremde Lese-Routen', async () => {
    const attempts = [
      ['POST', '/api/dogs', { name: 'Neu', geschlecht: 'ruede' }],
      ['PUT', `/api/dogs/${dog.id}`, { name: 'Umbenannt' }],
      ['DELETE', `/api/dogs/${dog.id}`],
      ['POST', '/api/timeline', { dogId: dog.id, autorName: 'X', datum: '2026-01-01', titel: 'Fremd' }],
      ['PUT', `/api/timeline/${publicEntry.id}`, { autorName: 'X', datum: '2026-01-01', titel: 'Fremd' }],
      ['DELETE', `/api/timeline/${publicEntry.id}`],
      ['POST', '/api/notes', { autorName: 'X', text: 'Zettel' }],
      ['PUT', '/api/family', { name: 'Gekapert' }],
      ['POST', '/api/messages', { type: 'feedback', autorName: 'X', text: 'Hallo' }],
      ['GET', '/api/vouchers/mine'],
      ['GET', '/api/users'],
      ['GET', '/api/family/members'],
      ['POST', '/api/besuche/einladungen', {}],
      ['PUT', `/api/dogs/${dog.id}/shares`, { familyIds: [] }],
      ['POST', '/api/discover', {}],
      ['GET', '/api/VOUCHERS/MINE']
    ]
    for (const [method, urlPath, body] of attempts) {
      const res = await call(base, urlPath, { method, body, cookie: guestCookie })
      assert.equal(res.status, 403, `${method} ${urlPath} -> ${res.status}`)
    }
    const form = new FormData()
    form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
    const upload = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: guestCookie }, body: form })
    assert.equal(upload.status, 403)
    assert.equal(db.prepare("SELECT name FROM dogs WHERE id = ?").get(dog.id).name, 'Wilma')
  })

  await t.test('Kommentare: Gast schreibt und löscht eigene, nie die des Gastgebers; private bleiben zu', async () => {
    const res = await post(`/api/timeline/${publicEntry.id}/comments`, { autorName: 'Grün', text: 'Schön war es!' }, guestCookie)
    assert.equal(res.status, 201)
    assert.equal(res.data.vonMir, true)
    const onPrivate = await post(`/api/timeline/${privateEntry.id}/comments`, { autorName: 'Grün', text: 'Psst' }, guestCookie)
    assert.equal(onPrivate.status, 404)

    const hostComment = db.prepare('SELECT id FROM entry_comments WHERE entry_id = ? AND author_family_id = ?').get(publicEntry.id, hostId)
    assert.equal((await del(`/api/timeline/${publicEntry.id}/comments/${hostComment.id}`, guestCookie)).status, 404)

    // Der Gastgeber sieht den Kommentar des Gasts, ein zweiter Gast nicht.
    const hostTimeline = await get(`/api/timeline?dogId=${dog.id}`, host.cookie)
    const hostView = hostTimeline.data.find((entry) => entry.id === publicEntry.id)
    assert.ok(hostView.comments.some((c) => c.text === 'Schön war es!'))

    const second = await post('/api/besuche/einladungen', {}, host.cookie)
    await post('/api/besuche/einloesen', { code: second.data.code }, other.cookie)
    const otherView = getCookie((await post('/api/view', { familyId: hostId }, other.cookie)).res)
    const otherTimeline = await get(`/api/timeline?dogId=${dog.id}`, otherView)
    assert.deepEqual(otherTimeline.data[0].comments.map((c) => c.text), ['Kommentar des Gastgebers'])

    assert.equal((await del(`/api/timeline/${publicEntry.id}/comments/${res.data.id}`, guestCookie)).status, 204)
  })

  await t.test('Fotos: Tierfoto und Fotos nicht-privater Einträge ja, private und frische nein', async () => {
    const status = async (url, cookie) => (await fetch(`${base}${url}`, { headers: { Cookie: cookie } })).status
    assert.equal(await status(dogPhoto, guestCookie), 200)
    assert.equal(await status(publicPhoto, guestCookie), 200)
    assert.equal(await status(privatePhoto, guestCookie), 404)
    assert.equal(await status(freshPhoto, guestCookie), 404)
    // Aus dem eigenen Zuhause heraus (kein Besuch aktiv) sieht der Gast gar nichts vom Gastgeber
    assert.equal(await status(publicPhoto, guest.cookie), 404)
  })

  await t.test('Gastgeber beendet den Besuch: die Besuchs-Sitzung fällt nach Hause zurück', async () => {
    const otherId = other.data.id
    assert.equal((await del(`/api/besuche/gaeste/${otherId}`, host.cookie)).status, 204)
    assert.equal((await del(`/api/besuche/gaeste/${otherId}`, host.cookie)).status, 404)
    assert.equal((await post('/api/view', { familyId: hostId }, other.cookie)).status, 404)
  })

  await t.test('Gast beendet den Besuch mitten im Besuch: zurück nach Hause, danach kein Zutritt mehr', async () => {
    const res = await del(`/api/besuche/bei/${hostId}`, guestCookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.id, guestId)
    assert.deepEqual(res.data.besuche, [])
    const fresh = getCookie(res.res)
    assert.equal((await get('/api/me', fresh)).data.id, guestId)
    // Auch das alte Cookie (noch mit dem Gastgeber als aktivem Bereich) landet wieder zu Hause
    const stale = await get('/api/me', guestCookie)
    assert.equal(stale.data.id, guestId)
    assert.equal(stale.data.zuBesuch, undefined)
    assert.equal((await post('/api/view', { familyId: hostId }, fresh)).status, 404)
  })

  await t.test('ein neuer Haushalt löst die Einladung über /v ein: Chronik und Besuch, eigener Schlüssel', async () => {
    const res = await post('/api/besuche/einladungen', {}, host.cookie)
    const redeem = await post('/api/vouchers/redeem', { code: res.data.code, name: 'Zuhause Neu am Hafen' })
    assert.equal(redeem.status, 201)
    assert.deepEqual(redeem.data.besuche.map(({ id, name }) => ({ id, name })), [{ id: hostId, name: 'Zuhause am Hafen' }])
    assert.notEqual(redeem.data.key, res.data.code, 'der Gastgeber kennt den Code - er ist nicht der neue Schlüssel')
    const loginWithCode = await post('/api/login', { secret: res.data.code })
    assert.notEqual(loginWithCode.status, 200)
    const loginWithKey = await post('/api/login', { secret: redeem.data.key })
    assert.equal(loginWithKey.status, 200)
    assert.equal(loginWithKey.data.id, redeem.data.id)
  })

  await t.test('Demo: keine Einladungen, kein Einlösen (nur lesen)', async () => {
    const demo = await createHousehold(base, 'Zuhause Demo Besuch')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    assert.equal((await post('/api/besuche/einladungen', {}, demo.cookie)).status, 403)
    const res = await post('/api/besuche/einladungen', {}, host.cookie)
    assert.equal((await post('/api/besuche/einloesen', { code: res.data.code }, demo.cookie)).status, 403)
  })

  await t.test('ein gelöschtes Zuhause nimmt seine Besuche mit', async () => {
    const { deleteFamily } = require('../lib/families')
    const res = await post('/api/besuche/einladungen', {}, host.cookie)
    const visitor = await createHousehold(base, 'Zuhause Kurzbesuch')
    await post('/api/besuche/einloesen', { code: res.data.code }, visitor.cookie)
    deleteFamily(db, visitor.data.id)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM besuche WHERE gast_family_id = ?').get(visitor.data.id).c, 0)
  })
})
