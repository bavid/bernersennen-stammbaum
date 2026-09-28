// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { discover } = vi.hoisted(() => ({ discover: vi.fn() }))
vi.mock('../api', () => ({ api: { discover } }))

import DiscoverPage from './DiscoverPage.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const plain = (text) => text.replace(/ /g, ' ')

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  discover.mockReset()
  window.localStorage.clear()
})

async function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <DiscoverPage />
      </MemoryRouter>
    )
  )
  return container
}

function partner(overrides) {
  return {
    id: 1,
    kind: 'partner',
    slug: 'hundeschule-wiesengrund',
    name: 'Hundeschule Wiesengrund',
    typ: 'hundeschule',
    plz: '20095',
    ort: 'Hamburg',
    lat: null,
    lon: null,
    logoUrl: null,
    badge: 'partner',
    url: 'https://example.org/wiesengrund',
    clickUrl: '/r/partner-website/1',
    ...overrides
  }
}

function promotion(overrides) {
  return {
    id: 20,
    kind: 'promotion',
    bereich: 'futter',
    kennzeichnung: 'Empfehlung',
    empfohlenVon: 'Hundeschule Wiesengrund',
    titel: 'Haferflocken-Knabber',
    text: 'Knabberstücke aus Hafer.',
    bildUrl: null,
    tierart: 'hund',
    url: 'https://example.org/knabber',
    clickUrl: '/r/promotion/20',
    ...overrides
  }
}

const tier = {
  slug: 'fips-ab12cd',
  name: 'Fips',
  tierart: 'hund',
  geschlecht: 'm',
  rasse: 'Mischling',
  geburtsdatum: '2023-04-01',
  fotoUrl: null,
  vermittlung_status: 'in_vermittlung'
}

const fullResponse = {
  fallback: { hundeschulen: false, begleiter: false },
  hundeschulen: [partner(), promotion({ id: 21, bereich: 'hundeschule', kennzeichnung: 'Partner', empfohlenVon: null, titel: 'Welpenkurs im Herbst', clickUrl: '/r/promotion/21' })],
  begleiter: {
    partner: [partner({ id: 3, slug: 'tierheim-birkenweg', name: 'Tierheim Birkenweg', typ: 'tierheim', clickUrl: '/r/partner-website/3' })],
    tiere: [tier]
  },
  futter: [
    promotion(),
    promotion({ id: 22, kennzeichnung: 'Anzeige', empfohlenVon: null, titel: 'Probierpaket Mühlental', clickUrl: '/r/promotion/22' })
  ],
  unterstuetzen: {
    gofundmeUrl: 'https://example.org/spenden',
    gofundmeClickUrl: '/r/gofundme/0',
    text: 'Jeder Euro hilft.',
    bericht: {
      zeitraum: '2026 Q3',
      eingangCents: 125000,
      kostenCents: 18000,
      weitergeleitetCents: 100000,
      empfaenger: 'Tierheim Birkenweg',
      nachweisUrl: null
    },
    partnerSpenden: [{ id: 3, slug: 'tierheim-birkenweg', name: 'Tierheim Birkenweg', logoUrl: null, url: 'https://example.org/s', clickUrl: '/r/partner-spende/3' }]
  }
}

const emptyResponse = {
  fallback: { hundeschulen: false, begleiter: false },
  hundeschulen: [],
  begleiter: { partner: [], tiere: [] },
  futter: [],
  unterstuetzen: { gofundmeUrl: null, gofundmeClickUrl: null, text: null, bericht: null, partnerSpenden: [] }
}

