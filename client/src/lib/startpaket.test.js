import { describe, expect, test } from 'vitest'
import { MUSTER_CODE, STARTPAKET_RE, buildStartpaket, canOpenStartpaket, pickMemories, startpaketRoute } from './startpaket.js'
import en from './i18n/en/startpaket.js'
import { setLang, t } from './i18n/index.js'
import { NEXT_STEPS, STARTPAKET_FOOTER } from '../components/startpaket/StartpaketSheets.jsx'

const dog = { id: 5, name: 'Benno', tierart: 'hund', geburtsdatum: '2022-04-01', beschreibung: 'Verschmust.', foto_url: '/media/b.jpg', canEdit: true }
const entry = (id, datum, photos = []) => ({ id, datum, titel: `E${id}`, text: '', foto_urls: photos })

describe('Startpaket – Inhaltsmodell', () => {
  test('Route ohne Code und passt zum Muster der App', () => {
    expect(startpaketRoute(5)).toBe('/tier/5/startpaket')
    expect(STARTPAKET_RE.exec('/tier/5/startpaket')[1]).toBe('5')
    expect(STARTPAKET_RE.test('/tier/5/startpaket?code=X')).toBe(false)
  })

  test('nur das eigene Tierheim darf öffnen', () => {
    expect(canOpenStartpaket({ art: 'tierheim' }, dog)).toBe(true)
    expect(canOpenStartpaket({ art: 'tierheim' }, { ...dog, canEdit: false })).toBe(false)
    expect(canOpenStartpaket({ art: 'zuhause' }, dog)).toBe(false)
    expect(canOpenStartpaket({ art: 'partner' }, dog)).toBe(false)
  })

  test('höchstens vier erste Erinnerungen, Fotos bevorzugt, nach Datum', () => {
    const list = pickMemories([
      entry(1, '2024-05-01'),
      entry(2, '2024-01-01', ['/a.jpg']),
      entry(3, '2024-03-01', ['/c.jpg']),
      entry(4, '2023-12-01', ['/d.jpg']),
      entry(5, '2024-06-01', ['/e.jpg']),
      entry(6, '2024-07-01', ['/f.jpg'])
    ])
    expect(list.map((m) => m.id)).toEqual([4, 2, 3, 5])
    expect(list[0].photo).toBe('/d.jpg')
  })

  test('Steckbrief, Tierheim und Übergabe-QR aus dem Code hinter dem #', () => {
    const model = buildStartpaket({
      dog,
      entries: [],
      shelter: { name: 'Tierheim Lotte', logoUrl: '/partner-media/l.png' },
      handover: { code: 'ABCD-1234-EFGH', link: '/v#ABCD1234EFGH' },
      origin: 'https://beispiel.de'
    })
    expect(model.profile).toMatchObject({ name: 'Benno', photo: '/media/b.jpg', text: 'Verschmust.' })
    expect(model.profile.birth).toBeTruthy()
    expect(model.shelter.name).toBe('Tierheim Lotte')
    expect(model.handover).toEqual({ code: 'ABCD-1234-EFGH', qrUrl: 'https://beispiel.de/v#ABCD1234EFGH', muster: false })
  })

  test('ohne Code kein QR, in der Demo ein Muster ohne Code', () => {
    expect(buildStartpaket({ dog, entries: [], origin: 'https://x' }).handover).toBeNull()
    expect(buildStartpaket({ dog, entries: [], origin: 'https://x', isDemo: true }).handover).toEqual({ code: MUSTER_CODE, qrUrl: 'https://x/v', muster: true })
  })
})

describe('Startpaket – Englisch', () => {
  test('alle Texte übersetzt', () => {
    for (const [key, value] of Object.entries(en)) expect(value.trim().length > 0, key).toBe(true)
    setLang('en')
    try {
      expect(t('Startpaket drucken')).toBe('Print starter pack')
      expect(t(STARTPAKET_FOOTER)).toBe('Free today. No third-party ads, no tracking, no data selling.')
      for (const step of NEXT_STEPS) expect(t(step, { name: 'Benno' })).not.toBe(step.replace('{name}', 'Benno'))
      expect(t('Muster')).toBe('Sample')
    } finally {
      setLang('de')
    }
  })
})
