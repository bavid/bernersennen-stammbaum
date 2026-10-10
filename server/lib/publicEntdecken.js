'use strict'

// Öffentliches „Entdecken“ (ohne Anmeldung, Startseite -> /partner): Tierheime, Hundeschulen, Salons und mehr - sichtbar,
// weil sie mitmachen. EINE Abfrage-Logik für Suche (q), Typ-Filter (typ), Umkreis (plz + radius) und Seiten (seite):
// - deutschlandweit: Partner mit freigegebenem Antrag „Überall sichtbar“ (lib/ueberallSichtbar.js ueberallSql) - stehen
//   unabhängig von der PLZ oben, nur auf Seite 1, höchstens MAX_DEUTSCHLANDWEIT.
// - treffer: alle übrigen öffentlich sichtbaren Partner (lib/partners.js publicPartnerSql), ohne PLZ nach Name, mit PLZ im
//   Umkreis nach Entfernung - je Seite PAGE_SIZE.
// Nur parametrisiertes SQL (Platzhalter für jede Eingabe, LIKE mit ESCAPE). Die Karten tragen nur öffentliche Grundfelder -
// keine Kontaktdaten, keine Ansprechperson, keine Koordinaten, keine internen Spalten (is_demo, quelle, ...).

const db = require('../db')
const { lookupPlz, distanceKm } = require('./geo')
const { roundKm } = require('./nearby')
const { publicPartnerSql, stripUnsafeChars, TYP_VALUES } = require('./partners')
const { teaserFotoSql, teaserFoto } = require('./einblicke')
const { ueberallSql } = require('./ueberallSichtbar')

const PAGE_SIZE = 12
const MAX_SEITE = 50
const MAX_DEUTSCHLANDWEIT = 12
const MAX_Q_LENGTH = 60
const MIN_Q_LENGTH = 2
const KURZTEXT_LENGTH = 140
const RADIUS_VALUES = [5, 10, 25, 50, 100]
// Obergrenze der Zeilen im Umkreis-Rechteck, bevor die genaue Entfernung zählt - die Antwort wächst so nie beliebig.
const MAX_BOX_ROWS = 2000
const KM_PER_DEGREE_LAT = 111

// Suchwörter, die einen Typ meinen („Salon“, „Physio“ …) - so findet „hundeschule“ auch eine „Pfotenakademie“.
const TYP_WOERTER = {
  tierheim: ['tierheim', 'tierschutz'],
  vermittlung: ['vermittlung', 'tierschutz'],
  hundeschule: ['hundeschule', 'training', 'schule'],
  hundesalon: ['hundesalon', 'salon', 'pflege', 'friseur'],
  betreuung: ['betreuung', 'sitter', 'gassi', 'pension'],
  futter: ['futter'],
  sonstige: ['physio', 'therapie', 'tierarzt']
}

const COLUMNS = 'id, slug, name, typ, plz, ort, lat, lon, logo_file, portal_titel, portal_text, ist_partner'

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function readQ(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value !== 'string') throw httpError(400, 'Ungültige Suche')
  const clean = stripUnsafeChars(value).replace(/\s+/g, ' ').trim()
  if (clean.length > MAX_Q_LENGTH) throw httpError(400, `Die Suche darf höchstens ${MAX_Q_LENGTH} Zeichen haben`)
  return clean.length >= MIN_Q_LENGTH ? clean : ''
}

// typ: ein Typ oder mehrere mit Komma („tierheim,vermittlung“) - nur bekannte, ohne Doppelte.
function readTypen(value) {
  if (value === undefined || value === null || value === '') return []
  if (typeof value !== 'string') throw httpError(400, 'Ungültiger Typ')
  const typen = [...new Set(value.split(',').map((part) => part.trim()).filter(Boolean))]
  if (typen.some((typ) => !TYP_VALUES.includes(typ))) throw httpError(400, 'Diesen Typ kennen wir nicht')
  return typen
}

function readSeite(value) {
  if (value === undefined || value === null || value === '') return 1
  const seite = Number(value)
  if (!Number.isInteger(seite) || seite < 1 || seite > MAX_SEITE) throw httpError(400, 'Ungültige Seite')
  return seite
}

function readCenter(plz, radius) {
  if (plz === undefined || plz === null || plz === '') return { center: null, radiusKm: null }
  const radiusKm = Number(radius)
  if (!RADIUS_VALUES.includes(radiusKm)) throw httpError(400, 'Der Umkreis muss 5, 10, 25, 50 oder 100 km sein')
  const center = typeof plz === 'string' ? lookupPlz(plz.trim()) : null
  if (!center) throw httpError(400, 'Diese Postleitzahl kennen wir nicht')
  return { center, radiusKm }
}

