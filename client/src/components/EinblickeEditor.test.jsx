// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { einblicke, createEinblick, updateEinblick, deleteEinblick, pinEinblick, unpinEinblick, setEinblickeOrder } = vi.hoisted(() => ({
  einblicke: vi.fn(),
  createEinblick: vi.fn(),
  updateEinblick: vi.fn(),
  deleteEinblick: vi.fn(),
  pinEinblick: vi.fn(),
  unpinEinblick: vi.fn(),
  setEinblickeOrder: vi.fn()
}))
vi.mock('../api', () => ({
  api: { partnerArea: { einblicke, createEinblick, updateEinblick, deleteEinblick, pinEinblick, unpinEinblick, setEinblickeOrder } }
}))

import EinblickeEditor from './EinblickeEditor.jsx'
import { DemoProvider } from '../lib/demo.js'
import { ToastProvider } from './Toast.jsx'
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
        <ToastProvider>
          <EinblickeEditor onChanged={onChanged} />
        </ToastProvider>
      </DemoProvider>
    )
  )
  return container
}

function submitButton() {
  return container.querySelector('.einblick-form button[type="submit"]')
}

// Audit W: das Formular öffnet erst über "Neuer Einblick" (wie "Beitrag anlegen" bei den Beiträgen).
function openButton() {
  return [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === 'Neuer Einblick')
}

async function openForm() {
  await act(async () => openButton().click())
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
  for (const mock of [einblicke, createEinblick, updateEinblick, deleteEinblick, pinEinblick, unpinEinblick, setEinblickeOrder]) mock.mockReset()
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
    expect(hidden.querySelector('.einblick-hidden-badge').textContent).toBe('Vom Team ausgeblendet')
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
  test('das Formular öffnet erst über "Neuer Einblick" und schließt mit "Abbrechen"', async () => {
    await render()

    expect(container.querySelector('.einblick-form')).toBeNull()
    expect(openButton().disabled).toBe(false)
    await openForm()
    expect(container.querySelector('.einblick-form')).not.toBeNull()
    expect(openButton()).toBeUndefined()

    await act(async () => [...container.querySelectorAll('.einblick-form button')].find((btn) => btn.textContent === 'Abbrechen').click())
    expect(container.querySelector('.einblick-form')).toBeNull()
    expect(openButton()).toBeDefined()
  })

  test('Datum ist heute vorbelegt und darf nicht in der Zukunft liegen; Hinweise stehen da', async () => {
    await render()
    await openForm()

    const datum = container.querySelector('#einblick-datum')
    expect(datum.value).toBe(todayIso())
    expect(datum.getAttribute('max')).toBe(todayIso())
    expect(container.querySelector('.einblick-form input[type="file"]').getAttribute('accept')).toBe('image/jpeg,image/png')
    expect(container.textContent).toContain('Bitte keine Personen, Nachnamen oder Adressen zeigen.')
    expect(container.textContent).toContain('Die Halterinnen und Halter der gezeigten Tiere sind einverstanden.')
  })

  test('der Text zählt bis 300 mit', async () => {
    await render()
    await openForm()

    const text = container.querySelector('#einblick-text')
    expect(text.getAttribute('maxlength')).toBe('300')
    await act(async () => setValue(text, 'Wasserpause'))
    expect(container.querySelector('#einblick-text-count').textContent).toBe('11 / 300')
  })

  test('Absenden erst mit Foto UND Einwilligung', async () => {
    await render()
    await openForm()

    expect(submitButton().disabled).toBe(true)
    await act(async () => pickFile(photo()))
    expect(container.querySelector('.einblick-preview').getAttribute('src')).toBe('blob:vorschau')
    expect(submitButton().disabled).toBe(true)

    await act(async () => container.querySelector('.einblick-consent input').click())
    expect(submitButton().disabled).toBe(false)
  })

  test('ohne Einwilligung geht nichts raus, auch nicht per Enter', async () => {
    await render()
    await openForm()

    await act(async () => pickFile(photo()))
    await act(async () => container.querySelector('.einblick-form').requestSubmit())

    expect(createEinblick).not.toHaveBeenCalled()
  })

  test('nur JPG oder PNG', async () => {
    await render()
    await openForm()

    await act(async () => pickFile(new File(['x'], 'bild.webp', { type: 'image/webp' })))

    expect(container.querySelector('.einblick-form .error-banner').textContent).toBe('Bitte als JPG oder PNG hochladen.')
    expect(container.querySelector('.einblick-preview')).toBeNull()
  })

  test('legt mit FormData an (foto, datum, text, einwilligung) und schließt das Formular', async () => {
    const created = { id: 3, fotoUrl: '/uploads/c.jpg', datum: '2026-09-20', text: 'Welpenstunde', ausgeblendet: false }
    createEinblick.mockResolvedValue(created)
    await render()
    await openForm()

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
    expect(container.querySelector('.einblick-form')).toBeNull()
    expect(openButton().disabled).toBe(false)
  })

  test('ein Fehler vom Server steht im Banner und bekommt den Fokus', async () => {
    createEinblick.mockRejectedValue(new Error('Höchstens 60 Einblicke – bitte ältere löschen.'))
    await render()
    await openForm()

    await act(async () => pickFile(photo()))
    await act(async () => container.querySelector('.einblick-consent input').click())
    await act(async () => container.querySelector('.einblick-form').requestSubmit())

    const banner = container.querySelector('.einblick-form .error-banner')
    expect(banner.textContent).toBe('Höchstens 60 Einblicke – bitte ältere löschen.')
    expect(document.activeElement).toBe(banner)
    expect(cards()).toHaveLength(2)
  })

  test('bei 60 Einblicken lässt sich kein neuer anlegen - mit Grund', async () => {
    const full = Array.from({ length: 60 }, (_, index) => ({ ...einblickA, id: index + 1 }))
    await render({ list: full })

    expect(container.querySelector('.einblicke-count').textContent).toBe('60 von 60')
    expect(openButton().disabled).toBe(true)
    expect(container.querySelector('.einblicke-actions').textContent).toContain('Höchstens 60 Einblicke – bitte ältere löschen.')
  })

  // Audit W: der Reiter "Fotos" bleibt kurz - sechs Karten zuerst, der Rest auf Wunsch.
  test('zeigt zuerst sechs Karten, dann „Weitere Einblicke (n)“ - aufgeklappt alle', async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ ...einblickA, id: index + 1, datum: `2026-08-0${9 - index}` }))
    await render({ list: many })

    expect(cards()).toHaveLength(6)
    const more = [...container.querySelectorAll('button')].find((btn) => btn.textContent.trim() === 'Weitere Einblicke (3)')
    await act(async () => more.click())
    expect(cards()).toHaveLength(9)
    expect(container.textContent).not.toContain('Weitere Einblicke')
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

    expect(buttonIn(card, 'Wirklich löschen?').hasAttribute('aria-describedby')).toBe(false)
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
    expect(openButton().disabled).toBe(true)
    expect(openButton().getAttribute('aria-describedby')).toBe('einblicke-demo-hint')
    const hint = document.getElementById('einblicke-demo-hint')
    expect(hint.textContent).toBe('In der Demo nicht möglich.')
    for (const card of cards()) {
      for (const label of ['Bearbeiten', 'Löschen']) {
        const btn = buttonIn(card, label)
        expect(btn.disabled).toBe(true)
        // Screenreader erfahren über aria-describedby, warum der Knopf gesperrt ist.
        expect(btn.getAttribute('aria-describedby')).toBe('einblicke-demo-hint')
      }
    }
  })
})

