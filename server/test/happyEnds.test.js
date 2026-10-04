const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

// Phase T Task 6: GET /api/public/partners/:slug/happy-ends und die zugehörige /public-media-Erweiterung
// (lib/publicMedia.js storyConsentDogPhotoStmt/storyConsentEntryPhotoStmt). Der Übergabe-Ablauf selbst
// (handover/claim/redeem) ist schon in transfer.test.js/shelterPrivacy.test.js abgedeckt - diese Datei
// prüft nur die neue öffentliche Happy-End-Sektion. t.test() bleibt auf einer Ebene.
const ADMIN_TEST_PASSWORD = 'admin-test-happy-ends-1'
// Viele Shelter-Logins/Übergaben/Claims in dieser Datei (mehrere Tierheime, bis zu sieben Adoptionen
// in einem einzigen Sub-Test) - LOGIN_RATE_LIMIT/CODE_RATE_LIMIT hochgesetzt wie in shelterPrivacy.test.js,
// sonst würde der gemeinsame apiLimiter/authLimiter/codeLimiter (alle pro IP) vorzeitig 429 liefern.
const dataDir = useTempDataDir('happy-ends', { APP_ENV: 'production', LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

const filenameOf = (uploadUrl) => uploadUrl.split('/').pop()

test('Happy Ends (Phase T Task 6): Einwilligung, Kürzung, keine Halterdaten, /public-media-Freigabe', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })

  let counter = 0
  async function createShelter(name, slug) {
    counter += 1
    const partner = await post('/api/admin/partners', { name, typ: 'tierheim', plz: '10115', status: 'aktiv', slug }, adminCookie)
    assert.equal(partner.status, 201)
    const shelter = await post(`/api/admin/partners/${partner.data.id}/shelter`, undefined, adminCookie)
    assert.equal(shelter.status, 201)
    const login = await post('/api/login', { secret: shelter.data.key }, null)
    assert.equal(login.status, 200)
    return { partnerId: partner.data.id, partnerSlug: partner.data.slug, familyId: shelter.data.familyId, cookie: getCookie(login.res) }
  }

  // Legt im Tierheim ein Tier an (optional mit eigenem Titelbild) und gibt es per Übergabe-Gutschein in
  // ein neues Zuhause - optional mit sofortiger Mitlese-/Story-Einwilligung (wie beim echten Einlösen,
  // siehe routes/vouchers.js redeem).
  async function adoptDog(shelter, name, { tierart = 'hund', shelterMayRead = false, storyConsent, portraitUrl } = {}) {
    counter += 1
    const dog = await post('/api/dogs', { name, geschlecht: 'huendin', tierart, vermittlungStatus: 'in_vermittlung' }, shelter.cookie)
    assert.equal(dog.status, 201)
    if (portraitUrl) {
      const withPhoto = await put(`/api/dogs/${dog.data.id}`, { fotoUrl: portraitUrl }, shelter.cookie)
      assert.equal(withPhoto.status, 200)
    }
    const handover = await post(`/api/dogs/${dog.data.id}/handover`, {}, shelter.cookie)
    assert.equal(handover.status, 201)
    const home = await createFamily(base, `Zuhause ${name} ${counter}`, `zuhause-happy-pw-${counter}`, { art: 'zuhause' })
    const claimed = await post('/api/vouchers/claim', { code: handover.data.code, shelterMayRead }, home.cookie)
    assert.equal(claimed.status, 200)
    if (storyConsent !== undefined) {
      const share = await put(`/api/dogs/${dog.data.id}/shelter-share`, { enabled: true, storyConsent }, home.cookie)
      assert.equal(share.status, 200)
    }
    return { dogId: dog.data.id, home }
  }

  await t.test('unbekannter/pausierter Partner -> 404; aktiver Partner ohne Tierheim-Bereich -> []', async () => {
    const unknown = await call(base, '/api/public/partners/kein-partner/happy-ends')
    assert.equal(unknown.status, 404)

    const noShelter = await post(
      '/api/admin/partners',
      { name: 'Hundeschule ohne Tierheim', typ: 'hundeschule', plz: '10115', status: 'aktiv', slug: 'hundeschule-happy-ends' },
      adminCookie
    )
    assert.equal(noShelter.status, 201)
    const empty = await call(base, '/api/public/partners/hundeschule-happy-ends/happy-ends')
    assert.equal(empty.status, 200)
    assert.deepEqual(empty.data, [])
  })

  await t.test('ohne Einwilligung (kein story_consent) bleibt die Liste leer', async () => {
    const shelter = await createShelter('Tierheim Ohne Einwilligung', 'tierheim-happy-ohne')
    await adoptDog(shelter, 'Rex', { shelterMayRead: true, storyConsent: false })
    await adoptDog(shelter, 'Bello') // gar keine Mitlese-Freigabe

    const list = await call(base, `/api/public/partners/${shelter.partnerSlug}/happy-ends`)
    assert.equal(list.status, 200)
    assert.deepEqual(list.data, [])
  })

  await t.test('mit Einwilligung: Tier + neuester nicht-privater Eintrag, gekürzt, NIE Halterdaten', async () => {
    const shelter = await createShelter('Tierheim Mit Einwilligung', 'tierheim-happy-mit')
    const portrait = await uploadPng(base, shelter.cookie)
    const { dogId, home } = await adoptDog(shelter, 'Nele', { storyConsent: true, portraitUrl: portrait })

    // Der neue Besitzer schreibt mehrere Einträge - einer privat, einer älter, einer der neueste.
    const longText = 'Wort'.repeat(100) // deutlich über 280 Zeichen, ohne Leerzeichen -> Fallback-Schnitt
    await post(
      '/api/timeline',
      { dogId, autorName: 'Zuhause', datum: '2026-01-01', titel: 'Alte Neuigkeit', text: 'Erste Zeit war ruhig.' },
      home.cookie
    )
    await post(
      '/api/timeline',
      { dogId, autorName: 'Zuhause', datum: '2026-05-01', titel: 'Privates', text: 'Streng geheim.', privat: true },
      home.cookie
    )
    const photo = await uploadPng(base, home.cookie)
    const secondPhoto = await uploadPng(base, home.cookie)
    await post(
      '/api/timeline',
      {
        dogId,
        autorName: 'Zuhause',
        datum: '2026-06-15',
        titel: 'Neueste Neuigkeit',
        text: longText,
        fotoUrls: [photo, secondPhoto]
      },
      home.cookie
    )

    const list = await call(base, `/api/public/partners/${shelter.partnerSlug}/happy-ends`)
    assert.equal(list.status, 200)
    assert.equal(list.data.length, 1)

    const happyEnd = list.data[0]
    assert.equal(happyEnd.name, 'Nele')
    assert.equal(happyEnd.tierart, 'hund')
    assert.equal(happyEnd.entry.titel, 'Neueste Neuigkeit')
    assert.equal(happyEnd.entry.datum, '2026-06-15')
    // longText hat keine Leerzeichen -> Fallback-Schnitt genau bei 280 Zeichen + „…“ (281 insgesamt).
    assert.equal(happyEnd.entry.text.length, 281)
    assert.ok(happyEnd.entry.text.endsWith('…'), 'gekürzt mit „…“')
    assert.equal(happyEnd.entry.fotoUrl, `/public-media/${filenameOf(photo)}`, 'nur das ERSTE Foto des Eintrags')

    // NIE Namen oder sonstige Angaben zur neuen Familie - keine der bekannten Formen kommt in der
    // Antwort vor (ein reiner Substring-Test auf die numerische Familien-Id wäre unzuverlässig: eine
    // kleine Zahl wie "5" kann zufällig Teil eines Datums oder einer anderen Id sein).
    const json = JSON.stringify(happyEnd)
    assert.ok(!json.includes(home.data.name), 'Familienname taucht nirgends auf')
    assert.ok(
      !('familyId' in happyEnd) &&
        !('family' in happyEnd) &&
        !('owner' in happyEnd) &&
        !('ownerFamilyId' in happyEnd) &&
        !('homeId' in happyEnd),
      'keine Familien-Id in irgendeinem erwartbaren Feldnamen'
    )

    assert.equal(happyEnd.fotoUrl, `/public-media/${filenameOf(portrait)}`)

    // /public-media: das Titelbild (Portrait) des Tiers ist jetzt frei, weil story_consent=1 gilt -
    // ohne public_slug/vermittlung_status, die für ein adoptiertes Tier längst nicht mehr gelten.
    const dogDetail = db.prepare('SELECT foto_url, public_slug, vermittlung_status FROM dogs WHERE id = ?').get(dogId)
    assert.equal(dogDetail.foto_url, portrait, 'Portrait bleibt beim Umzug erhalten')
    assert.equal(dogDetail.public_slug, null, 'nicht mehr veröffentlicht')
    assert.equal(dogDetail.vermittlung_status, 'vermittelt')
    const portraitRes = await fetch(`${base}/public-media/${filenameOf(portrait)}`)
    assert.equal(portraitRes.status, 200)

    const firstPhotoRes = await fetch(`${base}/public-media/${filenameOf(photo)}`)
    assert.equal(firstPhotoRes.status, 200)

    // Das ZWEITE Foto desselben Eintrags bleibt 404 - nur "das erste Foto des gewählten Eintrags" ist frei.
    const secondPhotoRes = await fetch(`${base}/public-media/${filenameOf(secondPhoto)}`)
    assert.equal(secondPhotoRes.status, 404)

    // Ein weiteres, eigenes (nicht verlinktes) Foto des neuen Zuhauses bleibt ebenfalls 404.
    const strangerPhoto = await uploadPng(base, home.cookie)
    const strangerRes = await fetch(`${base}/public-media/${filenameOf(strangerPhoto)}`)
    assert.equal(strangerRes.status, 404)

    // Einwilligung widerrufen -> das Happy End verschwindet, /public-media liefert wieder 404
    const revoke = await put(`/api/dogs/${dogId}/shelter-share`, { enabled: false }, home.cookie)
    assert.equal(revoke.status, 200)
    const listAfterRevoke = await call(base, `/api/public/partners/${shelter.partnerSlug}/happy-ends`)
    assert.deepEqual(listAfterRevoke.data, [])
    const revokedPhotoRes = await fetch(`${base}/public-media/${filenameOf(photo)}`)
    assert.equal(revokedPhotoRes.status, 404)
    const revokedPortraitRes = await fetch(`${base}/public-media/${filenameOf(portrait)}`)
    assert.equal(revokedPortraitRes.status, 404)
  })

  await t.test('nur nicht-private Einträge zählen als "neuester Eintrag"; ohne einen einzigen bleibt das Tier außen vor', async () => {
    const shelter = await createShelter('Tierheim Nur Privat', 'tierheim-happy-privat')
    const { dogId, home } = await adoptDog(shelter, 'Momo', { tierart: 'anderes', storyConsent: true })

    await post(
      '/api/timeline',
      { dogId, autorName: 'Zuhause', datum: '2026-07-01', titel: 'Nur für uns', text: 'Bleibt privat.', privat: true },
      home.cookie
    )

    const list = await call(base, `/api/public/partners/${shelter.partnerSlug}/happy-ends`)
    assert.equal(list.status, 200)
    assert.deepEqual(list.data, [], 'kein zeigbarer Eintrag -> kein Happy End')
  })

  await t.test('höchstens sechs Happy Ends, auch wenn mehr Tiere die Einwilligung gegeben haben', async () => {
    const shelter = await createShelter('Tierheim Viele Happy Ends', 'tierheim-happy-viele')
    for (let i = 1; i <= 7; i += 1) {
      const { dogId, home } = await adoptDog(shelter, `Tier${i}`, { storyConsent: true })
      await post('/api/timeline', { dogId, autorName: 'Zuhause', datum: '2026-01-01', titel: `Neuigkeit ${i}` }, home.cookie)
    }

    const list = await call(base, `/api/public/partners/${shelter.partnerSlug}/happy-ends`)
    assert.equal(list.status, 200)
    assert.equal(list.data.length, 6)
  })

  // Feedback-Runde: Portale nennen keine Demo - "shelterDemo" (früher für "Demo als Tierheim ansehen") gibt es nicht mehr.
  await t.test('GET /api/public/partners/:slug meldet kein "shelterDemo" - auch nicht für Demo-Partner MIT Tierheim-Bereich', async () => {
    const realId = db
      .prepare("INSERT INTO partners (slug, name, typ, status, is_demo) VALUES ('echter-partner-happy', 'Echter Partner', 'tierheim', 'aktiv', 0)")
      .run().lastInsertRowid
    const demoId = db
      .prepare("INSERT INTO partners (slug, name, typ, status, is_demo) VALUES ('demo-partner-happy', 'Demo Partner', 'tierheim', 'aktiv', 1)")
      .run().lastInsertRowid
    assert.ok(realId && demoId)

    const real = await call(base, '/api/public/partners/echter-partner-happy')
    assert.equal(real.status, 200)
    assert.equal(real.data.shelterDemo, undefined)

    // APP_ENV=production (siehe useTempDataDir oben) -> ein Demo-Partner braucht ?demo=1 (demoAllowed).
    const beforeShelter = await call(base, '/api/public/partners/demo-partner-happy?demo=1')
    assert.equal(beforeShelter.status, 200)
    assert.equal('shelterDemo' in beforeShelter.data, false)

    const shelter = await post(`/api/admin/partners/${demoId}/shelter`, undefined, adminCookie)
    assert.equal(shelter.status, 201)

    const demo = await call(base, '/api/public/partners/demo-partner-happy?demo=1')
    assert.equal(demo.status, 200)
    assert.equal('shelterDemo' in demo.data, false)
  })
})
