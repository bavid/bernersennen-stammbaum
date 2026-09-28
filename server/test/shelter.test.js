const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const ADMIN_TEST_PASSWORD = 'admin-test-shelter-1'
const dataDir = useTempDataDir('shelter')

function samplePartner(overrides = {}) {
  return { name: 'Tierheim Sonnenhang', typ: 'tierheim', plz: '10115', status: 'aktiv', ...overrides }
}

test('Tierheim-Bereich: Admin legt ihn aus der Partnerverwaltung an, Schlüssel-Login, Rechte', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(login.res)

  const post = (urlPath, body, cookie = adminCookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const get = (urlPath, cookie = adminCookie) => call(base, urlPath, { cookie })
  const del = (urlPath, cookie = adminCookie) => call(base, urlPath, { method: 'DELETE', cookie })

  let sonnenhangPartnerId
  let sonnenhangKey
  let sonnenhangFamilyId

  await t.test('Anlegen: legt eine Tierheim-Familie mit Zugangsschlüssel an, der einmalig zurückkommt', async () => {
    const partner = await post('/api/admin/partners', samplePartner())
    assert.equal(partner.status, 201)
    sonnenhangPartnerId = partner.data.id

    const shelter = await post(`/api/admin/partners/${sonnenhangPartnerId}/shelter`)
    assert.equal(shelter.status, 201)
    assert.ok(Number.isInteger(shelter.data.familyId))
    assert.match(shelter.data.key, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    sonnenhangKey = shelter.data.key
    sonnenhangFamilyId = shelter.data.familyId

    const db = require('../db')
    const family = db
      .prepare('SELECT art, partner_id, name, theme, password_hash, legacy_password, access_key_hash FROM families WHERE id = ?')
      .get(sonnenhangFamilyId)
    assert.equal(family.art, 'tierheim')
    assert.equal(family.partner_id, sonnenhangPartnerId)
    assert.equal(family.name, 'Tierheim Sonnenhang')
    assert.equal(family.theme, 'standard')
    assert.equal(family.password_hash, '!')
    assert.equal(family.legacy_password, 0)
    assert.ok(family.access_key_hash)
  })

  await t.test('GET /api/admin/partners zeigt shelter_family_id (null ohne Tierheim-Bereich)', async () => {
    const list = await get('/api/admin/partners')
    assert.equal(list.status, 200)
    const row = list.data.find((p) => p.id === sonnenhangPartnerId)
    assert.equal(row.shelter_family_id, sonnenhangFamilyId)

    const other = await post('/api/admin/partners', samplePartner({ name: 'Tierheim ohne Bereich', slug: 'tierheim-ohne-bereich' }))
    const listAfter = await get('/api/admin/partners')
    const otherRow = listAfter.data.find((p) => p.id === other.data.id)
    assert.equal(otherRow.shelter_family_id, null)
  })

  await t.test('Doppelt anlegen -> 409', async () => {
    const again = await post(`/api/admin/partners/${sonnenhangPartnerId}/shelter`)
    assert.equal(again.status, 409)
  })

  await t.test('Partner vom falschen Typ (Hundeschule) -> 400, "vermittlung" ist erlaubt', async () => {
    const school = await post(
      '/api/admin/partners',
      samplePartner({ name: 'Hundeschule Pfotenglück', typ: 'hundeschule', slug: 'hundeschule-pfotenglueck' })
    )
    const rejected = await post(`/api/admin/partners/${school.data.id}/shelter`)
    assert.equal(rejected.status, 400)

    const vermittlung = await post(
      '/api/admin/partners',
      samplePartner({ name: 'Vermittlung Tierfreunde', typ: 'vermittlung', slug: 'vermittlung-tierfreunde' })
    )
    const allowed = await post(`/api/admin/partners/${vermittlung.data.id}/shelter`)
    assert.equal(allowed.status, 201)
  })

  await t.test('Unbekannter Partner -> 404', async () => {
    const missing = await post('/api/admin/partners/999999/shelter')
    assert.equal(missing.status, 404)
  })

  await t.test('kein Zugriff ohne Admin', async () => {
    const family = await createFamily(base, 'Familie Kein Shelter-Zugriff', 'kein-shelter-admin-1')
    assert.equal((await post(`/api/admin/partners/${sonnenhangPartnerId}/shelter`, undefined, family.cookie)).status, 401)
    assert.equal((await post(`/api/admin/partners/${sonnenhangPartnerId}/shelter`, undefined, null)).status, 401)
  })

  await t.test('Schlüssel-Login meldet das Tierheim an, /me enthält art und partner', async () => {
    const shelterLogin = await post('/api/login', { secret: sonnenhangKey }, null)
    assert.equal(shelterLogin.status, 200)
    assert.equal(shelterLogin.data.art, 'tierheim')
    assert.equal(shelterLogin.data.id, sonnenhangFamilyId)
    assert.ok(shelterLogin.data.partner)
    assert.equal(shelterLogin.data.partner.id, sonnenhangPartnerId)
    assert.equal(shelterLogin.data.partner.name, 'Tierheim Sonnenhang')
    assert.ok(shelterLogin.data.partner.slug)

    const shelterCookie = getCookie(shelterLogin.res)
    const me = await call(base, '/api/me', { cookie: shelterCookie })
    assert.equal(me.status, 200)
    assert.equal(me.data.art, 'tierheim')
    assert.ok(me.data.partner)
    assert.equal(me.data.partner.id, sonnenhangPartnerId)

    // Ein Zuhause hat keinen Partner in der Antwort
    const home = await createFamily(base, 'Zuhause ohne Partner', 'zuhause-ohne-partner-1', { art: 'zuhause' })
    const homeMe = await call(base, '/api/me', { cookie: home.cookie })
    assert.equal(homeMe.data.partner, undefined)
  })

  await t.test('Beitreten oder Gründen aus dem Tierheim -> 400 (requireHomeIdentity erlaubt nur zuhause)', async () => {
    const shelterLogin = await post('/api/login', { secret: sonnenhangKey }, null)
    const shelterCookie = getCookie(shelterLogin.res)

    const join = await post('/api/families/join', { password: 'irgendein-pw' }, shelterCookie)
    assert.equal(join.status, 400)

    const group = await post('/api/families/group', { name: 'Neu', password: 'gruppen-pw-shelter1' }, shelterCookie)
    assert.equal(group.status, 400)
  })

  await t.test('Integration: Tier im Tierheim anlegen und über den aktiven Bereich sehen', async () => {
    const shelterLogin = await post('/api/login', { secret: sonnenhangKey }, null)
    const shelterCookie = getCookie(shelterLogin.res)

    const created = await post('/api/dogs', { name: 'Pepper', geschlecht: 'huendin', tierart: 'hund' }, shelterCookie)
    assert.equal(created.status, 201)
    assert.equal(created.data.family_id, sonnenhangFamilyId)

    const dogs = await call(base, '/api/dogs', { cookie: shelterCookie })
    assert.equal(dogs.status, 200)
    assert.ok(dogs.data.some((d) => d.name === 'Pepper'))
  })

  // --- security-review Phase T Finding 13 -----------------------------------------------------------

  await t.test('DELETE /api/admin/partners/:id -> 409, solange für den Partner ein Tierheim-Bereich existiert', async () => {
    // sonnenhangPartnerId hat längst einen Tierheim-Bereich (siehe "Anlegen" oben) und ist außerdem
    // nicht mehr status='entwurf' - beide Gründe würden allein schon blockieren. Ein frischer, noch im
    // Entwurf befindlicher Partner mit Tierheim-Bereich beweist, dass NUR die Shelter-Referenz zählt.
    const draft = await post('/api/admin/partners', samplePartner({ name: 'Entwurf mit Shelter', slug: 'entwurf-mit-shelter', status: 'entwurf' }))
    assert.equal(draft.status, 201)
    const draftShelter = await post(`/api/admin/partners/${draft.data.id}/shelter`)
    assert.equal(draftShelter.status, 201)

    const blocked = await del(`/api/admin/partners/${draft.data.id}`)
    assert.equal(blocked.status, 409)
    assert.match(blocked.data.error, /Tierheim-Bereich/)

    // Der Partner (samt Entwurf-Status) bleibt unangetastet
    const stillThere = await get('/api/admin/partners')
    assert.equal(stillThere.data.some((p) => p.slug === 'entwurf-mit-shelter'), true)
  })

  await t.test('POST /api/admin/partners/:id/shelter/key: erneuert den Zugangsschlüssel, altes Cookie fällt raus', async () => {
    const shelterLoginBefore = await post('/api/login', { secret: sonnenhangKey }, null)
    assert.equal(shelterLoginBefore.status, 200)
    const oldCookie = getCookie(shelterLoginBefore.res)

    const reissued = await post(`/api/admin/partners/${sonnenhangPartnerId}/shelter/key`)
    assert.equal(reissued.status, 200)
    assert.match(reissued.data.key, /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    assert.notEqual(reissued.data.key, sonnenhangKey)

    // Die alte Sitzung fällt raus (auth_epoch), der alte Schlüssel funktioniert nicht mehr
    const oldSessionAfter = await call(base, '/api/me', { cookie: oldCookie })
    assert.equal(oldSessionAfter.status, 401)
    const oldKeyLoginAfter = await post('/api/login', { secret: sonnenhangKey }, null)
    assert.equal(oldKeyLoginAfter.status, 401)

    // Der neue Schlüssel meldet dasselbe Tierheim an
    const newLogin = await post('/api/login', { secret: reissued.data.key }, null)
    assert.equal(newLogin.status, 200)
    assert.equal(newLogin.data.id, sonnenhangFamilyId)

    // Kein Zugriff ohne Admin, unbekannter Partner -> 404
    const family = await createFamily(base, 'Familie Kein Key-Zugriff', 'kein-key-admin-1')
    assert.equal((await post(`/api/admin/partners/${sonnenhangPartnerId}/shelter/key`, undefined, family.cookie)).status, 401)
    assert.equal((await post('/api/admin/partners/999999/shelter/key')).status, 404)
  })

  await t.test('Tierheim-Bereich eines Demo-Partners bekommt selbst is_demo=1', async () => {
    const demoPartner = await post('/api/admin/partners', samplePartner({ name: 'Tierheim Demo Shelter', slug: 'tierheim-demo-shelter' }))
    assert.equal(demoPartner.status, 201)
    const db = require('../db')
    db.prepare('UPDATE partners SET is_demo = 1 WHERE id = ?').run(demoPartner.data.id)

    const shelter = await post(`/api/admin/partners/${demoPartner.data.id}/shelter`)
    assert.equal(shelter.status, 201)

    const family = db.prepare('SELECT is_demo FROM families WHERE id = ?').get(shelter.data.familyId)
    assert.equal(family.is_demo, 1)
  })
})
