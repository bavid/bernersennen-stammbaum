import { describe, expect, test } from 'vitest'
import {
  CARDS_PER_SHEET,
  COLUMNS,
  DARK_TEXT,
  GRID_MM,
  LIGHT_TEXT,
  PALETTE,
  PENDING_ADDRESS,
  VORLAGEN,
  accentOnWhite,
  availableContacts,
  cardModel,
  codeGroups,
  contactLines,
  cropMarks,
  designPayload,
  effectiveVorlage,
  isSameDesign,
  maskPendingAddress,
  mirrorRows,
  musterCodes,
  normalizeDesign,
  normalizeHex,
  textColorOn,
  voucherTarget,
  websiteLabel
} from './visitenkarte.js'
import { contrastRatio } from './contrast.js'
import { buildKartenSheets } from './einladungskarte.js'

const DESIGN = Object.freeze({
  karte: 'kombi',
  vorlage: 'foto',
  farbe: '#1f5f8b',
  kurztext: 'Welpenkurse und Hundetraining',
  widmung: 'Für unsere Welpenkurs-Familien',
  zeigeAnsprechperson: true,
  zeigeWebsite: true,
  zeigeTelefon: true,
  zeigeEmail: false
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
      widmung: 'Für unsere Welpenkurs-Familien',
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

  test('cardModel: persönliche Zeile getrimmt, leer -> keine; ohne öffentliche Adresse ein Platzhalter statt Host', () => {
    expect(cardModel({ profile: PROFILE, design: { ...DESIGN, widmung: '  ' }, publicUrl: null, origin: 'http://x.test' }).widmung).toBe(null)
    const card = cardModel({ profile: PROFILE, design: DESIGN, publicUrl: null, origin: 'http://10.0.0.5:3010' })
    const masked = maskPendingAddress(card)
    expect(masked).toMatchObject({ host: PENDING_ADDRESS, portalLabel: PENDING_ADDRESS, portalPfad: '', addressPending: true })
    expect(JSON.stringify([masked.host, masked.portalLabel, masked.portalPfad])).not.toContain('10.0.0.5')
    expect(masked.portalUrl).toBe(card.portalUrl)
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
  test('10 Karten je Bogen (2 × 5)', () => {
    expect(CARDS_PER_SHEET).toBe(10)
  })

  test('mirrorRows spiegelt die Spalten jeder Reihe', () => {
    expect(mirrorRows([0, 1, 2, 3, 4, 5], 2)).toEqual([1, 0, 3, 2, 5, 4])
    expect(mirrorRows(['a', 'b', 'c'], 3)).toEqual(['c', 'b', 'a'])
  })

  test('Rückseiten passen zum Wenden über die lange Kante: links und rechts tauschen, die Reihen bleiben', () => {
    const [sheet] = buildKartenSheets({ count: CARDS_PER_SHEET })
    sheet.backs.forEach((back, position) => {
      const row = Math.floor(position / COLUMNS)
      const column = position % COLUMNS
      // Über die lange Kante gewendet liegt die Rückseite an (Reihe, gespiegelte Spalte) hinter der Vorderseite.
      expect(back.index).toBe(sheet.fronts[row * COLUMNS + (COLUMNS - 1 - column)])
    })
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
  test('normalizeDesign: fehlende oder unbekannte Kombination -> Kombi, fehlende Zeile -> leer', () => {
    const { karte, widmung, ...alt } = DESIGN
    expect([karte, widmung.length > 0]).toEqual(['kombi', true])
    expect(normalizeDesign({ ...alt, mitGutschein: true })).toMatchObject({ karte: 'kombi', widmung: '' })
    expect(normalizeDesign({ ...DESIGN, karte: 'einladung' })).toEqual({ ...DESIGN, karte: 'einladung' })
    expect(normalizeDesign({ ...DESIGN, karte: 'gutschein' }).karte).toBe('kombi')
  })

  test('designPayload schickt genau die Felder der Gestaltung (samt Kombination), isSameDesign vergleicht sie', () => {
    const payload = designPayload({ ...DESIGN, extra: 'weg', mitGutschein: true })
    expect(payload).toEqual(DESIGN)
    expect(isSameDesign(DESIGN, { ...DESIGN, karte: 'einladung' })).toBe(false)
    expect(isSameDesign(DESIGN, { ...DESIGN, widmung: 'Anders' })).toBe(false)
    expect(isSameDesign(DESIGN, { ...DESIGN })).toBe(true)
    expect(isSameDesign(DESIGN, { ...DESIGN, farbe: '#000000' })).toBe(false)
    expect(isSameDesign(DESIGN, null)).toBe(false)
  })
})