// Phase V1: Anpinnen für die Karte in "Entdecken" - höchstens drei, Team-Pins nur ansehen.
describe('EinblickeEditor – Anpinnen', () => {
  const pinButton = (card) => card.querySelector('.einblick-pin')

  test('Anpinnen schickt den Einblick an den Server und zeigt ihn als angepinnt', async () => {
    pinEinblick.mockResolvedValue({ ...einblickA, angepinntVon: 'partner' })
    await render({ list: [einblickA] })
    const button = pinButton(cards()[0])
    expect(button.getAttribute('aria-pressed')).toBe('false')
    expect(button.textContent).toContain('Anpinnen')
    await act(async () => button.click())
    expect(pinEinblick).toHaveBeenCalledWith(1)
    expect(pinButton(cards()[0]).getAttribute('aria-pressed')).toBe('true')
    expect(container.textContent).toContain('1 von 3 angepinnt')
  })

  test('ein angepinnter wird wieder gelöst', async () => {
    unpinEinblick.mockResolvedValue({ ...einblickA, angepinntVon: null })
    await render({ list: [{ ...einblickA, angepinntVon: 'partner' }] })
    await act(async () => pinButton(cards()[0]).click())
    expect(unpinEinblick).toHaveBeenCalledWith(1)
    expect(pinButton(cards()[0]).getAttribute('aria-pressed')).toBe('false')
  })

  test('bei drei Pins sind weitere gesperrt, mit Hinweis; Team-Pins zählen mit und lassen sich nicht lösen', async () => {
    const list = [
      { ...einblickA, id: 1, angepinntVon: 'partner' },
      { ...einblickA, id: 2, datum: '2026-08-13', angepinntVon: 'admin' },
      { ...einblickA, id: 3, datum: '2026-08-12', angepinntVon: 'partner' },
      { ...einblickA, id: 4, datum: '2026-08-11', angepinntVon: null }
    ]
    await render({ list })
    const [first, team, , free] = cards()
    expect(pinButton(free).disabled).toBe(true)
    expect(container.textContent).toContain('Drei sind angepinnt – löst einen, um einen anderen anzupinnen.')
    expect(pinButton(team)).toBeNull()
    expect(team.textContent).toContain('Vom Team angepinnt')
    expect(pinButton(first).disabled).toBe(false)
    expect(container.textContent).toContain('3 von 3 angepinnt. Vom Team angepinnte stehen zuerst.')
  })

  test('ausgeblendete lassen sich nicht anpinnen; ein Fehler steht in der Karte', async () => {
    pinEinblick.mockRejectedValue(new Error('Höchstens 3 Einblicke angepinnt – löst zuerst einen anderen.'))
    await render({ list: [einblickA, { ...einblickB, datum: '2026-07-01' }] })
    const [visible, hidden] = cards()
    expect(pinButton(hidden).disabled).toBe(true)
    await act(async () => pinButton(visible).click())
    expect(visible.querySelector('[role="alert"]').textContent).toBe('Höchstens 3 Einblicke angepinnt – löst zuerst einen anderen.')
  })

  test('in der Demo gesperrt', async () => {
    await render({ list: [einblickA], isDemo: true })
    expect(pinButton(cards()[0]).disabled).toBe(true)
  })
})

