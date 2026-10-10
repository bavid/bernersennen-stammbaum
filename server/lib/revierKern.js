'use strict'

// Phase M „Mein Revier“, gemeinsamer Kern (lib/revier.js bündelt alles; docs/superpowers/plans/2026-10-11-phase-m-revier.md): öffentliches Profil eines Zuhauses (oder
// einer Familie, dort nur die Leitung) - nur mit ausdrücklichem Opt-in, nur für angemeldete Haushalte sichtbar.
// Dieses Modul legt die Tabellen selbst an (db.js ist an seiner Dateigrenze, Muster lib/visitenkarte.js) und hält die
// Regeln, die JEDE Abfrage teilt:
// - PROFIL_SICHTBAR_SQL: aktiv, PLZ, Zustimmung, keine Admin-Sperre, ein Zuhause bzw. eine Familie - geprüft bei jedem
//   Lesen, darum wirkt Ausschalten sofort überall (Radar, Profil, Feed, Fotos, Bild).
// - ÖFFENTLICHE Tiere nur mit dogs.family_id = Profil-Bereich, Erinnerungen nur vom Profil-Bereich selbst, nicht privat,
//   nie mit Gesundheits-Angabe (lib/gesundheit.js) oder der Kategorie „tierarzt“ - Eigentum steckt im JOIN.
// - Nach außen nie PLZ, Koordinaten, Kilometer oder Bereichs-Ids: Profile heißen über einen zufälligen slug, der Ort
//   kommt nur mit „Ort zusätzlich zeigen“ (GeoNames, lib/geo.js), die Entfernung nur als Stufe (bandOf).

const crypto = require('node:crypto')
const db = require('../db')
const { lookupPlz, distanceKm } = require('./geo')
const { bildFileOf, cleanAnzeigename } = require('./profil')
require('./gesundheit') // legt gesundheit_eintraege an - PUBLIC_ENTRY_SQL fragt danach

const PROFIL_ARTS = Object.freeze(['zuhause', 'rudel'])
const MAX_TEXT_LENGTH = 300
const SLUG_BYTES = 8
// Entfernungsstufen: Schlüssel und Obergrenze in km. Weiter als die letzte Stufe erscheint gar nicht.
const BANDS = Object.freeze([
  ['unter5', 5],
  ['5-10', 10],
  ['10-25', 25],
  ['25-50', 50]
])
const UMKREIS_VALUES = Object.freeze(BANDS.map(([, max]) => max))

db.exec(`
  CREATE TABLE IF NOT EXISTS revier_profile (
    family_id INTEGER PRIMARY KEY REFERENCES families(id) ON DELETE CASCADE,
    slug TEXT NOT NULL UNIQUE,
    aktiv INTEGER NOT NULL DEFAULT 0,
    plz TEXT,
    zustimmung_at TEXT,
    anzeigename TEXT,
    text TEXT,
    ort_zeigen INTEGER NOT NULL DEFAULT 0,
    follower_oeffentlich INTEGER NOT NULL DEFAULT 0,
    gesperrt INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS revier_tiere (
    dog_id INTEGER PRIMARY KEY REFERENCES dogs(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS revier_eintraege (
    entry_id INTEGER PRIMARY KEY REFERENCES timeline_entries(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS revier_follows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    follower_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    profil_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (follower_id, profil_id)
  );
  CREATE INDEX IF NOT EXISTS idx_revier_follows_profil ON revier_follows(profil_id);
  CREATE TABLE IF NOT EXISTS revier_ausgeblendet (
    viewer_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    profil_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (viewer_id, profil_id)
  );
`)

// Aliase p (revier_profile) und f (families des Profils); @isDemo trennt Demo und echt.
const PROFIL_SICHTBAR_SQL = `(p.aktiv = 1 AND p.gesperrt = 0 AND p.plz IS NOT NULL AND p.zustimmung_at IS NOT NULL
  AND f.art IN ('zuhause', 'rudel') AND f.is_demo = @isDemo)`

