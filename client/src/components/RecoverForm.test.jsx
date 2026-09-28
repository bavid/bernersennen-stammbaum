// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { recover } = vi.hoisted(() => ({ recover: vi.fn() }))
vi.mock('../api', () => ({ api: { recover } }))

import RecoverForm from './RecoverForm.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  recover.mockReset()
})

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<RecoverForm onBack={() => {}} {...props} />))
  return container
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function fillForm() {
  setInputValue(container.querySelector('#recover-code'), 'abcd1234hjkm')
  setInputValue(container.querySelector('#recover-username'), 'nele')
  setInputValue(container.querySelector('#recover-password'), 'neuesPasswort1')
}

describe('RecoverForm', () => {
  test('zeigt den Hinweis "Kein Benutzer? Dann meldet euch einfach mit dem Schlüssel an."', async () => {
    await render()
    expect(container.textContent).toContain('Kein Benutzer? Dann meldet euch einfach mit dem Schlüssel an.')
  })

  test('sendet Code, Benutzername und neues Passwort an api.recover', async () => {
    recover.mockResolvedValue(null)
    await render()
    await act(async () => fillForm())
    await act(async () => container.querySelector('form').requestSubmit())

    expect(recover).toHaveBeenCalledWith({ code: 'ABCD-1234-HJKM', username: 'nele', newPassword: 'neuesPasswort1' })
  })

  test('zeigt nach Erfolg "Passwort geändert – jetzt anmelden." statt des Formulars', async () => {
    recover.mockResolvedValue(null)
    await render()
    await act(async () => fillForm())
    await act(async () => container.querySelector('form').requestSubmit())

    expect(container.querySelector('form')).toBeNull()
    expect(container.textContent).toContain('Passwort geändert – jetzt anmelden.')
  })

  test('ein Fehler erscheint als Alert, das Formular bleibt stehen', async () => {
    recover.mockRejectedValue(new Error('Schlüssel oder Benutzername stimmen nicht'))
    await render()
    await act(async () => fillForm())
    await act(async () => container.querySelector('form').requestSubmit())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Schlüssel oder Benutzername stimmen nicht')
    expect(container.querySelector('form')).not.toBeNull()
  })

  test('"Zurück zum Anmelden" ruft onBack auf', async () => {
    const onBack = vi.fn()
    await render({ onBack })

    const back = [...container.querySelectorAll('button')].find((btn) => btn.textContent.includes('Zurück zum Anmelden'))
    act(() => back.click())

    expect(onBack).toHaveBeenCalled()
  })
})
