const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')

// Phase W (Ruhige Hülle): der Client schickt mit jeder API-Anfrage den Bereich, den er gerade zeigt (X-Bereich). Weicht
// er vom aktiven Bereich der Sitzung ab (zweiter Tab hat gewechselt), antwortet requireSession mit 409 {code:'BEREICH'} -
// der Header kann nur ablehnen, nie Zugriff erweitern. /me, /view, /logout und die Einlöse-Wege bleiben frei.
const dataDir = useTempDataDir('area-header', { LOGIN_RATE_LIMIT: '200' })

async function send(base, urlPath, { method = 'GET', body, cookie, bereich } = {}) {
  const headers = {}
  if (cookie) headers.Cookie = cookie
  if (bereich !== undefined) headers['X-Bereich'] = String(bereich)
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${base}${urlPath}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : null, res }
}

test('X-Bereich: Abweichung vom aktiven Bereich -> 409, nie mehr Zugriff', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const home = await createFamily(base, 'Zuhause Lindenhof', 'zuhause-pw-area', { art: 'zuhause' })
  const group = await createFamily(base, 'Familie Sonnenhang', 'rudel-pw-area')
  const stranger = await createFamily(base, 'Familie Fremdling', 'rudel-pw-fremd')
  const homeId = home.data.id
  const groupId = group.data.id
  await call(base, '/api/families/join', { method: 'POST', body: { password: 'rudel-pw-area' }, cookie: home.cookie })
  const strangerDog = await call(base, '/api/dogs', { method: 'POST', body: { name: 'Fremdi', geschlecht: 'ruede' }, cookie: stranger.cookie })
  assert.equal(strangerDog.status, 201)

  await t.test('ohne Header bleibt alles wie bisher', async () => {
    assert.equal((await send(base, '/api/dogs', { cookie: home.cookie })).status, 200)
  })

  await t.test('passender Header -> 200', async () => {
    assert.equal((await send(base, '/api/dogs', { cookie: home.cookie, bereich: homeId })).status, 200)
  })

  await t.test('abweichender Header -> 409 mit code BEREICH, auch beim Schreiben', async () => {
    const read = await send(base, '/api/dogs', { cookie: home.cookie, bereich: groupId })
    assert.equal(read.status, 409)
    assert.equal(read.data.code, 'BEREICH')
    assert.match(read.data.error, /Bereich/)

    const write = await send(base, '/api/dogs', { method: 'POST', body: { name: 'Nele', geschlecht: 'huendin' }, cookie: home.cookie, bereich: groupId })
    assert.equal(write.status, 409)
    const dogs = await send(base, '/api/dogs', { cookie: home.cookie })
    assert.equal(dogs.data.some((dog) => dog.name === 'Nele'), false)
  })

  await t.test('kaputter Header zählt als Abweichung', async () => {
    for (const value of ['abc', '1.0', '-3', '0x1', '0', `${homeId},${groupId}`]) {
      assert.equal((await send(base, '/api/dogs', { cookie: home.cookie, bereich: value })).status, 409, value)
    }
  })

  await t.test('der Header erweitert nie den Zugriff: ein fremder Bereich bleibt zu', async () => {
    const res = await send(base, `/api/dogs/${strangerDog.data.id}`, { cookie: home.cookie, bereich: stranger.data.id })
    assert.equal(res.status, 409)
    const plain = await send(base, `/api/dogs/${strangerDog.data.id}`, { cookie: home.cookie, bereich: homeId })
    assert.equal(plain.status, 404)
  })

  await t.test('befreite Pfade auch mit Schrägstrich am Ende, anderer Schreibweise oder Query', async () => {
    for (const urlPath of ['/api/me/', '/api/ME', '/api/me?frisch=1']) {
      assert.equal((await send(base, urlPath, { cookie: home.cookie, bereich: groupId })).status, 200, urlPath)
    }
  })

  await t.test('doppelter Header zählt als Abweichung', async () => {
    const headers = new Headers({ Cookie: home.cookie })
    headers.append('X-Bereich', String(homeId))
    headers.append('X-Bereich', String(homeId))
    const res = await fetch(`${base}/api/dogs`, { headers })
    assert.equal(res.status, 409)
  })

  await t.test('/me, /view und /logout prüfen den Header nicht', async () => {
    const me = await send(base, '/api/me', { cookie: home.cookie, bereich: groupId })
    assert.equal(me.status, 200)
    assert.equal(me.data.id, homeId)

    const view = await send(base, '/api/view', { method: 'POST', body: { familyId: groupId }, cookie: home.cookie, bereich: homeId })
    assert.equal(view.status, 200)
    const inGroup = getCookie(view.res)
    assert.equal((await send(base, '/api/dogs', { cookie: inGroup, bereich: groupId })).status, 200)
    assert.equal((await send(base, '/api/dogs', { cookie: inGroup, bereich: homeId })).status, 409)

    assert.equal((await send(base, '/api/logout', { method: 'POST', cookie: inGroup, bereich: homeId })).status, 204)
  })

  await t.test('ohne Sitzung bleibt es bei 401', async () => {
    assert.equal((await send(base, '/api/dogs', { bereich: homeId })).status, 401)
  })

  await t.test('Besuch: der besuchte Bereich zählt, Abweichung -> 409 statt 403', async () => {
    const host = await createHousehold(base, 'Zuhause Möwenweg')
    const guest = await createHousehold(base, 'Zuhause Kiefernweg')
    const invite = await call(base, '/api/besuche/einladungen', { method: 'POST', body: {}, cookie: host.cookie })
    const redeem = await call(base, '/api/besuche/einloesen', { method: 'POST', body: { code: invite.data.code }, cookie: guest.cookie })
    assert.equal(redeem.status, 201)
    const hostId = redeem.data.gastgeber.id
    const guestHomeId = redeem.data.me.home.id

    const view = await send(base, '/api/view', { method: 'POST', body: { familyId: hostId }, cookie: guest.cookie })
    assert.equal(view.data.zuBesuch, true)
    const visiting = getCookie(view.res)
    assert.equal((await send(base, '/api/dogs', { cookie: visiting, bereich: hostId })).status, 200)
    const stale = await send(base, '/api/notes', { method: 'POST', body: { text: 'Hallo' }, cookie: visiting, bereich: guestHomeId })
    assert.equal(stale.status, 409)
    assert.equal(stale.data.code, 'BEREICH')
    // Mit passendem Header bleibt die Besuchs-Sperre unverändert
    assert.equal((await send(base, '/api/notes', { method: 'POST', body: { text: 'Hallo' }, cookie: visiting, bereich: hostId })).status, 403)
  })
})
