import { describe, expect, test } from 'vitest'
import { MAX_BANNER, bannerFormData, isBannerFileType, ownBannerItems, portalBannerItems } from './partnerBanner.js'

describe('portalBannerItems', () => {
  test('nur öffentliche Foto-Adressen, höchstens zwei, alt immer Text', () => {
    const banner = [
      { fotoUrl: '/public-media/a.jpg', alt: 'Wiese' },
      { fotoUrl: '/public-media/b.png', alt: null },
      { fotoUrl: '/public-media/c.jpg', alt: 'zu viel' }
    ]
    expect(portalBannerItems(banner)).toEqual([
      { fotoUrl: '/public-media/a.jpg', alt: 'Wiese' },
      { fotoUrl: '/public-media/b.png', alt: '' }
    ])
    expect(MAX_BANNER).toBe(2)
  })

  test('verwirft fremde Adressen; /uploads nur in der Kundensicht', () => {
    const banner = [
      { fotoUrl: 'https://example.org/x.jpg', alt: 'fremd' },
      { fotoUrl: 'javascript:alert(1)', alt: 'böse' },
      { fotoUrl: '/public-media/../geheim.jpg', alt: 'Pfad' },
      { fotoUrl: '/uploads/eigen.jpg', alt: 'eigen' },
      null
    ]
    expect(portalBannerItems(banner)).toEqual([])
    expect(portalBannerItems(banner, { preview: true })).toEqual([{ fotoUrl: '/uploads/eigen.jpg', alt: 'eigen' }])
    expect(portalBannerItems(undefined)).toEqual([])
  })
})

describe('ownBannerItems', () => {
  test('Position 1 oder 2 und ein Foto unter /uploads', () => {
    expect(
      ownBannerItems([
        { position: 1, fotoUrl: '/uploads/a.jpg', alt: 'Kopf' },
        { position: 3, fotoUrl: '/uploads/b.jpg', alt: 'zu weit' },
        { position: 2, fotoUrl: '/public-media/c.jpg', alt: 'öffentlich' },
        { position: 2, fotoUrl: '/uploads/d.png', alt: null }
      ])
    ).toEqual([
      { position: 1, fotoUrl: '/uploads/a.jpg', alt: 'Kopf' },
      { position: 2, fotoUrl: '/uploads/d.png', alt: '' }
    ])
    expect(ownBannerItems(null)).toEqual([])
  })
})

describe('bannerFormData', () => {
  test('Foto im Feld "foto", Alternativtext getrimmt und nur, wenn vorhanden', () => {
    const file = new File(['x'], 'kopf.jpg', { type: 'image/jpeg' })
    const withAlt = bannerFormData(file, '  Gruppe am Deich ')
    expect(withAlt.get('alt')).toBe('Gruppe am Deich')
    expect(withAlt.get('foto')).toBeInstanceOf(File)
    expect(bannerFormData(file, '   ').has('alt')).toBe(false)
  })

  test('nur JPG oder PNG', () => {
    expect(isBannerFileType(new File(['x'], 'a.jpg', { type: 'image/jpeg' }))).toBe(true)
    expect(isBannerFileType(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(true)
    expect(isBannerFileType(new File(['x'], 'a.webp', { type: 'image/webp' }))).toBe(false)
    expect(isBannerFileType(null)).toBe(false)
  })
})
