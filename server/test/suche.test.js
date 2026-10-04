const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold, createFamily, getCookie } = require('./helpers')

// APP_ENV production: Demo-Partner sind dort streng getrennt (routes/discover.js partnerDemoValues) - kein dev-Bonus.
const dataDir = useTempDataDir('suche', { APP_ENV: 'production', LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400' })

test('Suche: nur, was die Identität ohnehin sehen darf', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const search = (q, cookie) => call(base, '/api/suche', { method: 'POST', body: { q }, cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const dog = async (cookie, name, extra = {}) => (await post('/api/dogs', { name, geschlecht: 'huendin', ...extra }, cookie)).data
  const entry = async (cookie, dogId, titel, text, extra = {}) =>
    (await post('/api/timeline', { dogId, autorName: 'Test', datum: '2026-05-01', titel, text, ...extra }, cookie)).data
  const note = async (cookie, text, extra = {}) => (await post('/api/notes', { autorName: 'Test', text, ...extra }, cookie)).data
  const view = async (cookie, familyId) => getCookie((await post('/api/view', { familyId }, cookie)).res)
  const hits = (res, group) => res.data.gruppen[group].treffer
  const found = (res, group, id) => hits(res, group).some((item) => item.id === id)
  const share = (dogId, familyId) => db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)').run(dogId, familyId)
  const member = (homeId, groupId, rolle = 'mitglied') =>
    db.prepare('INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, ?)').run(homeId, groupId, rolle)
  const visit = (guestId, hostId) => db.prepare('INSERT INTO besuche (gast_family_id, gastgeber_family_id) VALUES (?, ?)').run(guestId, hostId)

  // Zuhause Lindenhof (A): eigene Tiere, eine öffentliche und eine private Erinnerung, ein Zettel mit Termin.
  const a = await createHousehold(base, 'Zuhause Lindenhof')
  const aId = a.data.id
  const nele = await dog(a.cookie, 'Nele', { rasse: 'Berner Sennenhund' })
  const aEntry = await entry(a.cookie, nele.id, 'Strandtag', 'Am Meer mit dem roten Ball')
  const aPrivate = await entry(a.cookie, nele.id, 'Tierarzt', 'Das Geheimwort heißt Zitronenfalter', { privat: true })
  const aNote = await note(a.cookie, 'Impfung Zitronenmelisse nicht vergessen', { terminDatum: '2026-11-02', terminZeit: '10:30' })

  // Familie Sonnenhang (F), gegründet von A: ein eigenes Tier mit Erinnerung und ein Zettel.
  const group = await post('/api/families/group', { name: 'Familie Sonnenhang', password: 'sonnenhang-passwort' }, a.cookie)
  const fId = group.data.memberships[0].id
  const aInF = await view(a.cookie, fId)
  const lotte = await dog(aInF, 'Lotte')
  const fEntry = await entry(aInF, lotte.id, 'Familienfest', 'Kuchen im Garten')
  const fNote = await note(aInF, 'Treffen am Sonntag im Garten')

  // Zuhause Möwenweg (B): Mitglied in F, teilt Benno dorthin - mit einer öffentlichen und einer privaten Erinnerung.
  const b = await createHousehold(base, 'Zuhause Möwenweg')
  const bId = b.data.id
  member(bId, fId)
  const benno = await dog(b.cookie, 'Benno')
  share(benno.id, fId)
  const bPublic = await entry(b.cookie, benno.id, 'Strandlauf', 'Benno liebt den Strand')
  const bPrivate = await entry(b.cookie, benno.id, 'Geheimnis', 'Unser Kuchenrezept bleibt geheim', { privat: true })

  // Familie Heidekamp (G) ohne A: wird nie gefunden.
  const c = await createHousehold(base, 'Zuhause Heidekamp')
  const g = await post('/api/families/group', { name: 'Familie Heidekamp', password: 'heidekamp-passwort' }, c.cookie)
  const gId = g.data.memberships.find((m) => m.name === 'Familie Heidekamp').id
  const cInG = await view(c.cookie, gId)
  const gustav = await dog(cInG, 'Gustav')
  await entry(cInG, gustav.id, 'Heimlich', 'Strandkorb im Garten')

  // Zuhause am Deich (D): A ist dort zu Besuch.
  const d = await createHousehold(base, 'Zuhause am Deich')
  const dId = d.data.id
  const dorle = await dog(d.cookie, 'Dorle')
  const dPublic = await entry(d.cookie, dorle.id, 'Deichspaziergang', 'Wind und Schafe')
  const dPrivate = await entry(d.cookie, dorle.id, 'Deichgeheimnis', 'Nur für uns', { privat: true })
  await note(d.cookie, 'Deichnotiz für die Pinnwand')
  visit(aId, dId)

  await t.test('ohne Anmeldung 401, jede Antwort no-store', async () => {
    const anon = await search('Nele')
    assert.equal(anon.status, 401)
    assert.equal(anon.headers.get('cache-control'), 'no-store')
    const ok = await search('Nele', a.cookie)
    assert.equal(ok.status, 200)
    assert.equal(ok.headers.get('cache-control'), 'no-store')
    assert.deepEqual(Object.keys(ok.data.gruppen).sort(), ['erinnerungen', 'familien', 'partner', 'pinnwand', 'tiere'])
  })

  await t.test('eigenes Zuhause: Tiere nach Name und Rasse, auch private Erinnerungen, die eigene Pinnwand', async () => {
    const byName = await search('nele', a.cookie)
    const [hit] = hits(byName, 'tiere')
    assert.deepEqual(
      { id: hit.id, name: hit.name, rasse: hit.rasse, bereich: hit.bereich },
      { id: nele.id, name: 'Nele', rasse: 'Berner Sennenhund', bereich: { id: aId, name: 'Zuhause Lindenhof', art: 'eigen' } }
    )
    assert.ok(found(await search('sennen', a.cookie), 'tiere', nele.id))

    const secret = await search('zitronenfalter', a.cookie)
    const [privateHit] = hits(secret, 'erinnerungen')
    assert.equal(privateHit.id, aPrivate.id)
    assert.equal(privateHit.auszug, 'Das Geheimwort heißt Zitronenfalter')
    assert.deepEqual(privateHit.tier, { id: nele.id, name: 'Nele' })
    assert.equal(privateHit.text, undefined, 'nie der ganze Text')

    const pin = await search('zitronenmelisse', a.cookie)
    assert.deepEqual(hits(pin, 'pinnwand'), [
      {
        id: aNote.id,
        auszug: 'Impfung Zitronenmelisse nicht vergessen',
        terminDatum: '2026-11-02',
        terminZeit: '10:30',
        bereich: { id: aId, name: 'Zuhause Lindenhof', art: 'eigen' }
      }
    ])
    assert.ok(found(await search('strandtag', a.cookie), 'erinnerungen', aEntry.id))
  })

  await t.test('fremde private Erinnerungen nie - auch nicht über eine gemeinsame Familie', async () => {
    assert.equal(hits(await search('kuchenrezept', a.cookie), 'erinnerungen').length, 0)
    assert.equal(hits(await search('geheimnis', a.cookie), 'erinnerungen').length, 0)
    assert.equal(hits(await search('zitronenfalter', b.cookie), 'erinnerungen').length, 0)
    // Die geteilte, nicht-private Erinnerung von Benno sieht A in der Familie
    const strand = await search('strandlauf', a.cookie)
    const [shared] = hits(strand, 'erinnerungen')
    assert.equal(shared.id, bPublic.id)
    assert.deepEqual(shared.bereich, { id: fId, name: 'Familie Sonnenhang', art: 'familie' })
    // B selbst findet seine private Erinnerung
    assert.ok(found(await search('kuchenrezept', b.cookie), 'erinnerungen', bPrivate.id))
  })

  await t.test('Familien nur als Mitglied: Tiere, Erinnerungen, Pinnwand und der Name', async () => {
    const lotteHit = hits(await search('lotte', a.cookie), 'tiere')[0]
    assert.equal(lotteHit.id, lotte.id)
    assert.equal(lotteHit.fotoUrl, null, 'Fotos nur aus dem aktiven Bereich (lib/uploadAccess.js)')
    assert.ok(found(await search('familienfest', b.cookie), 'erinnerungen', fEntry.id))
    assert.ok(found(await search('sonntag', b.cookie), 'pinnwand', fNote.id))
    assert.deepEqual(hits(await search('sonnenhang', a.cookie), 'familien'), [
      { id: fId, name: 'Familie Sonnenhang', art: 'familie', rolle: 'leitung' }
    ])
    // C ist nicht in F, A nicht in G
    assert.equal(hits(await search('lotte', c.cookie), 'tiere').length, 0)
    assert.equal(hits(await search('sonntag', c.cookie), 'pinnwand').length, 0)
    assert.equal(hits(await search('gustav', a.cookie), 'tiere').length, 0)
    assert.equal(hits(await search('strandkorb', a.cookie), 'erinnerungen').length, 0)
    assert.equal(hits(await search('heidekamp', a.cookie), 'familien').length, 0)
  })

  await t.test('klassischer Familien-Login sucht nur in seiner Familie', async () => {
    const login = await post('/api/login', { password: 'sonnenhang-passwort' })
    const classic = getCookie(login.res)
    assert.ok(found(await search('lotte', classic), 'tiere', lotte.id))
    assert.ok(found(await search('strandlauf', classic), 'erinnerungen', bPublic.id))
    assert.equal(hits(await search('nele', classic), 'tiere').length, 0)
    assert.equal(hits(await search('kuchenrezept', classic), 'erinnerungen').length, 0)
    assert.equal(hits(await search('sonnenhang', classic), 'familien').length, 0)
  })

  await t.test('Besuch: nur nicht-private Erinnerungen und die Tiere des Gastgebers, keine Pinnwand', async () => {
    const dorleHit = hits(await search('dorle', a.cookie), 'tiere')[0]
    assert.deepEqual(dorleHit.bereich, { id: dId, name: 'Zuhause am Deich', art: 'besuch' })
    assert.ok(found(await search('deichspaziergang', a.cookie), 'erinnerungen', dPublic.id))
    assert.equal(hits(await search('deichgeheimnis', a.cookie), 'erinnerungen').length, 0)
    assert.equal(hits(await search('deichnotiz', a.cookie), 'pinnwand').length, 0)
    assert.deepEqual(hits(await search('deich', a.cookie), 'familien'), [{ id: dId, name: 'Zuhause am Deich', art: 'besuch', rolle: null }])
    // D sieht bei A nichts - der Besuch geht nur in eine Richtung
    assert.equal(hits(await search('nele', d.cookie), 'tiere').length, 0)
    assert.ok(found(await search('deichgeheimnis', d.cookie), 'erinnerungen', dPrivate.id))
  })

  await t.test('Besuchs-Sitzung: das eigene Zuhause und der Gastgeber, sonst nichts', async () => {
    const guest = await view(a.cookie, dId)
    const res = await search('dorle', guest)
    assert.equal(res.status, 200)
    assert.ok(found(res, 'tiere', dorle.id))
    assert.ok(found(await search('zitronenfalter', guest), 'erinnerungen', aPrivate.id))
    assert.equal(hits(await search('deichgeheimnis', guest), 'erinnerungen').length, 0)
    assert.equal(hits(await search('lotte', guest), 'tiere').length, 0)
    assert.equal(hits(await search('deichnotiz', guest), 'pinnwand').length, 0)
  })

  await t.test('Familie verlassen bzw. Besuch beendet: sofort weg', async () => {
    assert.ok(found(await search('lotte', b.cookie), 'tiere', lotte.id))
    assert.equal((await call(base, `/api/memberships/${fId}`, { method: 'DELETE', cookie: b.cookie })).status, 200)
    assert.equal(hits(await search('lotte', b.cookie), 'tiere').length, 0)
    assert.equal(hits(await search('sonntag', b.cookie), 'pinnwand').length, 0)
    assert.equal(hits(await search('strandlauf', a.cookie), 'erinnerungen').length, 0, 'die Freigabe endet mit der Mitgliedschaft')

    db.prepare('DELETE FROM besuche WHERE gast_family_id = ? AND gastgeber_family_id = ?').run(aId, dId)
    assert.equal(hits(await search('dorle', a.cookie), 'tiere').length, 0)
    assert.equal(hits(await search('deich', a.cookie), 'familien').length, 0)
  })

  await t.test('in mehreren Bereichen sichtbar: einmal, und zwar im aktiven Bereich', async () => {
    share(nele.id, fId)
    const fromFamily = hits(await search('nele', aInF), 'tiere')
    assert.deepEqual(fromFamily.map((hit) => [hit.id, hit.bereich.art]), [[nele.id, 'familie']])
    const fromHome = hits(await search('nele', a.cookie), 'tiere')
    assert.deepEqual(fromHome.map((hit) => [hit.id, hit.bereich.art]), [[nele.id, 'eigen']])
    // die geteilte Erinnerung ebenso - die private bleibt im eigenen Zuhause
    assert.deepEqual(hits(await search('strandtag', aInF), 'erinnerungen').map((hit) => hit.bereich.art), ['familie'])
    assert.deepEqual(hits(await search('zitronenfalter', aInF), 'erinnerungen').map((hit) => hit.bereich.art), ['eigen'])
  })

  await t.test('Demo und echte Daten mischen sich nie', async () => {
    const x = await createHousehold(base, 'Zuhause Demohof')
    const xId = x.data.id
    const demohund = await dog(x.cookie, 'Demohund')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(xId)
    member(xId, fId)
    visit(xId, aId)
    visit(aId, xId)
    const demoFamily = db.prepare("INSERT INTO families (name, password_hash, art, is_demo) VALUES ('Demo-Familie', 'x', 'rudel', 1)").run()
    member(aId, demoFamily.lastInsertRowid)
    db.prepare("INSERT INTO dogs (family_id, name, geschlecht) VALUES (?, 'Demofamilienhund', 'ruede')").run(demoFamily.lastInsertRowid)

    assert.ok(found(await search('demohund', x.cookie), 'tiere', demohund.id))
    assert.equal(hits(await search('lotte', x.cookie), 'tiere').length, 0)
    assert.equal(hits(await search('nele', x.cookie), 'tiere').length, 0)
    assert.equal(hits(await search('sonnenhang', x.cookie), 'familien').length, 0)
    assert.equal(hits(await search('demohund', a.cookie), 'tiere').length, 0)
    assert.equal(hits(await search('demofamilienhund', a.cookie), 'tiere').length, 0)
    assert.equal(hits(await search('demo', a.cookie), 'familien').length, 0)
  })

  await t.test('Partner: nur öffentlich sichtbare, Demo getrennt', async () => {
    const insert = db.prepare(
      `INSERT INTO partners (slug, name, typ, status, ort, is_demo, gesperrt, logo_file) VALUES (?, ?, 'hundeschule', ?, ?, ?, ?, ?)`
    )
    insert.run('pfotenglueck', 'Hundeschule Pfotenglück', 'aktiv', 'Bremen', 0, 0, null)
    insert.run('pfoten-entwurf', 'Hundeschule Pfotenentwurf', 'entwurf', 'Bremen', 0, 0, null)
    insert.run('pfoten-pause', 'Hundeschule Pfotenpause', 'pausiert', 'Bremen', 0, 0, null)
    insert.run('pfoten-gesperrt', 'Hundeschule Pfotensperre', 'aktiv', 'Bremen', 0, 1, null)
    insert.run('pfoten-demo', 'Hundeschule Pfotendemo', 'aktiv', 'Bremen', 1, 0, null)

    const real = await search('pfoten', a.cookie)
    assert.deepEqual(hits(real, 'partner'), [
      { id: hits(real, 'partner')[0].id, slug: 'pfotenglueck', name: 'Hundeschule Pfotenglück', typ: 'hundeschule', ort: 'Bremen', logoUrl: null }
    ])
    assert.equal(hits(await search('bremen', a.cookie), 'partner').length, 1, 'auch nach Ort')
    const demoCookie = (await createDemoSession(base, db)).cookie
    assert.deepEqual(hits(await search('pfoten', demoCookie), 'partner').map((p) => p.slug), ['pfoten-demo'])
  })

  await t.test('Tierheim- und Partner-Bereiche: 404', async () => {
    const shelter = await createFamily(base, 'Tierheim Nordlicht', 'nordlicht-passwort', { art: 'tierheim' })
    const res = await search('nele', shelter.cookie)
    assert.equal(res.status, 404)
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })
})

// Ein Demo-Zuhause mit Sitzung: per Gutschein angelegt und danach als Demo markiert (is_demo kommt aus der DB, nicht aus
// dem Token - middleware/auth.js).
async function createDemoSession(base, db) {
  const home = await createHousehold(base, 'Zuhause Demowiese')
  db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(home.data.id)
  return home
}
