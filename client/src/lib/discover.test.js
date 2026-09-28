import { describe, expect, test } from 'vitest'
import { formatEuroCents, isClickUrl, isPartnerMedia, kennzeichnungLabel, normalizeDiscover, promotionRel, splitByDistance } from './discover.js'

// Intl setzt zwischen Betrag und € ein geschütztes Leerzeichen (U+00A0) - für lesbare Vergleiche hier
// durch ein normales ersetzt.
const plain = (text) => text.replace(/ /g, ' ')

describe('formatEuroCents', () => {
  test('rechnet Cent in Euro um und formatiert deutsch', () => {
    expect(plain(formatEuroCents(125000))).toBe('1.250,00 €')
    expect(plain(formatEuroCents(18050))).toBe('180,50 €')
    expect(plain(formatEuroCents(0))).toBe('0,00 €')
  })

  test('liefert null für fehlende oder ungültige Beträge', () => {
    expect(formatEuroCents(undefined)).toBeNull()
    expect(formatEuroCents(null)).toBeNull()
    expect(formatEuroCents('abc')).toBeNull()
  })
})

describe('isClickUrl', () => {
  test('akzeptiert nur die eigenen Klickzähler-Pfade /r/<typ>/<id>', () => {
    expect(isClickUrl('/r/promotion/7')).toBe(true)
    expect(isClickUrl('/r/partner-website/12')).toBe(true)
    expect(isClickUrl('/r/gofundme/0')).toBe(true)
  })

  test('lehnt fremde Adressen, Protokolle und Pfad-Tricks ab', () => {
    expect(isClickUrl('https://example.org')).toBe(false)
    expect(isClickUrl('javascript:alert(1)')).toBe(false)
    expect(isClickUrl('//example.org/r/promotion/1')).toBe(false)
    expect(isClickUrl('/r/promotion/1?url=https://example.org')).toBe(false)
    expect(isClickUrl('/r/../api/me')).toBe(false)
    expect(isClickUrl(null)).toBe(false)
  })
})

describe('isPartnerMedia', () => {
  test('akzeptiert Bilder und Logos unter /partner-media/', () => {
    expect(isPartnerMedia('/partner-media/knabber.webp')).toBe(true)
    expect(isPartnerMedia('/partner-media/3f2a-logo.png')).toBe(true)
  })

  test('lehnt fremde Adressen, andere Pfade und Nicht-Strings ab', () => {
    expect(isPartnerMedia('https://example.org/bild.png')).toBe(false)
    expect(isPartnerMedia('//example.org/partner-media/bild.png')).toBe(false)
    expect(isPartnerMedia('/uploads/bild.png')).toBe(false)
    expect(isPartnerMedia('javascript:alert(1)')).toBe(false)
    expect(isPartnerMedia(null)).toBe(false)
    expect(isPartnerMedia(undefined)).toBe(false)
  })
})

describe('promotionRel', () => {
  test('"Anzeige" bekommt sponsored, "Empfehlung" und "Partner" nicht', () => {
    expect(promotionRel('Anzeige')).toBe('sponsored noopener noreferrer')
    expect(promotionRel('Empfehlung')).toBe('noopener noreferrer')
    expect(promotionRel('Partner')).toBe('noopener noreferrer')
  })

  test('unbekannte Kennzeichnung gilt vorsichtshalber als Anzeige (wie kennzeichnungLabel)', () => {
    expect(promotionRel(undefined)).toBe('sponsored noopener noreferrer')
  })
})

describe('kennzeichnungLabel', () => {
  test('nennt bei "Empfehlung" die empfehlende Stelle', () => {
    expect(kennzeichnungLabel({ kennzeichnung: 'Empfehlung', empfohlenVon: 'Hundeschule Wiesengrund' })).toBe(
      'Empfehlung von Hundeschule Wiesengrund'
    )
  })

  test('"Empfehlung" ohne Angabe bleibt "Empfehlung"', () => {
    expect(kennzeichnungLabel({ kennzeichnung: 'Empfehlung', empfohlenVon: null })).toBe('Empfehlung')
  })

  test('"Anzeige" und "Partner" bleiben wörtlich', () => {
    expect(kennzeichnungLabel({ kennzeichnung: 'Anzeige' })).toBe('Anzeige')
    expect(kennzeichnungLabel({ kennzeichnung: 'Partner' })).toBe('Partner')
  })

  test('unbekannte Kennzeichnung wird vorsichtshalber als "Anzeige" ausgewiesen', () => {
    expect(kennzeichnungLabel({ kennzeichnung: 'irgendwas' })).toBe('Anzeige')
  })
})

