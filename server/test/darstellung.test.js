const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

const dataDir = useTempDataDir('darstellung', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })
const ADMIN_TEST_PASSWORD = 'admin-test-darstellung-1'

const STANDARD = { palette: 'terrakotta', modus: 'auto', schrift: 'normal' }

// Calm-down-Runde: Einstellungen „Darstellung“ (lib/darstellung.js, routes/auth.js GET/PUT /api/me/darstellung).
test('Darstellung: je Identität gespeichert, nur Werte aus der Liste, Demo schreibt nie, gilt auch in Familien', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { deleteFamily } = require('../lib/families')

  const home = await createHousehold(base, 'Zuhause Lindenweg')
  const other = await createHousehold(base, 'Zuhause Birkenhof')
  const put = (cookie, body) => call(base, '/api/me/darstellung', { method: 'PUT', cookie, body })
  const get = (cookie) => call(base, '/api/me/darstellung', { cookie })

  await t.test('ohne gespeicherte Wahl die Vorgabe - auch in /api/me', async () => {
    assert.deepEqual((await get(home.cookie)).data, STANDARD)
    assert.deepEqual((await call(base, '/api/me', { cookie: home.cookie })).data.darstellung, STANDARD)
  })

  await t.test('eine Änderung legt sich über die bisherige Wahl und steht danach in /api/me', async () => {
    const first = await put(home.cookie, { palette: 'wald' })
    assert.equal(first.status, 200)
    assert.deepEqual(first.data, { palette: 'wald', modus: 'auto', schrift: 'normal' })
    const second = await put(home.cookie, { modus: 'dunkel', schrift: 'gross' })
    assert.deepEqual(second.data, { palette: 'wald', modus: 'dunkel', schrift: 'gross' })
    assert.deepEqual((await call(base, '/api/me', { cookie: home.cookie })).data.darstellung, second.data)
    // Ein anderes Zuhause bleibt bei seiner eigenen Wahl.
    assert.deepEqual((await get(other.cookie)).data, STANDARD)
  })

  await t.test('nur bekannte Felder und Werte - sonst 400 und nichts geändert', async () => {
    const before = (await get(home.cookie)).data
    for (const body of [
      { palette: 'neon' },
      { palette: 'WALD' },
      { modus: true },
      { schrift: 17 },
      { farbe: 'wald' },
      { palette: 'meer', extra: 1 },
      JSON.parse('{"__proto__": {"palette": "wald"}}'),
      {},
      ['wald']
    ]) {
      const res = await put(home.cookie, body)
      assert.equal(res.status, 400, JSON.stringify(body))
      assert.equal(typeof res.data.error, 'string')
    }
    assert.deepEqual((await get(home.cookie)).data, before)
  })

  await t.test('ohne Sitzung 401', async () => {
    assert.equal((await get('')).status, 401)
    assert.equal((await put('', { palette: 'meer' })).status, 401)
  })

  await t.test('Demo: lesen ja, schreiben nie (403) - gespeichert wird nichts', async () => {
    const demo = await createFamily(base, 'Demo-Rudel', 'demo-passwort-1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demo.data.id)
    const res = await put(demo.cookie, { palette: 'lavendel' })
    assert.equal(res.status, 403)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM home_darstellung WHERE family_id = ?').get(demo.data.id).n, 0)
    assert.deepEqual((await get(demo.cookie)).data, STANDARD)
  })

  await t.test('klassisches Rudel-Login darf, ein Partner-Bereich nicht', async () => {
    const rudel = await createFamily(base, 'Rudel Talblick', 'talblick-passwort')
    assert.equal((await put(rudel.cookie, { palette: 'schiefer' })).status, 200)
    const partner = await createFamily(base, 'Hundeschule Ufer', 'ufer-passwort', { art: 'partner' })
    const res = await put(partner.cookie, { palette: 'schiefer' })
    assert.equal(res.status, 400)
    assert.match(res.data.error, /nur für Zuhause und Familien/)
  })

  await t.test('ein unbekannter Wert in der Datenbank fällt einzeln auf die Vorgabe zurück', async () => {
    db.prepare("UPDATE home_darstellung SET palette = 'verschwunden' WHERE family_id = ?").run(home.data.home.id)
    assert.deepEqual((await get(home.cookie)).data, { palette: 'terrakotta', modus: 'dunkel', schrift: 'gross' })
  })

  await t.test('die Zeile verschwindet mit dem Zuhause', async () => {
    await put(other.cookie, { palette: 'meer' })
    const id = other.data.home.id
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM home_darstellung WHERE family_id = ?').get(id).n, 1)
    deleteFamily(db, id)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM home_darstellung WHERE family_id = ?').get(id).n, 0)
  })

  const member = await createHousehold(base, 'Zuhause Mühlbach')
  const group = await call(base, '/api/families/group', {
    method: 'POST',
    cookie: member.cookie,
    body: { name: 'Familie Mühlbach', password: 'muehlbach-gruppe' }
  })
  const groupId = group.data.memberships[0].id
  await call(base, '/api/me/darstellung', { method: 'PUT', cookie: member.cookie, body: { palette: 'meer' } })

  await t.test('nach dem Wechsel in die Familie bringt /api/view die eigene Darstellung mit', async () => {
    const view = await call(base, '/api/view', { method: 'POST', cookie: member.cookie, body: { familyId: groupId } })
    assert.equal(view.status, 200)
    assert.equal(view.data.id, groupId)
    assert.equal(view.data.darstellung.palette, 'meer')
  })

  await t.test('aus der Familie heraus geändert: gespeichert am eigenen Zuhause, nicht an der Familie', async () => {
    const cookie = member.cookie
    const view = await call(base, '/api/view', { method: 'POST', cookie, body: { familyId: groupId } })
    const groupCookie = (view.headers.get('set-cookie') || '').split(';')[0] || cookie
    const res = await call(base, '/api/me/darstellung', { method: 'PUT', cookie: groupCookie, body: { schrift: 'gross' } })
    assert.equal(res.status, 200)
    const row = (id) => db.prepare('SELECT palette, schrift FROM home_darstellung WHERE family_id = ?').get(id)
    assert.deepEqual(row(member.data.home.id), { palette: 'meer', schrift: 'gross' })
    assert.equal(row(groupId), undefined)
  })

  await t.test('Admin-Ansicht: lesen ja, schreiben nie (403)', async () => {
    const login = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
    const view = await call(base, `/api/admin/view/${home.data.id}`, { method: 'POST', cookie: getCookie(login.res) })
    assert.equal(view.status, 200)
    const viewCookie = getCookie(view.res)
    assert.equal((await get(viewCookie)).status, 200)
    const res = await put(viewCookie, { palette: 'wald' })
    assert.equal(res.status, 403)
    assert.equal((await get(home.cookie)).data.palette, 'terrakotta')
  })

  await t.test('zu Besuch: die eigene Darstellung kommt mit /api/me, ändern geht nur aus der eigenen Chronik', async () => {
    const host = await createHousehold(base, 'Zuhause am Hafen')
    const guest = await createHousehold(base, 'Zuhause im Grünen')
    await put(guest.cookie, { palette: 'lavendel' })
    const invite = await call(base, '/api/besuche/einladungen', { method: 'POST', cookie: host.cookie })
    assert.equal((await call(base, '/api/besuche/einloesen', { method: 'POST', cookie: guest.cookie, body: { code: invite.data.code } })).status, 201)
    const visit = await call(base, '/api/view', { method: 'POST', cookie: guest.cookie, body: { familyId: host.data.id } })
    assert.equal(visit.data.zuBesuch, true)
    assert.equal(visit.data.darstellung.palette, 'lavendel')
    const visitCookie = getCookie(visit.res)
    assert.equal((await get(visitCookie)).status, 403)
    assert.equal((await put(visitCookie, { palette: 'meer' })).status, 403)
    assert.equal((await get(guest.cookie)).data.palette, 'lavendel')
  })
})
