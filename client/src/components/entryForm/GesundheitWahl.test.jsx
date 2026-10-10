// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ upload: vi.fn(), erlebtMitTiere: vi.fn() }))
vi.mock('../../api', () => ({ api }))

import TimelineEntryForm from '../TimelineEntryForm.jsx'
import { setLang } from '../../lib/i18n/index.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

async function render(props = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => root.render(<TimelineEntryForm onCancel={() => {}} isHousehold {...props} />))
}

const toggle = () => container.querySelector('input[name="gesundheit"]')
const artRadio = (value) => container.querySelector(`input[name="gesundheitArt"][value="${value}"]`)
const naechstes = () => container.querySelector('input[name="naechstesAm"]')
const privatRadio = () => container.querySelector('input[value="privat"]')
const click = (element) => act(async () => element.click())

function setValue(element, value) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => window.localStorage.setItem('chronik.autorName', JSON.stringify('Lotte')))

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  window.localStorage.clear()
  window.sessionStorage.clear()
  setLang('de')
})

describe('Gesundheit im Formular „Erinnerung festhalten“', () => {
  test('ruhig: erst nur der Schalter, eingeschaltet Art und „Nächstes Mal am“ - und privat vorgewählt', async () => {
    await render()
    expect(toggle().checked).toBe(false)
    expect(artRadio('impfung')).toBeNull()
    expect(privatRadio().checked).toBe(false)
    await click(toggle())
    expect(artRadio('impfung').checked).toBe(true)
    expect(naechstes()).not.toBeNull()
    expect(privatRadio().checked).toBe(true)
    expect(container.textContent).toContain('Gesundheit bleibt erst einmal bei euch (privat)')
  })

  test('Festhalten schickt Art, Datum und privat an den Server', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ onSubmit })
    await act(async () => setValue(container.querySelector('textarea[name="text"]'), 'Jährliche Impfung'))
    await click(toggle())
    await click(artRadio('wurmkur_floh'))
    await act(async () => setValue(naechstes(), '2026-11-20'))
    await act(async () => container.querySelector('form').requestSubmit())
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ privat: true, gesundheit: { art: 'wurmkur_floh', naechstesAm: '2026-11-20' } })
    )
  })

  test('ohne Gesundheit kein Feld; beim Bearbeiten ausgeschaltet -> null', async () => {
    const onSubmit = vi.fn().mockResolvedValue()
    await render({ onSubmit })
    await act(async () => setValue(container.querySelector('textarea[name="text"]'), 'Am See'))
    await act(async () => container.querySelector('form').requestSubmit())
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('gesundheit')
    act(() => root.unmount())
    container.remove()

    const onUpdate = vi.fn().mockResolvedValue()
    const entry = { id: 3, text: 'Impfung', titel: 'Impfung', datum: '2026-09-01', foto_urls: [], privat: 1, gesundheit: { art: 'impfung', naechstesAm: '2027-09-01' } }
    await render({ entry, onSubmit: onUpdate })
    expect(toggle().checked).toBe(true)
    expect(naechstes().value).toBe('2027-09-01')
    await click(toggle())
    await act(async () => container.querySelector('form').requestSubmit())
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ gesundheit: null }))
  })

  test('nicht im Tierheim oder in Familien (nur im eigenen Zuhause)', async () => {
    await render({ isHousehold: false, isShelter: true })
    expect(toggle()).toBeNull()
  })

  test('Englisch: Schalter und Arten', async () => {
    setLang('en')
    await render()
    expect(container.textContent).toContain('Health (vaccination, worming, vet)')
    await click(toggle())
    expect(container.textContent).toContain('Worming & fleas')
    expect(container.textContent).toContain('Next time on')
  })
})