function section(titleText) {
  return [...container.querySelectorAll('section[aria-labelledby]')].find(
    (el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent === titleText
  )
}

function linkIn(el, text) {
  return [...el.querySelectorAll('a')].find((a) => a.textContent.includes(text))
}

async function submitPlz(value, radius) {
  const input = container.querySelector('#location-plz')
  await act(async () => setInputValue(input, value))
  if (radius) {
    const select = container.querySelector('#location-radius')
    const nativeSelectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
    await act(async () => {
      nativeSelectSetter.call(select, String(radius))
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  await act(async () => container.querySelector('form.location-picker').requestSubmit())
}

describe('DiscoverPage – Kopf und Laden', () => {
  test('zeigt die Überschrift "Entdecken" und den PLZ-/Umkreis-Wähler', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    expect(container.querySelector('h1').textContent).toBe('Entdecken')
    expect(container.querySelector('#location-plz')).not.toBeNull()
    expect(container.querySelector('#location-radius')).not.toBeNull()
  })

  test('lädt ohne gespeicherte PLZ alles (leerer Aufruf)', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    expect(discover).toHaveBeenCalledWith({})
  })

  test('eine gespeicherte PLZ und ein gespeicherter Umkreis werden beim Laden mitgeschickt', async () => {
    window.localStorage.setItem('chronik.nearbyPlz', JSON.stringify('20095'))
    window.localStorage.setItem('chronik.nearbyRadius', JSON.stringify(50))
    discover.mockResolvedValue(fullResponse)
    await render()
    expect(discover).toHaveBeenCalledWith({ plz: '20095', radius: 50 })
    expect(container.querySelector('#location-plz').value).toBe('20095')
  })

  test('Suche mit PLZ schickt PLZ und Umkreis und merkt sich beides', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    await submitPlz('20095', 10)
    expect(discover).toHaveBeenLastCalledWith({ plz: '20095', radius: 10 })
    expect(JSON.parse(window.localStorage.getItem('chronik.nearbyPlz'))).toBe('20095')
    expect(JSON.parse(window.localStorage.getItem('chronik.nearbyRadius'))).toBe(10)
  })

  test('eine unvollständige PLZ ruft den Server nicht auf und zeigt einen Hinweis', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    discover.mockClear()
    await submitPlz('201')
    expect(discover).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Bitte eine 5-stellige Postleitzahl eingeben.')
  })

  test('Serverfehler: freundliche deutsche Meldung, kein Absturz', async () => {
    discover.mockRejectedValue(Object.assign(new Error('Fehler 500'), { status: 500 }))
    await render()
    expect(container.querySelector('[role="alert"]').textContent).toBe(
      'Entdecken konnte gerade nicht geladen werden. Bitte versucht es gleich noch einmal.'
    )
  })

  test('Fehler mit Server-Meldung (z. B. unbekannte PLZ) zeigt diese Meldung', async () => {
    discover.mockRejectedValue(Object.assign(new Error('Diese Postleitzahl kennen wir nicht'), { status: 400 }))
    await render()
    expect(container.querySelector('[role="alert"]').textContent).toBe('Diese Postleitzahl kennen wir nicht')
  })

  test('eine Antwort ohne Abschnitte bringt die Seite nicht zum Absturz', async () => {
    discover.mockResolvedValue({})
    await render()
    expect(section('Hundeschule gesucht?')).toBeDefined()
    expect(section('Unterstützen')).toBeDefined()
  })
})

describe('DiscoverPage – vier Kapitel', () => {
  test('rendert alle vier Abschnitte als Landmarks mit Überschrift', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    const titles = [...container.querySelectorAll('section[aria-labelledby] h2')].map((h) => h.textContent)
    expect(titles).toEqual(['Hundeschule gesucht?', 'Neuer Begleiter gesucht?', 'Futter-Empfehlungen', 'Unterstützen'])
  })

  test('Hundeschulen: Partnerkarte mit Portal-Link und Empfehlung als PromotionCard', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    const el = section('Hundeschule gesucht?')
    expect(el.textContent).toContain('Hundeschule Wiesengrund')
    expect(linkIn(el, 'Zum Portal').getAttribute('href')).toBe('/p/hundeschule-wiesengrund')
    expect(el.querySelector('.promotion-card h3').textContent).toBe('Welpenkurs im Herbst')
  })

  test('Begleiter: Tierheim, Tierkarte → /t/:slug, Hinweis ohne Züchter und Link "Mehr in der Nähe"', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    const el = section('Neuer Begleiter gesucht?')
    expect(el.textContent).toContain('Tierheim Birkenweg')
    expect(linkIn(el, 'Fips').getAttribute('href')).toBe('/t/fips-ab12cd')
    expect(el.textContent).toContain('Hier findest du nur Tierheime und Vermittlungsstellen – keine Züchter.')
    expect(linkIn(el, 'Mehr in der Nähe').getAttribute('href')).toBe('/umgebung')
  })

  test('Futter: Anzeigen-Links tragen sponsored, Empfehlungen nicht', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    const el = section('Futter-Empfehlungen')
    const anzeige = linkIn(el, 'Probierpaket Mühlental')
    const empfehlung = linkIn(el, 'Haferflocken-Knabber')
    expect(anzeige.getAttribute('rel')).toBe('sponsored noopener noreferrer')
    expect(empfehlung.getAttribute('rel')).not.toContain('sponsored')
    expect(el.textContent).toContain('Empfehlung von Hundeschule Wiesengrund')
  })

  test('alle externen Links zeigen auf die Klickzählung /r/...', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    const external = [...container.querySelectorAll('a[target="_blank"]')].filter((a) => !a.textContent.includes('Maps') && !a.textContent.includes('OpenStreetMap'))
    expect(external.length).toBeGreaterThanOrEqual(6)
    for (const a of external) expect(a.getAttribute('href')).toMatch(/^\/r\/[a-z-]+\/\d+$/)
  })

  test('Unterstützen: GoFundMe-Knopf und deutsch formatierte Beträge', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    const el = section('Unterstützen')
    expect(linkIn(el, 'GoFundMe').getAttribute('href')).toBe('/r/gofundme/0')
    const text = plain(el.textContent)
    expect(text).toContain('1.250,00 €')
    expect(text).toContain('180,00 €')
    expect(text).toContain('1.000,00 €')
    expect(text).toContain('2026 Q3')
  })
})

