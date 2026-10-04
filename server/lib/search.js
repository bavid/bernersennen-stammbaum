'use strict'

// Suche (POST /api/suche, routes/suche.js): Tiere, Erinnerungen, Pinnwand, Familien & befreundete Zuhause und Partner -
// je Bereich aus lib/searchAreas.js mit dessen eigenen Sichtbarkeitsregeln, danach zusammengeführt.
// Vergleich: lib/searchText.js faltet Text und Suchbegriff gleich (zwei Fassungen, siehe dort); in der Datenbank prüfen
// die SQL-Funktionen aus lib/searchMatch.js (suche_hat, suche_rang) - ohne LIKE, mit Arbeitsbudget je Anfrage.
// Reihenfolge: genau gleich, dann am Anfang, dann irgendwo (Rang aus der ersten Spalte) - jeweils das Neueste zuerst
// (Partner nach Name). Je Gruppe höchstens LIMIT Treffer (mehr: true, wenn es mehr gäbe) und nur die Felder für die
// Ergebniszeile - von Erinnerungen und Zetteln ein Auszug rund um den Treffer (höchstens 140 Zeichen), nie der ganze Text.

const db = require('../db')
const { dogLabel } = require('./labels')
const { publicPartnerSql } = require('./partners')
const { foldDe, foldBasis, excerpt, matchRank } = require('./searchText')
const { begin, end, matchSql, rankSql } = require('./searchMatch')
const { areaRef } = require('./searchAreas')

const LIMIT = 20
const GROUPS = ['tiere', 'erinnerungen', 'pinnwand', 'familien', 'partner']

const statements = new Map()
function prepared(key, sql) {
  if (!statements.has(key)) statements.set(key, db.prepare(sql))
  return statements.get(key)
}

// Wo das Tier wohnt: der Name seines Zuhauses (bzw. der Familie, der es selbst gehört) - nie das eigene Zuhause (@homeId).
// Nur für Tiere, die der Bereich ohnehin zeigt (dogsSql) - deren Zuhause nennt dort auch die Familienbande.
const DOG_HOME_SQL = '(SELECT f.name FROM families f WHERE f.id = d.family_id AND d.family_id != @homeId)'

const animalSql = (area) => `
  SELECT d.id, d.name, d.name_unbekannt, d.rasse, d.tierart, d.foto_url, d.abschied_grund, d.created_at,
    ${DOG_HOME_SQL} AS zuhause,
    ${rankSql('d.name')} AS rang
  FROM dogs d
  WHERE d.id IN ${area.dogsSql} AND (${matchSql('d.name')} OR ${matchSql('d.rasse')})
  ORDER BY rang, d.created_at DESC, d.id DESC LIMIT ${LIMIT + 1}`

const memorySql = (area) => `
  SELECT t.id, t.titel, t.text, t.datum, d.id AS dog_id, d.name, d.name_unbekannt, d.rasse, ${DOG_HOME_SQL} AS zuhause,
    ${rankSql('t.titel')} AS rang
  FROM timeline_entries t JOIN dogs d ON d.id = t.dog_id
  WHERE ${area.entrySql} AND t.dog_id IN ${area.dogsSql} AND (${matchSql('t.titel')} OR ${matchSql('t.text')})
  ORDER BY rang, t.datum DESC, t.id DESC LIMIT ${LIMIT + 1}`

const noteSql = `
  SELECT n.id, n.text, n.termin_datum, n.termin_zeit, n.created_at, ${rankSql('n.text')} AS rang
  FROM notes n WHERE n.family_id = @familyId AND ${matchSql('n.text')}
  ORDER BY rang, n.created_at DESC, n.id DESC LIMIT ${LIMIT + 1}`

const partnerSql = (demoCount) => `
  SELECT p.id, p.slug, p.name, p.typ, p.ort, p.logo_file, ${rankSql('p.name')} AS rang
  FROM partners p
  WHERE ${publicPartnerSql('p')} AND p.is_demo IN (${Array.from({ length: demoCount }, (_, i) => `@demo${i}`).join(', ')})
    AND (${matchSql('p.name')} OR ${matchSql('p.ort')})
  ORDER BY rang, p.name COLLATE NOCASE, p.id LIMIT ${LIMIT + 1}`

// Treffer aller Bereiche: jeder Datensatz nur einmal (der erste Bereich gewinnt - der aktive, dann das eigene Zuhause vor
// Familien vor Besuchen, siehe runSearch), dann sortiert und gekappt. mehr: es gäbe weitere Treffer (auch, wenn schon ein Bereich gekappt wurde).
function merge(rowsByArea, compare) {
  const seen = new Set()
  const all = []
  let capped = false
  for (const rows of rowsByArea) {
    if (rows.length > LIMIT) capped = true
    for (const row of rows.slice(0, LIMIT)) {
      if (seen.has(row.key)) continue
      seen.add(row.key)
      all.push(row)
    }
  }
  all.sort(compare)
  return { treffer: all.slice(0, LIMIT).map((row) => row.item), mehr: capped || all.length > LIMIT }
}

// Rang aufsteigend, dann field (ISO-Datum als Text) absteigend, dann die höhere Id zuerst.
const newestFirst = (a, b) => (a === b ? 0 : String(a ?? '') < String(b ?? '') ? 1 : -1)
const byRankThen = (field) => (a, b) => a.rang - b.rang || newestFirst(a[field], b[field]) || b.key - a.key

