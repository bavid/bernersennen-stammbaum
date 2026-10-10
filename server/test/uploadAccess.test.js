const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
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

  // A ist ein Zuhause (Meine Chronik) - so lässt es sich später auch einem Rudel R anschließen.
  // B bleibt im ganzen Test ein unbeteiligter, aber eingeloggter Fremder - anders als in einer
  // früheren Fassung wird B NICHT später zur Demo umgeflaggt, damit "B als Fremder" immer sauber ist.
  const A = await createFamily(base, 'Zuhause A', 'passwort-a1', { art: 'zuhause' })
  const B = await createFamily(base, 'Rudel B', 'passwort-b1')

  const photoUrl = await uploadPng(base, A.cookie)
  const filename = photoUrl.split('/').pop()
  const bPhotoUrl = await uploadPng(base, B.cookie)

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

  await t.test('die öffentliche Demo bekommt 404 (eine eigene Demo-Familie, nicht B)', async () => {
    const demoSource = await createFamily(base, 'Rudel Demo-Quelle', 'passwort-demo1')
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(demoSource.data.id)
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

  await t.test('Schreib-Seite: eine fremde Foto-URL an den eigenen Hund hängen -> 400, nicht dauerhaft sichtbar', async () => {
    const attempt = await post('/api/dogs', { name: 'Dieb', geschlecht: 'ruede', fotoUrl: photoUrl }, B.cookie)
    assert.equal(attempt.status, 400)
    assert.match(attempt.data.error, /Foto nicht gefunden/)

    // B hat dadurch keinen dauerhaften Zugriff auf A's Foto gewonnen
    const stillHidden = await fetch(`${base}${photoUrl}`, { headers: { Cookie: B.cookie } })
    assert.equal(stillHidden.status, 404)

    // aber die eigene, frische Foto-URL darf B natürlich an den eigenen Hund hängen
    const ownDog = await post('/api/dogs', { name: 'Fund', geschlecht: 'ruede', fotoUrl: bPhotoUrl }, B.cookie)
    assert.equal(ownDog.status, 201)
    assert.equal(ownDog.data.foto_url, bPhotoUrl)
  })

  await t.test('Schreib-Seite: eine fremde Foto-URL in einen Chronik-Eintrag hängen -> 400', async () => {
    const bDog = (await post('/api/dogs', { name: 'Nachbar', geschlecht: 'huendin' }, B.cookie)).data
    const attempt = await post(
      '/api/timeline',
      { dogId: bDog.id, autorName: 'B', datum: '2026-03-01', titel: 'Klau', fotoUrls: [photoUrl] },
      B.cookie
    )
    assert.equal(attempt.status, 400)
    assert.match(attempt.data.error, /Foto nicht gefunden/)

    const stillHidden = await fetch(`${base}${photoUrl}`, { headers: { Cookie: B.cookie } })
    assert.equal(stillHidden.status, 404)
  })

  await t.test('Schreib-Seite: eine fremde Foto-URL in einen Wurf-Eintrag hängen -> 400', async () => {
    const bMutter = (await post('/api/dogs', { name: 'Mutter B', geschlecht: 'huendin' }, B.cookie)).data
    const attempt = await post(
      '/api/breeding',
      { mutterDogId: bMutter.id, datum: '2026-03-02', fotoUrls: [photoUrl] },
      B.cookie
    )
    assert.equal(attempt.status, 400)
    assert.match(attempt.data.error, /Foto nicht gefunden/)

    const stillHidden = await fetch(`${base}${photoUrl}`, { headers: { Cookie: B.cookie } })
    assert.equal(stillHidden.status, 404)

    // die eigene, frische Foto-URL darf B natürlich in einen eigenen Wurf-Eintrag hängen
    const own = await post('/api/breeding', { mutterDogId: bMutter.id, datum: '2026-03-02', fotoUrls: [bPhotoUrl] }, B.cookie)
    assert.equal(own.status, 201)
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

  await t.test('Wurf-Fotos werden nicht geteilt, selbst wenn der Hund geteilt ist', async () => {
    const mutter = (await post('/api/dogs', { name: 'Mira', geschlecht: 'huendin' }, A.cookie)).data
    const breedingPhotoUrl = await uploadPng(base, A.cookie)
    const event = await post('/api/breeding', { mutterDogId: mutter.id, datum: '2026-02-03', fotoUrls: [breedingPhotoUrl] }, A.cookie)
    assert.equal(event.status, 201)

    const asOwner = await fetch(`${base}${breedingPhotoUrl}`, { headers: { Cookie: A.cookie } })
    assert.equal(asOwner.status, 200)

    // R ist Mitglied desselben Rudels wie der (hier gar nicht geteilte) Hund Keks - trotzdem: kein Zugriff
    const asR = await fetch(`${base}${breedingPhotoUrl}`, { headers: { Cookie: R.cookie } })
    assert.equal(asR.status, 404)
  })

  await t.test('ungültige Dateinamen (Pfad-Traversal, falsche Endung) -> 404, nie 500', async () => {
    const traversal = await rawGet(base, '/uploads/../data.db', A.cookie)
    assert.equal(traversal.status, 404)

    const encodedTraversal = await fetch(`${base}/uploads/%2e%2e%2fdata.db`, { headers: { Cookie: A.cookie } })
    assert.equal(encodedTraversal.status, 404)

    const wrongExt = await fetch(`${base}/uploads/foo.txt`, { headers: { Cookie: A.cookie } })
    assert.equal(wrongExt.status, 404)
  })

  await t.test('Altbestand: Hundefoto ohne uploads-Zeile bleibt sichtbar, unveränderte PUTs funktionieren weiter', async () => {
    // Simuliert einen Datensatz von vor Task 3 (z. B. Demo-Pack-Bilder oder Produktionsdaten aus der
    // Zeit vor der uploads-Tabelle bzw. vor strengeren Dateiendungen, siehe FILENAME_RE-Kommentar in
    // lib/uploadAccess.js): die Datei existiert auf der Platte und steht schon in dogs.foto_url, ist
    // aber nie über POST /api/uploads gelaufen (keine Zeile in "uploads") - direkt in der DB gesetzt,
    // nicht über die API, weil genau die API jetzt (zu Recht) das Neu-Anhängen verweigern würde.
    const legacyPhoto = await uploadPng(base, A.cookie)
    const legacyFilename = legacyPhoto.split('/').pop()
    const legacyDog = (await post('/api/dogs', { name: 'Opa', geschlecht: 'ruede' }, A.cookie)).data
    db.prepare('UPDATE dogs SET foto_url = ? WHERE id = ?').run(legacyPhoto, legacyDog.id)
    db.prepare('DELETE FROM uploads WHERE filename = ?').run(legacyFilename)
    assert.equal(canSeeUpload({ familyId: A.data.id, homeId: A.data.id }, legacyFilename), true, 'übers Hundefoto selbst weiter sichtbar')

    const asOwner = await fetch(`${base}${legacyPhoto}`, { headers: { Cookie: A.cookie } })
    assert.equal(asOwner.status, 200)
    const asStranger = await fetch(`${base}${legacyPhoto}`, { headers: { Cookie: B.cookie } })
    assert.equal(asStranger.status, 404)

    // Unverändertes PUT (ein anderes Feld ändert sich, fotoUrl wird nicht mitgeschickt -> bleibt der
    // bisherige Wert) funktioniert weiter
    const keepUnchanged = await put(`/api/dogs/${legacyDog.id}`, { beschreibung: 'Guter Opa' }, A.cookie)
    assert.equal(keepUnchanged.status, 200)
    assert.equal(keepUnchanged.data.foto_url, legacyPhoto)

    // Auch ein PUT, das dieselbe Legacy-URL explizit erneut mitschickt, funktioniert
    const resendSame = await put(`/api/dogs/${legacyDog.id}`, { fotoUrl: legacyPhoto }, A.cookie)
    assert.equal(resendSame.status, 200)

    // Wechselt A dagegen zu einer fremden, nicht sichtbaren URL, bleibt es beim Fehler - und der
    // bisherige (legale) Wert bleibt unangetastet stehen
    const switchToForeign = await put(`/api/dogs/${legacyDog.id}`, { fotoUrl: bPhotoUrl }, A.cookie)
    assert.equal(switchToForeign.status, 400)
    assert.equal(db.prepare('SELECT foto_url FROM dogs WHERE id = ?').get(legacyDog.id).foto_url, legacyPhoto)
  })

  await t.test('Bereichs-Identität: Upload während R aktiv ist, ist für andere Mitglieder sichtbar, die auch in R sind', async () => {
    const Z2 = await createFamily(base, 'Zuhause Z2', 'passwort-z2-1', { art: 'zuhause' })
    const joinZ2 = await post('/api/families/join', { password: 'passwort-r1' }, Z2.cookie)
    assert.equal(joinZ2.status, 200)

    const viewA = await post('/api/view', { familyId: R.data.id }, A.cookie)
    assert.equal(viewA.status, 200)
    const aAsR = getCookie(viewA.res)
    const uploadedWhileR = await uploadPng(base, aAsR)

    const viewZ2 = await post('/api/view', { familyId: R.data.id }, Z2.cookie)
    assert.equal(viewZ2.status, 200)
    const z2AsR = getCookie(viewZ2.res)

    const res = await fetch(`${base}${uploadedWhileR}`, { headers: { Cookie: z2AsR } })
    assert.equal(res.status, 200)
  })

  await t.test('Bereichs-Identität: ein Zuhause-Upload bleibt für seinen Eigentümer sichtbar, auch wenn gerade R aktiv ist', async () => {
    const homeUpload = await uploadPng(base, A.cookie) // A ist hier in seinem eigenen Bereich (homeId = familyId) aktiv

    const viewA = await post('/api/view', { familyId: R.data.id }, A.cookie)
    assert.equal(viewA.status, 200)
    const aAsR = getCookie(viewA.res)

    const res = await fetch(`${base}${homeUpload}`, { headers: { Cookie: aAsR } })
    assert.equal(res.status, 200)
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

  await t.test('security-review Phase T Finding 12: EXIF-Metadaten werden beim Hochladen aus JPEGs entfernt', async () => {
    // Synthetisches JPEG mit einem APP1-Exif-Segment - dieselbe Bauweise wie test/stripImageMetadata.test.js.
    function jpegSegment(marker, payload) {
      const length = Buffer.alloc(2)
      length.writeUInt16BE(payload.length + 2, 0)
      return Buffer.concat([Buffer.from([0xff, marker]), length, payload])
    }
    const exifSegment = jpegSegment(
      0xe1,
      Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0xca, 0xfe])])
    )
    const jpegWithExif = Buffer.concat([
      Buffer.from([0xff, 0xd8]), // SOI
      exifSegment,
      jpegSegment(0xda, Buffer.from([0x00, 0x01, 0x02])), // SOS
      Buffer.from([0x12, 0x34, 0x56]), // "Bilddaten"
      Buffer.from([0xff, 0xd9]) // EOI
    ])
    assert.ok(jpegWithExif.includes('Exif'))

    const form = new FormData()
    form.append('file', new Blob([jpegWithExif], { type: 'image/jpeg' }), 'photo.jpg')
    const uploadRes = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: A.cookie }, body: form })
    assert.equal(uploadRes.status, 201)
    const { url } = await uploadRes.json()

    const storedPath = path.join(config.uploadDir, url.split('/').pop())
    const stored = fs.readFileSync(storedPath)
    assert.equal(stored.includes('Exif'), false, 'das gespeicherte Foto trägt kein EXIF-Segment mehr')
    // Die eigentlichen "Bilddaten" (SOI/SOS/Scan/EOI) bleiben vollständig erhalten
    assert.equal(stored.subarray(0, 2).toString('hex'), 'ffd8')
    assert.equal(stored.subarray(-2).toString('hex'), 'ffd9')
    assert.ok(stored.includes(Buffer.from([0x12, 0x34, 0x56])))

    // Die Datei bleibt über die normale Zugriffsprüfung weiterhin abrufbar (nichts an der Route
    // kaputt gegangen)
    const served = await fetch(`${base}${url}`, { headers: { Cookie: A.cookie } })
    assert.equal(served.status, 200)

    // Handy-Anhang nach EOI: kein Ablehnungsgrund - die Bytes nach EOI werden abgeschnitten.
    const trailerForm = new FormData()
    const withTrailer = Buffer.concat([jpegWithExif, Buffer.from('Anhang mit Exif', 'latin1')])
    trailerForm.append('file', new Blob([withTrailer], { type: 'image/jpeg' }), 'handy.jpg')
    const trailerRes = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: A.cookie }, body: trailerForm })
    assert.equal(trailerRes.status, 201)
    const trimmed = fs.readFileSync(path.join(config.uploadDir, (await trailerRes.json()).url.split('/').pop()))
    assert.equal(trimmed.subarray(-2).toString('hex'), 'ffd9')
    assert.equal(trimmed.includes('Exif'), false)

    // Fail closed: kaputtes JPEG (Segmentlänge zeigt übers Ende) -> 400, nichts gespeichert.
    const brokenForm = new FormData()
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8]), exifSegment.subarray(0, 12)])
    brokenForm.append('file', new Blob([broken], { type: 'image/jpeg' }), 'kaputt.jpg')
    const filesBefore = fs.readdirSync(config.uploadDir).length
    const brokenRes = await fetch(`${base}/api/uploads`, { method: 'POST', headers: { Cookie: A.cookie }, body: brokenForm })
    assert.equal(brokenRes.status, 400)
    assert.match((await brokenRes.json()).error, /nicht lesen/)
    assert.equal(fs.readdirSync(config.uploadDir).length, filesBefore)
  })
})
