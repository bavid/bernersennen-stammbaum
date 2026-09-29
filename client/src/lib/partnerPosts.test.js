import { describe, expect, test } from 'vitest'
import {
  BEREICHE_BY_TYP,
  allowedBereiche,
  clickCount,
  freigabeKey,
  initialPostForm,
  postClientErrors,
  postErrorField,
  toPostPayload
} from './partnerPosts.js'

describe('allowedBereiche – wie server/lib/partnerPosts.js BEREICHE_BY_TYP', () => {
  test.each([
    ['hundeschule', ['hundeschule']],
    ['hundesalon', ['salon']],
    ['betreuung', ['salon']],
    ['tierheim', ['begleiter', 'unterstuetzen']],
    ['vermittlung', ['begleiter', 'unterstuetzen']],
    ['futter', ['futter']],
    ['sonstige', ['unterstuetzen', 'futter']]
  ])('%s -> %j', (typ, bereiche) => {
    expect(allowedBereiche(typ)).toEqual(bereiche)
  })

  test('unbekannter oder fehlender Typ: keine Bereiche', () => {
    expect(allowedBereiche('zuechter')).toEqual([])
    expect(allowedBereiche(undefined)).toEqual([])
  })

  test('die Tabelle ist eingefroren', () => {
    expect(Object.isFrozen(BEREICHE_BY_TYP)).toBe(true)
  })
})

describe('initialPostForm', () => {
  test('neu: mit genau einem erlaubten Bereich ist er vorgewählt, aktiv an', () => {
    expect(initialPostForm(null, 'hundeschule')).toEqual({ titel: '', text: '', bereich: 'hundeschule', url: '', start: '', ende: '', aktiv: true })
  })

  test('neu: mit mehreren erlaubten Bereichen muss man wählen', () => {
    expect(initialPostForm(null, 'tierheim').bereich).toBe('')
  })

  test('bearbeiten: übernimmt die Werte des Beitrags', () => {
    const post = { titel: 'Welpenkurs', text: null, bereich: 'hundeschule', url: 'https://example.org', start: '2026-10-01', ende: null, aktiv: false }
    expect(initialPostForm(post, 'hundeschule')).toEqual({
      titel: 'Welpenkurs',
      text: '',
      bereich: 'hundeschule',
      url: 'https://example.org',
      start: '2026-10-01',
      ende: '',
      aktiv: false
    })
  })
})

describe('toPostPayload', () => {
  test('trimmt und schickt leere Felder als null', () => {
    const form = { titel: '  Welpenkurs ', text: '  ', bereich: 'salon', url: ' ', start: '', ende: '2026-12-01', aktiv: true }
    expect(toPostPayload(form)).toEqual({ titel: 'Welpenkurs', text: null, bereich: 'salon', url: null, start: null, ende: '2026-12-01', aktiv: true })
  })
})

describe('postClientErrors', () => {
  const valid = { titel: 'Welpenkurs', text: '', bereich: 'hundeschule', url: '', start: '', ende: '', aktiv: true }

  test('ein gültiges Formular hat keine Fehler', () => {
    expect(postClientErrors(valid, 'hundeschule')).toEqual({})
  })

  test('Titel ist Pflicht, kein HTML in Titel und Text', () => {
    expect(postClientErrors({ ...valid, titel: '  ' }, 'hundeschule').titel).toBe('Der Titel ist Pflicht')
    expect(postClientErrors({ ...valid, titel: '<b>Kurs</b>' }, 'hundeschule').titel).toMatch(/kein HTML/)
    expect(postClientErrors({ ...valid, text: 'a <script>' }, 'hundeschule').text).toMatch(/kein HTML/)
  })

  test('ein Bereich, der nicht zum Typ passt, wird abgelehnt', () => {
    expect(postClientErrors({ ...valid, bereich: 'futter' }, 'hundeschule').bereich).toBe('Bitte einen Bereich wählen')
    expect(postClientErrors({ ...valid, bereich: '' }, 'tierheim').bereich).toBe('Bitte einen Bereich wählen')
  })

  test('das Ende darf nicht vor dem Start liegen', () => {
    expect(postClientErrors({ ...valid, start: '2026-10-10', ende: '2026-10-01' }, 'hundeschule').ende).toBe(
      'Das Ende darf nicht vor dem Start liegen'
    )
  })
})

describe('postErrorField', () => {
  test('ordnet Server-Meldungen den Feldern zu', () => {
    expect(postErrorField('Dieser Bereich passt nicht zu eurem Partner-Typ.')).toBe('bereich')
    expect(postErrorField('Der Titel darf höchstens 120 Zeichen haben')).toBe('titel')
    expect(postErrorField('Der Link: ungültige Adresse')).toBe('url')
    expect(postErrorField('Das Ende darf nicht vor dem Start liegen')).toBe('ende')
  })

  test('Limit, Demo und HTML stehen oben (kein Feld)', () => {
    expect(postErrorField('Höchstens 20 Beiträge – bitte ältere löschen.')).toBeNull()
    expect(postErrorField('Titel und Text dürfen nur reinen Text enthalten (kein HTML).')).toBeNull()
    expect(postErrorField(undefined)).toBeNull()
  })
})

describe('freigabeKey und clickCount', () => {
  test('unbekannte Freigabe gilt als wartend', () => {
    expect(freigabeKey('freigegeben')).toBe('freigegeben')
    expect(freigabeKey('abgelehnt')).toBe('abgelehnt')
    expect(freigabeKey('irgendwas')).toBe('eingereicht')
    expect(freigabeKey(undefined)).toBe('eingereicht')
  })

  test('Klickzahlen: nur ganze Zahlen ab 0', () => {
    expect(clickCount(7)).toBe(7)
    expect(clickCount(null)).toBe(0)
    expect(clickCount(-1)).toBe(0)
    expect(clickCount('3')).toBe(0)
  })
})
