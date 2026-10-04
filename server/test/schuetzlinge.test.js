const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// GET /api/schuetzlinge (routes/schuetzlinge.js, lib/schuetzlinge.js): „So geht es euren Schützlingen“ - die neuesten
// Erinnerungen der Tiere, die ein Tierheim vermittelt hat und bei denen das neue Zuhause es mitlesen lässt. Nie mehr, als
// das Tierheim auf der Tierseite ohnehin liest: keine privaten Erinnerungen, keine anderen Tierheime, nichts über die
// Demo-Grenze, und mit der Einwilligung ist es sofort weg. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-schuetzlinge-1'
const dataDir = useTempDataDir('schuetzlinge', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

// Felder einer Karte - kein Zuhause, keine Autorin, keine Ids außer Erinnerung und Tier (für den Link).
const ITEM_KEYS = ['comment_count', 'datum', 'dog', 'foto_url', 'id', 'text', 'titel']
const DOG_KEYS = ['foto_url', 'id', 'name', 'name_unbekannt', 'tierart']

test('Schützlinge: das Tierheim liest, wie es seinen vermittelten Tieren geht - nur mit Einwilligung', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const news = (cookie, query = '') => get(`/api/schuetzlinge${query}`, cookie)
  const titles = (res) => res.data.items.map((item) => item.titel)
  const entryAt = (id, at) => db.prepare('UPDATE timeline_entries SET created_at = ? WHERE id = ?').run(at, id)

  const adminLogin = await post('/api/admin/login', { username: 'admin', password: ADMIN_TEST_PASSWORD })
  const adminCookie = getCookie(adminLogin.res)

  let counter = 0
  async function createShelter(name) {
    counter += 1
    const partner = await post('/api/admin/partners', { name, typ: 'tierheim', plz: '10115', status: 'aktiv', slug: `th-schuetz-${counter}` }, adminCookie)
    assert.equal(partner.status, 201)
    const shelter = await post(`/api/admin/partners/${partner.data.id}/shelter`, undefined, adminCookie)
    assert.equal(shelter.status, 201)
    const login = await post('/api/login', { secret: shelter.data.key })
    return { familyId: shelter.data.familyId, cookie: getCookie(login.res) }
  }

  const entry = async (cookie, dogId, titel, extra = {}) => {
    const res = await post('/api/timeline', { dogId, autorName: 'Test', datum: '2026-05-01', titel, ...extra }, cookie)
    assert.equal(res.status, 201)
    return res.data
  }

  // Ein Tier des Tierheims (mit einer eigenen frühen Erinnerung) zieht per Übergabe in ein neues Zuhause.
  async function adopt(shelter, name, { shelterMayRead = true } = {}) {
    counter += 1
    const dog = await post('/api/dogs', { name, geschlecht: 'huendin', tierart: 'hund', vermittlungStatus: 'in_vermittlung' }, shelter.cookie)
    assert.equal(dog.status, 201)
    const early = await entry(shelter.cookie, dog.data.id, `${name} im Tierheim`)
    const handover = await post(`/api/dogs/${dog.data.id}/handover`, {}, shelter.cookie)
    assert.equal(handover.status, 201)
    const home = await createHousehold(base, `Zuhause ${name} ${counter}`)
    const claimed = await post('/api/vouchers/claim', { code: handover.data.code, shelterMayRead }, home.cookie)
    assert.equal(claimed.status, 200)
    return { dogId: dog.data.id, home, early }
  }

  const sonnenhang = await createShelter('Tierheim Sonnenhang')
  const pepper = await adopt(sonnenhang, 'Pepper')
  const strand = await entry(pepper.home.cookie, pepper.dogId, 'Pepper am Strand', { text: 'Sand überall – und ein glücklicher Hund.' })
  const tierarzt = await entry(pepper.home.cookie, pepper.dogId, 'Pepper beim Tierarzt', { privat: true })
  const sofa = await entry(pepper.home.cookie, pepper.dogId, 'Pepper erobert das Sofa')
  entryAt(strand.id, '2026-09-01 10:00:00')
  entryAt(tierarzt.id, '2026-09-03 10:00:00')
  entryAt(sofa.id, '2026-09-02 10:00:00')
  // Grüße: einer vom Tierheim, einer vom neuen Zuhause - beide sieht das Tierheim auch auf der Tierseite
  assert.equal((await post(`/api/timeline/${strand.id}/comments`, { autorName: 'Team', text: 'Wie schön!' }, sonnenhang.cookie)).status, 201)
  assert.equal((await post(`/api/timeline/${strand.id}/comments`, { autorName: 'Brandt', text: 'Danke!' }, pepper.home.cookie)).status, 201)

  await t.test('ohne Anmeldung 401, jede Antwort no-store', async () => {
    assert.equal((await news()).status, 401)
    const res = await news(sonnenhang.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
  })

  await t.test('die nicht-privaten Erinnerungen nach der Vermittlung, die zuletzt geschriebenen zuerst - mit Grüßen', async () => {
    const res = await news(sonnenhang.cookie)
    assert.deepEqual(titles(res), ['Pepper erobert das Sofa', 'Pepper am Strand'])
    assert.ok(!titles(res).includes('Pepper beim Tierarzt'), 'private Erinnerungen nie')
    assert.ok(!titles(res).includes('Pepper im Tierheim'), 'die eigenen frühen Einträge des Tierheims sind keine Neuigkeit')
    const [, beach] = res.data.items
    assert.equal(beach.comment_count, 2)
    assert.equal(beach.text, 'Sand überall – und ein glücklicher Hund.')
    assert.equal(beach.dog.id, pepper.dogId)
    assert.equal(beach.dog.name, 'Pepper')
  })

  await t.test('nur, was die Karte braucht: kein Zuhause, keine Autorin, keine fremden Ids', async () => {
    const res = await news(sonnenhang.cookie)
    for (const item of res.data.items) {
      assert.deepEqual(Object.keys(item).sort(), ITEM_KEYS)
      assert.deepEqual(Object.keys(item.dog).sort(), DOG_KEYS)
    }
    const raw = JSON.stringify(res.data)
    assert.ok(!raw.includes('Zuhause Pepper'), 'der Name des neuen Zuhauses steht nicht drin')
    assert.ok(!raw.includes('family_id') && !raw.includes('autor'))
  })

  await t.test('höchstens fünf', async () => {
    const more = []
    for (let i = 1; i <= 5; i += 1) more.push(await entry(pepper.home.cookie, pepper.dogId, `Spaziergang ${i}`))
    more.forEach((item, i) => entryAt(item.id, `2026-09-1${i} 10:00:00`))
    const res = await news(sonnenhang.cookie)
    assert.deepEqual(titles(res), ['Spaziergang 5', 'Spaziergang 4', 'Spaziergang 3', 'Spaziergang 2', 'Spaziergang 1'])
    for (const item of more) db.prepare('DELETE FROM timeline_entries WHERE id = ?').run(item.id)
  })

  await t.test('ohne „darf mitlesen“ nichts; zurückgenommen sofort weg, wieder erlaubt wieder da', async () => {
    const lotte = await adopt(sonnenhang, 'Lotte', { shelterMayRead: false })
    await entry(lotte.home.cookie, lotte.dogId, 'Lotte im Garten')
    assert.ok(!titles(await news(sonnenhang.cookie)).includes('Lotte im Garten'))

    assert.equal((await put(`/api/dogs/${pepper.dogId}/shelter-share`, { enabled: false }, pepper.home.cookie)).status, 200)
    assert.deepEqual(titles(await news(sonnenhang.cookie)), [])
    assert.equal((await put(`/api/dogs/${pepper.dogId}/shelter-share`, { enabled: true, storyConsent: false }, pepper.home.cookie)).status, 200)
    assert.deepEqual(titles(await news(sonnenhang.cookie)), ['Pepper erobert das Sofa', 'Pepper am Strand'])
  })

  await t.test('ein privat gestellter Eintrag verschwindet sofort', async () => {
    const sofaBody = (privat) => ({ autorName: 'Test', datum: '2026-05-01', titel: 'Pepper erobert das Sofa', privat })
    assert.equal((await put(`/api/timeline/${sofa.id}`, sofaBody(true), pepper.home.cookie)).status, 200)
    assert.deepEqual(titles(await news(sonnenhang.cookie)), ['Pepper am Strand'])
    assert.equal((await put(`/api/timeline/${sofa.id}`, sofaBody(false), pepper.home.cookie)).status, 200)
  })

  await t.test('andere Tierheime nie - auch nicht mit einer verirrten Freigabe ohne Übergabe von dort', async () => {
    const birkenweg = await createShelter('Tierheim Birkenweg')
    assert.deepEqual(titles(await news(birkenweg.cookie)), [])
    db.prepare('INSERT INTO dog_shares (dog_id, family_id, story_consent) VALUES (?, ?, 1)').run(pepper.dogId, birkenweg.familyId)
    assert.deepEqual(titles(await news(birkenweg.cookie)), [], 'die Übergabe kam nicht von Birkenweg')
    db.prepare('DELETE FROM dog_shares WHERE dog_id = ? AND family_id = ?').run(pepper.dogId, birkenweg.familyId)
  })

  await t.test('Demo und echte Daten mischen sich nie', async () => {
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(pepper.home.data.id)
    try {
      assert.deepEqual(titles(await news(sonnenhang.cookie)), [])
    } finally {
      db.prepare('UPDATE families SET is_demo = 0 WHERE id = ?').run(pepper.home.data.id)
    }
  })

  await t.test('nur für Tierheime: Zuhause und Familien 404, zu Besuch 403, fremde Angaben 400', async () => {
    assert.equal((await news(pepper.home.cookie)).status, 404)
    const rudel = await createFamily(base, 'Familie Sonnenhang', 'sonnenhang-pw-1')
    assert.equal((await news(rudel.cookie)).status, 404)
    const host = await createHousehold(base, 'Zuhause Möwenweg')
    db.prepare('INSERT INTO besuche (gast_family_id, gastgeber_family_id) VALUES (?, ?)').run(pepper.home.data.id, host.data.id)
    const guest = getCookie((await post('/api/view', { familyId: host.data.id }, pepper.home.cookie)).res)
    assert.equal((await news(guest)).status, 403)
    assert.equal((await news(sonnenhang.cookie, '?limit=50')).status, 400)
  })
})
