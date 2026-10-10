const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup, call, createFamily, createHousehold, getCookie } = require('./helpers')
const { jpegSegment, sof0, TINY_JPEG } = require('./imageFixtures')

const dataDir = useTempDataDir('profil', { LOGIN_RATE_LIMIT: '300', CODE_RATE_LIMIT: '300' })

// Handyfoto mit APP1-Exif-Segment (Aufnahmeort) - muss beim Hochladen verschwinden.
const JPEG_WITH_EXIF = Buffer.concat([
  Buffer.from([0xff, 0xd8]),
  jpegSegment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0, 0, 0, 8, 0xca, 0xfe])])),
  sof0(400, 400),
  jpegSegment(0xda, Buffer.from([0x00, 0x01, 0x02])),
  Buffer.from([0x12, 0x34, 0xff, 0xd9])
])

async function uploadBild(base, cookie, { bytes = TINY_JPEG, type = 'image/jpeg', name = 'bild.jpg' } = {}) {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type }), name)
  const res = await fetch(`${base}/api/profil/bild`, { method: 'POST', headers: { Cookie: cookie }, body: form })
  const text = await res.text()
  return { status: res.status, data: text ? JSON.parse(text) : null }
}

async function getBild(base, url, cookie) {
  const res = await fetch(`${base}${url}`, { headers: cookie ? { Cookie: cookie } : {} })
  return { status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: res.headers }
}

const fileOf = (url) => path.join(dataDir, 'uploads', fs.readdirSync(path.join(dataDir, 'uploads')).find((name) => url.includes(name.slice(0, 8))))

