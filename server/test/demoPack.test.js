const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// APP_ENV=staging: demo partners (is_demo = 1) are only public outside dev/staging with ?demo=1 (see
// routes/partners.js demoAllowed) - staging lets the portal test below check the plain, un-suffixed
// endpoint, same as a real preview deployment would see it.
const dataDir = useTempDataDir('demopack', { APP_ENV: 'staging' })

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

  // Ein echter (nicht-Demo) Partner, der beim Ersetzen der Demo-Partner niemals angefasst werden darf
  const realPartnerId = db
    .prepare("INSERT INTO partners (slug, name, typ, status, is_demo) VALUES ('echter-partner', 'Echter Partner', 'tierheim', 'aktiv', 0)")
    .run().lastInsertRowid

  replaceDemoPack(db, uploadDir)
  const firstUploads = fs.readdirSync(uploadDir).length
  const { removed, created, household, shelter, partnerIds } = replaceDemoPack(db, uploadDir)

  await t.test('replacing removes all eight old demo families and their photos', async () => {
    // Phase T Task 6: seit dem Demo-Tierheim drei Demo-Familien (Rudel, Zuhause, Tierheim); Phase P1 Task 4:
    // dazu die zwei Demo-Partner-Bereiche (Pfotenglück, Wuschelglück, siehe test/demoPartnerArea.test.js);
    // Phase R Task 3: dazu drei Demo-Haushalte je Rolle (Stellvertretung, Mitglied, Gast, test/demoMembers.test.js).
    // Phase M: dazu fünf Profil-Zuhause für „Mein Revier“ (lib/demoRevier.js).
    assert.equal(removed.length, 13)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM families WHERE is_demo = 1').get().n, 13)
    assert.equal(fs.readdirSync(uploadDir).length, firstUploads, 'no orphaned demo photos pile up')
    const realDogs = await call(base, '/api/dogs', { cookie: real.cookie })
    assert.deepEqual(realDogs.data.map((d) => d.name), ['Bleibt'])
  })

  await t.test('exactly eight demo families (Rudel, vier Zuhause, Tierheim, zwei Partner-Bereiche), linked by membership', () => {
    const demoFamilies = db.prepare('SELECT id, art FROM families WHERE is_demo = 1').all()
    // Phase M: dazu fünf Profil-Zuhause für „Mein Revier“ (lib/demoRevier.js).
    assert.equal(demoFamilies.length, 13)
    assert.deepEqual(demoFamilies.map((f) => f.art).sort(), ['partner', 'partner', 'rudel', 'tierheim', ...Array(9).fill('zuhause')])
    assert.equal(demoFamilies.some((f) => f.id === created.familyId), true)
    assert.equal(demoFamilies.some((f) => f.id === household.familyId), true)
    assert.equal(demoFamilies.some((f) => f.id === shelter.familyId), true)
    assert.equal(
      db
        .prepare('SELECT COUNT(*) AS n FROM family_members WHERE member_family_id = ? AND group_family_id = ?')
        .get(household.familyId, created.familyId).n,
      1,
      'Zuhause ist Mitglied im Rudel'
    )
    // Phase R Task 1: der Demo-Haushalt leitet das Demo-Rudel (sieht also auch "Einladen")
    assert.equal(
      db
        .prepare('SELECT rolle FROM family_members WHERE member_family_id = ? AND group_family_id = ?')
        .get(household.familyId, created.familyId).rolle,
      'leitung'
    )
  })

  await t.test('exactly sixteen demo partners with the expected slugs and badges; the real partner is untouched', () => {
    assert.equal(partnerIds.length, 16)
    const demoPartners = db.prepare('SELECT id, slug, typ, status, ist_partner, farbe FROM partners WHERE is_demo = 1 ORDER BY slug').all()
    const { DEMO_ENTDECKEN_PARTNERS } = require('../seed/demo-entdecken-partners')
    assert.deepEqual(
      demoPartners.map((p) => p.slug),
      [
        'hundesalon-wuschelglueck',
        'hundeschule-pfotenglueck',
        'tierheim-sonnenhang',
        'tierschutzverein-deichland',
        ...DEMO_ENTDECKEN_PARTNERS.map((p) => p.slug)
      ].sort()
    )
    for (const partner of demoPartners) assert.equal(partner.status, 'aktiv')
    assert.deepEqual(demoPartners.map((p) => p.id).sort((a, b) => a - b), partnerIds.slice().sort((a, b) => a - b))

    const sonnenhang = demoPartners.find((p) => p.slug === 'tierheim-sonnenhang')
    assert.equal(sonnenhang.typ, 'tierheim')
    assert.equal(sonnenhang.ist_partner, 1, 'badge "partner"')
    assert.equal(sonnenhang.farbe, '#2f6b3f')

    const pfotengluck = demoPartners.find((p) => p.slug === 'hundeschule-pfotenglueck')
    assert.equal(pfotengluck.typ, 'hundeschule')
    assert.equal(pfotengluck.ist_partner, 1, 'badge "partner"')

    const deichland = demoPartners.find((p) => p.slug === 'tierschutzverein-deichland')
    assert.equal(deichland.typ, 'vermittlung')
    assert.equal(deichland.ist_partner, 0, 'badge "geprueft"')

    assert.ok(db.prepare('SELECT 1 FROM partners WHERE id = ? AND is_demo = 0').get(realPartnerId), 'echter Partner bleibt unangetastet')
  })

  await t.test('the demo partner portal is publicly reachable (APP_ENV=staging)', async () => {
    const portal = await call(base, '/api/public/partners/tierheim-sonnenhang')
    assert.equal(portal.status, 200)
    assert.equal(portal.data.name, 'Tierheim Sonnenhang')
    assert.equal(portal.data.badge, 'partner')
    assert.equal(portal.data.farbe, '#2f6b3f')
    assert.match(portal.data.portal_text, /neues Zuhause/)
    assert.equal(portal.data.spenden_url, 'https://example.org/tierheim-sonnenhang/spenden')
    assert.equal(portal.data.vermittlung_url, 'https://example.org/tierheim-sonnenhang/tiere')
    assert.equal(portal.data.preview, undefined, 'aktiv, keine Vorschau')

    const list = await call(base, '/api/public/partners')
    assert.ok(list.data.some((p) => p.slug === 'tierheim-sonnenhang'), 'erscheint auch in der öffentlichen Liste')
  })

  await t.test('four dog_shares (two vom Deich, je eins von Stellvertretung und Mitglied), private entries, one foreign comment', () => {
    assert.equal(household.dogs, 4)
    // Phase R Task 3: Nele + Mira vom Deich, dazu Wilma (Möwenweg) und Pepper (Lindenhof), siehe seed/demo-members.js
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM dog_shares WHERE family_id = ?').get(created.familyId).n, 4)
    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM dog_shares ds JOIN dogs d ON d.id = ds.dog_id WHERE ds.family_id = ? AND d.family_id = ?').get(created.familyId, household.familyId).n,
      2
    )
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

  await t.test('seeded comments and replies carry their author (Phase R): the family for its own, the household for its own', () => {
    // Kommentare der Familie auf ihren eigenen Einträgen und der Familien-Kommentar auf Neles Einzug: geschrieben
    // von der Familie selbst (wie ein Login mit dem gemeinsamen Schlüssel) - nie ohne Autor
    const familyComments = db
      .prepare(
        `SELECT c.author_family_id FROM entry_comments c JOIN timeline_entries t ON t.id = c.entry_id
         WHERE c.family_id = ? AND (t.family_id = ? OR t.family_id = ?)`
      )
      .all(created.familyId, created.familyId, household.familyId)
    assert.ok(familyComments.length >= 8, `${familyComments.length} Familien-Kommentare`)
    assert.ok(familyComments.every((row) => row.author_family_id === created.familyId), 'alle von der Familie selbst')
    const replies = db.prepare('SELECT author_family_id FROM note_replies WHERE family_id = ?').all(created.familyId)
    assert.ok(replies.length >= 4)
    assert.ok(replies.every((row) => row.author_family_id === created.familyId))
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM entry_comments WHERE author_family_id IS NULL').get().n, 0, 'kein Demo-Kommentar ohne Autor')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM note_replies WHERE author_family_id IS NULL').get().n, 0)
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
    // Mira hat absichtlich kein Foto (Client zeigt Initialen) - sonst doppelt sich Minkas Bild,
    // sobald Mira ins Rudel geteilt wird. Die anderen drei haben eigene, nicht doppelt genutzte Fotos.
    assert.equal(dogs.filter((d) => d.foto_url).length, 3, 'drei von vier Begleitern haben ein Foto')
    assert.equal(dogs.find((d) => d.name === 'Mira').foto_url, null, 'Mira ohne Foto -> Initialen-Avatar')
    assert.ok(dogs.some((d) => d.tierart === 'katze') && dogs.some((d) => d.tierart === 'anderes'), 'cat and other animal')
    assert.ok(dogs.some((d) => d.bei_uns_bis && d.abschied_grund === 'verstorben'), 'a farewell entry')
    assert.ok(
      dogs.some((d) => d.herkunft_art === 'tierheim') &&
        dogs.some((d) => d.herkunft_art === 'privat') &&
        dogs.some((d) => d.herkunft_art === 'anderes'),
      'origin variety (tierheim/privat/anderes)'
    )
    assert.ok((await call(base, '/api/dogs/links', { cookie: demoCookie })).data.length >= 1, 'housemates (Nele + Mira)')
    // Phase W, Schritt 2: der Reiter "Verwandte" der Tierseite zeigt bei Nele eine Mutter, die nur dem Namen nach bekannt ist.
    assert.equal(dogs.find((d) => d.name === 'Nele').mother_freitext, 'Tinka (Fundhündin im Tierheim Sonnenhang)')

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
    const finn = dogs.find((d) => d.name === 'Finn vom Sonnenhang')
    const minka = dogs.find((d) => d.name === 'Minka')
    assert.ok(nele && mira, 'the shared companions are visible in the pack')
    assert.equal(nele.shared_from, 'Zuhause am Deich')
    assert.equal(mira.shared_from, 'Zuhause am Deich')
    assert.equal(nele.can_edit, 0)
    // Geteilte Tiere dürfen im Rudel nicht wie Duplikate vorhandener Tiere aussehen (gleiches Foto)
    assert.ok(finn && nele.foto_url, 'Finn und Neles Foto sind gesetzt')
    assert.notEqual(nele.foto_url, finn.foto_url, 'Nele teilt sich Finns Foto nicht')
    assert.ok(minka?.foto_url, 'Minka hat ein Foto')
    assert.equal(mira.foto_url, null, 'Mira hat bewusst kein Foto (kein Duplikat von Minka)')

    const entries = (await call(base, '/api/timeline', { cookie: rudelCookie })).data
    assert.ok(entries.some((e) => e.comments.length > 0), 'comments')
    assert.ok(entries.some((e) => e.foto_urls.length > 0), 'photos in the chronicle')
    assert.equal(entries.some((e) => e.titel === 'Tierarzt-Termin'), false, 'Neles privater Eintrag bleibt dem Rudel verborgen')
    const arrivalEntry = entries.find((e) => e.titel === 'Nele zieht ein – die ersten Tage')
    assert.ok(arrivalEntry, 'der öffentliche Einzugseintrag ist sichtbar')
    const kellerComment = arrivalEntry.comments.find((c) => c.autor_name === 'Familie Keller')
    assert.ok(kellerComment, 'das Rudel hat kommentiert')
    assert.equal(kellerComment.vonMir, false, 'von der Familie, nicht von der Besucherin (Zuhause am Deich)')
    assert.equal(kellerComment.ehemalig, false)
    const wilmaEntry = entries.find((e) => e.titel === 'Wilma im ersten Schnee')
    assert.ok(wilmaEntry.comments.some((c) => c.autor_name === 'Familie Nissen' && c.vonMir === true), 'die Besucherin hat selbst kommentiert (vonMir)')

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

  await t.test('a second replace fully replaces all eight demo families, no orphans left behind', async () => {
    const oldRudelId = created.familyId
    const oldHouseholdId = household.familyId
    const oldShelterId = shelter.familyId
    const oldPartnerIds = partnerIds.slice()

    const second = replaceDemoPack(db, uploadDir)
    assert.equal(second.removed.length, 13)
    assert.equal(second.household.dogs, 4)
    assert.equal(second.shelter.dogs, 5, 'wieder genau fünf Tiere im Demo-Tierheim')

    assert.equal(second.partnerIds.length, 16, 'wieder genau sechzehn Demo-Partner')
    assert.equal(
      db.prepare(`SELECT COUNT(*) AS n FROM partners WHERE id IN (${oldPartnerIds.map(() => '?').join(',')})`).get(...oldPartnerIds).n,
      0,
      'alte Demo-Partner-Ids sind weg'
    )
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM partners WHERE is_demo = 1').get().n, 16, 'weiterhin genau sechzehn Demo-Partner')
    assert.ok(db.prepare('SELECT 1 FROM partners WHERE id = ? AND is_demo = 0').get(realPartnerId), 'echter Partner bleibt unangetastet')

    assert.equal(
      db.prepare('SELECT COUNT(*) AS n FROM families WHERE id IN (?, ?, ?)').get(oldRudelId, oldHouseholdId, oldShelterId).n,
      0,
      'alte Demo-Ids (auch das alte Tierheim) sind weg'
    )
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM families WHERE is_demo = 1').get().n, 13)

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

    // Phase T Task 6: dog_transfers (Neles "Umzug" aus dem alten Demo-Tierheim) und vouchers.dog_id
    // dürfen nach dem Ersetzen nicht auf inzwischen gelöschte Familien/Tiere zeigen.
    const orphanTransfers = db
      .prepare(
        `SELECT COUNT(*) AS n FROM dog_transfers
         WHERE from_family_id NOT IN (SELECT id FROM families) OR to_family_id NOT IN (SELECT id FROM families)`
      )
      .get().n
    assert.equal(orphanTransfers, 0, 'no orphaned dog_transfers')

    const orphanVouchers = db
      .prepare(`SELECT COUNT(*) AS n FROM vouchers WHERE dog_id IS NOT NULL AND dog_id NOT IN (SELECT id FROM dogs)`)
      .get().n
    assert.equal(orphanVouchers, 0, 'no orphaned vouchers')

    const realDogs = await call(base, '/api/dogs', { cookie: real.cookie })
    assert.deepEqual(realDogs.data.map((d) => d.name), ['Bleibt'], 'echtes Rudel bleibt unangetastet')
  })

  await t.test('mehrere Fotos je Erinnerung (Durchwischen in der Großansicht) - auch nach zweimal Auffrischen genau einmal', () => {
    const path = require('node:path')
    const expected = [
      ['Nele', 'Nele zieht ein – die ersten Tage', 3],
      ['Mira', 'Neuer Lieblingsplatz', 3],
      ['Flocke', 'Besuch von Nachbars Hoppel', 2],
      ['Balu', 'Balu wird grau', 2],
      ['Juna', 'Junas Wurf ist da', 4],
      ['Kira', 'Geburtstagsrunde an der Aare', 3],
      ['Finn', 'Finn im Tiefschnee', 2],
      ['Frieda', 'Gassi am Fluss', 2]
    ]
    const stmt = db.prepare(
      `SELECT te.foto_urls FROM timeline_entries te JOIN dogs d ON d.id = te.dog_id JOIN families f ON f.id = te.family_id
       WHERE f.is_demo = 1 AND (d.name = ? OR d.name LIKE ? || ' %') AND te.titel = ?`
    )
    for (const [name, titel, count] of expected) {
      const rows = stmt.all(name, name, titel)
      assert.equal(rows.length, 1, `${name}: „${titel}“ genau einmal`)
      const urls = JSON.parse(rows[0].foto_urls)
      assert.equal(urls.length, count, `${name}: „${titel}“ hat ${count} Fotos`)
      assert.equal(new Set(urls).size, count, `${name}: „${titel}“ ohne doppelte Datei`)
      for (const url of urls) assert.ok(fs.existsSync(path.join(uploadDir, path.basename(url))), `${url} liegt im Upload-Ordner`)
    }
  })
})
