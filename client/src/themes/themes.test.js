import { describe, expect, test } from 'vitest'
import { THEME_IDS, getTheme } from './index.js'

describe('themes', () => {
  test('standard and berner are available, unknown ids fall back to standard', () => {
    expect(THEME_IDS).toEqual(['standard', 'berner'])
    expect(getTheme('berner').id).toBe('berner')
    expect(getTheme('pink').id).toBe('standard')
    expect(getTheme(undefined).id).toBe('standard')
  })

  test('both themes define the same words and texts, none empty', () => {
    const standard = getTheme('standard')
    const berner = getTheme('berner')
    expect(Object.keys(berner.words).sort()).toEqual(Object.keys(standard.words).sort())
    expect(Object.keys(berner.texts).sort()).toEqual(Object.keys(standard.texts).sort())
    for (const theme of [standard, berner]) {
      for (const [key, value] of Object.entries(theme.words)) expect(value, key).toMatch(/\S/)
    }
  })

  test('berner keeps the wording families know today', () => {
    const { words, appName } = getTheme('berner')
    expect(appName).toBe('Familienchronik')
    expect(words.newsTitle).toBe('Neu im Rudel')
    expect(words.inGroup).toBe('im Rudel')
    expect(getTheme('standard').words.newsTitle).toBe('Neu in der Familie')
  })

  test('role words (Phase R): berner says Rudelführer, standard Familienleitung, the rest is shared', () => {
    expect(getTheme('berner').words.roleLeitung).toBe('Rudelführer')
    expect(getTheme('standard').words.roleLeitung).toBe('Familienleitung')
    for (const id of THEME_IDS) {
      const { words } = getTheme(id)
      expect([words.roleGast, words.roleMitglied, words.roleStellvertretung]).toEqual(['Gast', 'Mitglied', 'Stellvertretung'])
    }
    expect(getTheme('berner').words.dissolveGroup).toBe('Rudel auflösen')
    expect(getTheme('standard').words.groupNeverPublic).toBe('Eine Familie ist nie öffentlich.')
  })

  // Phase U: "Stammbaum" und "Würfe" klingen nach Zucht - der Standard-Auftritt sagt "Familienbande" und "Nachwuchs".
  test('tree and litters words: standard Familienbande/Nachwuchs/Verpaarung, berner keeps Stammbaum/Würfe/Deckakt', () => {
    const standard = getTheme('standard')
    const berner = getTheme('berner')
    expect([standard.words.treeLabel, standard.words.littersLabel, standard.words.mating]).toEqual(['Familienbande', 'Nachwuchs', 'Verpaarung'])
    expect([berner.words.treeLabel, berner.words.littersLabel, berner.words.mating]).toEqual(['Stammbaum', 'Würfe', 'Deckakt'])
    expect(berner.words.breedingBook).toBe('Zuchtbuch')
    expect(standard.littersInNav).toBe(false)
    expect(berner.littersInNav).toBe(true)
  })

  // Phase V3: der Standard-Auftritt zeigt auf der Familienbande zuerst Familien (Stammbaum erst nach einer Verpaarung),
  // der Berner-Auftritt bleibt beim Stammbaum. Der Demo-Hinweis der Anmeldung folgt dem.
  test('families first: standard shows families, berner keeps the tree; demo hint per theme', () => {
    expect(getTheme('standard').familiesView).toBe(true)
    expect(getTheme('berner').familiesView).toBe(false)
    expect(getTheme('standard').texts.loginDemoHint).toBe('Ohne Anmeldung, schreibgeschützt – mit Beispiel-Tieren, Familien und Erinnerungen.')
    expect(getTheme('berner').texts.loginDemoHint).toBe('Ohne Anmeldung, schreibgeschützt – mit Beispiel-Tieren über mehrere Generationen.')
  })

  // Phase W, Schritt 2 (Betreiber, Richtung „Familienalbum“): Chronik-Einträge heißen „Erinnerung“, Kommentare „Grüße“ -
  // in beiden Auftritten gleich, an einer Stelle; dazu „Familie verwalten“ und „Zu den Tieren“.
  test('entry and greeting nouns (Phase W, Schritt 2) are the same in both themes', () => {
    for (const id of THEME_IDS) {
      const { words } = getTheme(id)
      expect([words.entry, words.entries, words.entriesDat, words.newEntry]).toEqual(['Erinnerung', 'Erinnerungen', 'Erinnerungen', 'Neue Erinnerung'])
      expect([words.tellAction, words.tellActionShort]).toEqual(['Erinnerung festhalten', 'Festhalten'])
      expect([words.greeting, words.greetings, words.greetingAction, words.greetingsEmpty]).toEqual(['Gruß', 'Grüße', 'Gruß schreiben', 'Noch keine Grüße'])
    }
    expect(getTheme('standard').words.groupSettings).toBe('Familie verwalten')
    expect(getTheme('berner').words.groupSettings).toBe('Rudel verwalten')
    expect(getTheme('standard').words.toTree).toBe('Zu den Tieren')
    expect(getTheme('berner').words.toTree).toBe('Zum Stammbaum')
    expect(getTheme('standard').words.wholeGroup).toBe('die ganze Familie')
    expect(getTheme('berner').words.wholeGroup).toBe('das ganze Rudel')
  })

  test('no word or text of the standard theme uses breeding vocabulary', () => {
    const { words, texts } = getTheme('standard')
    const all = [...Object.values(words), ...Object.values(texts).flat(2)]
    for (const value of all) expect(value).not.toMatch(/Stammbaum|Würfe|Wurf|Deckakt|Zucht|züchte|Welpe/)
  })

  test('each theme defines a Mark component', () => {
    for (const id of THEME_IDS) expect(typeof getTheme(id).Mark).toBe('function')
  })
})
