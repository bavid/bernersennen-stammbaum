// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import TimelineEntryForm from './TimelineEntryForm.jsx'
import { getTheme } from '../themes/index.js'

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
const nativeSelectValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set

function setInputValue(input, value) {
  nativeInputValueSetter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setSelectValue(select, value) {
  nativeSelectValueSetter.call(select, value)
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

function fillRequiredFields() {
  setInputValue(container.querySelector('#entry-title'), 'Erster Tag am See')
  setInputValue(container.querySelector('#entry-author'), 'Dana')
}

// Checkbox anhand des sichtbaren Labeltexts finden - eindeutig, auch wenn mehrere ".check"
// Checkboxen im Formular stehen (privat, isHousehold, vs. öffentlich, isShelter).
function checkboxWithLabel(text) {
  return [...container.querySelectorAll('.check')].find((label) => label.textContent === text)?.querySelector('input')
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
      `Private ${getTheme('standard').words.entries} sehen nur die Menschen in eurem Zuhause.`
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

describe('TimelineEntryForm – Tierheim (Kategorie, öffentlich)', () => {
  test('ohne isShelter gibt es weder Kategorie-Auswahl noch "öffentlich"-Checkbox', async () => {
    await render()
    expect(container.querySelector('#entry-kategorie')).toBeNull()
    expect(container.textContent).not.toContain('Im Steckbrief zeigen')
  })

  test('mit isShelter erscheinen Kategorie-Auswahl und die "öffentlich"-Checkbox statt "privat"', async () => {
    await render({ isShelter: true })
    expect(container.querySelector('#entry-kategorie')).not.toBeNull()
    expect(container.textContent).toContain('Im Steckbrief zeigen (öffentlich)')
    expect(checkboxWithLabel('Nur für uns (privat)')).toBeUndefined()
  })

  test('sendet die gewählte Kategorie und isPublic: true', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ isShelter: true, onSubmit })
    fillRequiredFields()

    setSelectValue(container.querySelector('#entry-kategorie'), 'ankunft')
    act(() => checkboxWithLabel('Im Steckbrief zeigen (öffentlich)').click())

    await act(async () => container.querySelector('form').requestSubmit())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kategorie: 'ankunft', isPublic: true }))
  })

  test('ohne Auswahl wird kategorie: null und isPublic: false gesendet', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ isShelter: true, onSubmit })
    fillRequiredFields()

    await act(async () => container.querySelector('form').requestSubmit())

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ kategorie: null, isPublic: false }))
  })

  test('beim Bearbeiten zeigt es Kategorie und öffentlich-Status des Eintrags', async () => {
    await render({
      isShelter: true,
      entry: { id: 1, titel: 'Ankunft', autor_name: 'Team', datum: '2024-01-01', kategorie: 'ankunft', is_public: 1 }
    })
    expect(container.querySelector('#entry-kategorie').value).toBe('ankunft')
    const checkbox = [...container.querySelectorAll('.check input[type="checkbox"]')].find(
      (input) => input.closest('.check').textContent === 'Im Steckbrief zeigen (öffentlich)'
    )
    expect(checkbox.checked).toBe(true)
  })
})
