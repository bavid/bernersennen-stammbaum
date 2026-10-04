const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold, createFamily, getCookie } = require('./helpers')

// GET /api/start (routes/start.js, lib/startFeed.js): ein Feed über das eigene Zuhause, die Familien des Haushalts und die
// befreundeten Zuhause - jeweils mit den Regeln dieses Bereichs, nie mehr.
const dataDir = useTempDataDir('start', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400' })

// Felder, die ein Feed-Eintrag haben darf - keine internen Ids von Bereichen, Autorinnen oder Grüßen.
const ITEM_KEYS = new Set([
  'type', 'id', 'area', 'dog', 'titel', 'text', 'foto_urls', 'foto_anzahl', 'datum', 'termin_datum', 'termin_zeit',
  'autor_name', 'created_at', 'activity_at', 'comment_count', 'privat'
])

test('Start: Neues aus Zuhause, Familien und befreundeten Zuhause - nur, was der Bereich zeigt', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const start = (cookie, query = '') => get(`/api/start${query}`, cookie)
  const dog = async (cookie, name) => (await post('/api/dogs', { name, geschlecht: 'huendin' }, cookie)).data
  const entry = async (cookie, dogId, titel, extra = {}) =>
    (await post('/api/timeline', { dogId, autorName: 'Test', datum: '2026-05-01', titel, ...extra }, cookie)).data
  const note = async (cookie, text, extra = {}) => (await post('/api/notes', { autorName: 'Test', text, ...extra }, cookie)).data
  const comment = async (cookie, entryId, text) =>
    (await post(`/api/timeline/${entryId}/comments`, { autorName: 'Test', text }, cookie)).data
  const view = async (cookie, familyId) => getCookie((await post('/api/view', { familyId }, cookie)).res)
  const share = (dogId, familyId) => db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)').run(dogId, familyId)
  const member = (homeId, groupId, rolle = 'mitglied') =>
    db.prepare('INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, ?)').run(homeId, groupId, rolle)
  const visit = (guestId, hostId) => db.prepare('INSERT INTO besuche (gast_family_id, gastgeber_family_id) VALUES (?, ?)').run(guestId, hostId)
  const entryAt = (id, at) => db.prepare('UPDATE timeline_entries SET created_at = ? WHERE id = ?').run(at, id)
  const commentAt = (id, at) => db.prepare('UPDATE entry_comments SET created_at = ? WHERE id = ?').run(at, id)
  const noteAt = (id, at) => db.prepare('UPDATE notes SET created_at = ? WHERE id = ?').run(at, id)
  const keyOf = (item) => `${item.type}:${item.id}`
  const keys = (res) => res.data.items.map(keyOf)
  const itemOf = (res, type, id) => res.data.items.find((item) => item.type === type && item.id === id)

  // Zuhause Lindenhof (A): Nele mit einer öffentlichen und einer privaten Erinnerung, ein Zettel mit Termin und Antwort.
  const a = await createHousehold(base, 'Zuhause Lindenhof')
  const aId = a.data.id
  const nele = await dog(a.cookie, 'Nele')
  const aPublic = await entry(a.cookie, nele.id, 'Strandtag')
  const aPrivate = await entry(a.cookie, nele.id, 'Tierarzt', { privat: true })
  const aNote = await note(a.cookie, 'Impfung nicht vergessen', { terminDatum: '2099-01-10', terminZeit: '10:30' })
  const aReply = await post(`/api/notes/${aNote.id}/replies`, { autorName: 'Mara', text: 'Erledigt!' }, a.cookie)
  db.prepare('UPDATE note_replies SET created_at = ? WHERE id = ?').run('2026-09-22 10:00:00', aReply.data.id)

  // Zuhause Möwenweg (B) gründet Familie Sonnenhang (F); A ist dort Mitglied und teilt Nele hinein.
  const b = await createHousehold(base, 'Zuhause Möwenweg')
  const bId = b.data.id
  const group = await post('/api/families/group', { name: 'Familie Sonnenhang', password: 'sonnenhang-passwort' }, b.cookie)
  const fId = group.data.memberships[0].id
  member(aId, fId)
  share(nele.id, fId)
  const bInF = await view(b.cookie, fId)
  const lotte = await dog(bInF, 'Lotte')
  const fEntry = await entry(bInF, lotte.id, 'Familienfest')
  const fPrivate = await entry(bInF, lotte.id, 'Familiengeheimnis', { privat: true })
  const fNote = await note(bInF, 'Treffen im Garten', { terminDatum: '2099-01-05' })
  const fPast = await note(bInF, 'Altes Treffen', { terminDatum: '2020-01-01' })
  const benno = await dog(b.cookie, 'Benno')
  share(benno.id, fId)
  const bPublic = await entry(b.cookie, benno.id, 'Strandlauf')
  const bPrivate = await entry(b.cookie, benno.id, 'Geheimnis', { privat: true })
  const bInFComment = await comment(bInF, bPublic.id, 'Grüße aus Sonnenhang')

  // Zuhause Heidekamp (C) gründet Familie Heidekamp (G2) - B ist auch dort, Benno ebenfalls geteilt, A nicht.
  const c = await createHousehold(base, 'Zuhause Heidekamp')
  const g2 = await post('/api/families/group', { name: 'Familie Heidekamp', password: 'heidekamp-passwort' }, c.cookie)
  const g2Id = g2.data.memberships.find((m) => m.name === 'Familie Heidekamp').id
  member(bId, g2Id)
  share(benno.id, g2Id)
  const cInG2 = await view(c.cookie, g2Id)
  const g2Comment = await comment(cInG2, bPublic.id, 'Grüße aus Heidekamp')

  // Zuhause am Deich (D): A ist dort zu Besuch, E auch. E grüßt als Gast - das sieht A nicht.
  const d = await createHousehold(base, 'Zuhause am Deich')
  const dId = d.data.id
  const dorle = await dog(d.cookie, 'Dorle')
  const dPublic = await entry(d.cookie, dorle.id, 'Deichspaziergang')
  const dPrivate = await entry(d.cookie, dorle.id, 'Deichgeheimnis', { privat: true })
  const dNote = await note(d.cookie, 'Deichnotiz', { terminDatum: '2099-01-01' })
  const dHostComment = await comment(d.cookie, dPublic.id, 'Grüße vom Deich')
  visit(aId, dId)
  const e = await createHousehold(base, 'Zuhause Elbblick')
  visit(e.data.id, dId)
  const eAsGuest = await view(e.cookie, dId)
  const eGuestComment = await comment(eAsGuest, dPublic.id, 'Grüße vom Gast')

  // Zeiten festlegen (Sekunden genau, sonst ist die Reihenfolge Zufall).
  entryAt(aPublic.id, '2026-09-01 10:00:00')
  entryAt(aPrivate.id, '2026-09-02 10:00:00')
  entryAt(fEntry.id, '2026-09-03 10:00:00')
  entryAt(fPrivate.id, '2026-09-04 10:00:00')
  entryAt(bPublic.id, '2026-09-05 10:00:00')
  entryAt(bPrivate.id, '2026-09-06 10:00:00')
  entryAt(dPublic.id, '2026-09-07 10:00:00')
  entryAt(dPrivate.id, '2026-09-08 11:00:00')
  commentAt(dHostComment.id, '2026-09-08 10:00:00')
  noteAt(aNote.id, '2026-09-10 10:00:00')
  noteAt(fNote.id, '2026-09-11 10:00:00')
  noteAt(fPast.id, '2026-09-12 10:00:00')
  noteAt(dNote.id, '2026-09-13 10:00:00')
  commentAt(bInFComment.id, '2026-09-20 10:00:00')
  commentAt(eGuestComment.id, '2026-09-21 10:00:00')
  commentAt(g2Comment.id, '2026-09-25 10:00:00')

  const expectedForA = [
    `zettel:${aNote.id}`, // Antwort am 22.09.
    `eintrag:${bPublic.id}`, // Gruß in Sonnenhang am 20.09. (der in Heidekamp am 25.09. zählt nicht)
    `zettel:${fPast.id}`,
    `zettel:${fNote.id}`,
    `eintrag:${dPublic.id}`, // Gruß des Gastgebers am 08.09. (der des anderen Gasts am 21.09. zählt nicht)
    `eintrag:${fEntry.id}`,
    `eintrag:${aPrivate.id}`,
    `eintrag:${aPublic.id}`
  ]

  await t.test('ohne Anmeldung 401, jede Antwort no-store', async () => {
    const anon = await start()
    assert.equal(anon.status, 401)
    const ok = await start(a.cookie)
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('cache-control'), 'no-store')
  })

  await t.test('ein Feed, nach letzter Aktivität sortiert, jede Erinnerung einmal', async () => {
    const res = await start(a.cookie)
    assert.deepEqual(keys(res), expectedForA)
    assert.equal(res.data.next, null)
  })

  await t.test('eigene private Erinnerung sichtbar, im eigenen Zuhause ohne Bereichs-Chip-Wechsel', async () => {
    const res = await start(a.cookie)
    const own = itemOf(res, 'eintrag', aPrivate.id)
    assert.equal(own.privat, true)
    assert.deepEqual(own.area, { id: aId, name: 'Zuhause Lindenhof', art: 'eigen' })
    assert.deepEqual(own.dog, { id: nele.id, name: 'Nele', name_unbekannt: false, rasse: null, foto_url: null, zuhause: null })
  })

  await t.test('jede Erinnerung nennt, wo das Tier wohnt - nicht den Bereich, über den man sie sieht; das eigene Zuhause nie', async () => {
    const forA = await start(a.cookie)
    const benno = itemOf(forA, 'eintrag', bPublic.id)
    assert.equal(benno.area.art, 'familie', 'sichtbar über die Familie')
    assert.equal(benno.dog.zuhause, 'Zuhause Möwenweg', 'wohnt aber im Möwenweg')
    assert.equal(itemOf(forA, 'eintrag', fEntry.id).dog.zuhause, 'Familie Sonnenhang', 'ein Tier der Familie selbst')
    assert.equal(itemOf(forA, 'eintrag', dPublic.id).dog.zuhause, 'Zuhause am Deich', 'beim Besuch das Zuhause des Gastgebers')
    assert.equal(itemOf(forA, 'eintrag', aPublic.id).dog.zuhause, null)
    const forB = await start(b.cookie)
    assert.equal(itemOf(forB, 'eintrag', aPublic.id).dog.zuhause, 'Zuhause Lindenhof')
    assert.equal(itemOf(forB, 'eintrag', bPublic.id).dog.zuhause, null)
    assert.ok(!JSON.stringify(forA.data).includes('zuhause_id'), 'nur der Name, keine Id des fremden Zuhauses')
  })

  await t.test('fremde private Erinnerungen nie - auch nicht über eine gemeinsame Familie', async () => {
    const forA = keys(await start(a.cookie))
    assert.ok(!forA.includes(`eintrag:${bPrivate.id}`))
    assert.ok(!forA.includes(`eintrag:${fPrivate.id}`), 'auch private Erinnerungen der Familie selbst nicht')
    const forB = keys(await start(b.cookie))
    assert.ok(!forB.includes(`eintrag:${aPrivate.id}`), 'Nele ist geteilt, ihre private Erinnerung nicht')
    assert.ok(forB.includes(`eintrag:${bPrivate.id}`), 'B sieht die eigene private Erinnerung')
    assert.ok(forB.includes(`eintrag:${aPublic.id}`), 'die geteilte, nicht-private Erinnerung von A schon')
  })

  await t.test('eine eigene, in eine Familie geteilte Erinnerung erscheint einmal - als Zuhause', async () => {
    const res = await start(a.cookie)
    assert.equal(res.data.items.filter((item) => item.type === 'eintrag' && item.id === aPublic.id).length, 1)
    assert.equal(itemOf(res, 'eintrag', aPublic.id).area.art, 'eigen')
    const forB = await start(b.cookie)
    assert.deepEqual(itemOf(forB, 'eintrag', aPublic.id).area, { id: fId, name: 'Familie Sonnenhang', art: 'familie' })
    assert.equal(itemOf(forB, 'eintrag', bPublic.id).area.art, 'eigen', 'Benno ist in zwei Familien geteilt - B sieht ihn zu Hause')
  })

  await t.test('geteilte Erinnerungen nur für Mitglieder; Grüße je Bereich gezählt', async () => {
    const forA = await start(a.cookie)
    const benno1 = itemOf(forA, 'eintrag', bPublic.id)
    assert.equal(benno1.area.id, fId)
    assert.equal(benno1.comment_count, 1, 'der Gruß aus Heidekamp zählt für A nicht')
    assert.equal(benno1.activity_at, '2026-09-20 10:00:00')

    const forC = await start(c.cookie)
    assert.ok(!keys(forC).includes(`eintrag:${aPublic.id}`), 'C ist nicht in Sonnenhang')
    assert.ok(!keys(forC).includes(`eintrag:${fEntry.id}`))
    assert.ok(!keys(forC).includes(`zettel:${fNote.id}`))
    const benno2 = itemOf(forC, 'eintrag', bPublic.id)
    assert.deepEqual(benno2.area, { id: g2Id, name: 'Familie Heidekamp', art: 'familie' })
    assert.equal(benno2.comment_count, 1, 'der Gruß aus Sonnenhang zählt für C nicht')
    assert.equal(benno2.activity_at, '2026-09-25 10:00:00')

    const forB = await start(b.cookie)
    assert.equal(itemOf(forB, 'eintrag', bPublic.id).comment_count, 2, 'die Besitzerin sieht alle Grüße')
  })

  await t.test('Besuch: nur nicht-private Erinnerungen des Gastgebers, keine Pinnwand, Grüße anderer Gäste nicht', async () => {
    const res = await start(a.cookie)
    const deich = itemOf(res, 'eintrag', dPublic.id)
    assert.deepEqual(deich.area, { id: dId, name: 'Zuhause am Deich', art: 'besuch' })
    assert.equal(deich.comment_count, 1)
    assert.equal(deich.activity_at, '2026-09-08 10:00:00')
    assert.ok(!keys(res).includes(`eintrag:${dPrivate.id}`))
    assert.ok(!keys(res).includes(`zettel:${dNote.id}`))
    assert.ok(!res.data.termine.some((termin) => termin.id === dNote.id))
  })

  await t.test('Zettel mit Antworten und Termine aus Zuhause und Familien', async () => {
    const res = await start(a.cookie)
    const pinned = itemOf(res, 'zettel', aNote.id)
    assert.equal(pinned.comment_count, 1)
    assert.equal(pinned.activity_at, '2026-09-22 10:00:00')
    assert.equal(pinned.text, 'Impfung nicht vergessen')
    assert.equal(pinned.termin_datum, '2099-01-10')
    assert.deepEqual(pinned.area, { id: aId, name: 'Zuhause Lindenhof', art: 'eigen' })
    assert.deepEqual(res.data.termine, [
      { id: fNote.id, text: 'Treffen im Garten', termin_datum: '2099-01-05', termin_zeit: null, area: { id: fId, name: 'Familie Sonnenhang', art: 'familie' } },
      { id: aNote.id, text: 'Impfung nicht vergessen', termin_datum: '2099-01-10', termin_zeit: '10:30', area: { id: aId, name: 'Zuhause Lindenhof', art: 'eigen' } }
    ])
    assert.equal(res.data.notizen, 1, 'Zettel an der eigenen Pinnwand')
  })

  await t.test('keine internen Ids von Bereichen, Autorinnen oder Grüßen', async () => {
    const res = await start(a.cookie)
    for (const item of res.data.items) {
      for (const key of Object.keys(item)) assert.ok(ITEM_KEYS.has(key), `unerwartetes Feld ${key}`)
      assert.deepEqual(Object.keys(item.area).sort(), ['art', 'id', 'name'])
    }
    const raw = JSON.stringify(res.data)
    assert.ok(!raw.includes('family_id'))
    assert.ok(!raw.includes('author'))
  })

  await t.test('Anriss höchstens 300 Zeichen, höchstens 4 Fotos', async () => {
    const long = await entry(a.cookie, nele.id, 'Langer Tag', { text: 'Wort '.repeat(400) })
    try {
      const photos = Array.from({ length: 6 }, (_, index) => `/uploads/00000000-0000-4000-8000-00000000000${index}.jpg`)
      db.prepare('UPDATE timeline_entries SET foto_urls = ?, created_at = ? WHERE id = ?').run(JSON.stringify(photos), '2026-09-30 10:00:00', long.id)
      db.prepare("UPDATE dogs SET foto_url = 'https://example.org/fremd.jpg' WHERE id = ?").run(nele.id)
      const item = itemOf(await start(a.cookie), 'eintrag', long.id)
      assert.ok([...item.text].length <= 300)
      assert.ok(item.text.endsWith('…'))
      assert.deepEqual(item.foto_urls, photos.slice(0, 4))
      assert.equal(item.foto_anzahl, 6)
      assert.equal(item.dog.foto_url, null, 'nur Upload-Adressen als Tierfoto')
    } finally {
      db.prepare('DELETE FROM timeline_entries WHERE id = ?').run(long.id)
      db.prepare('UPDATE dogs SET foto_url = NULL WHERE id = ?').run(nele.id)
    }
  })

  await t.test('Weiterblättern mit vor: jede Erinnerung genau einmal, auch bei gleicher Zeit; Zettel nur auf der ersten Seite', async () => {
    entryAt(aPublic.id, '2026-09-02 10:00:00') // gleich alt wie die private Erinnerung
    try {
      const all = keys(await start(a.cookie))
      const allEntries = all.filter((key) => key.startsWith('eintrag:'))
      for (const limit of [1, 3]) {
        const seen = []
        let next = null
        for (let page = 0; page < 20; page += 1) {
          const res = await start(a.cookie, `?limit=${limit}${next ? `&vor=${encodeURIComponent(next)}` : ''}`)
          assert.equal(res.status, 200)
          const entries = keys(res).filter((key) => key.startsWith('eintrag:'))
          const notes = keys(res).filter((key) => key.startsWith('zettel:'))
          assert.ok(entries.length <= limit)
          if (page === 0) assert.deepEqual(notes, all.filter((key) => key.startsWith('zettel:')))
          else {
            assert.deepEqual(notes, [], 'Zettel nur auf der ersten Seite')
            assert.deepEqual(res.data.termine, [])
          }
          seen.push(...entries)
          next = res.data.next
          if (!next) break
          assert.match(next, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z~e\d+$/)
        }
        assert.deepEqual(seen, allEntries)
      }
      // Nur eine Zeit (ohne Gleichstand-Angabe): alles strikt Ältere - mit Bruchteilen die Sekunde selbst noch
      const older = await start(a.cookie, `?vor=${encodeURIComponent('2026-09-05T00:00:00Z')}`)
      assert.deepEqual(keys(older), [`eintrag:${fEntry.id}`, `eintrag:${aPrivate.id}`, `eintrag:${aPublic.id}`])
      const strict = await start(a.cookie, `?vor=${encodeURIComponent('2026-09-03 10:00:00')}`)
      assert.deepEqual(keys(strict), [`eintrag:${aPrivate.id}`, `eintrag:${aPublic.id}`])
      const withFraction = await start(a.cookie, `?vor=${encodeURIComponent('2026-09-03T10:00:00.5Z')}`)
      assert.deepEqual(keys(withFraction), [`eintrag:${fEntry.id}`, `eintrag:${aPrivate.id}`, `eintrag:${aPublic.id}`])
    } finally {
      entryAt(aPublic.id, '2026-09-01 10:00:00')
    }
  })

  await t.test('höchstens fünf Zettel, die neuesten', async () => {
    const extra = []
    try {
      for (let index = 0; index < 5; index += 1) {
        const pinned = await note(a.cookie, `Zettel ${index}`)
        noteAt(pinned.id, `2026-09-3${index % 2} 0${index}:00:00`)
        extra.push(pinned.id)
      }
      const notes = (await start(a.cookie)).data.items.filter((item) => item.type === 'zettel')
      assert.equal(notes.length, 5)
      assert.ok(!notes.some((item) => item.id === fPast.id), 'der älteste Zettel fällt heraus')
    } finally {
      for (const id of extra) db.prepare('DELETE FROM notes WHERE id = ?').run(id)
    }
  })

  await t.test('ungültige Angaben -> 400, kein Bereichs-Parameter', async () => {
    const invalid = [
      '?vor=gestern',
      '?vor=2026-09-05',
      '?vor=2026-09-05T00:00:00Z~e0',
      '?vor=2026-09-05T00:00:00Z~z7',
      '?vor=2026-09-05T00:00:00Z~e',
      '?limit=0',
      '?limit=21',
      '?limit=500',
      '?limit=abc',
      '?limit=1.5',
      `?familyId=${fId}`,
      `?in=${fId}`,
      '?vor=a&vor=b',
      '?vor[x]=1'
    ]
    for (const query of invalid) {
      const res = await start(a.cookie, query)
      assert.equal(res.status, 400, query)
      assert.equal(res.headers.get('cache-control'), 'no-store')
    }
    assert.equal((await start(a.cookie, '?limit=20')).status, 200)
    assert.equal((await start(a.cookie, `?vor=${encodeURIComponent('2026-09-05 00:00:00~e12')}`)).status, 200)
  })

  await t.test('in einer Familie 400, zu Besuch 403, Tierheim und Partner 404', async () => {
    const aInF = await view(a.cookie, fId)
    assert.equal((await start(aInF)).status, 400)
    const asGuest = await view(a.cookie, dId)
    assert.equal((await start(asGuest)).status, 403)
    const shelter = await createFamily(base, 'Tierheim Nordlicht', 'nordlicht-passwort', { art: 'tierheim' })
    assert.equal((await start(shelter.cookie)).status, 404)
    const partner = await createFamily(base, 'Hundeschule Pfotenglück', 'pfotenglueck-passwort', { art: 'partner' })
    assert.equal((await start(partner.cookie)).status, 404)
  })

  await t.test('klassischer Familien-Login: nur die Familie selbst (wie ihre eigene Startseite)', async () => {
    const login = await post('/api/login', { password: 'sonnenhang-passwort' })
    const res = await start(getCookie(login.res))
    assert.equal(res.status, 200)
    assert.ok(res.data.items.every((item) => item.area.id === fId && item.area.art === 'eigen'))
    assert.ok(keys(res).includes(`eintrag:${fEntry.id}`))
    assert.ok(!keys(res).includes(`eintrag:${aPrivate.id}`))
  })

  await t.test('Demo und echte Daten mischen sich nie - auch nicht mit einer verirrten Mitgliedschaft', async () => {
    const x = await createHousehold(base, 'Zuhause Demohof')
    const xId = x.data.id
    const demohund = await dog(x.cookie, 'Demohund')
    const xEntry = await entry(x.cookie, demohund.id, 'Demotag')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(xId)
    member(xId, fId)
    visit(xId, dId)
    visit(aId, xId)
    const demoFamily = db.prepare("INSERT INTO families (name, password_hash, art, is_demo) VALUES ('Demo-Familie', 'x', 'rudel', 1)").run()
    const demoFamilyId = demoFamily.lastInsertRowid
    member(aId, demoFamilyId)
    const demoDog = db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, 'Demofamilienhund', 'ruede')").run(demoFamilyId)
    const demoEntry = db
      .prepare("INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel) VALUES (?, ?, 'Demo', '2026-09-01', 'Demofest')")
      .run(demoDog.lastInsertRowid, demoFamilyId)
    db.prepare("INSERT INTO notes (family_id, autor_name, text, termin_datum) VALUES (?, 'Demo', 'Demotermin', '2099-02-01')").run(demoFamilyId)

    const forX = await start(x.cookie)
    assert.equal(forX.status, 200)
    assert.deepEqual(keys(forX), [`eintrag:${xEntry.id}`])
    assert.deepEqual(forX.data.termine, [])
    const forA = await start(a.cookie)
    assert.ok(!keys(forA).includes(`eintrag:${xEntry.id}`))
    assert.ok(!keys(forA).includes(`eintrag:${Number(demoEntry.lastInsertRowid)}`))
    assert.ok(!forA.data.items.some((item) => item.area.id === Number(demoFamilyId) || item.area.id === xId))
    assert.ok(!forA.data.termine.some((termin) => termin.text === 'Demotermin'))
  })

  await t.test('Mitgliedschaft ohne gültige Rolle zählt nicht', async () => {
    db.prepare("UPDATE family_members SET rolle = 'unbekannt' WHERE member_family_id = ? AND group_family_id = ?").run(aId, fId)
    try {
      const res = await start(a.cookie)
      assert.ok(!res.data.items.some((item) => item.area.id === fId))
    } finally {
      db.prepare("UPDATE family_members SET rolle = 'mitglied' WHERE member_family_id = ? AND group_family_id = ?").run(aId, fId)
    }
    assert.ok((await start(a.cookie)).data.items.some((item) => item.area.id === fId))
  })

  await t.test('in zwei Familien und zu Besuch sichtbar: einmal, im ersten Bereich (Familien nach Namen, dann Besuche)', async () => {
    // E ist zu Besuch bei B und Mitglied in beiden Familien, in die Benno geteilt ist
    member(e.data.id, fId)
    member(e.data.id, g2Id)
    visit(e.data.id, bId)
    const res = await start(e.cookie)
    const benno = res.data.items.filter((item) => item.type === 'eintrag' && item.id === bPublic.id)
    assert.equal(benno.length, 1)
    assert.deepEqual(benno[0].area, { id: g2Id, name: 'Familie Heidekamp', art: 'familie' })
    assert.equal(benno[0].comment_count, 1, 'gezählt mit den Regeln von Heidekamp')
    // Nur über den Besuch: B's Erinnerung an einem nicht geteilten Tier
    const kasimir = await dog(b.cookie, 'Kasimir')
    const kasimirEntry = await entry(b.cookie, kasimir.id, 'Kasimir am Fenster')
    const again = await start(e.cookie)
    assert.deepEqual(itemOf(again, 'eintrag', kasimirEntry.id).area, { id: bId, name: 'Zuhause Möwenweg', art: 'besuch' })
    assert.ok(!keys(again).includes(`eintrag:${bPrivate.id}`))
  })

  await t.test('viele Bereiche (Obergrenze 20): Start antwortet trotzdem', async () => {
    const many = await createHousehold(base, 'Zuhause Vielerorts')
    const manyId = many.data.id
    for (let index = 0; index < 18; index += 1) {
      const family = db.prepare("INSERT INTO families (name, password_hash, art) VALUES (?, 'x', 'rudel')").run(`Familie Nummer ${index}`)
      const familyId = Number(family.lastInsertRowid)
      member(manyId, familyId)
      const animal = db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, ?, 'ruede')").run(familyId, `Tier ${index}`)
      db.prepare("INSERT INTO timeline_entries (dog_id, family_id, autor_name, datum, titel) VALUES (?, ?, 'Test', '2026-09-01', ?)").run(
        animal.lastInsertRowid,
        familyId,
        `Erinnerung ${index}`
      )
    }
    visit(manyId, dId)
    visit(manyId, bId)
    const res = await start(many.cookie)
    assert.equal(res.status, 200)
    assert.equal(new Set(res.data.items.map((item) => item.area.id)).size, 19, '18 Familien und ein Besuch (das 21. ist zu viel)')
    assert.ok(res.data.items.every((item) => !item.privat))
  })

  await t.test('Besuch beendet bzw. Familie verlassen: sofort weg', async () => {
    assert.equal((await call(base, `/api/besuche/bei/${dId}`, { method: 'DELETE', cookie: a.cookie })).status, 200)
    const afterVisit = await start(a.cookie)
    assert.ok(!keys(afterVisit).includes(`eintrag:${dPublic.id}`))
    assert.equal((await call(base, `/api/memberships/${fId}`, { method: 'DELETE', cookie: a.cookie })).status, 200)
    const res = await start(a.cookie)
    assert.deepEqual(keys(res), [`zettel:${aNote.id}`, `eintrag:${aPrivate.id}`, `eintrag:${aPublic.id}`])
    assert.ok(res.data.termine.every((termin) => termin.area.id === aId))
  })
})
