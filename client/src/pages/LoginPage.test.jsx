// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { config, createFamily } = vi.hoisted(() => ({ config: vi.fn(), createFamily: vi.fn() }))
vi.mock('../api', () => ({ api: { config, createFamily } }))

import LoginPage from './LoginPage.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container

afterEach(() => {
  if (container) {
    act(() => container.remove())
    container = null
  }
  delete document.documentElement.dataset.theme
  document.title = ''
  config.mockReset()
  createFamily.mockReset()
})

async function render(onLogin = () => {}) {
  config.mockResolvedValue({ inviteRequired: false })
  container = document.createElement('div')
  document.body.appendChild(container)
  await act(async () =>
    createRoot(container).render(
      <ThemeProvider themeId="standard">
        <LoginPage onLogin={onLogin} />
      </ThemeProvider>
    )
  )
  return container
}

// Nur der Modus-Umschalter existiert vor dem Wechsel zu "create" – danach kommt der Art-Umschalter dazu.
function switchToCreateMode() {
  act(() => container.querySelector('.login-switch button[aria-pressed]:not([aria-pressed="true"])').click())
}

// React verfolgt den zuletzt gerenderten Input-Wert intern; ein simples input.value = x lässt das
// anschließende "input"-Event wirkungslos wirken. Der native Setter am Prototyp umgeht das.
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('LoginPage – Anlegen: „Meine Chronik" vs. „Gemeinsame Familie"', () => {
  test('Anlegen startet bei „Meine Chronik": eigenes Namensfeld mit Hinweis, privater Beschreibungstext', async () => {
    await render()
    switchToCreateMode()
    expect(container.querySelector('[aria-label="Art"] button[aria-pressed="true"]').textContent).toBe('Meine Chronik')
    expect(container.querySelector('label[for="family-name"]').textContent).toBe('Wie heißt euer Zuhause?')
    expect(container.querySelector('#family-name').placeholder).toBe('z. B. Zuhause am Deich')
    expect(container.querySelector('.login-card-head h1').textContent).toBe('Meine Chronik anlegen')
    expect(container.querySelector('.login-card-head p').textContent).toBe(
      'Privat – für deine eigenen Tiere. Familien kannst du später beitreten.'
    )
    expect(container.querySelector('.form-stack button[type="submit"]').textContent).toBe('Meine Chronik anlegen')
  })

  test('Absenden bei „Meine Chronik" sendet den eingegebenen Namen als "name" (kein fester Platzhalter-Name)', async () => {
    const onLogin = vi.fn()
    const me = { id: 1, name: 'Zuhause am Deich', art: 'zuhause' }
    createFamily.mockResolvedValue(me)
    await render(onLogin)
    switchToCreateMode()

    const name = container.querySelector('#family-name')
    const password = container.querySelector('#family-password')
    await act(async () => {
      setInputValue(name, 'Zuhause am Deich')
      setInputValue(password, 'geheim123')
    })
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    expect(createFamily).toHaveBeenCalledWith(
      expect.objectContaining({ art: 'zuhause', name: 'Zuhause am Deich', password: 'geheim123' })
    )
    expect(onLogin).toHaveBeenCalledWith(me)
  })

  test('Wechsel zu „Gemeinsame Familie" beschriftet das Namensfeld um und sendet art: "rudel"', async () => {
    const onLogin = vi.fn()
    const me = { id: 2, name: 'Familie Sonnenhang', art: 'rudel' }
    createFamily.mockResolvedValue(me)
    await render(onLogin)
    switchToCreateMode()
    act(() => container.querySelector('[aria-label="Art"] button:last-child').click())

    expect(container.querySelector('[aria-label="Art"] button[aria-pressed="true"]').textContent).toBe(
      'Gemeinsame Familie'
    )
    expect(container.querySelector('label[for="family-name"]').textContent).toBe('Name der Familie')
    expect(container.querySelector('#family-name').placeholder).toBe('z. B. Familie Sonnenhang')
    expect(container.querySelector('.form-stack button[type="submit"]').textContent).toBe('Familie anlegen')

    const name = container.querySelector('#family-name')
    const password = container.querySelector('#family-password')
    await act(async () => {
      setInputValue(name, 'Familie Sonnenhang')
      setInputValue(password, 'geheim123')
    })
    await act(async () => container.querySelector('.form-stack').requestSubmit())

    expect(createFamily).toHaveBeenCalledWith(
      expect.objectContaining({ art: 'rudel', name: 'Familie Sonnenhang', password: 'geheim123' })
    )
    expect(onLogin).toHaveBeenCalledWith(me)
  })
})
