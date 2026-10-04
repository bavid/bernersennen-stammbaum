'use strict'

// Suche (GET /api/suche, lib/search.js): in welchen Bereichen die angemeldete Identität sucht - und mit welchen Regeln.
// Keine eigenen Sichtbarkeitsregeln: je Bereich genau die SQL-Teile, mit denen die Seiten dort ohnehin lesen.
// - das eigene Zuhause (bzw. beim klassischen Login mit dem Schlüssel einer Familie: die Familie selbst) - wie jede Seite
//   im eigenen Bereich (VISIBLE_DOGS_SQL, VISIBLE_ENTRY_SQL: eigene Erinnerungen auch privat, hierher geteilte nicht-private),
//   dazu die eigene Pinnwand;
// - jede Familie (art 'rudel'), in der das Zuhause Mitglied ist - dieselben Regeln mit der Familie als Bereich (wie die
//   Gruppenseite), samt ihrer Pinnwand. Nie über die Demo-Grenze hinweg (wie lib/context.js canEnter);
// - jedes Zuhause, das es gerade besucht (lib/visits.js visitsOf, Demo-Grenze dort) - nach den Gast-Regeln: die eigenen Tiere
//   des Gastgebers und nur dessen nicht-private Erinnerungen (GUEST_ENTRY_SQL), keine Pinnwand (routes/notes.js zeigt
//   Gästen keine).
// Eine Besuchs-Sitzung (req.isGuest) sucht nur im eigenen Zuhause und beim Gastgeber. Tierheime und Partner-Bereiche
// (Identität art 'tierheim'/'partner') suchen gar nicht: null -> routes/suche.js antwortet 404.
// Alle SQL-Teile erwarten @familyId = der Bereich.

const db = require('../db')
const { ART, PARTNER_AREA_ARTS, OWN_DOGS_SQL, VISIBLE_DOGS_SQL, VISIBLE_ENTRY_SQL, membershipsOf } = require('./context')
const { GUEST_ENTRY_SQL, isVisiting, visitsOf } = require('./visits')

// Obergrenze der durchsuchten Bereiche je Anfrage - schützt den Server bei ungewöhnlich vielen Mitgliedschaften/Besuchen.
const MAX_AREAS = 20

const AREA_ART = { home: 'eigen', family: 'familie', visit: 'besuch' }

const MEMBER_RULES = { dogsSql: VISIBLE_DOGS_SQL, entrySql: VISIBLE_ENTRY_SQL, notes: true }
// Gast: nur die EIGENEN Tiere des Gastgebers (enger als GET /api/dogs, Verteidigungslinie - in ein Zuhause wird nie geteilt).
const GUEST_RULES = { dogsSql: OWN_DOGS_SQL, entrySql: GUEST_ENTRY_SQL, notes: false }

const findFamily = db.prepare('SELECT id, name, art, is_demo FROM families WHERE id = ?')

// { id, name, art: 'eigen' | 'familie' | 'besuch', rolle, dogsSql, entrySql, notes }
function toArea(row, kind, rolle = null) {
  const rules = kind === 'visit' ? GUEST_RULES : MEMBER_RULES
  return { id: row.id, name: row.name, art: AREA_ART[kind], rolle, ...rules }
}

function memberFamilies(identity) {
  return membershipsOf(identity.id)
    .filter((membership) => {
      const family = findFamily.get(membership.id)
      return family && family.art === ART.rudel && family.is_demo === identity.is_demo
    })
    .map((membership) => toArea(membership, 'family', membership.rolle))
}

function areasOf(identity, { familyId, isGuest }) {
  const home = toArea(identity, 'home')
  if (isGuest) {
    const host = findFamily.get(familyId)
    return host && isVisiting(identity.id, familyId) ? [home, toArea(host, 'visit')] : [home]
  }
  if (identity.art !== ART.zuhause) return [home]
  const visits = visitsOf(identity.id).map((row) => toArea(row, 'visit'))
  return [home, ...memberFamilies(identity), ...visits].slice(0, MAX_AREAS)
}

// homeId: die Identität, familyId: der aktive Bereich, isGuest: die Sitzung besucht gerade familyId (middleware/auth.js).
// -> { areas, isDemo } (isDemo: die Identität selbst - danach richtet sich auch, welche Partner sie findet) oder null.
function searchScopeOf({ homeId, familyId, isGuest }) {
  const identity = findFamily.get(homeId)
  if (!identity || PARTNER_AREA_ARTS.includes(identity.art)) return null
  return { areas: areasOf(identity, { familyId, isGuest }), isDemo: Boolean(identity.is_demo) }
}

// Nur, was der Client über einen Bereich wissen muss.
function areaRef(area) {
  return { id: area.id, name: area.name, art: area.art }
}

module.exports = { searchScopeOf, areaRef, MAX_AREAS }
