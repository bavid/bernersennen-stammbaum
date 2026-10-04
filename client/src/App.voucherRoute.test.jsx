// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, logout, login, redeemVoucher, listDogs, checkVoucher, claimVoucher, getDog, listTimeline, listBreedingEvents, listAllDogs } =
  vi.hoisted(() => ({
    me: vi.fn(),
    logout: vi.fn(),
    login: vi.fn(),
    redeemVoucher: vi.fn(),
    listDogs: vi.fn(),
    checkVoucher: vi.fn(),
    claimVoucher: vi.fn(),
    // Nur für den Claim-Test unten gebraucht: nach api.claimVoucher navigiert App.jsx zu /tier/:id, das
    // holt seine eigenen Daten - ohne diese Mocks würde DogDetailPage dort auf ein undefiniertes
    // api.getDog treffen und nur eine Fehlerseite zeigen, statt sauber wegzunavigieren.
    getDog: vi.fn(),
    listTimeline: vi.fn(),
    listBreedingEvents: vi.fn(),
    listAllDogs: vi.fn()
  }))
vi.mock('./api', () => ({
  api: { me, logout, login, redeemVoucher, listDogs, checkVoucher, claimVoucher, getDog, listTimeline, listBreedingEvents, listAllDogs },
  setUnauthorizedHandler: () => {}
}))

import App from './App.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const loggedInHome = {
  id: 1,
  name: 'Zuhause am Deich',
  theme: 'standard',
  art: 'zuhause',
  isDemo: false,
  home: null,
  memberships: []
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

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
  window.history.replaceState(null, '', '/')
  me.mockReset()
  logout.mockReset()
  login.mockReset()
  redeemVoucher.mockReset()
  listDogs.mockReset()
  checkVoucher.mockReset()
  claimVoucher.mockReset()
  getDog.mockReset()
  listTimeline.mockReset()
  listBreedingEvents.mockReset()
  listAllDogs.mockReset()
  vi.restoreAllMocks()
})

async function render(initialEntry) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    )
  )
  return container
}

describe('Route /v – Gutschein aus einem Link einlösen', () => {
  test('ohne Sitzung: zeigt die Login-Seite im Einlöse-Modus mit vorausgefülltem Code aus dem Hash', async () => {
    me.mockRejectedValue(new Error('401'))
    await render('/v#abcd1234hjkm')

    expect(container.querySelector('[aria-label="Modus"] button[aria-pressed="true"]').textContent).toBe('Einladungscode einlösen')
    expect(container.querySelector('#redeem-code').value).toBe('ABCD-1234-HJKM')
  })

  test('entfernt den Code sofort aus der Adressleiste, noch bevor /api/me antwortet', async () => {
    // MemoryRouter simuliert die Route nur intern – die ECHTE Adressleiste (window.location) muss hier
    // separat gesetzt werden, sonst prüft der Test nichts (window.location.hash wäre ohnehin schon leer).
    window.history.replaceState(null, '', '/v#abcd1234hjkm')
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    let resolveMe
    me.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMe = resolve
        })
    )

    await render('/v#abcd1234hjkm')

    // Der Aufruf passiert beim ersten Render (State-Initialisierer), also bevor /api/me überhaupt
    // beantwortet ist – die Zusage me() ist zu diesem Zeitpunkt bewusst noch unaufgelöst.
    expect(replaceStateSpy).toHaveBeenCalled()
    expect(window.location.hash).toBe('')

    await act(async () => resolveMe(null))
  })

  test('mit bestehender Sitzung: zeigt "angemeldet als …" statt direkt das Einlöse-Formular', async () => {
    me.mockResolvedValue(loggedInHome)
    await render('/v')

    expect(container.textContent).toContain('Zuhause am Deich')
    expect(container.querySelector('#redeem-code')).toBeNull()
    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Abmelden und Einladungscode einlösen')
    expect(button).not.toBeUndefined()
  })

  test('"Abmelden und Einladungscode einlösen" meldet ab und zeigt danach das Formular, der Code bleibt erhalten', async () => {
    me.mockResolvedValue(loggedInHome)
    logout.mockResolvedValue(null)
    await render('/v#abcd1234hjkm')

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Abmelden und Einladungscode einlösen')
    await act(async () => button.click())

    expect(logout).toHaveBeenCalled()
    expect(container.querySelector('#redeem-code').value).toBe('ABCD-1234-HJKM')
  })
})

