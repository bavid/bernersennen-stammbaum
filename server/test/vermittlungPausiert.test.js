const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

// Phase P Task 1: Vermittlungsstatus "pausiert" (on hold). Der Steckbrief bleibt öffentlich und behält
// seinen public_slug, das Portal des Tierheims zeigt das Tier mit Status, "Entdecken" nicht; Übergabe-
// Gutscheine gehen weiter nur aus "reserviert". t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-pausiert-1'
const dataDir = useTempDataDir('vermittlung-pausiert', { LOGIN_RATE_LIMIT: '200', CODE_RATE_LIMIT: '200' })

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

test('Vermittlungsstatus pausiert: Steckbrief öffentlich, Portal mit Status, nicht in Entdecken, keine Übergabe', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })

  const partner = (await post('/api/admin/partners', { name: 'Tierheim Kastanienhof', slug: 'tierheim-kastanienhof', typ: 'tierheim', plz: '10115', status: 'aktiv' }, adminCookie)).data
  const area = (await post(`/api/admin/partners/${partner.id}/area`, undefined, adminCookie)).data
  const shelterCookie = getCookie((await post('/api/login', { secret: area.key }, null)).res)
  const household = await createHousehold(base, 'Familie Pausentest')

  async function publishedDog(name, extra = {}) {
    const created = await post('/api/dogs', { name, geschlecht: 'ruede', tierart: 'hund', vermittlungStatus: 'in_vermittlung', ...extra }, shelterCookie)
    assert.equal(created.status, 201)
    const published = await put(`/api/dogs/${created.data.id}/steckbrief`, { published: true }, shelterCookie)
    assert.equal(published.status, 200)
    return published.data
  }

  const photoUrl = await uploadPng(base, shelterCookie)
  const paused = await publishedDog('Wolke', { fotoUrl: photoUrl })
  const available = await publishedDog('Anton')

  await t.test('PUT vermittlungStatus pausiert: erlaubt, public_slug bleibt erhalten', async () => {
    const res = await put(`/api/dogs/${paused.id}`, { vermittlungStatus: 'pausiert' }, shelterCookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.vermittlung_status, 'pausiert')
    assert.equal(res.data.public_slug, paused.public_slug)

    assert.equal((await put(`/api/dogs/${paused.id}`, { vermittlungStatus: 'ausgebucht' }, shelterCookie)).status, 400)
  })

  await t.test('Steckbrief und Titelbild bleiben öffentlich, mit Status', async () => {
    const view = await get(`/api/public/animals/${paused.public_slug}`)
    assert.equal(view.status, 200)
    assert.equal(view.data.name, 'Wolke')
    assert.equal(view.data.vermittlung_status, 'pausiert')
    assert.equal((await fetch(`${base}/public-media/${photoUrl.split('/').pop()}`)).status, 200)
  })

  await t.test('Portal des Tierheims listet pausierte Tiere mit Status, Entdecken nicht', async () => {
    const portalAnimals = await get('/api/public/partners/tierheim-kastanienhof/animals')
    assert.equal(portalAnimals.status, 200)
    const pausedCard = portalAnimals.data.find((card) => card.slug === paused.public_slug)
    assert.ok(pausedCard, 'pausiertes Tier fehlt auf dem Portal')
    assert.equal(pausedCard.vermittlung_status, 'pausiert')
    assert.ok(portalAnimals.data.some((card) => card.slug === available.public_slug))

    const found = await post('/api/discover', {}, household.cookie)
    assert.equal(found.status, 200)
    const slugs = found.data.begleiter.tiere.map((card) => card.slug)
    assert.ok(slugs.includes(available.public_slug), 'verfügbares Tier fehlt in Entdecken')
    assert.ok(!slugs.includes(paused.public_slug), 'pausiertes Tier darf nicht in Entdecken erscheinen')
  })

  await t.test('Veröffentlichen geht auch im Status pausiert', async () => {
    assert.equal((await put(`/api/dogs/${paused.id}/steckbrief`, { published: false }, shelterCookie)).data.public_slug, null)
    const republished = await put(`/api/dogs/${paused.id}/steckbrief`, { published: true }, shelterCookie)
    assert.equal(republished.status, 200)
    assert.ok(republished.data.public_slug)
    paused.public_slug = republished.data.public_slug
  })

  await t.test('Übergabe-Gutschein aus pausiert -> 400, Status bleibt pausiert', async () => {
    const res = await post(`/api/dogs/${paused.id}/handover`, undefined, shelterCookie)
    assert.equal(res.status, 400)
    assert.equal(db.prepare('SELECT vermittlung_status FROM dogs WHERE id = ?').get(paused.id).vermittlung_status, 'pausiert')
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM vouchers WHERE dog_id = ?').get(paused.id).c, 0)
  })

  await t.test('reserviert -> pausiert zieht den offenen Übergabe-Gutschein zurück', async () => {
    const handover = await post(`/api/dogs/${available.id}/handover`, undefined, shelterCookie)
    assert.equal(handover.status, 201)
    assert.equal(db.prepare('SELECT vermittlung_status FROM dogs WHERE id = ?').get(available.id).vermittlung_status, 'reserviert')

    const pausedNow = await put(`/api/dogs/${available.id}`, { vermittlungStatus: 'pausiert' }, shelterCookie)
    assert.equal(pausedNow.status, 200)
    const check = await post('/api/vouchers/check', { code: handover.data.code }, null)
    assert.equal(check.data.status, 'widerrufen')

    // Auch ein (theoretisch) noch offener Gutschein ließe sich aus pausiert nicht einlösen
    const redeem = await post('/api/vouchers/claim', { code: handover.data.code }, household.cookie)
    assert.equal(redeem.status, 410)
  })
})
