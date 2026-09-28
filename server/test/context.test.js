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

  await t.test('1. createFamily(art=zuhause) legt ein Zuhause an, ohne art ein gewöhnliches Rudel', async () => {
    const created = await createFamily(base, 'Zuhause Nele', 'zuhause-pw-1', { art: 'zuhause' })
    assert.equal(created.status, 201)
    assert.equal(created.data.art, 'zuhause')
    assert.equal(created.data.home.id, created.data.id)
    assert.deepEqual(created.data.memberships, [])

    const me = await call(base, '/api/me', { cookie: created.cookie })
    assert.equal(me.data.art, 'zuhause')
    assert.equal(me.data.home.id, created.data.id)
    assert.deepEqual(me.data.memberships, [])

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

  await t.test('9. join mit dem Passwort eines anderen Zuhauses -> 401', async () => {
    const homeA = await createFamily(base, 'Zuhause Nele Zwei', 'zuhause-pw-9a', { art: 'zuhause' })
    const homeB = await createFamily(base, 'Zuhause Mira Zwei', 'zuhause-pw-9b', { art: 'zuhause' })

    const join = await post('/api/families/join', { password: 'zuhause-pw-9b' }, homeA.cookie)
    assert.equal(join.status, 401)
  })

  await t.test('10. klassischer Rudel-Login: /view in ein fremdes Zuhause -> 404', async () => {
    const rudel = await createFamily(base, 'Familie Ostwind', 'rudel-pw-10')
    const login = await post('/api/login', { password: 'rudel-pw-10' })
    const cookie = getCookie(login.res)
    const otherHome = await createFamily(base, 'Zuhause Balu Zwei', 'zuhause-pw-10', { art: 'zuhause' })

    const view = await post('/api/view', { familyId: otherHome.data.id }, cookie)
    assert.equal(view.status, 404)
  })

  await t.test('11. /view lehnt ungültige IDs strikt ab (kein Type-Coercion, auch nicht auf den eigenen Bereich)', async () => {
    const home = await createFamily(base, 'Zuhause Emma Zwei', 'zuhause-pw-11', { art: 'zuhause' })
    const ownId = home.data.id
    // Alles hier würde über Number(...)-Koerzierung auf die eigene (an sich erlaubte) ID zeigen –
    // strikte Prüfung muss trotzdem ablehnen, plus ein paar unabhängig ungültige Werte
    const bad = [true, [ownId], `${ownId}.0`, String(ownId), 'abc', 0, -1]
    for (const value of bad) {
      const res = await post('/api/view', { familyId: value }, home.cookie)
      assert.equal(res.status, 404, `familyId=${JSON.stringify(value)} sollte 404 geben, war ${res.status}`)
    }

    // Die echte, numerische ID funktioniert weiterhin
    const ok = await post('/api/view', { familyId: ownId }, home.cookie)
    assert.equal(ok.status, 200)
  })

  await t.test('12. DELETE /memberships für eine Nicht-Mitgliedschaft -> 404', async () => {
    const home = await createFamily(base, 'Zuhause Luna Zwei', 'zuhause-pw-12', { art: 'zuhause' })
    const foreignRudel = await createFamily(base, 'Familie Fremdling Zwei', 'rudel-pw-12')

    const del = await call(base, `/api/memberships/${foreignRudel.data.id}`, { method: 'DELETE', cookie: home.cookie })
    assert.equal(del.status, 404)
  })

  await t.test('13. eine nicht-aktive Mitgliedschaft löschen lässt den Cookie unangetastet', async () => {
    const home = await createFamily(base, 'Zuhause Hermes Zwei', 'zuhause-pw-13', { art: 'zuhause' })
    const rudelA = await createFamily(base, 'Familie Talblick Zwei', 'rudel-pw-13a')
    const rudelB = await createFamily(base, 'Familie Nordlicht Zwei', 'rudel-pw-13b')
    await post('/api/families/join', { password: 'rudel-pw-13a' }, home.cookie)
    await post('/api/families/join', { password: 'rudel-pw-13b' }, home.cookie)
    // Aktiver Bereich bleibt das Zuhause selbst (kein /view aufgerufen) – rudelB ist gar nicht aktiv
    void rudelB

    const del = await call(base, `/api/memberships/${rudelA.data.id}`, { method: 'DELETE', cookie: home.cookie })
    assert.equal(del.status, 200)
    assert.equal(del.headers.get('set-cookie'), null)
  })

  await t.test('14. group mit bereits vergebenem Passwort -> 409', async () => {
    const home = await createFamily(base, 'Zuhause Nele Drei', 'zuhause-pw-14', { art: 'zuhause' })
    await createFamily(base, 'Familie Irgendwer', 'passwort-belegt-14')

    const group = await post('/api/families/group', { name: 'Neue Gruppe', password: 'passwort-belegt-14' }, home.cookie)
    assert.equal(group.status, 409)
  })

  await t.test('15. canEnter verweigert den Wechsel zwischen Demo und Nicht-Demo, selbst bei Mitgliedschaft', async () => {
    const home = await createFamily(base, 'Zuhause Balu Drei', 'zuhause-pw-15', { art: 'zuhause' })
    const rudel = await createFamily(base, 'Familie Sonnenhang Drei', 'rudel-pw-15')
    // /join würde eine Demo-Gruppe nie zulassen – hier die Mitgliedschaft direkt anlegen und danach
    // die Gruppe zur Demo erklären, um die Verteidigungslinie in canEnter zu prüfen
    db.prepare('INSERT INTO family_members (member_family_id, group_family_id) VALUES (?, ?)').run(home.data.id, rudel.data.id)
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(rudel.data.id)

    const view = await post('/api/view', { familyId: rudel.data.id }, home.cookie)
    assert.equal(view.status, 404)

    const { canEnter } = require('../lib/context')
    assert.equal(canEnter(home.data.id, rudel.data.id), false)
  })

  await t.test('alte Tokens ohne activeFamilyId funktionieren weiterhin', async () => {
    const family = await createFamily(base, 'Familie Alt-Token', 'alt-token-pw-1')
    const oldStyleToken = jwt.sign({ familyId: family.data.id }, config.jwtSecret, { expiresIn: '30d' })
    const res = await call(base, '/api/me', { cookie: `${config.sessionCookie}=${oldStyleToken}` })
    assert.equal(res.status, 200)
    assert.equal(res.data.id, family.data.id)
  })
})
