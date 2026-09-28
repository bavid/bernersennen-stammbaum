// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { renewKey, listUsers, createUser, deleteUser, me } = vi.hoisted(() => ({
  renewKey: vi.fn(),
  listUsers: vi.fn(),
  createUser: vi.fn(),
  deleteUser: vi.fn(),
  me: vi.fn()
}))
vi.mock('../api', () => ({ api: { renewKey, listUsers, createUser, deleteUser, me } }))

import AccessSettings from './AccessSettings.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const keyFamily = { id: 1, name: 'Zuhause am Deich', auth: { kind: 'key' } }
const userFamily = { id: 1, name: 'Zuhause am Deich', auth: { kind: 'user', username: 'nele' } }
const legacyFamily = { id: 3, name: 'Familie Sonnenhang', auth: { kind: 'legacy' } }

let container
let root

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
  renewKey.mockReset()
  listUsers.mockReset()
  createUser.mockReset()
  deleteUser.mockReset()
  me.mockReset()
})

async function render(family = keyFamily, { onFamilyChange } = {}) {
  listUsers.mockResolvedValue([])
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <ThemeProvider themeId="standard">
        <AccessSettings family={family} onFamilyChange={onFamilyChange} />
      </ThemeProvider>
    )
  )
  return container
}

// Simuliert, wie OverviewPage AccessSettings tatsächlich einbindet: family lebt beim Aufrufer, ein
// erneuerter Schlüssel muss also über onFamilyChange zurück in einen state fließen, den AccessSettings
// beim nächsten Render wieder als family-Prop bekommt (nicht bloß lokal in AccessSettings selbst).
function Wrapper({ initialFamily }) {
  const [family, setFamily] = useState(initialFamily)
  return <AccessSettings family={family} onFamilyChange={setFamily} />
}

async function renderWrapper(initialFamily) {
  listUsers.mockResolvedValue([])
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <ThemeProvider themeId="standard">
        <Wrapper initialFamily={initialFamily} />
      </ThemeProvider>
    )
  )
  return container
}

function confirmInput() {
  return container.querySelector('#access-confirm')
}

function renewButton() {
  return [...container.querySelectorAll('.access-key button')][0]
}

describe('AccessSettings – gemeinsame Bestätigung', () => {
  test('zeigt das Schlüssel-Feld für eine Schlüssel-Sitzung (auch als Rückfall ohne auth)', async () => {
    await render(keyFamily)
    const label = container.querySelector('label[for="access-confirm"]')
    expect(label.textContent).toBe('Zur Bestätigung: euer aktueller Schlüssel')
    expect(confirmInput().type).toBe('text')

    await render({ id: 1, name: 'Ohne auth-Feld' })
    expect(container.querySelector('label[for="access-confirm"]').textContent).toBe('Zur Bestätigung: euer aktueller Schlüssel')
  })

  test('zeigt das Passwort-Feld für eine Benutzer-Sitzung', async () => {
    await render(userFamily)
    expect(container.querySelector('label[for="access-confirm"]').textContent).toBe('Zur Bestätigung: dein Passwort')
    expect(confirmInput().type).toBe('password')
  })

  test('zeigt das alte Bereichs-Passwort für eine Alt-Familie ohne Schlüssel', async () => {
    await render(legacyFamily)
    expect(container.querySelector('label[for="access-confirm"]').textContent).toBe('Zur Bestätigung: euer bisheriges Passwort')
    expect(confirmInput().type).toBe('password')
  })

  test('"Schlüssel erneuern" und "Benutzer hinzufügen" bleiben gesperrt, bis die Bestätigung ausgefüllt ist', async () => {
    await render(keyFamily)
    expect(renewButton().disabled).toBe(true)
    expect(container.querySelector('.access-users > button').disabled).toBe(true)

    await act(async () => setInputValue(confirmInput(), 'abcd1234hjkm'))

    expect(renewButton().disabled).toBe(false)
    expect(container.querySelector('.access-users > button').disabled).toBe(false)
  })
})

