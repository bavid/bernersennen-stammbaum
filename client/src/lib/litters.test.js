import { describe, expect, test } from 'vitest'
import {
  addMatingPath,
  ageBucket,
  buildLitters,
  canAddMatingFor,
  hasSiblingLitters,
  latestEntries,
  nextLitterBirthday,
  photosByAge
} from './litters.js'

const dog = (id, name, extra = {}) => ({
  id,
  name,
  name_unbekannt: 0,
  geschlecht: 'ruede',
  geburtsdatum: null,
  mother_dog_id: null,
  father_dog_id: null,
  mother_freitext: null,
  father_freitext: null,
  ...extra
})

const pack = [
  dog(1, 'Emma', { geschlecht: 'huendin', geburtsdatum: '2020-04-09' }),
  dog(2, 'Dante', { geburtsdatum: '2017-06-18' }),
  dog(3, 'Hermes', { mother_dog_id: 1, father_freitext: 'Oskar vom Thunersee', geburtsdatum: '2023-02-14' }),
  dog(4, 'Ida', { geschlecht: 'huendin', mother_dog_id: 1, father_freitext: 'Oskar vom Thunersee', geburtsdatum: '2023-02-14' }),
  dog(5, 'Wilma', { geschlecht: 'huendin', mother_dog_id: 1, father_dog_id: 2, geburtsdatum: '2025-05-01' }),
  dog(6, 'Luna', { geschlecht: 'huendin', mother_freitext: 'Anka', geburtsdatum: '2016-09-02' })
]

describe('buildLitters', () => {
  test('siblings with the same parents and birthday form a litter, newest first; founders are no litter', () => {
    const { litters } = buildLitters(pack, [], '2026-09-27')
    expect(litters.map((l) => l.puppies.map((p) => p.name))).toEqual([['Wilma'], ['Hermes', 'Ida'], ['Luna']])
    const [wilma, hermes] = litters
    expect(hermes.birthDate).toBe('2023-02-14')
    expect(hermes.mother).toEqual({ id: 1, name: 'Emma', dog: pack[0] })
    expect(hermes.father).toEqual({ id: null, name: 'Oskar vom Thunersee', dog: null })
    expect(wilma.father.dog.name).toBe('Dante')
  })

  test('a mating is linked to the litter born about nine weeks later', () => {
    const events = [{ id: 7, mutter_dog_id: 1, vater_freitext: 'Oskar vom Thunersee', datum: '2022-12-13' }]
    const { litters, planned, history } = buildLitters(pack, events, '2026-09-27')
    expect(litters.find((l) => l.birthDate === '2023-02-14').breeding.id).toBe(7)
    expect(planned).toEqual([])
    expect(history).toEqual([])
  })

  test('a recent or planned mating without puppies yet shows a countdown, older ones stay in the history', () => {
    const events = [
      { id: 8, mutter_dog_id: 4, vater_freitext: 'Arco', datum: '2026-09-01' },
      { id: 9, mutter_dog_id: 4, vater_freitext: 'Arco', datum: '2024-01-10' }
    ]
    const { planned, history } = buildLitters(pack, events, '2026-09-27')
    expect(planned).toEqual([{ event: events[0], expectedBirth: '2026-11-03', daysUntil: 37 }])
    expect(history.map((e) => e.id)).toEqual([9])
  })
})

describe('ageBucket', () => {
  test('groups dates into age stages', () => {
    expect(ageBucket('2023-02-14', '2023-04-15').label).toBe('Als Welpen')
    expect(ageBucket('2023-02-14', '2023-08-20').label).toBe('Mit einem halben Jahr')
    expect(ageBucket('2023-02-14', '2024-03-03').label).toBe('Mit einem Jahr')
    expect(ageBucket('2023-02-14', '2025-04-01').label).toBe('Mit 2 Jahren')
    expect(ageBucket('2023-02-14', '2022-12-24')).toBeNull()
  })
})

