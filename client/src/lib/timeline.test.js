import { describe, expect, test } from 'vitest'
import {
  SEX_CHOICES,
  animalKind,
  buildTimeline,
  displayName,
  dogLabel,
  genitive,
  groupByYear,
  isKnownSex,
  livesWithLabel,
  sexLabel,
  shortName,
  speciesNoun,
  speciesSexLabel
} from './timeline.js'
import { ageText, formatDateLong, formatDateShort } from './dates.js'

const dog = { id: 1, name: 'Aiko vom Sonnenhang', geburtsdatum: '2014-05-12' }

describe('buildTimeline', () => {
  test('sorts entries chronologically regardless of creation order', () => {
    const entries = [
      { id: 1, datum: '2024-05-12', titel: 'Geburtstag' },
      { id: 2, datum: '2014-07-20', titel: 'Einzug' },
      { id: 3, datum: '2019-09-01', titel: 'Wanderung' }
    ]
    const items = buildTimeline({ dog, entries })
    expect(items.map((i) => i.titel)).toEqual(['Aiko kommt zur Welt', 'Einzug', 'Wanderung', 'Geburtstag'])
  })

  test('newest first reverses the order', () => {
    const entries = [
      { id: 1, datum: '2020-01-01', titel: 'A' },
      { id: 2, datum: '2021-01-01', titel: 'B' }
    ]
    const items = buildTimeline({ dog: { ...dog, geburtsdatum: null }, entries, newestFirst: true })
    expect(items.map((i) => i.titel)).toEqual(['B', 'A'])
  })

  test('same-day entries keep creation order', () => {
    const entries = [
      { id: 5, datum: '2020-01-01', titel: 'Später angelegt' },
      { id: 4, datum: '2020-01-01', titel: 'Zuerst angelegt' }
    ]
    const items = buildTimeline({ dog: { ...dog, geburtsdatum: null }, entries })
    expect(items.map((i) => i.titel)).toEqual(['Zuerst angelegt', 'Später angelegt'])
  })

  test('adds litter and breeding milestones', () => {
    const children = [
      { id: 7, name: 'Cora vom Sonnenhang', geburtsdatum: '2017-06-18' },
      { id: 8, name: 'Dante vom Sonnenhang', geburtsdatum: '2017-06-18' }
    ]
    const breedingEvents = [{ id: 1, mutter_dog_id: 2, vater_dog_id: 1, mutter_name: 'Bella vom Emmental', datum: '2017-04-16' }]
    const items = buildTimeline({ dog, children, breedingEvents })
    expect(items.map((i) => i.titel)).toEqual([
      'Aiko kommt zur Welt',
      'Verpaarung mit Bella',
      'Nachwuchs: Cora, Dante'
    ])
  })

  test('the breeding milestone uses the word of the theme (Phase U: standard "Verpaarung")', () => {
    const breedingEvents = [{ id: 1, mutter_dog_id: 2, vater_dog_id: 1, mutter_name: 'Bella vom Emmental', datum: '2017-04-16' }]
    const titles = buildTimeline({ dog, breedingEvents, matingLabel: 'Verpaarung' }).map((i) => i.titel)
    expect(titles).toContain('Verpaarung mit Bella')
    const lone = buildTimeline({ dog, breedingEvents: [{ id: 2, mutter_dog_id: 9, vater_dog_id: 1, datum: '2018-01-01' }], matingLabel: 'Verpaarung' })
    expect(lone.map((i) => i.titel)).toContain('Verpaarung')
  })

  test('adds an arrival milestone with the origin as text', () => {
    const items = buildTimeline({
      dog: { ...dog, bei_uns_seit: '2015-01-10', herkunft_art: 'tierheim', herkunft_text: 'Tierheim Sonnenhang' }
    })
    expect(items.map((i) => i.titel)).toEqual(['Aiko kommt zur Welt', 'Aiko zieht ein'])
    expect(items[1].text).toBe('aus dem Tierheim Sonnenhang')
  })

  test('an arrival milestone without origin has no text', () => {
    const items = buildTimeline({ dog: { ...dog, geburtsdatum: null, bei_uns_seit: '2015-01-10' } })
    expect(items[0]).toMatchObject({ type: 'arrival', titel: 'Aiko zieht ein', text: null })
  })

  test('the farewell title depends on the reason', () => {
    const base = { ...dog, geburtsdatum: null, bei_uns_bis: '2024-01-01' }
    expect(buildTimeline({ dog: { ...base, abschied_grund: 'verstorben' } })[0].titel).toBe('Abschied von Aiko')
    expect(buildTimeline({ dog: { ...base, abschied_grund: 'abgegeben' } })[0].titel).toBe('Aiko zieht aus')
    expect(buildTimeline({ dog: { ...base, abschied_grund: 'umgezogen' } })[0].titel).toBe('Aiko zieht aus')
    expect(buildTimeline({ dog: { ...base, abschied_grund: 'anderes' } })[0].titel).toBe('Aiko geht')
    expect(buildTimeline({ dog: { ...base, abschied_grund: null } })[0].titel).toBe('Aiko geht')
  })

  test('birth, arrival and farewell sort chronologically together with entries', () => {
    const items = buildTimeline({
      dog: { ...dog, bei_uns_seit: '2014-08-01', bei_uns_bis: '2024-05-01', abschied_grund: 'verstorben' },
      entries: [{ id: 1, datum: '2020-01-01', titel: 'Ausflug' }]
    })
    expect(items.map((i) => i.titel)).toEqual([
      'Aiko kommt zur Welt',
      'Aiko zieht ein',
      'Ausflug',
      'Abschied von Aiko'
    ])
  })

  test('groups items by year', () => {
    const groups = groupByYear([
      { datum: '2020-01-01' },
      { datum: '2020-05-01' },
      { datum: '2021-01-01' }
    ])
    expect(groups.map((g) => [g.year, g.items.length])).toEqual([
      [2020, 2],
      [2021, 1]
    ])
  })
})

