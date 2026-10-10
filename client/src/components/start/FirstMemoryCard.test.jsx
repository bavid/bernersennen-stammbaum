// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const api = vi.hoisted(() => ({ createDog: vi.fn(), createTimelineEntry: vi.fn(), upload: vi.fn() }))
vi.mock('../../api', () => ({ api }))
vi.mock('../../lib/images.js', () => ({ downscaleImage: async (file) => file }))

import FirstMemoryCard from './FirstMemoryCard.jsx'
import { DemoProvider } from '../../lib/demo.js'
import { setLang } from '../../lib/i18n/index.js'
import { isFirstMemorySkipped } from '../../lib/firstMemory.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const home = { id: 7, name: 'Zuhause Lindenhof', art: 'zuhause' }
const dog = (id, name, extra = {}) => ({ id, name, name_unbekannt: 0, tierart: 'hund', foto_url: null, ...extra })

let container
let root
let onCreated
let onSkip

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-10T12:00:00Z'))
  window.localStorage.clear()
  onCreated = vi.fn()
  onSkip = vi.fn()
  api.upload.mockResolvedValue({ url: '/uploads/benno.jpg' })
  api.createDog.mockResolvedValue(dog(31, 'Benno', { foto_url: '/uploads/benno.jpg' }))
  api.createTimelineEntry.mockResolvedValue({ id: 90, dog_id: 31, titel: 'Unsere erste Erinnerung', text: 'Benno schläft.', foto_urls: ['/uploads/benno.jpg'], datum: '2026-10-10', created_at: '2026-10-10 12:00:00' })
})

afterEach(() => {
  if (root) act(() => root.unmount())
  root = null
  container?.remove()
  for (const mock of Object.values(api)) mock.mockReset()
  vi.useRealTimers()
  setLang('de')
})

async function render({ dogs = [], demo = false } = {}) {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () =>
    root.render(
      <DemoProvider value={demo}>
        <FirstMemoryCard family={home} dogs={dogs} onCreated={onCreated} onSkip={onSkip} />
      </DemoProvider>
    )
  )
}

const $ = (selector) => container.querySelector(selector)

function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function choosePhoto() {
  const input = $('input[type="file"]')
  const file = new File(['x'], 'benno.jpg', { type: 'image/jpeg' })
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}

describe('FirstMemoryCard – „Eure erste Erinnerung“', () => {
  test('ohne Tier: legt erst das Tier (mit Foto) an, dann die erste Erinnerung, und feiert leise', async () => {
    await render()
    expect($('h2').textContent).toBe('Eure erste Erinnerung')
    await choosePhoto()
    expect($('.first-memory-photo img').getAttribute('src')).toBe('/uploads/benno.jpg')
    type($('#first-memory-name'), ' Benno ')
    type($('#first-memory-sentence'), 'Benno schläft.')
    await act(async () => $('form').requestSubmit())

    expect(api.createDog).toHaveBeenCalledWith({ name: 'Benno', fotoUrl: '/uploads/benno.jpg' })
    expect(api.createTimelineEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        dogId: 31,
        datum: '2026-10-10',
        titel: 'Unsere erste Erinnerung',
        text: 'Benno schläft.',
        fotoUrls: ['/uploads/benno.jpg'],
        autorName: 'Zuhause Lindenhof'
      })
    )
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 90 }), expect.objectContaining({ id: 31 }))
    const status = $('[role="status"]')
    expect(status.textContent).toContain('Festgehalten')
    expect(document.activeElement).toBe(status.querySelector('.first-memory-done'))
    expect($('form')).toBeNull()
  })

  test('mit einem Tier: kein neues Tier, die Erinnerung gehört zu ihm', async () => {
    await render({ dogs: [dog(10, 'Wilma')] })
    expect($('#first-memory-name')).toBeNull()
    expect($('.first-memory-animal').getAttribute('aria-pressed')).toBe('true')
    type($('#first-memory-sentence'), 'Wilma im Laub.')
    await act(async () => $('form').requestSubmit())
    expect(api.createDog).not.toHaveBeenCalled()
    expect(api.createTimelineEntry).toHaveBeenCalledWith(expect.objectContaining({ dogId: 10, text: 'Wilma im Laub.', fotoUrls: [] }))
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ id: 90 }), null)
  })

  test('mit mehreren Tieren: erst wählen; ohne Foto und Satz ein Hinweis statt einer Anfrage', async () => {
    await render({ dogs: [dog(10, 'Wilma'), dog(11, 'Flocke')] })
    const animals = [...container.querySelectorAll('.first-memory-animal')]
    expect(animals.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false'])
    await act(async () => $('form').requestSubmit())
    expect(api.createTimelineEntry).not.toHaveBeenCalled()
    expect($('[role="alert"]').textContent).toBe('Bitte wählt ein Tier.')
    act(() => animals[0].click()) // alphabetisch: Flocke (11) vor Wilma (10)
    await act(async () => $('form').requestSubmit())
    expect($('[role="alert"]').textContent).toBe('Bitte wählt ein Foto oder schreibt einen Satz.')
    type($('#first-memory-sentence'), 'Flocke rennt.')
    await act(async () => $('form').requestSubmit())
    expect(api.createTimelineEntry).toHaveBeenCalledWith(expect.objectContaining({ dogId: 11 }))
  })

  test('Fehler vom Server: Meldung, nichts gefeiert', async () => {
    api.createDog.mockRejectedValue(new Error('Name ist erforderlich'))
    await render()
    type($('#first-memory-name'), 'Benno')
    type($('#first-memory-sentence'), 'Hallo.')
    await act(async () => $('form').requestSubmit())
    expect($('[role="alert"]').textContent).toBe('Name ist erforderlich')
    expect(onCreated).not.toHaveBeenCalled()
  })

  test('„Später“ merkt sich das Zuhause', async () => {
    await render()
    act(() => $('.first-memory-skip').click())
    expect(onSkip).toHaveBeenCalled()
    expect(isFirstMemorySkipped(7)).toBe(true)
    expect(isFirstMemorySkipped(8)).toBe(false)
  })

  test('Demo: nur Vorschau – „Festhalten“ gesperrt, nichts wird geschrieben oder gemerkt', async () => {
    await render({ demo: true })
    const button = $('button[type="submit"]')
    expect(button.disabled).toBe(true)
    expect($('.first-memory-hint').textContent).toBe('In der Demo nicht möglich.')
    expect($('input[type="file"]').disabled).toBe(true)
    await act(async () => $('form').requestSubmit())
    act(() => $('.first-memory-skip').click())
    expect(api.createDog).not.toHaveBeenCalled()
    expect(api.createTimelineEntry).not.toHaveBeenCalled()
    expect(api.upload).not.toHaveBeenCalled()
    expect(isFirstMemorySkipped(7)).toBe(false)
    expect(onSkip).toHaveBeenCalled()
  })

  test('Englisch', async () => {
    setLang('en')
    await render()
    expect($('h2').textContent).toBe('Your first memory')
    expect($('button[type="submit"]').textContent).toBe('Keep it')
    expect($('.first-memory-skip').textContent).toBe('Later')
    expect(container.textContent).toContain('Choose photo')
    expect(container.textContent).not.toMatch(/Foto wählen|Später|Festhalten/)
  })
})
