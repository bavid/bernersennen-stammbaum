// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { updateDog } = vi.hoisted(() => ({ updateDog: vi.fn() }))
vi.mock('../api', () => ({ api: { updateDog } }))

import VermittlungStatusPanel from './VermittlungStatusPanel.jsx'
import { DemoProvider } from '../lib/demo.js'
import { ToastProvider } from './Toast.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const dog = (overrides = {}) => ({
  id: 20,
  vermittlung_status: 'in_vermittlung',
  public_slug: null,
  ...overrides
})

function Wrapper({ isDemo = false, ...props }) {
  return (
    <DemoProvider value={isDemo}>
      <ToastProvider>
        <VermittlungStatusPanel dog={dog()} onChange={() => {}} {...props} />
      </ToastProvider>
    </DemoProvider>
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
  updateDog.mockReset()
})

function select() {
  return container.querySelector('#vermittlung-status')
}

function setSelectValue(value) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
  nativeSetter.call(select(), value)
  select().dispatchEvent(new Event('change', { bubbles: true }))
}

function saveButton() {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent === 'Speichern' || btn.textContent === 'Bestätigen')
}

describe('VermittlungStatusPanel', () => {
  test('behält "– kein Status –" als Option (legitim für frisch aufgenommene Tiere)', async () => {
    await render()
    const options = [...select().querySelectorAll('option')].map((o) => o.textContent)
    expect(options).toContain('– kein Status –')
  })

  test('ohne Änderung erscheint kein Speichern-Knopf', async () => {
    await render()
    expect(saveButton()).toBeUndefined()
  })

  test('eine harmlose Änderung (kein offener Gutschein, kein Steckbrief) speichert direkt ohne Bestätigung', async () => {
    updateDog.mockResolvedValue({ id: 20, vermittlung_status: 'vermittelt' })
    const onChange = vi.fn()
    await render({ onChange })

    act(() => setSelectValue('vermittelt'))
    expect(saveButton().textContent).toBe('Speichern')
    await act(async () => saveButton().click())

    expect(updateDog).toHaveBeenCalledWith(20, { vermittlungStatus: 'vermittelt' })
    expect(onChange).toHaveBeenCalledWith({ id: 20, vermittlung_status: 'vermittelt' })
  })

  test('Verlassen von "reserviert" verlangt eine Bestätigung mit Hinweis auf den Übergabe-Code', async () => {
    await render({ dog: dog({ vermittlung_status: 'reserviert' }) })

    act(() => setSelectValue('in_vermittlung'))
    const button = saveButton()
    expect(button.textContent).toBe('Speichern')
    await act(async () => button.click())

    expect(updateDog).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Der offene Übergabe-Code wird ungültig.')

    await act(async () => saveButton().click())
    expect(updateDog).toHaveBeenCalledWith(20, { vermittlungStatus: 'in_vermittlung' })
  })

  test('ein Statuswechsel weg von "vermittelbar" bei veröffentlichtem Steckbrief verlangt eine Bestätigung', async () => {
    await render({ dog: dog({ vermittlung_status: 'in_vermittlung', public_slug: 'pepper-ab12cd' }) })

    act(() => setSelectValue('vermittelt'))
    await act(async () => saveButton().click())

    expect(updateDog).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Der Steckbrief wird zurückgezogen.')
  })

  test('beide Nebenwirkungen gleichzeitig zeigen beide Hinweistexte', async () => {
    await render({ dog: dog({ vermittlung_status: 'reserviert', public_slug: 'pepper-ab12cd' }) })

    act(() => setSelectValue('vermittelt'))
    await act(async () => saveButton().click())

    expect(container.textContent).toContain('Der offene Übergabe-Code wird ungültig.')
    expect(container.textContent).toContain('Der Steckbrief wird zurückgezogen.')
  })

  test('Wechsel des ausgewählten Werts vor der Bestätigung setzt den Bestätigungs-Zustand zurück', async () => {
    await render({ dog: dog({ vermittlung_status: 'reserviert' }) })

    act(() => setSelectValue('in_vermittlung'))
    await act(async () => saveButton().click())
    expect(container.textContent).toContain('Der offene Übergabe-Code wird ungültig.')

    act(() => setSelectValue('reserviert'))
    expect(saveButton()).toBeUndefined()
  })

  test('in der Demo ist die Auswahl gesperrt und es erscheint ein Hinweis', async () => {
    await render({ isDemo: true })
    expect(select().disabled).toBe(true)
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })

  test('bei einem Fehler bleibt die Auswahl auf dem neuen Wert stehen (kein stummes Verschlucken)', async () => {
    updateDog.mockRejectedValue(new Error('Netzwerkfehler'))
    await render()

    act(() => setSelectValue('vermittelt'))
    await act(async () => saveButton().click())

    expect(select().value).toBe('vermittelt')
  })
})

describe('VermittlungStatusPanel – Status "pausiert" (Phase P)', () => {
  test('bietet alle Status mit den gemeinsamen Beschriftungen an, inklusive "Pausiert"', async () => {
    await render()
    const options = [...select().querySelectorAll('option')].map((o) => [o.value, o.textContent])
    expect(options).toEqual([
      ['', '– kein Status –'],
      ['in_vermittlung', 'Verfügbar'],
      ['reserviert', 'Reserviert'],
      ['pausiert', 'Pausiert'],
      ['vermittelt', 'Vermittelt']
    ])
  })

  test('pausieren bei veröffentlichtem Steckbrief speichert ohne Rückzugs-Warnung (der Steckbrief bleibt)', async () => {
    updateDog.mockResolvedValue({ id: 20, vermittlung_status: 'pausiert', public_slug: 'pepper-ab12cd' })
    await render({ dog: dog({ vermittlung_status: 'in_vermittlung', public_slug: 'pepper-ab12cd' }) })

    act(() => setSelectValue('pausiert'))
    expect(saveButton().textContent).toBe('Speichern')
    await act(async () => saveButton().click())

    expect(container.textContent).not.toContain('Der Steckbrief wird zurückgezogen.')
    expect(updateDog).toHaveBeenCalledWith(20, { vermittlungStatus: 'pausiert' })
  })

  test('von "reserviert" auf "pausiert" bleibt die Bestätigung für den Übergabe-Code, ohne Steckbrief-Warnung', async () => {
    await render({ dog: dog({ vermittlung_status: 'reserviert', public_slug: 'pepper-ab12cd' }) })

    act(() => setSelectValue('pausiert'))
    await act(async () => saveButton().click())

    expect(updateDog).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Der offene Übergabe-Code wird ungültig.')
    expect(container.textContent).not.toContain('Der Steckbrief wird zurückgezogen.')
  })

  test('von "pausiert" auf "vermittelt" zieht einen veröffentlichten Steckbrief zurück und fragt deshalb nach', async () => {
    await render({ dog: dog({ vermittlung_status: 'pausiert', public_slug: 'pepper-ab12cd' }) })

    act(() => setSelectValue('vermittelt'))
    await act(async () => saveButton().click())

    expect(updateDog).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Der Steckbrief wird zurückgezogen.')
  })
})
