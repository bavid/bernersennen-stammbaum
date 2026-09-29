// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { einblicke, createEinblick, updateEinblick, deleteEinblick } = vi.hoisted(() => ({
  einblicke: vi.fn(),
  createEinblick: vi.fn(),
  updateEinblick: vi.fn(),
  deleteEinblick: vi.fn()
}))
vi.mock('../api', () => ({ api: { partnerArea: { einblicke, createEinblick, updateEinblick, deleteEinblick } } }))

import EinblickeEditor from './EinblickeEditor.jsx'
import { DemoProvider } from '../lib/demo.js'
import { todayIso } from '../lib/dates.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let onChanged

const einblickA = { id: 1, fotoUrl: '/uploads/a.jpg', datum: '2026-08-14', text: 'Erste Runde im Agility-Parcours', ausgeblendet: false }
const einblickB = { id: 2, fotoUrl: '/uploads/b.jpg', datum: '2026-09-02', text: null, ausgeblendet: true }

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set

function setValue(element, value) {
  const setter = element instanceof HTMLTextAreaElement ? nativeTextareaValueSetter : nativeInputValueSetter
  setter.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function pickFile(file) {
  const input = container.querySelector('.einblick-form input[type="file"]')
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

const photo = () => new File(['jpeg-bytes'], 'wiese.jpg', { type: 'image/jpeg' })

async function render({ list = [einblickA, einblickB], isDemo = false } = {}) {
  einblicke.mockResolvedValue(list)
  onChanged = vi.fn()
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={isDemo}>
        <EinblickeEditor onChanged={onChanged} />
      </DemoProvider>
    )
  )
  return container
}

function submitButton() {
  return container.querySelector('.einblick-form button[type="submit"]')
}

function cards() {
  return [...container.querySelectorAll('.einblick-card')]
}

function buttonIn(element, label) {
  return [...element.querySelectorAll('button')].find((btn) => btn.textContent.trim() === label)
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:vorschau')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  if (root) {
    act(() => root.unmount())
    root = null
  }
  if (container) {
    container.remove()
    container = null
  }
  for (const mock of [einblicke, createEinblick, updateEinblick, deleteEinblick]) mock.mockReset()
  delete URL.createObjectURL
  delete URL.revokeObjectURL
})

describe('EinblickeEditor – Liste', () => {
  test('Karten mit Foto, deutschem Datum und Text, neueste zuerst; Zähler "x von 60"', async () => {
    await render()

    expect(einblicke).toHaveBeenCalledTimes(1)
    expect(container.querySelector('.einblicke-count').textContent).toBe('2 von 60')
    const [first, second] = cards()
    expect(first.querySelector('.einblick-date').textContent).toBe('2. September 2026')
    expect(first.querySelector('img').getAttribute('src')).toBe('/uploads/b.jpg')
    expect(second.querySelector('.einblick-date').textContent).toBe('14. August 2026')
    expect(second.querySelector('.einblick-text').textContent).toBe('Erste Runde im Agility-Parcours')
  })

  test('vom Betreiber ausgeblendete Einblicke tragen den Hinweis', async () => {
    await render()

    const [hidden, visible] = cards()
    expect(hidden.querySelector('.einblick-hidden-badge').textContent).toBe('ausgeblendet vom Betreiber')
    expect(visible.querySelector('.einblick-hidden-badge')).toBeNull()
  })

  test('ohne Einblicke: leerer Zustand, Zähler 0 von 60', async () => {
    await render({ list: [] })

    expect(container.querySelector('.einblicke-count').textContent).toBe('0 von 60')
    expect(container.querySelector('.empty-state')).not.toBeNull()
    expect(cards()).toHaveLength(0)
  })

  test('ein Foto außerhalb von /uploads landet in keinem src', async () => {
    await render({ list: [{ ...einblickA, fotoUrl: 'https://example.org/a.jpg' }] })
    expect(cards()[0].querySelector('img')).toBeNull()
  })
})