describe('Route /v – nach dem Anmelden landet man in der Chronik, nicht auf der "angemeldet als …"-Karte (C1)', () => {
  test('nach dem Einlösen (Gutschein → KeyReveal → "Weiter") ist die Karte weg und die Route ist die Start-Route', async () => {
    me.mockRejectedValue(new Error('401'))
    redeemVoucher.mockResolvedValue({
      key: 'WXYZ-9876-MNPQ',
      fromOthers: false,
      id: 1,
      name: 'Zuhause am Deich',
      theme: 'standard',
      art: 'zuhause',
      isDemo: false,
      home: null,
      memberships: []
    })
    listDogs.mockResolvedValue([])
    await render('/v#abcd1234hjkm')

    await act(async () => setInputValue(container.querySelector('#redeem-name'), 'Zuhause am Deich'))
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    const continueButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Weiter zu Meiner Chronik')
    await act(async () => continueButton.click())

    expect(container.textContent).not.toContain('Abmelden und Einladungscode einlösen')
    expect(container.querySelector('h1')?.textContent).toBe('Wegbegleiter')
  })

  test('eine normale Anmeldung auf /v landet ebenfalls in der Chronik, nicht auf der Karte', async () => {
    me.mockRejectedValue(new Error('401'))
    login.mockResolvedValue({
      id: 1,
      name: 'Zuhause am Deich',
      theme: 'standard',
      art: 'zuhause',
      isDemo: false,
      home: null,
      memberships: []
    })
    listDogs.mockResolvedValue([])
    await render('/v#abcd1234hjkm')

    const loginTab = [...container.querySelectorAll('[aria-label="Modus"] button')].find((btn) => btn.textContent === 'Anmelden')
    act(() => loginTab.click())

    await act(async () => setInputValue(container.querySelector('#login-secret'), 'ABCD-1234-HJKM'))
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    expect(login).toHaveBeenCalledWith('ABCD-1234-HJKM')
    expect(container.textContent).not.toContain('Abmelden und Einladungscode einlösen')
    expect(container.querySelector('h1')?.textContent).toBe('Wegbegleiter')
  })
})

