import { describe, expect, test } from 'vitest'
import {
  BANNER_LAYOUTS,
  MAX_BANNER,
  bannerFormData,
  editorSlots,
  effectiveLayout,
  isBannerFileType,
  layoutOf,
  ownBannerItems,
  portalBanner,
  portalBannerItems,
  slotLabel
} from './partnerBanner.js'

describe('portalBannerItems', () => {
  test('nur öffentliche Foto-Adressen, höchstens drei, alt immer Text', () => {
    const banner = [
      { fotoUrl: '/public-media/a.jpg', alt: 'Wiese' },
      { fotoUrl: '/public-media/b.png', alt: null },
      { fotoUrl: '/public-media/c.jpg', alt: 'drittes' },
      { fotoUrl: '/public-media/d.jpg', alt: 'zu viel' }
    ]
    expect(portalBannerItems(banner)).toEqual([
      { fotoUrl: '/public-media/a.jpg', alt: 'Wiese' },
      { fotoUrl: '/public-media/b.png', alt: '' },
      { fotoUrl: '/public-media/c.jpg', alt: 'drittes' }
    ])
    expect(MAX_BANNER).toBe(3)
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
  test('Position 1 bis 3 und ein Foto unter /uploads', () => {
    expect(
      ownBannerItems([
        { position: 1, fotoUrl: '/uploads/a.jpg', alt: 'Kopf' },
        { position: 4, fotoUrl: '/uploads/b.jpg', alt: 'zu weit' },
        { position: 2, fotoUrl: '/public-media/c.jpg', alt: 'öffentlich' },
        { position: 2, fotoUrl: '/uploads/d.png', alt: null },
        { position: 3, fotoUrl: '/uploads/e.jpg', alt: 'drittes' }
      ])
    ).toEqual([
      { position: 1, fotoUrl: '/uploads/a.jpg', alt: 'Kopf' },
      { position: 2, fotoUrl: '/uploads/d.png', alt: '' },
      { position: 3, fotoUrl: '/uploads/e.jpg', alt: 'drittes' }
    ])
    expect(ownBannerItems(null)).toEqual([])
  })
})

describe('Banner-Layouts', () => {
  test('vier Layouts in fester Reihenfolge, je mit Zahl der Fotos', () => {
    expect(BANNER_LAYOUTS.map((layout) => [layout.id, layout.label, layout.slots])).toEqual([
      ['eins', 'Ein Foto', 1],
      ['halb', 'Zwei Fotos – halb/halb', 2],
      ['gross-links', 'Groß links, klein rechts', 2],
      ['drei', 'Drei Fotos', 3]
    ])
  })

  test('layoutOf: Gespeichertes, sonst die Vorgabe aus der Zahl der Fotos', () => {
    expect(layoutOf('halb', 1)).toBe('halb')
    expect(layoutOf(undefined, 0)).toBe('eins')
    expect(layoutOf('quatsch', 2)).toBe('gross-links')
    expect(layoutOf(null, 3)).toBe('drei')
  })

  test('effectiveLayout: fehlen Fotos, das nächstkleinere Layout', () => {
    expect(effectiveLayout('drei', 3)).toBe('drei')
    expect(effectiveLayout('drei', 2)).toBe('gross-links')
    expect(effectiveLayout('drei', 1)).toBe('eins')
    expect(effectiveLayout('halb', 2)).toBe('halb')
    expect(effectiveLayout('halb', 1)).toBe('eins')
    expect(effectiveLayout('gross-links', 1)).toBe('eins')
    expect(effectiveLayout('eins', 3)).toBe('eins')
    expect(effectiveLayout('halb', 0)).toBeNull()
  })

  test('portalBanner: nur hochgeladene Fotos, so viele, wie das (wirksame) Layout zeigt', () => {
    const banner = ['a', 'b', 'c'].map((name) => ({ fotoUrl: `/public-media/${name}.jpg`, alt: name }))
    expect(portalBanner(banner, 'halb')).toEqual({ layout: 'halb', items: banner.slice(0, 2) })
    expect(portalBanner(banner.slice(0, 2), 'drei')).toEqual({ layout: 'gross-links', items: banner.slice(0, 2) })
    expect(portalBanner(banner.slice(0, 1), undefined)).toEqual({ layout: 'eins', items: banner.slice(0, 1) })
    expect(portalBanner([], 'drei')).toEqual({ layout: null, items: [] })
  })

  test('slotLabel: wo ein Foto im Layout steht', () => {
    expect(slotLabel('eins', 1)).toBe('Foto')
    expect(slotLabel('halb', 2)).toBe('Foto 2 · rechts')
    expect(slotLabel('gross-links', 1)).toBe('Foto 1 · groß links')
    expect(slotLabel('drei', 3)).toBe('Foto 3 · rechts unten')
  })

  test('editorSlots: Fotos im Layout, dazu der nächste freie Platz; was nicht hineinpasst, steht extra', () => {
    const items = [1, 2, 3].map((position) => ({ position, fotoUrl: `/uploads/${position}.jpg`, alt: '' }))
    expect(editorSlots('drei', items.slice(0, 1))).toEqual({
      slots: [
        { position: 1, label: 'Foto 1 · groß links', item: items[0] },
        { position: 2, label: 'Foto 2 · rechts oben', item: null }
      ],
      extra: []
    })
    expect(editorSlots('eins', items.slice(0, 2))).toEqual({
      slots: [{ position: 1, label: 'Foto', item: items[0] }],
      extra: [{ position: 2, label: 'Foto 2', item: items[1] }]
    })
    expect(editorSlots('halb', [])).toEqual({ slots: [{ position: 1, label: 'Foto 1 · links', item: null }], extra: [] })
    expect(editorSlots('halb', items.slice(0, 2)).slots.map((slot) => slot.item)).toEqual(items.slice(0, 2))
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
