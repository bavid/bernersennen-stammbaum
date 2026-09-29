const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Phase R (Nachtrag zu Task 2): POST /api/dogs/:id/uebernehmen - die Leitung übernimmt ein Tier der Familie in
// ihre eigene Chronik (lib/transfers.js takeOverDog); danach bleibt es über eine Freigabe in der Familie sichtbar,
// alle Verweise über Tier-Ids bleiben, und eine Familie ohne eigene Tiere lässt sich auflösen. Dazu
// kannUebernehmen in GET /api/dogs. t.test() bleibt auf einer Ebene.
const dataDir = useTempDataDir('uebernehmen', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })
const FORBIDDEN = 'Dafür fehlt dir die Berechtigung in dieser Familie.'
const OTHER_HOME_MESSAGE = 'Dieses Tier gehört einem anderen Zuhause – nur Tiere der Familie lassen sich übernehmen.'

test('Tier der Familie in die eigene Chronik übernehmen', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const takeOver = (dogId, cookie) => post(`/api/dogs/${dogId}/uebernehmen`, undefined, cookie)
  const dogRow = (id) => db.prepare('SELECT * FROM dogs WHERE id = ?').get(id)

  async function upload(cookie) {
    const form = new FormData()
    form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'foto.png')
    const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
    assert.equal(res.status, 201)
    return (await res.json()).url
  }

  // Leitung L (per Gutschein eingelöstes Zuhause) gründet die Familie; Stellvertretung D und Mitglied M treten bei.
  async function newHome(label) {
    const home = await createHousehold(base, `Zuhause ${label}`)
    assert.equal(home.status, 201)
    return { id: home.data.id, homeCookie: home.cookie }
  }
  async function newFamily(label) {
    const home = await newHome(`${label} Leitung`)
    const password = `familie-${label.toLowerCase()}-pw`
    const group = await post('/api/families/group', { name: `Familie ${label}`, password }, home.homeCookie)
    assert.equal(group.status, 201)
    const familyId = group.data.memberships.find((m) => m.name === `Familie ${label}`).id
    const view = await post('/api/view', { familyId }, home.homeCookie)
    return { id: familyId, name: `Familie ${label}`, password, leitung: { ...home, cookie: getCookie(view.res) } }
  }
  async function join(family, rolle, label) {
    const home = await newHome(label)
    db.prepare('INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, ?)').run(home.id, family.id, rolle)
    const view = await post('/api/view', { familyId: family.id }, home.homeCookie)
    return { ...home, cookie: getCookie(view.res) }
  }

  const family = await newFamily('Übernahme')
  const { leitung } = family
  const deputy = await join(family, 'stellvertretung', 'Übernahme Vertretung')
  const member = await join(family, 'mitglied', 'Übernahme Mitglied')

  // Tiere der Familie: Frieda (Mutter) mit Kind Fritzi, ein Wurf von Frieda, die beiden wohnen zusammen,
  // ein Eintrag mit Foto und Kommentar des Mitglieds. Dazu Greta, aus M's Zuhause in die Familie geteilt.
  const frieda = (await post('/api/dogs', { name: 'Frieda', geschlecht: 'huendin', herkunftArt: 'zuechter', herkunftText: 'Zwinger Talblick' }, leitung.cookie)).data
  const fritzi = (await post('/api/dogs', { name: 'Fritzi', geschlecht: 'ruede', motherDogId: frieda.id }, leitung.cookie)).data
  assert.equal(fritzi.mother_dog_id, frieda.id)
  assert.equal((await post(`/api/dogs/${frieda.id}/housemates`, { otherDogId: fritzi.id }, leitung.cookie)).status, 201)
  const litter = await post('/api/breeding', { mutterDogId: frieda.id, datum: '2025-03-01', wurfInfo: 'Ein Welpe' }, leitung.cookie)
  assert.equal(litter.status, 201)
  const fotoUrl = await upload(leitung.cookie)
  const entry = (
    await post('/api/timeline', { dogId: frieda.id, autorName: 'Leitung', datum: '2025-05-01', titel: 'Am See', fotoUrls: [fotoUrl] }, leitung.cookie)
  ).data
  assert.ok(entry?.id, 'Eintrag mit Foto angelegt')
  const privateEntry = (await post('/api/timeline', { dogId: frieda.id, autorName: 'Leitung', datum: '2025-06-01', titel: 'Nur für uns', privat: true }, leitung.cookie)).data
  const comment = (await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Mitglied', text: 'Schön!' }, member.cookie)).data
  const greta = (await post('/api/dogs', { name: 'Greta', geschlecht: 'huendin' }, member.homeCookie)).data
  assert.equal((await put(`/api/dogs/${greta.id}/shares`, { familyIds: [family.id] }, member.homeCookie)).status, 200)
  const fotoFile = fotoUrl.split('/').pop()

  await t.test('kannUebernehmen: nur für die Leitung, nur für Tiere der Familie, nur in der Familie', async () => {
    const asLead = (await get('/api/dogs', leitung.cookie)).data
    assert.deepEqual(
      asLead.map((d) => [d.name, d.kannUebernehmen]).sort(),
      [
        ['Frieda', true],
        ['Fritzi', true],
        ['Greta', false]
      ]
    )
    const asDeputy = (await get('/api/dogs', deputy.cookie)).data
    assert.ok(asDeputy.every((d) => d.kannUebernehmen === false), 'Stellvertretung nie')
    const asMember = (await get('/api/dogs', member.cookie)).data
    assert.ok(asMember.every((d) => d.kannUebernehmen === false), 'Mitglied nie')
    const atHome = (await get('/api/dogs', member.homeCookie)).data
    assert.ok(atHome.every((d) => d.kannUebernehmen === false), 'im eigenen Zuhause nie')
    const shared = getCookie((await post('/api/login', { password: family.password })).res)
    assert.ok((await get('/api/dogs', shared)).data.every((d) => d.kannUebernehmen === false), 'gemeinsamer Schlüssel: kein Zuhause')
  })

  await t.test('Rechte: Mitglied und Stellvertretung 403, Zuhause 400, gemeinsamer Schlüssel 400, fremdes Tier 409, unbekannt 404', async () => {
    for (const [label, cookie] of [['Mitglied', member.cookie], ['Stellvertretung', deputy.cookie]]) {
      const res = await takeOver(frieda.id, cookie)
      assert.equal(res.status, 403, label)
      assert.equal(res.data.error, FORBIDDEN, label)
    }
    const atHome = await takeOver(frieda.id, leitung.homeCookie)
    assert.equal(atHome.status, 400)
    assert.equal(atHome.data.error, 'Nur in einer Familie möglich')
    const shared = getCookie((await post('/api/login', { password: family.password })).res)
    assert.equal((await takeOver(frieda.id, shared)).status, 400)

    const foreign = await takeOver(greta.id, leitung.cookie)
    assert.equal(foreign.status, 409)
    assert.equal(foreign.data.error, OTHER_HOME_MESSAGE)
    assert.equal((await takeOver(999999, leitung.cookie)).status, 404)
    const elsewhere = (await post('/api/dogs', { name: 'Fremd', geschlecht: 'ruede' }, deputy.homeCookie)).data
    assert.equal((await takeOver(elsewhere.id, leitung.cookie)).status, 404, 'in der Familie unsichtbar = nicht gefunden')

    assert.equal(dogRow(frieda.id).family_id, family.id, 'nichts hat sich geändert')
    assert.equal(dogRow(greta.id).family_id, member.id)
  })

  await t.test('Leitung übernimmt Frieda: zieht mit Chronik ins Zuhause, bleibt in der Familie sichtbar, Verweise bleiben', async () => {
    const res = await takeOver(frieda.id, leitung.cookie)
    assert.equal(res.status, 200, JSON.stringify(res.data))
    // Antwort wie GET /:id aus der Familie heraus: dort ist Frieda jetzt ein geteiltes Tier
    assert.equal(res.data.id, frieda.id)
    assert.equal(res.data.family_id, leitung.id)
    assert.equal(res.data.ownerFamilyId, leitung.id)
    assert.equal(res.data.canEdit, false)
    assert.equal(res.data.familyName, 'Zuhause Übernahme Leitung')
    assert.deepEqual(res.data.children.map((c) => c.name), ['Fritzi'], 'Kind bleibt sichtbar, obwohl es einem anderen Bereich gehört')
    assert.deepEqual(res.data.housemates.map((h) => h.name), ['Fritzi'])

    const row = dogRow(frieda.id)
    assert.equal(row.family_id, leitung.id)
    assert.equal(row.herkunft_art, 'zuechter', 'eingetragene Herkunft bleibt')
    assert.equal(row.herkunft_text, 'Zwinger Talblick')
    assert.deepEqual(
      db.prepare('SELECT family_id, privat FROM timeline_entries WHERE dog_id = ? ORDER BY id').all(frieda.id),
      [
        { family_id: leitung.id, privat: 0 },
        { family_id: leitung.id, privat: 0 }
      ],
      'die ganze Chronik zieht mit; "privat" (nur für die Familie) wird zur Freigabe'
    )
    assert.ok(db.prepare('SELECT 1 FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(frieda.id, family.id), 'Freigabe in die Familie')
    assert.equal(dogRow(fritzi.id).mother_dog_id, frieda.id, 'Fritzis Mutter-Verweis bleibt')
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM breeding_events WHERE mutter_dog_id = ? AND family_id = ?').get(frieda.id, family.id).c, 1, 'Wurf bleibt')
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dog_links WHERE dog_a_id = ? OR dog_b_id = ?').get(frieda.id, frieda.id).c, 1, 'Mitbewohner bleiben')
    assert.deepEqual(
      db.prepare('SELECT from_family_id, to_family_id, voucher_id FROM dog_transfers WHERE dog_id = ?').all(frieda.id),
      [{ from_family_id: family.id, to_family_id: leitung.id, voucher_id: null }]
    )

    // In der Familie: für alle weiterhin da (geteilt), Chronik samt Kommentar, Wurf, Foto
    const inFamily = (await get('/api/dogs', member.cookie)).data
    const friedaShared = inFamily.find((d) => d.id === frieda.id)
    assert.equal(friedaShared.can_edit, 0)
    assert.equal(friedaShared.shared_from, 'Zuhause Übernahme Leitung')
    const entries = (await get(`/api/timeline?dogId=${frieda.id}`, member.cookie)).data
    assert.deepEqual(entries.map((e) => e.titel), ['Am See', 'Nur für uns'])
    assert.deepEqual(entries[0].comments.map((c) => [c.id, c.vonMir]), [[comment.id, true]])
    assert.equal((await get('/api/breeding', member.cookie)).data.find((b) => b.mutter_dog_id === frieda.id)?.mutter_name, 'Frieda')
    const fritziInFamily = (await get(`/api/dogs/${fritzi.id}`, member.cookie)).data
    assert.equal(fritziInFamily.mother?.id, frieda.id, 'Stammbaum: Fritzis Mutter bleibt sichtbar')
    assert.equal((await fetch(`${base}/uploads/${fotoFile}`, { headers: { Cookie: member.cookie } })).status, 200, 'Foto in der Familie')

    // Im Zuhause der Leitung: eigenes Tier, mit Chronik und Foto, bearbeitbar; Fritzi (der Familie) taucht als Kind nicht auf
    const atHome = (await get('/api/dogs', leitung.homeCookie)).data
    assert.deepEqual(atHome.map((d) => [d.name, d.can_edit, d.kannUebernehmen]), [['Frieda', 1, false]])
    const detail = (await get(`/api/dogs/${frieda.id}`, leitung.homeCookie)).data
    assert.equal(detail.isOwn, true)
    assert.deepEqual(detail.shares, [family.id])
    assert.deepEqual(detail.children, [], 'Fritzi ist im Zuhause nicht sichtbar')
    const homeEntries = (await get(`/api/timeline?dogId=${frieda.id}`, leitung.homeCookie)).data
    assert.equal(homeEntries.length, 2)
    assert.deepEqual(homeEntries[0].comments.map((c) => [c.autor_name, c.ehemalig]), [['Mitglied', false]])
    assert.equal((await fetch(`${base}/uploads/${fotoFile}`, { headers: { Cookie: leitung.homeCookie } })).status, 200, 'Foto im Zuhause')
    assert.equal((await put(`/api/dogs/${frieda.id}`, { beschreibung: 'Jetzt bei uns' }, leitung.homeCookie)).status, 200)
    assert.equal((await takeOver(frieda.id, leitung.cookie)).status, 409, 'ein zweites Mal: gehört jetzt einem Zuhause')
  })

  await t.test('Fritzi (Kind mit Mutter in der Familie): ohne Herkunft bekommt er "aus der Familie", bleibt im Zuhause speicherbar', async () => {
    assert.equal((await takeOver(fritzi.id, leitung.cookie)).status, 200)
    const row = dogRow(fritzi.id)
    assert.equal(row.family_id, leitung.id)
    assert.equal(row.herkunft_art, 'privat')
    assert.equal(row.herkunft_text, 'aus der Familie Familie Übernahme')
    assert.equal(row.mother_dog_id, frieda.id)

    // Speichern im Zuhause mit unverändertem Eltern-Verweis geht; ein NEUER Verweis auf ein Tier der Familie nicht
    const saved = await put(`/api/dogs/${fritzi.id}`, { beschreibung: 'Zu Hause' }, leitung.homeCookie)
    assert.equal(saved.status, 200, JSON.stringify(saved.data))
    assert.equal(saved.data.mother_dog_id, frieda.id)
    const other = (await post('/api/dogs', { name: 'Oskar', geschlecht: 'ruede' }, deputy.cookie)).data
    assert.equal((await put(`/api/dogs/${fritzi.id}`, { fatherDogId: other.id }, leitung.homeCookie)).status, 400)
    assert.equal((await get(`/api/dogs/${frieda.id}`, leitung.homeCookie)).data.children.map((c) => c.name).join(), 'Fritzi', 'beide im Zuhause: Kind sichtbar')
    assert.equal((await get(`/api/dogs/${frieda.id}`, member.cookie)).data.children.map((c) => c.name).join(), 'Fritzi', 'in der Familie ebenfalls')
    // Oskar wieder weg, sonst hätte die Familie unten noch ein eigenes Tier
    assert.equal((await call(base, `/api/dogs/${other.id}`, { method: 'DELETE', cookie: deputy.cookie })).status, 204)
  })

  await t.test('Auflösen klappt, sobald alle Tiere übernommen sind - die übernommenen Tiere bleiben samt Chronik', async () => {
    const blocked = await post('/api/family/members/aufloesen', { bestaetigung: family.name }, leitung.cookie)
    assert.equal(blocked.status, 200, 'keine eigenen Tiere mehr: Frieda und Fritzi wurden übernommen')
    assert.equal(blocked.data.id, leitung.id)
    assert.equal(db.prepare('SELECT 1 FROM families WHERE id = ?').get(family.id), undefined)
    assert.deepEqual(
      db.prepare('SELECT name, family_id, mother_dog_id FROM dogs WHERE family_id = ? ORDER BY name').all(leitung.id),
      [
        { name: 'Frieda', family_id: leitung.id, mother_dog_id: null },
        { name: 'Fritzi', family_id: leitung.id, mother_dog_id: frieda.id }
      ]
    )
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM timeline_entries WHERE dog_id = ?').get(frieda.id).c, 2)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dog_shares WHERE dog_id = ?').get(frieda.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM entry_comments WHERE entry_id = ?').get(entry.id).c, 0, 'Kommentare der aufgelösten Familie sind weg')
    assert.equal(dogRow(greta.id).family_id, member.id, 'das geteilte Tier des Mitglieds bleibt bei ihm')
    assert.equal((await get(`/api/dogs/${fritzi.id}`, leitung.homeCookie)).data.mother?.name, 'Frieda')
  })

  await t.test('Demo: 403 Demo-Modus, nichts ändert sich', async () => {
    const { created } = replaceDemoPack(db, uploadDir)
    const demoCookie = getCookie((await post('/api/demo')).res)
    const view = await post('/api/view', { familyId: created.familyId }, demoCookie)
    const rudelCookie = getCookie(view.res)
    const dogs = (await get('/api/dogs', rudelCookie)).data
    const familyDog = dogs.find((d) => d.can_edit === 1)
    assert.ok(familyDog)
    assert.equal(familyDog.kannUebernehmen, true, 'die Demo-Leitung sieht den Knopf')
    const res = await takeOver(familyDog.id, rudelCookie)
    assert.equal(res.status, 403)
    assert.match(res.data.error, /Demo-Modus/)
    assert.equal(dogRow(familyDog.id).family_id, created.familyId)
  })
})