// Öffentliche Tiere eines Profils (Alias p): eigene Tiere des Bereichs mit Schalter.
const PUBLIC_DOGS_SQL = `(SELECT rt.dog_id FROM revier_tiere rt JOIN dogs dd ON dd.id = rt.dog_id WHERE dd.family_id = p.family_id)`

// Öffentliche Erinnerung (Alias t, p): vom Profil-Bereich selbst, nicht privat, ausdrücklich markiert, Tier öffentlich,
// nie Gesundheit.
const PUBLIC_ENTRY_SQL = `(t.family_id = p.family_id AND t.privat = 0 AND t.dog_id IN ${PUBLIC_DOGS_SQL}
  AND EXISTS (SELECT 1 FROM revier_eintraege re WHERE re.entry_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM gesundheit_eintraege g WHERE g.entry_id = t.id)
  AND COALESCE(t.kategorie, '') != 'tierarzt')`

function httpError(status, message, code) {
  const err = new Error(message)
  err.status = status
  if (code) err.code = code
  return err
}

const hasKey = (body, key) => Object.prototype.hasOwnProperty.call(body, key)
const demoFlag = (isDemo) => (isDemo ? 1 : 0)

function bandOf(km) {
  const hit = BANDS.find(([, max]) => km < max)
  return hit ? hit[0] : null
}

function bandMax(band) {
  return BANDS.find(([key]) => key === band)?.[1] ?? Number.POSITIVE_INFINITY
}

function bandRank(band) {
  return BANDS.findIndex(([key]) => key === band)
}

// Entfernungsstufe zwischen zwei PLZ (Mittelpunkte aus GeoNames) - null, wenn eine fehlt oder weiter als 50 km.
function bandBetween(plzA, plzB) {
  const a = lookupPlz(plzA)
  const b = lookupPlz(plzB)
  return a && b ? bandOf(distanceKm(a, b)) : null
}

function bildUrlOf(profil) {
  const file = bildFileOf(profil.family_id)
  return file ? `/api/revier/p/${profil.slug}/bild?v=${file.slice(0, 8)}` : null
}

const publicName = (row) => row.anzeigename || row.family_name

const publicDogsStmt = db.prepare(`
  SELECT d.name, d.name_unbekannt, d.tierart, d.rasse, d.foto_url FROM dogs d JOIN revier_tiere rt ON rt.dog_id = d.id
  WHERE d.family_id = ? ORDER BY d.name COLLATE NOCASE, d.id`)

function publicDogs(familyId) {
  return publicDogsStmt.all(familyId).map((dog) => ({
    name: dog.name,
    unbekannt: Boolean(dog.name_unbekannt),
    tierart: dog.tierart,
    rasse: dog.rasse || null,
    foto: dog.foto_url || null
  }))
}

function toPublicEntry(row) {
  return {
    id: row.id,
    datum: row.datum,
    titel: row.titel,
    text: row.text || null,
    fotos: JSON.parse(row.foto_urls || '[]'),
    tier: { name: row.dog_name, tierart: row.dog_tierart }
  }
}

const ENTRY_COLUMNS_SQL = 't.id, t.datum, t.titel, t.text, t.foto_urls, d.name AS dog_name, d.tierart AS dog_tierart'

module.exports = {
  db,
  PROFIL_ARTS,
  MAX_TEXT_LENGTH,
  BANDS,
  UMKREIS_VALUES,
  PROFIL_SICHTBAR_SQL,
  PUBLIC_DOGS_SQL,
  PUBLIC_ENTRY_SQL,
  ENTRY_COLUMNS_SQL,
  httpError,
  hasKey,
  demoFlag,
  bandOf,
  bandMax,
  bandRank,
  bandBetween,
  bildUrlOf,
  publicName,
  publicDogs,
  toPublicEntry,
  newSlug: () => crypto.randomBytes(SLUG_BYTES).toString('base64url').replace(/[-_]/g, 'x').toLowerCase(),
  cleanAnzeigename
}
