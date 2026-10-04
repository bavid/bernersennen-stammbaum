'use strict'

// Digitaler Bilderrahmen: welche Fotos eine Diashow zeigt. Zwei Wege, eine Auswahl-Logik:
// - fotosForArea: die angemeldete Sitzung (GET /api/bilderrahmen/fotos) - genau die Tier- und Erinnerungsfotos, die der
//   aktive Bereich sehen darf (VISIBLE_DOGS_SQL/VISIBLE_ENTRY_SQL wie lib/uploadAccess.js canSeeUpload, also lädt der
//   Browser jedes Foto danach auch über /uploads). Private Erinnerungen nur auf Wunsch (privat) und nur im eigenen Zuhause
//   (familyId === homeId) - ein Rahmen im Wohnzimmer zeigt sie sonst jedem, der davorsteht.
// - fotosForGeraet: ein Rahmen-Link ohne Anmeldung (lib/rahmenGeraete.js) - strenger: nur die EIGENEN Tiere des Zuhauses
//   und dessen EIGENE Erinnerungen, nie Fotos geteilter Tiere anderer Zuhause; private nur mit ausdrücklichem Haken.
// Beide liefern höchstens MAX_FOTOS Fotos: „Heute vor … Jahren“ und Tierfotos immer, dann die neuesten, der Rest als
// zufällige Auswahl der älteren. Texte gehen nie mit - nur Name des Tiers und Datum.

const db = require('../db')
const { dogLabel } = require('./labels')
const { VISIBLE_DOGS_SQL, VISIBLE_ENTRY_SQL } = require('./context')
const { FILENAME_RE } = require('./uploadAccess')

const MAX_FOTOS = 300
const NEWEST_FOTOS = 200
const MAX_PROFILE_FOTOS = 50
const MAX_ON_THIS_DAY = 60
// Obergrenze der gelesenen Erinnerungen - schützt den Server bei sehr großen Chroniken (die neuesten zuerst).
const MAX_ENTRY_ROWS = 2000
const MAX_TIERE_FILTER = 50
const DAY_MS = 24 * 60 * 60 * 1000

// Zeitraum: Tage zurück ab heute, null = alles.
const ZEITRAEUME = { alle: null, jahr: 365, monat: 31 }

const UPLOAD_PREFIX = '/uploads/'

function isoDay(date) {
  return date.toISOString().slice(0, 10)
}

// "1,2,3" -> [1, 2, 3]; leer/fehlend -> []; alles andere (keine Zahl, zu viele) -> null.
function parseTiere(value) {
  if (value === undefined || value === null || value === '') return []
  if (typeof value !== 'string') return null
  const parts = value.split(',')
  if (parts.length > MAX_TIERE_FILTER) return null
  const ids = parts.map((part) => (/^[1-9]\d{0,9}$/.test(part.trim()) ? Number(part.trim()) : NaN))
  return ids.every(Number.isInteger) ? [...new Set(ids)] : null
}

function isZeitraum(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ZEITRAEUME, value)
}

function sinceDate(zeitraum, now) {
  const days = ZEITRAEUME[zeitraum]
  return days ? isoDay(new Date(now.getTime() - days * DAY_MS)) : null
}

// Monat-Tag von gestern, heute und morgen (Server-Zeit) - der Client entscheidet mit seiner eigenen Uhr genau, hier geht es
// nur darum, dass „Heute vor … Jahren“ die Kappung sicher übersteht.
function nearMonthDays(now) {
  return new Set([-1, 0, 1].map((offset) => isoDay(new Date(now.getTime() + offset * DAY_MS)).slice(5)))
}

function filenameOf(url) {
  if (typeof url !== 'string' || !url.startsWith(UPLOAD_PREFIX)) return null
  const filename = url.slice(UPLOAD_PREFIX.length)
  return FILENAME_RE.test(filename) ? filename : null
}

function parseUrls(json) {
  try {
    const urls = JSON.parse(json)
    return Array.isArray(urls) ? urls : []
  } catch {
    return []
  }
}

