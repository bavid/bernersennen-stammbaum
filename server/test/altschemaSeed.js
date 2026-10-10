'use strict'

// Hilfsprozess für test/migrationAltschema.test.js (kein Test selbst): startet die ALTE App (Stand der Produktion,
// Commit 1f7b91c, ausgepackt nach argv[2]) gegen DATA_DIR und füllt sie über deren eigene API mit fiktiven Daten -
// ein Rudel mit gemeinsamem Passwort, fünf Tiere als Stammbaum, Chronik mit Fotos, Kommentare, Pinnwand, Wurf,
// Feedback. Fotos legt der Prozess so ab, wie der alte Upload sie schrieb (UUID-Name im Upload-Ordner).
// Ausgabe (stdout, eine JSON-Zeile): Passwort, Ids, Fotonamen und das alte Sitzungs-Cookie.

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { once } = require('node:events')

const oldServerDir = process.argv[2]
const PASSWORT = 'sonnenhang-wiese-7'
// Kleinstes gültiges JPEG-Gerüst reicht: der alte Server prüfte beim Ausliefern keinen Inhalt.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])

async function main() {
  const { createApp } = require(path.join(oldServerDir, 'app.js'))
  const config = require(path.join(oldServerDir, 'config.js'))
  const server = createApp().listen(0)
  await once(server, 'listening')
  const base = `http://localhost:${server.address().port}`
  let cookie = ''

  async function call(urlPath, body) {
    const res = await fetch(`${base}/api${urlPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body)
    })
    const data = await res.json().catch(() => null)
    if (res.status >= 300) throw new Error(`${urlPath}: ${res.status} ${JSON.stringify(data)}`)
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) cookie = setCookie.split(';')[0]
    return data
  }

  function foto() {
    fs.mkdirSync(config.uploadDir, { recursive: true })
    const name = `${crypto.randomUUID()}.jpg`
    fs.writeFileSync(path.join(config.uploadDir, name), JPEG)
    return `/uploads/${name}`
  }

  const rudel = await call('/families', { name: 'Rudel vom Sonnenhang', password: PASSWORT })
  const benno = await call('/dogs', { name: 'Benno', geschlecht: 'ruede', geburtsdatum: '2015-04-02', rasse: 'Berner Sennenhund', fotoUrl: foto() })
  const wilma = await call('/dogs', { name: 'Wilma', geschlecht: 'huendin', geburtsdatum: '2016-06-11', rasse: 'Berner Sennenhund' })
  const flocke = await call('/dogs', { name: 'Flocke', geschlecht: 'huendin', geburtsdatum: '2019-03-20', motherDogId: wilma.id, fatherDogId: benno.id })
  const pepper = await call('/dogs', { name: 'Pepper', geschlecht: 'ruede', geburtsdatum: '2019-03-20', motherDogId: wilma.id, fatherDogId: benno.id, housemateId: flocke.id })
  const lotte = await call('/dogs', { name: 'Lotte', geschlecht: 'huendin', geburtsdatum: '2022-08-01', motherDogId: flocke.id, fatherFreitext: 'Gastrüde aus dem Nachbardorf' })

  const fotos = [foto(), foto(), foto()]
  const e1 = await call('/timeline', { dogId: flocke.id, autorName: 'Mama', datum: '2019-05-01', titel: 'Erster Ausflug', text: 'Am See.', fotoUrls: fotos.slice(0, 2) })
  const e2 = await call('/timeline', { dogId: benno.id, autorName: 'Papa', datum: '2020-01-10', titel: 'Schnee', fotoUrls: [fotos[2]] })
  await call('/timeline', { dogId: lotte.id, autorName: 'Oma', datum: '2022-09-01', titel: 'Willkommen Lotte' })
  await call(`/timeline/${e1.id}/comments`, { autorName: 'Oma', text: 'Wie süß!' })
  await call(`/timeline/${e2.id}/comments`, { autorName: 'Mama', text: 'Toller Tag.' })
  const note = await call('/notes', { autorName: 'Papa', text: 'Tierarzt am Freitag', terminDatum: '2026-10-16', terminZeit: '10:30' })
  await call(`/notes/${note.id}/replies`, { autorName: 'Mama', text: 'Ich fahre.' })
  await call('/notes', { autorName: 'Oma', text: 'Neues Futter ist da.' })
  const wurfFoto = foto()
  await call('/breeding', { mutterDogId: wilma.id, vaterDogId: benno.id, datum: '2019-03-20', wurfInfo: '2 Welpen', fotoUrls: [wurfFoto] })
  await call('/messages', { type: 'feedback', autorName: 'Mama', text: 'Schöne Seite!', page: '/stammbaum' })

  server.close()
  require(path.join(oldServerDir, 'db.js')).close()
  const dogs = { benno: benno.id, wilma: wilma.id, flocke: flocke.id, pepper: pepper.id, lotte: lotte.id }
  process.stdout.write(`${JSON.stringify({ passwort: PASSWORT, familyId: rudel.id, dogs, fotos: [...fotos, wurfFoto], altCookie: cookie })}\n`)
}

main().catch((err) => {
  process.stderr.write(`${err.stack}\n`)
  process.exitCode = 1
})
