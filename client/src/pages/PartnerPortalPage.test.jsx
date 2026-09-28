// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { publicPartner, publicPartnerAnimals, publicHappyEnds, redeemVoucher, demo } = vi.hoisted(() => ({
  publicPartner: vi.fn(),
  publicPartnerAnimals: vi.fn(),
  publicHappyEnds: vi.fn(),
  redeemVoucher: vi.fn(),
  demo: vi.fn()
}))
vi.mock('../api', () => ({ api: { publicPartner, publicPartnerAnimals, publicHappyEnds, redeemVoucher, demo } }))

import PartnerPortalPage from './PartnerPortalPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  // Sinnvoller Standard, damit Tests, die die Vermittlungs-Sektion/Happy-Ends nicht betreffen, die
  // beiden nicht extra mocken müssen - Tests, die eine Liste brauchen, überschreiben das gezielt.
  publicPartnerAnimals.mockResolvedValue([])
  publicHappyEnds.mockResolvedValue([])
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
  delete document.documentElement.dataset.theme
  document.title = ''
  publicPartner.mockReset()
  publicPartnerAnimals.mockReset()
  publicHappyEnds.mockReset()
  redeemVoucher.mockReset()
  demo.mockReset()
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const slug = props?.slug || 'tierheim-sonnenhang'
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[props?.path || `/p/${slug}`]}>
        <ThemeProvider themeId="standard">
          <PartnerPortalPage slug={slug} family={null} onRedeemed={() => {}} onLogout={() => {}} {...props} />
        </ThemeProvider>
      </MemoryRouter>
    )
  )
  return container
}

const partner = {
  id: 1,
  slug: 'tierheim-sonnenhang',
  name: 'Tierheim Sonnenhang',
  typ: 'tierheim',
  plz: '10115',
  ort: 'Berlin',
  lat: 52.52,
  lon: 13.41,
  website: 'https://sonnenhang.example.org',
  kontakt_email: 'info@sonnenhang.example.org',
  kontakt_telefon: null,
  logoUrl: '/partner-media/sonnenhang.png',
  badge: 'partner',
  portal_titel: null,
  portal_text: 'Wir freuen uns über jeden Besuch.\n\nSchaut gern vorbei.',
  spenden_url: 'https://sonnenhang.example.org/spenden',
  vermittlung_url: 'https://sonnenhang.example.org/vermittlung',
  farbe: '#2f6b3f'
}

describe('PartnerPortalPage – Name, Text und Akzentfarbe', () => {
  test('rendert Name (als Willkommenstitel), Text als Absätze und setzt die Akzentfarbe als Inline-Style', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()

    expect(container.querySelector('h1').textContent).toBe('Willkommen von Tierheim Sonnenhang')
    const paragraphs = [...container.querySelectorAll('.partner-portal-text')].map((p) => p.textContent)
    expect(paragraphs).toEqual(['Wir freuen uns über jeden Besuch.', 'Schaut gern vorbei.'])

    const portalEl = container.querySelector('.partner-portal')
    expect(portalEl.style.getPropertyValue('--rust')).toBe('#2f6b3f')
    expect(portalEl.style.getPropertyValue('--on-rust')).toBe('#fffaf2')
    expect(portalEl.style.getPropertyValue('--rust-deep')).toMatch(/^#[0-9a-f]{6}$/)
    expect(portalEl.style.getPropertyValue('--rust-wash')).toMatch(/^rgba\(/)
  })

  test('nutzt portal_titel statt des Standardtitels, wenn gesetzt', async () => {
    publicPartner.mockResolvedValue({ ...partner, portal_titel: 'Schön, dass ihr da seid' })
    await render()
    expect(container.querySelector('h1').textContent).toBe('Schön, dass ihr da seid')
  })

  test('eine ungültige Farbe wird ignoriert – kein Inline-Style, keine Injektion', async () => {
    publicPartner.mockResolvedValue({ ...partner, farbe: 'expression(alert(1))' })
    await render()
    const portalEl = container.querySelector('.partner-portal')
    expect(portalEl.getAttribute('style')).toBeNull()
  })

  test('ohne Farbe (null) bleibt der Container ohne Inline-Style', async () => {
    publicPartner.mockResolvedValue({ ...partner, farbe: null })
    await render()
    expect(container.querySelector('.partner-portal').getAttribute('style')).toBeNull()
  })
})

describe('PartnerPortalPage – unbekannt oder inaktiv', () => {
  test('zeigt eine freundliche 404-Seite mit Link zur Partnerliste', async () => {
    publicPartner.mockRejectedValue(Object.assign(new Error('Diesen Partner gibt es nicht'), { status: 404 }))
    await render()

    expect(container.textContent).toContain('Diesen Partner gibt es nicht')
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Zur Partnerliste'))
    expect(link.getAttribute('href')).toBe('/partner')
  })
})

describe('PartnerPortalPage – Vorschau-Band für Admins', () => {
  test('zeigt das Vorschau-Band bei preview: true', async () => {
    publicPartner.mockResolvedValue({ ...partner, preview: true })
    await render()
    expect(container.querySelector('[role="status"]').textContent).toContain('Vorschau')
  })

  test('kein Vorschau-Band im Normalfall', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(container.querySelector('.preview-banner')).toBeNull()
  })
})

