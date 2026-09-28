const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

const dataDir = useTempDataDir('companions')

test('Einzug, Abschied und Herkunft eines Tieres', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))

  const { cookie } = await createFamily(base, 'Zuhause am Deich', 'passwortZ1')
  const post = (body) => call(base, '/api/dogs', { method: 'POST', cookie, body })
  const put = (id, body) => call(base, `/api/dogs/${id}`, { method: 'PUT', cookie, body })

  await t.test('legt ein Tier mit allen Begleitfeldern an und liest sie zurück (create + detail + summary)', async () => {
    const created = await post({
      name: 'Balu',
      geschlecht: 'ruede',
      beiUnsSeit: '2020-05-01',
      beiUnsBis: '2024-06-01',
      abschiedGrund: 'umgezogen',
      herkunftArt: 'tierheim',
      herkunftText: 'Tierheim Sonnenhang'
    })
    assert.equal(created.status, 201)
    assert.equal(created.data.bei_uns_seit, '2020-05-01')
    assert.equal(created.data.bei_uns_bis, '2024-06-01')
    assert.equal(created.data.abschied_grund, 'umgezogen')
    assert.equal(created.data.herkunft_art, 'tierheim')
    assert.equal(created.data.herkunft_text, 'Tierheim Sonnenhang')

    const detail = await call(base, `/api/dogs/${created.data.id}`, { cookie })
    assert.equal(detail.data.bei_uns_seit, '2020-05-01')
    assert.equal(detail.data.abschied_grund, 'umgezogen')
    assert.equal(detail.data.herkunft_art, 'tierheim')
    assert.equal(detail.data.herkunft_text, 'Tierheim Sonnenhang')

    const summary = await call(base, '/api/dogs/all', { cookie })
    const listed = summary.data.find((d) => d.id === created.data.id)
    assert.ok(listed, 'Tier steht in /dogs/all')
    assert.equal(listed.bei_uns_seit, '2020-05-01')
    assert.equal(listed.herkunft_art, 'tierheim')
  })

  await t.test('Abschied vor Einzug -> 400', async () => {
    const res = await post({ name: 'Luna', geschlecht: 'huendin', beiUnsSeit: '2024-01-01', beiUnsBis: '2023-01-01' })
    assert.equal(res.status, 400)
    assert.match(res.data.error, /Abschied liegt vor dem Einzug/)
  })

  await t.test('unbekannter Abschiedsgrund -> 400', async () => {
    const res = await post({ name: 'Hermes', geschlecht: 'ruede', beiUnsBis: '2024-01-01', abschiedGrund: 'sonstwas' })
    assert.equal(res.status, 400)
  })

  await t.test('unbekannte Herkunftsart -> 400', async () => {
    const res = await post({ name: 'Emma', geschlecht: 'huendin', herkunftArt: 'sonstwas' })
    assert.equal(res.status, 400)
  })

  await t.test('Abschiedsgrund ohne beiUnsBis wird zu null', async () => {
    const created = await post({ name: 'Nele', geschlecht: 'huendin', abschiedGrund: 'verstorben' })
    assert.equal(created.status, 201)
    assert.equal(created.data.abschied_grund, null)
  })

  await t.test('Update setzt Begleitfelder', async () => {
    const dog = (await post({ name: 'Mira', geschlecht: 'huendin' })).data
    const updated = await put(dog.id, {
      beiUnsSeit: '2021-01-01',
      beiUnsBis: '2022-01-01',
      abschiedGrund: 'abgegeben',
      herkunftArt: 'fundtier',
      herkunftText: 'Fundtier'
    })
    assert.equal(updated.status, 200)
    assert.equal(updated.data.bei_uns_seit, '2021-01-01')
    assert.equal(updated.data.bei_uns_bis, '2022-01-01')
    assert.equal(updated.data.abschied_grund, 'abgegeben')
    assert.equal(updated.data.herkunft_art, 'fundtier')
    assert.equal(updated.data.herkunft_text, 'Fundtier')
  })

  await t.test('leere Begleitfelder bleiben null', async () => {
    const created = await post({ name: 'Balu Zwei', geschlecht: 'ruede' })
    assert.equal(created.status, 201)
    assert.equal(created.data.bei_uns_seit, null)
    assert.equal(created.data.bei_uns_bis, null)
    assert.equal(created.data.abschied_grund, null)
    assert.equal(created.data.herkunft_art, null)
    assert.equal(created.data.herkunft_text, null)
  })
})