// Anordnen per Griff (ReorderHandle, hooks/useDragReorder.js) - hier der Tastaturweg; das Ziehen prüft useDragReorder.test.
describe('EinblickeEditor – Reihenfolge', () => {
  const photos = () => cards().map((card) => card.querySelector('img').getAttribute('src'))
  const handles = () => cards().map((card) => card.querySelector('.reorder-handle'))

  async function press(target, key) {
    await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
  }

  test('ein einzelner Einblick hat keinen Griff', async () => {
    await render({ list: [einblickA] })
    expect(container.querySelector('.reorder-handle')).toBeNull()
    expect(container.textContent).not.toContain('Reihenfolge ändern')
  })

  test('aufnehmen, Pfeil, ablegen: alle Ids in neuer Reihenfolge zum Server, die Antwort gilt', async () => {
    setEinblickeOrder.mockResolvedValue([
      { ...einblickA, reihenfolge: 1 },
      { ...einblickB, reihenfolge: 2 }
    ])
    await render({ list: [einblickA, einblickB] })
    expect(photos()).toEqual(['/uploads/b.jpg', '/uploads/a.jpg'], 'neueste zuerst')
    expect(container.textContent).toContain('Reihenfolge ändern')
    const handle = handles()[1]
    expect(handle.getAttribute('aria-label')).toMatch(/^Einblick vom .+ verschieben – Stelle 2 von 2$/)
    await press(handle, ' ')
    expect(handle.getAttribute('aria-grabbed')).toBe('true')
    await press(handle, 'ArrowLeft')
    expect(photos()).toEqual(['/uploads/a.jpg', '/uploads/b.jpg'], 'Vorschau')
    expect(setEinblickeOrder).not.toHaveBeenCalled()
    await press(handle, ' ')
    expect(setEinblickeOrder).toHaveBeenCalledWith([1, 2])
    expect(photos()).toEqual(['/uploads/a.jpg', '/uploads/b.jpg'])
    expect(container.querySelector('[aria-live="assertive"]').textContent).toMatch(/liegt jetzt an Stelle 1 von 2/)
  })

  test('scheitert das Speichern, springt die alte Reihenfolge zurück und ein Hinweis erscheint', async () => {
    setEinblickeOrder.mockRejectedValue(new Error('kaputt'))
    await render({ list: [einblickA, einblickB] })
    const handle = handles()[1]
    await press(handle, ' ')
    await press(handle, 'ArrowLeft')
    await press(handle, 'Enter')
    expect(setEinblickeOrder).toHaveBeenCalledTimes(1)
    expect(photos()).toEqual(['/uploads/b.jpg', '/uploads/a.jpg'])
    expect(container.querySelector('.toast').textContent).toContain('Reihenfolge ließ sich nicht speichern')
  })

  test('Demo: anordnen bleibt lokal, mit Hinweis', async () => {
    await render({ list: [einblickA, einblickB], isDemo: true })
    const handle = handles()[1]
    expect(handle.disabled).toBe(false)
    await press(handle, ' ')
    await press(handle, 'ArrowLeft')
    await press(handle, ' ')
    expect(setEinblickeOrder).not.toHaveBeenCalled()
    expect(photos()).toEqual(['/uploads/a.jpg', '/uploads/b.jpg'])
    expect(container.querySelector('.toast').textContent).toContain('In der Demo nicht möglich.')
  })
})