describe('PartnerPortalPage – Gutschein einlösen', () => {
  test('sendet das Formular an api.redeemVoucher und zeigt danach KeyReveal', async () => {
    publicPartner.mockResolvedValue(partner)
    redeemVoucher.mockResolvedValue({
      id: 5,
      name: 'Zuhause am Deich',
      art: 'zuhause',
      theme: 'standard',
      isDemo: false,
      home: null,
      memberships: [],
      key: 'ABCD-1234-HJKM',
      fromOthers: true
    })
    await render()

    await act(async () => {
      setInputValue(container.querySelector('#redeem-code'), 'abcd1234hjkm')
      setInputValue(container.querySelector('#redeem-name'), 'Zuhause am Deich')
    })
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    expect(redeemVoucher).toHaveBeenCalledWith(expect.objectContaining({ code: 'ABCD-1234-HJKM', name: 'Zuhause am Deich' }))
    expect(container.querySelector('.key-reveal-value').textContent).toBe('ABCD-1234-HJKM')
  })

  test('"Weiter zu Meiner Chronik" ruft onRedeemed mit den Zugangsdaten auf (ohne key/fromOthers)', async () => {
    publicPartner.mockResolvedValue(partner)
    const response = {
      id: 5,
      name: 'Zuhause am Deich',
      art: 'zuhause',
      theme: 'standard',
      isDemo: false,
      home: null,
      memberships: [],
      key: 'ABCD-1234-HJKM',
      fromOthers: true
    }
    redeemVoucher.mockResolvedValue(response)
    const onRedeemed = vi.fn()
    await render({ onRedeemed })

    await act(async () => {
      setInputValue(container.querySelector('#redeem-code'), 'abcd1234hjkm')
      setInputValue(container.querySelector('#redeem-name'), 'Zuhause am Deich')
    })
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    const continueButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Weiter zu Meiner Chronik')
    await act(async () => continueButton.click())

    const { key, fromOthers, ...me } = response
    expect(onRedeemed).toHaveBeenCalledWith(me)
  })
})

describe('PartnerPortalPage – angemeldete Besucher', () => {
  const loggedInHome = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause', isDemo: false, home: null, memberships: [] }

  test('zeigt das Portal weiterhin, ersetzt aber die Einlöse-Aktion durch "Zurück zu eurer Chronik"', async () => {
    publicPartner.mockResolvedValue(partner)
    await render({ family: loggedInHome })

    expect(container.querySelector('h1').textContent).toBe('Willkommen von Tierheim Sonnenhang')
    expect(container.querySelector('#redeem-code')).toBeNull()
    expect(container.textContent).toContain('Zuhause am Deich')

    const backButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Zurück zu eurer Chronik')
    expect(backButton).not.toBeUndefined()
    const logoutButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Abmelden und Gutschein einlösen')
    expect(logoutButton).not.toBeUndefined()
  })

  test('"Abmelden und Gutschein einlösen" ruft onLogout auf', async () => {
    publicPartner.mockResolvedValue(partner)
    const onLogout = vi.fn()
    await render({ family: loggedInHome, onLogout })

    const logoutButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Abmelden und Gutschein einlösen')
    act(() => logoutButton.click())
    expect(onLogout).toHaveBeenCalled()
  })
})