function searchAnimals({ areas, activeId, homeId }) {
  const rowsByArea = areas.map((area) =>
    prepared(`tiere:${area.art}`, animalSql(area))
      .all({ familyId: area.id, homeId })
      .map((row) => ({
        key: row.id,
        rang: row.rang,
        created: row.created_at,
        item: {
          id: row.id,
          name: dogLabel(row),
          rasse: row.rasse || null,
          tierart: row.tierart || 'hund',
          // Fotos lädt der Browser über /uploads - das zeigt nur Fotos des aktiven Bereichs (lib/uploadAccess.js).
          fotoUrl: area.id === activeId ? row.foto_url || null : null,
          zuhause: row.zuhause || null,
          inErinnerung: row.abschied_grund === 'verstorben',
          bereich: areaRef(area)
        }
      }))
  )
  return merge(rowsByArea, byRankThen('created'))
}

function searchMemories({ areas, query, homeId }) {
  const rowsByArea = areas.map((area) =>
    prepared(`erinnerungen:${area.art}`, memorySql(area))
      .all({ familyId: area.id, homeId })
      .map((row) => ({
        key: row.id,
        rang: row.rang,
        datum: row.datum,
        item: {
          id: row.id,
          titel: row.titel,
          auszug: excerpt(row.text, query),
          datum: row.datum,
          tier: { id: row.dog_id, name: dogLabel(row) },
          zuhause: row.zuhause || null,
          bereich: areaRef(area)
        }
      }))
  )
  return merge(rowsByArea, byRankThen('datum'))
}

function searchNotes({ areas, query }) {
  const rowsByArea = areas
    .filter((area) => area.notes)
    .map((area) =>
      prepared('pinnwand', noteSql)
        .all({ familyId: area.id })
        .map((row) => ({
          key: row.id,
          rang: row.rang,
          created: row.created_at,
          item: {
            id: row.id,
            auszug: excerpt(row.text, query),
            terminDatum: row.termin_datum || null,
            terminZeit: row.termin_zeit || null,
            bereich: areaRef(area)
          }
        }))
    )
  return merge(rowsByArea, byRankThen('created'))
}

// Familien und besuchte Zuhause sind die Bereiche selbst (schon geladen) - verglichen wird hier mit derselben Faltung.
function searchFamilies({ areas, query }) {
  const rows = areas
    .filter((area) => area.art !== 'eigen')
    .map((area, index) => ({ key: area.id, rang: matchRank(area.name, query), index, area }))
    .filter((row) => row.rang < 3)
    .map((row) => ({ ...row, item: { id: row.area.id, name: row.area.name, art: row.area.art, rolle: row.area.rolle } }))
  return merge([rows], (a, b) => a.rang - b.rang || a.index - b.index)
}

function searchPartners({ partnerDemo }) {
  const demoParams = Object.fromEntries(partnerDemo.map((value, index) => [`demo${index}`, value]))
  const rows = prepared(`partner:${partnerDemo.length}`, partnerSql(partnerDemo.length))
    .all(demoParams)
    .map((row, index) => ({
      key: row.id,
      rang: row.rang,
      index,
      item: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        typ: row.typ,
        ort: row.ort || null,
        logoUrl: row.logo_file ? `/partner-media/${row.logo_file}` : null
      }
    }))
  return merge([rows], (a, b) => a.rang - b.rang || a.index - b.index)
}

const SEARCHERS = {
  tiere: searchAnimals,
  erinnerungen: searchMemories,
  pinnwand: searchNotes,
  familien: searchFamilies,
  partner: searchPartners
}

// query: schon geprüft (lib/searchText.js cleanQuery); groups: Teilmenge von GROUPS; areas: lib/searchAreas.js;
// activeId: der aktive Bereich der Sitzung; homeId: die Identität (Tiere und Erinnerungen nennen ihr Zuhause - zuhause - nur,
// wenn es nicht dieses ist); partnerDemo: erlaubte is_demo-Werte der Partner (routes/discover.js).
// Der aktive Bereich zuerst: ist ein Treffer auch dort sichtbar (z. B. ein Tier des Zuhauses, das in die gerade offene
// Familie geteilt ist), führt er dorthin - mit Foto und ohne Wechsel des Bereichs.
// Ist das Arbeitsbudget (lib/searchMatch.js) aufgebraucht, fehlen womöglich Treffer: jede Gruppe sagt dann mehr: true und die
// Antwort unvollstaendig: true (der Client bittet um ein genaueres Wort).
function runSearch({ query, groups, areas, activeId, homeId, partnerDemo }) {
  const ordered = [...areas.filter((area) => area.id === activeId), ...areas.filter((area) => area.id !== activeId)]
  const context = { query, areas: ordered, activeId, homeId, partnerDemo }
  begin({ qDe: foldDe(query), qBasis: foldBasis(query) })
  let gruppen
  let exhausted = false
  try {
    gruppen = Object.fromEntries(groups.map((group) => [group, SEARCHERS[group](context)]))
  } finally {
    exhausted = end().exhausted
  }
  if (!exhausted) return { gruppen }
  const marked = Object.fromEntries(Object.entries(gruppen).map(([group, result]) => [group, { ...result, mehr: true }]))
  return { gruppen: marked, unvollstaendig: true }
}

module.exports = { runSearch, GROUPS, LIMIT }
