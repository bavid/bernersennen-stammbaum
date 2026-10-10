import { afterEach, describe, expect, test } from 'vitest'
import { LINE_MAX, TITLE_MAX, cardFileName, firstSentence, grussKarteModel, isSameOriginPhoto, truncate } from './grusskarte.js'
import { setLang } from './i18n/index.js'

const ORIGIN = 'https://album.example'
const entry = (overrides = {}) => ({
  titel: 'Erster Tag am See',
  text: 'Benno ist sofort ins Wasser gesprungen. Danach hat er geschlafen.',
  datum: '2024-05-01',
  foto_urls: ['/uploads/see.jpg'],
  privat: 0,
  ...overrides
})

afterEach(() => setLang('de'))

describe('grusskarte – Texte', () => {
  test('truncate kürzt an einer Wortgrenze mit „…“', () => {
    const long = 'Wilma und Flocke rennen über die große Wiese hinter dem Haus bis zum Bach'
    const cut = truncate(long, 30)
    expect(cut.length).toBeLessThanOrEqual(30)
    expect(cut.endsWith('…')).toBe(true)
    expect(cut).toBe('Wilma und Flocke rennen über…')
    expect(truncate('kurz', 30)).toBe('kurz')
    expect(truncate(null, 10)).toBe('')
  })

  test('firstSentence nimmt den ersten Satz oder die erste Zeile', () => {
    expect(firstSentence('Hallo Welt. Noch was.')).toBe('Hallo Welt.')
    expect(firstSentence('Ohne Punkt\nzweite Zeile')).toBe('Ohne Punkt')
    expect(firstSentence('')).toBe('')
  })

  test('cardFileName ohne Umlaute und Sonderzeichen', () => {
    expect(cardFileName('Lotte Müller-Ä', '2024-05-01')).toBe('gruesse-lotte-mueller-ae-2024-05-01.png')
    expect(cardFileName('', '')).toBe('gruesse.png')
  })
})

describe('grusskarte – Foto vom eigenen Ursprung', () => {
  test('relative /uploads-Pfade und gleiche Herkunft ja, fremde Hosts nein', () => {
    expect(isSameOriginPhoto('/uploads/a.jpg', ORIGIN)).toBe(true)
    expect(isSameOriginPhoto(`${ORIGIN}/uploads/a.jpg`, ORIGIN)).toBe(true)
    expect(isSameOriginPhoto('https://cdn.fremd.example/a.jpg', ORIGIN)).toBe(false)
    expect(isSameOriginPhoto('//fremd.example/a.jpg', ORIGIN)).toBe(false)
    expect(isSameOriginPhoto('', ORIGIN)).toBe(false)
  })
})

describe('grusskarte – Modell', () => {
  test('Titel, erster Satz, Datum, Foto und QR-Adresse der Startseite', () => {
    const model = grussKarteModel({ entry: entry(), dogName: 'Benno', publicUrl: 'https://chronik.example/', origin: ORIGIN })
    expect(model).toMatchObject({
      dogName: 'Benno',
      title: 'Erster Tag am See',
      line: 'Benno ist sofort ins Wasser gesprungen.',
      date: '1. Mai 2024',
      photoUrl: '/uploads/see.jpg',
      qrUrl: 'https://chronik.example/',
      host: 'chronik.example',
      isPrivate: false,
      fileName: 'gruesse-benno-2024-05-01.png'
    })
  })

  test('ohne PUBLIC_URL zeigt der QR-Code auf den eigenen Ursprung', () => {
    const model = grussKarteModel({ entry: entry(), dogName: 'Benno', publicUrl: null, origin: ORIGIN })
    expect(model.qrUrl).toBe(`${ORIGIN}/`)
  })

  test('lange Texte werden gekürzt, fremde Fotos übersprungen, privat gemerkt', () => {
    const model = grussKarteModel({
      entry: entry({ titel: 'T'.repeat(200), text: `${'Wort '.repeat(80)}.`, foto_urls: ['https://fremd.example/x.jpg'], privat: 1 }),
      dogName: 'Pepper',
      origin: ORIGIN
    })
    expect(model.title.length).toBeLessThanOrEqual(TITLE_MAX)
    expect(model.line.length).toBeLessThanOrEqual(LINE_MAX)
    expect(model.photoUrl).toBeNull()
    expect(model.isPrivate).toBe(true)
  })

  test('Datum in der gewählten Sprache', async () => {
    await setLang('en')
    const model = grussKarteModel({ entry: entry(), dogName: 'Benno', origin: ORIGIN })
    expect(model.date).toBe('1 May 2024')
  })
})
