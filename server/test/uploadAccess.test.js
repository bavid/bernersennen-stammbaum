const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { hashPassword } = require('../lib/adminAuth')
const { useTempDataDir, startApp, cleanup, call, createFamily, getCookie } = require('./helpers')

const ADMIN_TEST_PASSWORD = 'admin-test-passwort-1'
// Viele Login/Join-Aufrufe wie context.test.js/sharing.test.js: Standard-Rate-Limit lockern
const dataDir = useTempDataDir('upload-access', { LOGIN_RATE_LIMIT: '200' })

async function uploadPng(base, cookie) {
  const form = new FormData()
  form.append('file', new Blob(['PNG'], { type: 'image/png' }), 'a.png')
  const res = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  return (await res.json()).url
}

// Rohe HTTP-Anfrage ohne die URL-Normalisierung, die fetch()/WHATWG-URL auf ".." anwenden -
// damit "/uploads/../data.db" auch wirklich als solcher beim Server ankommt.
function rawGet(base, urlPath, cookie) {
  const { hostname, port } = new URL(base)
  const headers = cookie ? { Cookie: cookie } : {}
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname, port, path: urlPath, method: 'GET', headers }, (res) => {
      res.resume()
      res.on('end', () => resolve({ status: res.statusCode }))
    })
    req.on('error', reject)
    req.end()
  })
}

