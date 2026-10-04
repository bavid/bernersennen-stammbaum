const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

// Geschlecht „weiß ich nicht“ ('unbekannt'): ein neues Tier braucht nur Name und Tierart. Mutter bzw. Vater (Stammbaum,
// Verpaarung) kann nur ein Tier mit bekanntem Geschlecht sein - und wer schon Mutter oder Vater ist, behält sein Geschlecht.
const dir = useTempDataDir('dog-sex')

test('Geschlecht "unbekannt": anlegen, anzeigen, nie als Elternteil, Eltern behalten ihr Geschlecht', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dir, server))
  const family = await createFamily(base, 'Familie am Bach', 'passwort-bach')
  const send = (method, url, body) => call(base, url, { method, body, cookie: family.cookie })

  let unknownId
  let motherId
  let fatherId

  await t.test('ohne Geschlecht angelegt heißt es "unbekannt" - leer ebenso, ausdrücklich ebenso', async () => {
    const missing = await send('POST', '/api/dogs', { name: 'Flocke', tierart: 'katze' })
    assert.equal(missing.status, 201)
    assert.equal(missing.data.geschlecht, 'unbekannt')
    unknownId = missing.data.id

    const empty = await send('POST', '/api/dogs', { name: 'Hoppel', tierart: 'anderes', geschlecht: '' })
    assert.equal(empty.status, 201)
    assert.equal(empty.data.geschlecht, 'unbekannt')

    const explicit = await send('POST', '/api/dogs', { name: 'Wilma', geschlecht: 'unbekannt' })
    assert.equal(explicit.status, 201)
    assert.equal(explicit.data.geschlecht, 'unbekannt')
    assert.equal(explicit.data.tierart, 'hund')
  })

  await t.test('ein anderer Wert ist ein Fehler', async () => {
    const res = await send('POST', '/api/dogs', { name: 'Pepper', geschlecht: 'divers' })
    assert.equal(res.status, 400)
    assert.match(res.data.error, /Geschlecht muss ruede, huendin oder unbekannt sein/)
  })

  await t.test('ein Tier mit unbekanntem Geschlecht taugt weder als Mutter noch als Vater', async () => {
    const dogUnknown = await send('POST', '/api/dogs', { name: 'Benno', geschlecht: 'unbekannt' })
    const asMother = await send('POST', '/api/dogs', { name: 'Welpe A', geschlecht: 'ruede', motherDogId: dogUnknown.data.id })
    assert.equal(asMother.status, 400)
    assert.equal(asMother.data.error, 'Mutter muss eine Hündin sein')
    const asFather = await send('POST', '/api/dogs', { name: 'Welpe B', geschlecht: 'ruede', fatherDogId: dogUnknown.data.id })
    assert.equal(asFather.status, 400)
    assert.equal(asFather.data.error, 'Vater muss ein Rüde sein')

    const litter = await send('POST', '/api/breeding', { mutterDogId: dogUnknown.data.id, datum: '2026-05-01' })
    assert.equal(litter.status, 403)
  })

  await t.test('später bestimmt: aus "unbekannt" wird eine Hündin, danach taugt sie als Mutter', async () => {
    const res = await send('PUT', `/api/dogs/${unknownId}`, { geschlecht: 'huendin' })
    assert.equal(res.status, 200)
    assert.equal(res.data.geschlecht, 'huendin')
    const kitten = await send('POST', '/api/dogs', { name: 'Minka', tierart: 'katze', motherDogId: unknownId })
    assert.equal(kitten.status, 201)
    motherId = unknownId
  })

  await t.test('eine eingetragene Mutter behält ihr Geschlecht - andere Angaben lassen sich weiter ändern', async () => {
    const res = await send('PUT', `/api/dogs/${motherId}`, { geschlecht: 'unbekannt' })
    assert.equal(res.status, 400)
    assert.equal(res.data.error, 'Dieses Tier ist als Mutter eingetragen – das Geschlecht lässt sich deshalb nicht ändern.')
    const rename = await send('PUT', `/api/dogs/${motherId}`, { name: 'Flocke vom Bach', geschlecht: 'huendin' })
    assert.equal(rename.status, 200)
    assert.equal(rename.data.name, 'Flocke vom Bach')
  })

  await t.test('ein Vater einer Verpaarung behält sein Geschlecht ebenso', async () => {
    const mother = await send('POST', '/api/dogs', { name: 'Aiko', geschlecht: 'huendin' })
    const father = await send('POST', '/api/dogs', { name: 'Hermes', geschlecht: 'ruede' })
    fatherId = father.data.id
    const litter = await send('POST', '/api/breeding', { mutterDogId: mother.data.id, vaterDogId: fatherId, datum: '2026-05-01' })
    assert.equal(litter.status, 201)

    const res = await send('PUT', `/api/dogs/${fatherId}`, { geschlecht: 'unbekannt' })
    assert.equal(res.status, 400)
    assert.equal(res.data.error, 'Dieses Tier ist als Vater eingetragen – das Geschlecht lässt sich deshalb nicht ändern.')
    const motherChange = await send('PUT', `/api/dogs/${mother.data.id}`, { geschlecht: 'ruede' })
    assert.equal(motherChange.status, 400)
  })

  await t.test('ohne Kinder und Verpaarungen lässt sich das Geschlecht frei ändern - auch zurück auf "unbekannt"', async () => {
    const dog = await send('POST', '/api/dogs', { name: 'Pepper', geschlecht: 'ruede' })
    const res = await send('PUT', `/api/dogs/${dog.data.id}`, { geschlecht: 'unbekannt' })
    assert.equal(res.status, 200)
    assert.equal(res.data.geschlecht, 'unbekannt')
    // Ein PUT ohne geschlecht behält den Wert.
    const keep = await send('PUT', `/api/dogs/${dog.data.id}`, { name: 'Pepper vom Bach' })
    assert.equal(keep.data.geschlecht, 'unbekannt')
  })
})
