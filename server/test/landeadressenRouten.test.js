const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { useTempDataDir, startApp, cleanup } = require('./helpers')

const dataDir = useTempDataDir('landeadressen-routen')
const clientDist = path.join(dataDir, 'dist')
fs.mkdirSync(clientDist)
fs.writeFileSync(path.join(clientDist, 'index.html'), '<!doctype html><title>Chronik</title>')
fs.writeFileSync(path.join(clientDist, 'herbst.html'), '<!doctype html><title>Herbst</title>')
process.env.CLIENT_DIST = clientDist
const { isReserviert } = require('../lib/landeadressenRegeln')

// security-review: eine Landeadresse (GET /<kurzname>) darf nie eine Seite der App verdecken. Dieser Test liest die
// Routen des Clients (App.jsx, AreaRoutes.jsx und die Pfad-Konstanten in client/src/lib/*.js) und prüft, dass jede
// erste Pfad-Ebene in lib/landeadressenRegeln.js RESERVIERT steht. Kommt eine neue Seite dazu, schlägt er an.

const CLIENT_SRC = path.join(__dirname, '..', '..', 'client', 'src')
// '/wort', "/wort", `/wort` (gefolgt von /, ?, #, Anführungszeichen oder ${) sowie Regex-Anfänge wie /^\/wort.
const PFAD_RE = /(?:['"`]|\/\^\\)\/([a-z0-9][a-z0-9-]*)(?=[/'"`?#\\)]|\$\{)/g

function quellDateien() {
  const libDir = path.join(CLIENT_SRC, 'lib')
  const lib = fs
    .readdirSync(libDir)
    .filter((name) => name.endsWith('.js') && !name.endsWith('.test.js'))
    .map((name) => path.join(libDir, name))
  return [path.join(CLIENT_SRC, 'App.jsx'), path.join(CLIENT_SRC, 'AreaRoutes.jsx'), ...lib]
}

function ersteEbenen() {
  const gefunden = new Map()
  for (const datei of quellDateien()) {
    for (const match of fs.readFileSync(datei, 'utf8').matchAll(PFAD_RE)) {
      if (!gefunden.has(match[1])) gefunden.set(match[1], path.relative(CLIENT_SRC, datei))
    }
  }
  return gefunden
}

test('Landeadressen: jede erste Pfad-Ebene des Clients ist reserviert', (t) => {
  if (!fs.existsSync(path.join(CLIENT_SRC, 'App.jsx'))) return t.skip('client/src fehlt')
  const ebenen = ersteEbenen()
  assert.ok(ebenen.has('start') && ebenen.has('tiere') && ebenen.has('admin'), 'der Scan findet die bekannten Routen')
  const fehlend = [...ebenen].filter(([ebene]) => !isReserviert(ebene)).map(([ebene, datei]) => `${ebene} (${datei})`)
  assert.deepEqual(fehlend, [], 'in lib/landeadressenRegeln.js reservieren')
})

test('Landeadressen: ein Kurzname, der einer Datei im client/dist-Wurzelordner entspricht, leitet nicht weiter', async (t) => {
  const { server, base } = await startApp()
  t.after(() => cleanup(dataDir, server))
  const { createLandeadresse } = require('../lib/landeadressen')
  createLandeadresse({ slug: 'herbst', ziel: '/partner-werden' })
  createLandeadresse({ slug: 'flyer-2026', ziel: '/partner-werden' })

  const verdeckt = await fetch(`${base}/herbst`, { redirect: 'manual' })
  assert.notEqual(verdeckt.status, 302, 'herbst.html liegt im dist-Wurzelordner')
  const frei = await fetch(`${base}/flyer-2026`, { redirect: 'manual' })
  assert.equal(frei.status, 302)
  assert.equal(frei.headers.get('location'), '/partner-werden')
})
