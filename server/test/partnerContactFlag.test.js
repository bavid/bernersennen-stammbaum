const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

// Phase P2 Task 9 (Client-Integration): "Schreib uns" - kontaktformular auf dem Portal (buildPortal, auch in der
// Kundensicht) und im shelter-Objekt des Steckbriefs (buildSteckbrief, auch in der Kundensicht). true genau
// dann, wenn POST /api/public/partners/:slug/contact eine Nachricht annähme; Demo-Partner: false plus
// kontaktformularDemo: true (die Anfrage bekäme 403). Jeder Fall wird gegen die echte Anfrage gegengeprüft.
// t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-partner-contact-flag-1'
const dataDir = useTempDataDir('partner-contact-flag', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300', CONTACT_RATE_LIMIT: '500' })

const PORTAL_TEXT = 'Kleine Gruppen, viel Geduld und jede Menge Leckerli – so arbeiten wir mit euren Tieren.'
const MESSAGE = { email: 'anfrage@example.org', nachricht: 'Habt ihr diese Woche noch einen Termin frei?' }

test('kontaktformular: Portal und Steckbrief sagen, ob "Schreib uns" eine Nachricht annimmt', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })

  const portal = async (slug, cookie) => {
    const res = await get(`/api/public/partners/${slug}`, cookie)
    assert.equal(res.status, 200)
    return res.data
  }
  const contactStatus = async (slug) => (await post(`/api/public/partners/${slug}/contact`, MESSAGE)).status
  const flags = (data) => ({ kontaktformular: data.kontaktformular, kontaktformularDemo: data.kontaktformularDemo })
  const OPEN = { kontaktformular: true, kontaktformularDemo: undefined }
  const CLOSED = { kontaktformular: false, kontaktformularDemo: undefined }
  const DEMO = { kontaktformular: false, kontaktformularDemo: true }

  let counter = 0
  async function createPartner(overrides = {}, { withArea = true } = {}) {
    counter += 1
    const input = { name: `Flag Partner ${counter}`, slug: `flag-partner-${counter}`, typ: 'hundeschule', plz: '10115', portalText: PORTAL_TEXT, status: 'aktiv', ...overrides }
    const partner = await post('/api/admin/partners', input, adminCookie)
    assert.equal(partner.status, 201)
    if (!withArea) return { partner: partner.data }
    const area = await post(`/api/admin/partners/${partner.data.id}/area`, undefined, adminCookie)
    assert.equal(area.status, 201)
    const login = await post('/api/login', { secret: area.data.key })
    return { partner: partner.data, cookie: getCookie(login.res) }
  }
  const setPartner = (id, column, value) => db.prepare(`UPDATE partners SET ${column} = ? WHERE id = ?`).run(value, id)

  async function publishDog(cookie, name) {
    const dog = await post('/api/dogs', { name, geschlecht: 'huendin', tierart: 'hund', vermittlungStatus: 'in_vermittlung' }, cookie)
    assert.equal(dog.status, 201)
    const steckbrief = await put(`/api/dogs/${dog.data.id}/steckbrief`, { published: true }, cookie)
    assert.equal(steckbrief.status, 200)
    return { id: dog.data.id, slug: steckbrief.data.public_slug }
  }

  await t.test('Portal: öffentlich, Kontaktformular an, mit Bereich -> true, und die Anfrage geht durch', async () => {
    const { partner } = await createPartner()
    assert.deepEqual(flags(await portal(partner.slug)), OPEN)
    assert.equal(await contactStatus(partner.slug), 201)
  })

  await t.test('Portal: Kontaktformular aus oder kein Bereich -> false, die Anfrage bekommt 404', async () => {
    const formOff = await createPartner({ kontaktformularAktiv: false })
    assert.deepEqual(flags(await portal(formOff.partner.slug)), CLOSED)
    assert.equal(await contactStatus(formOff.partner.slug), 404)

    const noArea = await createPartner({}, { withArea: false })
    assert.deepEqual(flags(await portal(noArea.partner.slug)), CLOSED)
    assert.equal(await contactStatus(noArea.partner.slug), 404)
  })

  await t.test('Portal: Demo-Partner -> false plus kontaktformularDemo, die Anfrage bekommt 403; mit Formular aus nur false', async () => {
    const demo = await createPartner()
    setPartner(demo.partner.id, 'is_demo', 1)
    assert.deepEqual(flags(await portal(demo.partner.slug)), DEMO)
    assert.equal(await contactStatus(demo.partner.slug), 403)

    setPartner(demo.partner.id, 'kontaktformular_aktiv', 0)
    assert.deepEqual(flags(await portal(demo.partner.slug)), CLOSED)
    assert.equal(await contactStatus(demo.partner.slug), 404)

    const demoNoArea = await createPartner({}, { withArea: false })
    setPartner(demoNoArea.partner.id, 'is_demo', 1)
    assert.deepEqual(flags(await portal(demoNoArea.partner.slug)), CLOSED)
  })

  await t.test('Portal-Vorschau des Admins (Entwurf, pausiert, gesperrt) -> false, die Anfrage bekommt 404', async () => {
    const draft = await createPartner({ status: 'entwurf' })
    const paused = await createPartner({ status: 'pausiert' })
    const locked = await createPartner()
    setPartner(locked.partner.id, 'gesperrt', 1)
    for (const { partner } of [draft, paused, locked]) {
      const data = await portal(partner.slug, adminCookie)
      assert.equal(data.preview, true)
      assert.deepEqual(flags(data), CLOSED, partner.slug)
      assert.equal(await contactStatus(partner.slug), 404)
    }
  })

  await t.test('Kundensicht Portal: zählt nur Kontaktformular und Bereich - auch als Entwurf true; Demo wie oben', async () => {
    const draft = await createPartner({ status: 'entwurf' })
    const preview = async (cookie) => {
      const res = await get('/api/partner-area/preview/portal', cookie)
      assert.equal(res.status, 200)
      return res.data
    }
    assert.deepEqual(flags(await preview(draft.cookie)), OPEN)

    setPartner(draft.partner.id, 'kontaktformular_aktiv', 0)
    assert.deepEqual(flags(await preview(draft.cookie)), CLOSED)

    const demo = await createPartner({ status: 'entwurf' })
    setPartner(demo.partner.id, 'is_demo', 1)
    assert.deepEqual(flags(await preview(demo.cookie)), DEMO)
  })

  await t.test('Steckbrief: shelter.kontaktformular wie auf dem Portal, die Anfrage zum Tier geht durch', async () => {
    const shelter = await createPartner({ typ: 'tierheim' })
    const dog = await publishDog(shelter.cookie, 'Frieda')
    const steckbrief = async () => {
      const res = await get(`/api/public/animals/${dog.slug}`)
      assert.equal(res.status, 200)
      return res.data.shelter
    }
    assert.deepEqual(flags(await steckbrief()), OPEN)
    assert.equal((await post(`/api/public/partners/${shelter.partner.slug}/contact`, { ...MESSAGE, bezugSlug: dog.slug })).status, 201)

    setPartner(shelter.partner.id, 'kontaktformular_aktiv', 0)
    assert.deepEqual(flags(await steckbrief()), CLOSED)
    assert.equal(await contactStatus(shelter.partner.slug), 404)

    setPartner(shelter.partner.id, 'kontaktformular_aktiv', 1)
    setPartner(shelter.partner.id, 'is_demo', 1)
    assert.deepEqual(flags(await steckbrief()), DEMO)
    assert.equal(await contactStatus(shelter.partner.slug), 403)
  })

  await t.test('Kundensicht Steckbrief: auch als Entwurf true, mit Formular aus false', async () => {
    const shelter = await createPartner({ typ: 'tierheim', status: 'entwurf' })
    const dog = await post('/api/dogs', { name: 'Knut', geschlecht: 'ruede', tierart: 'hund', vermittlungStatus: 'in_vermittlung' }, shelter.cookie)
    assert.equal(dog.status, 201)
    const preview = async () => {
      const res = await get(`/api/partner-area/preview/animals/${dog.data.id}`, shelter.cookie)
      assert.equal(res.status, 200)
      return res.data.shelter
    }
    assert.deepEqual(flags(await preview()), OPEN)
    assert.equal(await contactStatus(shelter.partner.slug), 404, 'öffentlich nimmt der Entwurf noch nichts an')

    setPartner(shelter.partner.id, 'kontaktformular_aktiv', 0)
    assert.deepEqual(flags(await preview()), CLOSED)
  })
})
