const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, getCookie } = require('./helpers')

const dataDir = useTempDataDir('demo-familienbande', { APP_ENV: 'staging' })

// Phase V3: die Familienbande im Standard-Auftritt zeigt zuerst Familien - in der Demo „Zuhause am Deich“ mit seinen
// Tieren, die Demo-Familie mit den dort gezeigten Tieren und das befreundete Zuhause Möwenweg (Namen über die
// „Erlebt mit“-Liste). Der Stammbaum ist ein Zusatz nach der ersten Verpaarung: in der Demo-Familie stehen
// Verpaarungen und Eltern, also erscheint dort „Stammbaum öffnen“; im Demo-Zuhause (ohne beides) nicht.
test('Demo (Phase V3): Familienbande mit Zuhause, Familie, befreundetem Zuhause und Stammbaum in der Familie', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')

  const get = (urlPath, cookie) => call(base, urlPath, { cookie })
  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })

  const { created, visits } = replaceDemoPack(db, uploadDir, { theme: 'standard', name: 'Familie Sonnenhang' })
  const login = await post('/api/demo')
  const demoCookie = getCookie(login.res)
  const homeDogs = (await get('/api/dogs', demoCookie)).data

  await t.test('Zuhause: vier eigene Tiere, Nele und Mira zeigt es in der Demo-Familie', () => {
    assert.equal(login.data.theme, 'standard')
    assert.deepEqual(login.data.memberships.map((m) => m.id), [created.familyId])
    assert.deepEqual(homeDogs.map((dog) => dog.name).sort(), ['Balu', 'Flocke', 'Mira', 'Nele'])
    const sharedNames = homeDogs.filter((dog) => dog.shares.includes(created.familyId)).map((dog) => dog.name)
    assert.deepEqual(sharedNames.sort(), ['Mira', 'Nele'])
    // Neles Freigabe ans Demo-Tierheim (Mitlesen mit Einwilligung) steht nicht in der Liste - nur Familien
    const ids = homeDogs.flatMap((dog) => dog.shares)
    assert.ok(ids.every((id) => db.prepare('SELECT art FROM families WHERE id = ?').get(id).art === 'rudel'))
  })

  await t.test('befreundetes Zuhause: Möwenweg in beiden Richtungen, Wilma steht in der „Erlebt mit“-Liste', async () => {
    const lists = (await get('/api/besuche', demoCookie)).data
    assert.deepEqual(lists.besuche.map((b) => b.id), [visits.hostId])
    assert.deepEqual(lists.gaeste.map((g) => g.id), [visits.hostId])
    const tiere = (await get('/api/erlebt-mit/tiere', demoCookie)).data
    assert.deepEqual(tiere.filter((dog) => dog.zuhauseId === visits.hostId).map((dog) => dog.name), ['Socke', 'Wilma'])
  })

  await t.test('im Zuhause entsteht noch kein Stammbaum: keine Verpaarung, keine Eltern', async () => {
    assert.deepEqual((await get('/api/breeding', demoCookie)).data, [])
    assert.ok(homeDogs.every((dog) => !dog.mother_dog_id && !dog.father_dog_id))
  })

  await t.test('in der Demo-Familie: eingetragene Verpaarungen und Eltern - „Stammbaum öffnen“ erscheint dort', async () => {
    const view = await post('/api/view', { familyId: created.familyId }, demoCookie)
    assert.equal(view.status, 200)
    const familyCookie = getCookie(view.res)
    assert.ok((await get('/api/breeding', familyCookie)).data.length > 0)
    const familyDogs = (await get('/api/dogs', familyCookie)).data
    const ids = new Set(familyDogs.map((dog) => dog.id))
    assert.ok(familyDogs.some((dog) => ids.has(dog.mother_dog_id) || ids.has(dog.father_dog_id)))
    // Die Häuser der Mitglieder folgen der Familie: geteilte Tiere tragen den Namen ihres Zuhauses
    const homes = [...new Set(familyDogs.map((dog) => dog.shared_from).filter(Boolean))].sort()
    assert.deepEqual(homes, ['Zuhause Lindenhof (Demo)', 'Zuhause Möwenweg (Demo)', 'Zuhause am Deich'])
  })

  await t.test('alles bleibt Demo (is_demo = 1)', () => {
    const ids = [login.data.id, created.familyId, visits.hostId]
    for (const id of ids) assert.equal(db.prepare('SELECT is_demo FROM families WHERE id = ?').get(id).is_demo, 1)
  })
})
