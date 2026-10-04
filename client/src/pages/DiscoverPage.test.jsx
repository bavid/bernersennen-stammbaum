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

// path: z. B. '/entdecken?bereich=begleiter' - öffnet gleich den Reiter eines Bereichs (Phase U).
async function render(path = '/entdecken') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
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

// Empfehlungen der Bereiche "begleiter" und "unterstuetzen" - je eine Anzeige (rel="sponsored") und eine
// Partner-/Empfehlungs-Karte ohne sponsored.
const begleiterPromotions = [
  promotion({ id: 30, bereich: 'begleiter', kennzeichnung: 'Partner', empfohlenVon: null, titel: 'Patenschaft für Senioren-Hunde', clickUrl: '/r/promotion/30' }),
  promotion({ id: 31, bereich: 'begleiter', kennzeichnung: 'Anzeige', empfohlenVon: null, titel: 'Leinenwerk Starterset', clickUrl: '/r/promotion/31' })
]
const unterstuetzenPromotions = [
  promotion({ id: 40, bereich: 'unterstuetzen', kennzeichnung: 'Empfehlung', empfohlenVon: 'Familie auf Pfoten', titel: 'Futterspende fürs Tierheim', clickUrl: '/r/promotion/40' }),
  promotion({ id: 41, bereich: 'unterstuetzen', kennzeichnung: 'Anzeige', empfohlenVon: null, titel: 'Spendenlauf Mühlental', clickUrl: '/r/promotion/41' })
]

const fullResponse = {
  fallback: { hundeschulen: false, begleiter: false },
  hundeschulen: [partner(), promotion({ id: 21, bereich: 'hundeschule', kennzeichnung: 'Partner', empfohlenVon: null, titel: 'Welpenkurs im Herbst', clickUrl: '/r/promotion/21' })],
  begleiter: {
    partner: [partner({ id: 3, slug: 'tierheim-birkenweg', name: 'Tierheim Birkenweg', typ: 'tierheim', clickUrl: '/r/partner-website/3' })],
    tiere: [tier],
    promotions: begleiterPromotions
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
    partnerSpenden: [{ id: 3, slug: 'tierheim-birkenweg', name: 'Tierheim Birkenweg', logoUrl: null, url: 'https://example.org/s', clickUrl: '/r/partner-spende/3' }],
    promotions: unterstuetzenPromotions
  }
}

const emptyResponse = {
  fallback: { hundeschulen: false, begleiter: false },
  hundeschulen: [],
  begleiter: { partner: [], tiere: [], promotions: [] },
  futter: [],
  unterstuetzen: { gofundmeUrl: null, gofundmeClickUrl: null, text: null, bericht: null, partnerSpenden: [], promotions: [] }
}

function section(titleText) {
  return [...container.querySelectorAll('section[aria-labelledby]')].find(
    (el) => document.getElementById(el.getAttribute('aria-labelledby'))?.textContent === titleText
  )
}

function linkIn(el, text) {
  return [...el.querySelectorAll('a')].find((a) => a.textContent.includes(text))
}

function cardIn(el, title) {
  return [...el.querySelectorAll('.promotion-card')].find((card) => card.querySelector('h3')?.textContent === title)
}

// true, wenn a im Dokument vor b steht
function isBefore(a, b) {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

function tabButton(label) {
  return [...container.querySelectorAll('[role="tab"]')].find((tab) => tab.firstChild.textContent === label)
}

async function openTab(label) {
  await act(async () => tabButton(label).click())
}

// Phase V1: die Ortswahl ist zugeklappt - erst "ändern"/"Ort wählen", dann die Eingabe.
async function openLocationPicker() {
  if (container.querySelector('#location-plz')) return
  await act(async () => container.querySelector('.location-summary-toggle').click())
}

async function submitPlz(value, radius) {
  await openLocationPicker()
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
  test('zeigt die Überschrift "Entdecken" und den PLZ-/Umkreis-Wähler (aufgeklappt über die Ortszeile)', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    expect(container.querySelector('h1').textContent).toBe('Entdecken')
    expect(container.querySelector('#location-plz')).toBeNull()
    await openLocationPicker()
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
    await openLocationPicker()
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
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(7)
    expect(container.querySelector('[role="tabpanel"]').textContent).toContain('Hier ist gerade noch nichts')
  })
})

