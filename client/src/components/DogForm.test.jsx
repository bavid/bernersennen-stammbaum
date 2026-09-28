// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import DogForm from './DogForm.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<DogForm allDogs={[]} onCancel={() => {}} {...props} />))
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
})

// React verfolgt den zuletzt gerenderten Input-Wert intern; ein simples input.value = x lässt das
// anschließende "input"-Event wirkungslos wirken. Der native Setter am Prototyp umgeht das.
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select, value) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function disclosureButton() {
  return container.querySelector('.disclosure-btn')
}

describe('DogForm – „Bei uns“', () => {
  test('ist eingeklappt, solange kein Wert dazu gesetzt ist', async () => {
    await render()
    expect(disclosureButton()).not.toBeNull()
    expect(container.querySelector('#dog-bei-uns-seit')).toBeNull()
  })

  test('ist beim Bearbeiten schon aufgeklappt, wenn Werte vorhanden sind', async () => {
    await render({ dog: { id: 1, name: 'Nele', geschlecht: 'huendin', bei_uns_seit: '2021-06-12' } })
    expect(disclosureButton()).toBeNull()
    expect(container.querySelector('#dog-bei-uns-seit').value).toBe('2021-06-12')
  })

  test('sendet Einzug, Herkunft und Herkunftstext beim Anlegen', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ onSubmit })

    setInputValue(container.querySelector('#dog-name'), 'Nele')
    act(() => disclosureButton().click())
    setInputValue(container.querySelector('#dog-bei-uns-seit'), '2021-06-12')
    setSelectValue(container.querySelector('#dog-herkunft-art'), 'tierheim')
    setInputValue(container.querySelector('#dog-herkunft-text'), 'Tierheim Sonnenhang')

    await act(async () => container.querySelector('form').requestSubmit())

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        beiUnsSeit: '2021-06-12',
        herkunftArt: 'tierheim',
        herkunftText: 'Tierheim Sonnenhang',
        beiUnsBis: null,
        abschiedGrund: null
      })
    )
  })

  test('ohne Einzugsdatum bleiben die Felder null statt leerer Strings', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ onSubmit })
    setInputValue(container.querySelector('#dog-name'), 'Nele')

    await act(async () => container.querySelector('form').requestSubmit())

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ beiUnsSeit: null, herkunftArt: null, herkunftText: null, beiUnsBis: null, abschiedGrund: null })
    )
  })

  test('Abhaken von "Nicht mehr bei uns" räumt Abschiedsdatum und -grund direkt auf', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({
      onSubmit,
      dog: {
        id: 1,
        name: 'Aiko',
        geschlecht: 'ruede',
        bei_uns_seit: '2010-01-01',
        bei_uns_bis: '2020-01-01',
        abschied_grund: 'verstorben'
      }
    })

    // Abschnitt ist wegen vorhandener Werte schon aufgeklappt
    const checkbox = container.querySelector('.companion-fields input[type="checkbox"]')
    expect(checkbox.checked).toBe(true)
    expect(container.querySelector('#dog-bei-uns-bis').value).toBe('2020-01-01')

    act(() => checkbox.click())
    expect(container.querySelector('#dog-bei-uns-bis')).toBeNull()
    expect(container.querySelector('#dog-abschied-grund')).toBeNull()

    await act(async () => container.querySelector('form').requestSubmit())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ beiUnsBis: null, abschiedGrund: null }))
  })

  test('der Anlegen-Knopf heißt immer "Tier anlegen", unabhängig von der gewählten Tierart', async () => {
    await render()
    const katzeButton = [...container.querySelectorAll('.segmented button')].find((btn) => btn.textContent === 'Katze')
    act(() => katzeButton.click())
    expect(container.querySelector('button[type="submit"]').textContent).toBe('Tier anlegen')
  })
})

describe('DogForm – geteilte Tiere sind kein Schreibziel', () => {
  test('das "Lebt zusammen mit"-Auswahlfeld zeigt nur bearbeitbare (eigene) Tiere', async () => {
    await render({
      allDogs: [
        { id: 1, name: 'Nele', can_edit: 1 },
        { id: 2, name: 'Mira (geteilt)', can_edit: 0 }
      ]
    })
    const options = [...container.querySelectorAll('#dog-housemate option')].map((o) => o.textContent)
    expect(options).toEqual(['– niemandem –', 'Nele'])
  })

  test('Mutter/Vater bieten nur eigene Tiere zur Auswahl, keine hierher geteilten', async () => {
    await render({
      allDogs: [
        { id: 1, name: 'Emma', geschlecht: 'huendin', tierart: 'hund', can_edit: 1 },
        { id: 2, name: 'Luna (geteilt)', geschlecht: 'huendin', tierart: 'hund', can_edit: 0 }
      ]
    })
    const options = [...container.querySelectorAll('select')]
      .find((select) => [...select.options].some((o) => o.textContent.includes('Emma')))
      .querySelectorAll('option')
    const labels = [...options].map((o) => o.textContent)
    expect(labels.some((l) => l.includes('Emma'))).toBe(true)
    expect(labels.some((l) => l.includes('Luna'))).toBe(false)
  })
})

describe('DogForm – initialValues (Neuanlegen aus QuickAnimalForm "Mehr Angaben …")', () => {
  test('übernimmt Name, Tierart, Geschlecht, Einzug und "lebt mit" beim Neuanlegen', async () => {
    await render({
      allDogs: [{ id: 3, name: 'Nele', geschlecht: 'huendin' }],
      initialValues: {
        name: 'Hoppel',
        nameUnbekannt: false,
        tierart: 'anderes',
        rasse: 'Kaninchen',
        geschlecht: 'ruede',
        beiUnsSeit: '2024-05-01',
        housemateId: 3
      }
    })

    expect(container.querySelector('#dog-name').value).toBe('Hoppel')
    expect(container.querySelector('.segmented button[aria-pressed="true"]').textContent).toBe('Anderes Tier')
    expect(container.querySelector('#dog-breed').value).toBe('Kaninchen')
    expect(container.querySelector('#dog-housemate').value).toBe('3')
    // "Bei uns" ist wegen initialValues.beiUnsSeit schon aufgeklappt
    expect(container.querySelector('#dog-bei-uns-seit').value).toBe('2024-05-01')
  })

  test('initialValues wirkt nicht beim Bearbeiten – die Werte des Tiers gewinnen immer', async () => {
    await render({
      dog: { id: 1, name: 'Aiko', geschlecht: 'ruede', tierart: 'hund' },
      initialValues: { name: 'Hoppel', tierart: 'anderes' }
    })

    expect(container.querySelector('#dog-name').value).toBe('Aiko')
    expect(container.querySelector('.segmented button[aria-pressed="true"]').textContent).toBe('Hund')
  })
})
