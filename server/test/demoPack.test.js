const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const dataDir = useTempDataDir('demopack')

test('public demo pack: Rudel + Zuhause, replaced safely together', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { uploadDir } = require('../config')
  const { replaceDemoPack } = require('../lib/demoPack')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })

  // Ein echtes Rudel, das beim Ersetzen der Demo niemals angefasst werden darf
  const real = await createFamily(base, 'Echtes Rudel', 'echtes-passwort')
  await call(base, '/api/dogs', { method: 'POST', cookie: real.cookie, body: { name: 'Bleibt', geschlecht: 'ruede' } })

  replaceDemoPack(db, uploadDir)
  const firstUploads = fs.readdirSync(uploadDir).length
  const { removed, created, household } = replaceDemoPack(db, uploadDir)

  await t.test('replacing removes both old demo families and their photos', async () => {
    assert.equal(removed.length, 2)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM families WHERE is_demo = 1').get().n, 2)
    assert.equal(fs.readdirSync(uploadDir).length, firstUploads, 'no orphaned demo photos pile up')
    const realDogs = await call(base, '/api/dogs', { cookie: real.cookie })
    assert.deepEqual(realDogs.data.map((d) => d.name), ['Bleibt'])
  })

  await t.test('exactly two demo families, linked by membership', () => {
    const demoFamilies = db.prepare('SELECT id, art FROM families WHERE is_demo = 1').all()
    assert.equal(demoFamilies.length, 2)
    assert.deepEqual(demoFamilies.map((f) => f.art).sort(), ['rudel', 'zuhause'])
    assert.equal(demoFamilies.some((f) => f.id === created.familyId), true)
    assert.equal(demoFamilies.some((f) => f.id === household.familyId), true)
    assert.equal(
      db
        .prepare('SELECT COUNT(*) AS n FROM family_members WHERE member_family_id = ? AND group_family_id = ?')
        .get(household.familyId, created.familyId).n,
      1,
      'Zuhause ist Mitglied im Rudel'
    )
  })

  await t.test('two dog_shares, at least two private entries, exactly one foreign comment', () => {
    assert.equal(household.dogs, 4)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM dog_shares WHERE family_id = ?').get(created.familyId).n, 2)
    const privateCount = db
      .prepare('SELECT COUNT(*) AS n FROM timeline_entries WHERE family_id = ? AND privat = 1')
      .get(household.familyId).n
    assert.ok(privateCount >= 2, `${privateCount} private entries`)
    // Kommentare vom Rudel auf Einträgen des Haushalts - nicht zu verwechseln mit den Kommentaren,
    // die das Rudel schon vorher auf seinen EIGENEN Einträgen hat (auch family_id = Rudel-Id).
    const foreignComments = db
      .prepare(
        `SELECT COUNT(*) AS n FROM entry_comments c
         JOIN timeline_entries t ON t.id = c.entry_id
         WHERE c.family_id = ? AND t.family_id = ?`
      )
      .get(created.familyId, household.familyId).n
    assert.equal(foreignComments, 1)
  })

  const demoLogin = await call(base, '/api/demo', { method: 'POST' })
  const demoCookie = getCookie(demoLogin.res)

  await t.test('visitors get in without a password, straight into "Meine Chronik"', () => {
    assert.equal(demoLogin.status, 200)
    assert.equal(demoLogin.data.isDemo, true)
    assert.equal(demoLogin.data.art, 'zuhause')
    assert.equal(demoLogin.data.id, household.familyId)
    assert.ok(demoLogin.data.memberships.some((m) => m.id === created.familyId), 'Mitglied im Demo-Rudel')
  })

  await t.test('the demo household shows every companion feature: 4 animals, private entries, housemates', async () => {
    const dogs = (await call(base, '/api/dogs', { cookie: demoCookie })).data
    assert.equal(dogs.length, 4)
    assert.ok(dogs.every((d) => d.foto_url), 'every companion has a picture')
    assert.ok(dogs.some((d) => d.tierart === 'katze') && dogs.some((d) => d.tierart === 'anderes'), 'cat and other animal')
    assert.ok(dogs.some((d) => d.bei_uns_bis && d.abschied_grund === 'verstorben'), 'a farewell entry')
    assert.ok(
      dogs.some((d) => d.herkunft_art === 'tierheim') &&
        dogs.some((d) => d.herkunft_art === 'privat') &&
        dogs.some((d) => d.herkunft_art === 'anderes'),
      'origin variety (tierheim/privat/anderes)'
    )
    assert.ok((await call(base, '/api/dogs/links', { cookie: demoCookie })).data.length >= 1, 'housemates (Nele + Mira)')

    const entries = (await call(base, '/api/timeline', { cookie: demoCookie })).data
    assert.ok(entries.filter((e) => e.privat).length >= 2, 'private entries visible to the owner')
  })

  await t.test('switching into the demo rudel shows every rudel feature; shares are read-only, private stays hidden', async () => {
    const view = await post('/api/view', { familyId: created.familyId }, demoCookie)
    assert.equal(view.status, 200)
    const rudelCookie = getCookie(view.res)

    const dogs = (await call(base, '/api/dogs', { cookie: rudelCookie })).data
    assert.ok(dogs.length >= 19, `${dogs.length} Tiere`)
    assert.ok(dogs.some((d) => d.name_unbekannt), 'unknown ancestors')
    assert.ok(dogs.some((d) => d.tierart === 'katze') && dogs.some((d) => d.tierart === 'anderes'), 'cats and other animals')
    assert.ok(dogs.some((d) => d.mother_dog_id && d.father_dog_id), 'known parent pairs')
    assert.ok(dogs.some((d) => d.mother_dog_id && d.father_freitext), 'parents from outside the pack')
    assert.ok((await call(base, '/api/dogs/links', { cookie: rudelCookie })).data.length >= 3, 'housemates')

    const nele = dogs.find((d) => d.name === 'Nele')
    const mira = dogs.find((d) => d.name === 'Mira')
    assert.ok(nele && mira, 'the shared companions are visible in the pack')
    assert.equal(nele.shared_from, 'Zuhause am Deich')
    assert.equal(mira.shared_from, 'Zuhause am Deich')
    assert.equal(nele.can_edit, 0)

    const entries = (await call(base, '/api/timeline', { cookie: rudelCookie })).data
    assert.ok(entries.some((e) => e.comments.length > 0), 'comments')
    assert.ok(entries.some((e) => e.foto_urls.length > 0), 'photos in the chronicle')
    assert.equal(entries.some((e) => e.titel === 'Tierarzt-Termin'), false, 'Neles privater Eintrag bleibt dem Rudel verborgen')
    const arrivalEntry = entries.find((e) => e.titel === 'Nele zieht ein – die ersten Tage')
    assert.ok(arrivalEntry, 'der öffentliche Einzugseintrag ist sichtbar')
    assert.ok(arrivalEntry.comments.some((c) => c.autor_name === 'Familie Keller'), 'das Rudel hat kommentiert')

    const notes = (await call(base, '/api/notes', { cookie: rudelCookie })).data
    assert.ok(notes.some((n) => n.replies.length > 0) && notes.some((n) => n.termin_datum), 'pinboard with replies and dates')
    assert.ok((await call(base, '/api/breeding', { cookie: rudelCookie })).data.length >= 3, 'breeding book')

    const writeAttempt = await call(base, '/api/dogs', {
      method: 'POST',
      cookie: rudelCookie,
      body: { name: 'Neu', geschlecht: 'ruede' }
    })
    assert.equal(writeAttempt.status, 403)
  })

  await t.test('the demo household itself stays read-only', async () => {
    const res = await call(base, '/api/dogs', { method: 'POST', cookie: demoCookie, body: { name: 'Neu', geschlecht: 'ruede' } })
    assert.equal(res.status, 403)
  })

  await t.test('a second replace fully replaces both demo families, no orphans left behind', async () => {
    const oldRudelId = created.familyId
    const oldHouseholdId = household.familyId

    const second = replaceDemoPack(db, uploadDir)
    assert.equal(second.removed.length, 2)
    assert.equal(second.household.dogs, 4)

    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM families WHERE id IN (?, ?)').get(oldRudelId, oldHouseholdId).n,
      0,
      'alte Demo-Ids sind weg'
    )
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM families WHERE is_demo = 1').get().n, 2)

    const orphanMembers = db
      .prepare(
        `SELECT COUNT(*) AS n FROM family_members
         WHERE member_family_id NOT IN (SELECT id FROM families) OR group_family_id NOT IN (SELECT id FROM families)`
      )
      .get().n
    assert.equal(orphanMembers, 0, 'no orphaned family_members')

    const orphanShares = db
      .prepare(
        `SELECT COUNT(*) AS n FROM dog_shares
         WHERE family_id NOT IN (SELECT id FROM families) OR dog_id NOT IN (SELECT id FROM dogs)`
      )
      .get().n
    assert.equal(orphanShares, 0, 'no orphaned dog_shares')

    const orphanComments = db
      .prepare(
        `SELECT COUNT(*) AS n FROM entry_comments
         WHERE family_id NOT IN (SELECT id FROM families) OR entry_id NOT IN (SELECT id FROM timeline_entries)`
      )
      .get().n
    assert.equal(orphanComments, 0, 'no orphaned entry_comments')

    const orphanUploads = db.prepare('SELECT COUNT(*) AS n FROM uploads WHERE family_id NOT IN (SELECT id FROM families)').get().n
    assert.equal(orphanUploads, 0, 'no orphaned uploads')

    const realDogs = await call(base, '/api/dogs', { cookie: real.cookie })
    assert.deepEqual(realDogs.data.map((d) => d.name), ['Bleibt'], 'echtes Rudel bleibt unangetastet')
  })
})
