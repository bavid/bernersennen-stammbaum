const test = require('node:test')
const assert = require('node:assert/strict')
const { useTempDataDir, startApp, cleanup, call, createFamily } = require('./helpers')

const dataDir = useTempDataDir('families')

test('deleting a family keeps other families intact', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { deleteFamily } = require('../lib/families')

  const a = await createFamily(base, 'Rudel A', 'passwortA')
  const b = await createFamily(base, 'Rudel B', 'passwortB')
  const post = (cookie, urlPath, body) => call(base, urlPath, { method: 'POST', cookie, body })

  const mother = (await post(a.cookie, '/api/dogs', { name: 'Bella', geschlecht: 'huendin', fotoUrl: '/uploads/a1.jpg' })).data
  await post(a.cookie, '/api/timeline', { dogId: mother.id, autorName: 'A', datum: '2020-01-01', titel: 'X', fotoUrls: ['/uploads/a2.jpg'] })
  // Rudelübergreifende Verknüpfungen sind über die API nicht mehr möglich – hier Altdaten simulieren
  const child = (await post(b.cookie, '/api/dogs', { name: 'Cora', geschlecht: 'huendin', fotoUrl: '/uploads/b1.jpg' })).data
  db.prepare('UPDATE dogs SET mother_dog_id = ? WHERE id = ?').run(mother.id, child.id)

  const orphaned = deleteFamily(db, a.data.id)

  await t.test('removes the family, its dogs and entries', () => {
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(a.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM dogs WHERE family_id = ?').get(a.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM timeline_entries WHERE family_id = ?').get(a.data.id).c, 0)
  })

  await t.test('turns links from other families into freitext', () => {
    const cora = db.prepare('SELECT * FROM dogs WHERE id = ?').get(child.id)
    assert.equal(cora.mother_dog_id, null)
    assert.equal(cora.mother_freitext, 'Bella')
  })

  await t.test('reports only photos nobody uses anymore', () => {
    assert.deepEqual(orphaned.sort(), ['/uploads/a1.jpg', '/uploads/a2.jpg'])
  })

  await t.test('the other family still logs in', async () => {
    const login = await call(base, '/api/login', { method: 'POST', body: { password: 'passwortB' } })
    assert.equal(login.status, 200)
  })

  await t.test('deleting a rudel someone joined removes the membership, the member stays', async () => {
    const home = await createFamily(base, 'Zuhause Nele', 'zuhause-pw-del1', { art: 'zuhause' })
    const rudel = await createFamily(base, 'Familie Talblick', 'rudel-pw-del1')
    await post(home.cookie, '/api/families/join', { password: 'rudel-pw-del1' })
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_members WHERE group_family_id = ?').get(rudel.data.id).c, 1)

    deleteFamily(db, rudel.data.id)

    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(rudel.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_members WHERE group_family_id = ?').get(rudel.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(home.data.id).c, 1)
  })

  await t.test('deleting a zuhause that joined a rudel removes the membership, the rudel stays', async () => {
    const home = await createFamily(base, 'Zuhause Mira', 'zuhause-pw-del2', { art: 'zuhause' })
    const rudel = await createFamily(base, 'Familie Nordlicht', 'rudel-pw-del2')
    await post(home.cookie, '/api/families/join', { password: 'rudel-pw-del2' })
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_members WHERE member_family_id = ?').get(home.data.id).c, 1)

    deleteFamily(db, home.data.id)

    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(home.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM family_members WHERE member_family_id = ?').get(home.data.id).c, 0)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM families WHERE id = ?').get(rudel.data.id).c, 1)
  })
})
