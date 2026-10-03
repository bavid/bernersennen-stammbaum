// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listDogs: vi.fn(),
  previewDiscover: vi.fn(),
  previewPortal: vi.fn(),
  previewAnimal: vi.fn()
}))
vi.mock('../api', () => ({
  api: {
    listDogs: mocks.listDogs,
    partnerArea: { previewDiscover: mocks.previewDiscover, previewPortal: mocks.previewPortal, previewAnimal: mocks.previewAnimal }
  }
}))

import CustomerViewPage from './CustomerViewPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const { listDogs, previewDiscover, previewPortal, previewAnimal } = mocks

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set

// Fiktive Partner-Bereiche (me) - art 'partner' (Hundeschule) bzw. 'tierheim'.
const schoolArea = {
  id: 30,
  name: 'Hundeschule Wiesengrund',
  art: 'partner',
  partner: { id: 4, slug: 'hundeschule-wiesengrund', name: 'Hundeschule Wiesengrund', typ: 'hundeschule', status: 'aktiv', gesperrt: false }
}

const shelterArea = {
  id: 5,
  name: 'Tierheim Sonnenhang',
  art: 'tierheim',
  partner: { id: 1, slug: 'tierheim-sonnenhang', name: 'Tierheim Sonnenhang', typ: 'tierheim', status: 'entwurf', gesperrt: false }
}

const ownCard = {
  id: 4,
  kind: 'partner',
  slug: 'hundeschule-wiesengrund',
  name: 'Hundeschule Wiesengrund',
  typ: 'hundeschule',
  plz: '20095',
  ort: 'Hamburg',
  lat: 53.55,
  lon: 10.0,
  logoUrl: null,
  badge: 'partner',
  url: 'https://wiesengrund.example.org',
  clickUrl: '/r/partner-website/4',
  teaserFoto: '/uploads/44444444-4444-4444-4444-444444444444.jpg',
  einblicke: [{ id: 5, fotoUrl: '/uploads/44444444-4444-4444-4444-444444444444.jpg', datum: '2026-09-20', text: 'Welpengruppe' }],
  anzeigen: [{ id: 21, kind: 'promotion', kennzeichnung: 'Anzeige', titel: 'Welpenkurs', text: null, vorschau: true, freigabe: 'eingereicht', clickUrl: null }],
  vorschau: true
}

const otherCard = {
  ...ownCard,
  id: 8,
  slug: 'hundeschule-birkenweg',
  name: 'Hundeschule Birkenweg',
  clickUrl: '/r/partner-website/8',
  teaserFoto: '/public-media/88888888-8888-8888-8888-888888888888.jpg',
  einblicke: [],
  anzeigen: [],
  vorschau: undefined
}

const discoverResponse = {
  hundeschulen: [ownCard, otherCard],
  begleiter: { partner: [], tiere: [], promotions: [] },
  futter: [
    { id: 20, kind: 'promotion', kennzeichnung: 'Empfehlung', titel: 'Trockenfutter Wiese', text: null, bildUrl: null, clickUrl: '/r/promotion/20' }
  ],
  unterstuetzen: { gofundmeClickUrl: '/r/gofundme/1', text: 'Helft mit!', bericht: null, partnerSpenden: [], promotions: [] },
  fallback: { hundeschulen: false, begleiter: false }
}

const portalResponse = {
  id: 4,
  slug: 'hundeschule-wiesengrund',
  name: 'Hundeschule Wiesengrund',
  typ: 'hundeschule',
  website: 'https://wiesengrund.example.org',
  kontakt_email: 'hallo@wiesengrund.example.org',
  kontakt_telefon: null,
  logoUrl: null,
  portal_titel: 'Willkommen in der Hundeschule Wiesengrund',
  portal_text: 'Kurse für jedes Alter.',
  spenden_url: null,
  vermittlung_url: null,
  farbe: null,
  einblicke: [{ id: 3, fotoUrl: '/uploads/33333333-3333-3333-3333-333333333333.jpg', datum: '2026-09-12', text: 'Welpengruppe' }],
  tiere: [],
  vorschau: true,
  status: 'aktiv'
}

beforeEach(() => {
  window.localStorage.clear()
  previewDiscover.mockResolvedValue(discoverResponse)
  previewPortal.mockResolvedValue(portalResponse)
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
  for (const mock of Object.values(mocks)) mock.mockReset()
  window.localStorage.clear()
})

let location
let navigate

function Probe() {
  location = useLocation()
  navigate = useNavigate()
  return null
}

async function render(family = schoolArea, path = '/kundensicht') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider themeId="standard">
          <CustomerViewPage family={family} />
          <Probe />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

function tabLabels() {
  return [...container.querySelectorAll('.customer-view-tabs button')].map((btn) => btn.textContent)
}

