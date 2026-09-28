const test = require('node:test')
const assert = require('node:assert/strict')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const ADMIN_TEST_PASSWORD = 'admin-test-steckbrief-1'
// APP_ENV=production für die ganze Datei (wie test/partnersDemoProd.test.js): appEnv wird beim ersten
// require('../config') fest eingelesen, ein Wechsel mitten in der Datei ist nicht möglich. Für alle
// Tests außer dem Demo-Sichtbarkeits-Test spielt das keine Rolle (demoAllowed() greift nur, wenn ein
// Partner tatsächlich is_demo=1 ist).
const dataDir = useTempDataDir('steckbrief', { APP_ENV: 'production' })

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

const filenameOf = (uploadUrl) => uploadUrl.split('/').pop()

test('Tiere in Vermittlung: Status, Kategorien, öffentlicher Steckbrief', async (t) => {
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')

  const adminLogin = await call(base, '/api/admin/login', { method: 'POST', body: { username: 'admin', password: ADMIN_TEST_PASSWORD } })
  const adminCookie = getCookie(adminLogin.res)

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })

  async function createShelter(name, slug) {
    const partner = await post('/api/admin/partners', { name, typ: 'tierheim', plz: '10115', status: 'aktiv', slug }, adminCookie)
    assert.equal(partner.status, 201)
    const shelter = await post(`/api/admin/partners/${partner.data.id}/shelter`, undefined, adminCookie)
    assert.equal(shelter.status, 201)
    const login = await post('/api/login', { secret: shelter.data.key }, null)
    assert.equal(login.status, 200)
    return {
      partnerId: partner.data.id,
      partnerSlug: partner.data.slug,
      familyId: shelter.data.familyId,
      cookie: getCookie(login.res)
    }
  }

  const sonnenhang = await createShelter('Tierheim Sonnenhang', 'tierheim-sonnenhang-steckbrief')
  const home = await createFamily(base, 'Zuhause ohne Tierheim', 'zuhause-kein-tierheim-1', { art: 'zuhause' })

  let pepperId
  let pepperSlug
  let dogPhotoFilename

  await t.test('vermittlungStatus nur im Tierheim-Bereich, nur gültige Werte', async () => {
    const outside = await post('/api/dogs', { name: 'Pepper', geschlecht: 'huendin', vermittlungStatus: 'in_vermittlung' }, home.cookie)
    assert.equal(outside.status, 400)

    const badValue = await post('/api/dogs', { name: 'Pepper', geschlecht: 'huendin', vermittlungStatus: 'ausgebucht' }, sonnenhang.cookie)
    assert.equal(badValue.status, 400)

    const created = await post(
      '/api/dogs',
      { name: 'Pepper', geschlecht: 'huendin', tierart: 'hund', vermittlungStatus: 'in_vermittlung' },
      sonnenhang.cookie
    )
    assert.equal(created.status, 201)
    assert.equal(created.data.vermittlung_status, 'in_vermittlung')
    pepperId = created.data.id

    const updated = await put(`/api/dogs/${pepperId}`, { vermittlungStatus: 'reserviert' }, sonnenhang.cookie)
    assert.equal(updated.status, 200)
    assert.equal(updated.data.vermittlung_status, 'reserviert')

    const cleared = await put(`/api/dogs/${pepperId}`, { vermittlungStatus: '' }, sonnenhang.cookie)
    assert.equal(cleared.status, 200)
    assert.equal(cleared.data.vermittlung_status, null)
    await put(`/api/dogs/${pepperId}`, { vermittlungStatus: 'in_vermittlung' }, sonnenhang.cookie)

    const homeDog = await post('/api/dogs', { name: 'Bello', geschlecht: 'ruede' }, home.cookie)
    assert.equal(homeDog.status, 201)
    const homeBad = await put(`/api/dogs/${homeDog.data.id}`, { vermittlungStatus: 'in_vermittlung' }, home.cookie)
    assert.equal(homeBad.status, 400)
  })

  await t.test('Steckbrief: veröffentlichen nur mit passendem Status, nur der Tierheim-Besitzer', async () => {
    await put(`/api/dogs/${pepperId}`, { vermittlungStatus: 'vermittelt' }, sonnenhang.cookie)
    const failPublish = await put(`/api/dogs/${pepperId}/steckbrief`, { published: true }, sonnenhang.cookie)
    assert.equal(failPublish.status, 400)

    await put(`/api/dogs/${pepperId}`, { vermittlungStatus: 'in_vermittlung' }, sonnenhang.cookie)

    const homeDog2 = await post('/api/dogs', { name: 'Nochn Hund', geschlecht: 'ruede' }, home.cookie)
    const notShelter = await put(`/api/dogs/${homeDog2.data.id}/steckbrief`, { published: true }, home.cookie)
    assert.equal(notShelter.status, 400)

    const invalidBody = await put(`/api/dogs/${pepperId}/steckbrief`, { published: 'yes' }, sonnenhang.cookie)
    assert.equal(invalidBody.status, 400)

    const published = await put(`/api/dogs/${pepperId}/steckbrief`, { published: true }, sonnenhang.cookie)
    assert.equal(published.status, 200)
    assert.match(published.data.public_slug, /^pepper-[a-z0-9]{6}$/)
    pepperSlug = published.data.public_slug

    const publicView = await call(base, `/api/public/animals/${pepperSlug}`)
    assert.equal(publicView.status, 200)
    assert.equal(publicView.data.name, 'Pepper')

    const unpublished = await put(`/api/dogs/${pepperId}/steckbrief`, { published: false }, sonnenhang.cookie)
    assert.equal(unpublished.status, 200)
    assert.equal(unpublished.data.public_slug, null)

    const gone = await call(base, `/api/public/animals/${pepperSlug}`)
    assert.equal(gone.status, 404)

    const republished = await put(`/api/dogs/${pepperId}/steckbrief`, { published: true }, sonnenhang.cookie)
    assert.equal(republished.status, 200)
    pepperSlug = republished.data.public_slug
  })

  await t.test('Kategorie und „im Steckbrief zeigen“ (isPublic) in Chronik-Einträgen', async () => {
    const badKategorie = await post(
      '/api/timeline',
      { dogId: pepperId, autorName: 'Team', datum: '2026-01-01', titel: 'X', kategorie: 'spielzeit' },
      sonnenhang.cookie
    )
    assert.equal(badKategorie.status, 400)

    const conflict = await post(
      '/api/timeline',
      { dogId: pepperId, autorName: 'Team', datum: '2026-01-01', titel: 'X', privat: true, isPublic: true },
      sonnenhang.cookie
    )
    assert.equal(conflict.status, 400)

    const homeDog3 = (await post('/api/dogs', { name: 'Nochn Hund 2', geschlecht: 'ruede' }, home.cookie)).data
    const notShelterPublic = await post(
      '/api/timeline',
      { dogId: homeDog3.id, autorName: 'X', datum: '2026-01-01', titel: 'X', isPublic: true },
      home.cookie
    )
    assert.equal(notShelterPublic.status, 400)

    const ok = await post(
      '/api/timeline',
      {
        dogId: pepperId,
        autorName: 'Team',
        datum: '2026-01-05',
        titel: 'Ankunft im Tierheim',
        text: 'Pepper ist da.',
        kategorie: 'ankunft',
        isPublic: true
      },
      sonnenhang.cookie
    )
    assert.equal(ok.status, 201)
    assert.equal(ok.data.kategorie, 'ankunft')
    assert.equal(ok.data.is_public, 1)

    // Ein Eintrag ohne isPublic/kategorie bleibt wie bisher (null/0)
    const plain = await post(
      '/api/timeline',
      { dogId: pepperId, autorName: 'Team', datum: '2026-01-04', titel: 'Notiz' },
      sonnenhang.cookie
    )
    assert.equal(plain.status, 201)
    assert.equal(plain.data.kategorie, null)
    assert.equal(plain.data.is_public, 0)
  })

  await t.test('öffentlicher Steckbrief: nur öffentliche Einträge, Fotos nur wenn freigegeben', async () => {
    const dogPhoto = await uploadPng(base, sonnenhang.cookie)
    dogPhotoFilename = filenameOf(dogPhoto)
    await put(`/api/dogs/${pepperId}`, { fotoUrl: dogPhoto }, sonnenhang.cookie)

    const publicPhoto = await uploadPng(base, sonnenhang.cookie)
    const publicEntry = await post(
      '/api/timeline',
      {
        dogId: pepperId,
        autorName: 'Team',
        datum: '2026-01-06',
        titel: 'Tierarzt-Check',
        kategorie: 'tierarzt',
        isPublic: true,
        fotoUrls: [publicPhoto]
      },
      sonnenhang.cookie
    )
    assert.equal(publicEntry.status, 201)

    const privatePhoto = await uploadPng(base, sonnenhang.cookie)
    const privateEntry = await post(
      '/api/timeline',
      {
        dogId: pepperId,
        autorName: 'Team',
        datum: '2026-01-07',
        titel: 'Verhaltensnotiz (intern)',
        kategorie: 'verhalten',
        privat: true,
        fotoUrls: [privatePhoto]
      },
      sonnenhang.cookie
    )
    assert.equal(privateEntry.status, 201)

    const internalPhoto = await uploadPng(base, sonnenhang.cookie)
    const internalEntry = await post(
      '/api/timeline',
      {
        dogId: pepperId,
        autorName: 'Team',
        datum: '2026-01-08',
        titel: 'Notiz nicht öffentlich',
        kategorie: 'sonstiges',
        fotoUrls: [internalPhoto]
      },
      sonnenhang.cookie
    )
    assert.equal(internalEntry.status, 201)

    const view = await call(base, `/api/public/animals/${pepperSlug}`)
    assert.equal(view.status, 200)
    const titles = view.data.entries.map((e) => e.titel)
    assert.ok(titles.includes('Ankunft im Tierheim'))
    assert.ok(titles.includes('Tierarzt-Check'))
    assert.ok(!titles.includes('Verhaltensnotiz (intern)'))
    assert.ok(!titles.includes('Notiz nicht öffentlich'))

    assert.equal(view.data.fotoUrl, `/public-media/${dogPhotoFilename}`)

    const publicEntryView = view.data.entries.find((e) => e.titel === 'Tierarzt-Check')
    assert.deepEqual(publicEntryView.fotoUrls, [`/public-media/${filenameOf(publicPhoto)}`])

    const dogPhotoRes = await fetch(`${base}/public-media/${dogPhotoFilename}`)
    assert.equal(dogPhotoRes.status, 200)
    assert.equal(dogPhotoRes.headers.get('cache-control'), 'public, max-age=3600')

    const publicPhotoRes = await fetch(`${base}/public-media/${filenameOf(publicPhoto)}`)
    assert.equal(publicPhotoRes.status, 200)

    const privatePhotoRes = await fetch(`${base}/public-media/${filenameOf(privatePhoto)}`)
    assert.equal(privatePhotoRes.status, 404)

    const internalPhotoRes = await fetch(`${base}/public-media/${filenameOf(internalPhoto)}`)
    assert.equal(internalPhotoRes.status, 404)

    // Ein fremder, nirgends verlinkter Upload bleibt ebenfalls 404
    const strangerUpload = await uploadPng(base, home.cookie)
    const strangerRes = await fetch(`${base}/public-media/${filenameOf(strangerUpload)}`)
    assert.equal(strangerRes.status, 404)

    // Ungültige Dateinamen (Pfad-Traversal, falsche Endung) -> 404, nie 500
    const badName = await fetch(`${base}/public-media/foo.txt`)
    assert.equal(badName.status, 404)
  })

  await t.test('X-Robots-Tag: noindex auf /api/public/animals und /public-media', async () => {
    const view = await fetch(`${base}/api/public/animals/${pepperSlug}`)
    assert.equal(view.headers.get('x-robots-tag'), 'noindex')

    const media = await fetch(`${base}/public-media/${dogPhotoFilename}`)
    assert.equal(media.headers.get('x-robots-tag'), 'noindex')
  })

  await t.test('GET /api/public/partners/:slug/animals: nur veröffentlichte, vermittelbare Tiere', async () => {
    const sunny = await post(
      '/api/dogs',
      { name: 'Sunny', geschlecht: 'huendin', tierart: 'katze', vermittlungStatus: 'in_vermittlung' },
      sonnenhang.cookie
    )
    assert.equal(sunny.status, 201)
    // Sunny bleibt unveröffentlicht -> erscheint nicht in der Liste

    const list = await call(base, `/api/public/partners/${sonnenhang.partnerSlug}/animals`)
    assert.equal(list.status, 200)
    const names = list.data.map((a) => a.name)
    assert.ok(names.includes('Pepper'))
    assert.ok(!names.includes('Sunny'))

    const pepperCard = list.data.find((a) => a.name === 'Pepper')
    assert.equal(pepperCard.slug, pepperSlug)
    assert.equal(pepperCard.vermittlung_status, 'in_vermittlung')
    assert.equal(pepperCard.fotoUrl, `/public-media/${dogPhotoFilename}`)

    const unknownPartner = await call(base, '/api/public/partners/kein-partner/animals')
    assert.equal(unknownPartner.status, 404)
  })

  await t.test('Demo-Sichtbarkeit (appEnv production): Tierheim-Tiere folgen derselben Regel wie Demo-Partner', async () => {
    const config = require('../config')
    assert.equal(config.appEnv, 'production')

    const demoShelter = await createShelter('Tierheim Sonnenhang Demo', 'tierheim-sonnenhang-demo')
    db.prepare('UPDATE partners SET is_demo = 1 WHERE id = ?').run(demoShelter.partnerId)

    const demoDog = await post(
      '/api/dogs',
      { name: 'Momo', geschlecht: 'ruede', tierart: 'anderes', vermittlungStatus: 'in_vermittlung' },
      demoShelter.cookie
    )
    assert.equal(demoDog.status, 201)
    const publish = await put(`/api/dogs/${demoDog.data.id}/steckbrief`, { published: true }, demoShelter.cookie)
    assert.equal(publish.status, 200)
    const demoSlug = publish.data.public_slug

    const withoutDemo = await call(base, `/api/public/animals/${demoSlug}`)
    assert.equal(withoutDemo.status, 404)

    const withDemoParam = await call(base, `/api/public/animals/${demoSlug}?demo=1`)
    assert.equal(withDemoParam.status, 200)
    assert.equal(withDemoParam.data.name, 'Momo')

    const listWithoutDemo = await call(base, `/api/public/partners/${demoShelter.partnerSlug}/animals`)
    assert.equal(listWithoutDemo.status, 404)

    const listWithDemo = await call(base, `/api/public/partners/${demoShelter.partnerSlug}/animals?demo=1`)
    assert.equal(listWithDemo.status, 200)
    assert.ok(listWithDemo.data.some((a) => a.name === 'Momo'))

    // Eine gültige Demo-Familien-Sitzung sieht es auch ohne ?demo=1 (wie partnersDemoProd.test.js)
    const demoHome = await createFamily(base, 'Demo-Zuhause Steckbrief', 'demo-zuhause-steckbrief-1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoHome.data.id)
    const withSession = await call(base, `/api/public/animals/${demoSlug}`, { cookie: demoHome.cookie })
    assert.equal(withSession.status, 200)

    // eine normale (nicht-Demo) Sitzung bekommt weiterhin kein Demo-Tier
    const realHome = await createFamily(base, 'Echtes Zuhause Steckbrief', 'echtes-zuhause-steckbrief-1')
    const withRealSession = await call(base, `/api/public/animals/${demoSlug}`, { cookie: realHome.cookie })
    assert.equal(withRealSession.status, 404)
  })
})