describe('PartnerPortalPage – Demo ansehen', () => {
  test('zeigt "Demo ansehen" im abgemeldeten Zustand; ein Klick ruft api.demo() und danach onRedeemed auf', async () => {
    publicPartner.mockResolvedValue(partner)
    const me = { id: 9, name: 'Demo-Zuhause', theme: 'standard', art: 'zuhause', isDemo: true, home: null, memberships: [] }
    demo.mockResolvedValue(me)
    const onRedeemed = vi.fn()
    await render({ onRedeemed })

    const demoButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === 'Demo ansehen')
    expect(demoButton).not.toBeUndefined()
    await act(async () => demoButton.click())

    expect(demo).toHaveBeenCalled()
    expect(onRedeemed).toHaveBeenCalledWith(me)
  })

  test('ein Fehler von api.demo() erscheint als Alert', async () => {
    publicPartner.mockResolvedValue(partner)
    demo.mockRejectedValue(new Error('Demo gerade nicht verfügbar'))
    await render()

    const demoButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === 'Demo ansehen')
    await act(async () => demoButton.click())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Demo gerade nicht verfügbar')
  })

  test('kein "Demo ansehen" im angemeldeten Zustand', async () => {
    publicPartner.mockResolvedValue(partner)
    const loggedInHome = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause', isDemo: false, home: null, memberships: [] }
    await render({ family: loggedInHome })

    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent.trim() === 'Demo ansehen')).toBe(false)
  })
})

describe('PartnerPortalPage – Links und Kontakt', () => {
  test('Spenden- und Vermittlungslinks öffnen extern mit rel=noopener noreferrer', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()

    const spenden = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Spenden an Tierheim Sonnenhang'))
    expect(spenden.getAttribute('href')).toBe('https://sonnenhang.example.org/spenden')
    expect(spenden.getAttribute('target')).toBe('_blank')
    expect(spenden.getAttribute('rel')).toBe('noopener noreferrer')

    const vermittlung = [...container.querySelectorAll('a')].find((a) => a.textContent.includes('Tiere in Vermittlung'))
    expect(vermittlung.getAttribute('href')).toBe('https://sonnenhang.example.org/vermittlung')
  })

  test('ein nicht-http(s) Link wird nicht gerendert', async () => {
    publicPartner.mockResolvedValue({ ...partner, spenden_url: 'javascript:alert(1)', vermittlung_url: null })
    await render()
    expect([...container.querySelectorAll('a')].some((a) => a.textContent.includes('Spenden'))).toBe(false)
  })

  test('zeigt die E-Mail-Adresse als mailto-Link', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    const mail = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === 'mailto:info@sonnenhang.example.org')
    expect(mail).not.toBeUndefined()
  })
})

describe('PartnerPortalPage – Vermittlungs-Sektion "Fellnasen/Tiere suchen ein Zuhause" (Task 5)', () => {
  const dog = {
    slug: 'pepper-ab12cd',
    name: 'Pepper',
    tierart: 'hund',
    geschlecht: 'huendin',
    rasse: 'Mischling',
    geburtsdatum: null,
    fotoUrl: null,
    vermittlung_status: 'in_vermittlung'
  }

  test('ohne Tiere in Vermittlung erscheint die Sektion gar nicht', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(container.querySelector('.partner-portal-animals')).toBeNull()
  })

  test('zeigt "Fellnasen suchen ein Zuhause" und eine Karte je Tier, wenn nur Hunde/Katzen vermittelt werden', async () => {
    publicPartner.mockResolvedValue(partner)
    publicPartnerAnimals.mockResolvedValue([dog])
    await render()

    expect(container.querySelector('.partner-portal-animals h2').textContent).toBe('Fellnasen suchen ein Zuhause')
    const link = container.querySelector('.partner-portal-animals a')
    expect(link.getAttribute('href')).toBe('/t/pepper-ab12cd')
    expect(container.textContent).toContain('Pepper')
  })

  test('zeigt "Tiere suchen ein Zuhause", sobald eine andere Tierart dabei ist', async () => {
    publicPartner.mockResolvedValue(partner)
    publicPartnerAnimals.mockResolvedValue([dog, { ...dog, slug: 'momo-ef34gh', name: 'Momo', tierart: 'anderes' }])
    await render()

    expect(container.querySelector('.partner-portal-animals h2').textContent).toBe('Tiere suchen ein Zuhause')
  })

  test('ruft api.publicPartnerAnimals ohne demo auf, wenn das Portal normal geladen wurde', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(publicPartnerAnimals).toHaveBeenCalledWith('tierheim-sonnenhang', { demo: undefined })
  })

  test('ruft api.publicPartnerAnimals mit demo=1 auf, wenn das Portal selbst mit ?demo=1 geladen wurde', async () => {
    publicPartner.mockResolvedValue(partner)
    await render({ path: '/p/tierheim-sonnenhang?demo=1' })
    expect(publicPartnerAnimals).toHaveBeenCalledWith('tierheim-sonnenhang', { demo: '1' })
  })
})

