import { describe, expect, test } from 'vitest'
import {
  filterMemories,
  framesFor,
  memoryLabel,
  ownAnimals,
  ownMemories,
  previewFor,
  privatPayload,
  sharedAudience,
  withCountChange
} from './sichtbarkeit.js'

const memberships = [
  { id: 3, name: 'Familie Sonnenhang' },
  { id: 4, name: 'Familie Talgrund' }
]

describe('lib/sichtbarkeit', () => {
  test('ownAnimals: nur eigene, bearbeitbare Tiere des Zuhauses', () => {
    const dogs = [
      { id: 1, name: 'Benno', family_id: 1, can_edit: 1 },
      { id: 2, name: 'Wilma', family_id: 2, can_edit: 0 },
      { id: 3, name: 'Flocke', family_id: 1, can_edit: 0 }
    ]
    expect(ownAnimals(dogs, 1).map((dog) => dog.name)).toEqual(['Benno'])
  })

  test('ownMemories: nur eigene Erinnerungen eigener Tiere, neueste zuerst; Filter nach Art und Tier', () => {
    const entries = [
      { id: 1, dog_id: 1, family_id: 1, datum: '2026-01-01', privat: 1 },
      { id: 2, dog_id: 1, family_id: 1, datum: '2026-05-01', privat: 0 },
      { id: 3, dog_id: 9, family_id: 1, datum: '2026-06-01', privat: 0 },
      { id: 4, dog_id: 1, family_id: 7, datum: '2026-07-01', privat: 0 },
      { id: 5, dog_id: 2, family_id: 1, datum: '2026-03-01', privat: 1 }
    ]
    const own = ownMemories(entries, 1, [1, 2])
    expect(own.map((entry) => entry.id)).toEqual([2, 5, 1])
    expect(filterMemories(own, { filter: 'privat' }).map((entry) => entry.id)).toEqual([5, 1])
    expect(filterMemories(own, { filter: 'geteilt' }).map((entry) => entry.id)).toEqual([2])
    expect(filterMemories(own, { dogId: 2 }).map((entry) => entry.id)).toEqual([5])
  })

  test('sharedAudience/memoryLabel: Familien, alle Familien, Gäste, niemand', () => {
    expect(sharedAudience([3], memberships, 0)).toBe('Familie Sonnenhang')
    expect(sharedAudience([3, 4], memberships, 2)).toBe('alle eure Familien und eure Gäste')
    expect(sharedAudience([], memberships, 1)).toBe('eure Gäste')
    expect(sharedAudience([], memberships, 0)).toBe('noch niemand außer euch')
    expect(memoryLabel({ privat: 1 }, [3], memberships, 0)).toBe('Privat – nur ihr')
    expect(memoryLabel({ privat: 0 }, [4], memberships, 0)).toBe('Geteilt – sehen Familie Talgrund')
  })

  test('privatPayload behält Fotos, Text und Autor; ändert nur privat', () => {
    const entry = { autor_name: 'Pepper', datum: '2026-05-01', titel: 'Am See', text: null, foto_urls: ['/uploads/a.jpg'], kategorie: 'x' }
    expect(privatPayload(entry, true)).toEqual({
      autorName: 'Pepper',
      datum: '2026-05-01',
      titel: 'Am See',
      text: '',
      fotoUrls: ['/uploads/a.jpg'],
      privat: true
    })
  })

  test('withCountChange zählt um, ohne das Original zu ändern', () => {
    const counts = { 1: { privat: 1, geteilt: 2 } }
    expect(withCountChange(counts, 1, true)).toEqual({ 1: { privat: 2, geteilt: 1 } })
    expect(withCountChange(counts, 1, false)).toEqual({ 1: { privat: 0, geteilt: 3 } })
    expect(counts[1]).toEqual({ privat: 1, geteilt: 2 })
  })

  test('previewFor: eine Familie sieht nur geteilte Tiere, ein Gast alle; private zählen nie mit', () => {
    const animals = [{ id: 1 }, { id: 2 }]
    const shares = { 1: [3], 2: [] }
    const counts = { 1: { privat: 2, geteilt: 5 }, 2: { privat: 0, geteilt: 1 } }
    expect(previewFor({ kind: 'familie', id: 3 }, animals, (id) => shares[id], counts)).toEqual([{ dog: animals[0], erinnerungen: 5, privat: 2 }])
    expect(previewFor({ kind: 'gast', id: 9 }, animals, (id) => shares[id], counts).map((row) => row.dog.id)).toEqual([1, 2])
    expect(previewFor(null, animals, () => [], counts)).toEqual([])
  })

  test('framesFor: leere Auswahl heißt alle Tiere', () => {
    const geraete = [
      { id: 1, name: 'Küche', auswahl: { tiere: [] } },
      { id: 2, name: 'Flur', auswahl: { tiere: [2] } }
    ]
    expect(framesFor(1, geraete).map((g) => g.name)).toEqual(['Küche'])
    expect(framesFor(2, geraete).map((g) => g.name)).toEqual(['Küche', 'Flur'])
  })
})
