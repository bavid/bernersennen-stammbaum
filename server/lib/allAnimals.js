'use strict'

// Tiere (GET /api/tiere, routes/tiere.js, Phase W Schritt 4 „Alle Tiere an einem Ort“): alle Tiere, die ein Haushalt im
// eigenen Zuhause sieht - aus den Bereichen von lib/searchAreas.js homeAreasOf (eigenes Zuhause, jede Familie mit
// Mitgliedschaft, jedes besuchte Zuhause), je Bereich genau mit dessen Regeln, keine neuen:
// - welche Tiere: dogsSql des Bereichs (Zuhause und Familien: eigene und hierher geteilte, auch nicht geteilte eigene;
//   Besuche: nur die EIGENEN Tiere des Gastgebers);
// - letzte_erinnerung: das Datum der zuletzt festgehaltenen Erinnerung, die der Bereich zeigt (visibleEntrySql: private nur
//   im eigenen Zuhause) - eine private Erinnerung versteckt kein Tier, verrät aber auch kein Datum;
// - Platzhalter für unbekannte Eltern („Unbekannt“, Mutter oder Vater eines Tiers) gehören nur in den Stammbaum, nicht hierher;
// - zusätzlich nie über die Demo-Grenze: das Tier gehört einem Bereich mit derselben Demo-Angabe wie die Identität (die
//   Bereiche selbst prüft homeAreasOf; das hier fängt eine verirrte Freigabe dog_shares ab).
// Jedes Tier genau einmal: im Bereich, dem es gehört, wenn der zu den Bereichen gehört - sonst im ersten der Reihenfolge
// Zuhause > Familien (nach Namen) > Besuche. Nach außen nur, was eine Karte braucht (toAnimal): keine Freigaben, keine
// Eltern-Ids, keine Freitexte, keine internen Angaben. zuhause: wo das Tier wohnt (Name des Bereichs, dem es gehört), nie
// das eigene Zuhause - dieselbe Regel wie Start (lib/startFeed.js dog.zuhause).

const db = require('../db')
const { isUploadUrl } = require('./validate')
const { areaRef, visibleEntrySql } = require('./searchAreas')

const PLACEHOLDER_PARENT_SQL = `(dogs.name_unbekannt = 1 AND EXISTS (
    SELECT 1 FROM dogs kind WHERE kind.mother_dog_id = dogs.id OR kind.father_dog_id = dogs.id))`

function areaSql(area) {
  return `SELECT dogs.id, dogs.name, dogs.name_unbekannt, dogs.rasse, dogs.tierart, dogs.geschlecht, dogs.geburtsdatum,
      dogs.foto_url, dogs.bei_uns_bis, dogs.abschied_grund, dogs.family_id AS owner_id,
      CASE WHEN dogs.family_id != @homeId THEN owner.name END AS zuhause,
      (SELECT t.datum FROM timeline_entries t WHERE t.dog_id = dogs.id AND ${visibleEntrySql(area)}
        ORDER BY t.created_at DESC, t.id DESC LIMIT 1) AS letzte_erinnerung
    FROM dogs JOIN families owner ON owner.id = dogs.family_id
    WHERE dogs.id IN ${area.dogsSql} AND owner.is_demo = @isDemo AND NOT ${PLACEHOLDER_PARENT_SQL}`
}

// Eine vorbereitete Abfrage je Satz von Regeln (heute genau einer je Bereichsart) - der Schlüssel sind die Regeln selbst, so
// teilen sich nie zwei Bereiche mit verschiedenen Regeln eine Abfrage (security-review Schritt 4, LOW).
const statements = new Map()
function statementFor(area) {
  const key = `${area.art}|${area.dogsSql}|${area.entrySql}`
  if (!statements.has(key)) statements.set(key, db.prepare(areaSql(area)))
  return statements.get(key)
}

function toAnimal(row, area) {
  return {
    id: row.id,
    name: row.name,
    name_unbekannt: Boolean(row.name_unbekannt),
    rasse: row.rasse ?? null,
    tierart: row.tierart,
    geschlecht: row.geschlecht ?? null,
    geburtsdatum: row.geburtsdatum ?? null,
    foto_url: isUploadUrl(row.foto_url) ? row.foto_url : null,
    bei_uns_bis: row.bei_uns_bis ?? null,
    abschied_grund: row.abschied_grund ?? null,
    letzte_erinnerung: row.letzte_erinnerung ?? null,
    area: areaRef(area),
    zuhause: row.zuhause ?? null
  }
}

// Der Bereich, in dem das Tier erscheint: der, dem es gehört (falls dabei), sonst der erste, in dem es sichtbar ist.
function pickPlaces(areas, rowsByArea) {
  const places = new Map()
  rowsByArea.forEach((rows, index) => {
    for (const row of rows) {
      const current = places.get(row.id)
      const owns = areas[index].id === row.owner_id
      if (!current || (owns && areas[current.index].id !== row.owner_id)) places.set(row.id, { row, index })
    }
  })
  return [...places.values()]
}

const byName = (a, b) => a.row.name.localeCompare(b.row.name, 'de') || a.row.id - b.row.id

// Reihenfolge: nach Bereich (wie areas), darin erst die Tiere, die noch da sind, dann die gegangenen; je nach Namen.
function compare(a, b) {
  if (a.index !== b.index) return a.index - b.index
  const goneA = Boolean(a.row.bei_uns_bis)
  const goneB = Boolean(b.row.bei_uns_bis)
  if (goneA !== goneB) return goneA ? 1 : -1
  return byName(a, b)
}

// { areas (homeAreasOf, areas[0] = das eigene Zuhause), homeId, isDemo } -> { tiere, areas: [{ id, name, art, anzahl }] }.
function allAnimals({ areas, homeId, isDemo }) {
  const params = { homeId, isDemo: isDemo ? 1 : 0 }
  const rowsByArea = areas.map((area) => statementFor(area).all({ ...params, familyId: area.id }))
  const places = pickPlaces(areas, rowsByArea).sort(compare)
  const counts = areas.map((_, index) => places.filter((place) => place.index === index).length)
  return {
    tiere: places.map(({ row, index }) => toAnimal(row, areas[index])),
    areas: areas.map((area, index) => ({ ...areaRef(area), anzahl: counts[index] }))
  }
}

module.exports = { allAnimals }
