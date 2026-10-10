// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { login, config } = vi.hoisted(() => ({ login: vi.fn(), config: vi.fn() }))
vi.mock('../api', () => ({ api: { login, config } }))

import RudelLoginPage from './RudelLoginPage.jsx'
import LoginEntry from '../components/login/LoginEntry.jsx'
import { resetInstanzModus } from '../lib/instanzModus.js'
import { setLang } from '../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(async () => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  container = null
  login.mockReset()
  config.mockReset()
  resetInstanzModus()
  await act(async () => setLang('de'))
})

async function render(element) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<MemoryRouter>{element}</MemoryRouter>))
}

const text = () => container.textContent
const links = () => [...container.querySelectorAll('footer a')].map((a) => a.getAttribute('href'))

async function typePassword(value) {
  const input = container.querySelector('#rudel-password')
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

// Rudel-Instanz (lib/instanzModus.js): nur Kopf, Begrüßung, EINE Karte mit dem Familien-Passwort, Sprache, Impressum/Datenschutz.
describe('RudelLoginPage', () => {
  test('nur der Passwort-Login - kein Gutschein, keine Demo, kein Partner, keine App-Karte', async () => {
    await render(<RudelLoginPage onLogin={() => {}} />)
    expect(container.querySelectorAll('.login-card')).toHaveLength(1)
    expect(container.querySelector('#rudel-password')).not.toBeNull()
    expect(text()).toContain('Familien-Passwort')
    expect(text()).not.toMatch(/Demo|Einladungscode|Gutschein|Partner|aufs Handy/)
    expect(container.querySelector('#login-secret')).toBeNull()
    expect(links()).toEqual(['/impressum', '/datenschutz'])
  })

  test('meldet mit dem Passwort an und zeigt Fehler', async () => {
    const onLogin = vi.fn()
    login.mockRejectedValueOnce(new Error('Dieses Passwort kennen wir nicht')).mockResolvedValueOnce({ id: 2 })
    await render(<RudelLoginPage onLogin={onLogin} />)
    await typePassword('falsch')
    await act(async () => container.querySelector('form').requestSubmit())
    expect(container.querySelector('[role="alert"]').textContent).toBe('Dieses Passwort kennen wir nicht')
    await typePassword('sonnenhang-wiese-7')
    await act(async () => container.querySelector('form').requestSubmit())
    expect(login).toHaveBeenLastCalledWith('sonnenhang-wiese-7')
    expect(onLogin).toHaveBeenCalledWith({ id: 2 })
  })

  test('Englisch', async () => {
    await act(async () => setLang('en'))
    await render(<RudelLoginPage onLogin={() => {}} />)
    expect(text()).toContain('Family password')
    expect(text()).toContain('Sign in')
    expect(text()).toContain('Privacy')
  })
})

describe('LoginEntry', () => {
  test('Rudel-Modus: der ruhige Passwort-Login', async () => {
    config.mockResolvedValue({ instanzModus: 'rudel' })
    await render(<LoginEntry onLogin={() => {}} />)
    expect(container.querySelector('.rudel-login')).not.toBeNull()
  })

  test('ohne Modus (oder ohne Antwort): die normale Startseite', async () => {
    config.mockRejectedValue(new Error('offline'))
    await render(<LoginEntry onLogin={() => {}} />)
    expect(container.querySelector('.rudel-login')).toBeNull()
    expect(container.querySelector('#login-secret')).not.toBeNull()
  })
})
