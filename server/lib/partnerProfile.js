'use strict'

// Phase P Task 3: das eigene Profil eines Partners im Partner-Bereich (routes/partnerArea/profile.js) -
// Antwortform, Vollständigkeit fürs Veröffentlichen und die Prüfung einer Profil-Änderung. Die Feld-
// Prüfungen selbst stecken in lib/partners.js validatePartner (dieselben wie beim Admin, inkl.
// Züchter-Schutz) - hier kommt nur dazu, WELCHE Felder ein Partner selbst ändern darf.

const { validatePartner } = require('./partners')

const MIN_PORTAL_TEXT_LENGTH = 40

const LABEL = Object.freeze({
  name: 'Name',
  plz: 'Postleitzahl',
  portalText: `Portal-Text (mind. ${MIN_PORTAL_TEXT_LENGTH} Zeichen)`,
  logo: 'Logo',
  kontakt: 'Kontakt (E-Mail, Telefon oder Kontaktformular)',
  einblick: 'mindestens ein Einblick'
})

// Felder, die der Partner selbst pflegt (camelCase wie in der Admin-API), und die Spalten, die eine
// Änderung daran schreibt - die PLZ zieht ort/lat/lon mit (lib/partners.js resolvePlz). Alles andere
// (slug, typ, status, istPartner, gesperrt, ...) bleibt dem Betreiber vorbehalten.
const PROFILE_COLUMNS = Object.freeze({
  name: ['name'],
  portalTitel: ['portal_titel'],
  portalText: ['portal_text'],
  farbe: ['farbe'],
  website: ['website'],
  spendenUrl: ['spenden_url'],
  vermittlungUrl: ['vermittlung_url'],
  kontaktEmail: ['kontakt_email'],
  kontaktTelefon: ['kontakt_telefon'],
  kontaktFormularUrl: ['kontakt_formular_url'],
  kontaktformularAktiv: ['kontaktformular_aktiv'],
  plz: ['plz', 'ort', 'lat', 'lon']
})

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

// Pflicht fürs Veröffentlichen (fehlt) und Empfehlungen (empfohlen), jeweils als deutsche Bezeichnungen.
// einblickCount: Anzahl sichtbarer Einblicke (lib/einblicke.js) - fehlt die Angabe, entfällt die Empfehlung.
function completeness(partner, { einblickCount } = {}) {
  const fehlt = []
  if (!partner.name || !partner.name.trim()) fehlt.push(LABEL.name)
  if (!partner.plz) fehlt.push(LABEL.plz)
  if ((partner.portal_text || '').trim().length < MIN_PORTAL_TEXT_LENGTH) fehlt.push(LABEL.portalText)

  const empfohlen = []
  if (!partner.logo_file) empfohlen.push(LABEL.logo)
  if (!partner.kontakt_email && !partner.kontakt_telefon && !partner.kontakt_formular_url) empfohlen.push(LABEL.kontakt)
  if (einblickCount === 0) empfohlen.push(LABEL.einblick)

  return { ok: fehlt.length === 0, fehlt, empfohlen }
}

// Das eigene Profil in camelCase (wie die Eingabe von PUT /profile), dazu Status, Sperre und Vollständigkeit.
function profileResponse(partner, { einblickCount } = {}) {
  return {
    id: partner.id,
    slug: partner.slug,
    name: partner.name,
    typ: partner.typ,
    status: partner.status,
    gesperrt: Boolean(partner.gesperrt),
    badge: partner.ist_partner ? 'partner' : 'geprueft',
    plz: partner.plz,
    ort: partner.ort,
    lat: partner.lat,
    lon: partner.lon,
    website: partner.website,
    spendenUrl: partner.spenden_url,
    vermittlungUrl: partner.vermittlung_url,
    kontaktEmail: partner.kontakt_email,
    kontaktTelefon: partner.kontakt_telefon,
    kontaktFormularUrl: partner.kontakt_formular_url,
    kontaktformularAktiv: Boolean(partner.kontaktformular_aktiv),
    portalTitel: partner.portal_titel,
    portalText: partner.portal_text,
    farbe: partner.farbe,
    logoUrl: partner.logo_file ? `/partner-media/${partner.logo_file}` : null,
    vollstaendig: completeness(partner, { einblickCount })
  }
}

// Prüft eine Profil-Änderung und liefert { spalte: wert } NUR für die mitgeschickten Felder - nicht
// mitgeschickte bleiben unverändert (null oder '' löschen ein Feld ausdrücklich). Unbekannte oder dem
// Betreiber vorbehaltene Felder -> 400. Die Werte laufen durch validatePartner mit dem bestehenden
// Datensatz als Grundlage: Slug, Typ, Status und Sperre kommen so unverändert aus existing.
function validateProfileUpdate(body, existing) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw httpError(400, 'Ungültige Angaben')
  const keys = Object.keys(body)
  const forbidden = keys.find((key) => !Object.hasOwn(PROFILE_COLUMNS, key))
  if (forbidden !== undefined) throw httpError(400, `Dieses Feld kann nur der Betreiber ändern: ${forbidden}`)

  const input = { name: existing.name, ...body, typ: existing.typ }
  const clean = validatePartner(input, { existing })
  const columns = keys.flatMap((key) => PROFILE_COLUMNS[key])
  return Object.fromEntries(columns.map((column) => [column, clean[column]]))
}

module.exports = { completeness, profileResponse, validateProfileUpdate, MIN_PORTAL_TEXT_LENGTH, PROFILE_COLUMNS }