describe('AccessSettings – Schlüssel erneuern', () => {
  test('formatiert die Eingabe als Code und sendet sie als currentKey', async () => {
    renewKey.mockResolvedValue({ key: 'WXYZ-9876-MNPQ' })
    await render(keyFamily)

    await act(async () => setInputValue(confirmInput(), 'abcd1234hjkm'))
    expect(confirmInput().value).toBe('ABCD-1234-HJKM')

    act(() => renewButton().click())
    await act(async () => renewButton().click())

    expect(renewKey).toHaveBeenCalledWith({ currentKey: 'ABCD-1234-HJKM' })
    expect(container.querySelector('.key-reveal-value').textContent).toBe('WXYZ-9876-MNPQ')
  })

  test('sendet currentPassword bei einer Benutzer-Sitzung', async () => {
    renewKey.mockResolvedValue({ key: 'WXYZ-9876-MNPQ' })
    await render(userFamily)

    await act(async () => setInputValue(confirmInput(), 'mein-passwort-1'))
    act(() => renewButton().click())
    await act(async () => renewButton().click())

    expect(renewKey).toHaveBeenCalledWith({ currentPassword: 'mein-passwort-1' })
  })

  test('zweistufige Bestätigung mit Warnung, "Fertig" führt zurück und setzt die Bestätigung zurück', async () => {
    renewKey.mockResolvedValue({ key: 'WXYZ-9876-MNPQ' })
    await render(keyFamily)
    await act(async () => setInputValue(confirmInput(), 'abcd1234hjkm'))

    expect(container.querySelector('.warning-banner')).toBeNull()
    act(() => renewButton().click())
    expect(container.querySelector('.warning-banner').textContent).toContain('Alle anderen Geräte müssen sich danach neu anmelden.')
    expect(renewButton().textContent).toContain('Ja, Schlüssel erneuern')

    await act(async () => renewButton().click())
    const doneButton = [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Fertig')
    act(() => doneButton.click())

    expect(container.querySelector('.access-key')).not.toBeNull()
    expect(confirmInput().value).toBe('')
    expect(renewButton().disabled).toBe(true)
  })

  test('ein Fehler (z. B. falscher Nachweis) erscheint als Alert und die Bestätigung bleibt scharf-schaltbar', async () => {
    renewKey.mockRejectedValue(new Error('Bitte bestätige mit deinem aktuellen Schlüssel bzw. Passwort.'))
    await render(keyFamily)
    await act(async () => setInputValue(confirmInput(), 'abcd1234hjkm'))
    act(() => renewButton().click())
    await act(async () => renewButton().click())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Bitte bestätige mit deinem aktuellen Schlüssel bzw. Passwort.')
    expect(renewButton().textContent).not.toContain('Ja,')
  })

  test('zeigt bei einer Alt-Familie (legacy) eine eigene Warnung statt "Alle anderen Geräte …"', async () => {
    renewKey.mockResolvedValue({ key: 'WXYZ-9876-MNPQ' })
    await render(legacyFamily)
    await act(async () => setInputValue(confirmInput(), 'altes-passwort'))

    act(() => renewButton().click())

    const warning = container.querySelector('.warning-banner')
    expect(warning.textContent).toContain(
      'Danach meldet ihr euch zusätzlich mit dem Schlüssel an – euer bisheriges Passwort funktioniert weiterhin.'
    )
    expect(warning.textContent).not.toContain('Alle anderen Geräte müssen sich danach neu anmelden.')
  })

  test('legacy: nach dem Erneuern zieht family.auth.kind über onFamilyChange nach, der nächste Benutzer wird mit currentKey angelegt', async () => {
    renewKey.mockResolvedValue({ key: 'WXYZ-9876-MNPQ' })
    me.mockResolvedValue({ auth: { kind: 'key' } })
    createUser.mockResolvedValue({ id: 2, username: 'hermes', email: null, last_login_at: null })
    await renderWrapper(legacyFamily)

    await act(async () => setInputValue(confirmInput(), 'altes-passwort'))
    act(() => renewButton().click())
    await act(async () => renewButton().click())

    expect(me).toHaveBeenCalled()
    // family.auth.kind ist jetzt "key" – Label und Eingabeformat wechseln entsprechend.
    expect(container.querySelector('label[for="access-confirm"]').textContent).toBe('Zur Bestätigung: euer aktueller Schlüssel')
    expect(confirmInput().type).toBe('text')

    await act(async () => setInputValue(confirmInput(), 'wxyz9876mnpq'))
    act(() => container.querySelector('.access-users > button').click())
    await act(async () => {
      setInputValue(container.querySelector('#access-new-username'), 'hermes')
      setInputValue(container.querySelector('#access-new-password'), 'geheim1234')
    })
    await act(async () => container.querySelector('.access-users form').requestSubmit())

    expect(createUser).toHaveBeenCalledWith({
      username: 'hermes',
      password: 'geheim1234',
      email: undefined,
      currentKey: 'WXYZ-9876-MNPQ'
    })
  })

  test('legacy: schlägt api.me nach dem Erneuern fehl, wird auth.kind lokal auf "key" gesetzt (Fallback)', async () => {
    renewKey.mockResolvedValue({ key: 'WXYZ-9876-MNPQ' })
    me.mockRejectedValue(new Error('Netzwerkfehler'))
    await renderWrapper(legacyFamily)

    await act(async () => setInputValue(confirmInput(), 'altes-passwort'))
    act(() => renewButton().click())
    await act(async () => renewButton().click())

    expect(container.querySelector('label[for="access-confirm"]').textContent).toBe('Zur Bestätigung: euer aktueller Schlüssel')
    expect(confirmInput().type).toBe('text')
  })
})

describe('AccessSettings – Benutzer', () => {
  test('zeigt die Liste mit letzter Anmeldung', async () => {
    listUsers.mockResolvedValue([{ id: 1, username: 'nele', email: null, last_login_at: null }])
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <ThemeProvider themeId="standard">
          <AccessSettings family={keyFamily} />
        </ThemeProvider>
      )
    )

    const item = container.querySelector('.access-user-list li')
    expect(item.textContent).toContain('nele')
    expect(item.textContent).toContain('noch nie angemeldet')
  })

  test('legt einen neuen Benutzer an und sendet den Nachweis (currentKey) getrennt vom neuen Passwort', async () => {
    await render(keyFamily)
    createUser.mockResolvedValue({ id: 2, username: 'hermes', email: null, last_login_at: null })

    await act(async () => setInputValue(confirmInput(), 'abcd1234hjkm'))
    act(() => container.querySelector('.access-users > button').click())
    await act(async () => {
      setInputValue(container.querySelector('#access-new-username'), 'hermes')
      setInputValue(container.querySelector('#access-new-password'), 'geheim1234')
    })
    await act(async () => container.querySelector('.access-users form').requestSubmit())

    expect(createUser).toHaveBeenCalledWith({
      username: 'hermes',
      password: 'geheim1234',
      email: undefined,
      currentKey: 'ABCD-1234-HJKM'
    })
    expect(container.querySelector('.access-user-list').textContent).toContain('hermes')
  })

  test('legt einen neuen Benutzer mit currentPassword als Nachweis an (Benutzer-Sitzung)', async () => {
    await render(userFamily)
    createUser.mockResolvedValue({ id: 2, username: 'hermes', email: null, last_login_at: null })

    await act(async () => setInputValue(confirmInput(), 'mein-passwort-1'))
    act(() => container.querySelector('.access-users > button').click())
    await act(async () => {
      setInputValue(container.querySelector('#access-new-username'), 'hermes')
      setInputValue(container.querySelector('#access-new-password'), 'ein-anderes-pw')
    })
    await act(async () => container.querySelector('.access-users form').requestSubmit())

    expect(createUser).toHaveBeenCalledWith({
      username: 'hermes',
      password: 'ein-anderes-pw',
      email: undefined,
      currentPassword: 'mein-passwort-1'
    })
  })

  test('entfernt einen Benutzer nach Bestätigung und sendet den Nachweis mit', async () => {
    listUsers.mockResolvedValue([{ id: 1, username: 'nele', email: null, last_login_at: null }])
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () =>
      root.render(
        <ThemeProvider themeId="standard">
          <AccessSettings family={keyFamily} />
        </ThemeProvider>
      )
    )
    deleteUser.mockResolvedValue(null)

    await act(async () => setInputValue(confirmInput(), 'abcd1234hjkm'))
    const removeButton = () => container.querySelector('.access-user-list button')
    act(() => removeButton().click())
    await act(async () => removeButton().click())

    expect(deleteUser).toHaveBeenCalledWith(1, { currentKey: 'ABCD-1234-HJKM' })
    expect(container.querySelector('.access-user-list')).toBeNull()
    expect(container.textContent).toContain('Noch kein eigener Benutzer angelegt.')
  })
})
