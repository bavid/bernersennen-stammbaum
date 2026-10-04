import { describe, expect, test } from 'vitest'
import { THEME, getTheme } from './index.js'

// B+ Familienalbum (04.10.): ein Auftritt für alle - der Berner-Auftritt ist entfernt.
describe('themes', () => {
  test('there is one theme; every id (also the old berner) gives the standard theme', () => {
    expect(THEME.id).toBe('standard')
    expect(getTheme('berner')).toBe(THEME)
    expect(getTheme('pink')).toBe(THEME)
    expect(getTheme(undefined)).toBe(THEME)
    expect(THEME.appName).toBe('Familie auf Pfoten')
  })

  test('no word or text is empty', () => {
    for (const [key, value] of Object.entries(THEME.words)) expect(value, key).toMatch(/\S/)
    for (const [key, value] of Object.entries(THEME.texts)) expect(String(value), key).toMatch(/\S/)
  })

  test('group and role words: Familie, Familienleitung - the rest of the roles are shared words', () => {
    const { words } = THEME
    expect(words.newsTitle).toBe('Neu in der Familie')
    expect(words.roleLeitung).toBe('Familienleitung')
    expect([words.roleGast, words.roleMitglied, words.roleStellvertretung]).toEqual(['Gast', 'Mitglied', 'Stellvertretung'])
    expect(words.groupNeverPublic).toBe('Eine Familie ist nie öffentlich.')
    expect(words.groupSettings).toBe('Familie verwalten')
    expect(words.wholeGroup).toBe('die ganze Familie')
  })

  // Phase U: "Stammbaum" und "Würfe" klingen nach Zucht - hier "Familienbande", "Nachwuchs" und "Verpaarung".
  test('tree and litters words: Familienbande, Nachwuchs, Verpaarung; animals are Tiere', () => {
    const { words, texts } = THEME
    expect([words.treeLabel, words.littersLabel, words.mating]).toEqual(['Familienbande', 'Nachwuchs', 'Verpaarung'])
    expect([words.animal, words.animals]).toEqual(['Tier', 'Tiere'])
    expect(words.toTree).toBe('Zu den Tieren')
    expect(texts.loginDemoHint).toBe('Ohne Anmeldung, schreibgeschützt – mit Beispiel-Tieren, Familien und Erinnerungen.')
  })

  // Phase W, Schritt 2 (Richtung „Familienalbum“): Chronik-Einträge heißen „Erinnerung“, Kommentare „Grüße“.
  test('entry and greeting nouns (Phase W, Schritt 2)', () => {
    const { words } = THEME
    expect([words.entry, words.entries, words.entriesDat, words.newEntry]).toEqual(['Erinnerung', 'Erinnerungen', 'Erinnerungen', 'Neue Erinnerung'])
    expect([words.tellAction, words.tellActionShort]).toEqual(['Erinnerung festhalten', 'Festhalten'])
    expect([words.greeting, words.greetings, words.greetingAction, words.greetingsEmpty]).toEqual(['Gruß', 'Grüße', 'Gruß schreiben', 'Noch keine Grüße'])
  })

  test('no word or text uses breeding vocabulary', () => {
    const { words, texts } = THEME
    const all = [...Object.values(words), ...Object.values(texts).flat(2)]
    for (const value of all) expect(value).not.toMatch(/Stammbaum|Würfe|Wurf|Deckakt|Zucht|züchte|Welpe|Rudel|Hunde\b/)
  })

  test('the theme defines a Mark component', () => {
    expect(typeof THEME.Mark).toBe('function')
  })
})
