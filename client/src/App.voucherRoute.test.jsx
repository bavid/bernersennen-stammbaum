// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { me, logout } = vi.hoisted(() => ({ me: vi.fn(), logout: vi.fn() }))
vi.mock('./api', () => ({
  api: { me, logout },
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

    expect(container.querySelector('[aria-label="Modus"] button[aria-pressed="true"]').textContent).toBe('Gutschein einlösen')
    expect(container.querySelector('#redeem-code').value).toBe('ABCD-1234-HJKM')
  })

  test('entfernt den Code sofort aus der Adressleiste', async () => {
    me.mockRejectedValue(new Error('401'))
    await render('/v#abcd1234hjkm')

    expect(window.location.hash).toBe('')
  })

  test('mit bestehender Sitzung: zeigt "angemeldet als …" statt direkt das Einlöse-Formular', async () => {
    me.mockResolvedValue(loggedInHome)
    await render('/v')

    expect(container.textContent).toContain('Zuhause am Deich')
    expect(container.querySelector('#redeem-code')).toBeNull()
    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Abmelden und Gutschein einlösen')
    expect(button).not.toBeUndefined()
  })

  test('"Abmelden und Gutschein einlösen" meldet ab und zeigt danach das Formular, der Code bleibt erhalten', async () => {
    me.mockResolvedValue(loggedInHome)
    logout.mockResolvedValue(null)
    await render('/v#abcd1234hjkm')

    const button = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Abmelden und Gutschein einlösen')
    await act(async () => button.click())

    expect(logout).toHaveBeenCalled()
    expect(container.querySelector('#redeem-code').value).toBe('ABCD-1234-HJKM')
  })
})
