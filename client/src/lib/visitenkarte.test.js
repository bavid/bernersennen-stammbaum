import { describe, expect, test } from 'vitest'
import {
  CARDS_PER_SHEET,
  DARK_TEXT,
  GRID_MM,
  LIGHT_TEXT,
  MAX_SHEETS,
  PALETTE,
  VORLAGEN,
  accentOnWhite,
  availableContacts,
  buildSheets,
  cardModel,
  clampSheets,
  codeGroups,
  contactLines,
  cropMarks,
  designPayload,
  effectiveVorlage,
  isSameDesign,
  mirrorRows,
  musterCodes,
  normalizeHex,
  textColorOn,
  voucherTarget,
  websiteLabel
} from './visitenkarte.js'
import { contrastRatio } from './contrast.js'

const DESIGN = Object.freeze({
  vorlage: 'foto',
  farbe: '#1f5f8b',
  kurztext: 'Welpenkurse und Hundetraining',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: false,
  mitGutschein: true
})

const PROFILE = Object.freeze({
  slug: 'hundeschule-pfotenglueck',
  name: 'Hundeschule Pfotenglück',
  logoUrl: '/partner-media/logo.png',
  banner: [{ position: 1, fotoUrl: '/uploads/banner.jpg', alt: 'Welpen auf der Wiese' }],
  ansprechperson: 'Anna Berg',
  website: 'https://www.example.org/pfotenglueck/',
  kontaktTelefon: '040 123456',
  kontaktEmail: 'hallo@example.org'
})