function toTier(dog) {
  return { id: dog.id, name: dogLabel(dog), inErinnerung: dog.abschied_grund === 'verstorben' }
}

// Fotos aus Tieren und Erinnerungen, jede Datei nur einmal (die Erinnerung mit Datum gewinnt vor dem Tierfoto).
function collectFotos(dogs, entries) {
  const byId = new Map(dogs.map((dog) => [dog.id, toTier(dog)]))
  const seen = new Set()
  const fotos = []
  const add = (url, tier, datum, eintragId) => {
    const filename = filenameOf(url)
    if (!filename || seen.has(filename) || !tier) return
    seen.add(filename)
    fotos.push({ url, filename, tierId: tier.id, tierName: tier.name, datum, eintragId, inErinnerung: tier.inErinnerung })
  }
  for (const entry of entries) {
    for (const url of parseUrls(entry.foto_urls)) add(url, byId.get(entry.dog_id), entry.datum, entry.id)
  }
  for (const dog of dogs) add(dog.foto_url, byId.get(dog.id), null, null)
  return fotos
}

function shuffled(list, random) {
  const copy = [...list]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

// Neueste zuerst, Tierfotos (ohne Datum) am Ende.
function byNewest(a, b) {
  if (a.datum === b.datum) return (b.eintragId || 0) - (a.eintragId || 0)
  if (!a.datum) return 1
  if (!b.datum) return -1
  return a.datum < b.datum ? 1 : -1
}

function capFotos(fotos, { now = new Date(), random = Math.random, max = MAX_FOTOS } = {}) {
  const sorted = [...fotos].sort(byNewest)
  if (sorted.length <= max) return sorted
  const near = nearMonthDays(now)
  const thisYear = now.getUTCFullYear()
  const isOnThisDay = (foto) => foto.datum && near.has(foto.datum.slice(5)) && Number(foto.datum.slice(0, 4)) < thisYear
  const keep = new Set([
    ...sorted.filter((foto) => !foto.datum).slice(0, MAX_PROFILE_FOTOS),
    ...sorted.filter(isOnThisDay).slice(0, MAX_ON_THIS_DAY)
  ])
  const rest = sorted.filter((foto) => !keep.has(foto))
  const newest = rest.slice(0, Math.min(NEWEST_FOTOS, max - keep.size))
  const older = shuffled(rest.slice(newest.length), random).slice(0, Math.max(0, max - keep.size - newest.length))
  return [...keep, ...newest, ...older].sort(byNewest)
}

const DOG_COLUMNS = 'SELECT d.id, d.name, d.name_unbekannt, d.rasse, d.foto_url, d.abschied_grund FROM dogs d'
const ORDER_DOGS = 'ORDER BY d.name COLLATE NOCASE, d.id'

function entryStatement(scopeSql) {
  return db.prepare(
    `SELECT t.id, t.dog_id, t.datum, t.foto_urls FROM timeline_entries t
     WHERE t.foto_urls != '[]' AND ${scopeSql}
       AND (@privat = 1 OR t.privat = 0)
       AND (@since IS NULL OR t.datum >= @since)
       AND (@tiere IS NULL OR t.dog_id IN (SELECT value FROM json_each(@tiere)))
     ORDER BY t.datum DESC, t.id DESC LIMIT ${MAX_ENTRY_ROWS}`
  )
}

// Zwei Sichten, je einmal vorbereitet: der aktive Bereich (Sitzung) und das eigene Zuhause (Rahmen-Gerät).
const SCOPES = {
  area: {
    dogs: db.prepare(`${DOG_COLUMNS} WHERE d.id IN ${VISIBLE_DOGS_SQL} ${ORDER_DOGS}`),
    entries: entryStatement(`${VISIBLE_ENTRY_SQL} AND t.dog_id IN ${VISIBLE_DOGS_SQL}`)
  },
  own: {
    dogs: db.prepare(`${DOG_COLUMNS} WHERE d.family_id = @familyId ${ORDER_DOGS}`),
    entries: entryStatement('t.family_id = @familyId AND t.dog_id IN (SELECT id FROM dogs WHERE family_id = @familyId)')
  }
}

function selectionParams({ familyId, tiere, zeitraum, privat, now }) {
  return {
    familyId,
    privat: privat ? 1 : 0,
    since: sinceDate(zeitraum, now),
    tiere: tiere.length ? JSON.stringify(tiere) : null
  }
}

// Tierfotos haben kein Datum - mit einem Zeitraum zählen nur Erinnerungen aus diesem Zeitraum.
function pickDogs(dogs, { tiere, zeitraum }) {
  const wanted = tiere.length ? new Set(tiere) : null
  return dogs.filter((dog) => !wanted || wanted.has(dog.id)).map((dog) => (ZEITRAEUME[zeitraum] ? { ...dog, foto_url: null } : dog))
}

function select(scope, dogs, options) {
  const entries = scope.entries.all(selectionParams(options))
  return capFotos(collectFotos(pickDogs(dogs, options), entries), { now: options.now })
}

// Angemeldete Sitzung: alles, was der aktive Bereich sieht. { fotos, tiere } - tiere für die Auswahl-Chips.
function fotosForArea({ familyId, homeId, tiere = [], zeitraum = 'alle', privat = false, now = new Date() }) {
  const dogs = SCOPES.area.dogs.all({ familyId })
  const fotos = select(SCOPES.area, dogs, { familyId, tiere, zeitraum, privat: privat && familyId === homeId, now })
  return { fotos, tiere: dogs.map(toTier) }
}

// Ein Rahmen-Gerät: nur eigene Tiere und eigene Erinnerungen des Zuhauses familyId.
function fotosForGeraet({ familyId, auswahl, now = new Date() }) {
  const dogs = SCOPES.own.dogs.all({ familyId })
  return select(SCOPES.own, dogs, { familyId, tiere: auswahl.tiere, zeitraum: auswahl.zeitraum, privat: auswahl.privat, now })
}

// Gehört die Datei filename (noch) zu dem, was das Gerät zeigen darf? Für /rahmen-foto: so wirken ein Widerruf, ein jetzt
// privater Eintrag oder ein gelöschtes Foto sofort, nicht erst, wenn die signierte Adresse abläuft.
const deviceDogPhotoStmt = db.prepare(
  `SELECT 1 FROM dogs d WHERE d.family_id = @familyId AND d.foto_url = @url
     AND @since IS NULL AND (@tiere IS NULL OR d.id IN (SELECT value FROM json_each(@tiere)))`
)
const deviceEntryPhotoStmt = db.prepare(
  `SELECT 1 FROM timeline_entries t WHERE t.family_id = @familyId AND t.foto_urls LIKE @pattern
     AND t.dog_id IN (SELECT id FROM dogs WHERE family_id = @familyId)
     AND (@privat = 1 OR t.privat = 0)
     AND (@since IS NULL OR t.datum >= @since)
     AND (@tiere IS NULL OR t.dog_id IN (SELECT value FROM json_each(@tiere)))`
)

function geraetMayShow({ familyId, auswahl, now = new Date() }, filename) {
  if (!FILENAME_RE.test(filename)) return false
  const params = { ...selectionParams({ familyId, ...auswahl, now }), url: `${UPLOAD_PREFIX}${filename}` }
  // FILENAME_RE lässt weder "%" noch "_" zu - das LIKE-Muster braucht kein Escaping (wie lib/uploadAccess.js).
  return Boolean(deviceDogPhotoStmt.get(params) || deviceEntryPhotoStmt.get({ ...params, pattern: `%"${params.url}"%` }))
}

module.exports = {
  MAX_FOTOS,
  ZEITRAEUME,
  parseTiere,
  isZeitraum,
  capFotos,
  fotosForArea,
  fotosForGeraet,
  geraetMayShow
}