function tab(label) {
  return [...container.querySelectorAll('.customer-view-tabs button')].find((btn) => btn.textContent === label)
}

function frame() {
  return container.querySelector('.preview-frame-screen')
}

describe('CustomerViewPage – Banner', () => {
  test('aktiv und nicht gesperrt: nur "Vorschau – so sehen Kunden euer Profil"', async () => {
    await render()

    const banner = container.querySelector('.customer-view-banner')
    expect(banner.textContent).toBe('Vorschau – so sehen Kunden euer Profil')
    expect(banner.classList.contains('is-not-public')).toBe(false)
  })

  test.each([
    ['Entwurf', { status: 'entwurf', gesperrt: false }],
    ['pausiert', { status: 'pausiert', gesperrt: false }],
    ['gesperrt', { status: 'aktiv', gesperrt: true }]
  ])('%s: zusätzlich "Noch nicht öffentlich sichtbar."', async (_label, state) => {
    await render({ ...schoolArea, partner: { ...schoolArea.partner, ...state } })

    const banner = container.querySelector('.customer-view-banner')
    expect(banner.textContent).toBe('Vorschau – so sehen Kunden euer Profil Noch nicht öffentlich sichtbar.')
    expect(banner.classList.contains('is-not-public')).toBe(true)
  })
})

describe('CustomerViewPage – Reiter', () => {
  test('Partner sehen "Entdecken (Beispiel-Kunde)" und "Euer Portal", aber keine Steckbriefe', async () => {
    await render()

    expect(container.querySelector('h1').textContent).toBe('Kundensicht')
    expect(tabLabels()).toEqual(['Entdecken (Beispiel-Kunde)', 'Euer Portal'])
    expect(tab('Entdecken (Beispiel-Kunde)').getAttribute('aria-pressed')).toBe('true')
  })

  test('Tierheime sehen zusätzlich "Steckbriefe"', async () => {
    listDogs.mockResolvedValue([])
    await render(shelterArea)
    expect(tabLabels()).toEqual(['Entdecken (Beispiel-Kunde)', 'Euer Portal', 'Steckbriefe'])
  })

  test('der Rahmen zeigt die Beispiel-Kundin und eine rein dekorative Leiste mit "Entdecken" aktiv', async () => {
    await render()

    expect(container.querySelector('.preview-frame-customer').textContent).toBe('Zuhause am Deich (Beispiel)')
    expect(container.querySelector('.preview-frame-label').textContent).toBe('Vorschau')
    const nav = container.querySelector('.preview-frame-nav')
    expect(nav.getAttribute('aria-hidden')).toBe('true')
    expect(nav.querySelectorAll('a, button, [tabindex]')).toHaveLength(0)
    expect([...nav.children].map((item) => item.textContent)).toEqual(['Wegbegleiter', 'Familienbande', 'Pinnwand', 'Entdecken', 'Collage'])
    expect(nav.querySelector('.is-active').textContent).toBe('Entdecken')
  })
})

