const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// Nachbesserungen aus dem security-review von Phase T (Übergabe/Adoption): siehe transfer.test.js für
// den Übergabe-Ablauf selbst - diese Datei prüft speziell das Leben DANACH (das neue Zuhause bearbeitet
// weiter, teilt, und ein Tierheim mit Mitlese-Freigabe darf trotzdem nichts Fremdes veröffentlichen).
// Hinweis wie in test/sharing-review.test.js: t.test() bleibt auf einer Ebene (kein t.test in t.test).
const ADMIN_TEST_PASSWORD = 'admin-test-shelter-privacy-1'
const dataDir = useTempDataDir('shelter-privacy', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

test('Security-Review Phase T: Adoption danach - Bearbeiten, Teilen, Foto-Härtung, Boolean-Flags', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })
  const get = (urlPath, cookie) => call(base, urlPath, { cookie })

  let counter = 0
  async function createShelter(name) {
    counter += 1
    const slug = `tierheim-priv-${counter}`
    const partner = await post('/api/admin/partners', { name, typ: 'tierheim', plz: '10115', status: 'aktiv', slug }, adminCookie)
    assert.equal(partner.status, 201)
    const shelter = await post(`/api/admin/partners/${partner.data.id}/shelter`, undefined, adminCookie)
    assert.equal(shelter.status, 201)
    const login = await post('/api/login', { secret: shelter.data.key }, null)
    assert.equal(login.status, 200)
    return { partnerId: partner.data.id, familyId: shelter.data.familyId, familyName: name, cookie: getCookie(login.res) }
  }

  // Legt im Tierheim ein Tier an, gibt es per Übergabe-Gutschein in ein neues (schon vorhandenes)
  // Zuhause - wie test/vouchers.test.js "claim", nur hier als wiederverwendbarer Testaufbau.
  async function adoptDog(shelter, name, geschlecht, { shelterMayRead = false } = {}) {
    counter += 1
    const dog = await post('/api/dogs', { name, geschlecht, tierart: 'hund', vermittlungStatus: 'in_vermittlung' }, shelter.cookie)
    assert.equal(dog.status, 201)
    const handover = await post(`/api/dogs/${dog.data.id}/handover`, {}, shelter.cookie)
    assert.equal(handover.status, 201)
    const home = await createFamily(base, `Zuhause ${name} ${counter}`, `zuhause-pw-${counter}`, { art: 'zuhause' })
    const claimed = await post('/api/vouchers/claim', { code: handover.data.code, shelterMayRead }, home.cookie)
    assert.equal(claimed.status, 200)
    return { dogId: dog.data.id, home }
  }

  await t.test('1. Nach der Adoption kann der neue Besitzer weiter bearbeiten, ohne an der Shelter-only-Regel zu scheitern', async () => {
    const shelter = await createShelter('Tierheim Adoption Edit')
    const { dogId, home } = await adoptDog(shelter, 'Buddy', 'ruede')

    const detailBefore = await get(`/api/dogs/${dogId}`, home.cookie)
    assert.equal(detailBefore.data.vermittlung_status, 'vermittelt')

    const renamed = await put(`/api/dogs/${dogId}`, { name: 'Buddy der Zweite' }, home.cookie)
    assert.equal(renamed.status, 200)
    assert.equal(renamed.data.name, 'Buddy der Zweite')
    assert.equal(renamed.data.vermittlung_status, 'vermittelt')

    const ownPhoto = await uploadPng(base, home.cookie)
    const withPhoto = await put(`/api/dogs/${dogId}`, { fotoUrl: ownPhoto }, home.cookie)
    assert.equal(withPhoto.status, 200)
    assert.equal(withPhoto.data.foto_url, ownPhoto)

    // Der neue Besitzer (kein Tierheim) darf den Status weiterhin nicht AKTIV ändern
    const attemptChange = await put(`/api/dogs/${dogId}`, { vermittlungStatus: 'in_vermittlung' }, home.cookie)
    assert.equal(attemptChange.status, 400)
    assert.match(attemptChange.data.error, /Tierheim-Bereich/)
  })

  await t.test('2. shares (PUT /:id/shares) betreffen nur Rudel-Freigaben, die Tierheim-Mitlese-Freigabe bleibt unangetastet', async () => {
    const shelter = await createShelter('Tierheim Shares')
    const { dogId, home } = await adoptDog(shelter, 'Mona', 'huendin', { shelterMayRead: true })

    const shareRowBefore = db.prepare('SELECT story_consent FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(dogId, shelter.familyId)
    assert.ok(shareRowBefore, 'Tierheim hat eine Mitlese-Freigabe')

    const detailBefore = await get(`/api/dogs/${dogId}`, home.cookie)
    assert.deepEqual(detailBefore.data.shares, [])

    const rudel = await createFamily(base, 'Rudel für Mona', `rudel-mona-pw-${counter}`)
    await post('/api/families/join', { password: `rudel-mona-pw-${counter}` }, home.cookie)

    const shared = await put(`/api/dogs/${dogId}/shares`, { familyIds: [rudel.data.id] }, home.cookie)
    assert.equal(shared.status, 200)
    assert.deepEqual(shared.data.shares, [rudel.data.id])

    // Beide Zeilen existieren jetzt: die neue Rudel-Freigabe UND weiterhin die des Tierheims
    const allShares = db
      .prepare('SELECT family_id FROM dog_shares WHERE dog_id = ? ORDER BY family_id')
      .all(dogId)
      .map((r) => r.family_id)
    assert.deepEqual(allShares.sort((a, b) => a - b), [shelter.familyId, rudel.data.id].sort((a, b) => a - b))

    const shareRowAfter = db.prepare('SELECT story_consent FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(dogId, shelter.familyId)
    assert.deepEqual(shareRowAfter, shareRowBefore)

    const detailAfter = await get(`/api/dogs/${dogId}`, home.cookie)
    assert.deepEqual(detailAfter.data.shares, [rudel.data.id])

    // Das Tierheim sieht das Tier weiterhin lesend
    const shelterDogs = await get('/api/dogs', shelter.cookie)
    assert.ok(shelterDogs.data.some((d) => d.id === dogId))

    // Rudel-Freigaben leeren löscht nur die Rudel-Zeile, nicht die des Tierheims
    const cleared = await put(`/api/dogs/${dogId}/shares`, { familyIds: [] }, home.cookie)
    assert.equal(cleared.status, 200)
    assert.deepEqual(cleared.data.shares, [])
    const stillShelter = db.prepare('SELECT 1 FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(dogId, shelter.familyId)
    assert.ok(stillShelter)
  })

  await t.test('6. ein Tierheim mit Mitlese-Freigabe darf kein privates Adoptanten-Foto öffentlich übernehmen', async () => {
    const shelter = await createShelter('Tierheim Foto-Angriff')
    const { dogId: adoptedId, home } = await adoptDog(shelter, 'Rex', 'ruede', { shelterMayRead: true })

    // Das neue Zuhause lädt ein eigenes Foto hoch und setzt es als Titelbild seines (jetzt eigenen) Tiers
    const adopterPhoto = await uploadPng(base, home.cookie)
    const setPhoto = await put(`/api/dogs/${adoptedId}`, { fotoUrl: adopterPhoto }, home.cookie)
    assert.equal(setPhoto.status, 200)

    // Das Tierheim SIEHT das Foto (Mitlese-Freigabe) - die normale Sichtbarkeit ändert sich nicht
    const photoRes = await fetch(`${base}${adopterPhoto}`, { headers: { Cookie: shelter.cookie } })
    assert.equal(photoRes.status, 200)

    // Aber: das Tierheim darf dieses Foto NICHT für ein eigenes, öffentlich vermittelbares Tier
    // übernehmen - weder als Titelbild noch in einem öffentlichen (isPublic) Chronik-Eintrag.
    const ownDog = await post(
      '/api/dogs',
      { name: 'Sunny', geschlecht: 'huendin', tierart: 'hund', vermittlungStatus: 'in_vermittlung' },
      shelter.cookie
    )
    assert.equal(ownDog.status, 201)

    const stolenOnDog = await put(`/api/dogs/${ownDog.data.id}`, { fotoUrl: adopterPhoto }, shelter.cookie)
    assert.equal(stolenOnDog.status, 400)
    assert.match(stolenOnDog.data.error, /Foto nicht gefunden/)

    const stolenInEntry = await post(
      '/api/timeline',
      {
        dogId: ownDog.data.id,
        autorName: 'Team',
        datum: '2026-01-01',
        titel: 'Steckbrief-Foto',
        isPublic: true,
        kategorie: 'sonstiges',
        fotoUrls: [adopterPhoto]
      },
      shelter.cookie
    )
    assert.equal(stolenInEntry.status, 400)
    assert.match(stolenInEntry.data.error, /Foto nicht gefunden/)

    // Kontrolle: ein selbst hochgeladenes Foto funktioniert für beides ganz normal
    const ownPhoto = await uploadPng(base, shelter.cookie)
    const ownPhotoOnDog = await put(`/api/dogs/${ownDog.data.id}`, { fotoUrl: ownPhoto }, shelter.cookie)
    assert.equal(ownPhotoOnDog.status, 200)
    const ownPhotoInEntry = await post(
      '/api/timeline',
      {
        dogId: ownDog.data.id,
        autorName: 'Team',
        datum: '2026-01-02',
        titel: 'Echtes Steckbrief-Foto',
        isPublic: true,
        kategorie: 'sonstiges',
        fotoUrls: [ownPhoto]
      },
      shelter.cookie
    )
    assert.equal(ownPhotoInEntry.status, 201)

    // Ein NICHT-öffentlicher, interner Eintrag darf das fremde (aber sichtbare) Foto weiterhin normal
    // verwenden - nur die ÖFFENTLICHE Verwendung ist gesperrt, die Mitlese-Freigabe selbst bleibt für
    // interne Zwecke bestehen.
    const internalEntry = await post(
      '/api/timeline',
      { dogId: ownDog.data.id, autorName: 'Team', datum: '2026-01-03', titel: 'Interne Notiz', fotoUrls: [adopterPhoto] },
      shelter.cookie
    )
    assert.equal(internalEntry.status, 201)
  })

  await t.test('7. shelterMayRead/storyConsent müssen echte Booleans sein - kein "false"-String', async () => {
    const shelter = await createShelter('Tierheim Boolean')

    const dog1 = await post(
      '/api/dogs',
      { name: 'Filou', geschlecht: 'ruede', tierart: 'hund', vermittlungStatus: 'in_vermittlung' },
      shelter.cookie
    )
    const handover1 = await post(`/api/dogs/${dog1.data.id}/handover`, {}, shelter.cookie)
    const redeemWithStringFlag = await post('/api/vouchers/redeem', {
      code: handover1.data.code,
      name: 'Zuhause Boolean',
      shelterMayRead: 'false'
    })
    assert.equal(redeemWithStringFlag.status, 400)
    assert.match(redeemWithStringFlag.data.error, /shelterMayRead/)
    // Der Gutschein bleibt dabei unverbraucht (die Validierung passiert vor jedem Schreibzugriff)
    assert.equal(
      db.prepare('SELECT vermittlung_status FROM dogs WHERE id = ?').get(dog1.data.id).vermittlung_status,
      'reserviert'
    )

    // Ohne shelterMayRead überhaupt mitzuschicken gilt es als false - keine Mitlese-Freigabe
    const dog2 = await post(
      '/api/dogs',
      { name: 'Filou Zwei', geschlecht: 'ruede', tierart: 'hund', vermittlungStatus: 'in_vermittlung' },
      shelter.cookie
    )
    const handover2 = await post(`/api/dogs/${dog2.data.id}/handover`, {}, shelter.cookie)
    const redeemMissingFlag = await post('/api/vouchers/redeem', { code: handover2.data.code, name: 'Zuhause Boolean Zwei' })
    assert.equal(redeemMissingFlag.status, 201)
    assert.equal(
      db.prepare('SELECT COUNT(*) AS c FROM dog_shares WHERE dog_id = ? AND family_id = ?').get(dog2.data.id, shelter.familyId).c,
      0
    )

    // storyConsent (PUT /:id/shelter-share): derselbe strikte Boolean-Check
    const { dogId, home } = await adoptDog(shelter, 'Filou Drei', 'ruede', { shelterMayRead: true })
    const badStoryConsent = await put(`/api/dogs/${dogId}/shelter-share`, { enabled: true, storyConsent: 'false' }, home.cookie)
    assert.equal(badStoryConsent.status, 400)
    assert.match(badStoryConsent.data.error, /storyConsent/)

    const okStoryConsent = await put(`/api/dogs/${dogId}/shelter-share`, { enabled: true, storyConsent: true }, home.cookie)
    assert.equal(okStoryConsent.status, 200)
    assert.equal(okStoryConsent.data.storyConsent, true)

    // claim: derselbe strikte Boolean-Check für shelterMayRead
    const dog3 = await post(
      '/api/dogs',
      { name: 'Filou Claim', geschlecht: 'huendin', tierart: 'hund', vermittlungStatus: 'in_vermittlung' },
      shelter.cookie
    )
    const handover3 = await post(`/api/dogs/${dog3.data.id}/handover`, {}, shelter.cookie)
    const claimWithStringFlag = await post('/api/vouchers/claim', { code: handover3.data.code, shelterMayRead: 'false' }, home.cookie)
    assert.equal(claimWithStringFlag.status, 400)
    assert.match(claimWithStringFlag.data.error, /shelterMayRead/)
  })
})