describe('PartnerPortalPage – Sektion "Happy Ends" (Task 6)', () => {
  const happyEnd = {
    name: 'Nele',
    tierart: 'hund',
    fotoUrl: '/public-media/nele.jpg',
    entry: { titel: 'Nele zieht ein – die ersten Tage', datum: '2021-06-12', text: 'Anfangs schüchtern, heute die Chefin.', fotoUrl: null }
  }

  test('ohne Happy Ends erscheint die Sektion gar nicht', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(container.querySelector('.partner-portal-happy-ends')).toBeNull()
  })

  test('zeigt "Happy Ends" mit Name, Eintragstitel/-datum und gekürztem Text je Tier', async () => {
    publicPartner.mockResolvedValue(partner)
    publicHappyEnds.mockResolvedValue([happyEnd])
    await render()

    const section = container.querySelector('.partner-portal-happy-ends')
    expect(section).not.toBeNull()
    expect(section.querySelector('h2').textContent).toBe('Happy Ends')
    expect(section.textContent).toContain('Nele')
    expect(section.textContent).toContain('Nele zieht ein – die ersten Tage')
    expect(section.textContent).toContain('Anfangs schüchtern, heute die Chefin.')
  })

  test('ruft api.publicHappyEnds ohne demo auf, wenn das Portal normal geladen wurde', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect(publicHappyEnds).toHaveBeenCalledWith('tierheim-sonnenhang', { demo: undefined })
  })

  test('ruft api.publicHappyEnds mit demo=1 auf, wenn das Portal selbst mit ?demo=1 geladen wurde', async () => {
    publicPartner.mockResolvedValue(partner)
    await render({ path: '/p/tierheim-sonnenhang?demo=1' })
    expect(publicHappyEnds).toHaveBeenCalledWith('tierheim-sonnenhang', { demo: '1' })
  })
})

describe('PartnerPortalPage – "Demo als Tierheim ansehen" (Task 6)', () => {
  test('kein Knopf, wenn der Partner nicht demo-fähig ist', async () => {
    publicPartner.mockResolvedValue(partner)
    await render()
    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent.trim() === 'Demo als Tierheim ansehen')).toBe(false)
  })

  test('zeigt den Knopf für einen demo-fähigen Partner; ein Klick ruft api.demo({ as: "tierheim" }) und onRedeemed auf', async () => {
    publicPartner.mockResolvedValue({ ...partner, shelterDemo: true })
    const me = { id: 9, name: 'Tierheim Sonnenhang', theme: 'standard', art: 'tierheim', isDemo: true, home: null, memberships: [] }
    demo.mockResolvedValue(me)
    const onRedeemed = vi.fn()
    await render({ onRedeemed })

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === 'Demo als Tierheim ansehen')
    expect(button).not.toBeUndefined()
    await act(async () => button.click())

    expect(demo).toHaveBeenCalledWith({ as: 'tierheim' })
    expect(onRedeemed).toHaveBeenCalledWith(me)
  })

  test('ein Fehler von api.demo() erscheint als Alert', async () => {
    publicPartner.mockResolvedValue({ ...partner, shelterDemo: true })
    demo.mockRejectedValue(new Error('Demo gerade nicht verfügbar'))
    await render()

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === 'Demo als Tierheim ansehen')
    await act(async () => button.click())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Demo gerade nicht verfügbar')
  })

  test('kein Knopf im angemeldeten Zustand', async () => {
    publicPartner.mockResolvedValue({ ...partner, shelterDemo: true })
    const loggedInHome = { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause', isDemo: false, home: null, memberships: [] }
    await render({ family: loggedInHome })

    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent.trim() === 'Demo als Tierheim ansehen')).toBe(false)
  })
})
