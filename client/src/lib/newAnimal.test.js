import { describe, expect, test } from 'vitest'
import { TIERART_CHOICES, emptyAnimal, moreSummary, newAnimalErrors, newAnimalPayload, choiceTierart, sexChoices } from './newAnimal.js'

describe('Neues Tier: Tierart als große Wahl', () => {
  test('Hund, Katze, Kaninchen, Vogel, Pferd, Anderes', () => {
    expect(TIERART_CHOICES.map((choice) => choice.label)).toEqual(['Hund', 'Katze', 'Kaninchen', 'Vogel', 'Pferd', 'Anderes'])
    expect(choiceTierart('kaninchen')).toBe('anderes')
    expect(choiceTierart('katze')).toBe('katze')
    expect(choiceTierart('')).toBe('anderes')
  })

  test('nötig sind nur Tierart und Name (oder „Name unbekannt“)', () => {
    expect(newAnimalErrors(emptyAnimal())).toEqual({ art: 'Bitte wähle eine Tierart.', name: 'Bitte gib einen Namen an – oder wähle „Name unbekannt“.' })
    expect(newAnimalErrors({ ...emptyAnimal(), art: 'hund', name: '  ' }).name).toBeDefined()
    expect(newAnimalErrors({ ...emptyAnimal(), art: 'hund', nameUnbekannt: true })).toEqual({})
    expect(newAnimalErrors({ ...emptyAnimal(), art: 'hund', name: 'Benno' })).toEqual({})
  })
})

describe('Neues Tier: was an den Server geht (bestehende API, keine neuen Pflichtfelder)', () => {
  test('Kaninchen, Vogel, Pferd sind „anderes“ mit der Art als Rasse', () => {
    const payload = newAnimalPayload({ ...emptyAnimal(), art: 'kaninchen', name: 'Hoppel', rasse: 'egal' })
    expect(payload).toEqual(expect.objectContaining({ tierart: 'anderes', rasse: 'Kaninchen', name: 'Hoppel', geschlecht: 'huendin' }))
  })

  test('„Anderes“ nimmt „Welches Tier?“; Hund/Katze die Rasse aus „Mehr Angaben“', () => {
    expect(newAnimalPayload({ ...emptyAnimal(), art: 'anderes', artText: ' Schildkröte ', name: 'Kurt' }).rasse).toBe('Schildkröte')
    expect(newAnimalPayload({ ...emptyAnimal(), art: 'anderes', name: 'Kurt' }).rasse).toBeNull()
    expect(newAnimalPayload({ ...emptyAnimal(), art: 'hund', name: 'Benno', rasse: 'Hovawart' }).rasse).toBe('Hovawart')
  })

  test('optionale Angaben nur, wenn gesetzt; Foto, Eltern, Mitbewohner, Tierheim', () => {
    const form = {
      ...emptyAnimal(),
      art: 'hund',
      name: 'Benno',
      fotos: ['/uploads/b.jpg'],
      geburtsdatum: '2024-03-01',
      beiUnsSeit: '2024-05-01',
      beschreibung: 'Frech',
      geschlecht: 'ruede',
      mother: { dogId: 4, freitext: '' },
      father: { dogId: '', freitext: 'Pepper vom Hof' },
      housemateId: 7
    }
    expect(newAnimalPayload(form)).toEqual({
      name: 'Benno',
      nameUnbekannt: false,
      tierart: 'hund',
      rasse: null,
      geschlecht: 'ruede',
      geburtsdatum: '2024-03-01',
      beiUnsSeit: '2024-05-01',
      beschreibung: 'Frech',
      fotoUrl: '/uploads/b.jpg',
      motherDogId: 4,
      motherFreitext: null,
      fatherDogId: null,
      fatherFreitext: 'Pepper vom Hof',
      housemateId: 7
    })
    expect(newAnimalPayload(form, { livesWith: { id: 9 }, shelter: true })).toEqual(
      expect.objectContaining({ housemateId: 9, vermittlungStatus: 'in_vermittlung' })
    )
    expect(newAnimalPayload({ ...form, nameUnbekannt: true }).name).toBe('')
  })

  test('Zusammenfassung von „Mehr Angaben“; das Geschlecht in den Wörtern der Tierart', () => {
    expect(moreSummary({ ...emptyAnimal(), art: 'hund' })).toBe('Rasse, Geburtstag, Eltern …')
    expect(moreSummary({ ...emptyAnimal(), art: 'vogel' })).toBe('Geburtstag, Eltern …')
    expect(sexChoices('hund').map((c) => c.label)).toEqual(['Hündin', 'Rüde'])
    expect(sexChoices('katze').map((c) => c.label)).toEqual(['Katze', 'Kater'])
    expect(sexChoices('pferd').map((c) => c.label)).toEqual(['weiblich', 'männlich'])
  })
})