describe('photosByAge', () => {
  const litter = { birthDate: '2023-02-14', puppies: [pack[2], pack[3]] }
  const entry = (id, dogId, datum, fotos = ['/uploads/x.jpg']) => ({ id, dog_id: dogId, datum, titel: `E${id}`, foto_urls: fotos })

  test('shows stages where at least two siblings have a photo, first photo per sibling', () => {
    const entries = [
      entry(1, 3, '2023-04-15', ['/uploads/hermes-see.jpg']),
      entry(2, 4, '2023-04-22', ['/uploads/ida-garten.jpg']),
      entry(3, 3, '2023-05-01', ['/uploads/hermes-spaeter.jpg']),
      entry(4, 3, '2024-03-03'),
      entry(5, 4, '2024-05-20', []),
      entry(6, 99, '2023-04-20')
    ]
    const stages = photosByAge(litter, entries)
    expect(stages.map((s) => s.label)).toEqual(['Als Welpen'])
    expect(stages[0].photos.map((p) => [p.dog.name, p.url])).toEqual([
      ['Hermes', '/uploads/hermes-see.jpg'],
      ['Ida', '/uploads/ida-garten.jpg']
    ])
  })

  test('without a birth date there is no comparison', () => {
    expect(photosByAge({ birthDate: null, puppies: [] }, [])).toEqual([])
  })
})

describe('nextLitterBirthday', () => {
  test('counts down to the next birthday of the litter', () => {
    expect(nextLitterBirthday('2023-02-14', '2026-02-10')).toEqual({ date: '2026-02-14', age: 3, daysUntil: 4 })
    expect(nextLitterBirthday('2023-02-14', '2026-02-14')).toEqual({ date: '2026-02-14', age: 3, daysUntil: 0 })
    expect(nextLitterBirthday('2023-02-14', '2026-02-15')).toEqual({ date: '2027-02-14', age: 4, daysUntil: 364 })
    expect(nextLitterBirthday(null, '2026-02-15')).toBeNull()
  })
})

describe('latestEntries', () => {
  test('the most recently written entry per animal', () => {
    const latest = latestEntries([
      { id: 1, dog_id: 3, created_at: '2026-09-01 10:00:00' },
      { id: 2, dog_id: 3, created_at: '2026-09-20 10:00:00' },
      { id: 3, dog_id: 4, created_at: '2026-01-01 10:00:00' }
    ])
    expect(latest.get(3).id).toBe(2)
    expect(latest.get(4).id).toBe(3)
  })
})

// Familienbande 2: ohne Hinweis auf der Familienbande führt die Seite einer erwachsenen Hündin zur Verpaarung.
describe('canAddMatingFor', () => {
  const today = '2026-10-03'
  const nele = { id: 1, geschlecht: 'huendin', tierart: 'hund', geburtsdatum: '2019-03-10', bei_uns_bis: null }

  test('eine erwachsene Hündin, die noch bei euch lebt', () => {
    expect(canAddMatingFor(nele, today)).toBe(true)
    // ohne tierart (alte Datensätze) gilt "Hund"; ohne Geburtstag lässt sich nichts ausschließen
    expect(canAddMatingFor({ ...nele, tierart: undefined, geburtsdatum: null }, today)).toBe(true)
  })

  test('nicht für Junge (unter einem Jahr), Rüden, andere Tierarten oder Tiere, die gegangen sind', () => {
    expect(canAddMatingFor({ ...nele, geburtsdatum: '2025-11-01' }, today)).toBe(false)
    expect(canAddMatingFor({ ...nele, geburtsdatum: '2025-10-03' }, today)).toBe(true)
    expect(canAddMatingFor({ ...nele, geschlecht: 'ruede' }, today)).toBe(false)
    expect(canAddMatingFor({ ...nele, tierart: 'katze' }, today)).toBe(false)
    expect(canAddMatingFor({ ...nele, bei_uns_bis: '2024-01-01' }, today)).toBe(false)
    expect(canAddMatingFor(null, today)).toBe(false)
  })
})

describe('hasSiblingLitters und addMatingPath (Familienbande 2)', () => {
  test('Geschwister gibt es ab zwei Tieren mit gleichen Eltern und gleichem Geburtstag - auch mit Eltern nur als Freitext', () => {
    const puppy = (id) => dog(id, `Welpe ${id}`, { mother_freitext: 'Lotte', geburtsdatum: '2021-04-18' })
    expect(hasSiblingLitters([puppy(1), puppy(2)], [])).toBe(true)
    expect(hasSiblingLitters([puppy(1)], [])).toBe(false)
    expect(hasSiblingLitters(null, null)).toBe(false)
  })

  test('der Weg zum offenen Formular, auf Wunsch mit vorgewählter Hündin', () => {
    expect(addMatingPath()).toBe('/wuerfe?verpaarung=neu')
    expect(addMatingPath(29)).toBe('/wuerfe?verpaarung=neu&mutter=29')
  })
})
