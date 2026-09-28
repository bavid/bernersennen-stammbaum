// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import TimelineEntryForm from './TimelineEntryForm.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<TimelineEntryForm onCancel={() => {}} {...props} />))
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
  window.localStorage.clear()
})

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function fillRequiredFields() {
  setInputValue(container.querySelector('#entry-title'), 'Erster Tag am See')
  setInputValue(container.querySelector('#entry-author'), 'Dana')
}

function privatCheckbox() {
  return container.querySelector('.check input[type="checkbox"]')
}

describe('TimelineEntryForm – privat', () => {
  test('ohne isHousehold gibt es keine "privat"-Checkbox', async () => {
    await render()
    expect(privatCheckbox()).toBeNull()
  })

  test('mit isHousehold erscheint die Checkbox samt Hinweistext', async () => {
    await render({ isHousehold: true })
    expect(privatCheckbox()).not.toBeNull()
    expect(privatCheckbox().closest('.field').querySelector('.field-hint').textContent).toBe(
      'Private Einträge sehen nur die Menschen in eurem Zuhause.'
    )
  })

  test('sendet privat: false, wenn die Checkbox nicht angehakt ist', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ isHousehold: true, onSubmit })
    fillRequiredFields()

    await act(async () => container.querySelector('form').requestSubmit())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ privat: false }))
  })

  test('sendet privat: true, wenn die Checkbox angehakt ist', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ isHousehold: true, onSubmit })
    fillRequiredFields()
    act(() => privatCheckbox().click())

    await act(async () => container.querySelector('form').requestSubmit())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ privat: true }))
  })

  test('beim Bearbeiten zeigt die Checkbox den bisherigen Wert des Eintrags', async () => {
    await render({ isHousehold: true, entry: { id: 1, titel: 'Alt', autor_name: 'Dana', datum: '2024-01-01', privat: 1 } })
    expect(privatCheckbox().checked).toBe(true)
  })

  test('ohne isHousehold wird trotzdem privat: false mitgeschickt (Server-Default)', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ onSubmit })
    fillRequiredFields()

    await act(async () => container.querySelector('form').requestSubmit())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ privat: false }))
  })
})
