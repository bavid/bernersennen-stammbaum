import { describe, expect, test } from 'vitest'
import {
  changedProfileFields,
  hasShelterLinks,
  portalPath,
  profileErrorField,
  profileForm,
  profileStatusKey,
  profileStatusLabel
} from './partnerProfile.js'

const profile = {
  name: 'Hundeschule Wiesengrund',
  portalTitel: null,
  portalText: 'Kleine Gruppen, viel Geduld und jede Menge Spaß auf der Wiese.',
  farbe: '#2f6b3f',
  website: 'https://wiesengrund.example/',
  spendenUrl: null,
  vermittlungUrl: null,
  kontaktEmail: 'hallo@wiesengrund.example',
  kontaktTelefon: null,
  kontaktFormularUrl: null,
  kontaktformularAktiv: true,
  plz: '10115'
}

describe('profileForm', () => {
  test('macht aus null leere Strings und aus dem Schalter ein Boolean', () => {
    const form = profileForm(profile)
    expect(form.portalTitel).toBe('')
    expect(form.name).toBe('Hundeschule Wiesengrund')
    expect(form.kontaktformularAktiv).toBe(true)
    expect(profileForm({ kontaktformularAktiv: 0 }).kontaktformularAktiv).toBe(false)
  })
})

describe('changedProfileFields', () => {
  test('ohne Änderung: leeres Objekt', () => {
    expect(changedProfileFields(profileForm(profile), profile)).toEqual({})
  })

  test('nur geänderte Felder, getrimmt', () => {
    const form = { ...profileForm(profile), portalTitel: '  Willkommen!  ', kontaktformularAktiv: false }
    expect(changedProfileFields(form, profile)).toEqual({ portalTitel: 'Willkommen!', kontaktformularAktiv: false })
  })

  test('Phase V4b: die Ansprechperson gehört zu den Profilfeldern', () => {
    expect(profileForm(profile).ansprechperson).toBe('')
    const form = { ...profileForm(profile), ansprechperson: ' Anna Berg ' }
    expect(changedProfileFields(form, profile)).toEqual({ ansprechperson: 'Anna Berg' })
    const withPerson = { ...profile, ansprechperson: 'Anna Berg' }
    expect(changedProfileFields({ ...profileForm(withPerson), ansprechperson: '' }, withPerson)).toEqual({ ansprechperson: null })
  })

  test('ein geleertes Feld geht als null (löscht es auf dem Server)', () => {
    const form = { ...profileForm(profile), website: '   ' }
    expect(changedProfileFields(form, profile)).toEqual({ website: null })
  })
})

describe('profileErrorField – Server-Meldung zum Feld', () => {
  test.each([
    ['Der Name ist Pflicht', 'name'],
    ['Der Portal-Titel darf höchstens 120 Zeichen haben', 'portalTitel'],
    ['Der Portal-Text darf nur reinen Text enthalten (kein HTML)', 'portalText'],
    ['Farbe zu hell – Schrift wäre schlecht lesbar', 'farbe'],
    ['Die Farbe muss im Format #rrggbb angegeben werden', 'farbe'],
    ['Website: ungültige Adresse', 'website'],
    ['Spenden-Link: ungültige Adresse', 'spendenUrl'],
    ['Vermittlungs-Link: ungültige Adresse', 'vermittlungUrl'],
    ['Die E-Mail-Adresse ist ungültig', 'kontaktEmail'],
    ['Die Telefonnummer ist ungültig', 'kontaktTelefon'],
    ['Kontaktformular-Link: ungültige Adresse', 'kontaktFormularUrl'],
    ['Die Ansprechperson darf höchstens 80 Zeichen haben', 'ansprechperson'],
    ['Die Ansprechperson darf nur reinen Text enthalten (kein HTML)', 'ansprechperson'],
    ['Diese Postleitzahl kennen wir nicht', 'plz']
  ])('%s -> %s', (message, field) => {
    expect(profileErrorField(message)).toBe(field)
  })

  test('Meldungen ohne Feld (Züchter-Schutz, öffentliches Profil) bleiben beim Banner', () => {
    expect(profileErrorField('Züchter und Zucht-Angebote werden hier nicht aufgenommen.')).toBeNull()
    expect(profileErrorField('Solange euer Profil öffentlich ist, braucht es: Postleitzahl – oder pausiert es zuerst.')).toBeNull()
    expect(profileErrorField(undefined)).toBeNull()
  })
})

describe('Status', () => {
  test('eine Sperre schlägt jeden Status', () => {
    expect(profileStatusKey({ status: 'aktiv', gesperrt: true })).toBe('gesperrt')
    expect(profileStatusLabel({ status: 'aktiv', gesperrt: true })).toBe('Gesperrt')
  })

  test('Beschriftungen: Entwurf, Aktiv (öffentlich), Pausiert', () => {
    expect(profileStatusLabel({ status: 'entwurf', gesperrt: false })).toBe('Entwurf')
    expect(profileStatusLabel({ status: 'aktiv', gesperrt: false })).toBe('Aktiv (öffentlich)')
    expect(profileStatusLabel({ status: 'pausiert', gesperrt: false })).toBe('Pausiert')
  })
})

describe('hasShelterLinks / portalPath', () => {
  test('Spenden- und Vermittlungs-Link nur für Tierheim und Vermittlung', () => {
    expect(hasShelterLinks('tierheim')).toBe(true)
    expect(hasShelterLinks('vermittlung')).toBe(true)
    expect(hasShelterLinks('hundeschule')).toBe(false)
  })

  test('Portal-Adresse mit kodiertem Slug', () => {
    expect(portalPath('hundeschule-wiesengrund')).toBe('/p/hundeschule-wiesengrund')
    expect(portalPath('a/b')).toBe('/p/a%2Fb')
  })
})
