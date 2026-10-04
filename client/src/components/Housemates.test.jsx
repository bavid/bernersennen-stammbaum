// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, test, vi } from 'vitest'

const { createDog } = vi.hoisted(() => ({ createDog: vi.fn() }))
vi.mock('../api', () => ({ api: { createDog } }))

import Housemates from './Housemates.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const dog = { id: 1, name: 'Nele', housemates: [] }

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <MemoryRouter>
        <dl>
          <Housemates
            dog={dog}
            allDogs={[]}
            canEdit
            onAdd={() => {}}
            onCreated={() => {}}
            onRemove={() => {}}
            {...props}
          />
        </dl>
      </MemoryRouter>
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
  createDog.mockReset()
})

function addChip() {
  return [...container.querySelectorAll('.chip-add')].find((btn) => btn.textContent.includes('Mitbewohner'))
}

describe('Housemates', () => {
  test('Klick auf "+ Mitbewohner" zeigt QuickAnimalForm mit fest gesetztem "lebt mit"', async () => {
    await render()
    act(() => addChip().click())

    expect(container.querySelector('.quick-animal-form')).not.toBeNull()
    expect(container.querySelector('.quick-animal-fixed-housemate').textContent).toBe('lebt mit Nele')
    // Nur Tierart und Name - der Rest zugeklappt unter „Mehr Angaben“
    expect(container.querySelector('.quick-animal-form .mehr-angaben-knopf').getAttribute('aria-expanded')).toBe('false')
  })

  test('legt über QuickAnimalForm ein Tier an, verlinkt es mit diesem Tier und meldet es über onCreated', async () => {
    const onCreated = vi.fn()
    createDog.mockResolvedValue({ id: 9, name: 'Hoppel' })
    await render({ onCreated })

    act(() => addChip().click())
    // Ohne ThemeProvider fällt QuickAnimalForm auf das Standard-Theme zurück – keine Tierart vorausgewählt
    const hund = [...container.querySelectorAll('.tierart-chip')].find((chip) => chip.textContent === 'Hund').querySelector('input')
    act(() => hund.click())
    setInputValue(container.querySelector('.quick-animal-form [name="name"]'), 'Hoppel')
    await act(async () => container.querySelector('.quick-animal-form').requestSubmit())

    expect(createDog).toHaveBeenCalledWith(expect.objectContaining({ name: 'Hoppel', housemateId: 1 }))
    expect(onCreated).toHaveBeenCalledWith({ id: 9, name: 'Hoppel' })
    // Formular schließt sich wieder nach dem Anlegen
    expect(container.querySelector('.quick-animal-form')).toBeNull()
  })

  test('"… oder schon in der Chronik" verlinkt ein vorhandenes Tier über onAdd, ohne ein neues anzulegen', async () => {
    const onAdd = vi.fn()
    await render({ onAdd, allDogs: [{ id: 7, name: 'Minka' }] })

    act(() => addChip().click())
    const select = container.querySelector('#housemate-existing')
    expect(select).not.toBeNull()

    select.value = '7'
    act(() => select.dispatchEvent(new Event('change', { bubbles: true })))

    expect(onAdd).toHaveBeenCalledWith(7)
    expect(createDog).not.toHaveBeenCalled()
  })

  test('ein hierher geteiltes (nicht bearbeitbares) Tier erscheint nicht in "… oder schon in der Chronik"', async () => {
    await render({
      allDogs: [
        { id: 7, name: 'Minka', can_edit: 1 },
        { id: 8, name: 'Mira (geteilt)', can_edit: 0 }
      ]
    })

    act(() => addChip().click())
    const options = [...container.querySelectorAll('#housemate-existing option')].map((o) => o.textContent)
    expect(options).toEqual(['– Tier auswählen –', 'Minka'])
  })
})