describe('splitByDistance', () => {
  test('trennt Einträge im Umkreis von denen mit ausserhalb: true', () => {
    const items = [{ id: 1, ausserhalb: false }, { id: 2 }, { id: 3, ausserhalb: true }]
    const { near, far } = splitByDistance(items)
    expect(near.map((item) => item.id)).toEqual([1, 2])
    expect(far.map((item) => item.id)).toEqual([3])
  })
})

describe('normalizeDiscover', () => {
  test('eine leere oder fehlende Antwort ergibt leere Abschnitte statt eines Absturzes', () => {
    const result = normalizeDiscover(undefined)
    expect(result.hundeschulPartner).toEqual([])
    expect(result.hundeschulPromotions).toEqual([])
    expect(result.begleiterPartner).toEqual([])
    expect(result.begleiterTiere).toEqual([])
    expect(result.begleiterPromotions).toEqual([])
    expect(result.futter).toEqual([])
    expect(result.unterstuetzen).toEqual({ gofundmeClickUrl: null, text: null, bericht: null, partnerSpenden: [], promotions: [] })
    expect(result.fallback).toEqual({ hundeschulen: false, begleiter: false })
  })

  test('teilt hundeschulen in Partner und Empfehlungen und übernimmt die übrigen Abschnitte', () => {
    const result = normalizeDiscover({
      fallback: { hundeschulen: true, begleiter: false },
      hundeschulen: [
        { id: 1, kind: 'partner', name: 'Hundeschule Wiesengrund' },
        { id: 2, kind: 'promotion', titel: 'Welpenkurs' }
      ],
      begleiter: { partner: [{ id: 3 }], tiere: [{ slug: 'fips-ab12' }], promotions: [{ id: 5, kind: 'promotion', bereich: 'begleiter' }] },
      futter: [{ id: 4 }],
      unterstuetzen: {
        gofundmeClickUrl: '/r/gofundme/0',
        text: 'Danke!',
        bericht: null,
        partnerSpenden: [{ id: 3 }],
        promotions: [{ id: 6, kind: 'promotion', bereich: 'unterstuetzen' }]
      }
    })
    expect(result.hundeschulPartner.map((item) => item.id)).toEqual([1])
    expect(result.hundeschulPromotions.map((item) => item.id)).toEqual([2])
    expect(result.begleiterPartner).toHaveLength(1)
    expect(result.begleiterTiere).toHaveLength(1)
    expect(result.begleiterPromotions.map((item) => item.id)).toEqual([5])
    expect(result.futter).toHaveLength(1)
    expect(result.unterstuetzen.gofundmeClickUrl).toBe('/r/gofundme/0')
    expect(result.unterstuetzen.partnerSpenden).toHaveLength(1)
    expect(result.unterstuetzen.promotions.map((item) => item.id)).toEqual([6])
    expect(result.fallback).toEqual({ hundeschulen: true, begleiter: false })
  })

  test('null-Einträge in einer Liste fallen heraus', () => {
    const result = normalizeDiscover({ hundeschulen: [null, { id: 1, kind: 'partner' }], begleiter: { partner: [null, 'x', { id: 2 }] } })
    expect(result.hundeschulPartner.map((item) => item.id)).toEqual([1])
    expect(result.begleiterPartner.map((item) => item.id)).toEqual([2])
  })

  test('falsche Typen (z. B. Objekt statt Liste) werden zu leeren Listen', () => {
    const result = normalizeDiscover({ hundeschulen: {}, begleiter: 'x', futter: null, unterstuetzen: { partnerSpenden: 'x', promotions: {} } })
    expect(result.hundeschulPartner).toEqual([])
    expect(result.begleiterPartner).toEqual([])
    expect(result.begleiterTiere).toEqual([])
    expect(result.begleiterPromotions).toEqual([])
    expect(result.futter).toEqual([])
    expect(result.unterstuetzen.partnerSpenden).toEqual([])
    expect(result.unterstuetzen.promotions).toEqual([])
  })

  test('fehlende Empfehlungs-Listen bei Begleiter und Unterstützen werden zu leeren Listen, null-Einträge fallen heraus', () => {
    const missing = normalizeDiscover({ begleiter: { partner: [], tiere: [] }, unterstuetzen: { partnerSpenden: [] } })
    expect(missing.begleiterPromotions).toEqual([])
    expect(missing.unterstuetzen.promotions).toEqual([])

    const withNull = normalizeDiscover({ begleiter: { promotions: [null, { id: 7 }] }, unterstuetzen: { promotions: ['x', { id: 8 }] } })
    expect(withNull.begleiterPromotions.map((item) => item.id)).toEqual([7])
    expect(withNull.unterstuetzen.promotions.map((item) => item.id)).toEqual([8])
  })
})