describe('EinblickeEditor – Neuer Einblick', () => {
  test('Datum ist heute vorbelegt und darf nicht in der Zukunft liegen; Hinweise stehen da', async () => {
    await render()

    const datum = container.querySelector('#einblick-datum')
    expect(datum.value).toBe(todayIso())
    expect(datum.getAttribute('max')).toBe(todayIso())
    expect(container.querySelector('.einblick-form input[type="file"]').getAttribute('accept')).toBe('image/jpeg,image/png')
    expect(container.textContent).toContain('Bitte keine Personen, Nachnamen oder Adressen zeigen.')
    expect(container.textContent).toContain('Die Halterinnen und Halter der gezeigten Tiere sind einverstanden.')
  })

  test('der Text zählt bis 300 mit', async () => {
    await render()

    const text = container.querySelector('#einblick-text')
    expect(text.getAttribute('maxlength')).toBe('300')
    await act(async () => setValue(text, 'Wasserpause'))
    expect(container.querySelector('#einblick-text-count').textContent).toBe('11 / 300')
  })

  test('Absenden erst mit Foto UND Einwilligung', async () => {
    await render()

    expect(submitButton().disabled).toBe(true)
    await act(async () => pickFile(photo()))
    expect(container.querySelector('.einblick-preview').getAttribute('src')).toBe('blob:vorschau')
    expect(submitButton().disabled).toBe(true)

    await act(async () => container.querySelector('.einblick-consent input').click())
    expect(submitButton().disabled).toBe(false)
  })

  test('ohne Einwilligung geht nichts raus, auch nicht per Enter', async () => {
    await render()

    await act(async () => pickFile(photo()))
    await act(async () => container.querySelector('.einblick-form').requestSubmit())

    expect(createEinblick).not.toHaveBeenCalled()
  })

  test('nur JPG oder PNG', async () => {
    await render()

    await act(async () => pickFile(new File(['x'], 'bild.webp', { type: 'image/webp' })))

    expect(container.querySelector('.einblick-form .error-banner').textContent).toBe('Bitte als JPG oder PNG hochladen.')
    expect(container.querySelector('.einblick-preview')).toBeNull()
  })

  test('legt mit FormData an (foto, datum, text, einwilligung) und setzt das Formular zurück', async () => {
    const created = { id: 3, fotoUrl: '/uploads/c.jpg', datum: '2026-09-20', text: 'Welpenstunde', ausgeblendet: false }
    createEinblick.mockResolvedValue(created)
    await render()

    const file = photo()
    await act(async () => pickFile(file))
    await act(async () => setValue(container.querySelector('#einblick-datum'), '2026-09-20'))
    await act(async () => setValue(container.querySelector('#einblick-text'), '  Welpenstunde  '))
    await act(async () => container.querySelector('.einblick-consent input').click())
    await act(async () => container.querySelector('.einblick-form').requestSubmit())

    expect(createEinblick).toHaveBeenCalledTimes(1)
    const formData = createEinblick.mock.calls[0][0]
    expect(formData).toBeInstanceOf(FormData)
    expect(formData.get('foto').name).toBe('wiese.jpg')
    expect(formData.get('datum')).toBe('2026-09-20')
    expect(formData.get('text')).toBe('Welpenstunde')
    expect(formData.get('einwilligung')).toBe('true')

    expect(cards()[0].querySelector('.einblick-text').textContent).toBe('Welpenstunde')
    expect(container.querySelector('.einblicke-count').textContent).toBe('3 von 60')
    expect(onChanged).toHaveBeenCalledTimes(1)
    expect(container.querySelector('#einblick-text').value).toBe('')
    expect(container.querySelector('.einblick-consent input').checked).toBe(false)
    expect(submitButton().disabled).toBe(true)
  })

  test('ein Fehler vom Server steht im Banner und bekommt den Fokus', async () => {
    createEinblick.mockRejectedValue(new Error('Höchstens 60 Einblicke – bitte ältere löschen.'))
    await render()

    await act(async () => pickFile(photo()))
    await act(async () => container.querySelector('.einblick-consent input').click())
    await act(async () => container.querySelector('.einblick-form').requestSubmit())

    const banner = container.querySelector('.einblick-form .error-banner')
    expect(banner.textContent).toBe('Höchstens 60 Einblicke – bitte ältere löschen.')
    expect(document.activeElement).toBe(banner)
    expect(cards()).toHaveLength(2)
  })

  test('bei 60 Einblicken ist das Formular gesperrt', async () => {
    const full = Array.from({ length: 60 }, (_, index) => ({ ...einblickA, id: index + 1 }))
    await render({ list: full })

    expect(container.querySelector('.einblicke-count').textContent).toBe('60 von 60')
    expect(container.querySelector('.einblick-form input[type="file"]').disabled).toBe(true)
    expect(submitButton().disabled).toBe(true)
    expect(container.querySelector('.einblick-form').textContent).toContain('Höchstens 60 Einblicke – bitte ältere löschen.')
  })
})