describe('dates', () => {
  test('formats dates without timezone drift', () => {
    expect(formatDateLong('2014-05-12')).toBe('12. Mai 2014')
    expect(formatDateShort('2014-05-02')).toBe('02.05.2014')
  })

  test('computes a readable age', () => {
    expect(ageText('2014-05-12', '2024-05-12')).toBe('10 Jahre')
    expect(ageText('2014-05-12', '2024-05-11')).toBe('9 Jahre')
    expect(ageText('2023-02-14', '2023-09-20')).toBe('7 Monate')
    expect(ageText('2023-02-14', '2023-03-01')).toBe('2 Wochen')
    expect(ageText('2023-02-14', '2022-01-01')).toBeNull()
  })

  test('unknown-named dogs are labelled by breed', () => {
    const unknown = { name: 'Unbekannt', name_unbekannt: 1, rasse: 'Hovawart' }
    expect(displayName(unknown)).toBe('Unbekannt')
    expect(dogLabel(unknown)).toBe('Unbekannt (Hovawart)')
    expect(dogLabel({ name: 'Tilda vom Hof', name_unbekannt: 0 })).toBe('Tilda')
  })

  test('sex labels depend on the species', () => {
    expect(sexLabel('ruede')).toBe('Rüde')
    expect(sexLabel('huendin', 'katze')).toBe('Katze')
    expect(sexLabel('ruede', 'anderes')).toBe('männlich')
  })

  // Geschlecht „weiß ich nicht“: nie Hündin/Rüde, in der kombinierten Zeile nur die Art.
  test('unknown sex: no sex word, only the species', () => {
    expect(sexLabel('unbekannt')).toBe('')
    expect(sexLabel('unbekannt', 'katze')).toBe('')
    expect(speciesSexLabel('hund', 'unbekannt')).toBe('Hund')
    expect(speciesSexLabel('anderes', 'unbekannt')).toBe('Anderes Tier')
    expect(speciesSexLabel('hund', 'huendin')).toBe('Hund · Hündin')
    expect(speciesSexLabel('katze', 'huendin')).toBe('Katze')
    expect(isKnownSex('huendin')).toBe(true)
    expect(isKnownSex('ruede')).toBe(true)
    expect(isKnownSex('unbekannt')).toBe(false)
    expect(SEX_CHOICES.map((choice) => [choice.value, choice.label])).toEqual([
      ['huendin', 'weiblich'],
      ['ruede', 'männlich'],
      ['unbekannt', 'weiß ich nicht']
    ])
  })

  test('livesWithLabel names the animals someone lives with', () => {
    expect(livesWithLabel([{ name: 'Hermes' }])).toBe('lebt mit Hermes')
    expect(livesWithLabel([{ name: 'Hermes' }, { name: 'Minka' }])).toBe('lebt mit Hermes & Minka')
    expect(livesWithLabel([{ name: 'Unbekannt', name_unbekannt: 1, rasse: 'Kater' }])).toBe('lebt mit Unbekannt')
  })

  test('speciesNoun names the animal for buttons like "Katze anlegen"', () => {
    expect(speciesNoun('hund')).toBe('Hund')
    expect(speciesNoun('katze')).toBe('Katze')
    expect(speciesNoun('anderes')).toBe('Tier')
    expect(speciesNoun(undefined)).toBe('Hund')
  })

  test('animalKind describes non-dogs, using the free text for other animals', () => {
    expect(animalKind({ tierart: 'hund', rasse: 'Labrador' })).toBeNull()
    expect(animalKind({ tierart: 'katze' })).toBe('Katze')
    expect(animalKind({ tierart: 'anderes', rasse: 'Kaninchen' })).toBe('Kaninchen')
    expect(animalKind({ tierart: 'anderes', rasse: null })).toBe('Anderes Tier')
  })

  test('genitive uses an apostrophe after s-sounds', () => {
    expect(genitive('Aiko')).toBe('Aikos')
    expect(genitive('Hermes')).toBe('Hermes’')
  })

  test('shortName strips kennel suffix', () => {
    expect(shortName('Ida vom Sonnenhang')).toBe('Ida')
    expect(shortName('Luna von der Aare')).toBe('Luna')
    expect(shortName('Rex')).toBe('Rex')
  })
})
