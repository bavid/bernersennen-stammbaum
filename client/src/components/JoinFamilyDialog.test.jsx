// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { joinFamily, createGroup } = vi.hoisted(() => ({ joinFamily: vi.fn(), createGroup: vi.fn() }))
vi.mock('../api', () => ({ api: { joinFamily, createGroup } }))

import JoinFamilyDialog from './JoinFamilyDialog.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'
import { DemoProvider } from '../lib/demo.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

function Wrapper({ isDemo = false, onChange = () => {}, onClose = () => {} }) {
  return (
    <ThemeProvider themeId="standard">
      <DemoProvider value={isDemo}>
        <JoinFamilyDialog onChange={onChange} onClose={onClose} />
      </DemoProvider>
    </ThemeProvider>
  )
}

async function render(props) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<Wrapper {...props} />))
  return container
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
  joinFamily.mockReset()
  createGroup.mockReset()
})

function tabButton(label) {
  return [...container.querySelectorAll('.join-family-switch button')].find((btn) => btn.textContent === label)
}

// React verfolgt den zuletzt gerenderten Input-Wert intern; ein simples input.value = x lässt das
// anschließende "input"-Event wirkungslos wirken. Der native Setter am Prototyp umgeht das.
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('JoinFamilyDialog', () => {
  test('Beitreten ist der Standard-Tab', async () => {
    await render()
    expect(tabButton('Beitreten').getAttribute('aria-pressed')).toBe('true')
    expect(tabButton('Neu gründen').getAttribute('aria-pressed')).toBe('false')
    expect(container.querySelector('#join-family-password')).not.toBeNull()
  })

  test('Beitreten ruft api.joinFamily mit dem Passwort auf und meldet Erfolg', async () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    const me = { id: 5, name: 'Rudel Nachbarn' }
    joinFamily.mockResolvedValue(me)
    await render({ onChange, onClose })

    const password = container.querySelector('#join-family-password')
    await act(async () => setInputValue(password, 'geheim123'))
    await act(async () => container.querySelector('form').requestSubmit())

    expect(joinFamily).toHaveBeenCalledWith('geheim123')
    expect(onChange).toHaveBeenCalledWith(me)
    expect(onClose).toHaveBeenCalled()
  })

  test('Ein Fehler beim Beitreten zeigt die Server-Meldung als Alert, onChange/onClose bleiben aus', async () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    joinFamily.mockRejectedValue(new Error('Dieses Passwort kennen wir nicht'))
    await render({ onChange, onClose })

    const password = container.querySelector('#join-family-password')
    await act(async () => setInputValue(password, 'falsch'))
    await act(async () => container.querySelector('form').requestSubmit())

    expect(container.querySelector('[role="alert"]').textContent).toBe('Dieses Passwort kennen wir nicht')
    expect(onChange).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('Neu gründen ruft api.createGroup mit Name und Passwort auf und meldet Erfolg', async () => {
    const onChange = vi.fn()
    const onClose = vi.fn()
    const me = { id: 7, name: 'Familie Sonnenhang' }
    createGroup.mockResolvedValue(me)
    await render({ onChange, onClose })

    act(() => tabButton('Neu gründen').click())
    expect(container.querySelector('.field-hint').textContent).toBe('Teilt das Passwort mit allen, die dazugehören sollen.')

    const name = container.querySelector('#join-family-name')
    const password = container.querySelector('#join-family-create-password')
    await act(async () => {
      setInputValue(name, 'Familie Sonnenhang')
      setInputValue(password, 'geheim123')
    })
    await act(async () => container.querySelector('form').requestSubmit())

    expect(createGroup).toHaveBeenCalledWith({ name: 'Familie Sonnenhang', password: 'geheim123' })
    expect(onChange).toHaveBeenCalledWith(me)
    expect(onClose).toHaveBeenCalled()
  })

  test('Im Demo-Modus sind beide Tabs deaktiviert mit Hinweis, api wird nicht aufgerufen', async () => {
    await render({ isDemo: true })
    expect(container.querySelector('#join-family-password').disabled).toBe(true)
    expect(container.querySelector('.field-hint').textContent).toBe('In der Demo nicht möglich.')
    expect(container.querySelector('form button[type="submit"]').disabled).toBe(true)

    act(() => tabButton('Neu gründen').click())
    expect(container.querySelector('#join-family-name').disabled).toBe(true)
    expect(container.querySelector('#join-family-create-password').disabled).toBe(true)
    expect(container.querySelector('form button[type="submit"]').disabled).toBe(true)

    expect(joinFamily).not.toHaveBeenCalled()
    expect(createGroup).not.toHaveBeenCalled()
  })
})
