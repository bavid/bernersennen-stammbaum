const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Viele Login/Gutschein-Aufrufe in einer Session: Standard-Limits (20 / 15 min) grosszügiger setzen,
// wie in vouchers.test.js/context.test.js.
const dataDir = useTempDataDir('access', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

test('Benutzer, Wiederherstellung per Schlüssel, Schlüssel erneuern, Einladungscode entfällt', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const del = (urlPath, body, cookie) => call(base, urlPath, { method: 'DELETE', body, cookie })

  await t.test('POST /api/families gibt es nicht mehr', async () => {
    const res = await post('/api/families', { name: 'X', password: 'irgendwas1' })
    assert.equal(res.status, 404)
  })

  await t.test('GET /api/config enthält kein inviteRequired mehr', async () => {
    const res = await call(base, '/api/config')
    assert.equal(res.status, 200)
    assert.equal('inviteRequired' in res.data, false)
  })

  await t.test('GET /api/invite gibt es nicht mehr', async () => {
    const household = await createHousehold(base, 'Zuhause Config')
    const res = await call(base, '/api/invite', { cookie: household.cookie })
    assert.equal(res.status, 404)
  })

  await t.test('Benutzer-Login: richtig, falscher Benutzername, falsches Passwort -> immer dieselbe 401', async () => {
    const household = await createHousehold(base, 'Zuhause Login', { username: 'nele-login', password: 'geheim1234' })

    const ok = await post('/api/login', { username: 'nele-login', password: 'geheim1234' })
    assert.equal(ok.status, 200)
    assert.equal(ok.data.id, household.data.id)
    assert.equal(ok.data.art, 'zuhause')

    const wrongUser = await post('/api/login', { username: 'unbekannt-login', password: 'geheim1234' })
    assert.equal(wrongUser.status, 401)

    const wrongPassword = await post('/api/login', { username: 'nele-login', password: 'falsches-pw' })
    assert.equal(wrongPassword.status, 401)
    assert.equal(wrongPassword.data.error, wrongUser.data.error)
  })

  await t.test('Benutzer anlegen, auflisten, löschen; Benutzername (unabhängig von Groß/Kleinschreibung) schon vergeben', async () => {
    const household = await createHousehold(base, 'Zuhause Benutzer')

    const created = await post(
      '/api/users',
      { username: 'mira-neu', password: 'geheim1234', email: 'mira@example.com', currentKey: household.key },
      household.cookie
    )
    assert.equal(created.status, 201)
    assert.equal(created.data.username, 'mira-neu')
    assert.equal(created.data.email, 'mira@example.com')

    const list = await call(base, '/api/users', { cookie: household.cookie })
    assert.equal(list.status, 200)
    assert.equal(list.data.length, 1)
    assert.equal(list.data[0].id, created.data.id)

    const taken = await post(
      '/api/users',
      { username: 'MIRA-NEU', password: 'anderespw1', currentKey: household.key },
      household.cookie
    )
    assert.equal(taken.status, 409)

    const removed = await del(`/api/users/${created.data.id}`, { currentKey: household.key }, household.cookie)
    assert.equal(removed.status, 204)

    const listAfter = await call(base, '/api/users', { cookie: household.cookie })
    assert.deepEqual(listAfter.data, [])

    const removeAgain = await del(`/api/users/${created.data.id}`, { currentKey: household.key }, household.cookie)
    assert.equal(removeAgain.status, 404)
  })

  await t.test('Passwort beim Anlegen eines Benutzers: höchstens 72 Byte', async () => {
    const household = await createHousehold(base, 'Zuhause Passwortlaenge')
    const res = await post(
      '/api/users',
      { username: 'lang-user', password: 'a'.repeat(73), currentKey: household.key },
      household.cookie
    )
    assert.equal(res.status, 400)
    assert.match(res.data.error, /zu lang/)
  })

  await t.test('Wiederherstellung per Schlüssel: neues Passwort klappt, alte Sitzung des Benutzers -> 401', async () => {
    const household = await createHousehold(base, 'Zuhause Wiederherstellen', { username: 'nele-recover', password: 'altes-pw-1' })
    const oldLogin = await post('/api/login', { username: 'nele-recover', password: 'altes-pw-1' })
    assert.equal(oldLogin.status, 200)
    const oldCookie = getCookie(oldLogin.res)

    const recovered = await post('/api/recover', { code: household.key, username: 'nele-recover', newPassword: 'neues-pw-12' })
    assert.equal(recovered.status, 204)

    const meWithOldSession = await call(base, '/api/me', { cookie: oldCookie })
    assert.equal(meWithOldSession.status, 401)

    const loginOldPassword = await post('/api/login', { username: 'nele-recover', password: 'altes-pw-1' })
    assert.equal(loginOldPassword.status, 401)

    const loginNewPassword = await post('/api/login', { username: 'nele-recover', password: 'neues-pw-12' })
    assert.equal(loginNewPassword.status, 200)
  })

  await t.test('Wiederherstellung: falscher Schlüssel oder falscher Benutzername -> immer dieselbe Meldung', async () => {
    const household = await createHousehold(base, 'Zuhause Wiederherstellen Zwei', { username: 'mira-recover', password: 'irgendein-pw-1' })

    const wrongCode = await post('/api/recover', { code: 'ZZZZ-ZZZZ-ZZZZ', username: 'mira-recover', newPassword: 'neues-pw-123' })
    assert.equal(wrongCode.status, 400)

    const wrongUsername = await post('/api/recover', { code: household.key, username: 'unbekannt-recover', newPassword: 'neues-pw-123' })
    assert.equal(wrongUsername.status, 400)
    assert.equal(wrongUsername.data.error, wrongCode.data.error)

    // Der Schlüssel eines ANDEREN Benutzers/Zuhauses passt nicht zum hier gemeinten Benutzernamen
    const otherHousehold = await createHousehold(base, 'Zuhause Wiederherstellen Fremd', { username: 'fremd-recover', password: 'irgendein-pw-2' })
    const mismatched = await post('/api/recover', { code: otherHousehold.key, username: 'mira-recover', newPassword: 'neues-pw-123' })
    assert.equal(mismatched.status, 400)
    assert.equal(mismatched.data.error, wrongCode.data.error)
  })

  await t.test('Wiederherstellung: neues Passwort mindestens 8 Zeichen, höchstens 72 Byte', async () => {
    const household = await createHousehold(base, 'Zuhause Wiederherstellen Drei', { username: 'balu-recover', password: 'irgendein-pw-3' })

    const tooShort = await post('/api/recover', { code: household.key, username: 'balu-recover', newPassword: 'kurz' })
    assert.equal(tooShort.status, 400)

    const tooLong = await post('/api/recover', { code: household.key, username: 'balu-recover', newPassword: 'a'.repeat(73) })
    assert.equal(tooLong.status, 400)
    assert.match(tooLong.data.error, /zu lang/)
  })

  await t.test('Schlüssel erneuern: alter Schlüssel -> 401, neuer klappt, ein zweites Gerät -> 401, eigene Sitzung bleibt', async () => {
    const household = await createHousehold(base, 'Zuhause Erneuern')

    // "zweites Gerät": separat mit dem noch alten Schlüssel angemeldet, bevor erneuert wird
    const secondDeviceLogin = await post('/api/login', { secret: household.key })
    assert.equal(secondDeviceLogin.status, 200)
    const secondDeviceCookie = getCookie(secondDeviceLogin.res)

    const renewed = await post('/api/family/key', { currentKey: household.key }, household.cookie)
    assert.equal(renewed.status, 200)
    assert.ok(renewed.data.key)
    assert.notEqual(renewed.data.key, household.key)
    const renewedCookie = getCookie(renewed.res)

    const oldKeyLogin = await post('/api/login', { secret: household.key })
    assert.equal(oldKeyLogin.status, 401)

    const newKeyLogin = await post('/api/login', { secret: renewed.data.key })
    assert.equal(newKeyLogin.status, 200)

    const secondDeviceAfter = await call(base, '/api/me', { cookie: secondDeviceCookie })
    assert.equal(secondDeviceAfter.status, 401)

    const ownSessionAfter = await call(base, '/api/me', { cookie: renewedCookie })
    assert.equal(ownSessionAfter.status, 200)
  })

  await t.test('Schlüssel erneuern: nur im eigenen Bereich, nicht während man in einem beigetretenen Rudel unterwegs ist', async () => {
    const rudel = await createFamily(base, 'Familie Erneuern-Rudel', 'erneuern-rudel-pw1')
    const household = await createHousehold(base, 'Zuhause Erneuern Zwei')
    await post('/api/families/join', { password: 'erneuern-rudel-pw1' }, household.cookie)

    const view = await post('/api/view', { familyId: rudel.data.id }, household.cookie)
    assert.equal(view.status, 200)
    const asRudelCookie = getCookie(view.res)

    const renew = await post('/api/family/key', undefined, asRudelCookie)
    assert.equal(renew.status, 400)
  })

  await t.test('Demo darf weder Schlüssel erneuern noch Benutzer anlegen', async () => {
    const rudel = await createFamily(base, 'Familie Demo Zugang', 'demo-zugang-pw1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(rudel.data.id)
    const demoLogin = await post('/api/demo')
    const demoCookie = getCookie(demoLogin.res)

    const renew = await post('/api/family/key', undefined, demoCookie)
    assert.equal(renew.status, 403)

    const addUser = await post('/api/users', { username: 'demo-user', password: 'geheim1234' }, demoCookie)
    assert.equal(addUser.status, 403)
  })

  await t.test('I2: ein Bereichswechsel per /view behält den Benutzer-Login - /recover beendet trotzdem die Sitzung', async () => {
    const rudel = await createFamily(base, 'Familie Wechsel-Rudel', 'wechsel-rudel-pw1')
    const household = await createHousehold(base, 'Zuhause Wechsel', { username: 'nele-wechsel', password: 'wechsel-pw-12' })
    await post('/api/families/join', { password: 'wechsel-rudel-pw1' }, household.cookie)

    const userLogin = await post('/api/login', { username: 'nele-wechsel', password: 'wechsel-pw-12' })
    assert.equal(userLogin.status, 200)

    const view = await post('/api/view', { familyId: rudel.data.id }, getCookie(userLogin.res))
    assert.equal(view.status, 200)
    assert.equal(view.data.id, rudel.data.id)
    const cookieAfterView = getCookie(view.res)

    // Immer noch als Benutzer nele-wechsel eingeloggt, nur der aktive Bereich hat sich geändert -
    // ein /recover für genau diesen Benutzer muss die Sitzung trotzdem beenden.
    const afterReset = await post('/api/recover', { code: household.key, username: 'nele-wechsel', newPassword: 'wechsel-pw-neu-1' })
    assert.equal(afterReset.status, 204)

    const meAfterReset = await call(base, '/api/me', { cookie: cookieAfterView })
    assert.equal(meAfterReset.status, 401)
  })

  await t.test('I2: einen Benutzer löschen beendet dessen Sitzung', async () => {
    const household = await createHousehold(base, 'Zuhause Loeschen-Sitzung', { username: 'mira-loeschen', password: 'loeschen-pw-12' })
    const userLogin = await post('/api/login', { username: 'mira-loeschen', password: 'loeschen-pw-12' })
    assert.equal(userLogin.status, 200)
    const userCookie = getCookie(userLogin.res)
    const userId = db.prepare('SELECT id FROM users WHERE username = ?').get('mira-loeschen').id

    const removed = await del(`/api/users/${userId}`, { currentKey: household.key }, household.cookie)
    assert.equal(removed.status, 204)

    const meAfter = await call(base, '/api/me', { cookie: userCookie })
    assert.equal(meAfter.status, 401)
  })

  // Sicherheits-Nachbesserung: /family/key, POST /users und DELETE /users/:id verlangten vorher nur
  // eine gültige Sitzung - eine Sitzung allein (z. B. ein Benutzer-Login, der den Bereichs-Schlüssel gar
  // nicht kennt) durfte damit einen neuen Schlüssel erzeugen und jede andere Sitzung der Identität
  // aussperren ("Übernahme"). Jetzt ist ein aktueller Nachweis Pflicht: Schlüssel-Sitzung -> currentKey,
  // Benutzer-Sitzung -> das eigene Passwort (der Schlüssel selbst zählt für sie NICHT).
  await t.test('Schlüssel erneuern: ohne/mit falschem Nachweis -> 403, Schlüssel-Sitzung nur mit currentKey, Benutzer-Sitzung nur mit eigenem Passwort', async () => {
    const household = await createHousehold(base, 'Zuhause Nachweis-Schluessel')

    const noProof = await post('/api/family/key', undefined, household.cookie)
    assert.equal(noProof.status, 403)
    assert.equal(noProof.data.error, 'Bitte bestätige mit deinem aktuellen Schlüssel bzw. Passwort.')

    const wrongKey = await post('/api/family/key', { currentKey: 'ZZZZ-ZZZZ-ZZZZ' }, household.cookie)
    assert.equal(wrongKey.status, 403)

    const withKey = await post('/api/family/key', { currentKey: household.key }, household.cookie)
    assert.equal(withKey.status, 200)
    assert.ok(withKey.data.key)
    assert.notEqual(withKey.data.key, household.key)

    // Übernahme-Szenario aus dem Review: eine Benutzer-Sitzung kennt den Schlüssel nicht zwangsläufig -
    // und selbst wenn sie ihn kennt, zählt er für sie nicht als Nachweis, nur ihr eigenes Passwort.
    const userHousehold = await createHousehold(base, 'Zuhause Nachweis-Benutzer', {
      username: 'nachweis-user',
      password: 'nachweis-pw-1'
    })
    const userLogin = await post('/api/login', { username: 'nachweis-user', password: 'nachweis-pw-1' })
    assert.equal(userLogin.status, 200)
    const userCookie = getCookie(userLogin.res)

    const takeoverNoProof = await post('/api/family/key', undefined, userCookie)
    assert.equal(takeoverNoProof.status, 403)
    assert.equal(takeoverNoProof.data.error, 'Bitte bestätige mit deinem aktuellen Schlüssel bzw. Passwort.')

    const takeoverWithKey = await post('/api/family/key', { currentKey: userHousehold.key }, userCookie)
    assert.equal(takeoverWithKey.status, 403, 'der Schlüssel selbst genügt einer Benutzer-Sitzung nicht')

    const wrongPassword = await post('/api/family/key', { password: 'falsches-pw' }, userCookie)
    assert.equal(wrongPassword.status, 403)

    const withPassword = await post('/api/family/key', { password: 'nachweis-pw-1' }, userCookie)
    assert.equal(withPassword.status, 200)
    assert.ok(withPassword.data.key)
  })

  await t.test('POST/DELETE /users: verlangen ebenfalls einen aktuellen Nachweis (Schlüssel- und Benutzer-Sitzung)', async () => {
    const household = await createHousehold(base, 'Zuhause Nachweis-Benutzeranlegen')

    const noProof = await post('/api/users', { username: 'ohne-nachweis', password: 'geheim1234' }, household.cookie)
    assert.equal(noProof.status, 403)
    assert.equal(noProof.data.error, 'Bitte bestätige mit deinem aktuellen Schlüssel bzw. Passwort.')

    const created = await post(
      '/api/users',
      { username: 'mit-nachweis', password: 'geheim1234', currentKey: household.key },
      household.cookie
    )
    assert.equal(created.status, 201)

    const deleteNoProof = await del(`/api/users/${created.data.id}`, undefined, household.cookie)
    assert.equal(deleteNoProof.status, 403)

    const deleteWrongProof = await del(`/api/users/${created.data.id}`, { currentKey: 'ZZZZ-ZZZZ-ZZZZ' }, household.cookie)
    assert.equal(deleteWrongProof.status, 403)

    const deleteWithProof = await del(`/api/users/${created.data.id}`, { currentKey: household.key }, household.cookie)
    assert.equal(deleteWithProof.status, 204)

    // Benutzer-Sitzung: ihr eigenes Passwort ist der Nachweis, nicht der Bereichs-Schlüssel
    const userHousehold = await createHousehold(base, 'Zuhause Nachweis-Benutzeranlegen Zwei', {
      username: 'nachweis-anlegen',
      password: 'nachweis-anlegen-1'
    })
    const userLogin = await post('/api/login', { username: 'nachweis-anlegen', password: 'nachweis-anlegen-1' })
    assert.equal(userLogin.status, 200)
    const userCookie = getCookie(userLogin.res)

    const createdByUser = await post('/api/users', { username: 'zweiter-user', password: 'geheim1234' }, userCookie)
    assert.equal(createdByUser.status, 403, 'ohne das eigene Passwort kein neuer Benutzer')

    // Das neue Passwort des ANZULEGENDEN Benutzers und der NACHWEIS für die eigene Sitzung sind zwei
    // verschiedene Felder mit demselben Namen "password" - deckungsgleich mit dem Review: die Route
    // liest den Nachweis aus dem Body, bevor sie username/password des neuen Benutzers validiert.
    const createdByUserOk = await post(
      '/api/users',
      { username: 'zweiter-user', password: 'nachweis-anlegen-1' },
      userCookie
    )
    assert.equal(createdByUserOk.status, 201)
    assert.equal(createdByUserOk.data.username, 'zweiter-user')
  })

  await t.test('auth-Feld in buildMe beschreibt die aktuelle Sitzung (kind + username)', async () => {
    const legacyRudel = await createFamily(base, 'Familie Auth-Feld Legacy', 'auth-feld-legacy-pw1')
    assert.equal(legacyRudel.data.auth.kind, 'legacy')

    const household = await createHousehold(base, 'Zuhause Auth-Feld', { username: 'auth-feld-user', password: 'auth-feld-pw-1' })
    assert.equal(household.data.auth.kind, 'key')

    const userLogin = await post('/api/login', { username: 'auth-feld-user', password: 'auth-feld-pw-1' })
    assert.equal(userLogin.status, 200)
    assert.equal(userLogin.data.auth.kind, 'user')
    assert.equal(userLogin.data.auth.username, 'auth-feld-user')

    const me = await call(base, '/api/me', { cookie: getCookie(userLogin.res) })
    assert.equal(me.data.auth.kind, 'user')
    assert.equal(me.data.auth.username, 'auth-feld-user')
  })
})
