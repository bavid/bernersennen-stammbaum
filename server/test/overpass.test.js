const test = require('node:test')
const assert = require('node:assert/strict')
const { mapElement } = require('../lib/places/providers/overpass')

// Realistische Overpass-Antwort (fiktive Orte) - deckt ab: normale Treffer (Koordinaten direkt ODER
// über "center"), amenity=animal_breeding UND animal_breeding:* als Ausschlussgrund, den breederGuard
// über operator statt nur name, fehlenden Namen, fehlende Koordinaten und eine unsichere Website
// (security-review Phase 2 Finding 2).
const elements = [
  {
    type: 'node',
    id: 101,
    lat: 52.5401,
    lon: 13.3902,
    tags: {
      amenity: 'animal_shelter',
      name: 'Tierheim Sonnenhang',
      'addr:street': 'Waldweg',
      'addr:housenumber': '3',
      'addr:postcode': '10115',
      'addr:city': 'Berlin',
      website: 'https://example.org/s',
      phone: '+49 30 5550101'
    }
  },
  {
    type: 'way',
    id: 202,
    center: { lat: 52.51, lon: 13.4 },
    tags: {
      amenity: 'animal_training',
      animal_training: 'dog;horse',
      name: 'Hundeschule Pfotenglück',
      'contact:website': 'https://example.org/pg',
      'contact:email': 'kurse@example.org'
    }
  },
  {
    type: 'relation',
    id: 303,
    center: { lat: 52.52, lon: 13.41 },
    tags: { amenity: 'animal_shelter', name: '  Tierschutzverein Deichland ' }
  },
  {
    type: 'node',
    id: 404,
    lat: 52.53,
    lon: 13.42,
    tags: { amenity: 'animal_training', animal_training: 'dog', name: 'Hundeschule am Berg', animal_breeding: 'dog' }
  },
  {
    type: 'node',
    id: 505,
    lat: 52.53,
    lon: 13.42,
    tags: { amenity: 'animal_shelter', name: 'Tierhof', operator: 'Hundezüchter Meier' }
  },
  { type: 'node', id: 606, lat: 52.53, lon: 13.42, tags: { amenity: 'animal_shelter' } },
  { type: 'way', id: 707, tags: { amenity: 'animal_shelter', name: 'Ohne Center' } },
  {
    type: 'node',
    id: 808,
    lat: 52.53,
    lon: 13.42,
    tags: { amenity: 'animal_shelter', name: 'Tierheim Link', website: 'javascript:alert(1)' }
  }
]

test('mapElement: filtert Zucht-Tags/Züchter/ohne Name/ohne Koordinaten, sanitisiert Kontaktfelder', () => {
  const mapped = elements.map(mapElement)
  const kept = mapped.filter(Boolean)

  assert.deepEqual(
    kept.map((p) => p.id),
    ['osm:node/101', 'osm:way/202', 'osm:relation/303', 'osm:node/808']
  )

  const shelter = kept.find((p) => p.id === 'osm:node/101')
  assert.equal(shelter.name, 'Tierheim Sonnenhang')
  assert.equal(shelter.typ, 'tierheim')
  assert.equal(shelter.adresse, 'Waldweg 3, 10115 Berlin')
  assert.equal(shelter.website, 'https://example.org/s')
  assert.equal(shelter.quelle, 'osm')

  const school = kept.find((p) => p.id === 'osm:way/202')
  assert.equal(school.typ, 'hundeschule')
  assert.equal(school.lat, 52.51)
  assert.equal(school.website, 'https://example.org/pg')
  assert.equal(school.email, 'kurse@example.org')

  const relation = kept.find((p) => p.id === 'osm:relation/303')
  assert.equal(relation.name, 'Tierschutzverein Deichland')

  const linkNode = kept.find((p) => p.id === 'osm:node/808')
  assert.equal(linkNode.website, null, 'javascript: ist kein http(s) und wird zu null sanitisiert')

  // amenity=animal_training + animal_breeding=dog -> verworfen, obwohl Name/Koordinaten sonst passen
  assert.equal(mapElement(elements[3]), null)
  // operator "Hundezüchter Meier" -> vom breederGuard über operator (nicht nur name) verworfen
  assert.equal(mapElement(elements[4]), null)
  // kein Name -> verworfen
  assert.equal(mapElement(elements[5]), null)
  // kein lat/lon UND kein center -> verworfen
  assert.equal(mapElement(elements[6]), null)
})

test('mapElement: amenity=animal_breeding und ein beliebiger animal_breeding:*-Tag verwerfen das Element', () => {
  const base = { type: 'node', id: 1, lat: 52.5, lon: 13.4 }
  assert.equal(mapElement({ ...base, tags: { amenity: 'animal_breeding', name: 'Irgendwas' } }), null)
  assert.equal(mapElement({ ...base, tags: { amenity: 'animal_shelter', name: 'Irgendwas', animal_breeding: 'dog' } }), null)
  assert.equal(mapElement({ ...base, tags: { amenity: 'animal_shelter', name: 'Irgendwas', 'animal_breeding:dog': 'yes' } }), null)
})

test('mapElement: breederGuard prüft auch description, alt_name, official_name, brand, website', () => {
  const base = { type: 'node', id: 1, lat: 52.5, lon: 13.4, tags: { amenity: 'animal_shelter', name: 'Unauffälliger Name' } }
  assert.equal(mapElement({ ...base, tags: { ...base.tags, description: 'Wir sind eine kleine Hundezucht' } }), null)
  assert.equal(mapElement({ ...base, tags: { ...base.tags, alt_name: 'Zwinger vom Hexenwald' } }), null)
  assert.equal(mapElement({ ...base, tags: { ...base.tags, official_name: 'Katzenzüchter Nord' } }), null)
  assert.equal(mapElement({ ...base, tags: { ...base.tags, brand: 'Welpenverkauf Schmidt' } }), null)
  assert.equal(mapElement({ ...base, tags: { ...base.tags, website: 'https://hundezucht-beispiel.de' } }), null)
  // unauffällig bleibt unauffällig
  assert.ok(mapElement(base))
})

test('mapElement: sanitisiert Kontaktfelder wie lib/partners.js (bare www., ungültige E-Mail/Telefon -> null)', () => {
  const base = { type: 'node', id: 1, lat: 52.5, lon: 13.4, tags: { amenity: 'animal_shelter', name: 'Test-Tierheim' } }

  const bareWww = mapElement({ ...base, tags: { ...base.tags, website: 'www.example.org' } })
  assert.equal(bareWww.website, 'https://www.example.org/')

  const badEmail = mapElement({ ...base, tags: { ...base.tags, email: 'keine-email' } })
  assert.equal(badEmail.email, null)

  const emailWithQuery = mapElement({ ...base, tags: { ...base.tags, email: 'a?b@example.org' } })
  assert.equal(emailWithQuery.email, null)

  const badPhone = mapElement({ ...base, tags: { ...base.tags, phone: 'ruf mich an' } })
  assert.equal(badPhone.telefon, null)

  const noContact = mapElement(base)
  assert.equal(noContact.website, null)
  assert.equal(noContact.email, null)
  assert.equal(noContact.telefon, null)
})
