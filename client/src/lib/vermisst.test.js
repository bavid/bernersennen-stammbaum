import { describe, expect, test } from 'vitest'
import { EMPTY_INPUTS, MAX_PHOTOS, REGISTRIES, VERMISST_RE, buildPoster, canMakePoster, pickPhotos, vermisstRoute } from './vermisst.js'

const home = { id: 1, art: 'zuhause' }
const benno = { id: 7, name: 'Benno', tierart: 'hund', rasse: 'Mischling', geschlecht: 'ruede', geburtsdatum: '2020-01-15', farbe_markings: 'schwarz, weiße Brust', foto_url: '/p/benno.jpg', canEdit: true }

describe('vermisst', () => {
  test('Route und Muster passen zusammen', () => {
    expect(vermisstRoute(7)).toBe('/tier/7/vermisst')
    expect('/tier/7/vermisst'.match(VERMISST_RE)[1]).toBe('7')
    expect(VERMISST_RE.test('/tier/7')).toBe(false)
  })

  test('Plakat nur für eigene, lebende Tiere im eigenen Zuhause', () => {
    expect(canMakePoster(home, benno)).toBe(true)
    expect(canMakePoster(home, { ...benno, canEdit: false })).toBe(false)
    expect(canMakePoster({ ...home, zuBesuch: true }, benno)).toBe(false)
    expect(canMakePoster({ id: 2, art: 'rudel' }, benno)).toBe(false)
    expect(canMakePoster({ id: 3, art: 'tierheim' }, benno)).toBe(false)
    expect(canMakePoster(home, { ...benno, bei_uns_bis: '2024-01-01' })).toBe(false)
    expect(canMakePoster(null, benno)).toBe(false)
  })

  test('Fotos: Porträt zuerst, dann die neuesten aus der Chronik, ohne Doppelte, höchstens sechs', () => {
    const entries = [
      { datum: '2021-01-01', foto_urls: ['/a.jpg'] },
      { datum: '2023-01-01', foto_urls: ['/c.jpg', '/p/benno.jpg'] },
      { datum: '2022-01-01', foto_urls: [] },
      { datum: '2022-06-01', foto_urls: ['/b.jpg', '/d.jpg', '/e.jpg', '/f.jpg', '/g.jpg'] }
    ]
    const photos = pickPhotos(benno, entries)
    expect(photos).toHaveLength(MAX_PHOTOS)
    expect(photos.slice(0, 3)).toEqual(['/p/benno.jpg', '/c.jpg', '/b.jpg'])
    expect(pickPhotos({ ...benno, foto_url: null }, [])).toEqual([])
  })

  test('Plakat: Profil-Angaben und getrimmte Eingaben', () => {
    const poster = buildPoster({ dog: benno, photo: '/p/benno.jpg', inputs: { ...EMPTY_INPUTS, seenPlace: '  Stadtpark ', contact: '0170 1' }, today: '2026-10-10' })
    expect(poster.name).toBe('Benno')
    expect(poster.facts).toEqual([
      ['Tierart', 'Hund'],
      ['Rasse', 'Mischling'],
      ['Farbe & Abzeichen', 'schwarz, weiße Brust'],
      ['Geschlecht', 'Rüde'],
      ['Alter', '6 Jahre']
    ])
    expect(poster.seenPlace).toBe('Stadtpark')
    expect(poster.contact).toBe('0170 1')
    expect(poster.chip).toBe('')
  })

  test('verweist auf TASSO und FINDEFIX statt auf ein eigenes Register', () => {
    expect(REGISTRIES.map((r) => r.url)).toEqual(['tasso.net', 'findefix.com'])
  })
})