describe('DiscoverPage – Umkreis-Fallback', () => {
  const fallbackResponse = {
    ...fullResponse,
    fallback: { hundeschulen: true, begleiter: true },
    hundeschulen: [
      partner({ distanceKm: 3.2, ausserhalb: false }),
      partner({ id: 2, slug: 'hundeschule-heidekamp', name: 'Hundeschule Heidekamp', distanceKm: 41.5, ausserhalb: true, clickUrl: '/r/partner-website/2' })
    ],
    begleiter: {
      partner: [partner({ id: 3, slug: 'tierheim-birkenweg', name: 'Tierheim Birkenweg', typ: 'tierheim', distanceKm: 62, ausserhalb: true })],
      tiere: [{ ...tier, distanceKm: 62, ausserhalb: true }]
    }
  }

  test('Einträge außerhalb stehen unter "Weiter weg", mit Entfernung', async () => {
    discover.mockResolvedValue(fallbackResponse)
    await render()
    const el = section('Hundeschule gesucht?')
    const far = el.querySelector('.discover-far')
    expect(far.querySelector('h3').textContent).toBe('Weiter weg')
    expect(far.textContent).toContain('Hundeschule Heidekamp')
    expect(far.textContent).toContain('41,5 km')
    expect(far.textContent).not.toContain('Hundeschule Wiesengrund')
    expect(el.textContent).toContain('3,2 km')
  })

  test('der Fallback-Hinweis erscheint je Abschnitt mit fallback: true', async () => {
    discover.mockResolvedValue(fallbackResponse)
    await render()
    const note = 'In eurer Nähe gibt es nur wenige – hier die nächsten weiteren.'
    expect(section('Hundeschule gesucht?').textContent).toContain(note)
    expect(section('Neuer Begleiter gesucht?').textContent).toContain(note)
    expect(section('Futter-Empfehlungen').textContent).not.toContain(note)
  })

  test('Tiere außerhalb landen ebenfalls unter "Weiter weg"', async () => {
    discover.mockResolvedValue(fallbackResponse)
    await render()
    const far = section('Neuer Begleiter gesucht?').querySelector('.discover-far')
    expect(far.textContent).toContain('Fips')
    expect(far.textContent).toContain('62,0 km')
  })

  test('ohne fallback kein Hinweis und keine Gruppe "Weiter weg"', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    expect(container.textContent).not.toContain('In eurer Nähe gibt es nur wenige')
    expect(container.querySelector('.discover-far')).toBeNull()
  })
})

describe('DiscoverPage – Leerzustände', () => {
  test('jeder Abschnitt hat einen eigenen Leerzustand', async () => {
    discover.mockResolvedValue(emptyResponse)
    await render()
    const hundeschulen = section('Hundeschule gesucht?')
    expect(hundeschulen.textContent).toContain('Noch keine Hundeschulen in der Nähe – schau in die Partnerliste.')
    expect(linkIn(hundeschulen, 'Partnerliste').getAttribute('href')).toBe('/partner')

    const begleiter = section('Neuer Begleiter gesucht?')
    expect(begleiter.textContent).toContain('Noch keine Tierheime oder Vermittlungsstellen in der Nähe')
    expect(linkIn(begleiter, 'Mehr in der Nähe').getAttribute('href')).toBe('/umgebung')

    expect(section('Futter-Empfehlungen').textContent).toContain('Noch keine Futter-Empfehlungen')
    expect(section('Unterstützen').textContent).toContain('Noch keine Spendenmöglichkeiten')
  })
})