// Rohe Eingabe (Query oder Body) -> geprüfte Suche; alles Ungültige 400.
function parseEntdecken(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  return { q: readQ(source.q), typen: readTypen(source.typ), seite: readSeite(source.seite), ...readCenter(source.plz, source.radius) }
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

function typenForQ(q) {
  const lower = q.toLowerCase()
  return Object.entries(TYP_WOERTER)
    .filter(([, woerter]) => woerter.some((wort) => wort.startsWith(lower) || lower.includes(wort)))
    .map(([typ]) => typ)
}

function placeholders(list) {
  return list.map(() => '?').join(', ')
}

// Gemeinsame WHERE-Bedingung (ohne die Unterscheidung deutschlandweit/übrige) samt Parametern.
function baseWhere({ q, typen }, { demoAllowed }) {
  const parts = [publicPartnerSql()]
  const params = []
  if (!demoAllowed) parts.push('is_demo = 0')
  if (typen.length) {
    parts.push(`typ IN (${placeholders(typen)})`)
    params.push(...typen)
  }
  if (q) {
    const like = `%${escapeLike(q)}%`
    const textParts = ["name LIKE ? ESCAPE '\\'", "ort LIKE ? ESCAPE '\\'", "plz LIKE ? ESCAPE '\\'", "portal_titel LIKE ? ESCAPE '\\'"]
    params.push(like, like, like, like)
    const qTypen = typenForQ(q)
    if (qTypen.length) {
      textParts.push(`typ IN (${placeholders(qTypen)})`)
      params.push(...qTypen)
    }
    parts.push(`(${textParts.join(' OR ')})`)
  }
  return { where: parts.join(' AND '), params }
}

function kurztext(row) {
  if (row.portal_titel) return row.portal_titel
  const first = String(row.portal_text || '').split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim()
  if (first.length <= KURZTEXT_LENGTH) return first || null
  const cut = first.slice(0, KURZTEXT_LENGTH)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), KURZTEXT_LENGTH - 20)).trim()} …`
}

// Öffentliche Karte: Bild ist das Logo, ohne Logo das neueste sichtbare Einblick-Foto.
function entdeckenCard(row, { distanceKm: km, deutschlandweit = false } = {}) {
  const logoUrl = row.logo_file ? `/partner-media/${row.logo_file}` : null
  return {
    slug: row.slug,
    name: row.name,
    typ: row.typ,
    plz: row.plz || null,
    ort: row.ort || null,
    bildUrl: logoUrl || teaserFoto(row),
    bildArt: logoUrl ? 'logo' : 'foto',
    kurztext: kurztext(row),
    badge: row.ist_partner ? 'partner' : 'geprueft',
    ...(typeof km === 'number' ? { distanceKm: km } : {}),
    ...(deutschlandweit ? { deutschlandweit: true } : {})
  }
}

function selectRows(where, params, tail = '') {
  return db.prepare(`SELECT ${COLUMNS}, ${teaserFotoSql()} FROM partners WHERE ${where} ${tail}`).all(...params)
}

function deutschlandweitCards(base, seite) {
  if (seite !== 1) return []
  const rows = selectRows(`${base.where} AND ${ueberallSql()}`, base.params, `ORDER BY name COLLATE NOCASE LIMIT ${MAX_DEUTSCHLANDWEIT}`)
  return rows.map((row) => entdeckenCard(row, { deutschlandweit: true }))
}

function pageInfo(gesamt, seite) {
  const seiten = Math.max(1, Math.ceil(gesamt / PAGE_SIZE))
  return { gesamt, seite, seiten, mehr: seite < seiten }
}

function trefferOhneOrt(base, seite) {
  const where = `${base.where} AND NOT (${ueberallSql()})`
  const gesamt = db.prepare(`SELECT COUNT(*) AS n FROM partners WHERE ${where}`).get(...base.params).n
  const offset = (seite - 1) * PAGE_SIZE
  const rows = selectRows(where, [...base.params, PAGE_SIZE, offset], 'ORDER BY name COLLATE NOCASE, id LIMIT ? OFFSET ?')
  return { treffer: rows.map((row) => entdeckenCard(row)), ...pageInfo(gesamt, seite) }
}

// Erst grob per Rechteck in SQL (Index-freundlich, begrenzt), dann genau per Entfernung.
function trefferImUmkreis(base, { center, radiusKm }, seite) {
  const dLat = radiusKm / KM_PER_DEGREE_LAT
  const dLon = radiusKm / (KM_PER_DEGREE_LAT * Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01))
  const where = `${base.where} AND NOT (${ueberallSql()}) AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?`
  const params = [...base.params, center.lat - dLat, center.lat + dLat, center.lon - dLon, center.lon + dLon]
  const near = selectRows(where, params, `LIMIT ${MAX_BOX_ROWS}`)
    .map((row) => ({ row, km: roundKm(distanceKm(center, { lat: row.lat, lon: row.lon })) }))
    .filter((item) => item.km <= radiusKm)
    .sort((a, b) => a.km - b.km || a.row.name.localeCompare(b.row.name, 'de'))
  const start = (seite - 1) * PAGE_SIZE
  const treffer = near.slice(start, start + PAGE_SIZE).map(({ row, km }) => entdeckenCard(row, { distanceKm: km }))
  return { treffer, ...pageInfo(near.length, seite) }
}

// suche: Ergebnis von parseEntdecken; demoAllowed: dürfen Demo-Partner (is_demo = 1) mit in die Antwort?
function buildPublicEntdecken(suche, { demoAllowed = false } = {}) {
  const base = baseWhere(suche, { demoAllowed })
  const main = suche.center ? trefferImUmkreis(base, suche, suche.seite) : trefferOhneOrt(base, suche.seite)
  return { deutschlandweit: deutschlandweitCards(base, suche.seite), ...main }
}

module.exports = { PAGE_SIZE, MAX_DEUTSCHLANDWEIT, RADIUS_VALUES, parseEntdecken, buildPublicEntdecken, entdeckenCard }