describe('Vorlagen und Palette', () => {
  test('drei Vorlagen, sechs Farben der Auftritte als #rrggbb', () => {
    expect(VORLAGEN.map((vorlage) => vorlage.id)).toEqual(['klassisch', 'foto', 'schlicht'])
    expect(VORLAGEN.every((vorlage) => vorlage.label && vorlage.hint)).toBe(true)
    expect(PALETTE).toHaveLength(6)
    expect(PALETTE.every((entry) => /^#[0-9a-f]{6}$/.test(entry.farbe) && entry.label)).toBe(true)
  })

  test('Foto ohne Bannerfoto wird Klassisch, sonst bleibt die Vorlage', () => {
    expect(effectiveVorlage('foto', '/uploads/banner.jpg')).toBe('foto')
    expect(effectiveVorlage('foto', null)).toBe('klassisch')
    expect(effectiveVorlage('schlicht', null)).toBe('schlicht')
    expect(effectiveVorlage('unbekannt', null)).toBe('klassisch')
  })
})

describe('Farbe und Kontrast', () => {
  test('normalizeHex nimmt #rrggbb oder rrggbb, sonst null', () => {
    expect(normalizeHex('#1F5F8B')).toBe('#1f5f8b')
    expect(normalizeHex(' 1f5f8b ')).toBe('#1f5f8b')
    for (const value of ['#1f5f8', '#12345g', 'rot', '', null, undefined, '#1f5f8b0']) expect(normalizeHex(value)).toBe(null)
  })

  test('helle Schrift auf dunklen Farben, dunkle auf hellen - immer mit mindestens 4,5 : 1', () => {
    expect(textColorOn('#1f5f8b')).toMatchObject({ color: LIGHT_TEXT, ok: true })
    expect(textColorOn('#d49a5b')).toMatchObject({ color: DARK_TEXT, ok: true })
    expect(textColorOn('#ffe066')).toMatchObject({ color: DARK_TEXT, ok: true })
    for (const { farbe } of PALETTE) {
      const { color, ratio, ok } = textColorOn(farbe)
      expect(ok).toBe(true)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(farbe, color)).toBeCloseTo(ratio, 5)
    }
  })

  test('mittlere Töne: die bessere Schriftfarbe, aber ok false', () => {
    const result = textColorOn('#7a7a7a')
    expect(result.ok).toBe(false)
    expect(result.ratio).toBeLessThan(4.5)
    expect(result.ratio).toBe(Math.max(contrastRatio('#7a7a7a', LIGHT_TEXT), contrastRatio('#7a7a7a', DARK_TEXT)))
  })

  test('accentOnWhite: Farbe als Schrift auf Papier nur mit genug Kontrast, sonst Tinte', () => {
    expect(accentOnWhite('#1f5f8b')).toBe('#1f5f8b')
    expect(accentOnWhite('#d49a5b')).toBe(DARK_TEXT)
  })
})

describe('Inhalt der Karte', () => {
  test('websiteLabel kürzt Schema, www. und den Schrägstrich am Ende', () => {
    expect(websiteLabel('https://www.example.org/pfotenglueck/')).toBe('example.org/pfotenglueck')
    expect(websiteLabel('http://example.org')).toBe('example.org')
  })

  test('Kontaktzeile: nur, was im Profil steht und eingeschaltet ist', () => {
    expect(availableContacts(PROFILE)).toEqual(['website', 'telefon', 'email'])
    expect(availableContacts({ ...PROFILE, website: '', kontaktEmail: null })).toEqual(['telefon'])
    expect(contactLines(PROFILE, DESIGN)).toEqual([
      { key: 'website', icon: 'globe', text: 'example.org/pfotenglueck' },
      { key: 'telefon', icon: 'phone', text: '040 123456' }
    ])
    expect(contactLines({ ...PROFILE, kontaktTelefon: '' }, { ...DESIGN, zeigeEmail: true })).toEqual([
      { key: 'website', icon: 'globe', text: 'example.org/pfotenglueck' },
      { key: 'email', icon: 'mail', text: 'hallo@example.org' }
    ])
  })

  test('cardModel: Portal-QR auf /p/:slug der öffentlichen Adresse, kurze Adresse als Text', () => {
    const card = cardModel({ profile: PROFILE, design: DESIGN, publicUrl: 'https://beispiel-chronik.de/', origin: 'http://localhost:5173' })
    expect(card).toMatchObject({
      vorlage: 'foto',
      farbe: '#1f5f8b',
      textOn: LIGHT_TEXT,
      name: 'Hundeschule Pfotenglück',
      logoUrl: '/partner-media/logo.png',
      fotoUrl: '/uploads/banner.jpg',
      kurztext: 'Welpenkurse und Hundetraining',
      ansprechperson: 'Anna Berg',
      baseUrl: 'https://beispiel-chronik.de',
      host: 'beispiel-chronik.de',
      portalUrl: 'https://beispiel-chronik.de/p/hundeschule-pfotenglueck',
      portalLabel: 'beispiel-chronik.de/p/hundeschule-pfotenglueck',
      portalPfad: '/p/hundeschule-pfotenglueck'
    })
    expect(card.kontakte.map((kontakt) => kontakt.key)).toEqual(['website', 'telefon'])
  })

  test('cardModel: Demo mit ?demo=1, ohne Ansprechperson-Schalter kein Name, ohne Banner Klassisch', () => {
    const card = cardModel({
      profile: { ...PROFILE, banner: [] },
      design: { ...DESIGN, zeigeAnsprechperson: false },
      publicUrl: null,
      origin: 'https://beispiel-chronik.de',
      demo: true
    })
    expect(card.portalUrl).toBe('https://beispiel-chronik.de/p/hundeschule-pfotenglueck?demo=1')
    expect(card.portalLabel).toBe('beispiel-chronik.de/p/hundeschule-pfotenglueck')
    expect(card.ansprechperson).toBe(null)
    expect(card.vorlage).toBe('klassisch')
    expect(card.fotoUrl).toBe(null)
  })

  test('Gutschein-QR: der Code steht nur hinter der Raute von /v', () => {
    const url = voucherTarget('https://beispiel-chronik.de', 'ABCD-EFGH-JKLM')
    expect(url).toBe('https://beispiel-chronik.de/v#ABCD-EFGH-JKLM')
    expect(new URL(url).pathname).toBe('/v')
    expect(new URL(url).search).toBe('')
    expect(url.split('#')[0].includes('ABCD')).toBe(false)
  })

  test('codeGroups: lesbare Vierergruppen; Muster-Codes beginnen mit DEMO- und sind eindeutig', () => {
    expect(codeGroups('ABCD-EFGH-JKLM')).toEqual(['ABCD', 'EFGH', 'JKLM'])
    const muster = musterCodes(12)
    expect(muster).toHaveLength(12)
    expect(new Set(muster).size).toBe(12)
    expect(muster.every((code) => code.startsWith('DEMO-'))).toBe(true)
    expect(codeGroups(muster[0])).toHaveLength(3)
  })
})

describe('Druckbogen', () => {
  test('10 Karten je Bogen (2 × 5), 1 bis 5 Bögen', () => {
    expect(CARDS_PER_SHEET).toBe(10)
    expect(MAX_SHEETS).toBe(5)
    expect([0, 1, 3, 5, 9, Number.NaN, '2'].map(clampSheets)).toEqual([1, 1, 3, 5, 5, 1, 2])
  })

  test('mirrorRows spiegelt die Spalten jeder Reihe', () => {
    expect(mirrorRows([0, 1, 2, 3, 4, 5], 2)).toEqual([1, 0, 3, 2, 5, 4])
    expect(mirrorRows(['a', 'b', 'c'], 3)).toEqual(['c', 'b', 'a'])
  })

  test('buildSheets: Vorderseiten in Leserichtung, Rückseiten gespiegelt mit dem Code ihrer Karte', () => {
    const codes = Array.from({ length: 13 }, (_, index) => `CODE-${String(index).padStart(4, '0')}-AAAA`)
    const sheets = buildSheets({ sheetCount: 2, codes })
    expect(sheets).toHaveLength(2)
    expect(sheets[0].number).toBe(1)
    expect(sheets[0].fronts).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(sheets[0].backs.map((back) => back.index)).toEqual([1, 0, 3, 2, 5, 4, 7, 6, 9, 8])
    expect(sheets[0].backs[0]).toEqual({ index: 1, code: codes[1] })
    expect(sheets[1].fronts).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    // Mehr Karten als Codes: die übrigen bekommen die Rückseite ohne Gutschein.
    expect(sheets[1].backs.slice(0, 4)).toEqual([
      { index: 11, code: codes[11] },
      { index: 10, code: codes[10] },
      { index: 13, code: null },
      { index: 12, code: codes[12] }
    ])
    expect(buildSheets({ sheetCount: 1 })[0].backs.every((back) => back.code === null)).toBe(true)
  })

  test('cropMarks: Schnittmarken außerhalb des Rasters an jeder Kartenkante, Raster mittig auf A4', () => {
    expect(GRID_MM).toEqual({ left: 20, top: 11, width: 170, height: 275 })
    const marks = cropMarks()
    const vertical = marks.filter((mark) => mark.x1 === mark.x2)
    const horizontal = marks.filter((mark) => mark.y1 === mark.y2)
    expect([...new Set(vertical.map((mark) => mark.x1))]).toEqual([20, 105, 190])
    expect([...new Set(horizontal.map((mark) => mark.y1))]).toEqual([11, 66, 121, 176, 231, 286])
    expect(vertical).toHaveLength(6)
    expect(horizontal).toHaveLength(12)
    for (const mark of vertical) expect(mark.y2 <= GRID_MM.top || mark.y1 >= GRID_MM.top + GRID_MM.height).toBe(true)
    for (const mark of horizontal) expect(mark.x2 <= GRID_MM.left || mark.x1 >= GRID_MM.left + GRID_MM.width).toBe(true)
    for (const mark of marks) expect(Math.min(mark.x1, mark.y1)).toBeGreaterThanOrEqual(3)
  })
})

describe('Speichern', () => {
  test('designPayload schickt genau die Felder der Gestaltung, isSameDesign vergleicht sie', () => {
    const payload = designPayload({ ...DESIGN, extra: 'weg' })
    expect(payload).toEqual(DESIGN)
    expect(isSameDesign(DESIGN, { ...DESIGN })).toBe(true)
    expect(isSameDesign(DESIGN, { ...DESIGN, farbe: '#000000' })).toBe(false)
    expect(isSameDesign(DESIGN, null)).toBe(false)
  })
})