describe('CustomerViewPage – Entdecken (Beispiel-Kunde)', () => {
  test('lädt über die Vorschau: die eigene Karte steht vorn mit "Das seid ihr", eigenen Einblicken (/uploads) und eingereichter Anzeige', async () => {
    await render()

    expect(previewDiscover).toHaveBeenCalledWith({})
    const cards = [...frame().querySelectorAll('#entdecken-hundeschulen .partner-card')]
    expect(cards.map((card) => card.querySelector('h3').textContent)).toEqual(['Hundeschule Wiesengrund', 'Hundeschule Birkenweg'])
    expect(cards[0].classList.contains('is-own-preview')).toBe(true)
    expect(cards[0].querySelector('.preview-own-badge').textContent).toBe('Das seid ihr')
    expect(cards[0].querySelector('.partner-discover-einblicke img').getAttribute('src')).toBe('/uploads/44444444-4444-4444-4444-444444444444.jpg')
    expect(cards[0].querySelector('.partner-discover-ads').textContent).toContain('Wartet auf Freigabe')
    expect(cards[1].querySelector('.preview-own-badge')).toBeNull()
  })

  test('alle Links (Website, Portal, Karten, Empfehlungen, Spenden, Partnerliste) sind deaktiviert', async () => {
    await render()

    expect(frame().querySelectorAll('a')).toHaveLength(0)
    expect([...frame().querySelectorAll('[aria-disabled="true"]')].map((el) => el.textContent.trim())).toEqual(
      expect.arrayContaining(['Zum Portal', 'Website'])
    )
    // "Alle" zeigt auch Futter und Unterstützen - dort ebenso nichts anklickbar.
    await act(async () => frame().querySelector('#discover-tab-alle').click())
    expect(frame().querySelectorAll('a')).toHaveLength(0)
    const disabled = [...frame().querySelectorAll('[aria-disabled="true"]')]
    expect(disabled.map((el) => el.textContent.trim())).toEqual(
      expect.arrayContaining(['Zum Portal', 'Website', 'Über GoFundMe unterstützen (öffnet in neuem Tab)'])
    )
    for (const el of disabled) expect(el.getAttribute('title')).toBe('In der Vorschau deaktiviert')
  })

  test('die PLZ-Suche fragt die Vorschau mit PLZ und Umkreis an', async () => {
    await render()
    previewDiscover.mockClear()

    await act(async () => container.querySelector('.location-summary-toggle').click())
    await act(async () => {
      const input = container.querySelector('#location-plz')
      nativeInputValueSetter.call(input, '20095')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => container.querySelector('.location-picker').requestSubmit())

    expect(previewDiscover).toHaveBeenCalledWith({ plz: '20095', radius: 25 })
  })

  test('zeigt vorschauHinweis, wenn der Typ keinen eigenen Abschnitt hat', async () => {
    previewDiscover.mockResolvedValue({ ...discoverResponse, hundeschulen: [otherCard], vorschauHinweis: 'Euer Profil erscheint in der Partnerliste und auf eurem Portal.' })
    await render()

    expect(frame().querySelector('.preview-hint').textContent).toBe('Euer Profil erscheint in der Partnerliste und auf eurem Portal.')
  })
})

describe('CustomerViewPage – Entdecken öffnet im eigenen Bereich', () => {
  function selectedDiscoverTab() {
    return frame().querySelector('.discover-tabs [aria-selected="true"]').firstChild.textContent
  }

  test('Hundeschule: Reiter "Hundeschulen" statt "Alle", die eigene Karte markiert vorn', async () => {
    await render()
    expect(selectedDiscoverTab()).toBe('Hundeschulen')
    const first = frame().querySelector('.partner-card')
    expect(first.classList.contains('is-own-preview')).toBe(true)
    expect(first.querySelector('h3').textContent).toBe('Hundeschule Wiesengrund')
  })

  test.each([
    ['hundesalon', 'Salon & Betreuung'],
    ['betreuung', 'Salon & Betreuung'],
    ['tierheim', 'Neue Begleiter'],
    ['vermittlung', 'Neue Begleiter'],
    ['futter', 'Alle'],
    ['sonstige', 'Alle']
  ])('Typ %s öffnet "%s"', async (typ, label) => {
    listDogs.mockResolvedValue([])
    await render({ ...schoolArea, partner: { ...schoolArea.partner, typ } })
    expect(selectedDiscoverTab()).toBe(label)
  })
})

describe('CustomerViewPage – Adresse', () => {
  test('?ansicht=portal&reiter=termine öffnet das Portal im Reiter Termine', async () => {
    previewPortal.mockResolvedValue({
      ...portalResponse,
      termine: [{ terminId: 1, datum: '2099-05-02', uhrzeit: '10:00', ende: null, titel: 'Welpenspielstunde', ort: null, serie: 'keine' }]
    })
    await render(schoolArea, '/kundensicht?ansicht=portal&reiter=termine')

    expect(tab('Euer Portal').getAttribute('aria-pressed')).toBe('true')
    expect(frame().querySelector('[role="tab"][aria-selected="true"]').firstChild.textContent).toBe('Termine')
  })

  test('der Wechsel der Vorschau steht in der Adresse, der Portal-Reiter fällt dabei weg - Zurück führt zurück', async () => {
    await render()
    await act(async () => tab('Euer Portal').click())
    expect(location.search).toBe('?ansicht=portal')
    await act(async () => frame().querySelector('#portal-tab-einblicke').click())
    expect(location.search).toBe('?ansicht=portal&reiter=einblicke')

    await act(async () => tab('Entdecken (Beispiel-Kunde)').click())
    expect(location.search).toBe('')
    await act(async () => navigate(-1))
    expect(tab('Euer Portal').getAttribute('aria-pressed')).toBe('true')
    expect(frame().querySelector('[role="tab"][aria-selected="true"]').firstChild.textContent).toBe('Einblicke')
  })

  test('?ansicht=steckbriefe ohne Tierheim zeigt "Entdecken"', async () => {
    await render(schoolArea, '/kundensicht?ansicht=steckbriefe')
    expect(tab('Entdecken (Beispiel-Kunde)').getAttribute('aria-pressed')).toBe('true')
  })
})

describe('CustomerViewPage – Rahmen ohne eigenen Scrollbereich', () => {
  test('der Inhalt steht in einer benannten Region, die nicht mehr in sich scrollt (kein Tab-Stopp dafür)', async () => {
    await render()
    const screen = frame()
    expect(screen.getAttribute('role')).toBe('region')
    expect(screen.getAttribute('aria-label')).toBe('Entdecken aus Sicht einer Beispiel-Kundin (Vorschau)')
    expect(screen.hasAttribute('tabindex')).toBe(false)
  })
})

describe('CustomerViewPage – Euer Portal', () => {
  test('rendert das eigene Portal aus der Vorschau, mit Einblick-Fotos über /uploads und ohne aktive Links', async () => {
    await render()
    await act(async () => tab('Euer Portal').click())

    expect(tab('Euer Portal').getAttribute('aria-pressed')).toBe('true')
    expect(previewPortal).toHaveBeenCalledTimes(1)
    expect(frame().querySelector('h1').textContent).toBe('Hundeschule Wiesengrund')
    expect(frame().querySelector('.partner-portal-tagline').textContent).toBe('Willkommen in der Hundeschule Wiesengrund')
    expect(frame().querySelector('.einblick-tile img').getAttribute('src')).toBe('/uploads/33333333-3333-3333-3333-333333333333.jpg')
    expect(frame().querySelectorAll('a')).toHaveLength(0)
    expect(frame().querySelector('form')).toBeNull()
    // Audit V7a: das Portal ist eine öffentliche Seite - ohne die App-Leiste mit "Entdecken" aktiv.
    expect(container.querySelector('.preview-frame-nav')).toBeNull()
  })
})

describe('CustomerViewPage – Steckbriefe (Tierheim)', () => {
  const dogs = [
    { id: 12, name: 'Pepper', public_slug: 'pepper-ab12' },
    { id: 11, name: 'Benno', public_slug: null },
    { id: 13, name: 'Luna', shared_from: 'Zuhause am Deich' }
  ]

  function steckbrief(name, fotoUrl) {
    return {
      name,
      tierart: 'hund',
      geschlecht: 'ruede',
      rasse: 'Mischling',
      geburtsdatum: null,
      beschreibung: null,
      fotoUrl,
      vermittlung_status: 'in_vermittlung',
      entries: [],
      shelter: { name: 'Tierheim Sonnenhang', slug: 'tierheim-sonnenhang', website: 'https://sonnenhang.example.org', kontakt_email: null, kontakt_telefon: null, vermittlung_url: null, logoUrl: null },
      vorschau: true
    }
  }

  test('listet nur eigene Tiere, zeigt den Steckbrief des ersten und wechselt bei Auswahl', async () => {
    listDogs.mockResolvedValue(dogs)
    previewAnimal.mockImplementation((id) =>
      Promise.resolve(id === '11' ? steckbrief('Benno', '/uploads/11111111-1111-1111-1111-111111111111.jpg') : steckbrief('Pepper', null))
    )
    await render(shelterArea)
    await act(async () => tab('Steckbriefe').click())

    const options = [...container.querySelectorAll('#customer-view-animal option')].map((o) => o.textContent)
    expect(options).toEqual(['Benno (noch nicht veröffentlicht)', 'Pepper'])
    expect(previewAnimal).toHaveBeenCalledWith('11')
    expect(frame().querySelector('h1').textContent).toBe('Benno')
    expect(frame().querySelector('.dog-hero-photo img').getAttribute('src')).toBe('/uploads/11111111-1111-1111-1111-111111111111.jpg')
    expect(container.textContent).toContain('Dieser Steckbrief ist noch nicht veröffentlicht')
    // Teilen und Links sind in der Vorschau aus - auch der Kopf mit "Zurück" (PublicHeader) fehlt.
    expect(frame().querySelector('.public-header')).toBeNull()
    expect(frame().querySelectorAll('a')).toHaveLength(0)
    expect([...frame().querySelectorAll('button')].find((btn) => btn.textContent.includes('Teilen')).disabled).toBe(true)

    await act(async () => {
      const select = container.querySelector('#customer-view-animal')
      nativeSelectValueSetter.call(select, '12')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(previewAnimal).toHaveBeenLastCalledWith('12')
    expect(frame().querySelector('h1').textContent).toBe('Pepper')
    // Audit V7a: der Steckbrief ist eine öffentliche Seite - ohne die App-Leiste mit "Entdecken" aktiv.
    expect(container.querySelector('.preview-frame-nav')).toBeNull()
    expect(container.textContent).not.toContain('Dieser Steckbrief ist noch nicht veröffentlicht')
  })

  test('ohne eigene Tiere ein Hinweis statt eines leeren Rahmens', async () => {
    listDogs.mockResolvedValue([{ id: 13, name: 'Luna', shared_from: 'Zuhause am Deich' }])
    await render(shelterArea)
    await act(async () => tab('Steckbriefe').click())

    expect(container.querySelector('.preview-frame')).toBeNull()
    expect(container.querySelector('.customer-view-empty').textContent).toContain('Noch keine Tiere angelegt')
  })
})