describe('DiscoverPage – Kapitel', () => {
  test('"Alle" zeigt jeden Bereich mit Inhalt als Landmark mit Überschrift - leere (hier Salon) bleiben weg', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    const titles = [...container.querySelectorAll('section[aria-labelledby] h2')].map((h) => h.textContent)
    expect(titles).toEqual(['Hundeschulen', 'Neue Begleiter', 'Futter', 'Unterstützen'])
  })

  test('Hundeschulen: Partnerkarte mit Portal-Link und Empfehlung als PromotionCard', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    const el = section('Hundeschulen')
    expect(el.textContent).toContain('Hundeschule Wiesengrund')
    expect(linkIn(el, 'Zum Portal').getAttribute('href')).toBe('/p/hundeschule-wiesengrund')
    expect(el.querySelector('.promotion-card h3').textContent).toBe('Welpenkurs im Herbst')
  })

  // Phase W, Schritt 2: kein Link "Mehr in der Nähe" mehr - dafür der Reiter "Karte".
  test('Begleiter: Tierheim, Tierkarte → /t/:slug, Hinweis ohne Züchter, kein Link auf /umgebung', async () => {
    discover.mockResolvedValue(fullResponse)
    await render('/entdecken?bereich=begleiter')
    const el = section('Neue Begleiter')
    expect(el.textContent).toContain('Tierheim Birkenweg')
    expect(linkIn(el, 'Fips').getAttribute('href')).toBe('/t/fips-ab12cd')
    expect(el.textContent).toContain('Hier findet ihr nur Tierheime und Vermittlungsstellen – keine Züchter.')
    expect(el.querySelector('a[href="/umgebung"]')).toBeNull()
  })

  test('Futter: Anzeigen-Links tragen sponsored, Empfehlungen nicht', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    const el = section('Futter')
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

  test('Unterstützen: GoFundMe-Knopf und deutsch formatierte Beträge (im eigenen Reiter)', async () => {
    discover.mockResolvedValue(fullResponse)
    await render('/entdecken?bereich=unterstuetzen')
    const el = section('Unterstützen')
    expect(linkIn(el, 'GoFundMe').getAttribute('href')).toBe('/r/gofundme/0')
    const text = plain(el.textContent)
    expect(text).toContain('1.250,00 €')
    expect(text).toContain('180,00 €')
    expect(text).toContain('1.000,00 €')
    expect(text).toContain('2026 Q3')
  })
})

