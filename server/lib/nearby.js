'use strict'

// Umkreis-Listen mit Fallback - EINE Regel für "Entdecken" (routes/discover.js: hundeschulen, salon,
// begleiter) und die öffentliche Partnerliste im Umkreis (routes/partners.js, Phase P2 Task 9). Zeilen
// brauchen lat/lon; ohne Koordinaten fallen sie bei einer Umkreissuche ganz heraus.

const { distanceKm } = require('./geo')

// Umkreis-Fallback (Koordinator-Folgeauftrag): zeigt ein dünn besiedelter Umkreis weniger als 5
// Einträge, werden die nächsten Treffer AUSSERHALB des Radius ergänzt (ausserhalb: true), damit die
// Seite nie fast leer wirkt. Ab 5 echten Treffern im Radius bleibt es beim harten Ausschluss.
const MIN_IN_RADIUS = 5
// review finding (Important): ein dünn besiedelter Umkreis mit sehr vielen Partnern insgesamt sollte
// nicht ALLE davon außerhalb anhängen (unbegrenzte Antwortgröße) - nur die nächsten 20.
const MAX_FALLBACK = 20

function sortByName(rows) {
  return rows.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'))
}

function roundKm(dist) {
  return Math.round(dist * 10) / 10
}

// Hängt an jede Zeile mit gültigem lat/lon die Entfernung zu center - ohne Koordinaten fliegt eine Zeile
// ganz raus (keine Koordinaten -> keine Entfernung -> kein Auftritt).
function withDistances(rows, center) {
  return rows
    .filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lon))
    .map((row) => ({ row, dist: distanceKm(center, { lat: row.lat, lon: row.lon }) }))
}

// Teilt Zeilen-mit-Entfernung in "im Radius" (aufsteigend sortiert) und "außerhalb" (ebenfalls
// aufsteigend, also die nächstgelegenen zuerst).
function splitByRadius(rowsWithDistance, radiusKm) {
  const inRadius = rowsWithDistance.filter(({ dist }) => dist <= radiusKm).sort((a, b) => a.dist - b.dist)
  const outside = rowsWithDistance.filter(({ dist }) => dist > radiusKm).sort((a, b) => a.dist - b.dist)
  return { inRadius, outside }
}

// Ohne center alle nach Name ({ row }); mit center die Treffer im Radius ({ row, distanceKm, ausserhalb:
// false }) - und, wenn das WENIGER als MIN_IN_RADIUS sind, zusätzlich die nächsten bis zu MAX_FALLBACK
// außerhalb (ausserhalb: true), nach Entfernung sortiert. fallback: ob etwas ergänzt wurde.
function radiusSection(rows, center, radiusKm) {
  if (!center) return { items: sortByName(rows).map((row) => ({ row })), fallback: false }

  const { inRadius, outside } = splitByRadius(withDistances(rows, center), radiusKm)
  const toItem = (ausserhalb) => ({ row, dist }) => ({ row, distanceKm: roundKm(dist), ausserhalb })

  let items = inRadius.map(toItem(false))
  let fallback = false
  if (inRadius.length < MIN_IN_RADIUS && outside.length) {
    fallback = true
    // outside ist bereits aufsteigend nach Entfernung sortiert - slice(0, MAX_FALLBACK) sind also die
    // MAX_FALLBACK nächstgelegenen, nicht irgendwelche.
    items = items.concat(outside.slice(0, MAX_FALLBACK).map(toItem(true)))
  }
  return { items, fallback }
}

module.exports = { MIN_IN_RADIUS, MAX_FALLBACK, sortByName, roundKm, withDistances, splitByRadius, radiusSection }
