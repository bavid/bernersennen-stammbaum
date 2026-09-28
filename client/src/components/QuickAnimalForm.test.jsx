// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { createDog } = vi.hoisted(() => ({ createDog: vi.fn() }))
vi.mock('../api', () => ({ api: { createDog } }))

import QuickAnimalForm from './QuickAnimalForm.jsx'
import { ThemeProvider } from '../themes/ThemeProvider.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

// React verfolgt den zuletzt gerenderten Input-Wert intern; ein simples input.value = x lässt das
// anschließende "input"-Event wirkungslos wirken. Der native Setter am Prototyp umgeht das.
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function render(props = {}, themeId = 'standard') {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <ThemeProvider themeId={themeId}>
        <QuickAnimalForm allDogs={[]} onCreated={() => {}} onCancel={() => {}} {...props} />
      </ThemeProvider>
    )
  )
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
  createDog.mockReset()
})

function segmented(label) {
  return container.querySelector(`[aria-label="${label}"]`)
}

function segmentedButton(label, text) {
  return [...segmented(label).querySelectorAll('button')].find((btn) => btn.textContent === text)
}

function actionButton(text) {
  return [...container.querySelectorAll('.form-actions button')].find((btn) => btn.textContent === text)
}

describe('QuickAnimalForm', () => {
  test('Standard-Theme: keine Tierart vorausgewählt, Absenden ohne Auswahl zeigt einen Feldfehler', async () => {
    await render({}, 'standard')
    expect(segmented('Tierart').querySelectorAll('button[aria-pressed="true"]').length).toBe(0)

    setInputValue(container.querySelector('#quick-animal-name'), 'Minka')
    await act(async () => container.querySelector('form').requestSubmit())

    expect(container.querySelector('.field-error').textContent).toContain('Bitte wähle eine Tierart.')
    expect(createDog).not.toHaveBeenCalled()
  })

  test('Berner-Theme: Hund ist vorausgewählt', async () => {
    await render({}, 'berner')
    expect(segmentedButton('Tierart', 'Hund').getAttribute('aria-pressed')).toBe('true')
  })

  test('mit livesWith: "lebt mit" ist fest, das Tier wird beim Anlegen direkt verlinkt', async () => {
    const onCreated = vi.fn()
    const livesWith = { id: 5, name: 'Nele' }
    createDog.mockResolvedValue({ id: 9, name: 'Hoppel' })
    await render({ livesWith, onCreated }, 'berner')

    expect(container.querySelector('select[aria-label="Lebt mit"]')).toBeNull()
    expect(container.querySelector('.quick-animal-fixed-housemate').textContent).toBe('lebt mit Nele')

    setInputValue(container.querySelector('#quick-animal-name'), 'Hoppel')
    await act(async () => container.querySelector('form').requestSubmit())

    expect(createDog).toHaveBeenCalledWith(expect.objectContaining({ name: 'Hoppel', tierart: 'hund', housemateId: 5 }))
    expect(onCreated).toHaveBeenCalledWith({ id: 9, name: 'Hoppel' })
  })

  test('"Mehr Angaben …" reicht die bisherigen Werte weiter, ohne ein Tier anzulegen', async () => {
    const onMore = vi.fn()
    await render({ onMore }, 'berner')

    setInputValue(container.querySelector('#quick-animal-name'), 'Nele')
    act(() => segmentedButton('Tierart', 'Katze').click())
    setInputValue(container.querySelector('#quick-animal-bei-uns-seit'), '2022-01-01')

    act(() => actionButton('Mehr Angaben …').click())

    expect(onMore).toHaveBeenCalledWith({
      tierart: 'katze',
      name: 'Nele',
      nameUnbekannt: false,
      rasse: '',
      geschlecht: 'huendin',
      beiUnsSeit: '2022-01-01',
      housemateId: ''
    })
    expect(createDog).not.toHaveBeenCalled()
  })

  test('ohne onMore-Prop erscheint kein "Mehr Angaben …"-Knopf (z. B. auf der Tierseite)', async () => {
    await render({}, 'berner')
    expect(actionButton('Mehr Angaben …')).toBeUndefined()
  })

  test('"anderes": zeigt "Welches Tier?" und legt den Wert als rasse an', async () => {
    createDog.mockResolvedValue({ id: 1, name: 'Hoppel' })
    await render({}, 'berner')

    act(() => segmentedButton('Tierart', 'Anderes Tier').click())
    setInputValue(container.querySelector('#quick-animal-kind'), 'Kaninchen')
    expect(container.querySelector('#quick-animal-kind').placeholder).toBe('z. B. Kaninchen')
    setInputValue(container.querySelector('#quick-animal-name'), 'Hoppel')

    await act(async () => container.querySelector('form').requestSubmit())

    expect(createDog).toHaveBeenCalledWith(expect.objectContaining({ tierart: 'anderes', rasse: 'Kaninchen' }))
  })

  test('"Name unbekannt" legt ohne Namen an', async () => {
    createDog.mockResolvedValue({ id: 2, name: 'Unbekannt' })
    await render({}, 'berner')

    act(() => container.querySelector('.check input').click())
    expect(container.querySelector('#quick-animal-name').disabled).toBe(true)

    await act(async () => container.querySelector('form').requestSubmit())

    expect(createDog).toHaveBeenCalledWith(expect.objectContaining({ name: '', nameUnbekannt: true }))
  })
})