describe('Route /v – Übergabe-Gutschein mit laufender Zuhause-Sitzung übernehmen (Phase T Task 5)', () => {
  const qualifyingHome = {
    id: 1,
    name: 'Zuhause am Deich',
    theme: 'standard',
    art: 'zuhause',
    isDemo: false,
    home: { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' },
    memberships: []
  }

  test('zeigt den Umzugs-Hinweis und "In Meine Chronik übernehmen" statt "Abmelden und Einladungscode einlösen"', async () => {
    me.mockResolvedValue(qualifyingHome)
    checkVoucher.mockResolvedValue({ status: 'offen', handover: { animalName: 'Pepper', shelterName: 'Tierheim Sonnenhang' } })
    await render('/v#abcd1234hjkm')

    expect(checkVoucher).toHaveBeenCalledWith('ABCD-1234-HJKM')
    expect(container.textContent).toContain('Mit diesem Übergabe-Code zieht Pepper aus Tierheim Sonnenhang zu euch – mit der ganzen Chronik.')
    const claimButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'In Meine Chronik übernehmen')
    expect(claimButton).not.toBeUndefined()
    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent === 'Abmelden und Einladungscode einlösen')).toBe(false)
  })

  test('Klick auf "In Meine Chronik übernehmen" ruft api.claimVoucher auf und verlässt die Gutschein-Karte', async () => {
    me.mockResolvedValue(qualifyingHome)
    checkVoucher.mockResolvedValue({ status: 'offen', handover: { animalName: 'Pepper', shelterName: 'Tierheim Sonnenhang' } })
    claimVoucher.mockResolvedValue({ dogId: 42 })
    getDog.mockResolvedValue({ id: 42, name: 'Pepper', shares: [], mother: null, father: null, children: [], housemates: [] })
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    await render('/v#abcd1234hjkm')

    const claimButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'In Meine Chronik übernehmen')
    await act(async () => claimButton.click())

    expect(claimVoucher).toHaveBeenCalledWith({ code: 'ABCD-1234-HJKM', shelterMayRead: false })
    expect(container.textContent).not.toContain('In Meine Chronik übernehmen')
    expect(container.textContent).not.toContain('angemeldet als')
  })

  test('mit angehakter Einwilligung sendet der Klick shelterMayRead:true', async () => {
    me.mockResolvedValue(qualifyingHome)
    checkVoucher.mockResolvedValue({ status: 'offen', handover: { animalName: 'Pepper', shelterName: 'Tierheim Sonnenhang' } })
    claimVoucher.mockResolvedValue({ dogId: 42 })
    getDog.mockResolvedValue({ id: 42, name: 'Pepper', shares: [], mother: null, father: null, children: [], housemates: [] })
    listTimeline.mockResolvedValue([])
    listBreedingEvents.mockResolvedValue([])
    listAllDogs.mockResolvedValue([])
    await render('/v#abcd1234hjkm')

    const checkbox = [...container.querySelectorAll('label')]
      .find((l) => l.textContent.includes('darf weiter mitlesen'))
      .querySelector('input[type="checkbox"]')
    await act(async () => checkbox.click())
    const claimButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'In Meine Chronik übernehmen')
    await act(async () => claimButton.click())

    expect(claimVoucher).toHaveBeenCalledWith({ code: 'ABCD-1234-HJKM', shelterMayRead: true })
  })

  test('aus einem beigetretenen Rudel heraus (nicht das eigene Zuhause selbst) bleibt es bei "Abmelden und Einladungscode einlösen", plus ein Hinweis zurückzuwechseln (final-review Phase T Finding 10)', async () => {
    const visitingGroup = {
      id: 9,
      name: 'Familie Sonnenhang',
      theme: 'standard',
      art: 'rudel',
      isDemo: false,
      home: { id: 1, name: 'Zuhause am Deich', theme: 'standard', art: 'zuhause' },
      memberships: []
    }
    me.mockResolvedValue(visitingGroup)
    await render('/v#abcd1234hjkm')

    expect(checkVoucher).not.toHaveBeenCalled()
    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent === 'Abmelden und Einladungscode einlösen')).toBe(true)
    expect(container.textContent).toContain('Wechselt oben zu „Meine Chronik“, um das Tier zu übernehmen.')
  })

  test('ein gewöhnlicher (Nicht-Übergabe) Gutschein-Code lässt es bei "Abmelden und Einladungscode einlösen"', async () => {
    me.mockResolvedValue(qualifyingHome)
    checkVoucher.mockResolvedValue({ status: 'offen' })
    await render('/v#abcd1234hjkm')

    expect(checkVoucher).toHaveBeenCalledWith('ABCD-1234-HJKM')
    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent === 'Abmelden und Einladungscode einlösen')).toBe(true)
  })

  test('eine echte Zuhause-Sitzung ohne Rudel-Umweg bekommt den Rudel-Hinweis nicht', async () => {
    me.mockResolvedValue(qualifyingHome)
    checkVoucher.mockResolvedValue({ status: 'offen' })
    await render('/v#abcd1234hjkm')

    expect(container.textContent).not.toContain('Wechselt oben zu „Meine Chronik“')
  })

  test('eine Demo-Sitzung des eigenen Zuhauses kann nichts übernehmen (final-review Phase T Finding 10)', async () => {
    me.mockResolvedValue({ ...qualifyingHome, isDemo: true })
    await render('/v#abcd1234hjkm')

    expect(checkVoucher).not.toHaveBeenCalled()
    expect([...container.querySelectorAll('button')].some((btn) => btn.textContent === 'Abmelden und Einladungscode einlösen')).toBe(true)
  })
})
