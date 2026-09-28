'use strict'

// Fiktive Testdaten statt echter Overpass-Anfragen - für Tests, Demo und die Testumgebung (Task 3).
// Nie externe Anfragen: die Daten liegen fertig in server/geo/places-fixture.json.

const fixturePlaces = require('../../../geo/places-fixture.json')
const { distanceKm } = require('../../geo')

async function searchFixture({ lat, lon, radiusKm }) {
  const center = { lat, lon }
  return fixturePlaces
    .filter((place) => distanceKm(center, { lat: place.lat, lon: place.lon }) <= radiusKm)
    .map((place) => ({ ...place, quelle: 'fixture' }))
}

module.exports = { searchFixture }
