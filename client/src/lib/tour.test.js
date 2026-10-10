// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest'
import { api } from '../api.js'
import en from './i18n/en/tour.js'
import { setLang, t } from './i18n/index.js'
import {
  TOUR_SCOPE,
  buildTour,
  chaptersFor,
  markPrompted,
  nextChapter,
  overlayPath,
  placePopover,
  saveTourStatus,
  shouldPrompt,
  statusAfterTour
} from './tour.js'
import { CHAPTERS_BY_ART, CHAPTER_TITLES } from './tourSteps.js'

const HOME = { id: 7, art: 'zuhause', home: { id: 7, art: 'zuhause' }, role: 'leitung', rundgang: 'neu' }
const PARTNER = { id: 9, art: 'partner', isDemo: true, rundgang: 'neu' }
const HOME_DEMO = { id: 2, art: 'zuhause', home: { id: 2, art: 'zuhause' }, isDemo: true, rundgang: 'neu' }

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.sessionStorage.clear()
  setLang('de')
})

describe('Rundgang: wer wird gefragt', () => {
  test('echter Haushalt bei „neu“, nicht bei „fertig“/„aus“, nie zu Besuch oder in der Admin-Ansicht', () => {
    expect(shouldPrompt(HOME)).toBe(true)
    expect(shouldPrompt({ ...HOME, rundgang: 'fertig' })).toBe(false)
    expect(shouldPrompt({ ...HOME, rundgang: 'aus' })).toBe(false)
    expect(shouldPrompt({ ...HOME, adminView: true })).toBe(false)
    expect(shouldPrompt({ ...HOME, zuBesuch: true })).toBe(false)
  })

  test('echter Partner wird nicht von selbst gefragt, die Partner-Demo einmal je Sitzung', () => {
    expect(shouldPrompt({ ...PARTNER, isDemo: false })).toBe(false)
    expect(shouldPrompt(PARTNER)).toBe(true)
    markPrompted(PARTNER)
    expect(shouldPrompt(PARTNER)).toBe(false)
  })

  test('Demo „Nicht mehr zeigen“ gilt auf dem Gerät, ohne Server', async () => {
    const spy = vi.spyOn(api, 'setRundgang')
    await saveTourStatus(PARTNER, 'aus')
    window.sessionStorage.clear()
    expect(shouldPrompt(PARTNER)).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  test('je Art: Zuhause-Demo geschlossen oder „aus“ - Partner-Demo fragt trotzdem, und umgekehrt', async () => {
    markPrompted(HOME_DEMO)
    await saveTourStatus(HOME_DEMO, 'aus')
    expect(shouldPrompt(HOME_DEMO)).toBe(false)
    expect(shouldPrompt(PARTNER)).toBe(true)
    markPrompted(PARTNER)
    await saveTourStatus(PARTNER, 'fertig')
    window.sessionStorage.clear()
    expect(shouldPrompt(PARTNER)).toBe(true)
    expect(shouldPrompt(HOME_DEMO)).toBe(false)
  })

  test('echte Bereiche: „Schließen“ im Zuhause hält einen anderen Bereich nicht ab', async () => {
    vi.spyOn(api, 'setRundgang').mockResolvedValue({})
    await saveTourStatus(HOME, 'fertig')
    const shelter = { id: 11, art: 'tierheim', isDemo: false, rundgang: 'neu' }
    expect(shouldPrompt({ ...HOME, rundgang: 'neu' })).toBe(false)
    expect(shouldPrompt({ ...HOME, id: 8, home: { id: 8, art: 'zuhause' } })).toBe(true)
    expect(shouldPrompt({ ...shelter, isDemo: true })).toBe(true)
  })

  test('echter Haushalt speichert am Server, Fehler bleiben still', async () => {
    const spy = vi.spyOn(api, 'setRundgang').mockRejectedValue(new Error('offline'))
    const next = await saveTourStatus(HOME, 'fertig')
    expect(spy).toHaveBeenCalledWith('fertig')
    expect(next.rundgang).toBe('fertig')
    expect(statusAfterTour({ ...HOME, rundgang: 'aus' })).toBe('aus')
    expect(statusAfterTour(HOME)).toBe('fertig')
  })
})

describe('Rundgang: Kapitel', () => {
  test('Haushalt: Wichtigstes (≤ 4) → Entdecken → Werkzeuge → Verwaltung, ein Kapitel je Durchgang', () => {
    expect(chaptersFor(HOME).map((chapter) => chapter.key)).toEqual(['wichtig', 'entdecken', 'werkzeuge', 'verwaltung'])
    const first = buildTour(HOME)
    expect(first.map((step) => step.key)).toEqual(['start', 'composer', 'animals', 'families'])
    expect(buildTour(HOME, { scope: TOUR_SCOPE.alles })).toEqual(first)
    const lengths = chaptersFor(HOME).map((chapter) => chapter.steps.length)
    expect(lengths[0]).toBeLessThanOrEqual(4)
    expect(lengths[1]).toBeGreaterThanOrEqual(2)
    expect(lengths[1]).toBeLessThanOrEqual(3)
    expect(lengths.slice(2).every((n) => n >= 3 && n <= 4)).toBe(true)
    const admin = buildTour(HOME, { chapterKey: 'verwaltung' })
    expect(admin.some((step) => step.target?.includes('[data-tour="sichtbarkeit"]'))).toBe(true)
    expect(admin.at(-1).key).toBe('einladen')
    expect(buildTour(HOME, { chapterKey: 'entdecken' }).find((step) => step.key === 'revier').optional).toBe(true)
  })

  test('nächstes Kapitel in fester Reihenfolge, gezeigte werden nicht mehr vorgeschlagen', () => {
    const chapters = chaptersFor(HOME)
    expect(nextChapter(chapters, ['wichtig']).key).toBe('entdecken')
    expect(nextChapter(chapters, ['wichtig', 'werkzeuge']).key).toBe('entdecken')
    expect(nextChapter(chapters, ['wichtig', 'entdecken', 'werkzeuge']).key).toBe('verwaltung')
    expect(nextChapter(chapters, chapters.map((chapter) => chapter.key))).toBeNull()
  })

  test('Sprung zu einem Kapitel; klassischer Familien-Login ohne „Familien“', () => {
    expect(buildTour(HOME, { chapterKey: 'werkzeuge' }).map((step) => step.chapter)).toEqual(['werkzeuge', 'werkzeuge', 'werkzeuge', 'werkzeuge'])
    const classic = { id: 3, art: 'rudel', role: 'leitung' }
    expect(buildTour(classic).some((step) => step.key === 'families')).toBe(false)
  })

  test('Partner und Tierheim: Basics → Kundensicht & Entdecken → Werkzeuge → Verwaltung', () => {
    expect(chaptersFor(PARTNER).map((chapter) => chapter.key)).toEqual(['wichtig', 'kundensicht', 'werkzeuge', 'verwaltung'])
    expect(buildTour(PARTNER).map((step) => step.key)).toEqual(['profil', 'nachrichten', 'leiste'])
    expect(buildTour(PARTNER, { chapterKey: 'werkzeuge' }).map((step) => step.key)).toEqual(['visitenkarten', 'beitraege', 'kalender'])
    expect(buildTour(PARTNER, { chapterKey: 'verwaltung' }).map((step) => step.key)).toEqual(['zugang', 'einladungscodes'])
    const shelter = { id: 4, art: 'tierheim' }
    expect(chaptersFor(shelter).every((chapter) => chapter.steps.length <= 4)).toBe(true)
    expect(buildTour(shelter, { chapterKey: 'werkzeuge' }).map((step) => step.key)).toContain('startpaket')
  })

  test('jeder Text hat eine englische Fassung', () => {
    const texts = Object.values(CHAPTERS_BY_ART)
      .flat()
      .flatMap((chapter) => chapter.steps)
      .flatMap((step) => [step.title, step.text, step.ask?.title, step.ask?.text, step.ask?.action].filter(Boolean))
    const hints = Object.values(CHAPTERS_BY_ART).flat().map((chapter) => chapter.hint).filter(Boolean)
    const card = ['Wie geht’s weiter?', 'Was möchtet ihr als Nächstes sehen?', 'Ihr habt alles gesehen – schön, dass ihr dabei seid.', 'Fertig']
    for (const text of [...texts, ...hints, ...card, ...Object.values(CHAPTER_TITLES)]) {
      setLang('en')
      expect(t(text), text).not.toBe(text)
    }
    expect(Object.values(en).every((value) => value.trim().length > 0)).toBe(true)
  })
})

describe('Rundgang: Lage', () => {
  test('schmal als Blatt - oben, wenn das Ziel unten steht; breit unter dem Ziel', () => {
    const narrow = { width: 390, height: 800 }
    expect(placePopover({ top: 700, height: 40, left: 0, width: 50, bottom: 740 }, narrow)).toEqual({ mode: 'sheet', edge: 'top' })
    expect(placePopover({ top: 100, height: 40, left: 0, width: 50, bottom: 140 }, narrow)).toEqual({ mode: 'sheet', edge: 'bottom' })
    const wide = { width: 1280, height: 800 }
    expect(placePopover({ top: 100, bottom: 140, left: 1200, width: 60, height: 40 }, wide, 200)).toEqual({ mode: 'float', top: 160, left: 924 })
    expect(placePopover(null, wide)).toEqual({ mode: 'center' })
  })

  test('Fläche mit Loch: ohne Ziel nur das Rechteck', () => {
    expect(overlayPath({ width: 100, height: 50 }, null)).toBe('M0 0H100V50H0Z')
    expect(overlayPath({ width: 100, height: 50 }, { x: 10, y: 10, width: 40, height: 20 })).toMatch(/Z$/)
  })
})
