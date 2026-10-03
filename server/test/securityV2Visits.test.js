const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createHousehold, getCookie } = require('./helpers')

const dataDir = useTempDataDir('security-v2-visits', { LOGIN_RATE_LIMIT: '400', CODE_RATE_LIMIT: '400' })

// security-review Phase V2, zweite Runde: neue Gäste sichtbar (M-3), Gast-Kommentare mit echtem Zuhause-Namen (L-4).
test('security-review V2 (Runde 2): Besuche', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })

  const host = await createHousehold(base, 'Zuhause Gastgeber Hinweis')
  const guest = await createHousehold(base, 'Zuhause Möwenweg Hinweis')
  const invite = await post('/api/besuche/einladungen', {}, host.cookie)
  await put(`/api/vouchers/${invite.data.id}/label`, { label: 'Tante Matilde' }, host.cookie)
  assert.equal((await post('/api/besuche/einloesen', { code: invite.data.code }, guest.cookie)).status, 201)

  await t.test('M-3: ein neuer Gast erscheint beim Gastgeber als „neu“, mit der Notiz seines Codes', async () => {
    const me = await get('/api/me', host.cookie)
    assert.equal(me.data.neueGaeste, 1)
    const guests = (await get('/api/besuche', host.cookie)).data.gaeste
    assert.deepEqual(
      guests.map(({ id, name, neu, ueberCode }) => ({ id, name, neu, ueberCode })),
      [{ id: guest.data.id, name: 'Zuhause Möwenweg Hinweis', neu: true, ueberCode: 'Tante Matilde' }]
    )
    // Der Gast selbst bekommt keinen Hinweis und sieht die Notiz nicht
    assert.equal((await get('/api/me', guest.cookie)).data.neueGaeste, 0)
    assert.equal(JSON.stringify((await get('/api/besuche', guest.cookie)).data).includes('Tante Matilde'), false)
  })

  await t.test('M-3: „Passt“ quittiert den Hinweis - nur der Gastgeber, nur einmal', async () => {
    assert.equal((await post(`/api/besuche/gaeste/${host.data.id}/passt`, {}, guest.cookie)).status, 404)
    const res = await post(`/api/besuche/gaeste/${guest.data.id}/passt`, {}, host.cookie)
    assert.equal(res.status, 200)
    assert.equal(res.data.neueGaeste, 0)
    assert.equal((await get('/api/besuche', host.cookie)).data.gaeste[0].neu, false)
    assert.equal((await post(`/api/besuche/gaeste/${guest.data.id}/passt`, {}, host.cookie)).status, 404)
    // zu Besuch geht das nicht (Allow-List)
    const guestView = getCookie((await post('/api/view', { familyId: host.data.id }, guest.cookie)).res)
    assert.equal((await post(`/api/besuche/gaeste/${host.data.id}/passt`, {}, guestView)).status, 403)
  })

  await t.test('M-3: ein über /v eingelöster Besuch ist ebenfalls neu', async () => {
    const second = await post('/api/besuche/einladungen', {}, host.cookie)
    const redeem = await post('/api/vouchers/redeem', { code: second.data.code, name: 'Zuhause Neu per Link' })
    assert.equal(redeem.status, 201)
    const guests = (await get('/api/besuche', host.cookie)).data.gaeste
    assert.equal(guests.find((g) => g.id === redeem.data.id).neu, true)
    assert.equal((await get('/api/me', host.cookie)).data.neueGaeste, 1)
  })

  await t.test('L-4: Kommentare eines Gasts tragen den echten Namen seines Zuhauses', async () => {
    const dog = (await post('/api/dogs', { name: 'Balu', geschlecht: 'ruede' }, host.cookie)).data
    const entry = (await post('/api/timeline', { dogId: dog.id, autorName: 'Gastgeber', datum: '2026-05-01', titel: 'Am Deich' }, host.cookie)).data
    await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Gastgeber', text: 'Von uns' }, host.cookie)
    const guestView = getCookie((await post('/api/view', { familyId: host.data.id }, guest.cookie)).res)
    const created = await post(`/api/timeline/${entry.id}/comments`, { autorName: 'Gastgeber', text: 'Ich tue so, als wäre ich der Gastgeber' }, guestView)
    assert.equal(created.data.gastZuhause, 'Zuhause Möwenweg Hinweis')

    const hostComments = (await get(`/api/timeline?dogId=${dog.id}`, host.cookie)).data[0].comments
    assert.deepEqual(
      hostComments.map((c) => [c.text, c.gastZuhause ?? null]),
      [
        ['Von uns', null],
        ['Ich tue so, als wäre ich der Gastgeber', 'Zuhause Möwenweg Hinweis']
      ]
    )
    const guestComments = (await get(`/api/timeline?dogId=${dog.id}`, guestView)).data[0].comments
    assert.equal(guestComments.find((c) => c.text.startsWith('Ich tue so')).gastZuhause, 'Zuhause Möwenweg Hinweis')
    const updated = await put(`/api/timeline/${entry.id}`, { autorName: 'Gastgeber', datum: '2026-05-01', titel: 'Am Deich' }, host.cookie)
    assert.equal(updated.data.comments.find((c) => c.text.startsWith('Ich tue so')).gastZuhause, 'Zuhause Möwenweg Hinweis')
  })
})