describe('EinblickeEditor – Bearbeiten und Löschen', () => {
  test('Löschen fragt erst nach, dann verschwindet die Karte', async () => {
    deleteEinblick.mockResolvedValue(null)
    await render()

    const card = cards()[1]
    await act(async () => buttonIn(card, 'Löschen').click())
    expect(deleteEinblick).not.toHaveBeenCalled()
    expect(buttonIn(card, 'Wirklich löschen?')).toBeDefined()

    await act(async () => buttonIn(card, 'Wirklich löschen?').click())

    expect(deleteEinblick).toHaveBeenCalledWith(1)
    expect(cards()).toHaveLength(1)
    expect(container.querySelector('.einblicke-count').textContent).toBe('1 von 60')
    expect(onChanged).toHaveBeenCalledTimes(1)
  })

  test('Bearbeiten ändert Datum/Text inline und schickt nur das Geänderte', async () => {
    updateEinblick.mockResolvedValue({ ...einblickA, text: 'Zweite Runde im Parcours' })
    await render()

    const card = cards()[1]
    await act(async () => buttonIn(card, 'Bearbeiten').click())
    const text = card.querySelector('#einblick-1-text')
    expect(text.value).toBe('Erste Runde im Agility-Parcours')
    expect(card.querySelector('#einblick-1-datum').value).toBe('2026-08-14')

    await act(async () => setValue(text, 'Zweite Runde im Parcours'))
    expect(card.querySelector('#einblick-1-count').textContent).toBe('24 / 300')
    await act(async () => card.querySelector('form').requestSubmit())

    expect(updateEinblick).toHaveBeenCalledWith(1, { text: 'Zweite Runde im Parcours' })
    expect(cards()[1].querySelector('.einblick-text').textContent).toBe('Zweite Runde im Parcours')
    expect(cards()[1].querySelector('form')).toBeNull()
  })

  test('ein Fehler beim Ändern bleibt in der Karte stehen', async () => {
    updateEinblick.mockRejectedValue(new Error('Das Datum darf nicht in der Zukunft liegen.'))
    await render()

    const card = cards()[1]
    await act(async () => buttonIn(card, 'Bearbeiten').click())
    await act(async () => setValue(card.querySelector('#einblick-1-datum'), '2026-08-15'))
    await act(async () => card.querySelector('form').requestSubmit())

    expect(updateEinblick).toHaveBeenCalledWith(1, { datum: '2026-08-15' })
    expect(card.querySelector('.field-error').textContent).toBe('Das Datum darf nicht in der Zukunft liegen.')
  })
})

describe('EinblickeEditor – Demo', () => {
  test('alles sichtbar, Hochladen, Bearbeiten und Löschen gesperrt', async () => {
    await render({ isDemo: true })

    expect(cards()).toHaveLength(2)
    expect(container.querySelector('.einblick-form input[type="file"]').disabled).toBe(true)
    expect(submitButton().disabled).toBe(true)
    for (const card of cards()) {
      expect(buttonIn(card, 'Bearbeiten').disabled).toBe(true)
      expect(buttonIn(card, 'Löschen').disabled).toBe(true)
    }
    expect(container.textContent).toContain('In der Demo nicht möglich.')
  })
})
