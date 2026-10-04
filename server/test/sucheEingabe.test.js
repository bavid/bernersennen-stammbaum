const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold } = require('./helpers')

const dataDir = useTempDataDir('suche-eingabe', { CODE_RATE_LIMIT: '400', WRITE_RATE_LIMIT: '400' })

test('Suche: Eingabe, Platzhalter, Umlaute, Reihenfolge, Grenzen', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const raw = (body, cookie) => post('/api/suche', body, cookie)
  const search = (q, cookie, extra = {}) => raw({ q, ...extra }, cookie)
  const names = (res) => res.data.gruppen.tiere.treffer.map((item) => item.name)

  const home = await createHousehold(base, 'Zuhause Lindenhof')
  const homeId = home.data.id
  // Tiere direkt in die DB (schneller als je ein POST) - created_at aufsteigend, damit "neueste zuerst" prüfbar ist.
  const addDog = (name, createdAt = '2026-01-01 10:00:00', rasse = null) =>
    db
      .prepare("INSERT INTO dogs (family_id, name, geschlecht, rasse, created_at) VALUES (?, ?, 'ruede', ?, ?)")
      .run(homeId, name, rasse, createdAt).lastInsertRowid

  await t.test('ungültige Eingaben: 400', async () => {
    assert.equal((await raw({}, home.cookie)).status, 400)
    assert.equal((await search('a', home.cookie)).status, 400)
    assert.equal((await search('   b   ', home.cookie)).status, 400)
    assert.equal((await search('x'.repeat(81), home.cookie)).status, 400)
    assert.equal((await raw({ q: ['benno'] }, home.cookie)).status, 400)
    assert.equal((await raw({ q: { text: 'benno' } }, home.cookie)).status, 400)
    assert.equal((await raw({ q: 42 }, home.cookie)).status, 400)
    assert.equal((await raw(['benno'], home.cookie)).status, 400)
    assert.equal((await raw({ q: 'benno', seite: 2 }, home.cookie)).status, 400, 'unbekannte Angabe')
    assert.equal((await search('benno', home.cookie, { gruppen: ['tiere', 'geheim'] })).status, 400)
    assert.equal((await search('benno', home.cookie, { gruppen: 'tiere' })).status, 400)
    assert.equal((await search('benno', home.cookie, { gruppen: [] })).status, 400)
    assert.equal((await search('benno', home.cookie, { gruppen: [1] })).status, 400)
    // kein JSON (z. B. ein Formular als Text): nichts gelesen -> 400
    const text = await fetch(`${base}/api/suche`, { method: 'POST', headers: { Cookie: home.cookie, 'Content-Type': 'text/plain' }, body: 'q=benno' })
    assert.equal(text.status, 400)
    assert.equal((await search('x'.repeat(80), home.cookie)).status, 200)
  })

  await t.test('nur POST: GET mit ?q= (oder ohne) und andere Methoden -> 405, der Begriff nie in der Adresse', async () => {
    for (const method of ['GET', 'PUT', 'DELETE']) {
      const res = await call(base, '/api/suche?q=benno', { method, cookie: home.cookie })
      assert.equal(res.status, 405, method)
      assert.equal(res.headers.get('allow'), 'POST')
      assert.equal(res.headers.get('cache-control'), 'no-store')
    }
    assert.equal((await call(base, '/api/suche')).status, 405)
  })

  await t.test('gruppen: nur die gewünschten Gruppen', async () => {
    const res = await search('benno', home.cookie, { gruppen: ['tiere', 'partner', 'tiere'] })
    assert.deepEqual(Object.keys(res.data.gruppen).sort(), ['partner', 'tiere'])
  })

  await t.test('% _ und \\ gelten wörtlich', async () => {
    addDog('100% Wuff')
    addDog('Schnuff_el')
    addDog('Schnuffel')
    addDog('Back\\slash')
    assert.deepEqual(names(await search('%%', home.cookie)), [])
    assert.deepEqual(names(await search('0%', home.cookie)), ['100% Wuff'])
    assert.deepEqual(names(await search('f_e', home.cookie)), ['Schnuff_el'])
    assert.deepEqual(names(await search('_e', home.cookie)), ['Schnuff_el'])
    assert.deepEqual(names(await search('k\\s', home.cookie)), ['Back\\slash'])
    assert.deepEqual(names(await search('\\\\', home.cookie)), [])
    // Vollbreite Zeichen werden beim Falten zu % und _ - und gelten genauso wörtlich
    assert.deepEqual(names(await search('０％', home.cookie)), ['100% Wuff'])
    assert.deepEqual(names(await search('％％', home.cookie)), [])
    assert.deepEqual(names(await search('ｆ＿ｅ', home.cookie)), ['Schnuff_el'])
  })

  await t.test('Groß/klein, Umlaute und ß', async () => {
    addDog('Jürgen')
    addDog('Moritz', '2026-01-01 10:00:00', 'Großer Münsterländer')
    for (const q of ['jurgen', 'juergen', 'JÜRGEN', 'Jür']) assert.deepEqual(names(await search(q, home.cookie)), ['Jürgen'], q)
    for (const q of ['grosser', 'münster', 'muensterlaender', 'MUNSTER']) assert.deepEqual(names(await search(q, home.cookie)), ['Moritz'], q)
  })

  await t.test('Reihenfolge: genau, dann Anfang, dann irgendwo - jeweils die neuesten zuerst', async () => {
    addDog('Mit Ball alt', '2026-01-02 10:00:00')
    addDog('Ballerina', '2026-01-03 10:00:00')
    addDog('Mit Ball neu', '2026-01-04 10:00:00')
    addDog('Ball', '2026-01-01 09:00:00')
    assert.deepEqual(names(await search('ball', home.cookie)), ['Ball', 'Ballerina', 'Mit Ball neu', 'Mit Ball alt'])
  })

  await t.test('höchstens 20 je Gruppe, mehr: true', async () => {
    for (let i = 1; i <= 25; i += 1) addDog(`Pünktchen ${i}`, `2026-02-${String(i).padStart(2, '0')} 10:00:00`)
    const res = await search('punktchen', home.cookie)
    assert.equal(res.data.gruppen.tiere.treffer.length, 20)
    assert.equal(res.data.gruppen.tiere.mehr, true)
    assert.equal(names(res)[0], 'Pünktchen 25', 'die neuesten zuerst')
    assert.equal((await search('jürgen', home.cookie)).data.gruppen.tiere.mehr, false)
  })

  await t.test('Erinnerungen: Auszug höchstens 140 Zeichen um den Treffer, kein ganzer Text', async () => {
    const dogId = addDog('Wilma')
    const text = `${'Wir gingen lange spazieren. '.repeat(20)}Dann fand Wilma eine Muschel am Strand. ${'Und dann nach Hause. '.repeat(20)}`
    const created = await post('/api/timeline', { dogId, autorName: 'Test', datum: '2026-05-01', titel: 'Ausflug', text }, home.cookie)
    assert.equal(created.status, 201)
    const res = await search('muschel', home.cookie)
    const [hit] = res.data.gruppen.erinnerungen.treffer
    assert.deepEqual(Object.keys(hit).sort(), ['auszug', 'bereich', 'datum', 'id', 'tier', 'titel', 'zuhause'])
    assert.ok(hit.auszug.length <= 140 && hit.auszug.includes('Muschel am Strand'), hit.auszug)
    // sieben Wiederholungen sind schon länger als jeder Auszug - so viel vom Text steht nirgends in der Antwort
    assert.ok(!JSON.stringify(res.data).includes('Wir gingen lange spazieren. '.repeat(7).trim()))
    assert.ok(!JSON.stringify(res.data).includes('Und dann nach Hause. '.repeat(7).trim()))
    // Treffer nur im Titel: kein Auszug
    assert.equal((await search('ausflug', home.cookie)).data.gruppen.erinnerungen.treffer[0].auszug, null)
    // mehrere Wörter finden auch über einen Zeilenumbruch hinweg
    const lines = await post('/api/timeline', { dogId, autorName: 'Test', datum: '2026-05-02', titel: 'Notiz', text: 'Ein Tag\nam   Meer' }, home.cookie)
    const [multi] = (await search('tag am meer', home.cookie)).data.gruppen.erinnerungen.treffer
    assert.deepEqual([multi.id, multi.auszug], [lines.data.id, 'Ein Tag am Meer'])
  })

  await t.test('Besuchs-Sitzung darf suchen (lib/guestAccess.js)', async () => {
    const host = await createHousehold(base, 'Zuhause am Deich')
    db.prepare('INSERT INTO besuche (gast_family_id, gastgeber_family_id) VALUES (?, ?)').run(homeId, host.data.id)
    const view = await post('/api/view', { familyId: host.data.id }, home.cookie)
    const guestCookie = (view.res.headers.get('set-cookie') || '').split(';')[0]
    assert.equal((await search('wilma', guestCookie)).status, 200)
  })

  await t.test('Arbeitsbudget: sehr viel langer Text hält den Server nicht an, die Antwort sagt "unvollständig"', async () => {
    const heavy = await createHousehold(base, 'Zuhause Vielschreiber')
    const heavyId = heavy.data.id
    const dogId = db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, 'Romy', 'huendin')").run(heavyId).lastInsertRowid
    const insert = db.prepare("INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel, text) VALUES (?, ?, 'Test', '2026-01-01', ?, ?)")
    // 900 verschiedene Texte zu je 5000 Zeichen - mehr, als eine Suche falten darf (lib/searchMatch.js MAX_FOLDED_CHARS)
    db.transaction(() => {
      for (let i = 0; i < 900; i += 1) insert.run(dogId, heavyId, `Eintrag ${i}`, `${'i'.repeat(4990)}${String(i).padStart(10, '0')}`)
    })()
    const started = Date.now()
    const res = await search(`${'i'.repeat(79)}x`, heavy.cookie)
    const elapsed = Date.now() - started
    assert.equal(res.status, 200)
    assert.equal(res.data.unvollstaendig, true)
    assert.equal(res.data.gruppen.erinnerungen.mehr, true)
    assert.ok(elapsed < 3000, `nach ${elapsed} ms`)
    // ein kurzer Treffer im Titel kommt trotzdem, solange das Budget reicht - ohne "unvollständig" bei wenig Text
    assert.equal((await search('wilma', home.cookie)).data.unvollstaendig, undefined)
  })

  await t.test('nur aus der App: ein fremder Seitenaufruf (Sec-Fetch-Site: cross-site) bekommt 403', async () => {
    const send = (site) =>
      fetch(`${base}/api/suche`, {
        method: 'POST',
        headers: { Cookie: home.cookie, 'Content-Type': 'application/json', 'Sec-Fetch-Site': site },
        body: JSON.stringify({ q: 'wilma' })
      })
    assert.equal((await send('cross-site')).status, 403)
    assert.equal((await send('same-origin')).status, 200)
  })

  await t.test('Admin-Ansicht (nur lesend) und Demo dürfen suchen - die Suche ist ein lesender POST', async () => {
    const { signSession } = require('../middleware/auth')
    const { sessionCookie } = require('../config')
    const adminView = `${sessionCookie}=${signSession(homeId, homeId, { adminView: true })}`
    assert.equal((await search('wilma', adminView)).status, 200)
    assert.equal((await post('/api/dogs', { name: 'Neu', geschlecht: 'ruede' }, adminView)).status, 403, 'schreiben bleibt gesperrt')
    const demo = await createHousehold(base, 'Zuhause Demoweg')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    assert.equal((await search('wilma', demo.cookie)).status, 200)
    assert.equal((await post('/api/dogs', { name: 'Neu', geschlecht: 'ruede' }, demo.cookie)).status, 403, 'Demo schreibt nicht')
  })

  await t.test('höchstens 60 Suchen je Minute und Identität', async () => {
    const busy = await createHousehold(base, 'Zuhause Eilig')
    for (let i = 0; i < 60; i += 1) assert.equal((await search(`suche ${i}`, busy.cookie)).status, 200)
    const limited = await search('noch eine', busy.cookie)
    assert.equal(limited.status, 429)
    assert.equal((await search('wilma', home.cookie)).status, 200, 'andere Identitäten sind nicht betroffen')
  })
})
