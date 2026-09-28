const test = require('node:test')
const assert = require('node:assert/strict')
const jwt = require('jsonwebtoken')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// Viele Login/Register-Aufrufe in einer Session: Standard-Rate-Limit (20 / 15 min) grosszügiger setzen
const dataDir = useTempDataDir('context', { LOGIN_RATE_LIMIT: '200' })

test('Meine Chronik als eigener Bereich, Familien beitreten und wechseln', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const config = require('../config')
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })

  await t.test('1. Registrierung mit art=zuhause, ungültige/fehlende art', async () => {
    const created = await createFamily(base, 'Zuhause Nele', 'zuhause-pw-1', { art: 'zuhause' })
    assert.equal(created.status, 201)
    assert.equal(created.data.art, 'zuhause')
    assert.equal(created.data.home.id, created.data.id)
    assert.deepEqual(created.data.memberships, [])

    const me = await call(base, '/api/me', { cookie: created.cookie })
    assert.equal(me.data.art, 'zuhause')
    assert.equal(me.data.home.id, created.data.id)
    assert.deepEqual(me.data.memberships, [])

    const badArt = await post('/api/families', { name: 'X', password: 'irgendwas1', art: 'unsinn' })
    assert.equal(badArt.status, 400)

    const noArt = await createFamily(base, 'Familie Sonnenhang', 'rudel-pw-noart')
    assert.equal(noArt.data.art, 'rudel')
  })

  await t.test('2. Zuhause tritt einem Rudel bei, wechselt, sieht dessen Tiere', async () => {
    const home = await createFamily(base, 'Zuhause Mira', 'zuhause-pw-2', { art: 'zuhause' })
    const rudel = await createFamily(base, 'Familie am Deich', 'rudel-pw-2')

    const dog = await post('/api/dogs', { name: 'Hermes', geschlecht: 'ruede' }, rudel.cookie)
    assert.equal(dog.status, 201)

    const join = await post('/api/families/join', { password: 'rudel-pw-2' }, home.cookie)
    assert.equal(join.status, 200)
    assert.equal(join.data.memberships.length, 1)
    assert.equal(join.data.memberships[0].id, rudel.data.id)

    const view = await post('/api/view', { familyId: rudel.data.id }, home.cookie)
    assert.equal(view.status, 200)
    assert.equal(view.data.id, rudel.data.id)
    assert.equal(view.data.home.id, home.data.id)
    const activeCookie = getCookie(view.res)

    const dogs = await call(base, '/api/dogs', { cookie: activeCookie })
    assert.equal(dogs.status, 200)
    assert.deepEqual(dogs.data.map((d) => d.name), ['Hermes'])
  })

  await t.test('3. POST /view zu einer fremden Familie -> 404, Bereich bleibt', async () => {
    const home = await createFamily(base, 'Zuhause Luna', 'zuhause-pw-3', { art: 'zuhause' })
    const foreign = await createFamily(base, 'Familie Fremdling', 'rudel-pw-3')

    const view = await post('/api/view', { familyId: foreign.data.id }, home.cookie)
    assert.equal(view.status, 404)

    const me = await call(base, '/api/me', { cookie: home.cookie })
    assert.equal(me.data.id, home.data.id)
  })

  await t.test('4. Mitgliedschaft löschen während aktiv -> zurück ins Zuhause, auch mit altem Cookie', async () => {
    const home = await createFamily(base, 'Zuhause Emma', 'zuhause-pw-4', { art: 'zuhause' })
    const rudel = await createFamily(base, 'Familie Talblick', 'rudel-pw-4')
    await post('/api/families/join', { password: 'rudel-pw-4' }, home.cookie)
    const view = await post('/api/view', { familyId: rudel.data.id }, home.cookie)
    const activeCookie = getCookie(view.res)
    assert.equal(view.status, 200)

    const del = await call(base, `/api/memberships/${rudel.data.id}`, { method: 'DELETE', cookie: activeCookie })
    assert.equal(del.status, 200)
    assert.equal(del.data.id, home.data.id)

    const newCookie = getCookie(del.res)
    const meAfter = await call(base, '/api/me', { cookie: newCookie })
    assert.equal(meAfter.data.id, home.data.id)

    // Alter Cookie mit activeFamilyId=rudel: Mitgliedschaft ist weg, fällt auf das Zuhause zurück
    const meOldCookie = await call(base, '/api/me', { cookie: activeCookie })
    assert.equal(meOldCookie.data.id, home.data.id)
  })

  await t.test('5. Login mit Rudel-Passwort (klassisch): join/group verboten', async () => {
    const rudel = await createFamily(base, 'Familie Nordlicht', 'rudel-pw-5')
    const login = await post('/api/login', { password: 'rudel-pw-5' })
    assert.equal(login.status, 200)
    assert.equal(login.data.art, 'rudel')
    assert.equal(login.data.home.id, rudel.data.id)
    const cookie = getCookie(login.res)

    const join = await post('/api/families/join', { password: 'irgendein-pw' }, cookie)
    assert.equal(join.status, 400)

    const group = await post('/api/families/group', { name: 'Neu', password: 'gruppen-pw-5' }, cookie)
    assert.equal(group.status, 400)
  })

  await t.test('6. Demo darf in den eigenen Bereich wechseln, Schreiben bleibt gesperrt', async () => {
    const demoRudel = await createFamily(base, 'Familie Demo', 'demo-pw-6')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoRudel.data.id)

    const demoLogin = await post('/api/demo', undefined)
    assert.equal(demoLogin.status, 200)
    const demoCookie = getCookie(demoLogin.res)

    const view = await post('/api/view', { familyId: demoRudel.data.id }, demoCookie)
    assert.equal(view.status, 200)

    const write = await post('/api/dogs', { name: 'X', geschlecht: 'ruede' }, demoCookie)
    assert.equal(write.status, 403)
  })

  await t.test('7. join mit dem Passwort einer Demo-Familie -> 401', async () => {
    const home = await createFamily(base, 'Zuhause Balu', 'zuhause-pw-7', { art: 'zuhause' })
    const demoRudel = await createFamily(base, 'Familie Demo Zwei', 'demo-pw-7')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoRudel.data.id)

    const join = await post('/api/families/join', { password: 'demo-pw-7' }, home.cookie)
    assert.equal(join.status, 401)
  })

  await t.test('8. group legt ein neues Rudel an (theme standard), Login geht direkt hinein', async () => {
    const home = await createFamily(base, 'Zuhause Hermes', 'zuhause-pw-8', { art: 'zuhause' })

    const group = await post('/api/families/group', { name: 'Familie Sonnenhang Neu', password: 'gruppen-pw-8' }, home.cookie)
    assert.equal(group.status, 201)
    assert.equal(group.data.id, home.data.id)
    const membership = group.data.memberships.find((m) => m.name === 'Familie Sonnenhang Neu')
    assert.ok(membership, 'neue Gruppe steht in den Mitgliedschaften')
    assert.equal(membership.theme, 'standard')

    const login = await post('/api/login', { password: 'gruppen-pw-8' })
    assert.equal(login.status, 200)
    assert.equal(login.data.id, membership.id)
    assert.equal(login.data.theme, 'standard')
  })

  await t.test('alte Tokens ohne activeFamilyId funktionieren weiterhin', async () => {
    const family = await createFamily(base, 'Familie Alt-Token', 'alt-token-pw-1')
    const oldStyleToken = jwt.sign({ familyId: family.data.id }, config.jwtSecret, { expiresIn: '30d' })
    const res = await call(base, '/api/me', { cookie: `${config.sessionCookie}=${oldStyleToken}` })
    assert.equal(res.status, 200)
    assert.equal(res.data.id, family.data.id)
  })
})
