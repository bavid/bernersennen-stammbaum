const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

const dataDir = useTempDataDir('area-counts', { LOGIN_RATE_LIMIT: '200' })

// Phase W, Schritt 2: eine Zählung für alle Stellen ("21 Tiere · davon 4 von euch") - GET /api/me liefert je Familie die
// Tiere, die man dort sieht (tiere), und die eigenen, die der Haushalt dorthin teilt (eigeneTiere); je besuchtem Zuhause
// dessen Tiere. Unbekannte Eltern (Platzhalter) zählen wie im Raster des Clients nicht mit.
test('GET /api/me: Tiere je Familie und je besuchtem Zuhause', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { addVisit } = require('../lib/visits')

  const home = await createFamily(base, 'Zuhause Talblick', 'home-pw-1', { art: 'zuhause' })
  const rudel = await createFamily(base, 'Familie Sonnenhang', 'rudel-pw-1')
  const host = await createFamily(base, 'Zuhause Möwenweg', 'host-pw-1', { art: 'zuhause' })
  const insertDog = db.prepare("INSERT INTO dogs (family_id, name, geschlecht, name_unbekannt, mother_dog_id) VALUES (?, ?, 'huendin', ?, ?)")
  const dog = (familyId, name, { unknown = false, mother = null } = {}) => insertDog.run(familyId, name, unknown ? 1 : 0, mother).lastInsertRowid

  // Familie: zwei eigene Tiere, eines mit unbekannter Mutter (Platzhalter) - der Platzhalter zählt nicht.
  const placeholder = dog(rudel.data.id, 'Unbekannt', { unknown: true })
  dog(rudel.data.id, 'Wilma', { mother: placeholder })
  dog(rudel.data.id, 'Benno')
  // Haushalt: drei Tiere, zwei davon in der Familie geteilt.
  const nele = dog(home.data.id, 'Nele')
  const mira = dog(home.data.id, 'Mira')
  dog(home.data.id, 'Flocke')
  // Ein Fundtier ohne Namen, das niemandes Elternteil ist, zählt mit.
  dog(host.data.id, 'Unbekannt', { unknown: true })
  dog(host.data.id, 'Lotte')

  const join = await call(base, '/api/families/join', { method: 'POST', body: { password: 'rudel-pw-1' }, cookie: home.cookie })
  assert.equal(join.status, 200)
  const share = db.prepare('INSERT INTO dog_shares (dog_id, family_id) VALUES (?, ?)')
  share.run(nele, rudel.data.id)
  share.run(mira, rudel.data.id)
  addVisit(home.data.id, host.data.id)
  // Ein Platzhalter des Haushalts (unbekannte Mutter von Nele), mit geteilt: zählt weder bei tiere noch bei eigeneTiere.
  const ownPlaceholder = dog(home.data.id, 'Unbekannt', { unknown: true })
  db.prepare('UPDATE dogs SET mother_dog_id = ? WHERE id = ?').run(ownPlaceholder, nele)
  share.run(ownPlaceholder, rudel.data.id)

  const me = await call(base, '/api/me', { cookie: home.cookie })
  assert.equal(me.status, 200)
  assert.deepEqual(
    me.data.memberships.map(({ name, tiere, eigeneTiere }) => ({ name, tiere, eigeneTiere })),
    [{ name: 'Familie Sonnenhang', tiere: 4, eigeneTiere: 2 }]
  )
  assert.deepEqual(me.data.besuche, [{ id: host.data.id, name: 'Zuhause Möwenweg', tiere: 2, bild: null }])
})