test('Fotos nur für Bereiche, die sie sehen dürfen', async (t) => {
  // Muss vor startApp() (und damit vor dem ersten require von config) gesetzt sein - siehe admin.test.js
  process.env.ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_TEST_PASSWORD)
  const { server, base } = await startApp()
  const config = require('../config')
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { canSeeUpload, FILENAME_RE } = require('../lib/uploadAccess')

  const post = (urlPath, body, cookie) => call(base, urlPath, { method: 'POST', body, cookie })
  const put = (urlPath, body, cookie) => call(base, urlPath, { method: 'PUT', body, cookie })

  // A ist ein Zuhause (Meine Chronik) - so lässt es sich später auch einem Rudel R anschließen
  const A = await createFamily(base, 'Zuhause A', 'passwort-a1', { art: 'zuhause' })
  const B = await createFamily(base, 'Rudel B', 'passwort-b1')

  const photoUrl = await uploadPng(base, A.cookie)
  const filename = photoUrl.split('/').pop()

  await t.test('Dateinamen-Form: FILENAME_RE passt nur auf echte Upload-Namen', () => {
    assert.match(filename, FILENAME_RE)
    assert.equal(FILENAME_RE.test('foo.txt'), false)
    assert.equal(FILENAME_RE.test('../data.db'), false)
    assert.equal(FILENAME_RE.test('a1.jpg'), false)
    assert.equal(FILENAME_RE.test(`${filename.replace('.png', '.jpeg')}`), false, 'jpeg wird nie erzeugt, nur jpg')
  })

  await t.test('A kann das eigene, frische (noch keinem Hund zugeordnete) Foto abrufen', async () => {
    const res = await fetch(`${base}${photoUrl}`, { headers: { Cookie: A.cookie } })
    assert.equal(res.status, 200)
    assert.equal(canSeeUpload({ familyId: A.data.id, homeId: A.data.id }, filename), true)
  })

  await t.test('ein fremdes, eingeloggtes Rudel B bekommt 404, nicht 403', async () => {
    const res = await fetch(`${base}${photoUrl}`, { headers: { Cookie: B.cookie } })
    assert.equal(res.status, 404)
    assert.equal(canSeeUpload({ familyId: B.data.id, homeId: B.data.id }, filename), false)
  })

  await t.test('die öffentliche Demo bekommt 404', async () => {
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(B.data.id)
    const demoLogin = await call(base, '/api/demo', { method: 'POST' })
    assert.equal(demoLogin.status, 200)
    const demoCookie = getCookie(demoLogin.res)

    const res = await fetch(`${base}${photoUrl}`, { headers: { Cookie: demoCookie } })
    assert.equal(res.status, 404)
  })

  await t.test('anonym bleibt es beim heutigen Status: 401', async () => {
    const res = await fetch(`${base}${photoUrl}`)
    assert.equal(res.status, 401)
  })

  let R
  let dog
  let dogPhotoUrl
  let privateEntryPhotoUrl

  await t.test('A tritt Rudel R bei, hängt ein frisches Foto an einen Hund und teilt ihn nach R', async () => {
    R = await createFamily(base, 'Rudel R', 'passwort-r1')
    const join = await post('/api/families/join', { password: 'passwort-r1' }, A.cookie)
    assert.equal(join.status, 200)

    dogPhotoUrl = await uploadPng(base, A.cookie)
    dog = (await post('/api/dogs', { name: 'Keks', geschlecht: 'ruede', fotoUrl: dogPhotoUrl }, A.cookie)).data
    assert.equal(dog.foto_url, dogPhotoUrl)

    const share = await put(`/api/dogs/${dog.id}/shares`, { familyIds: [R.data.id] }, A.cookie)
    assert.equal(share.status, 200)
  })

  await t.test('R sieht das Hundefoto des geteilten Tiers', async () => {
    const res = await fetch(`${base}${dogPhotoUrl}`, { headers: { Cookie: R.cookie } })
    assert.equal(res.status, 200)
  })

  await t.test('ein Foto, das nur in einem privaten Eintrag des geteilten Hundes steckt, bleibt für R 404', async () => {
    privateEntryPhotoUrl = await uploadPng(base, A.cookie)
    const entry = await post(
      '/api/timeline',
      {
        dogId: dog.id,
        autorName: 'A',
        datum: '2026-02-01',
        titel: 'Tierarzt',
        privat: true,
        fotoUrls: [privateEntryPhotoUrl]
      },
      A.cookie
    )
    assert.equal(entry.status, 201)
    assert.equal(entry.data.privat, 1)

    // A selbst sieht es natürlich weiterhin (eigener, wenn auch privater Eintrag)
    const asOwner = await fetch(`${base}${privateEntryPhotoUrl}`, { headers: { Cookie: A.cookie } })
    assert.equal(asOwner.status, 200)

    const asR = await fetch(`${base}${privateEntryPhotoUrl}`, { headers: { Cookie: R.cookie } })
    assert.equal(asR.status, 404)
  })

  await t.test('ein öffentlicher (nicht-privater) Eintrag mit Foto ist für R dagegen sichtbar', async () => {
    const publicPhotoUrl = await uploadPng(base, A.cookie)
    const entry = await post(
      '/api/timeline',
      { dogId: dog.id, autorName: 'A', datum: '2026-02-02', titel: 'Spaziergang', fotoUrls: [publicPhotoUrl] },
      A.cookie
    )
    assert.equal(entry.status, 201)
    assert.equal(entry.data.privat, 0)

    const res = await fetch(`${base}${publicPhotoUrl}`, { headers: { Cookie: R.cookie } })
    assert.equal(res.status, 200)
  })

  await t.test('ungültige Dateinamen (Pfad-Traversal, falsche Endung) -> 404, nie 500', async () => {
    const traversal = await rawGet(base, '/uploads/../data.db', A.cookie)
    assert.equal(traversal.status, 404)

    const encodedTraversal = await fetch(`${base}/uploads/%2e%2e%2fdata.db`, { headers: { Cookie: A.cookie } })
    assert.equal(encodedTraversal.status, 404)

    const wrongExt = await fetch(`${base}/uploads/foo.txt`, { headers: { Cookie: A.cookie } })
    assert.equal(wrongExt.status, 404)
  })

  await t.test('Altbestand: Datei ohne uploads-Zeile, aber als Hundefoto referenziert - Eigentümer ja, Fremde nein', async () => {
    // Simuliert ein Foto von vor Task 3 (z. B. Demo-Pack-Bilder): existiert auf der Platte und im
    // dogs.foto_url, aber nie über POST /api/uploads gelaufen -> keine Zeile in "uploads".
    const legacyDog = (await post('/api/dogs', { name: 'Opa', geschlecht: 'ruede' }, A.cookie)).data
    const legacyPhoto = await uploadPng(base, A.cookie)
    const legacyFilename = legacyPhoto.split('/').pop()
    db.prepare('DELETE FROM uploads WHERE filename = ?').run(legacyFilename)
    await put(`/api/dogs/${legacyDog.id}`, { fotoUrl: legacyPhoto }, A.cookie)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM uploads WHERE filename = ?').get(legacyFilename).c, 0)

    const asOwner = await fetch(`${base}${legacyPhoto}`, { headers: { Cookie: A.cookie } })
    assert.equal(asOwner.status, 200)

    const asStranger = await fetch(`${base}${legacyPhoto}`, { headers: { Cookie: B.cookie } })
    assert.equal(asStranger.status, 404)
  })

  await t.test('Admin sieht jedes existierende Foto, egal wem es gehört', async () => {
    const login = await call(base, '/api/admin/login', {
      method: 'POST',
      body: { username: config.adminUsername, password: ADMIN_TEST_PASSWORD }
    })
    assert.equal(login.status, 200)
    const adminCookie = getCookie(login.res)

    const res = await fetch(`${base}${photoUrl}`, { headers: { Cookie: adminCookie } })
    assert.equal(res.status, 200)
    const res2 = await fetch(`${base}${dogPhotoUrl}`, { headers: { Cookie: adminCookie } })
    assert.equal(res2.status, 200)
  })
})