describe('DiscoverPage – Empfehlungen bei Begleiter und Unterstützen', () => {
  test('Begleiter: Empfehlungen als PromotionCard nach Tierheim und Tieren', async () => {
    discover.mockResolvedValue(fullResponse)
    await render('/entdecken?bereich=begleiter')
    const el = section('Neue Begleiter')
    const cards = [...el.querySelectorAll('.promotion-card h3')].map((h) => h.textContent)
    expect(cards).toEqual(['Patenschaft für Senioren-Hunde', 'Leinenwerk Starterset'])

    const patenschaft = cardIn(el, 'Patenschaft für Senioren-Hunde')
    expect(isBefore(linkIn(el, 'Fips'), patenschaft)).toBe(true)
    expect(isBefore(el.querySelector('.partner-card'), patenschaft)).toBe(true)
  })

  test('Begleiter: Kennzeichnung wie bei Futter - Anzeige mit sponsored, Partner ohne', async () => {
    discover.mockResolvedValue(fullResponse)
    await render('/entdecken?bereich=begleiter')
    const el = section('Neue Begleiter')
    const anzeige = cardIn(el, 'Leinenwerk Starterset')
    expect(anzeige.querySelector('.promotion-badge').textContent).toBe('Anzeige')
    expect(linkIn(anzeige, 'Mehr erfahren').getAttribute('rel')).toBe('sponsored noopener noreferrer')
    expect(linkIn(anzeige, 'Mehr erfahren').getAttribute('href')).toBe('/r/promotion/31')

    const partnerCard = cardIn(el, 'Patenschaft für Senioren-Hunde')
    expect(partnerCard.querySelector('.promotion-badge').textContent).toBe('Partner')
    expect(linkIn(partnerCard, 'Mehr erfahren').getAttribute('rel')).not.toContain('sponsored')
  })

  test('Unterstützen: Empfehlungen unter dem GoFundMe-Aufruf; Anzeige mit sponsored, Empfehlung nennt die empfehlende Stelle', async () => {
    discover.mockResolvedValue(fullResponse)
    await render()
    const el = section('Unterstützen')
    const cards = [...el.querySelectorAll('.promotion-card h3')].map((h) => h.textContent)
    expect(cards).toEqual(['Futterspende fürs Tierheim', 'Spendenlauf Mühlental'])
    expect(isBefore(linkIn(el, 'GoFundMe'), cardIn(el, 'Futterspende fürs Tierheim'))).toBe(true)

    const anzeige = cardIn(el, 'Spendenlauf Mühlental')
    expect(anzeige.querySelector('.promotion-badge').textContent).toBe('Anzeige')
    expect(linkIn(anzeige, 'Mehr erfahren').getAttribute('rel')).toBe('sponsored noopener noreferrer')

    const empfehlung = cardIn(el, 'Futterspende fürs Tierheim')
    expect(empfehlung.querySelector('.promotion-badge').textContent).toBe('Empfehlung von Familie auf Pfoten')
    expect(linkIn(empfehlung, 'Mehr erfahren').getAttribute('rel')).not.toContain('sponsored')
    expect(linkIn(empfehlung, 'Mehr erfahren').getAttribute('href')).toBe('/r/promotion/40')
  })

  test('Begleiter mit Umkreis-Fallback: Empfehlungen stehen nicht unter "Weiter weg"', async () => {
    discover.mockResolvedValue({
      ...fullResponse,
      fallback: { hundeschulen: false, begleiter: true },
      begleiter: {
        partner: [partner({ id: 3, slug: 'tierheim-birkenweg', name: 'Tierheim Birkenweg', typ: 'tierheim', distanceKm: 62, ausserhalb: true })],
        tiere: [{ ...tier, distanceKm: 62, ausserhalb: true }],
        promotions: begleiterPromotions
      }
    })
    await render('/entdecken?bereich=begleiter')
    const el = section('Neue Begleiter')
    const far = el.querySelector('.discover-far')
    expect(far.querySelector('.promotion-card')).toBeNull()
    expect(isBefore(cardIn(el, 'Leinenwerk Starterset'), far)).toBe(true)
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
    const el = section('Hundeschulen')
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
    expect(section('Hundeschulen').textContent).toContain(note)
    expect(section('Neue Begleiter').textContent).toContain(note)
    expect(section('Futter').textContent).not.toContain(note)
  })

  test('Tiere außerhalb landen ebenfalls unter "Weiter weg"', async () => {
    discover.mockResolvedValue(fallbackResponse)
    await render('/entdecken?bereich=begleiter')
    const far = section('Neue Begleiter').querySelector('.discover-far')
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
  test('jeder Bereich hat in seinem Reiter einen eigenen Leerzustand', async () => {
    discover.mockResolvedValue(emptyResponse)
    await render()
    expect(container.querySelector('.promotion-card')).toBeNull()

    await openTab('Hundeschulen')
    const hundeschulen = section('Hundeschulen')
    expect(hundeschulen.textContent).toContain('Noch keine Hundeschulen in der Nähe – schaut in die Partnerliste.')
    expect(linkIn(hundeschulen, 'Partnerliste').getAttribute('href')).toBe('/partner')

    await openTab('Neue Begleiter')
    const begleiter = section('Neue Begleiter')
    expect(begleiter.textContent).toContain('Noch keine Tierheime oder Vermittlungsstellen in der Nähe – schaut in die Partnerliste.')

    await openTab('Futter')
    expect(section('Futter').textContent).toContain('Noch keine Futter-Empfehlungen – schaut bald wieder vorbei.')
    await openTab('Unterstützen')
    expect(section('Unterstützen').textContent).toContain('Noch keine Spendenmöglichkeiten hinterlegt – schaut in die Partnerliste.')
  })

  test('Begleiter nur mit Empfehlungen: kein Leerzustand, die Empfehlungen bleiben', async () => {
    discover.mockResolvedValue({ ...emptyResponse, begleiter: { partner: [], tiere: [], promotions: begleiterPromotions } })
    await render()
    const el = section('Neue Begleiter')
    expect(el.textContent).not.toContain('Noch keine Tierheime oder Vermittlungsstellen')
    expect(cardIn(el, 'Patenschaft für Senioren-Hunde')).toBeDefined()
  })

  test('Unterstützen nur mit Empfehlungen: kein Leerzustand, die Empfehlungen werden gezeigt', async () => {
    discover.mockResolvedValue({ ...emptyResponse, unterstuetzen: { ...emptyResponse.unterstuetzen, promotions: unterstuetzenPromotions } })
    await render()
    const el = section('Unterstützen')
    expect(el.textContent).not.toContain('Noch keine Spendenmöglichkeiten')
    expect(cardIn(el, 'Futterspende fürs Tierheim')).toBeDefined()
    expect(el.querySelector('.support-cta')).toBeNull()
  })
})

describe('DiscoverPage – Ansprache', () => {
  test('spricht in der ihr-Form (keine du-Form in Hinweisen und Leerzuständen)', async () => {
    discover.mockResolvedValue(emptyResponse)
    await render()
    expect(container.textContent).not.toMatch(/findest du|\bschau (in|bald)\b/)
  })
})

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function responseWithSchool(name) {
  return { ...emptyResponse, hundeschulen: [partner({ name })] }
}

describe('DiscoverPage – überlappende Suchen (Race Condition)', () => {
  test('antwortet die ältere Suche zuletzt, bleibt das Ergebnis der zuletzt abgeschickten stehen', async () => {
    const older = deferred()
    const newer = deferred()
    discover.mockResolvedValueOnce(emptyResponse).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    await render()

    await submitPlz('20095')
    await submitPlz('20097')
    expect(discover).toHaveBeenNthCalledWith(2, { plz: '20095', radius: 25 })
    expect(discover).toHaveBeenNthCalledWith(3, { plz: '20097', radius: 25 })

    await act(async () => newer.resolve(responseWithSchool('Hundeschule Neuland')))
    await act(async () => older.resolve(responseWithSchool('Hundeschule Altmarkt')))

    const text = section('Hundeschulen').textContent
    expect(text).toContain('Hundeschule Neuland')
    expect(text).not.toContain('Hundeschule Altmarkt')
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  test('ein verspäteter Fehler der älteren Suche überschreibt das neuere Ergebnis nicht', async () => {
    const older = deferred()
    const newer = deferred()
    discover.mockResolvedValueOnce(emptyResponse).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    await render()

    await submitPlz('20095')
    await submitPlz('20097')
    await act(async () => newer.resolve(responseWithSchool('Hundeschule Neuland')))
    await act(async () => older.reject(Object.assign(new Error('Fehler 500'), { status: 500 })))

    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(section('Hundeschulen').textContent).toContain('Hundeschule Neuland')
  })
})
