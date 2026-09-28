// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, logout, redeemVoucher, listDogs, publicPartner, publicPartners } = vi.hoisted(() => ({
  me: vi.fn(),
  logout: vi.fn(),
  redeemVoucher: vi.fn(),
  listDogs: vi.fn(),
  publicPartner: vi.fn(),
  publicPartners: vi.fn()
}))
vi.mock('./api', () => ({
  api: { me, logout, redeemVoucher, listDogs, publicPartner, publicPartners },
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

const partner = {
  id: 1,
  slug: 'tierheim-sonnenhang',
  name: 'Tierheim Sonnenhang',
  typ: 'tierheim',
  plz: '10115',
  ort: 'Berlin',
  lat: 52.52,
  lon: 13.41,
  website: null,
  kontakt_email: null,
  kontakt_telefon: null,
  logoUrl: null,
  badge: 'partner',
  portal_titel: null,
  portal_text: 'Willkommen bei uns.',
  spenden_url: null,
  vermittlung_url: null,
  farbe: '#2f6b3f'
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
  redeemVoucher.mockReset()
  listDogs.mockReset()
  publicPartner.mockReset()
  publicPartners.mockReset()
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

describe('Route /p/:slug – Gutschein direkt aus dem Partner-Portal einlösen', () => {
  test('ohne Sitzung: Einlösen führt über KeyReveal ("Weiter") zur Start-Route, wie bei /v', async () => {
    me.mockRejectedValue(new Error('401'))
    publicPartner.mockResolvedValue(partner)
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
    await render('/p/tierheim-sonnenhang')

    expect(container.textContent).toContain('Tierheim Sonnenhang')

    await act(async () => {
      setInputValue(container.querySelector('#redeem-code'), 'abcd1234hjkm')
      setInputValue(container.querySelector('#redeem-name'), 'Zuhause am Deich')
    })
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    const continueButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Weiter zu Meiner Chronik')
    await act(async () => continueButton.click())

    expect(container.querySelector('h1')?.textContent).toBe('Wegbegleiter')
  })

  test('mit bestehender Sitzung: zeigt das Portal weiter, mit "Zurück zu eurer Chronik" statt dem Formular', async () => {
    me.mockResolvedValue(loggedInHome)
    publicPartner.mockResolvedValue(partner)
    await render('/p/tierheim-sonnenhang')

    expect(container.textContent).toContain('Tierheim Sonnenhang')
    expect(container.querySelector('#redeem-code')).toBeNull()
    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Zurück zu eurer Chronik')
    expect(button).not.toBeUndefined()
  })

  test('"Abmelden und Gutschein einlösen" auf dem Portal meldet ab und zeigt danach das Formular', async () => {
    me.mockResolvedValue(loggedInHome)
    logout.mockResolvedValue(null)
    publicPartner.mockResolvedValue(partner)
    await render('/p/tierheim-sonnenhang')

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Abmelden und Gutschein einlösen')
    await act(async () => button.click())

    expect(logout).toHaveBeenCalled()
    expect(container.querySelector('#redeem-code')).not.toBeNull()
  })
})

describe('Route /partner – öffentliche Partnerliste', () => {
  test('rendert unabhängig vom Login-Status', async () => {
    me.mockRejectedValue(new Error('401'))
    publicPartners.mockResolvedValue([])
    await render('/partner')

    expect(container.querySelector('h1')?.textContent).toBe('Unsere Partner')
  })
})