// Euer Name (Person) und das Bild eines Zuhauses bzw. einer Familie (lib/profil.js, routes/profil.js).
test('Profil: Name der Person, Bild für Zuhause und Familie, Rechte, Sichtbarkeit, Löschen', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const db = require('../db')
  const { deleteFamily, removeUploads } = require('../lib/families')

  const home = await createHousehold(base, 'Zuhause am Deich')
  const withUser = await createHousehold(base, 'Zuhause Birkenhof', { username: 'birke', password: 'birke-passwort-1' })
  const stranger = await createHousehold(base, 'Zuhause Fremdweg')
  const rudel = await createFamily(base, 'Familie Sonnenhang', 'sonnenhang-pass-1')
  const rudelId = rudel.data.id
  const homeId = home.data.home?.id ?? home.data.id
  const strangerId = stranger.data.home?.id ?? stranger.data.id
  const birkeId = withUser.data.home?.id ?? withUser.data.id
  db.prepare("INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, 'leitung')").run(homeId, rudelId)
  db.prepare("INSERT INTO family_members (member_family_id, group_family_id, rolle) VALUES (?, ?, 'gast')").run(birkeId, rudelId)
  // Bereich wechseln: die Sitzung bekommt ein neues Cookie (refreshSession).
  const view = async (session, familyId) => {
    const res = await call(base, '/api/view', { method: 'POST', cookie: session.cookie, body: { familyId } })
    assert.equal(res.status, 200)
    session.cookie = getCookie(res.res)
  }
  const putName = (cookie, body) => call(base, '/api/profil/name', { method: 'PUT', cookie, body })

  await t.test('Name: gespeichert je Zuhause, in /me als person.anzeigename, leer löscht', async () => {
    assert.equal((await call(base, '/api/me', { cookie: home.cookie })).data.person.anzeigename, null)
    const res = await putName(home.cookie, { anzeigename: '  Anke  ' })
    assert.equal(res.status, 200)
    assert.equal(res.data.anzeigename, 'Anke')
    assert.equal((await call(base, '/api/me', { cookie: home.cookie })).data.person.anzeigename, 'Anke')
    assert.equal((await call(base, '/api/me', { cookie: stranger.cookie })).data.person.anzeigename, null)
  })

  await t.test('Name: Prüfung - Text, höchstens 40 Zeichen, keine Steuerzeichen', async () => {
    for (const body of [{ anzeigename: 42 }, { anzeigename: 'x'.repeat(41) }, { anzeigename: 'An\nke' }, {}, null]) {
      assert.equal((await putName(home.cookie, body)).status, 400, JSON.stringify(body))
    }
    assert.equal((await call(base, '/api/me', { cookie: home.cookie })).data.person.anzeigename, 'Anke')
  })

  await t.test('Name: Benutzer-Sitzung speichert am Benutzer, die Schlüssel-Sitzung am Zuhause', async () => {
    const login = await call(base, '/api/login', { method: 'POST', body: { username: 'birke', password: 'birke-passwort-1' } })
    const userCookie = getCookie(login.res)
    assert.equal((await putName(userCookie, { anzeigename: 'Jonas' })).data.anzeigename, 'Jonas')
    assert.equal((await call(base, '/api/me', { cookie: userCookie })).data.person.anzeigename, 'Jonas')
    // Die Schlüssel-Sitzung desselben Zuhauses hat (noch) keinen eigenen Namen - sie zeigt den des Benutzers nicht.
    assert.equal((await call(base, '/api/me', { cookie: withUser.cookie })).data.person.anzeigename, null)
    await putName(withUser.cookie, { anzeigename: 'Greta' })
    assert.equal((await call(base, '/api/me', { cookie: userCookie })).data.person.anzeigename, 'Jonas')
    // Benutzer weg -> sein Name verschwindet mit (ON DELETE CASCADE).
    const userId = db.prepare('SELECT id FROM users WHERE username = ?').get('birke').id
    db.prepare('DELETE FROM users WHERE id = ?').run(userId)
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM user_profil WHERE user_id = ?').get(userId).c, 0)
  })

  await t.test('Name: in der Mitgliederliste der Familie', async () => {
    await view(home, rudelId)
    const list = await call(base, '/api/family/members', { cookie: home.cookie })
    const self = list.data.mitglieder.find((member) => member.familyId === homeId)
    assert.equal(self.anzeigename, 'Anke')
    const birke = list.data.mitglieder.find((member) => member.familyId === birkeId)
    assert.equal(birke.anzeigename, 'Greta')
    await view(home, homeId)
  })

  let homeBild
  await t.test('Bild des Zuhauses: Upload entfernt Metadaten, steht in /me (home.bild) und ist nur für Berechtigte abrufbar', async () => {
    const res = await uploadBild(base, home.cookie, { bytes: JPEG_WITH_EXIF })
    assert.equal(res.status, 201, JSON.stringify(res.data))
    homeBild = res.data.bild
    assert.match(homeBild, new RegExp(`^/api/profil/${homeId}/bild\\?v=`))
    const me = (await call(base, '/api/me', { cookie: home.cookie })).data
    assert.equal(me.home.bild, homeBild)
    assert.equal(me.bild, homeBild)
    const stored = fs.readFileSync(fileOf(homeBild))
    assert.equal(stored.includes('Exif'), false)
    const own = await getBild(base, homeBild, home.cookie)
    assert.equal(own.status, 200)
    assert.match(own.headers.get('cache-control'), /private/)
    // Mitglied derselben Familie sieht es (der Name des Zuhauses steht dort in der Mitgliederliste).
    assert.equal((await getBild(base, homeBild, withUser.cookie)).status, 200)
    // Fremde und Anonyme nicht; über /uploads ist die Datei nicht erreichbar.
    assert.equal((await getBild(base, homeBild, stranger.cookie)).status, 404)
    assert.equal((await getBild(base, homeBild)).status, 401)
    const filename = path.basename(fileOf(homeBild))
    assert.equal((await getBild(base, `/uploads/${filename}`, stranger.cookie)).status, 404)
  })

  await t.test('Befreundetes Zuhause sieht das Bild - auch als Gast-Sitzung beim Gastgeber', async () => {
    db.prepare('INSERT INTO besuche (gast_family_id, gastgeber_family_id) VALUES (?, ?)').run(strangerId, homeId)
    assert.equal((await getBild(base, homeBild, stranger.cookie)).status, 200)
    await view(stranger, homeId)
    assert.equal((await getBild(base, homeBild, stranger.cookie)).status, 200)
    await view(stranger, strangerId)
    db.prepare('DELETE FROM besuche WHERE gast_family_id = ?').run(strangerId)
    assert.equal((await getBild(base, homeBild, stranger.cookie)).status, 404)
  })

  await t.test('Bild: kaputte Datei und Nicht-Bild werden abgelehnt, nichts bleibt liegen', async () => {
    const before = fs.readdirSync(path.join(dataDir, 'uploads')).length
    const broken = Buffer.concat([Buffer.from([0xff, 0xd8]), jpegSegment(0xe1, Buffer.from('Exif\0\0', 'latin1')).subarray(0, 6)])
    assert.equal((await uploadBild(base, home.cookie, { bytes: broken })).status, 400)
    assert.equal((await uploadBild(base, home.cookie, { bytes: Buffer.from('<svg/>'), type: 'image/png', name: 'x.png' })).status, 400)
    assert.equal(fs.readdirSync(path.join(dataDir, 'uploads')).length, before)
  })

  await t.test('Bild der Familie: nur die Leitung, Gäste nicht; Mitglieder sehen es in memberships', async () => {
    await view(home, rudelId)
    const res = await uploadBild(base, home.cookie)
    assert.equal(res.status, 201)
    assert.match(res.data.bild, new RegExp(`^/api/profil/${rudelId}/bild`))
    await view(withUser, rudelId)
    assert.equal((await uploadBild(base, withUser.cookie)).status, 403)
    assert.equal((await call(base, '/api/profil/bild', { method: 'DELETE', cookie: withUser.cookie })).status, 403)
    const me = (await call(base, '/api/me', { cookie: withUser.cookie })).data
    assert.equal(me.memberships.find((m) => m.id === rudelId).bild, res.data.bild)
    assert.equal((await getBild(base, res.data.bild, withUser.cookie)).status, 200)
    assert.equal((await getBild(base, res.data.bild, stranger.cookie)).status, 404)
    await view(home, homeId)
  })

  await t.test('Bild ersetzen löscht die alte Datei, Entfernen setzt zurück', async () => {
    const oldFile = fileOf(homeBild)
    const res = await uploadBild(base, home.cookie)
    assert.equal(res.status, 201)
    assert.equal(fs.existsSync(oldFile), false)
    const newFile = fileOf(res.data.bild)
    const removed = await call(base, '/api/profil/bild', { method: 'DELETE', cookie: home.cookie })
    assert.equal(removed.status, 200)
    assert.equal(removed.data.bild, null)
    assert.equal(fs.existsSync(newFile), false)
    assert.equal((await call(base, '/api/me', { cookie: home.cookie })).data.home.bild, null)
  })

  await t.test('Demo darf weder Name noch Bild ändern', async () => {
    db.prepare('UPDATE families SET is_demo = 1 WHERE id = ?').run(strangerId)
    assert.equal((await putName(stranger.cookie, { anzeigename: 'Henrik' })).status, 403)
    assert.equal((await uploadBild(base, stranger.cookie)).status, 403)
    db.prepare('UPDATE families SET is_demo = 0 WHERE id = ?').run(strangerId)
  })

  await t.test('Partner-Bereich hat kein Bild', async () => {
    const shelter = await createFamily(base, 'Tierheim Profiltest', 'tierheim-profil-1', { art: 'tierheim' })
    assert.equal((await uploadBild(base, shelter.cookie)).status, 400)
  })

  await t.test('Zuhause löschen räumt Profil und Bilddatei mit ab', async () => {
    const res = await uploadBild(base, stranger.cookie)
    const file = fileOf(res.data.bild)
    await putName(stranger.cookie, { anzeigename: 'Henrik' })
    removeUploads(path.join(dataDir, 'uploads'), deleteFamily(db, strangerId))
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM bereich_profil WHERE family_id = ?').get(strangerId).c, 0)
    assert.equal(fs.existsSync(file), false)
  })
})
